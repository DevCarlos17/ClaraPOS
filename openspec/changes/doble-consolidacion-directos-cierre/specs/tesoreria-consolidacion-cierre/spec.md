# Delta for tesoreria-consolidacion-cierre

> Known dependency (out of scope, NOT delivered here): historical `movimientos_bancarios` rows and `bancos_empresa.saldo_actual` already duplicated by prior cierres remain uncorrected — reconciliation is a separate destructive-data change requiring business authorization. Also out of scope: sale-time commission/ISLR egreso posting for `deposito_directo=1` methods (never built).

## MODIFIED Requirements

### Requirement: Routing per payment method

The system MUST route each used method's `totalSistemaD` to: EFECTIVO/USD → the USD caja fuerte; EFECTIVO/VES → the Bs caja fuerte; other tipo with `banco_empresa_id` → that bank. USD/Bs sums MUST NOT mix — each method keeps its own `moneda_id`, `tasa_cambio='1'`. Rows with `metodo_cobro_id IS NULL` (SAF) or `totalSistemaD <= 0` MUST be skipped. A method with `metodos_cobro.deposito_directo = 1` MUST be excluded from this cierre-time routing entirely — its bank INGRESO was already posted at sale time (`use-ventas.ts`), so consolidating it again would duplicate `movimientos_bancarios` and double-count `bancos_empresa.saldo_actual`.
(Previously: routed every used bank/caja-fuerte method without checking `deposito_directo`, causing double-consolidation for direct methods — see spec L152 Out of Scope.)

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

#### Scenario: Direct method consolidated once at sale, skipped at cierre

- GIVEN a `deposito_directo=1` bank method used in a sale, INGRESO already posted at sale time
- WHEN cerrarSesionCaja consolidates
- THEN it's excluded from `metodosParaConsolidar`'s write path — no extra `movimientos_bancarios`, `bancos_empresa.saldo_actual`, or `traspasos_tesoreria` row

#### Scenario: By-batch method still consolidates at cierre

- GIVEN a `deposito_directo=0` bank method used in a session, no sale-time bank posting
- WHEN cerrarSesionCaja consolidates
- THEN it routes normally through `consolidarMetodoATesoreriaEnTx` exactly as before — one INGRESO, one saldo update, one traspaso row

#### Scenario: Mixed cierre — direct and by-batch together

- GIVEN one `deposito_directo=1` and one `deposito_directo=0` method, both with activity
- WHEN cerrarSesionCaja consolidates
- THEN only the by-batch method writes; the direct method produces none; `sesiones_caja_detalle`'s snapshot is unaffected for both

#### Scenario: Excluded direct method also skips its deducciones (accepted, pre-existing)

- GIVEN a `deposito_directo=1` method with an active `metodo_cobro_deducciones` row
- WHEN it is excluded from the loop
- THEN no commission/ISLR gasto posts — accepted pre-existing behavior, not a regression

#### Scenario: Manual POS→Tesorería traspaso is unaffected

- GIVEN a user creates a manual traspaso via `crearTraspasoSesionATesoreria`
- WHEN it calls the shared `consolidarMetodoATesoreriaEnTx`
- THEN behavior is unchanged — the exclusion applies only inside `cerrarSesionCaja`'s automatic loop, never inside the shared function

## ADDED Requirements

### Requirement: Exclusion check is a pure, unit-testable predicate

The exclusion MUST be a pure function (e.g. `debeExcluirseDeConsolidacionCierre(config: { deposito_directo: number }): boolean`), no I/O or transaction dependency, called from the loop with `continue` on `true`, following the `resolverDeduccionesCierre` (`deducciones-cierre.ts`) precedent.

#### Scenario: Predicate discriminates by deposito_directo

- GIVEN `config.deposito_directo = 1` and, separately, `= 0`
- WHEN `debeExcluirseDeConsolidacionCierre(config)` is called for each
- THEN it returns `true` for `1` and `false` for `0`

#### Scenario: Predicate is unit-testable without mocking PowerSync

- GIVEN the predicate has no `tx`, `db`, or async dependency
- WHEN a Vitest test invokes it with plain object fixtures
- THEN it runs with no PowerSync/Supabase mock, matching `deducciones-cierre.test.ts`
