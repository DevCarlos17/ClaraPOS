# tesoreria-consolidacion-cierre Specification

_Change: cierre-consolidacion-tesoreria | Type: New Capability_

## Purpose

Automatic, atomic routing of a closed session's per-method totals into Tesorería as PENDING (`validado=0`) transfers, triggered inside `cerrarSesionCaja`'s transaction. Uses `sesiones_caja_detalle` totals as sole source. Includes commission-as-gasto and hard-fail validation so money is never silently misrouted.

## Requirements

### Requirement: Routing per payment method

The system MUST route each used method's `totalSistemaD` to: EFECTIVO/USD → the USD caja fuerte; EFECTIVO/VES → the Bs caja fuerte; other tipo with `banco_empresa_id` → that bank. USD/Bs sums MUST NOT mix — each method keeps its own `moneda_id`, `tasa_cambio='1'`. Rows with `metodo_cobro_id IS NULL` (SAF) or `totalSistemaD <= 0` MUST be skipped.

#### Scenario: Mixed cierre — efectivo USD + efectivo Bs + commission POS

- GIVEN a session with EFECTIVO USD, EFECTIVO VES, and a PUNTO method with `comision_pct=3`
- WHEN cerrarSesionCaja consolidates
- THEN a pending `mov_caja_fuerte` INGRESO (`origen='DEPOSITO_CIERRE'`, `validado=0`) lands per currency, and a pending `movimientos_bancarios` INGRESO (`origen='CIERRE_CONSOLIDACION'`, `validado=0`) lands in PUNTO's bank for the gross amount
- AND each has a `traspasos_tesoreria` row tagged `cuenta_origen_tipo='SESION_CAJA'`, `sesion_caja_id`

#### Scenario: SAF and zero-total methods skipped

- GIVEN the SAF virtual row and a configured method with `totalSistemaD = 0`
- WHEN consolidation runs
- THEN neither produces a transfer, movement, or traspaso row

#### Scenario: Reversed payments already excluded

- GIVEN a payment marked `is_reversed` during the session
- WHEN `totalSistemaD` is computed (existing upstream logic)
- THEN the reversed amount is already netted out; consolidation needs no separate handling

### Requirement: Commission booked as a real gasto (Option A2)

For a method with `comision_pct > 0`, the system MUST deposit the GROSS total to the bank, AND create a `gastos` row for `total * comision_pct / 100` against the account resolved via `cuentas_config` clave `COMISION_BANCARIA`, in the method's native currency, session `tasaDelDia`, USD equivalent via `bsToUsd`, exento of IVA/ISLR.

#### Scenario: Commission gasto created with correct currency

- GIVEN a PUNTO method, `comision_pct=3`, gross 1000 VES, `tasaDelDia=40`
- WHEN consolidation processes this method
- THEN a `gastos` row of 30 VES posts against `COMISION_BANCARIA`'s account, `tasa=40`, USD equivalent via `bsToUsd`, `tipo_impuesto='Exento'`

#### Scenario: Missing COMISION_BANCARIA account hard-fails

- GIVEN a commission-bearing method with activity but no `COMISION_BANCARIA` clave configured
- WHEN cerrarSesionCaja attempts to book the commission gasto
- THEN the whole cierre throws a Spanish error naming the method; session stays `ABIERTA`; no row persists

### Requirement: Hard-fail on missing destination, atomic rollback

A used method with no valid destination (non-EFECTIVO, `banco_empresa_id IS NULL`) MUST abort the ENTIRE cierre naming the method in Spanish. All writes occur inside `cerrarSesionCaja`'s `writeTransaction`; any failure rolls back everything, session stays `ABIERTA`.

#### Scenario: Method without destination aborts whole cierre

- GIVEN a non-EFECTIVO method with activity and `banco_empresa_id IS NULL`
- WHEN cerrarSesionCaja runs
- THEN it throws before commit; `status` remains `ABIERTA`; no consolidation rows exist

### Requirement: Pending records visible in Tesorería

Consolidated movements MUST land `validado=0` and appear in existing Tesorería pending/historical views, no new UI. Post-cierre, the `SESION_CAJA` leg MUST NOT be reversible (session `CERRADA`); the `BANCO`/`CAJA_FUERTE` leg MAY still be rejected via existing reversal, and a wrong commission gasto MAY be corrected via existing `anularGasto`.

#### Scenario: Consolidated movement appears as pendiente

- GIVEN a completed cierre created a bank INGRESO
- WHEN Tesorería opens the pending-movements view
- THEN it appears pendiente, filterable/reversible like any other pending bank movement

### Requirement: Migration 0077 enables SESION_CAJA transfers

`traspasos_tesoreria` CHECK constraints MUST allow `'SESION_CAJA'` (idempotent, 0073/0027 pattern). `movimientos_bancarios_origen_check` MUST allow `'CIERRE_CONSOLIDACION'`. `cuentas_config` claves MUST include `COMISION_BANCARIA`.

#### Scenario: Migration idempotent, SESION_CAJA syncs cleanly

- GIVEN migration 0077 applied (and re-run is a no-op)
- WHEN a `traspasos_tesoreria` row with `cuenta_origen_tipo='SESION_CAJA'` syncs from SQLite
- THEN Supabase accepts it — no `23514` violation, no duplicate constraints

## Out of Scope

- POS batch/lote number entry (numeración de lote).
- Histórico de lotes UI in bancos.
