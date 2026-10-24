# Verification Report

**Change**: split-desconciliar-reversar-historico
**Mode**: Strict TDD
**Verdict**: PASS WITH WARNINGS

## Diff scope (adversarial check #1)

`git diff --stat`: 8 files, 299 insertions/37 deletions (excl. unrelated `.atl/skill-registry` noise from another session).
Changed: `use-conciliacion-tesoreria.ts`, `use-traspasos.ts`, `conciliacion-tesoreria.tsx`, `movimientos-table.tsx` + 2 new hook test files + 2 modified component test files + openspec artifacts.

`git diff --name-only | grep -i reverso` → NONE. `use-reverso-abono-directo.ts` and `reverso-modal.tsx` are byte-untouched. `reverso-modal.test.tsx` (13 tests, pre-existing) still passes unchanged — orchestrator/modal path PRESERVED.

## Desconciliar state-only (CRITICAL check) — CONFIRMED PASS

`desconciliarMovBancario`/`CajaFuerte` = single `UPDATE validado=0, validado_por=NULL, validado_at=NULL WHERE id=? AND empresa_id=?`. No modal, no egreso insert, no `bancos_empresa`/`caja_fuerte` saldo touch, no factura/cliente touch. Grepped function bodies for saldo/factura/cliente — zero matches.

## desvalidarTraspaso atomic both-sides (CRITICAL check) — CONFIRMED PASS

Read side-by-side with `validarTraspaso` (L986-1032): identical SELECT+branch (`cuenta_origen_tipo`/`cuenta_destino_tipo` BANCO→`movimientos_bancarios` else→`mov_caja_fuerte`) + `SESION_CAJA` skip, both UPDATEs inverted (1→0, audit→NULL) inside ONE `db.writeTransaction`. Faithful inverse, no desync risk, atomicity confirmed by test asserting `writeTransaction` called exactly once.

## Reversal untouched (CRITICAL check) — CONFIRMED PASS

`handleReversarHistorico` = renamed from `handleDesconciliarMov`, body byte-identical (still opens `ReversoModal`). Dispatch `handleDesconciliarHistorico` correctly branches TRASPASO→`desvalidarTraspaso`, BANCO/CAJA_FUERTE→`desconciliarMov*`.

## Guard matrix — CONFIRMED PASS

`HistoricoRow`: two independent buttons. Desconciliar = `isValidado && !isReversado && onDesconciliar` (origin-agnostic). Reversar = same + `origen==='TRANSFERENCIA_CLIENTE'`. Pendientes `toMovRow` call site (L422) passes no 4th arg → `onDesconciliar` undefined there, confirming Desconciliar never leaks into Pendientes/Rechazar.

## Tests executed (real runtime evidence)

- Targeted 4 files: 28/28 passed.
- RED repro: `git stash` on the 4 production files only (tests kept) → 19/28 failed with "X is not a function" (TypeError), proving tests exercise real implementation, not tautologies. `git stash pop` restored → 28/28 green again.
- Broad tesorería regression: `yarn test:run src/features/tesoreria` → 70/70 passed (10 files), including untouched `reverso-modal.test.tsx` (13/13).
- Adjacent regression: caja + clientes/hooks → 34/34 passed.
- `yarn type-check:test` → 3 pre-existing baseline errors (`producto-form-aviso-borrador.test.tsx`, `producto-form-edit-open-mask.test.tsx`, `use-pwa-update.ts`) — zero new errors, matches apply-progress's self-reported baseline.

## Assertion quality

No tautologies, no ghost loops, no smoke-test-only patterns. All new hook tests assert exact SQL fragments + params against a real mock transaction; all new/rewritten component tests use render+userEvent+role-based queries with behavioral assertions (click→callback with correct id, absence of modal).

## Issues found

**CRITICAL**: None.

**WARNING**:
1. "Desconciliar nunca toca saldo" (spec requirement #3, desconciliar delta) has no negative-assertion test (e.g. asserting zero UPDATE calls against `bancos_empresa`/`caja_fuerte`). Compliance is via static code inspection (grep confirms absence) rather than a runtime guard — if someone later adds a saldo touch to these functions, no test would catch it. Recommend adding `expect(calls.filter(c => c.sql.includes('bancos_empresa'))).toHaveLength(0)` style assertion.
2. Working tree has large unrelated untracked noise (other openspec change folders, temp files, xlsx/zip/image.png) from other sessions — must be excluded when staging this PR's commit (`git add` only the 8 intended files).

**SUGGESTION**:
1. `desvalidarTraspaso` doesn't re-check "already validado=0" before flipping — consistent with `validarTraspaso`'s existing asymmetry (which also lacks a "ya validado" guard), so this is intentional-mirror behavior, not a new defect.
2. Spec artifact self-reports "9 scenarios" each for desconciliar/reversar (18 total) but actual `#### Scenario` blocks in the delta files count 8+8=16. Doc bookkeeping mismatch only, no functional impact.

## PR readiness

Safe to commit and open as a single PR stacked-to-main, after excluding unrelated untracked files from the commit. ~300 LOC, well under 400-line budget. Recommend addressing WARNING #1 (saldo negative-assertion test) as a quick follow-up but not a blocker.

## Next recommended

sdd-archive

---

**Post-verify outcome**: Merged as PR #265 (merge commit `a0fc538`) into `develop`.
