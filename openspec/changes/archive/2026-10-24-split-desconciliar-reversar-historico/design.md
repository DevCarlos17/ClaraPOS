# Design: Separar "Desconciliar" de "Reversar" en Histórico de Tesorería

## Enfoque Técnico

Todo el trabajo es un espejo invertido de patrones ya probados: `validarMovBancario`/`validarMovCajaFuerte` (flip de 1 columna) y `validarTraspaso` (flip atómico de ambos lados). No se toca `ReversoModal` ni el orquestador `reversarAbonoDirectoDesdeTesoreria` — la única pieza nueva de lógica real es `desvalidarTraspaso`, que debe replicar exactamente la estructura de branching de `validarTraspaso` (línea 986-1032 de `use-traspasos.ts`) pero invertida.

## Decisiones de Arquitectura

| Decisión | Alternativa descartada | Justificación |
|---|---|---|
| `desvalidarTraspaso` hace SELECT+branch+2 UPDATEs en **un solo** `db.writeTransaction` | Dos llamadas separadas a `desconciliarMovBancario`/`desconciliarMovCajaFuerte` desde el handler | `validarTraspaso` ya prueba que ambos lados deben ser atómicos (evita desync si falla a mitad). Se mantiene el mismo contrato de atomicidad. |
| `desconciliarMov*` ganan `empresaId` como 2do param + `AND empresa_id = ?` en el UPDATE | Mirror estricto de `validarMovBancario` actual (que NO filtra por `empresa_id`, solo `WHERE id = ?`) | `validarMovBancario`/`CajaFuerte` tienen un gap pre-existente de aislamiento multi-tenant (regla #11 de CLAUDE.md). No se corrige ese gap ahí (fuera de scope), pero las funciones NUEVAS no deben heredarlo — hardening aditivo, cero riesgo, consistente con `validarTraspaso` que SÍ filtra por `empresa_id`. |
| `validado_por`/`validado_at` se limpian a `NULL` en el flip inverso | Preservarlos como rastro histórico | Ya decidido en spec (#5753/#5752): el estado "desconciliado" no debe mostrar un `validado_por` obsoleto; una futura reconciliación los vuelve a poblar. |
| `toMovRow` gana un 4to parámetro posicional `onDesconciliar?` | Objeto `{ onValidar, onReversar, onDesconciliar }` | Minimiza el diff: los 2 call sites existentes (pendiente, histórico) solo agregan un argumento; no hay que tocar las firmas de los callbacks existentes. |
| Dispatch TRASPASO vs BANCO/CAJA_FUERTE vive en el handler (`handleDesconciliarHistorico`), no en `HistoricoRow` | Pasar `_source`/`origen` dentro de `MovimientoTableRow` y dispatchar en la tabla | Mismo patrón que el `handleReversarHistorico` ya shippeado: usa `selectedCuenta.tipo` para saber qué result-set buscar (`historicoBancoResult`/`historicoCajaResult`) y `mov.origen === 'TRASPASO'` para resolver el traspaso vía `findTraspasoByMovId`. Cero cambios al tipo de fila aparte del nuevo callback. |

## `desvalidarTraspaso` — espejo invertido de `validarTraspaso`

`validarTraspaso` real (`use-traspasos.ts:986-1032`):
```ts
export async function validarTraspaso(traspasoId: string, userId: string, empresaId: string): Promise<void> {
  const now = localNow()
  await db.writeTransaction(async (tx) => {
    const result = await tx.execute(
      'SELECT * FROM traspasos_tesoreria WHERE id = ? AND empresa_id = ? LIMIT 1',
      [traspasoId, empresaId]
    )
    if (!result.rows?.length) throw new Error('Traspaso no encontrado')
    const t = result.rows.item(0) as { cuenta_origen_tipo, mov_origen_id, cuenta_destino_tipo, mov_destino_id, reversado }
    if (t.reversado === 1) throw new Error('Este traspaso ya fue reversado')

    if (t.mov_origen_id && t.cuenta_origen_tipo !== 'SESION_CAJA') {
      const table = t.cuenta_origen_tipo === 'BANCO' ? 'movimientos_bancarios' : 'mov_caja_fuerte'
      await tx.execute(`UPDATE ${table} SET validado = 1, validado_por = ?, validado_at = ? WHERE id = ?`, [userId, now, t.mov_origen_id])
    }
    if (t.mov_destino_id && t.cuenta_destino_tipo !== 'SESION_CAJA') {
      const table = t.cuenta_destino_tipo === 'BANCO' ? 'movimientos_bancarios' : 'mov_caja_fuerte'
      await tx.execute(`UPDATE ${table} SET validado = 1, validado_por = ?, validado_at = ? WHERE id = ?`, [userId, now, t.mov_destino_id])
    }
  })
}
```

Inversa a implementar en el mismo archivo:
```ts
export async function desvalidarTraspaso(traspasoId: string, empresaId: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const result = await tx.execute(
      'SELECT * FROM traspasos_tesoreria WHERE id = ? AND empresa_id = ? LIMIT 1',
      [traspasoId, empresaId]
    )
    if (!result.rows?.length) throw new Error('Traspaso no encontrado')
    const t = result.rows.item(0) as { cuenta_origen_tipo, mov_origen_id, cuenta_destino_tipo, mov_destino_id, reversado }
    if (t.reversado === 1) throw new Error('Este traspaso ya fue reversado')

    if (t.mov_origen_id && t.cuenta_origen_tipo !== 'SESION_CAJA') {
      const table = t.cuenta_origen_tipo === 'BANCO' ? 'movimientos_bancarios' : 'mov_caja_fuerte'
      await tx.execute(`UPDATE ${table} SET validado = 0, validado_por = NULL, validado_at = NULL WHERE id = ?`, [t.mov_origen_id])
    }
    if (t.mov_destino_id && t.cuenta_destino_tipo !== 'SESION_CAJA') {
      const table = t.cuenta_destino_tipo === 'BANCO' ? 'movimientos_bancarios' : 'mov_caja_fuerte'
      await tx.execute(`UPDATE ${table} SET validado = 0, validado_por = NULL, validado_at = NULL WHERE id = ?`, [t.mov_destino_id])
    }
  })
}
```
Diferencias deliberadas vs `validarTraspaso`: sin `userId` (no hay audit a escribir, solo a limpiar); `validado=0`; `validado_por`/`validado_at` a `NULL`; mismo guard `reversado===1`; mismo skip de `SESION_CAJA`; mismo branching `BANCO`/`CAJA_FUERTE`; misma tx única.

## `desconciliarMovBancario` / `desconciliarMovCajaFuerte` — espejo invertido de `validarMov*`

```ts
export async function desconciliarMovBancario(movimientoId: string, empresaId: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const result = await tx.execute(
      'SELECT validado, reversado FROM movimientos_bancarios WHERE id = ? AND empresa_id = ?',
      [movimientoId, empresaId]
    )
    if (!result.rows?.length) throw new Error('Movimiento no encontrado')
    const mov = result.rows.item(0) as { validado: number; reversado: number }
    if (mov.validado === 0) throw new Error('Este movimiento ya está desconciliado')
    if (mov.reversado === 1) throw new Error('No se puede desconciliar un movimiento reversado')

    await tx.execute(
      'UPDATE movimientos_bancarios SET validado = 0, validado_por = NULL, validado_at = NULL WHERE id = ? AND empresa_id = ?',
      [movimientoId, empresaId]
    )
  })
}
```
`desconciliarMovCajaFuerte` idéntica sobre `mov_caja_fuerte`. Ambas en `use-conciliacion-tesoreria.ts`, junto a `validarMovBancario`/`validarMovCajaFuerte`.

## Dispatch por origen/source

`handleDesconciliarHistorico(id: string)` en `conciliacion-tesoreria.tsx` (nuevo, junto al renombrado `handleReversarHistorico` = cuerpo intacto de `handleDesconciliarMov`):

```ts
async function handleDesconciliarHistorico(id: string) {
  if (!selectedCuenta || !user?.empresa_id) return
  const mov =
    selectedCuenta.tipo === 'BANCO'
      ? historicoBancoResult.data.find((m) => m.id === id)
      : historicoCajaResult.data.find((m) => m.id === id)
  if (!mov) return
  try {
    if (mov.origen === 'TRASPASO') {
      const traspasoId = await findTraspasoByMovId(id, user.empresa_id)
      if (!traspasoId) throw new Error('Traspaso no encontrado')
      await desvalidarTraspaso(traspasoId, user.empresa_id)
      toast.success('Traspaso desconciliado en ambas cuentas')
      return
    }
    if (selectedCuenta.tipo === 'BANCO') {
      await desconciliarMovBancario(id, user.empresa_id)
    } else {
      await desconciliarMovCajaFuerte(id, user.empresa_id)
    }
    toast.success('Movimiento desconciliado')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Error al desconciliar')
  }
}
```
Mismo patrón de resolución `BANCO`/`CAJA_FUERTE` que `handleValidarMov`/`handleReversarHistorico` ya usan.

`historicoMovRows` pasa a: `toMovRow(mov, undefined, handleReversarHistorico, handleDesconciliarHistorico)`.

## Cambios de Archivo

| Archivo | Acción | Descripción |
|---|---|---|
| `src/features/tesoreria/hooks/use-traspasos.ts` | Modificar | + `desvalidarTraspaso(traspasoId, empresaId)` |
| `src/features/tesoreria/hooks/use-conciliacion-tesoreria.ts` | Modificar | + `desconciliarMovBancario(movId, empresaId)`, `desconciliarMovCajaFuerte(movId, empresaId)` |
| `src/features/tesoreria/components/conciliacion-tesoreria.tsx` | Modificar | Renombrar `handleDesconciliarMov`→`handleReversarHistorico` (sin cambio de cuerpo); + `handleDesconciliarHistorico`; `toMovRow` gana 4to param `onDesconciliar?`; rewire `historicoMovRows` |
| `src/features/tesoreria/components/movimientos-table.tsx` | Modificar | `MovimientoTableRow` + campo `onDesconciliar?: (id: string) => void`; `HistoricoRow` renderiza 2 botones (Desconciliar / Reversar) con guards independientes |
| `use-conciliacion-tesoreria.test.ts`, `use-traspasos.test.ts`, `movimientos-table.test.tsx`, `conciliacion-tesoreria.test.tsx` | Modificar | Ver Estrategia de Test |

## Interfaces / Contratos

```ts
export async function desvalidarTraspaso(traspasoId: string, empresaId: string): Promise<void>
export async function desconciliarMovBancario(movimientoId: string, empresaId: string): Promise<void>
export async function desconciliarMovCajaFuerte(movimientoId: string, empresaId: string): Promise<void>

export interface MovimientoTableRow {
  // ...campos existentes
  onReversar?: (id: string) => void      // abre ReversoModal (reverso real)
  onDesconciliar?: (id: string) => void  // flip de estado puro (nuevo)
}
```

## Wiring del botón en `HistoricoRow`

```tsx
{isValidado && !isReversado && mov.onDesconciliar && (
  <Button onClick={() => mov.onDesconciliar!(mov.id)}>Desconciliar</Button>
)}
{isValidado && !isReversado && mov.origen === 'TRANSFERENCIA_CLIENTE' && mov.onReversar && (
  <Button onClick={() => mov.onReversar!(mov.id)}>Reversar</Button>
)}
```

## Matriz de Guards (confirmada de spec)

| Origen | validado | reversado | Desconciliar | Reversar |
|---|---|---|---|---|
| Cualquiera (incl. TRASPASO) | 1 | 0 | Sí | No (salvo abajo) |
| TRANSFERENCIA_CLIENTE | 1 | 0 | Sí | Sí |
| Cualquiera | 1 | 1 | No | No |
| Cualquiera | 0 | * | No | No |

## Multi-tenant + Atomicidad

Todo `UPDATE`/`SELECT` nuevo filtra `empresa_id` (ver decisión de hardening arriba). `desvalidarTraspaso` ejecuta su SELECT + ambos UPDATEs dentro de un único `db.writeTransaction` — si el segundo UPDATE falla, el primero se revierte (regla #9 CLAUDE.md).

## Estrategia de Test

| Capa | Qué testear | Enfoque |
|---|---|---|
| Unit (`use-conciliacion-tesoreria.test.ts`) | `desconciliarMovBancario`/`CajaFuerte`: validado 1→0, `validado_por`/`validado_at`→NULL, guard `validado===0`→throw, guard `reversado===1`→throw, filtro `empresa_id` | Mock de `db.writeTransaction`/`tx.execute`, patrón existente de `validarMov*` |
| Unit (`use-traspasos.test.ts`) | `desvalidarTraspaso`: ambos lados a 0 en 1 tx, skip `SESION_CAJA`, guard `reversado===1`, filtro `empresa_id` | Mock de `tx.execute` con fixture de traspaso BANCO↔CAJA_FUERTE |
| Component (`movimientos-table.test.tsx`) | Matriz completa de guards (2 botones); click Desconciliar→`onDesconciliar`; click Reversar→`onReversar` | **Reescribir** los 5 tests existentes que hoy asumen "Desconciliar"=modal, renombrándolos a "Reversar" |
| Component (`conciliacion-tesoreria.test.tsx`) | Click "Reversar" abre `ReversoModal` (test existente renombrado); click "Desconciliar" llama `desconciliarMovBancario`/`desvalidarTraspaso` SIN abrir modal (test nuevo) | Mock de los nuevos exports |

## Migración / Rollout

No requiere migración de datos ni feature flag. Revertir el PR vuelve al estado actual (mislabeled pero funcional) sin riesgo de datos.

## Preguntas Abiertas

Ninguna — patrón 100% derivado de código ya shippeado (`validarMovBancario`/`validarMovCajaFuerte`/`validarTraspaso`), decisiones de spec ya cerradas (nulling de audit columns, gate origen-agnóstico de Desconciliar).
