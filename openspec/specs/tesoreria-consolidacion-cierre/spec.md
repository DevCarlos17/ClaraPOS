# Spec: Tesorería — Consolidación automática al cierre de sesión

> **Domain**: tesoreria-consolidacion-cierre (cross-cutting: `features/caja` + `features/tesoreria` + `features/contabilidad`)
> **Last updated by change**: `comisiones-consolidacion-cierre` (2026-08-03) — migrated Commission requirement from single `comision_pct` to N-`metodo_cobro_deducciones` (Cambio B, Pieza 1)

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

For a method toward `destino.tipo === 'BANCO'`, the system MUST read all active `metodo_cobro_deducciones` rows (`WHERE is_active = 1 ORDER BY orden`) and, for EACH, create its OWN `gastos` row for `montoBase * porcentaje / 100` against that row's `cuenta_gasto_id` — not via `cuentas_config['COMISION_BANCARIA']`. `montoBase` MUST be the native-currency amount already being consolidated (plain `totalSistemaD`, per-lote, or lote-sum); no USD conversion of the base. `tipo` (`COMISION`/`ISLR`/`OTRO`) MUST NOT change routing. `nro_gasto` MUST use a UUID-slice pattern (`POS-COM-{sesionCajaId8}-{metodoCobroId6}-{orden}-{gastoId6}`), never `COUNT(*)`. An EFECTIVO/caja-fuerte método with an active deducción stays not commission-eligible (no bank leg to net the deducción against) — skipped with a `console.warn`, not a hard-fail (documented deviation, preserved from the original design). A deducción with an empty/null `cuenta_gasto_id` MUST hard-fail the cierre naming método and concepto, never posting an orphan gasto. The `generarAsientosGasto` → `libro_contable` posting from the original design is PRESERVED — once per deducción instead of once per método — wrapped in a best-effort try/catch: a `libro_contable` failure degrades to `console.warn` and MUST NOT abort the cierre or the primary gasto/tesorería writes.
(Previously: single `comision_pct` on `metodos_cobro`, one gasto per método via `cuentas_config['COMISION_BANCARIA']`, `nro_gasto` via `COUNT(*)`.)

#### Scenario: N active deducciones produce N gastos with own cuentas

- GIVEN a PUNTO método toward BANCO with 2 active deducciones (COMISION 3%, ISLR 2%), gross 1000 VES, `tasaDelDia=40`
- WHEN cerrarSesionCaja consolidates (plain, per-lote, or lote-sum path alike)
- THEN 2 `gastos` rows post — 30 VES and 20 VES — each against its own `cuenta_gasto_id`, own `nro_gasto`, own `libro_contable` pair, base always native-currency

#### Scenario: Inactive deducción skipped

- GIVEN a método with one deducción row `is_active=0`
- WHEN consolidation runs
- THEN no gasto posts for that row

#### Scenario: nro_gasto is UUID-slice based, collision-free

- GIVEN two devices closing sessions concurrently, and/or the same método processed across multiple lotes in one cierre, each posting deducción gastos
- WHEN both/all cierres or lote-loops run
- THEN each `nro_gasto` derives from `sesionCajaId`+`metodoCobroId`+`orden`+a fresh per-row `gastoId` slice, never a shared `COUNT(*)` — no collision even across lotes of the same método

#### Scenario: EFECTIVO método with a deducción is warned and skipped

- GIVEN an EFECTIVO método (destino CAJA_FUERTE) with an active deducción configured
- WHEN consolidation runs
- THEN a `console.warn` fires naming the método; no gasto posts

#### Scenario: VES-native método requires tasaDelDia, base stays native

- GIVEN a VES-native método with active deducciones and no `tasaDelDia`
- WHEN consolidation attempts the deducción step
- THEN it hard-fails as today; once `tasaDelDia` is present, the percentage applies to the native VES base — `tasaDelDia` only converts the gasto's USD-equivalent bookkeeping

#### Scenario: Missing cuenta_gasto_id hard-fails defensively

- GIVEN an active deducción with empty/null `cuenta_gasto_id` (defensive case; should not occur per the deducciones-configuration change that created the table)
- WHEN consolidation reaches it
- THEN the cierre throws naming método and concepto; session stays `ABIERTA`; no row persists

#### Scenario: Zero active deducciones — no regression

- GIVEN a método with zero active deducciones
- WHEN consolidation runs
- THEN zero commission gastos post; ingreso consolidation is unchanged from today

#### Scenario: Accounting posting failure does not abort the cierre

- GIVEN a deducción gasto's primary INSERT/tesorería egreso succeeds but `generarAsientosGasto` throws
- WHEN cerrarSesionCaja continues
- THEN the error is caught, a `console.warn` fires, and the cierre completes normally — the gasto and tesorería egreso persist without their `libro_contable` pair

#### Scenario: No double-posting under the existing single-cierre guarantee

- GIVEN a session already `CERRADA` (deducción gastos posted)
- WHEN any path attempts to re-run consolidation for it
- THEN the existing status guard blocks it — no new idempotency mechanism added

#### Scenario: Reversing a cierre's commissions requires N anularGasto calls

- GIVEN a cierre posted 2 deducción gastos for one método
- WHEN a user reverses that cierre's commissions
- THEN each gasto is anulled individually via existing `anularGasto` — no bulk-reversal function added

### Requirement: Hard-fail on missing destination, atomic rollback

A used method with no valid destination (non-EFECTIVO, `banco_empresa_id IS NULL`) MUST abort the ENTIRE cierre naming the method in Spanish. All writes occur inside `cerrarSesionCaja`'s `writeTransaction`; any failure rolls back everything, session stays `ABIERTA`. A destino currency mismatch (method's `moneda_id` differs from the resolved destino's own currency) MUST also hard-fail before any write for that method.

#### Scenario: Method without destination aborts whole cierre

- GIVEN a non-EFECTIVO method with activity and `banco_empresa_id IS NULL`
- WHEN cerrarSesionCaja runs
- THEN it throws before commit; `status` remains `ABIERTA`; no consolidation rows exist

#### Scenario: Destino currency mismatch aborts whole cierre

- GIVEN an EFECTIVO-VES method misconfigured to point at a USD caja fuerte
- WHEN cerrarSesionCaja runs
- THEN it throws naming the method before any write for it; session stays `ABIERTA`

### Requirement: Pending records visible in Tesorería

Consolidated movements MUST land `validado=0` and appear in existing Tesorería pending/historical views, no new UI. Post-cierre, the `SESION_CAJA` leg MUST NOT be reversible (session `CERRADA`); the `BANCO`/`CAJA_FUERTE` leg MAY still be rejected via existing reversal, and a wrong commission gasto MAY be corrected via existing `anularGasto`.

#### Scenario: Consolidated movement appears as pendiente

- GIVEN a completed cierre created a bank INGRESO
- WHEN Tesorería opens the pending-movements view
- THEN it appears pendiente, filterable/reversible like any other pending bank movement

### Requirement: Migrations enable SESION_CAJA and EGRESO/INGRESO_TESORERIA sync

`traspasos_tesoreria` CHECK constraints MUST allow `'SESION_CAJA'` (migration 0077, idempotent, 0073/0027 pattern). `movimientos_bancarios_origen_check` MUST allow `'CIERRE_CONSOLIDACION'` (migration 0077). `movimientos_metodo_cobro.origen` CHECK MUST allow `'INGRESO_TESORERIA'`/`'EGRESO_TESORERIA'` (migration 0078). `cuentas_config` claves MUST include `COMISION_BANCARIA`.

#### Scenario: Migrations idempotent, SESION_CAJA and TESORERIA origenes sync cleanly

- GIVEN migrations 0077 and 0078 applied (each re-run is a no-op) — confirmed applied in production Supabase
- WHEN a `traspasos_tesoreria` row with `cuenta_origen_tipo='SESION_CAJA'` and a `movimientos_metodo_cobro` row with `origen='EGRESO_TESORERIA'` sync from SQLite
- THEN Supabase accepts both — no `23514` CHECK violation, no duplicate constraints

### Requirement: Status flip must not precede consolidation writes

Inside `cerrarSesionCaja`'s single transaction, the `sesiones_caja.status='CERRADA'` UPDATE MUST be sequenced as the LAST write, after all consolidation and commission inserts. PowerSync uploads local writes to Supabase sequentially in original order; PostgreSQL trigger `fn_validate_sesion_abierta` (migration 0041) rejects `movimientos_metodo_cobro`/`pagos` inserts once the session row is no longer `ABIERTA`. Placing the status flip early would cause the trigger to reject the consolidation's EGRESO_TESORERIA insert once it reaches Postgres, and PowerSync's FATAL-error batch-discard behavior (`transaction.complete()` on `23514`/`P0001`) would then drop every remaining op in the batch — including rows already accepted — producing a `CERRADA` session with no consolidation rows on the server.

#### Scenario: Consolidation succeeds against a live Supabase sync

- GIVEN a session closed with mixed-method activity that consolidates to Tesorería
- WHEN the local writeTransaction uploads to Supabase in write order
- THEN every consolidation insert lands while the session is still `ABIERTA` server-side, and the final `status='CERRADA'` UPDATE is the last op — no `P0001` rejection, no dropped rows

## Out of Scope

- POS batch/lote number entry (numeración de lote) — deferred to `conciliacion-lotes-pos`.
- Histórico de lotes UI in bancos — deferred to `conciliacion-lotes-pos`.
- Fixing the pre-existing `caja_fuerte.saldo_actual` / `bancos_empresa.saldo_actual` read-then-write race on concurrent closes — documented as risk only (see caja spec DEUDA-5).
- Systemic multi-statement atomicity hardening of the PowerSync upload connector (see caja spec DEUDA-6).
- Sale-time "depósito directo con comisión" egreso posting and the cierre-loop exclusion of `deposito_directo=1` métodos from the ingreso consolidation (double-booking guard) — this capability does not exist yet; deferred to a future change (`comisiones-consolidacion-cierre` proposal names it "Cambio C").
- Removing/altering the existing `libro_contable` posting for deducción gastos — confirmed it stays (obs #976), only isolated to best-effort.
- Cross-método grouping of gastos sharing a `cuenta_gasto_id` into a single row — unconfirmed, not committed; current (and proposed) granularity is one gasto per deducción per método.
