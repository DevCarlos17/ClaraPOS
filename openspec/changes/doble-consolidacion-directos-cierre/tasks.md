# Tasks: Excluir métodos `deposito_directo=1` de la consolidación de cierre

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~48 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (not needed — single PR) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Predicate + SELECT + loop integration + verification | PR 1 (single) | Self-contained fix, ~48 lines total, no dependencies |

## Phase 1: RED — Failing Test

- [x] 1.1 Create `src/features/caja/lib/__tests__/consolidacion-cierre.test.ts` importing `debeExcluirseDeConsolidacionCierre` from `../consolidacion-cierre` (file does not exist yet — fails on import/type-check). Follow `deducciones-cierre.test.ts` pattern (`describe`/`it`, no PowerSync mocks).
- [x] 1.2 Add case: `debeExcluirseDeConsolidacionCierre({ deposito_directo: 1 })` returns `true`.
- [x] 1.3 Add case: `debeExcluirseDeConsolidacionCierre({ deposito_directo: 0 })` returns `false`.
- [x] 1.4 Confirm RED: run `yarn type-check:test` and `yarn test:run` — both must fail (missing module).

## Phase 2: GREEN — Implement Predicate

- [x] 2.1 Create `src/features/caja/lib/consolidacion-cierre.ts` exporting `interface MetodoConsolidacionConfig { deposito_directo: number }` and `debeExcluirseDeConsolidacionCierre(config: MetodoConsolidacionConfig): boolean` returning `config.deposito_directo === 1`.
- [x] 2.2 Run `yarn test:run` — the two Phase 1 tests must now pass.

## Phase 3: Wire Into `cerrarSesionCaja`

- [x] 3.1 In `src/features/caja/hooks/use-sesiones-caja.ts`, import `debeExcluirseDeConsolidacionCierre` from `../lib/consolidacion-cierre`.
- [x] 3.2 Add `mc.deposito_directo` to the `metodosConfigResult` SELECT (~L1022-1029).
- [x] 3.3 Add `deposito_directo: number` to the `MetodoConfigRow` type (~L1031-1040).
- [x] 3.4 In the cierre loop, insert `if (debeExcluirseDeConsolidacionCierre(config)) continue` immediately after the `if (!config) { throw ... }` block and before `const nombreMetodo = config.nombre` (~L1077-1078).

## Phase 4: Full Verification

- [x] 4.1 Run `yarn test:run` — full suite green, no regressions (72 files / 730 tests, all passing).
- [x] 4.2 Run `yarn type-check` — no NEW type errors from this change (see apply-progress: pre-existing repo-wide gap, main tsconfig lacks vitest globals, affects every `*.test.ts(x)` file identically including the new one; the modified production file `use-sesiones-caja.ts` has zero errors).
- [x] 4.3 Run `yarn type-check:test` — 0 errors (tsconfig.test.json correctly includes vitest globals).

## Phase 5: Manual QA (tester handoff)

- [ ] 5.1 Cierre with a single `deposito_directo=1` payment method (e.g. Bs bank direct) → exactly one `movimientos_bancarios` row (posted at sale time), none created at cierre for that método.
- [ ] 5.2 Same as 5.1 but with a `deposito_directo=1` method configured in USD → same single-post behavior, no currency-specific regression.
- [ ] 5.3 Mixed cierre: one `deposito_directo=1` method + one normal (non-direct) method in the same session → direct method skipped, normal method still consolidates with correct destino/deducciones.
- [ ] 5.4 A `deposito_directo=1` method that is also paid "by lote" (`metodoIdsSoloLotes`) → still consolidates per existing by-batch logic (exclusion only applies to the direct-post case per spec scenario `by-batch-still-consolidates`).
- [ ] 5.5 Manual POS→Tesorería traspaso (`consolidarMetodoATesoreriaEnTx` called outside the cierre loop) → unaffected, still works as before.

> **Known follow-up (out of scope)**: historical reconciliation script for pre-fix duplicated `movimientos_bancarios` rows — not part of this change (see proposal/spec "Known dependency" note).
