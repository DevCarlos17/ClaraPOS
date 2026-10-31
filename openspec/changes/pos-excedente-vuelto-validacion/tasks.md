# Tasks: Validación de excedente y distribución de vuelto en Cobro POS

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~230-280 (cobro-modal.tsx ~45, use-ventas.ts ~70 incl. 2 extracted helpers, cobro-modal.test.tsx ~90 for 8 cases, use-ventas.test.ts ~60 for 4 cases) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full change (gating + wiring + tests) | PR 1 | 4 files modified, 0 new. Single reviewable PR; no schema/migration. |

## Phase 1: use-ventas.ts — extract shared helpers (Foundation)

- [x] 1.1 In `use-ventas.ts`, add `vueltoDeltaBs?: number` to `DiscrepancyOptions` (after `vueltoEntries`), with the doc comment from design.md Interfaces section.
- [x] 1.2 Extract body of `case 'DIFERENCIAL_SOBRANTE'` into module-level `async function insertDiferencialSobranteMovimiento(params)`. Kept exact INSERT/SQL/values unchanged. `case 'DIFERENCIAL_SOBRANTE'` now calls this helper with its existing args.
- [x] 1.3 Extract body of `case 'DIFERENCIAL_FALTANTE'` into module-level `async function insertDiferencialFaltanteGasto(params)`. Kept exact SQL/account-fallback/`throw new Error('sin-cuenta')` logic unchanged. `case 'DIFERENCIAL_FALTANTE'` now calls this helper.
- [x] 1.4 RED/safety-net: ran `yarn test:run` on `use-ventas.test.ts` BEFORE touching production code — baseline 40/40 green captured.
- [x] 1.5 GREEN: confirmed 40/40 passes with zero assertion changes after extraction — extraction is behavior-preserving.

## Phase 2: use-ventas.ts — wire VUELTO delta booking

- [x] 2.1 Added case "VUELTO + vueltoDeltaBs<0 inserta movimientos_metodo_cobro INGRESO/DIFERENCIAL_CAMBIARIO" in `use-ventas.test.ts`.
- [x] 2.2 Added case "VUELTO + vueltoDeltaBs>0 inserta gastos/DIFERENCIAL_CAMBIARIO_FALTANTE" with `cuentasConfig` fixture extension.
- [x] 2.3 Added case "VUELTO sin vueltoDeltaBs (undefined) no inserta fila extra".
- [x] 2.4 Added case "VUELTO + vueltoDeltaBs>0 sin cuenta configurada rechaza 'sin-cuenta'".
- [x] 2.5-2.6 Implemented delta-booking branch in `case 'VUELTO'` (calls the Phase 1 helpers by sign of `vueltoDeltaBs`). **Deviation note**: this production code was written in the same edit pass as the Phase 1 extraction, before the Phase 2 tests existed — so there was no literal RED moment for 2.1-2.4 (tests passed immediately on first run). Documented in apply-progress TDD evidence as "GREEN-direct, RED skipped" for this sub-step only; all other steps followed RED-first.
- [x] 2.7 Ran `yarn test:run` — 44/44 green (40 baseline + 4 new), Phase 1 regression intact.
- [x] 2.8 Ran `yarn type-check:test` — zero new errors attributable to `use-ventas.ts`.

## Phase 3: cobro-modal.tsx — remove auto-select, tighten gate, non-blocking message

- [x] 3.1-3.8 Added 6 new RED cases in `cobro-modal.test.tsx` (gating sin pre-seleccion, split vacio bloquea, 1 entry no vacia habilita, mensaje sobrante, mensaje faltante, sin mensaje si exacto) + adapted the existing engram #5293/#5294 regression test to the new "elegir modo + distribuir" flow (3 assertions added: mode no pre-seleccionado, click explicito en "Dar vuelto", split no vacio).
- [x] 3.9 Ran `yarn test:run` BEFORE touching `cobro-modal.tsx` production code — confirmed 5 RED failures for the right reason (auto-select/old-cap code still active); 7 passed (2 unrelated to this gate + 2 whose assertions already held true under old code, used as triangulation).
- [x] 3.10 GREEN: removed `discrepancyMode === null` from the overpago useEffect condition; changed `setDiscrepancyMode('VUELTO')` → `setDiscrepancyMode(null)`.
- [x] 3.11 GREEN: `splitVueltoValid = splitVueltoSumBs.gt(0)`. `splitVueltoExceso` unchanged, reused as delta.
- [x] 3.12 GREEN: `handleProcesar` guard now `if (discrepancyMode === 'VUELTO' && !splitVueltoValid)`, updated toast copy.
- [x] 3.13 GREEN: confirmed `puedeProcesar` required zero code change — verified via the adapted regression test.
- [x] 3.14 GREEN: replaced the status block with the 3-state message (✓ Correcto / sobrante de caja / faltante de caja), epsilon 0.005 Bs.
- [x] 3.15 GREEN: `handleProcesar` now sets `vueltoDeltaBs` on the `discrepancy` object (`splitVueltoExceso.abs().gt('0.005') ? ... : undefined`).
- [x] 3.16 Ran `yarn test:run` — all 12 tests in `cobro-modal.test.tsx` GREEN (6 pre-existing + 6 new/adapted).
- [x] 3.17 Ran `yarn type-check:test` — zero new errors attributable to `cobro-modal.tsx`.

## Phase 4: Full regression sweep + scope guard verification

- [x] 4.1 Full `yarn test:run` (whole project) — 2540 passed / 3 failed, both test files (56 scoped tests for this change) all green. The 3 failures (`cliente-detalle.test.tsx`, `cxc-list.test.tsx`) are pre-existing and unrelated — confirmed via `git stash` + re-run against clean HEAD (same 3 failures reproduce without any of this change's edits).
- [x] 4.2 `yarn type-check:test` — pre-existing spurious errors only (unrelated test files: `factura-detalle-cxc.test.tsx`, `producto-form-*.test.tsx`, `use-pwa-update.ts`); zero errors in `use-ventas.ts`/`cobro-modal.tsx`.
- [x] 4.3 `git diff --stat -- src/features/caja/hooks/use-cuadre.ts` — empty, zero changes.
- [x] 4.4 `git status --short -- migrations/` — empty, zero changes.
- [x] 4.5 No changes made near `consumir_saf_lote`/PR #288 trigger area — confirmed by diff scope (only 4 files touched, all in `src/features/ventas/`).
- [x] 4.6 Verified via full project test run: SAF, Propina, no-excedente, exact-payment, and underpayment (CREDITO/ABSORBER/DIFERENCIAL_FALTANTE) describe blocks all still pass unchanged.
- [x] 4.7 Committed as 2 conventional commits on branch `fix/pos-excedente-vuelto-validacion` (off `origin/develop`): `feat(ventas): registrar diferencial de vuelto vs excedente ideal en crearVenta` and `fix(cobro): bloquear excedente sin elegir modo y exigir distribuir vuelto`. No push, no PR — per instructions, stops here for a fresh-context verify.
