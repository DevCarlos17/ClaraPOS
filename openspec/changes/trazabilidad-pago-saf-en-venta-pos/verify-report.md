# Verification Report

**Change**: trazabilidad-pago-saf-en-venta-pos
**Version**: N/A
**Mode**: Strict TDD

> Fresh-context, adversarial verification. The orchestrator instructed to SKIP the full suite and the `tesoreria` suite — only the two scoped test files below were executed. This is a **coverage boundary**, not a full regression guarantee; see "Full Suite Skipped" note at the end.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 4 phases, 19 leaf tasks (tasks.md) |
| Tasks complete | 19/19 checked `[x]` |
| Tasks incomplete | 0 |

## Diff Reality (independent `git diff`/`git status`)

```
git status --short
 M src/features/cxc/hooks/__tests__/use-cxc.test.ts
 M src/features/cxc/hooks/use-cxc.ts
 M src/features/ventas/hooks/__tests__/use-ventas.test.ts
 M src/features/ventas/hooks/use-ventas.ts
 M .atl/.skill-registry.cache.json      <- NOT part of the claimed change
 M .atl/skill-registry.md               <- NOT part of the claimed change
?? openspec/changes/trazabilidad-pago-saf-en-venta-pos/
```

`git diff --numstat` on the 4 claimed files:

| File | + | - |
|---|---|---|
| `use-cxc.ts` | 3 | 1 |
| `use-cxc.test.ts` | 22 | 0 |
| `use-ventas.ts` | 37 | 1 |
| `use-ventas.test.ts` | 350 | 0 |
| **Total** | **412** | **2** |

Aggregate (**414 changed lines**) matches the apply-progress's claimed total exactly. Per-file labels in apply-progress (`use-cxc.ts +4/-2`, `use-ventas.ts +38/-2`) are slightly off from the real numstat (`+3/-1`, `+37/-1`) — a cosmetic reporting nitpick, does not change the budget conclusion (SUGGESTION, see Issues).

**Additive check (independent read of full diffs)**: confirmed. The only `-` lines in `use-cxc.ts` are the return-type signature (`void` → object) — a type widening, not a logic removal. The only `-` line in `use-ventas.ts` is the replacement of a bare `await aplicarPagoFacturaEnTx(...)` call with a destructured `const { pagoId, montoUsd } = await aplicarPagoFacturaEnTx(...)` — same call, same arguments, nothing removed. No statement reordering. `pagos` / `movimientos_cuenta` writes are **not** mutated by this diff — confirmed by reading the full `use-ventas.ts` diff hunk-by-hunk; the only new writes are to `movimientos_bancarios_pagos` (the bridge table) inside the pre-existing Paso 8 loop. The `isPosAllocation` suppression block (`use-cxc.ts` L579, unquoted in diff) is untouched — confirmed by its absence from the diff. The simple-venta `correlacion` bridge (Paso 5/8, pre-existing) is untouched — same loop, new code is strictly additive inside an `if (i === pagoSafIndex)` guard that did not exist before.

**Unintended files**: `.atl/.skill-registry.cache.json` and `.atl/skill-registry.md` are modified in the working tree but are **not** part of this change's claimed scope (tooling/registry housekeeping, unrelated to SAF/FIFO). Flagged as WARNING — should be excluded from this PR or committed separately.

## Build & Tests Execution

**Build**: Not run (no `yarn build` requested; type-check used as the static-correctness gate per tasks.md convention).

**Tests (scoped only — full suite and `tesoreria` suite explicitly SKIPPED per orchestrator instruction)**:

```text
yarn test:run src/features/ventas/hooks/__tests__/use-ventas.test.ts
 ✓ 40 passed (40)

yarn test:run src/features/cxc/hooks/__tests__/use-cxc.test.ts
 ✓ 82 passed (82)
```

**Coverage**: Not run — no coverage tool invoked for this verify pass (out of scope per instructions).

### RED → GREEN independent reproduction (strict-TDD proof)

Procedure: `git stash push` ONLY the two production files (`use-cxc.ts`, `use-ventas.ts`), keeping the two test files modified, ran both scoped suites, then `git stash pop` to restore and re-ran both suites.

**RED** (production reverted to `develop` baseline, tests from this change still applied):

```text
use-ventas.test.ts: 35 passed | 5 FAILED (40 total)
  FAIL FIFO a 1 factura vieja ...            expected length 2 but got 1
  FAIL FIFO distribuido en 3 facturas ...    expected length 4 but got 1
  FAIL remanente/anticipo solo ...           expected length 2 but got 1
  FAIL combinado (2 FIFO + remanente) ...    expected length 4 but got 1
  FAIL pago mixto (BS+efectivo) ...          expected length 2 but got 1
  (no-regresion test passed already — negative-space, by design)

use-cxc.test.ts: 81 passed | 1 FAILED (82 total)
  FAIL retorna {pagoId, montoUsd} ...        TypeError: Cannot read properties of undefined (reading 'pagoId')
```

All 6 failures are for the **exact right reason**: missing bridge-row INSERTs (length mismatch) or the old `void` return shape (destructure of `undefined`). No crashes, no unrelated failures.

**GREEN** (production restored via `git stash pop`):

```text
use-ventas.test.ts: 40 passed (40)
use-cxc.test.ts:    82 passed (82)
```

RED→GREEN delta: exactly the 6 new tests flip from fail to pass; 115 pre-existing tests across both files stayed green throughout (no regression introduced, no pre-existing test broken by the stash/pop cycle).

### Type-check

```text
yarn type-check:test
4 errors:
  factura-detalle-cxc.test.tsx(292,19)             TS2367 — unrelated DIRECT/SAF/LEGACY/BATCH comparison
  producto-form-aviso-borrador.test.tsx(105,3)      TS2322 — unrelated Producto fixture type
  producto-form-edit-open-mask.test.tsx(75,3)       TS2322 — unrelated Producto fixture type
  use-pwa-update.ts(8,20)                           TS6133 — unrelated unused var
```

**Verified pre-existing** (not taken on faith): stashed all 4 changed files, re-ran `yarn type-check:test` against clean `develop` HEAD — produced the **identical 4 errors**, same files, same line numbers. Restored via `git stash pop`. None of the 4 pre-existing errors touch `use-cxc.ts`, `use-ventas.ts`, or either test file.

## Spec Compliance Matrix

Spec file `openspec/changes/trazabilidad-pago-saf-en-venta-pos/specs/tesoreria-trazabilidad-ingreso-pagos/spec.md` has **7** `#### Scenario:` blocks (not 9 as estimated in the launch prompt — recounted directly from the file).

| # | Scenario | Test | Result |
|---|----------|------|--------|
| 1 | Excedente cierra 1 factura vieja vía FIFO | `use-ventas.test.ts` > "FIFO a 1 factura vieja ..." | ✅ COMPLIANT |
| 2 | Excedente distribuido en múltiples facturas viejas | `use-ventas.test.ts` > "FIFO distribuido en 3 facturas viejas ..." | ✅ COMPLIANT |
| 3 | Excedente supera todas las pendientes → anticipo bridgeado | `use-ventas.test.ts` > "remanente/anticipo solo ..." | ✅ COMPLIANT |
| 4 | Pago mixto atribuye el excedente SAF al leg correcto | `use-ventas.test.ts` > "pago mixto (leg BS ... + leg efectivo) ..." | ✅ COMPLIANT |
| 5 | Bridge simple y supresión de cuadre permanecen intactos | `use-ventas.test.ts` > "[no-regresion] ..." | ✅ COMPLIANT |
| 6 | Preview y reverso cubren caja + FIFO | (none in scoped files — relies on pre-existing, unmodified `use-preview-facturas-afectadas.test.ts` "escenario SAF"/"ingreso-mixto" tests, which validate the generic multi-row mechanism, not this specific producer) | ⚠️ PARTIAL |
| 7 | Reverso bloquea si el crédito del anticipo ya fue consumido | (none in scoped files — relies on pre-existing, unmodified `use-reverso-abono-directo.test.ts` "SAF-block" test, same caveat as #6) | ⚠️ PARTIAL |

**Compliance summary**: 5/7 fully compliant with a test added by THIS change; 2/7 (scenarios 6-7) are compositionally covered — each half (bridge-row creation here; bridge-row consumption in `previewFacturasAfectadas`/`reversarAbonoDirectoDesdeTesoreria`, both files UNCHANGED by this diff) has its own pre-existing, independently-passing test, but **no single test exercises `crearVenta`'s SAF/FIFO output being fed into the tesorería reverse path end-to-end**. Grep for a combined call site (`crearVenta` + `reversarAbonoDirectoDesdeTesoreria` in the same test) returned zero matches anywhere in `src/`. This is a reasonable risk given `previewFacturasAfectadas`/`reversarAbonoDirectoDesdeTesoreria` query by `ingreso_id` generically (column shape match confirmed by direct reading of both queries — `mbp.pago_id, mbp.monto_aplicado_usd, p.venta_id, ...` against the new INSERT's columns `(id, empresa_id, ingreso_id, pago_id, monto_aplicado_usd, created_at, created_by)` — exact match), but it remains an **integration-test gap**, not a logic gap.

## Mechanism Trace (read against actual code, not the self-report)

| Check | Result | Evidence |
|---|---|---|
| (a) Both surplus legs bridged (FIFO old-invoice AND anticipo) | ✅ | Paso A loop pushes `{pagoIdFifo, montoUsdFifo}` per `invoiceAssignments` entry; Paso B pushes `{pagoExcedenteIdSaf, remainingSaf}` unconditionally when `remainingSaf.gt('0.001')`. Both read via `safFifoBridgeEntries.push(...)`. |
| (b) `monto_aplicado_usd` = capped, full-precision `Decimal`, never masked display | ✅ | `montoUsdFifo` is the literal `Decimal` returned by `aplicarPagoFacturaEnTx` (computed internally via `montoD`/`bsToUsd` Decimal chain, line 550 `use-cxc.ts`) — not re-derived from `inv.montoUsd`. `remainingSaf` is `Decimal.max(0, new Decimal(discrepancy.montoUsd).minus(totalAppliedUsd))`, same value written to `pagos.monto_usd` via `toStorageString(remainingSaf)`. Neither path touches any UI display-mask ref. |
| (c) `pagoSafIndex` attaches to the CORRECT bank leg in mixed payments | ✅ | `pagoSafIndex = pagos.indexOf(pagoSaf)` computed once (line ~1166), reused unchanged in Paso 8's `if (i === pagoSafIndex)` guard. Verified by the "pago mixto" test: leg BS gets 2 bridge rows (correlacion + FIFO), leg efectivo gets 0 rows AND 0 `movimientos_bancarios` INSERT. |
| (d) Everything inside the single `writeTransaction` | ✅ | `crearVenta` opens `await db.writeTransaction(async (tx) => {` at line 311; both the SAF accumulation block (~L1139-1270) and the Paso 8 flush (~L1832-1848) execute inside that same callback, confirmed by direct line-range read — no nested/second transaction. |
| (e) Every bridge row carries `empresa_id` | ✅ | INSERT column list `(id, empresa_id, ingreso_id, pago_id, monto_aplicado_usd, created_at, created_by)` with `empresa_id` bound as a param on every row, both for the pre-existing `correlacion` row and the new SAF entries. |

## Reversal Completeness

`previewFacturasAfectadas` and `reversarAbonoDirectoDesdeTesoreria` are **unmodified** by this diff (0 lines touched, confirmed by `git status`/`git diff` scope). Both already query `movimientos_bancarios_pagos` generically by `ingreso_id` with no per-producer logic, so new SAF/FIFO bridge rows are picked up automatically:
- `previewFacturasAfectadas` resolves FIFO pagos as `facturasDirectas` (since `venta_id` is non-NULL for FIFO entries) and the anticipo pago via `detectarLoteSafDePago` (since its `venta_id` is NULL) — both pre-existing branches, exercised by pre-existing fixtures `ingreso-saf`/`ingreso-mixto`.
- `reversarAbonoDirectoDesdeTesoreria` loops `bridgeRows` (same query shape) and, for each `pago_id`, runs the PRE-TX SAF-block check (`detectarLoteSafDePago`) BEFORE opening the transaction — if any bridged pago's credit was already consumed elsewhere, the whole reverse throws with zero mutation. Inside the transaction it delegates to `reversarPagoEnTx` per bridged pago, which is the actual REVERT (not just detection) — restores `saldo_pend_usd` per invoice via the existing reversal mechanics.

Confirmed this is genuine DETECT+REVERT, not detect-only — but see the Spec Compliance gap above (scenarios 6/7 lack a direct cross-module integration test).

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| Return-shape change additive | ✅ Implemented | Both existing call sites (`registrarPagoFactura` L927, `crearVenta` Paso A) already `await` without destructuring old code path — confirmed no other call site breaks. |
| No double-bridging risk | ✅ Implemented | INSERT only happens in `use-ventas.ts` Paso 8, never inside `aplicarPagoFacturaEnTx` itself (that function's own bridge block is gated by `!isPosAllocation`, line 579, untouched). |

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Return shape `void` → `{pagoId, montoUsd}` | ✅ Yes | Exact match. |
| `pagoSafIndex` computed once, reused in Paso 8 | ✅ Yes | Exact match, verified via mixed-payment test. |
| Delegate to shared `aplicarPagoFacturaEnTx` (no duplication) | ✅ Yes | FIFO loop still calls the shared function. |
| No new detection logic in tesorería | ✅ Yes | 0 lines touched in `use-preview-facturas-afectadas.ts` / `use-reverso-abono-directo.ts`. |

## Issues Found

**CRITICAL**: None.

**WARNING**:
1. Spec scenarios 6 and 7 (preview/reverso completeness) have no direct integration test spanning `crearVenta` → `reversarAbonoDirectoDesdeTesoreria` in this change or anywhere in the repo (confirmed via grep). Coverage is compositional (two independently-tested, unmodified halves), not end-to-end. Recommend a follow-up integration test before this mechanism is relied upon for the anticipo SAF-block safety guarantee the proposal calls "a hard requirement, not a nice-to-have."
2. Two unrelated files (`.atl/.skill-registry.cache.json`, `.atl/skill-registry.md`) are modified in the working tree alongside this change's scope. Not functionally harmful, but should be excluded from this PR or committed separately to keep the diff honest to its stated scope.

**SUGGESTION**:
1. apply-progress's per-file line counts (`use-cxc.ts +4/-2`, `use-ventas.ts +38/-2`) don't exactly match independent `git diff --numstat` (`+3/-1`, `+37/-1`). The aggregate total (414) is correct either way — cosmetic only.
2. Budget: independently confirmed **412 insertions / 2 deletions = 414 changed lines**, 3.5% over the 400-line review budget, with production wiring at 40 lines (37+3) and test code at 372 lines (350+22). This matches the self-report almost exactly (self-report said 42 for wiring vs the slightly more precise 40 here). Verdict: **acceptable to ship as a single PR** — the overshoot is 100% test/comment verbosity on one atomic, non-splittable TDD code path (splitting the RED-GREEN cycle across two PRs would leave an intermediate PR with a type signature change and no caller, or tests with no implementation). Reviewer should be told explicitly in the PR description, not just in `tasks.md`.

## Verdict

**PASS WITH WARNINGS**

The implementation is correct, genuinely additive, financially sound (full-precision Decimal throughout, single transaction, empresa_id on every row), and independently proven via a real RED→GREEN cycle (6 tests, right failure reasons, clean restore). The two WARNINGs are process/scope hygiene items (unrelated tooling files in the diff; a real-but-reasonable integration-test gap for 2 of 7 spec scenarios) — neither invalidates the fix itself.

**PR-ready: YES**, conditional on: (1) dropping or separating the two `.atl/` files from this PR's commit, and (2) the reviewer being told explicitly about the 414-line budget overshoot and the compositional (non-E2E) coverage of scenarios 6-7 in the PR description.

---

### Full Suite Skipped (explicit note)

Per orchestrator/user instruction, this verification ran ONLY:
- `yarn test:run src/features/ventas/hooks/__tests__/use-ventas.test.ts`
- `yarn test:run src/features/cxc/hooks/__tests__/use-cxc.test.ts`

The repo-wide suite and the `src/features/tesoreria/hooks` suite (which contains `previewFacturasAfectadas`/`reversarAbonoDirectoDesdeTesoreria` and is cited by apply-progress as "30/30 green, unmodified") were **NOT independently re-run** in this verify pass. The apply-progress's claim of 30/30 green in tesorería is taken at face value here — it is plausible given 0 lines changed in that module, but it is **not independently reproduced**, consistent with the explicit test-scope constraint given for this verification. Anyone relying on this report for the tesorería side should run that suite separately before merge.
