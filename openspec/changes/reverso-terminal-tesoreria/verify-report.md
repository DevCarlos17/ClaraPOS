# Verification Report

**Change**: reverso-terminal-tesoreria
**Branch**: feat/reverso-terminal-tesoreria (off origin/develop @ 0795382b)
**Mode**: Standard (Strict TDD OFF, per orchestrator override)

## Context

This change REVERSES a decision shipped yesterday (commit `251a32a3`, 2026-10-28): a reverso-de-abono row (`origen='REVERSO'`, inserted validado=1 by `reversarAbonoDirectoDesdeTesoreria`) must now be **terminal** in Histórico — no Desconciliar, no Rechazar, no Reversar, no Conciliar — closing a circular bug where Desconciliar → Pendientes → Rechazar allowed a "reverso of the reverso." The Conciliar gate must stay untouched because it's shared by an unrelated legacy mechanism (`reversarMovBancario`, for GASTO/PAGO_PROVEEDOR/MANUAL/TRASPASO reversals) that legitimately still needs validado=0→1 via Conciliar.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 10 (1.1, 2.1-2.3, 3.1-3.4, 4.1-4.2) |
| Tasks complete | 9 |
| Tasks incomplete | 1 (4.2 — manual post-deploy production DB check, explicitly deferred/non-blocking, requires prod access not available in apply/verify phase) |

## Build & Tests Execution

**Tests** (scoped per orchestrator override — full suite NOT run):
```text
$ yarn test:run src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx src/features/tesoreria/components/__tests__/movimientos-table.test.tsx

✓ src/features/tesoreria/components/__tests__/movimientos-table.test.tsx (16 tests) 861ms
✓ src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx (5 tests) 1475ms

Test Files  2 passed (2)
     Tests  21 passed (21)
```
Independently re-executed by this verifier (not just trusted from apply-progress memory) — same 21/21 result.

## Scope / Diff Verification

`git status` on `feat/reverso-terminal-tesoreria` (up to date with origin/develop):
```
modified:   src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx
modified:   src/features/tesoreria/components/__tests__/movimientos-table.test.tsx
modified:   src/features/tesoreria/components/movimientos-table.tsx
untracked:  openspec/changes/reverso-terminal-tesoreria/   (SDD artifacts)
```
`git diff --stat`: 3 files changed, 47 insertions(+), 22 deletions(-). **No other files touched** — no Conciliar changes, no orchestrator/hook changes, no migrations. Scope matches proposal's Affected Areas exactly. ✅

## Adversarial Checks (file:line evidence)

### 1. Desconciliar excluded for REVERSO — `movimientos-table.tsx:394`
```tsx
{isValidado && !isReversado && mov.origen !== 'REVERSO' && mov.onDesconciliar && (
```
Was (pre-change): `{isValidado && !isReversado && mov.onDesconciliar && (`. A row with `origen='REVERSO', validado=1, reversado=0` now renders **zero** Desconciliar button. Confirmed by `movimientos-table.test.tsx` new case (line ~136-143) and `conciliacion-tesoreria.test.tsx` integration test (full render path). **PASS**.

### 2. Rechazar excluded for REVERSO — `movimientos-table.tsx:261`
```tsx
{!isReversado && mov.origen !== 'REVERSO' && mov.onReversar && (
```
This is the `PendienteRow` button labeled "Rechazar" in JSX (confusingly wired to the `onReversar` prop — verified by rendering label at line 268: `>Rechazar<`). Was: `{!isReversado && mov.onReversar && (`. Confirmed excluded for `origen='REVERSO'` regardless of `validado` (0 or 1) by the new test case asserting both rows render zero "Rechazar" buttons. **PASS**.

### 3. CONCILIAR UNTOUCHED — `movimientos-table.tsx:251-258` (PendienteRow)
```tsx
{!isReversado && !isValidado && mov.onValidar && (
  ...
  Conciliar
)}
```
`git diff` of `movimientos-table.tsx` shows exactly 2 hunks (line 261 Rechazar, line 394 Desconciliar) — **zero diff** at the Conciliar block. Confirmed in code AND by a dedicated regression-guard test:
```tsx
// movimientos-table.test.tsx — describe('... boton Conciliar (regresion: mecanismo legado reversarMovBancario)')
it('REGRESSION GUARD: SIGUE mostrando Conciliar para origen=REVERSO con validado=0 ...', () => {
  const row = buildRow({ validado: 0, reversado: 0, origen: 'REVERSO', onValidar })
  render(<MovimientosTable movimientos={[row]} modo="pendiente" />)
  expect(screen.getByRole('button', { name: 'Conciliar' })).toBeInTheDocument()
})
```
This test is a genuine guard — it would FAIL if someone later added `&& mov.origen !== 'REVERSO'` to the Conciliar gate, because `getByRole` throws when the button is absent. Verified this is a real-world scenario, not synthetic: `use-traspasos.ts` lines 371, 452, 482, 563 insert `origen='REVERSO', validado=0` rows for TRASPASO reversals (the legacy `reversarMovBancario`-adjacent mechanism), which legitimately need Conciliar to remain available. **PASS — the #1 risk is covered.**

### 4. Reversar still excluded (unchanged gate) — `movimientos-table.tsx:404`
```tsx
{isValidado && !isReversado && mov.origen === 'TRANSFERENCIA_CLIENTE' && mov.onReversar && (
```
Not touched by this diff (outside both hunks). A reverso row (`origen='REVERSO'`) can never satisfy `origen === 'TRANSFERENCIA_CLIENTE'`, so Reversar was already excluded by construction, unaffected by this change. Covered by a pre-existing test (`movimientos-table.test.tsx` line 59, "NO se renderiza cuando el origen no es TRANSFERENCIA_CLIENTE") plus the new zero-actions assertion in `conciliacion-tesoreria.test.tsx`. **PASS**.

### 5. Decision-reversal honesty — old-contract tests rewritten, not left contradicting
`git diff` of `conciliacion-tesoreria.test.tsx` shows the describe block renamed from *"... aterriza en Historico como Validado"* to *"... aterriza en Historico como terminal (sin acciones)"*; both `it` blocks flipped:
- Old: `expect(screen.getByRole('button', { name: 'Desconciliar' })).toBeInTheDocument()` → New: `expect(screen.queryByRole('button', { name: 'Desconciliar' })).not.toBeInTheDocument()`
- Old: click Desconciliar → assert `desconciliarMovBancario` called → New: assert button absent AND `desconciliarMovBancario` never called.
Grepped both modified test files for residual old-contract wording (`UNICAMENTE.*Desconciliar`, "único... Desconciliar") — **zero matches**. No test in these two files still asserts the old (reversed) behavior. **PASS**.

### 6. Test integrity — genuine guards, not vacuous
Re-ran the 2 scoped files independently: **2 files, 21/21 passed** (16 in `movimientos-table.test.tsx`, 5 in `conciliacion-tesoreria.test.tsx`), matching the apply-phase report. Traced each new/modified assertion against the gate logic:
- Desconciliar-hidden test uses `queryByRole(...).not.toBeInTheDocument()` — would fail (button present) if `&& mov.origen !== 'REVERSO'` were reverted. Genuine.
- Rechazar-hidden test — same pattern, two rows (validado 0 and 1). Genuine.
- Conciliar regression-guard uses `getByRole` (throws if absent) — would fail if someone wrongly added the exclusion to Conciliar. Genuine.
- `conciliacion-tesoreria.test.tsx` zero-actions test checks all 4 buttons absent via `queryByRole` + asserts `mockedDesconciliarMovBancario` not called — full-stack regression coverage through the real component tree. Genuine.
**PASS**.

### 7. Scope — confirmed exactly 3 code/test files + SDD artifacts
See "Scope / Diff Verification" above. No Conciliar gate change, no orchestrator/hook change, no migrations, no other files. **PASS**.

### 8. Orphaned-rows reasoning — consistent, no crash risk
Orphaned rows (`origen='REVERSO', validado=0`, created by Desconciliar during the 2026-10-23→10-28 bug window) hit `PendienteRow`. `ORIGEN_LABELS.REVERSO = 'Reverso'` and `ORIGEN_COLORS.REVERSO` are both defined in `movimientos-table.tsx` (lines 44, 56) — no undefined-key badge crash. These rows now render an empty Acciones cell (no Rechazar — excluded; no Conciliar either, since `!isValidado` is false only if validado=1, but these are validado=0, so Conciliar's `!isValidado` condition IS satisfied → **Conciliar still shows** for them, enabling self-healing: a supervisor re-Conciliar's the row, it becomes `validado=1, origen='REVERSO'` → lands in Histórico, now correctly terminal per the new Desconciliar exclusion). This matches the proposal's documented self-healing claim exactly. **PASS**.

### Additional check performed (not in the explicit list, but adversarially relevant)
Verified whether the blanket `origen !== 'REVERSO'` Desconciliar exclusion has an unintended side effect on the **legacy** mechanism: once a TRASPASO/GASTO/PAGO_PROVEEDOR/MANUAL reverso row (`origen='REVERSO', validado=0`) gets Conciliado (→ `validado=1`), it now ALSO loses Desconciliar in Histórico — a behavior change for a flow unrelated to the abono-reverse bug. Cross-checked against exploration doc (#5967, finding 2): this is confirmed **intentional**, not an oversight — the exploration explicitly frames the Desconciliar gate as "the ROOT fix: once applied, a validated REVERSO row can never be flipped back to validado=0... closing the bug at the source for all future rows," deliberately origin-agnostic at the UI layer because the component has no way to distinguish which backend mechanism produced a given `origen='REVERSO'` row. The single regression-guard test's coverage is sufficient for both mechanisms since the gate condition is identical regardless of origin mechanism. **No finding — documented, deliberate trade-off.**

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| tesoreria-historico-desconciliar: exclude REVERSO | `origen='REVERSO', validado=1, reversado=0` → no Desconciliar | `movimientos-table.test.tsx` (new case) + `conciliacion-tesoreria.test.tsx` (zero-actions) | ✅ COMPLIANT |
| tesoreria-historico-desconciliar: reversado=1 guard | unchanged pre-existing scenario | `movimientos-table.test.tsx` (pre-existing) | ✅ COMPLIANT |
| tesoreria-reverso-abono-directo: terminal, zero actions | egreso-reverso aterriza Validado, cero acciones | `conciliacion-tesoreria.test.tsx` zero-actions test | ✅ COMPLIANT |
| tesoreria-reverso-abono-directo: orphaned row never shows Rechazar | `validado=0, origen='REVERSO'` in Pendientes | `movimientos-table.test.tsx` (new case, both validado states) | ✅ COMPLIANT |
| tesoreria-reverso-abono-directo: Conciliar regression guard | legacy origin, `validado=0` → still shows Conciliar | `movimientos-table.test.tsx` (new regression-guard describe block) | ✅ COMPLIANT |
| tesoreria-historico-reversar: unchanged, REVERSO never shows Reversar | `origen='REVERSO', validado=1` → no Reversar | `conciliacion-tesoreria.test.tsx` zero-actions test (covers Reversar absence too) | ✅ COMPLIANT |

**Compliance summary**: 6/6 scenario groups compliant.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Desconciliar gate excludes REVERSO | ✅ Implemented | `movimientos-table.tsx:394` |
| Rechazar gate excludes REVERSO | ✅ Implemented | `movimientos-table.tsx:261` |
| Conciliar gate origin-agnostic (unchanged) | ✅ Implemented | `movimientos-table.tsx:251`, zero diff |
| Reversar gate unchanged | ✅ Implemented | `movimientos-table.tsx:404`, zero diff |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Minimal 2-line `&&` exclusion, no insert/function changes | ✅ Yes | `use-reverso-abono-directo.ts` and `use-conciliacion-tesoreria.ts` untouched |
| Do not guard `desconciliarMovBancario` function itself (owner-resolved open question) | ✅ Yes | No change to that function; UI-gate-only per scope |
| Branch name `feat/` instead of `fix/` (tasks.md literal) | ✅ Yes (documented deviation) | Same base commit `0795382b`; naming-only, called out in apply-progress memory |

## Issues Found

**CRITICAL**: None.

**WARNING**: None.

**SUGGESTION**:
- Task 4.2 (manual production check for orphaned `origen='REVERSO', validado=0` rows from the 2026-10-23→10-28 window) remains unchecked — correctly deferred as non-blocking/self-healing, but flag it explicitly in the PR description as a reviewer/ops follow-up so it isn't forgotten.
- PR description should explicitly cite commit `251a32a3` as the reverted decision (per proposal's own risk mitigation) so reviewers don't mistake this for an accidental regression.

## Verdict

**PASS**

All 8 adversarial checks pass with file:line evidence and genuine (non-vacuous) test guards. The #1 risk — an accidental Conciliar regression for the legacy `reversarMovBancario` mechanism — is explicitly covered by both a zero-diff code check and a dedicated regression-guard test. The decision reversal of `251a32a3` is handled honestly: old-contract assertions were rewritten, not left contradicting. Scope is exactly the 3 files proposed, no creep. Ready for PR, pending the two non-blocking SUGGESTIONs above.
