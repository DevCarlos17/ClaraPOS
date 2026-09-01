# Manual Verification: cxc-saldo-favor-modelo — Slice A (READ)

Vitest covers the pure functions in `deuda-credito-cliente.ts`, but the SQL
aggregates in `use-cxc.ts` / `use-cxc-reportes.ts` run against PowerSync's
local SQLite and are not covered by unit tests (no PowerSync test harness in
this repo). These steps MUST be run once against a running app during
`sdd-verify`. Consumed by: `sdd-verify`. Not runnable by CI.

## Prerequisites

1. Use a **fresh** test client (not `V00000001` — it has accumulated noise
   from historical bugs, see spec `cxc-deuda-lectura` testing note).
2. Tasa de cambio vigente configurada.
3. Slice B (migration 0090, `tipo='SAFC'`) is NOT yet merged — no
   `movimientos_cuenta` row with `tipo='SAFC'` can exist. This means
   `credito_disponible_usd` legitimately reads `$0` for every client during
   this verification. That is the expected interim state, not a bug.

## Test 1 — Disappearing-client bug is fixed (spec Scenario, cxc-deuda-lectura)

1. Crear el cliente de prueba con `saldo_actual = 0` y sin facturas.
2. Crear una factura de crédito por `$1.30` para el cliente (queda pendiente).
3. Pagar una segunda factura no relacionada dejando un excedente de `$0.70`
   como "saldo a favor" (esto escribe hoy `movimientos_cuenta.tipo='PAG'`,
   negativo en `saldo_actual` — comportamiento pre-Slice-B, sin cambios).
4. **Verificar**: el cliente de prueba SIGUE apareciendo en la lista de CxC
   (`CxcList`), con la factura de `$1.30` pendiente visible.
5. **Verificar**: la card KPI "Deuda Total" incluye el `$1.30` de este
   cliente (no se resta el saldo negativo del paso 3).
6. **Verificar** (regresión del bug original): ANTES de este fix, un cliente
   con `saldo_actual` cercano a 0 (deuda y SAF que casi se cancelan)
   desaparecía de la lista por el filtro `ABS(saldo_actual) > 0.001`. Repetir
   con montos que casi se cancelen (ej. deuda `$1.30`, SAF `$1.29`) y
   **verificar** que el cliente sigue visible con ambas cifras por separado.

## Test 2 — Debt and credit shown as independent, never-netted figures

1. Con el cliente del Test 1 (factura pendiente `$1.30` + SAF `$0.70` vía
   `saldo_actual` negativo, escritura pre-Slice-B).
2. Abrir el detalle del cliente (`CxcClienteDetalle`).
3. **Verificar**: se muestran "Deuda total: $1.30" y, si aplica, un renglón
   separado — nunca `$0.60` (1.30 − 0.70) en ningún lugar de la UI.
4. Abrir "Aplicar saldo a favor" (`AplicarSafModal`).
5. **Verificar**: `creditoDisponible` mostrado es `$0` (fuente:
   `credito_disponible_usd`, que aún no tiene filas `SAFC` que sumar —
   interino esperado hasta Slice B). NO debe mostrar `$0.70` leyendo
   `saldo_actual` (eso sería la fuente vieja, prohibida por spec).

## Test 3 — KPIs / Reportes CxC parity (spec Scenario, cxc-deuda-lectura)

1. Con al menos 2 clientes con facturas pendientes (montos distintos) y 1
   cliente con saldo a favor pre-Slice-B (`saldo_actual` negativo, sin deuda).
2. Abrir Reportes → CxC.
3. **Verificar**: "Deuda Total" (KPI) = suma de `saldo_pend_usd` de todas las
   facturas pendientes de todos los clientes — coincide con la suma mostrada
   en `CxcList`.
4. **Verificar**: "Top Deudores" lista a los clientes por su deuda de
   facturas (no por `saldo_actual` neteado) — el cliente con solo saldo a
   favor NO aparece en Top Deudores (deuda = 0).
5. **Verificar**: "Utilización de Crédito" usa la misma fuente de deuda.

## Test 4 — Existing write flows unaffected (spec Requirement 3)

1. Registrar un abono global, un pago de factura puntual y un vuelto/propina
   normalmente (flujos de escritura, sin tocar en este slice).
2. **Verificar**: el comportamiento es idéntico al de antes de este cambio —
   Slice A es solo lectura, no debe haber ninguna diferencia observable en
   los flujos de escritura.

## Sign-off

| Test | Result | Notes |
|------|--------|-------|
| 1 — Disappearing-client bug fixed | ☐ Pass / ☐ Fail | |
| 2 — Debt/credit shown independently | ☐ Pass / ☐ Fail | |
| 3 — KPIs / Reportes CxC parity | ☐ Pass / ☐ Fail | |
| 4 — Existing write flows unaffected | ☐ Pass / ☐ Fail | |
