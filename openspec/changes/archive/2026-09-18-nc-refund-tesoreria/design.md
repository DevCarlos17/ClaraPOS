# Design: NC "Devolver Dinero" vía Tesorería (REFUND_TESORERIA)

## Technical Approach

Se elimina el `throw` de `crearNotaCredito` (L370-372) y se agrega una nueva rama en el switch de Step B (L916+) que reutiliza el 70% ya probado por SAFC (emisión, `tasa_historica`, kardex, Step A) y **parte** `remanenteALiquidar` en dos: N egresos reales de tesorería (banco/caja fuerte) + el sobrante reusa LITERAL el bloque SAFC existente (L946-971) con un monto menor. Principio rector: **tesorería no sabe qué es una NC** — se escribe con un helper genérico `doc_origen_id`/`doc_origen_tipo`, sin que `movimientos_bancarios`/`mov_caja_fuerte` importen nada de `ventas`.

## Architecture Decisions

### (a) Forma de `egresoParams` → array desde el día 1

**Choice**: `EgresoCajaParams` (objeto único, campo `metodoCobroId`) se reemplaza por:
```ts
export interface EgresoTesoreriaLinea {
  destino: 'BANCO' | 'CAJA_FUERTE'
  cuentaId: string
  montoEnMonedaCuenta: string   // string, no number — mismo criterio que toStorageString
}
export type EgresoParams = EgresoTesoreriaLinea[]
```
`CrearNotaCreditoParams.egresoParams?: EgresoParams`. **Sin campo `moneda`**: la moneda de cada línea se resuelve server-side (`bancos_empresa.moneda_id`/`caja_fuerte.moneda_id` → `monedas.codigo_iso`), igual que `_esBancoBS` en `use-cxp.ts`/`use-cxc.ts` — evita que un valor de UI desincronizado con la cuenta real produzca una conversión incorrecta. Forward-compat: cuando se agregue "Sesión de caja" el union de `destino` gana un tercer valor sin romper el array.
**Gotcha fix**: `assertGateAntiFraudeNoDesembolso` cambia el chequeo a `Array.isArray(egresoParams) && egresoParams.length > 0` (nunca solo `egresoParams &&`, porque `[]` es truthy).
**Alternativas descartadas**: objeto único + migración futura (rompe callers dos veces); campo `moneda` explícito en cada línea (fuente de verdad duplicada, riesgo de desincronización con la cuenta).

### (b) `doc_origen_tipo` → `'NOTA_CREDITO'`

**Choice**: reusar el MISMO valor que ya usa el SAFC inline en `movimientos_cuenta` (L963). **Rationale**: `doc_origen_id=ncrId` + `doc_origen_tipo='NOTA_CREDITO'` en las tres tablas (`movimientos_cuenta`, `movimientos_bancarios`, `mov_caja_fuerte`) permite un único filtro para reconstruir "todo lo que generó esta NC", sin un valor paralelo (`'NOTA_CREDITO_REFUND'`) que fragmente el reporting.

### (c) Nuevo valor de `origen` → `'REEMBOLSO_NCR'` (ambas tablas, mismo valor)

**Choice**: `'REEMBOLSO_NCR'`, agregado a `movimientos_bancarios_origen_check` y `mov_caja_fuerte_origen_check` (nombre confirmado en `0035`/`0077`, sin nombre explícito de constraint — Postgres lo autonombra igual). Sigue el patrón `NOUN` / `NOUN_NOUN` en mayúsculas ya usado (`TRANSFERENCIA_CLIENTE`, `PAGO_PROVEEDOR`, `CIERRE_CONSOLIDACION`) y el sufijo `_NCR` ya usado en `movimientos_metodo_cobro.origen` (migración 0091). Mismo valor en ambas tablas simplifica el reporting cross-cuenta.

### (d) Reparto multi-cuenta y "pendiente por reembolsar"

**Choice**: sin prioridad entre cuentas — se escribe en el **orden del array** (orden en que el usuario agregó filas). El guard de tope se evalúa ANTES de escribir cualquier línea: `sum(montoNativoLínea → USD vía tasa_historica) <= remanenteALiquidar` (tolerancia `0.01`, mismo patrón que el resto del archivo). Si excede, la NC entera se rechaza (rollback automático de `db.writeTransaction`, sin escrituras parciales). El remanente-a-SAFC se calcula UNA vez al final: `remanenteALiquidar - sumaEgresosUsd`.

**Flujo numérico (NC 100, refund 60, SAFC 40)**: `remanenteALiquidar=100` (post Step A) → línea única `{BANCO, montoEnMonedaCuenta:'60.00'}` en cuenta USD → `montoUsd=60` → guard `60≤100` ✓ → escribe egreso banco `60.00` → `remanenteSafc = 100-60 = 40` → reusa bloque SAFC L946-971 con `40` en vez de `remanenteALiquidar`. Sin doble conteo: `remanenteALiquidar` ya es neto de Step A (L914).

### (e) Cálculo puro → `src/features/ventas/utils/notas-credito-refund.ts`

**Choice**: nuevo archivo hermano de `notas-credito-fiscal.ts`/`notas-credito-ui.ts` (mismo prefijo, mismo patrón del feature). Exporta `nativoAUsd(montoNativo, esCuentaBs, tasaHistorica): Decimal` (espejo de `_esBancoBS`), `calcularRemanenteRefund(remanenteALiquidar, lineasEnUsd[]): { sumaUsd: Decimal; remanenteSafc: Decimal; excedeTope: boolean }`. Cero DB, cero React — TDD estricto, reusable idéntico en UI (cálculo en vivo) y en el write core (revalidación server-side, defensa en profundidad como `validarTopeDobleCredito`).

### (f) Migración → `0093_nc_refund_tesoreria_origen.sql`

**Choice**: `0092` es la última existente → `0093` confirmado. Patrón idéntico a `0091`/`0077`: `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` (lista completa de valores existentes + `'REEMBOLSO_NCR'`) en ambas tablas. **PowerSync local NO tiene CHECK** (`schema.ts` L913/L959: `origen: column.text`, sin validación) — un INSERT local con `'REEMBOLSO_NCR'` SIEMPRE va a "funcionar" instantáneo aunque la migración no esté aplicada en Supabase; el fallo solo aparece en el sync en background (offline-first). **Por eso la migración debe ser la PRIMERA tarea de `sdd-tasks`**, con un test que fuerce el INSERT contra el schema esperado antes de escribir lógica de negocio (mismo riesgo ya anotado en `proposal.md`).

## Data Flow

```
crear-ncr-modal.tsx (Devolver dinero -> Tesorería)
        │  egresoParams: EgresoTesoreriaLinea[]
        ▼
crearNotaCredito()  [1 sola db.writeTransaction]
  emisión + kardex + Step A (reuse 100%)
        │ remanenteALiquidar
        ▼
  modalidad === 'REFUND_TESORERIA'
        │
        ├─ guard cap (notas-credito-refund.ts) ── excede? throw (rollback total)
        │
        ├─ por cada línea (orden array):
        │     escribirEgresoTesoreriaEnTx()
        │       SELECT saldo_actual → [guard caja fuerte] → INSERT EGRESO/REEMBOLSO_NCR → UPDATE saldo
        │
        └─ remanenteSafc > 0.01 ?  → reusa bloque SAFC (L946-971) literal
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `migrations/0093_nc_refund_tesoreria_origen.sql` | Create | `origen` CHECK += `REEMBOLSO_NCR` en `movimientos_bancarios` y `mov_caja_fuerte` |
| `src/features/ventas/utils/notas-credito-refund.ts` | Create | `nativoAUsd`, `calcularRemanenteRefund` — puras, sin DB |
| `src/features/ventas/hooks/use-notas-credito.ts` | Modify | Quita el `throw`; `EgresoCajaParams`→`EgresoTesoreriaLinea[]`; gotcha `.length>0`; helper `escribirEgresoTesoreriaEnTx` (local, tesorería-agnóstico); rama Step B `REFUND_TESORERIA` |
| `src/features/ventas/components/refund-tesoreria-form.tsx` | Create | Sub-formulario: picker de cuenta(s) vía `useCuentasTesoreria()`, monto en moneda de cuenta, pendiente en vivo, "+ Agregar cuenta" |
| `src/features/ventas/components/crear-ncr-modal.tsx` | Modify | Habilita "Devolver dinero"; sub-opción Tesorería/Sesión (Sesión disabled); monta `RefundTesoreriaForm`; wiring a `emitirNc()` |
| `use-notas-credito.test.ts`, `notas-credito-refund.test.ts` (new), `refund-tesoreria-form.test.tsx` (new), `crear-ncr-modal.test.tsx` | Modify/Create | Reemplaza el RED placeholder; cobertura nueva bajo TDD estricto |

**No se toca**: `use-cxp.ts`, `use-traspasos.ts`, `use-cuentas-tesoreria.ts`, `nota-credito-pos-modal.tsx` (REFUND sigue excluida ahí).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit puro | `nativoAUsd` (BS/USD), `calcularRemanenteRefund` (cubre 100%, parcial+SAFC, excede tope) | `notas-credito-refund.test.ts`, sin mocks |
| Engine | INSERT N líneas `validado=0` `doc_origen_id=ncrId`; guard caja fuerte bloquea; banco sin guard; gate `.length>0`; SAFC remanente encadenado; $0.00 en sesión activa (Regla de Oro) | `use-notas-credito.test.ts`, reemplaza test L699-707 |
| UI | Selector cuenta+saldo, pendiente en vivo, deshabilita submit si excede tope, "Sesión de caja" siempre disabled | `refund-tesoreria-form.test.tsx`, `crear-ncr-modal.test.tsx` |
| Migración | INSERT directo con `origen='REEMBOLSO_NCR'` en ambas tablas no viola CHECK | Test de integración Supabase (o SQL manual), primera tarea de `sdd-tasks` |

## Migration / Rollout

`0093` debe aplicarse en Supabase ANTES de mergear a `main` (mismo patrón que `0091`). Rollback: `DROP CONSTRAINT` + `ADD CONSTRAINT` sin `'REEMBOLSO_NCR'`, revertir el branch de `use-notas-credito.ts`/`crear-ncr-modal.tsx` — `REFUND_TESORERIA` vuelve al `throw`. Sin pérdida de datos (código nuevo, no toca escrituras de las otras 4 modalidades).

## Slice Seams propuestos (Review Workload Guard — probable >400 líneas)

5 seams naturales para PRs encadenados (orden de dependencia, `sdd-tasks` decide el chaining final):
1. **Migración** `0093` — standalone, cero riesgo de app.
2. **Cálculo puro** `notas-credito-refund.ts` + tests — cero DB/React.
3. **Motor** (`use-notas-credito.ts`: tipo array, gotcha, helper de egreso, rama Step B) — el slice más grande, toca 5 call-sites de test existentes.
4. **UI aislada** `refund-tesoreria-form.tsx` — testeable con `onConfirm` mockeado.
5. **Wiring** `crear-ncr-modal.tsx` — integra 3+4, tests de integración.

## Open Questions

None — los 6 forks quedan resueltos arriba.
