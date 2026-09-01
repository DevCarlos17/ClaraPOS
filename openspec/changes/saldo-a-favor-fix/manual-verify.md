# Manual Verification: saldo-a-favor-fix

Vitest cannot execute the Postgres trigger `actualizar_saldo_cliente()` (no
pg-mem/testcontainers in this repo — see design.md Decision 6). These steps
MUST be run once against a real Supabase instance during `sdd-verify`.
Consumed by: `sdd-verify`. Not runnable by CI.

## Prerequisites

1. Apply `migrations/0088_fix_saf_trigger_sign.sql` via the Supabase SQL
   Editor, THEN `migrations/0089_repair_saldo_actual_saf.sql` (order matters
   — the repair must run against the fixed trigger, or the next SAF insert
   re-corrupts it).
2. Pick (or create) a test `cliente` with `saldo_actual = 0` and no pending
   `ventas`.
3. Have a caja session open (`sesiones_caja`) to record the payments through.

## Test 1 — Create credit (SAF creation, spec Scenario 1)

1. Tasa de cambio vigente: `Bs 500`.
2. Crear una factura de crédito por `Bs 650` (`$1.30`) para el cliente de
   prueba.
3. Pagar esa factura con `Bs 1000` en efectivo, SIN factura destino para el
   excedente de `Bs 350` (esto genera el excedente → `movimientos_cuenta`
   `tipo='SAF'`).
4. **Verificar**: `clientes.saldo_actual` para el cliente = `-$0.70`
   (`Bs 350 / 500`). Consultar directamente en Supabase:
   ```sql
   SELECT saldo_actual FROM clientes WHERE id = '<cliente_id>';
   ```
5. **Verificar**: la fila de `movimientos_cuenta` insertada tiene
   `saldo_anterior = 0`, `saldo_nuevo = -0.70` (NO fue recalculada por el
   trigger — el valor coincide exactamente con el provisto por la app).

## Test 2 — Consume credit (core regression, spec Scenario 2)

Continuar con el mismo cliente del Test 1 (`saldo_actual = -$0.70`).

1. Crear una nueva factura de crédito por `Bs 650` (`$1.30`, misma tasa
   `Bs 500`).
2. Pagar aplicando el crédito disponible (`$0.70`) más efectivo por la
   diferencia (`$0.60`), de forma que se inserte `movimientos_cuenta`
   `tipo='SAF'` con `saldo_anterior=-0.70`, `saldo_nuevo=0`.
3. **Verificar**: `clientes.saldo_actual` = `$0` — **NO** `-$1.40` (el bug
   histórico duplicaba el crédito consumido).
4. **Verificar**: el crédito disponible del cliente vuelve a `$1000` — **NO**
   `$1001.40`.
5. Si el paso 2 falla con `P0001 SAF saldo_nuevo (...) inconsistent with
   saldo_anterior (...) +/- monto (...)`, la app no está proveyendo
   `saldo_nuevo` correctamente — revisar el call site antes de sospechar del
   trigger.

## Test 3 — Adjacent bug: pay invoice while holding SAF credit

1. Dejar al cliente con `saldo_actual = -$0.70` (repetir Test 1 en un cliente
   limpio si es necesario).
2. Crear una factura de crédito NO relacionada por `$0.50`.
3. Pagar esa factura vía `aplicarPagoFacturaEnTx` (CxC → pagar factura) por
   `$0.50` en efectivo.
4. **Verificar**: `clientes.saldo_actual` resultante = `-$0.20`
   (`-0.70 - 0.50` reducido por el pago; SIN clamp a 0) — el crédito
   remanente se preserva, no se pierde.
5. **Verificar**: `ventas.saldo_pend_usd` de la factura pagada = `$0`
   (el floor-at-zero de la factura SÍ sigue aplicando — es un invariante
   distinto, ver design.md Decision 4).

## Test 4 — Cuadre de caja unaffected (spec Requirement 4)

1. Generar el cuadre de caja de la sesión usada en los Tests 1–3.
2. **Verificar**: los totales de cuadre (ingresos por método de cobro, total
   de la sesión) son consistentes con los montos en efectivo reales
   ingresados — el cuadre deriva de `monto`, nunca de `saldo_actual`/
   `saldo_nuevo`, por lo que no debe verse afectado por este fix.

## Test 5 — Repair idempotency (spec Scenario, Requirement 3)

1. Re-ejecutar `migrations/0089_repair_saldo_actual_saf.sql` una segunda vez.
2. **Verificar**: ningún `clientes.saldo_actual` cambia (0 filas afectadas
   por drift > 0.005) — confirma idempotencia.
3. Si hay clientes de otras `empresa_id` en la misma base, verificar que sus
   `saldo_actual` no fueron tocados por el repair de la empresa de prueba
   (aislamiento multi-tenant).

## Sign-off

| Test | Result | Notes |
|------|--------|-------|
| 1 — Create credit | ☐ Pass / ☐ Fail | |
| 2 — Consume credit (core regression) | ☐ Pass / ☐ Fail | |
| 3 — Adjacent bug (pay while holding credit) | ☐ Pass / ☐ Fail | |
| 4 — Cuadre de caja unaffected | ☐ Pass / ☐ Fail | |
| 5 — Repair idempotency | ☐ Pass / ☐ Fail | |
