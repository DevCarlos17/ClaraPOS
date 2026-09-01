# Tasks: comisiones-consolidacion-cierre (Cambio B, Pieza 1)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~380-480 (new lib ~100, new test file ~140, use-gastos.ts ~90, use-sesiones-caja.ts ~100) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (pure lib + tests) → PR 2 (hook wiring) |
| Delivery strategy | ask-always |
| Chain strategy | stacked-to-main (both stack onto `feat/gastos-qol-pos-metodos-dinamicos`; no PR to `main` per proposal) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | New pure `deducciones-cierre.ts` + Vitest unit tests, TDD | PR 1 | Self-contained, no wiring, dead code until PR 2; base = current feature branch |
| 2 | Generalize `use-gastos.ts`, migrate `use-sesiones-caja.ts` loop, verify | PR 2 | Depends on PR 1's exports; base = PR 1 branch |

## Phase 1: Pure Logic + Tests (TDD)

- [x] 1.1 [unit][RED] `src/features/caja/lib/__tests__/deducciones-cierre.test.ts`: failing tests for `resolverDeduccionesCierre` — N-deducciones native-currency calc (no USD conv), zero active deducciones, W5 EFECTIVO warn+skip, missing `cuenta_gasto_id` hard-fail, zero-pct silent skip.
- [x] 1.2 [unit][RED] Same file: failing tests for `construirNroGastoDeduccion` — format regex, same `(sesion,metodo,orden)` + different `gastoId` ⇒ different output.
- [x] 1.3 [unit][GREEN] Create `src/features/caja/lib/deducciones-cierre.ts` — `DeduccionActivaRow`/`DeduccionAPostear` interfaces + `resolverDeduccionesCierre()` per design.md contract.
- [x] 1.4 [unit][GREEN] Add `construirNroGastoDeduccion()` to same file. Run `yarn test:run` — Phase 1 green.
- [x] 1.5 [manual] `yarn type-check:test` passes for new lib + test file.

## Phase 2: Generalize Gasto Insertion (`use-gastos.ts` ~L490-645)

- [x] 2.1 [integration] Rename `insertarGastoComisionEnTx` → `insertarGastoDeduccionEnTx`; params become `{ montoDeduccionNativo, cuentaGastoId, concepto, porcentaje, orden, ... }` (drop `montoComisionNativo`/`cuentaComisionId`/`comisionPct`).
- [x] 2.2 [integration] Replace `COUNT(*)` nro_gasto block (~L544-549) with `construirNroGastoDeduccion(...)` imported from the new lib.
- [x] 2.3 [integration] Update descripcion strings to use generic `concepto`/`porcentaje` (no hardcoded "Comision bancaria").
- [x] 2.4 [integration] Wrap ONLY `cargarMapaCuentas`/`leerMonedaContable`/`generarAsientosGasto` (~L626-642) in try/catch + `console.warn`, no rethrow. Gasto/gasto_pagos/movimientos_bancarios/saldo UPDATE stay hard-fail, outside the catch.
- [x] 2.5 [manual] `yarn type-check` passes; confirm no remaining `insertarGastoComisionEnTx` references.

## Phase 3: Migrate Cierre Loop (`use-sesiones-caja.ts` ~L1014-1250)

- [x] 3.1 [integration] Drop `mc.comision_pct` from config SELECT (~L1020) and `MetodoConfigRow` (~L1034); remove now-dead `cargarMapaCuentas` call (~L1048).
- [x] 3.2 [integration] Inside `aplicarComisionSiCorresponde` (~L1138-1180): replace `comisionPct` read with `SELECT * FROM metodo_cobro_deducciones WHERE metodo_cobro_id=? AND empresa_id=? AND is_active=1 ORDER BY orden`.
- [x] 3.3 [integration] Call `resolverDeduccionesCierre({deducciones, montoBaseD, destinoTipo: destino.tipo, nombreMetodo})`; `console.warn` on `warning` (preserves W5).
- [x] 3.4 [integration] Loop `toPost` → `insertarGastoDeduccionEnTx(tx, {...item, sesionCajaId: id, usuarioId: usuario_cierre_id, bancoEmpresaId: destino.id, monedaCodigo, tasa: tasaDelDia ?? 0})`. Existing call sites (~L1210, 1228, 1248: plain/per-lote/lote-sum) stay unchanged — same function signature.
- [x] 3.5 [manual] `yarn type-check` + `yarn lint` pass.

## Phase 4: Verification vs Spec Scenarios

- [x] 4.1 [unit] Re-run `yarn test:run` — Phase 1 tests still green post-wiring.
- [x] 4.2 [integration/manual] Trace tx-coupled scenarios: inactive deducción filtered by SQL; VES-native requires `tasaDelDia` (existing guard); accounting-failure doesn't abort cierre (mock `generarAsientosGasto` throw); single-cierre guard unchanged (no new idempotency code).
- [x] 4.3 [manual] Repo-wide `yarn type-check` + `yarn lint` clean (Success Criteria).
