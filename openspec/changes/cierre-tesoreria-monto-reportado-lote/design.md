# Design: Consolidar monto reportado (no sistema) a Tesorería para métodos por-lote

## Technical Approach

Bug confirmado en `use-sesiones-caja.ts:1259` (rama "camino existente" del loop de
consolidación de cierre, líneas 1251-1269): para métodos `deposito_directo=0`
(por-lote, incluye EFECTIVO) **sin lotes POS cargados**, el monto enviado a
`consolidarMetodoATesoreriaEnTx` es siempre `totalSistemaD` (acumulado de
`pagos` + movimientos manuales), nunca el monto físico contado/reportado por el
cajero (`conteoFisicoPorMetodo` → `totalFisicoNativo`, calculado en L902-908 pero
usado exclusivamente para el snapshot `sesiones_caja_detalle.total_fisico`/`.diferencia`
y descartado después).

Fix: extraer una función pura `resolverMontoConsolidacionLote` (precedente:
`debeExcluirseDeConsolidacionCierre`, `resolverDeduccionesCierre`), propagar
`totalFisicoNativo` desde el primer loop (donde ya se calcula) hasta el segundo
loop de consolidación vía el `Map` existente `consolidacionPorMetodo`, y usar la
función pura en la rama sin-lotes (`else`, L1251-1269). La rama con lotes POS
(L1209-1250) NO se toca — ya usa el monto reportado por lotes (`sumaLotesD`/
`montoLoteD`), tal como confirmó el exploratorio (obs #2554).

**Scope ampliado (obs #2572):** la rama sin-lotes tiene DOS call-sites que hoy
usan `totalSistemaD` — el depósito a Tesorería (`consolidarMetodoATesoreriaEnTx`,
L1259) y la base de comisión (`aplicarComisionSiCorresponde`, L1268). El
mantenedor decidió que ambos deben usar el MISMO monto reportado: cobrar
comisión sobre dinero que nunca se depositó (ej. sistema Bs 1000, cajero
reporta 0 por falla de punto → comisión no puede calcularse sobre 1000) es
incorrecto. `resolverMontoConsolidacionLote({ totalFisicoNativo })` se calcula
UNA sola vez por método y su resultado (`montoReportadoD`) se reutiliza en
ambas llamadas — mismo patrón que la rama de lotes (L1230/L1248: `sumaLotesD`/
`montoLoteD` ya alimentan ambas). Esto deja las dos ramas del loop
estructuralmente consistentes.

## Architecture Decisions

### Decisión: dónde vive la regla "no reportado → 0, nunca sistema"

| Opción | Tradeoff | Decisión |
|---|---|---|
| Inline en el loop de 1300+ líneas | Rápido pero no testeable sin PowerSync/tx | Rechazada |
| Función pura en `src/features/caja/lib/` sin `totalSistemaD` en la firma | Sigue el patrón ya establecido (`consolidacion-cierre.ts`, `deducciones-cierre.ts`); al no recibir `totalSistemaD`, el fallback silencioso es **estructuralmente imposible** de reintroducir por accidente | **Elegida** |

### Decisión: propagación de `totalFisicoNativo` al segundo loop

| Opción | Tradeoff | Decisión |
|---|---|---|
| Nuevo `Map` paralelo (`totalFisicoPorMetodo`) | Duplica una key ya existente en `consolidacionPorMetodo`, más superficie de desincronización | Rechazada |
| Extender el `Map` existente `consolidacionPorMetodo` con un tercer campo `totalFisicoNativo: Decimal \| null` | Un solo punto de verdad, mismo ciclo de vida que `totalSistemaD`/`monedaId` ya propagados igual | **Elegida** |

### Decisión: base de cálculo de comisión (`aplicarComisionSiCorresponde`) — RESUELTA, en alcance (obs #2572)

| Opción | Tradeoff | Decisión |
|---|---|---|
| Dejar `aplicarComisionSiCorresponde(totalSistemaD)` sin tocar (alcance original) | Comisión se cobraría sobre dinero que nunca se depositó cuando el cajero reporta menos que el sistema — inconsistente con la rama de lotes | Rechazada |
| Llamar `resolverMontoConsolidacionLote({ totalFisicoNativo })` DOS veces (una para el depósito, otra para la comisión) | Misma función pura, pero dos invocaciones separadas — riesgo de que ambas divergan si en el futuro alguien cambia solo una | Rechazada |
| Calcular `montoReportadoD` UNA vez y reutilizarlo en `consolidarMetodoATesoreriaEnTx` y `aplicarComisionSiCorresponde` | Una sola fuente de verdad por método, imposible que depósito y comisión diverjan; replica el patrón que la rama de lotes ya usa (`sumaLotesD`/`montoLoteD` en L1230/L1248) | **Elegida** |

La rama con lotes ya usa el mismo monto reportado como base tanto para
`consolidarMetodoATesoreriaEnTx` como para `aplicarComisionSiCorresponde`
(L1230, L1248: ambas reciben `sumaLotesD`/`montoLoteD`). Con esta decisión, la
rama sin-lotes (L1251-1269) queda consistente: `montoReportadoD` (el resultado
del resolver) alimenta las llamadas en L1259 y L1268 por igual.

**Corrección de moneda para la comisión.** `aplicarComisionSiCorresponde`
(closure definida en L1142, param `montoBaseD: Decimal`) usa `config.moneda_codigo`
para decidir si postea en USD o VES y aplica `tasaDelDia` solo si corresponde —
igual que hoy con `totalSistemaD`, que el comentario L900-901 confirma en
moneda NATIVA del método. `totalFisicoNativo`/`montoReportadoD` proviene del
mismo `conteoFisicoPorMetodo[metodoId]` en esa misma moneda nativa (sin
conversión de tasa, ver sección de moneda más abajo). Pasar `montoReportadoD`
en vez de `totalSistemaD` no cambia la moneda esperada por la función —
**es currency-consistent**, solo cambia el monto base dentro de la misma
moneda.

## Data Flow

    Primer loop (L879-929, sesiones_caja_detalle)
      conteoFisicoPorMetodo[metodoId] ──┐
                                         ├─→ totalFisicoNativo (Decimal|null)
      totalSistemaD (pagos+manual) ─────┤
                                         ↓
                        consolidacionPorMetodo.set(metodoId,
                          { totalSistemaD, monedaId, totalFisicoNativo })
                                         │
                                         ↓
    Segundo loop (L1073+, consolidación)
      metodosParaConsolidar → destructure { totalSistemaD, monedaId, totalFisicoNativo }
                                         │
                     ┌───────────────────┴───────────────────┐
                     │ lotesDelMetodo.length > 0               │ else (sin lotes)
                     │ (NO TOCADO — ya usa sumaLotesD)          │
                     ↓                                         ↓
        sumaLotesD/montoLoteD reutilizado en:          montoReportadoD =
          consolidarMetodoATesoreriaEnTx                 resolverMontoConsolidacionLote(
          aplicarComisionSiCorresponde                     { totalFisicoNativo })
                                                                  │
                                                    reutilizado en ambas:
                                                    ┌─────────────┴──────────────┐
                                                    ↓                            ↓
                                     consolidarMetodoATesoreriaEnTx  aplicarComisionSiCorresponde
                                        (monto: montoReportadoD)      (montoReportadoD)

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `src/features/caja/lib/resolucion-monto-consolidacion.ts` | Create | Función pura `resolverMontoConsolidacionLote({ totalFisicoNativo }): Decimal`. No recibe `totalSistemaD` — imposibilita el fallback por diseño. |
| `src/features/caja/lib/__tests__/resolucion-monto-consolidacion.test.ts` | Create | Tests unitarios (TDD, RED primero) — ver Testing Strategy. |
| `src/features/caja/hooks/use-sesiones-caja.ts` | Modify | (a) Reordenar cálculo de `totalFisicoNativo` antes de `consolidacionPorMetodo.set(...)` (L895 vs L901-907 hoy); (b) extender tipo del `Map` con `totalFisicoNativo: Decimal \| null`; (c) mismo campo en el placeholder `metodoIdsSoloLotes` (L1011-1014, siempre `null`, valor no usado porque esos métodos siempre toman la rama de lotes); (d) destructurar `totalFisicoNativo` en el loop de consolidación (L1073); (e) en la rama sin-lotes (`else`, L1251-1269): calcular `const montoReportadoD = resolverMontoConsolidacionLote({ totalFisicoNativo })` UNA vez, reemplazar `monto: toStorageString(totalSistemaD)` por `monto: toStorageString(montoReportadoD)` en L1259, y reemplazar `aplicarComisionSiCorresponde(totalSistemaD)` por `aplicarComisionSiCorresponde(montoReportadoD)` en L1268; (f) importar la función nueva. |

## Interfaces / Contracts

```typescript
// src/features/caja/lib/resolucion-monto-consolidacion.ts
import Decimal from 'decimal.js'

export interface ResolverMontoConsolidacionLoteParams {
  /**
   * Monto contado/reportado por el cajero para este metodo, en moneda NATIVA
   * del metodo (misma moneda que totalSistemaD, misma que monedaId pasado a
   * consolidarMetodoATesoreriaEnTx — sin conversion de tasa). null = el
   * cajero no reporto conteo para este metodo.
   */
  totalFisicoNativo: Decimal | null
}

/**
 * Resuelve el monto a consolidar en Tesoreria para un metodo POR-LOTE
 * (deposito_directo=0) en la rama "sin lotes POS" del cierre. Funcion PURA.
 *
 * Regla (decision de negocio, obs #2567): a Tesoreria viaja SIEMPRE lo
 * reportado por el cajero, nunca totalSistemaD. Sin conteo -> 0 explicito,
 * jamas un fallback silencioso al sistema. NO recibe totalSistemaD en la
 * firma: estructuralmente imposible reintroducir el bug original.
 */
export function resolverMontoConsolidacionLote(
  params: ResolverMontoConsolidacionLoteParams
): Decimal {
  return params.totalFisicoNativo ?? new Decimal(0)
}
```

**Integración en el call-site (rama sin-lotes, L1251-1269) — cálculo único, reutilizado:**

```typescript
} else {
  // Camino existente: metodo sin lotes cargados consolida por MONTO REPORTADO
  // (no totalSistemaD) tanto en el deposito a Tesoreria como en la base de
  // comision — MISMA fuente de verdad para que ambos numeros no puedan
  // divergir (decision obs #2572; deja esta rama consistente con la rama de
  // lotes, que ya reutiliza sumaLotesD/montoLoteD para ambas llamadas).
  const montoReportadoD = resolverMontoConsolidacionLote({ totalFisicoNativo })

  await consolidarMetodoATesoreriaEnTx(tx, {
    sesionCajaId: id,
    metodoCobroId,
    destino,
    monto: toStorageString(montoReportadoD),
    monedaId,
    empresaId,
    userId: usuario_cierre_id,
    origenDestino,
    skipSaldoCheck: true,
    descripcion: `Consolidacion cierre de caja - sesion ${formatSesionId(id)}`,
  })

  await aplicarComisionSiCorresponde(montoReportadoD)
}
```

Ni la firma de `consolidarMetodoATesoreriaEnTx` ni la de `aplicarComisionSiCorresponde`
(`montoBaseD: Decimal`, L1142) cambian — solo el ARGUMENTO pasado en esta rama.

**Corrección de moneda — confirmado, no requiere conversión.** El comentario
existente en L900-901 de `use-sesiones-caja.ts` ya documenta:
`conteoFisicoPorMetodo esta en moneda nativa y totalSistemaD tambien`.
`consolidarMetodoATesoreriaEnTx` recibe `monto` + `monedaId` como un par — hoy
`monedaId` es siempre `row.moneda_id` (la moneda nativa del método), y
`totalSistemaD` viaja en esa misma moneda sin conversión. `totalFisicoNativo`
proviene del mismo `conteoFisicoPorMetodo[metodoId]` (input del cajero en la UI
de cuadre, `cuadre-page.tsx`) en la misma moneda nativa del método — por lo
tanto **no requiere ninguna conversión de tasa**; se pasa directo. Precisión:
`conteoFisicoPorMetodo` es `Record<string, number>` (no `Decimal` en el límite
de entrada de la función `cerrarSesionCaja`, L65) — la conversión a `Decimal`
ya ocurre en L905 (`new Decimal(totalFisicoNativo)`) antes de guardarse en el
Map; el resolver recibe y devuelve `Decimal`, preservando precisión NUMERIC
sin pasar por `float` en ningún punto intermedio.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | `resolverMontoConsolidacionLote` | `src/features/caja/lib/__tests__/resolucion-monto-consolidacion.test.ts`, Vitest. RED primero (`yarn test:run`), luego implementar. |
| Type-check | Firma de la función, `Decimal` en input/output | `yarn type-check:test` |
| Integration | `cerrarSesionCaja` end-to-end | Fuera de alcance (gap pre-existente, requiere mocks pesados de PowerSync `db.writeTransaction` — mismo gap documentado en obs #2539) |

Casos (mapeados 1:1 a los escenarios del spec, obs #2566):

1. `totalFisicoNativo` igual a `totalSistemaD` (ej. `new Decimal(1000)`) → retorna `1000` (caso base, reportado == sistema).
2. `totalFisicoNativo = new Decimal(0)` (reportado explícito en cero, faltante total) → retorna `0`, no `totalSistemaD`.
3. `totalFisicoNativo` mayor que `totalSistemaD` (ej. `123.45` reportado vs sistema menor) → retorna `123.45` exacto, sin pérdida decimal (`.toString()` en el test, no `.toNumber()`).
4. `totalFisicoNativo = null` (método usado, sin conteo reportado) → retorna `Decimal(0)`, nunca sustituye por sistema (edge case resuelto, obs #2567).
5. Preservación de precisión: input con más de 2 decimales (ej. `10.999`) retorna exactamente ese valor sin redondeo — la función no aplica ningún `.toFixed()`/redondeo, solo pasa el valor.

Comando: `yarn test:run src/features/caja/lib/__tests__/resolucion-monto-consolidacion.test.ts`

**Cobertura de la base de comisión (obs #2572):** no se agrega una función pura
separada para la comisión — `aplicarComisionSiCorresponde` sigue recibiendo un
`Decimal` (`montoBaseD`) sin cambio de firma; el único cambio es CUÁL `Decimal`
se le pasa en la rama sin-lotes. Como ese valor es el resultado directo de
`resolverMontoConsolidacionLote` (mismo valor, sin transformación adicional),
los 5 casos unitarios ya listados arriba cubren la corrección de la base de
comisión por transitividad — no requiere casos unitarios adicionales. Lo que
SÍ requiere cobertura nueva (fuera del resolver puro, en el nivel de
integración/manual que ya es un gap pre-existente documentado en obs #2539) es
verificar que `montoReportadoD` se calcula una sola vez y se pasa igual a
ambas llamadas — se deja como revisión de código en `sdd-verify`, no como test
automatizado nuevo (mismo gap de mocks pesados de PowerSync `db.writeTransaction`
ya señalado en la fila de Integration de la tabla).

## Migration / Rollout

No migration required. No schema change. Runtime-only behavior change, efectivo
inmediatamente en el próximo cierre de sesión de caja que use un método
`deposito_directo=0` sin lotes POS cargados.

**Riesgo histórico (ya registrado en el proposal, NO resuelto por este change):**
sesiones cerradas antes de este fix con `sesiones_caja_detalle.diferencia <> 0`
en un método por-lote tienen en Tesorería el monto sistema, no el reportado —
requiere decisión de negocio separada para reconciliación retroactiva.

## Open Questions

- [x] **RESUELTA (obs #2572).** `aplicarComisionSiCorresponde(totalSistemaD)`
      en la rama sin-lotes (L1268) usaba `totalSistemaD` como base de comisión
      mientras el monto efectivamente depositado podía ser menor (el
      reportado). El mantenedor confirmó la regla de negocio: la comisión se
      calcula sobre lo que realmente entró (reportado), no sobre lo facturado
      por sistema — no es una lectura válida "comisión sobre volumen
      procesado". Resuelto pasando `montoReportadoD` (el mismo resultado de
      `resolverMontoConsolidacionLote`) a ambas llamadas en la rama sin-lotes,
      dejándola consistente con la rama de lotes. Ver decisión "base de
      cálculo de comisión" arriba y sección Data Flow.

Ninguna pregunta abierta restante que bloquee la implementación.
