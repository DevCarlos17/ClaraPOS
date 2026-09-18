# Tasks: NC "Devolver Dinero" vía Tesorería (REFUND_TESORERIA)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1350-1550 (impl+tests, 6 slices) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1→PR6 (below), Engine slice split in two to stay ≤~450/PR |
| Delivery strategy | ask-on-risk (orchestrator default) |
| Chain strategy | stacked-to-main (all slices land independently, no shared feature branch needed) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Est. lines | Risk | Notes |
|------|------|-----------|-----------|------|-------|
| 1 | Migration 0093 (CHECK += REEMBOLSO_NCR, both tables) | PR1 | ~25 | Low | Zero app code. Must merge to Supabase before PR4 merges. No PR deps. |
| 2 | Pure calc `notas-credito-refund.ts` | PR2 | ~280 | Low | Zero DB/React. No PR deps (parallel to PR1). |
| 3a | Engine types+gate: `EgresoTesoreriaLinea[]`, `.length>0` gotcha fix | PR3 | ~130 | Med | Depends on PR2 (imports calc types). Touches gate test call-sites. |
| 3b | Engine helper+branch: `escribirEgresoTesoreriaEnTx`, Step B `REFUND_TESORERIA` | PR4 | ~480 | High | Depends on PR1 (origen value) + PR3. Touches ~5 existing green call-sites — highest regression surface. |
| 4 | UI aislada `refund-tesoreria-form.tsx` | PR5 | ~350 | Med | Depends on PR2+PR3a (types). `onConfirm` mocked — no engine coupling. |
| 5 | Wiring `crear-ncr-modal.tsx` | PR6 | ~230 | Med | Depends on PR4+PR5 (integration). |

**Regression note**: PR4 (engine branch) is the largest single slice and the one most likely to break the ~35 already-green tests in `use-notas-credito.test.ts` — review it in isolation, not bundled with UI changes.

## Phase 1 — Migración (PR1, standalone)

- [x] 1.1 Create `migrations/0093_nc_refund_tesoreria_origen.sql`: `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT movimientos_bancarios_origen_check` with existing 8 values + `'REEMBOLSO_NCR'`; same for `mov_caja_fuerte_origen_check` with existing 5 values + `'REEMBOLSO_NCR'`. Idempotent pattern per `0077`/`0035`.
- [ ] 1.2 MANUAL (blocked — requires USER access to Supabase SQL Editor, not executable by the apply agent): `INSERT ... origen='REEMBOLSO_NCR'` into both tables fails against pre-0093 schema.
- [ ] 1.3 MANUAL (blocked — same reason as 1.2): apply 0093 in Supabase SQL Editor; re-run insert — succeeds; verify pre-existing `origen` values still pass.

**Rollback boundary**: Start = 0092 is HEAD migration. Finish = 0093 applied + verified via 1.3. Verify = manual insert in Supabase SQL editor. Rollback = re-run `DROP`+`ADD CONSTRAINT` without `'REEMBOLSO_NCR'` (no data loss, no dependent rows yet).

## Phase 2 — Cálculo puro (PR2, no deps)

- [x] 2.1 RED: create `src/features/ventas/utils/notas-credito-refund.test.ts` — cases: BS cuenta converts via `tasa_historica` (Scenario "Cuenta bancaria en Bolívares"), USD pass-through (Scenario "Cuenta en USD"), 100% refund, partial+SAFC remainder (Scenario "NC 100, refund 60, resto SAFC"), exceeds tope (Scenario "Intento de exceder... rechazado"). All fail (module doesn't exist).
- [x] 2.2 GREEN: create `src/features/ventas/utils/notas-credito-refund.ts` — export `nativoAUsd(montoNativo, esCuentaBs, tasaHistorica): Decimal` and `calcularRemanenteRefund(remanenteALiquidar, lineasEnUsd[]): { sumaUsd, remanenteSafc, excedeTope }`. Zero DB, zero React, `decimal.js` only.
- [x] 2.3 Verify: `yarn test:run notas-credito-refund.test.ts` all green (8/8).

**Rollback boundary**: Start = file doesn't exist. Finish = pure module + tests green, unused by anything else yet. Verify = 2.3. Rollback = delete the two new files, zero blast radius (nothing imports it yet).

## Phase 3 — Motor: tipos + gate (PR3, depends on PR2)

- [x] 3.1 RED: in `use-notas-credito.test.ts`, update gate tests — array-form `egresoParams` (Scenario "Array vacío no dispara el gate"); expect failures against current `EgresoCajaParams` single-object shape. ("Array no vacío requerido" scenario deferred to Phase 4 — it needs `remanenteALiquidar`, only known inside the write transaction.)
- [x] 3.2 GREEN: in `use-notas-credito.ts` replace `EgresoCajaParams` with `EgresoTesoreriaLinea` + `EgresoParams = EgresoTesoreriaLinea[]` (design §a); update `CrearNotaCreditoParams.egresoParams?: EgresoParams`.
- [x] 3.3 GREEN: fix `assertGateAntiFraudeNoDesembolso` to `Array.isArray(egresoParams) && egresoParams.length > 0` — closes the truthy-`[]` gotcha (Scenario "Array vacío no dispara el gate").
- [x] 3.4 Verify: `yarn test:run use-notas-credito.test.ts -t "gate"` green (16/16); full file 48/48 green, no other call-sites broken (branch still threw for REFUND_TESORERIA at this point, untouched).

**Rollback boundary**: Start = `EgresoCajaParams` single-object, gate uses truthy check. Finish = array type + gotcha fix, `REFUND_TESORERIA` still throws (type-only slice). Verify = 3.4. Rollback = revert type + gate function only, no data/DB impact (pure TS types + one pure function).

## Phase 4 — Motor: helper + rama Step B (PR4, depends on PR1+PR3, largest/highest risk)

- [x] 4.1 RED: add `use-notas-credito.test.ts` cases replacing the old "no implementado" placeholder test — N-line egreso insert with `validado=0`+`doc_origen_id`+`doc_origen_tipo='NOTA_CREDITO'` (Scenario "Egreso pendiente de conciliación"); guard blocks over-saldo caja fuerte (Scenario "Refund excede saldo de caja fuerte"); banco has no guard (Scenario "Banco sin guard de sobregiro"); tope rejects before any write (Scenario "Intento de exceder... rechazado"); SAFC remainder chained (Scenario "NC 100, refund 60, resto SAFC"); $0.00 impact on active POS session (Scenario "Sin impacto en sesión POS activa"); multi-source split banco+caja fuerte (Scenario "Refund dividido entre banco y caja fuerte"); Bs conversion (Scenario "Cuenta bancaria en Bolívares"); array-no-vacío-requerido. 10 cases, all fail (throw still in place).
- [x] 4.2 GREEN: remove the `throw`.
- [x] 4.3 GREEN: add local helpers `leerCuentaTesoreriaEnTx` + `escribirEgresoTesoreriaEnTx(tx, linea, ncrId, ...)` — SELECT saldo → guard (CAJA_FUERTE only, per design §Guard) → INSERT into `movimientos_bancarios`/`mov_caja_fuerte` with `origen='REEMBOLSO_NCR'`, `doc_origen_tipo='NOTA_CREDITO'`, `validado=0` → UPDATE saldo. Tesorería-agnostic (no import from `ventas`).
- [x] 4.4 GREEN: add `REFUND_TESORERIA` branch in Step B switch: validate cap via `calcularRemanenteRefund` BEFORE any write (full-rollback on exceed) → loop array order, call 4.3 helper per line → if `remanenteSafc > 0.01`, reuse SAFC block literal with `remanenteSafc` instead of `remanenteALiquidar`.
- [x] 4.5 Verify: `yarn test:run use-notas-credito.test.ts` full file green (57/57) — confirmed the pre-existing tests for other modalidades (SALDO_FAVOR/COMPENSACION_VENTA/AJUSTE_CXC/EFECTIVO_REAL) untouched/still green.

**Rollback boundary**: Start = `REFUND_TESORERIA` throws, single tx untouched. Finish = full write-path inside the SAME `db.writeTransaction`, all 4.1 scenarios green, zero regression on 4.5. Verify = 4.5 (full suite). Rollback = restore the `throw` at L370-372 + delete helper/branch — no other modalidad's code path touched (design confirms "sin pérdida de datos... branch nuevo, no toca escrituras de las otras 4 modalidades").

## Phase 5 — UI aislada (PR5, depends on PR2+PR3a)

- [x] 5.1 RED: create `refund-tesoreria-form.test.tsx` — selector shows saldo per cuenta in native currency (Scenario "Selector muestra saldo por cuenta"); live "pendiente por reembolsar" calc; submit disabled when sum exceeds tope; "+ Agregar cuenta" adds a line; `onConfirm` called with `EgresoTesoreriaLinea[]`. All fail (component doesn't exist).
- [x] 5.2 GREEN: create `src/features/ventas/components/refund-tesoreria-form.tsx` — uses `useCuentasTesoreria()`, calls `nativoAUsd`/`calcularRemanenteRefund` from PR2 for live calc, `onConfirm(lineas: EgresoTesoreriaLinea[])` prop, zero direct DB calls.
- [x] 5.3 Verify: `yarn test:run refund-tesoreria-form.test.tsx` green (5/5).

**Rollback boundary**: Start = component doesn't exist, not imported anywhere. Finish = standalone component, tests green, unmounted in app. Verify = 5.3. Rollback = delete component + test file, zero blast radius.

## Phase 6 — Wiring (PR6, depends on PR4+PR5, final integration)

- [x] 6.1 RED: update `crear-ncr-modal.test.tsx` — "Devolver dinero" enabled (Scenario "Devolver dinero habilitada revela sub-opciones"); reveals "Tesorería"(active)/"Sesión de caja activa"(disabled, "Próximamente") (Scenario "Sesión de caja activa permanece deshabilitada"); selecting "Tesorería" mounts `RefundTesoreriaForm` (mocked, Scenario "Seleccionar Tesorería revela el mini-formulario"); confirm with valid data calls `crearNotaCredito` with `modalidad: 'REFUND_TESORERIA'` + array `egresoParams` (Scenario "Emisión vía Tesorería invoca REFUND_TESORERIA"). Fail against current disabled-shell.
- [x] 6.2 GREEN: in `crear-ncr-modal.tsx` — enable "Devolver dinero" button, add sub-selector Tesorería(active)/Sesión de caja(disabled), mount `RefundTesoreriaForm` on Tesorería select, wire `onConfirm` into new `emitirNcRefund()` setting `modalidad: 'REFUND_TESORERIA'` + built `egresoParams` array. See DEVIATION note below re: "Crédito a favor" mapping.
- [x] 6.3 Verify: `yarn test:run crear-ncr-modal.test.tsx` green (19/19) + full suite (`yarn test:run`) 1496/1499 green (3 pre-existing unrelated flaky failures, confirmed present on `develop` too), no regressions in `nota-credito-pos-modal.tsx` (untouched, 66/66 green, REFUND stays excluded there per design "No se toca").

**Rollback boundary**: Start = "Devolver dinero" fully disabled shell. Finish = full flow selectable, wired to PR4's `crearNotaCredito` branch. Verify = 6.3 (targeted + full suite). Rollback = restore disabled shell at L264-271, `emitirNc()` reverts to `AJUSTE_CXC`-only mapping — PR4's engine code stays intact but unreachable from UI.

## Notes

- Spec scenario coverage: 19 of the 22 scenarios in `notas-credito-liquidacion`/`notas-credito-admin` deltas are explicitly mapped above (Phase 4 covers 7, Phase 5-6 cover the admin-spec selector/saldo scenarios). Remaining 3 are implied byproducts of the mapped ones (e.g. reconciliation totals) — covered by the same test files, not separately enumerated to respect the size budget.
- Migration (Phase 1) MUST merge to Supabase before Phase 4 merges to `main` — local dev/tests pass either order (PowerSync has no CHECK), but production sync will silently fail without it (design §f trap).

## DEVIATION (apply phase, Phase 6)

The spec (`notas-credito-admin`, Scenario "Emisión vía Crédito a favor sigue siendo AJUSTE_CXC") and this tasks.md (6.1) both state "Crédito a favor" should map to `AJUSTE_CXC`. This contradicts the ACTUAL pre-existing code/tests: `crear-ncr-modal.tsx` has always mapped `CREDITO_A_FAVOR` → `'SALDO_FAVOR'` (confirmed by the pre-existing, still-passing test `'emision con "Credito a favor" seleccionado... resulta en modalidad SALDO_FAVOR'`). The scenario's own GIVEN/WHEN/THEN text says "sin cambios respecto al comportamiento existente" — i.e. the INTENT was clearly "leave it exactly as it is today", and "AJUSTE_CXC" appears to be a spec-authoring slip (this change's design.md and the 6 resolved forks never mention changing this mapping — it is entirely orthogonal to REFUND_TESORERIA). Decision: preserved the existing `SALDO_FAVOR` mapping (zero behavior change, matches the scenario's stated intent and 100% of pre-existing regression coverage) rather than introducing an unrequested, untested financial-logic change to "Crédito a favor". Flagging for user/spec-author awareness — if `AJUSTE_CXC` was truly intended, it needs its own follow-up change with its own tests.
