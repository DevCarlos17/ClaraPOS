# Manual Verification: cxc-saldo-favor-modelo — Slice A (READ) + Slice B (WRITE + APPLY + CREDIT-LIMIT)

Vitest covers the pure functions in `deuda-credito-cliente.ts`, but the SQL
aggregates in `use-cxc.ts` / `use-cxc-reportes.ts`, the migration 0090 CHECK
constraint, and the `actualizar_saldo_cliente()` trigger run against
PowerSync's local SQLite / Supabase Postgres and are not covered by unit
tests (no PowerSync/Postgres test harness in this repo). These steps MUST be
run once against a running app (with migration 0090 applied to the Supabase
project) during `sdd-verify`. Consumed by: `sdd-verify`. Not runnable by CI.

## Prerequisites

1. Use a **fresh** test client per test section below (not `V00000001` — it
   has accumulated noise from historical bugs, see spec `cxc-deuda-lectura`
   testing note). Do not reuse a client across test sections — mixed
   SAF/SAFC history from a prior test makes results ambiguous.
2. Tasa de cambio vigente configurada.
3. `migrations/0090_add_safc_tipo_movimientos_cuenta.sql` applied to the
   Supabase project (SQL Editor) BEFORE running Test 5 onward — otherwise
   any `tipo='SAFC'` INSERT fails with `23514` (CHECK constraint violation).

## Test 1 — Disappearing-client bug is fixed (spec Scenario, cxc-deuda-lectura)

1. Crear el cliente de prueba con `saldo_actual = 0` y sin facturas.
2. Crear una factura de crédito por `$1.30` para el cliente (queda pendiente).
3. En POS, vender a este cliente y dejar un excedente de `$0.70` como
   "Saldo a favor" (Paso B de `use-ventas.ts`) — esto escribe
   `movimientos_cuenta.tipo='SAFC'` (Slice B) y deja `saldo_actual` negativo.
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

1. Con el cliente del Test 1 (factura pendiente `$1.30` + SAFC `$0.70`).
2. Abrir el detalle del cliente (`CxcClienteDetalle`).
3. **Verificar**: se muestran "Deuda total: $1.30" y un renglón de saldo a
   favor `$0.70` por separado — nunca `$0.60` (1.30 − 0.70) en ningún lugar
   de la UI.
4. Abrir "Aplicar saldo a favor" (`AplicarSafModal`).
5. **Verificar**: `creditoDisponible` mostrado es `$0.70` (fuente:
   `credito_disponible_usd` = SUM(SAFC) − SUM(SAF) = 0.70 − 0 = 0.70). NO
   debe leer `saldo_actual` directamente (fuente vieja, prohibida por spec).

## Test 3 — KPIs / Reportes CxC parity (spec Scenario, cxc-deuda-lectura)

1. Con al menos 2 clientes con facturas pendientes (montos distintos) y 1
   cliente con saldo a favor (SAFC, sin deuda).
2. Abrir Reportes → CxC.
3. **Verificar**: "Deuda Total" (KPI) = suma de `saldo_pend_usd` de todas las
   facturas pendientes de todos los clientes — coincide con la suma mostrada
   en `CxcList`.
4. **Verificar**: "Top Deudores" lista a los clientes por su deuda de
   facturas (no por `saldo_actual` neteado) — el cliente con solo saldo a
   favor NO aparece en Top Deudores (deuda = 0).
5. **Verificar**: "Utilización de Crédito" usa la misma fuente de deuda.

## Test 4 — Existing write flows unaffected (spec Requirement 3)

1. Registrar un abono global sin SAF, un pago de factura puntual sin SAF y
   un vuelto/propina normalmente (flujos de escritura que no tocan
   `tipo='SAF'/'SAFC'`, fuera de alcance de este change).
2. **Verificar**: el comportamiento es idéntico al de antes de este cambio —
   no debe haber ninguna diferencia observable en estos flujos.

## Test 5 — SAFC trigger check: "dejar saldo a favor" en POS (Paso B)

Cliente de prueba FRESCO (no reutilizar el de los Tests 1–3).

1. Vender en POS con pago que deja un excedente (ej. venta $10, pago $12).
2. Elegir "Saldo a favor" como resolución del excedente ($2).
3. **Verificar** en Supabase (SQL Editor): la fila insertada en
   `movimientos_cuenta` para esta venta tiene `tipo = 'SAFC'` (NO `'PAG'`).
   La migración 0090 debe estar aplicada — si no lo está, este INSERT falla
   con error `23514` (CHECK constraint violation) y la venta completa se
   revierte (transacción atómica).
4. **Verificar**: `clientes.saldo_actual` del cliente queda en `-2.00` (sin
   cambios respecto al comportamiento anterior — solo cambia la etiqueta
   `tipo`, no la matemática del ledger).
5. **Verificar**: en CxC, `credito_disponible_usd` de este cliente = `$2.00`.

## Test 6 — SAFC trigger check: excedente en pago de factura CxC (registrarSafExcedente)

Cliente de prueba FRESCO, con una factura de crédito pendiente.

1. Ir a CxC → pagar la factura del cliente con un monto MAYOR al saldo
   pendiente (ej. factura $5.00, pago $6.50).
2. En el modal de "Pago de factura", con el excedente detectado, elegir la
   opción "Saldo a favor" (`overpayMode = 'SAF'`, dispara
   `registrarPagoFactura` con el saldo exacto + `registrarSafExcedente` con
   el excedente $1.50).
3. **Verificar** en Supabase: se insertan DOS filas en `movimientos_cuenta`
   para este cliente — una `tipo='PAG'` (o `'SAF'` si se combinó con SAF
   preexistente) por el pago de la factura, y una `tipo='SAFC'` (NO `'SAF'`)
   por el excedente `$1.50` (esta es la fila que antes de Slice B se
   escribía incorrectamente como `'SAF'`, contaminando la derivación
   SUM(SAFC)−SUM(SAF) — ver revisión de Slice A, hallazgo CRITICAL).
4. **Verificar**: la factura queda con `saldo_pend_usd = 0`.
5. **Verificar**: en CxC (`CxcClienteDetalle` → `AplicarSafModal`), el
   cliente muestra `creditoDisponible = $1.50` — el botón/sección "Aplicar
   saldo a favor" es funcional y visible (regresión del hallazgo CRITICAL de
   la revisión de Slice A: antes de este fix, este crédito habría quedado
   invisible y la función inaplicable).

## Test 7 — Credit-limit gate: el saldo a favor NUNCA agranda el límite (regresión)

Cliente de prueba FRESCO con `limite_credito_usd = 800`.

1. Generar saldo a favor de `$200` para este cliente (repetir Test 5 o 6).
2. **Verificar** en POS (`pos-terminal.tsx` badge de crédito y
   `cliente-selector.tsx`): "Crédito: $800 / $800" (disponible = límite −
   deuda = 800 − 0 = 800 — el SAF de $200 NO se suma, no debe mostrar $1000).
3. Facturar a crédito a este cliente por `$900` (por encima del límite).
4. **Verificar**: el sistema RECHAZA la venta a crédito con el mensaje "El
   monto a credito ($900.00) excede el credito disponible ($800.00)" — NO
   debe permitir la venta aunque el cliente tenga SAF $200 disponible (si el
   bug reapareciera, $800 límite + $200 SAF = $1000 pasaría incorrectamente).
5. Aplicar el saldo a favor ($200) a una factura pendiente de este cliente
   primero (vía `AplicarSafModal`, ver Test 8), y reintentar una venta a
   crédito de `$800` exactos.
6. **Verificar**: esta SÍ es aceptada (deuda bajó a `$700` tras aplicar el
   SAF a la factura previa: límite 800 − deuda actualizada ≤ 800).

## Test 8 — Aplicar saldo a favor (FIFO) con gate re-sourced

Cliente de prueba FRESCO con saldo a favor `$50` (Test 5/6) y dos facturas
pendientes: Factura A `$20`, Factura B `$40` (fecha A < fecha B).

1. Abrir `AplicarSafModal` para este cliente.
2. **Verificar**: `creditoDisponible` mostrado = `$50` (fuente SUM(SAFC) −
   SUM(SAF), no `saldo_actual`).
3. Aplicar el saldo a favor completo ($50) a ambas facturas (FIFO: $20 a A,
   $30 a B).
4. **Verificar**: se insertan DOS filas `movimientos_cuenta` con
   `tipo='SAF'` (consumo, NO `'SAFC'`) — una por cada factura.
5. **Verificar**: Factura A queda con `saldo_pend_usd = 0`; Factura B con
   `saldo_pend_usd = 10.00` (40 − 30).
6. **Verificar**: `credito_disponible_usd` del cliente ahora es `$0`
   (SUM(SAFC) $50 − SUM(SAF) $50 = 0).
7. Repetir con un monto que exceda el crédito disponible real (ej. intentar
   aplicar $50 a un cliente con solo $30 de SAFC-SAF) y **verificar** que el
   gate re-sourced lo rechaza con "El monto a aplicar excede el crédito
   disponible" usando la cifra derivada, no `saldo_actual`.

## Sign-off

| Test | Result | Notes |
|------|--------|-------|
| 1 — Disappearing-client bug fixed | ☐ Pass / ☐ Fail | |
| 2 — Debt/credit shown independently | ☐ Pass / ☐ Fail | |
| 3 — KPIs / Reportes CxC parity | ☐ Pass / ☐ Fail | |
| 4 — Existing write flows unaffected | ☐ Pass / ☐ Fail | |
| 5 — SAFC trigger check (POS Paso B) | ☐ Pass / ☐ Fail | |
| 6 — SAFC trigger check (registrarSafExcedente / CxC overpayment) | ☐ Pass / ☐ Fail | |
| 7 — Credit-limit not inflated by SAF (regression) | ☐ Pass / ☐ Fail | |
| 8 — Aplicar saldo a favor (FIFO) gate re-sourced | ☐ Pass / ☐ Fail | |
