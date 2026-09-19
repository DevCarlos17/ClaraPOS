# Design: NC en Cuadre — Fase 2 (egreso real de NC admin a sesión activa)

## Technical Approach

Implementa la Opción B confirmada en `explore.md` §6: `EgresoTesoreriaLinea` (usada hoy solo por
`modalidad === 'REFUND_TESORERIA'`) gana un tercer `destino: 'SESION_CAJA'`. Se reusa el 100% del
mecanismo ya construido (tope vía `calcularRemanenteRefund`, remanente a SAFC, UI de líneas de
`RefundTesoreriaForm`) — el único código nuevo es: (a) una rama de resolución de moneda sin DB
para líneas `SESION_CAJA`, (b) una función de escritura paralela a
`escribirEgresoTesoreriaEnTx` que hace el mismo INSERT que la Regla de Oro POS
(`movimientos_metodo_cobro`, `origen='NCR'`) pero con guard de sesión ABIERTA inline, y (c) 4
ediciones quirúrgicas de una línea en `use-sesiones-caja.ts` para que las 3 estrategias de cuadre
traten `'NCR'` de forma consistente. **`crear-ncr-modal.tsx` no cambia** — ya reenvía
`egresoParams` sin inspeccionar su contenido.

## Architecture Decisions

| # | Decisión | Elegido | Alternativa descartada |
|---|----------|---------|------------------------|
| 1 | `metodo_cobro_id` | Auto-resolver EFECTIVO USD/Bs vía `useMetodosPagoActivos()` según la moneda que el admin elige por línea | Selector manual de método (más superficie de error: permitiría elegir un método no-EFECTIVO) |
| 2 | `origen` | Reusar `'NCR'` (ya en el CHECK, migración 0091) | Origen nuevo (obligaría a tocar CHECK + 4 listas en vez de 4 líneas) |
| 3 | Guard sesión ABIERTA | `SELECT status` dentro de la función de escritura, antes del INSERT, en la misma tx | Guard centralizado antes del loop (innecesario: cada línea es independiente) |
| 4 | Bimonetario | `nativoAUsd(monto, moneda==='BS', venta.tasa)` — misma tasa histórica que REFUND_TESORERIA | Tasa vigente del sistema (prohibido, ya documentado como trampa en Fase 1) |
| 5 | Atomicidad | Un solo `db.writeTransaction` ya existente en `crearNotaCredito` — sin tx anidada | — |
| 6 | Sesiones seleccionables | Reusar `useSesionesActivas()` (ya wireado, filtra `empresa_id`) | Nuevo hook |

### 1. `metodo_cobro_id` — sin pago 1:1, se resuelve como un movimiento manual de caja

No hay pago de origen que lo determine (a diferencia de la Regla de Oro, `use-notas-credito.ts`
L1085-1109, que lo deriva de `pago.metodo_cobro_id`). El precedente exacto ya existe para este
mismo problema en `INGRESO_MANUAL`/`EGRESO_MANUAL`/`AVANCE`/`PRESTAMO`:
`ingreso-retiro-modal.tsx` L63-64, `avance-modal.tsx` L119-120, `prestamo-modal.tsx` L107-108 —
todos resuelven `efectivoUsd = metodos.find(m => m.tipo==='EFECTIVO' && m.moneda==='USD')` (idem
`'BS'`) desde `useMetodosPagoActivos()`. La UI de la línea `SESION_CAJA` reemplaza el select
"Cuenta" (que hoy lista bancos/cajas fuertes, `refund-tesoreria-form.tsx` L227-244) por un select
de moneda con únicamente las opciones "Efectivo USD"/"Efectivo Bs" cuyo método exista y esté
activo; el `value` de la opción ES el `metodo_cobro_id` resuelto — cero estado nuevo, cero
selector adicional. Si no hay método EFECTIVO configurado para una moneda, esa opción simplemente
no se renderiza (igual al patrón defensivo ya usado, sin bloque de errores nuevo).

### 2. Unificación de `origen` — 4 ediciones de una línea, `use-cuadre.ts` NO cambia

`useSaldoEfectivoBimonetario` (`use-cuadre.ts` L859-958) YA trata `'NCR'` correctamente: su
lista negra (L916, L934) no lo excluye, así que cualquier egreso `origen='NCR'` en la sesión
CUALQUIERA que sea ya se resta de `saldoEsperadoUsd/Bs`. **Cero cambios en este archivo.** El gap
real está solo en las 2 listas blancas de `use-sesiones-caja.ts`, que hoy excluyen `'NCR'` por
diseño (exclusión mutua con `is_reversed`, que ya no aplica cuando el pago original vive en OTRA
sesión — caso cross-session confirmado por el usuario):

| Archivo:línea | Query | Cambio |
|---|---|---|
| `use-sesiones-caja.ts` L749-750 | `movsManualUsdResult` (WHERE `origen IN (...)`) | Agregar `'NCR'` a la lista |
| `use-sesiones-caja.ts` L777-778 | `movsManualBsResult` (idem, VES) | Agregar `'NCR'` |
| `use-sesiones-caja.ts` L855-856 | `movsManualPorMetodoResult` (desglose `sesiones_caja_detalle`) | Agregar `'NCR'` |
| `use-sesiones-caja.ts` L232-233 | `useSaldoSesionCaja` → `movsData` WHERE | Agregar `'NCR'` **+** nueva extracción `movsMap.get('NCR')` y restarla en `saldoUsdD`/`saldoBsD` (L271-293) — a diferencia de las otras 3 filas, esta función usa variables nombradas por origen, no un bucket genérico "resto es egreso"; sin esta segunda mitad el WHERE no alcanza. |

Las dos ramas de `cerrarSesionCaja` (agregado L744-768, VES 771-795) y `movsManualPorMetodoResult`
ya acumulan "todo lo que no es ingreso" en un `else` genérico o en un `CASE WHEN tipo='EGRESO'` —
agregar `'NCR'` al WHERE basta, sin tocar la lógica de acumulación.

### 3. Guard sesión ABIERTA (espejo del trigger Postgres ausente en SQLite, migración 0041 L75-102)

Dentro de la nueva `escribirEgresoSesionCajaEnTx`, antes del INSERT:
`SELECT status FROM sesiones_caja WHERE id = ? AND empresa_id = ?` → throw si no existe o
`status !== 'ABIERTA'`. Mismo patrón que `leerCuentaTesoreriaEnTx` (L259-261, existencia) y
`cerrarSesionCaja` (L702, status). Falla dentro de la tx → rollback total automático
(`db.writeTransaction`).

## Interfaces / Contracts

`use-notas-credito.ts` — union discriminada (reemplaza el tipo único L121-135):

```ts
export type EgresoTesoreriaLinea =
  | { destino: 'BANCO' | 'CAJA_FUERTE'; cuentaId: string; montoEnMonedaCuenta: string; referencia?: string }
  | { destino: 'SESION_CAJA'; sesionCajaId: string; metodoCobroId: string; moneda: 'USD' | 'BS'; montoEnMonedaCuenta: string; referencia?: string }
```

Nueva función paralela a `escribirEgresoTesoreriaEnTx` (L288-335), mismo INSERT que Regla de Oro
(L1091-1109: `saldo_anterior=0, saldo_nuevo=0`, sin guard de saldo suficiente — decisión explícita
de mantener paridad con el único precedente real de escritura NCR en `movimientos_metodo_cobro`,
no con `EGRESO_MANUAL` que sí valida disponible; documentado como limitación conocida, Fase 3):

```ts
async function escribirEgresoSesionCajaEnTx(tx, linea: Extract<EgresoTesoreriaLinea, {destino:'SESION_CAJA'}>, ncrId, nroNcr, empresa_id, usuario_id, now): Promise<void>
```

Antes del loop de tope (L1256-1259), reemplazar `leerCuentaTesoreriaEnTx` por un dispatcher que
no toca DB para `SESION_CAJA`:

```ts
const esCuentaBs = linea.destino === 'SESION_CAJA'
  ? linea.moneda === 'BS'
  : (await leerCuentaTesoreriaEnTx(tx, linea, empresa_id)).esCuentaBs
```

## Data Flow

```
RefundTesoreriaForm (habilitado)
  Origen: Tesoreria | Sesion X (useSesionesActivas)
  Cuenta: [Banco/CajaFuerte]  |  [Efectivo USD / Efectivo Bs] (useMetodosPagoActivos)
        │
        ▼ onConfirm(EgresoTesoreriaLinea[])
crearNotaCredito (1 db.writeTransaction)
  ├─ tope: calcularRemanenteRefund (sin cambios)
  ├─ por línea: BANCO/CAJA_FUERTE → escribirEgresoTesoreriaEnTx (sin cambios)
  │             SESION_CAJA       → escribirEgresoSesionCajaEnTx (guard ABIERTA + INSERT origen=NCR)
  └─ remanente > tope → SAFC (sin cambios)
        │
        ▼ movimientos_metodo_cobro (sesion_caja_id = destino elegido)
  ┌─────────────┬──────────────────┬────────────────────┐
  useSaldoEfectivoBimonetario  cerrarSesionCaja    useSaldoSesionCaja
  (sin cambios, ya resta NCR)  (+'NCR' whitelist)  (+'NCR' whitelist y resta)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/features/ventas/hooks/use-notas-credito.ts` | Modify | Union `EgresoTesoreriaLinea`, `escribirEgresoSesionCajaEnTx`, dispatcher de moneda/escritura en el branch REFUND_TESORERIA |
| `src/features/ventas/components/refund-tesoreria-form.tsx` | Modify | Habilitar opción sesión, select "Cuenta"→moneda EFECTIVO para SESION_CAJA, `useMetodosPagoActivos` |
| `src/features/caja/hooks/use-sesiones-caja.ts` | Modify | 4 ediciones de una línea (whitelists `'NCR'`) + extracción/resta en `useSaldoSesionCaja` |
| `src/features/reportes/hooks/use-cuadre.ts` | None | Ya correcto (lista negra no excluye NCR) |
| `src/features/ventas/components/crear-ncr-modal.tsx` | None | Ya reenvía `egresoParams` sin cambios |
| `migrations/` | None | `'NCR'` ya está en el CHECK (0091); sin columnas nuevas |
| `src/core/db/powersync/schema.ts` | None | Sin columnas nuevas |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (motor) | `escribirEgresoSesionCajaEnTx`: INSERT con `origen='NCR'`, `sesion_caja_id` del destino elegido (no de `venta.sesion_caja_id`); guard lanza si sesión no existe o no ABIERTA; cross-session (venta de sesión A, egreso a sesión B) escribe igual | Extender `use-notas-credito.test.ts` (mock tx ya soporta fixtures multi-tabla, agregar fixture `sesionesCaja`) |
| Unit (puro) | `nativoAUsd`/`calcularRemanenteRefund` ya cubiertos; sin funciones puras nuevas (resolución de moneda es un ternario trivial) | `notas-credito-refund.test.ts` sin cambios |
| Unit (cuadre) | Las 3 estrategias reflejan un egreso `NCR` en sesión ≠ sesión del pago original | Nuevo describe en `use-sesiones-caja.test.ts` (crear si no existe) para `cerrarSesionCaja`/`useSaldoSesionCaja` |
| Regression | `useSaldoEfectivoBimonetario` sigue igual (no tocado) | Test existente, sin cambios |

## Migration / Rollout

No requiere migración SQL (CHECK ya permite `'NCR'` desde 0091; sin columnas nuevas; PowerSync
`schema.ts` sin impacto). Rollback: revertir a `disabled` la opción de UI + revertir el commit del
motor — ningún dato existente se toca.

## Slicing (presupuesto de revisión 400 líneas)

3 PRs encadenados, cada uno mergeable y con rollback independiente:

1. **Motor** (`use-notas-credito.ts` + tests) — union, guard, escritura. ~80-120 líneas.
2. **Unificación de cuadre** (`use-sesiones-caja.ts` + tests) — 4 ediciones de una línea + 1
   extracción. ~40-60 líneas. Depende de nada del motor (puede ir en paralelo o antes).
3. **UI** (`refund-tesoreria-form.tsx`) — habilitar selector, `useMetodosPagoActivos`. ~100-150
   líneas. Depende del tipo `EgresoTesoreriaLinea` del PR 1.

## Open Questions

- [ ] Guard de saldo suficiente en la sesión destino (evitar dejarla en negativo) — NO incluido en
      esta fase, paridad con Regla de Oro (que tampoco lo tiene). Confirmar si es aceptable o pasa
      a Fase 3.
