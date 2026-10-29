## Verification Report

**Change**: fix-saldo-cliente-doble-reverso (Unit A — app-level client clamp)
**Branch**: `feat/fix-saldo-cliente-clamp` @ `origin/develop` `2b80e471`
**Mode**: Standard (Strict TDD OFF per explicit override)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total (Unit A: Phase 0-2 + 4.1-4.2) | 11 |
| Tasks complete | 11 |
| Tasks incomplete | 0 (Phase 3 / Unit B out of scope for this verify) |

### Build & Tests Execution
**Build**: ➖ Not run (out of mode scope; apply-progress #5987 reported no new errors on touched lines from a prior full type-check)

**Tests**: ✅ 6 passed / ❌ 0 failed / ⚠️ 0 skipped
```text
$ yarn test:run src/features/cxc/hooks/__tests__/reversar-pago-en-tx.test.ts
✓ reversarPagoEnTx — fix doble-conteo saldo cliente (6 tests) 44ms
  ✓ TC1 retry/race: ventaDeltaReal=0 -> sin UPDATE clientes ni INSERT movimientos_cuenta
  ✓ TC2 repro 4 pasos, camino normal -> factura y cliente ambos terminan en $1
  ✓ TC3 reverso directo simple sin drift -> comportamiento identico al actual
  ✓ TC4 fan-in global: 2 facturas -> incremento total=30, NUNCA 70
  ✓ acepta tx externa, nunca llama db.writeTransaction (pre-existing)
  ✓ triangulacion: generatedLote=true delega en reversarPagoSafEnTx (pre-existing)
Test Files  1 passed (1)
     Tests  6 passed (6)
```

**Independent adversarial re-verification** (not just trusting the apply's self-report):
`git stash push --keep-index -- src/features/cxc/hooks/use-cxc.ts` (prod file only, test file kept) → re-ran the same command:
```text
× TC1 retry/race ... → expected '2.00000000' to be '1.00000000'
× TC4 fan-in global ... → expected '70.00000000' to be '30.00000000'
Tests  2 failed | 4 passed (6)
```
Exact values match the bug report (#5979, $1 invoice → $2 client balance) and the apply's claim. `git stash pop` restored the fix; re-ran → 6/6 green again, diff identical (+21/-5, `git diff --stat` unchanged).

**Coverage**: ➖ Not measured (scoped test run only, per mode override)

### Spec/Design Compliance Matrix
| Design item | Scenario | Test | Result |
|---|---|---|---|
| D1 clamp formula (`ventaDeltaReal = nuevoSaldoFactura - saldoPendActual`) | TC3 no-drift (delta=monto) | `reversar-pago-en-tx.test.ts > TC3` | ✅ COMPLIANT |
| D1 clamp applied to retry/race (delta=0) | TC1 | `> TC1` | ✅ COMPLIANT |
| D1 global fan-in (sum of clamped deltas, not raw montos) | TC4 | `> TC4` | ✅ COMPLIANT |
| D1 4-step repro, normal path | TC2 | `> TC2` | ✅ COMPLIANT |
| D2 guard: skip clientes UPDATE + movimientos_cuenta INSERT when delta<=0 | TC1 (asserts calls never happened, not just value) | `> TC1` | ✅ COMPLIANT |
| SAF path untouched (generatedLote=true never reads ventaDeltaReal) | TC5 | reused pre-existing "triangulacion..." test | ✅ COMPLIANT (no new test needed — structurally unreachable) |
| Venta-level clamp (`Decimal.min`) unchanged | static diff inspection | n/a (no behavior change to assert) | ✅ COMPLIANT |

**Compliance summary**: 7/7 design items compliant.

### Correctness (Static Evidence, file:line)
| Item | Status | Notes |
|---|---|---|
| `ventaDeltaReal` derivation (L1991) | ✅ | `nuevoSaldoFactura.minus(saldoPendActual)`, reads the ALREADY-clamped venta delta from L1990's unchanged `Decimal.min` — no re-derivation, no deviation from design D1. |
| Used for client balance increment (L2039) | ✅ | `saldoActual.plus(ventaDeltaReal)` — was `montoUsd`. |
| Used for `calcularSaldoPendienteClienteNuevo` (L2044) | ✅ | 2nd arg `ventaDeltaReal` — was `montoUsd`. |
| Used for `movimientos_cuenta` INSERT `monto` (L2076) | ✅ | `toStorageString(ventaDeltaReal)` — was `toStorageString(montoUsd)`. |
| Guard (L2023) | ✅ | `else if (ventaDeltaReal.gt(0))` replaces bare `else` — entire client block skipped, not just internally no-op'd. Avoids `CHECK monto>0` violation on `movimientos_cuenta`. |
| Venta-level clamp (L1990) | ✅ | `Decimal.min(totalFactura, saldoPendActual.plus(montoUsd))` — byte-identical to pre-change code, confirmed via diff (no `-`/`+` on this line). |
| `registrarAbonoGlobal`/`registrarPagoFactura` (forward path) | ✅ | Absent from diff — `git diff --stat` shows only `reversarPagoEnTx`'s line range touched in `use-cxc.ts`. |
| Decimal hygiene | ✅ | All math via `.minus/.plus/.min/.gt` on `Decimal` instances; `toStorageString` only at serialization boundary; no `parseFloat`/`Number()` introduced. |
| SAF path (L2015, `if (generatedLote)`) | ✅ | Structurally precedes the `else if` reading `ventaDeltaReal` — SAF pagos (`venta_id=null` by construction) never execute Step 3's `if (pago.venta_id)`, so `ventaDeltaReal` stays at its unread default. |
| Scope | ✅ | Only `use-cxc.ts` (+21/-5) + its test (+273) in the code diff. `.atl/skill-registry.*` changes in working tree are pre-existing unrelated housekeeping (confirmed via diff content: skill-registry cache fingerprint + newly-installed skills list, unrelated to this fix) — must be excluded when staging the PR1 commit. |

### Coherence (Design)
| Decision | Followed? | Notes |
|---|---|---|
| D1 (ventaDeltaReal, not raw montoUsd, not SUM(ventas) live) | ✅ Yes | Exact formula match, zero new queries. |
| D2 (guard monto<=0, skip insert+update entirely) | ✅ Yes | `else if (ventaDeltaReal.gt(0))`, test asserts calls absent. |
| D5 no-false-positive proof (SAF branch untouched) | ✅ Yes | Confirmed structurally unreachable, pre-existing test still covers it. |

### Issues Found
**CRITICAL**: None.

**WARNING**: None blocking. Working tree contains pre-existing unrelated `.atl/skill-registry.*` diffs from before this branch was cut — must explicitly scope `git add` to `use-cxc.ts` + its test file when staging PR1 (do not use `git add -A`).

**SUGGESTION**: Theoretical edge case (not a regression, not a blocker): if `totalFactura < saldoPendActual` due to pre-existing drift (the exact corruption Unit B's reconciliation migration targets), `nuevoSaldoFactura` clamps to `totalFactura` and `ventaDeltaReal` goes negative, so the client-level branch is skipped entirely — no correction is applied in that corrupted-data case. This is strictly safer than the old behavior (which would have added raw `montoUsd` regardless, worsening the drift), and is expected to self-resolve once Unit B's reconciliation migration lands. No action needed for PR1.

### Test Integrity Assessment
Tests are non-vacuous: independently reproduced (not just trusted the apply's self-report) that TC1 and TC4 fail with the EXACT pre-fix values ($2.00000000, $70.00000000) predicted by the bug report, by stashing only the production file and re-running the scoped test command, then restoring and confirming 6/6 green again.

### Verdict
**PASS**

Unit A's clamp implementation matches the design formula exactly in all 3 required write sites (client balance, saldo_pendiente mirror, movimientos_cuenta monto), the guard correctly skips the entire client-level block (not just a partial no-op) on delta<=0, the global fan-in regression risk (the #1 concern for this review) is correctly handled and tested with a sum-of-clamped-deltas assertion, the SAF path is structurally unreachable by the new code, the venta-level clamp and forward abono paths are confirmed untouched by diff inspection, and the tests are independently verified non-vacuous via pre-fix reproduction. PR 1 (app clamp + tests) is ready to commit/push as scoped, excluding the unrelated `.atl/*` working-tree noise.
