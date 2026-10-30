# Verification Report

**Change**: fix-trigger-saldo-actual
**Migration**: `migrations/0119_fix_trigger_saldo_actual_y_reconciliacion.sql`
**Branch**: `feat/fix-trigger-saldo-actual-0119` (off `origin/develop@6ef15cbb`)
**Mode**: Standard (no Postgres test runner; verified by close reading + algebraic proof + independent Python simulation of the exact SQL CASE logic)

## Verdict

**FAIL**

The migration fixes the originally-reported bug (`saldo_actual` staleness on PAG/REV cycles) but **introduces a new, more severe sign-flip bug** in the `saldo_actual` formula for the `SAF`/`SAFR`/`SAFV` branch. This corrupts `saldo_actual` by **2×monto in the wrong direction** on every future SAF-credit-consuming movement — exactly the "SAF client" regression risk this verification was asked to check for. SAF is one of the most actively developed features in this codebase (dozens of `feat/saf-*` branches), so this would corrupt live financial data broadly and immediately upon deployment to production. **Do not apply to production as-is.**

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 18 |
| Tasks complete | 16 |
| Tasks incomplete | 2 (5.2 staging dry-run, 5.3 prod apply — correctly left for the owner; no Postgres test infra in-repo) |

## Trigger Body Fidelity (Check 1)

Compared `migrations/0119` byte-for-byte against the real post-0118 body on `origin/develop` (not the design's paraphrase):

| Block | 0118 (develop) lines | 0119 lines | Identical? |
|---|---|---|---|
| `saldo_nuevo` IF/ELSIF (FAC/NDB, PAG/NCR, SAF/SAFV assertion, REV assertion) | 216–250 | 189–226 | ✅ Byte-identical (comment-only diffs) |
| `saf_disponible` CASE | 266–270 | 272–276 | ✅ Byte-identical |
| `saldo_pendiente_usd` CASE | 275–279 | 281–285 | ✅ Byte-identical, and correctly **excludes SAFV** from the debt-reduction branch — matches real `0115` code, not the design doc's incorrect paraphrase (confirmed independently against `migrations/0115_add_safv_tipo_movimientos_cuenta.sql` lines 175–179). |
| REV assertion disposition | 237–249 | 210–225 | ✅ Kept byte-identical; purpose correctly re-documented as audit-trail-only (no longer governs `saldo_actual`). |

**Verdict: PASS.** Nothing was accidentally dropped or altered outside the intended `saldo_actual` change.

## Algebraic Proof — saldo_actual Formula (Check 2) — **CRITICAL FAIL**

Target (canonical, per design): for any non-SAL movement, `act_new = act_old + Δpend − Δsaf`, where `Δpend = pend_new − pend_old` and `Δsaf = saf_new − saf_old`, so that `act_new = pend_new − saf_new` is preserved by induction from `act_old = pend_old − saf_old`.

Transcribing migration 0119 lines 254–270 exactly:

```sql
saldo_actual = CASE
  WHEN NEW.tipo = 'SAL' THEN NEW.saldo_nuevo
  ELSE
    saldo_actual
    + (CASE WHEN NEW.tipo IN ('FAC','NDB','REV') THEN NEW.monto
            WHEN NEW.tipo IN ('PAG','NCR','SAF') THEN GREATEST(0, saldo_pendiente_usd - NEW.monto) - saldo_pendiente_usd
            ELSE 0 END)
    - (CASE WHEN NEW.tipo = 'SAFC' THEN NEW.monto
            WHEN NEW.tipo IN ('SAF','SAFR','SAFV') THEN saf_disponible - GREATEST(0, saf_disponible - NEW.monto)
            ELSE 0 END)
END
```

- The `Δpend` bracket (`FAC/NDB/REV`, `PAG/NCR/SAF`) is written as `(new − old)` — **correct**, matches the sibling `saldo_pendiente_usd` CASE exactly, and is proven correct below.
- The `Δsaf` bracket for `SAFC` is written as `+monto` = `(new − old)` — **correct** (same convention).
- The `Δsaf` bracket for **`SAF`/`SAFR`/`SAFV`** is written as `saf_disponible − GREATEST(0, saf_disponible − monto)` = **`(old − new)`**, i.e. **`−Δsaf`**, not `Δsaf`. Because the outer formula does `− (bracket)`, this becomes `− (−Δsaf) = +Δsaf`, flipping the sign. The resulting formula for these three tipos is `act_new = act_old + Δpend + Δsaf` instead of the required `act_new = act_old + Δpend − Δsaf` — an error of exactly `2·Δsaf` on every SAF-credit-consuming movement.

**Independent verification** (Python simulation transcribing the SQL CASE logic verbatim, not my manual arithmetic):

| Case | pend_new | saf_new | `act_new` (0119, as written) | Canonical (`pend_new − saf_new`) | Result |
|---|---|---|---|---|---|
| SAFC create $100 credit | 0 | 100 | **-100.00** | -100.00 | ✅ OK |
| SAF pays $30 of a $30 invoice using credit | 0 | 70 | **-130.00** | -70.00 | ❌ **BUG, diff = -60** |
| SAFR cancels $100 remnant credit | 0 | 0 | **-200.00** | 0.00 | ❌ **BUG, diff = -200** |
| SAFV applied as payment at POS ($100 of credit) | 50 | 0 | **-150.00** | 50.00 | ❌ **BUG, diff = -200** |
| FAC $50 (sanity) | 50 | 0 | 50.00 | 50.00 | ✅ OK |
| PAG $50 (sanity) | 0 | 0 | 0.00 | 0.00 | ✅ OK |

`FAC`, `NDB`, `PAG`, `NCR`, `REV`, `SAFC`, and `SAL` (via the absolute anchor branch) are all algebraically correct. **`SAF`, `SAFR`, `SAFV` are broken** — these are precisely the three "credit consumption" tipos, i.e. every path where a client's SAF-a-favor balance is actually drawn down (abono global vía SAF, pago de factura con SAF, SAF aplicado como método de pago en una venta POS, anulación de remanente SAF).

**Fix**: flip the `SAF/SAFR/SAFV` bracket to match the `new − old` convention already used everywhere else in the same CASE:
```sql
-- WRONG (as shipped):
WHEN NEW.tipo IN ('SAF','SAFR','SAFV') THEN saf_disponible - GREATEST(0, saf_disponible - NEW.monto)
-- CORRECT:
WHEN NEW.tipo IN ('SAF','SAFR','SAFV') THEN GREATEST(0, saf_disponible - NEW.monto) - saf_disponible
```
(Re-verified algebraically and via the same Python simulation: this flip makes all 6 cases above match canonical exactly.)

## SAF-Safety Verdict (Check 4) — **CRITICAL FAIL**

This is the #1 regression risk flagged in the verification brief, and it is confirmed broken. Any client with `saf_disponible > 0` (saldo a favor) who then has a `SAF`, `SAFR`, or `SAFV` movement posted will get `saldo_actual` corrupted by `2×monto` in the direction of *more apparent debt / less favor* than reality. Given `saf_disponible` and `saldo_pendiente_usd` are themselves computed by unchanged, correct CASE expressions, only `clientes.saldo_actual` (the display/netted column) is corrupted — but it is corrupted on **every single SAF-consuming movement going forward**, not just historical drift. The migration's own reconciliation (Part 2) will paper over this once at migration time, but the very next SAF/SAFR/SAFV insert re-corrupts it.

## Four-Step Repro Verdict (Check 5) — PASS (but incomplete coverage, see below)

The owner's TC1 repro (`FAC → PAG → REV → PAG → REV`, cliente de prueba 8) uses only `FAC`, `PAG`, `REV` — none of which touch the buggy `SAF/SAFR/SAFV` branch. Walking it through the (correct) `FAC/PAG/REV` logic: step 1→`act=1`, step 2 (PAG)→`act=0`, step 3 (REV)→`act=1`, step 4 (PAG, abono CxC)→`act=0` (bug fixed, was 1 pre-0119), step 5 (REV)→`act=1` (bug fixed, was 2 pre-0119). **This repro genuinely passes.** However, this is exactly *why* the SAF sign-flip bug escaped detection: the confirmatory test for the primary bug happens to never cross paths with the newly-introduced secondary bug. The included dry-run block TC2 only exercises `SAFC` (credit *creation*, which is correct); **no TC block exercises `SAF`, `SAFR`, or `SAFV` credit *consumption*** — the exact branch that is broken.

## All-Tipos Walkthrough (Check 3)

| Tipo | Δpend branch | Δsaf branch | Verdict |
|---|---|---|---|
| FAC | `+monto` | `0` | ✅ Correct |
| NDB | `+monto` | `0` | ✅ Correct |
| PAG | `GREATEST(0,pend-monto)-pend` | `0` | ✅ Correct |
| NCR | `GREATEST(0,pend-monto)-pend` | `0` | ✅ Correct |
| REV | `+monto` | `0` | ✅ Correct |
| SAFC | `0` | `+monto` | ✅ Correct |
| **SAF** | `GREATEST(0,pend-monto)-pend` | `saf-GREATEST(0,saf-monto)` (sign-flipped) | ❌ **CRITICAL** |
| **SAFR** | `0` | `saf-GREATEST(0,saf-monto)` (sign-flipped) | ❌ **CRITICAL** |
| **SAFV** | `0` | `saf-GREATEST(0,saf-monto)` (sign-flipped) | ❌ **CRITICAL** |
| SAL | absolute anchor (`NEW.saldo_nuevo`) | n/a | ✅ Correct, anchor preserved (verified via TC3 trace: SAL $500 + FAC $100 → 600, not 100) |

## Reconciliation — Two Independent Drift Checks (Check 6)

Confirmed genuinely independent (`OR`, not a shared delta) — fixes 0118's blind spot exactly:
- (a) `saldo_pendiente_usd` vs `SUM(ventas.saldo_pend_usd) WHERE status != 'ANULADA' AND tipo != 'SALDO_INICIAL'` — the added `tipo != 'SALDO_INICIAL'` filter correctly fixes an independent latent bug in 0118 (confirmed against `use-importar-cxc.ts`'s SAL-import synthetic-venta behavior).
- (b) `saldo_actual` vs `deuda_real + SUM(movimientos_cuenta WHERE tipo='SAL').monto − saf_disponible` — this formula is **computed independently from ground truth** (ventas + movimientos_cuenta + the *already-correct* `saf_disponible` column), not via the buggy trigger logic, so the reconciliation target itself is algebraically sound. Verified against TC2 (SAFC-only, -100) and TC3 (SAL anchor + FAC, 600) by hand-trace — both correct.

**Caveat**: Because reconciliation computes `saldo_actual` from ground truth once, at migration time, it will correctly repair the existing staging drift (clientes 6 and 8) — but it does **nothing** to prevent the new sign-flip bug from re-corrupting `saldo_actual` on the very next `SAF`/`SAFR`/`SAFV` insert after the migration runs. This is a one-time fix for old damage sitting in front of an active bug that will keep generating new damage.

**Verdict: PASS** for the reconciliation mechanism itself; **CRITICAL** carries forward from the trigger bug it cannot prevent going forward.

## Reconciliation Idempotency (Check 7)

Mathematically sound: both checks recompute an absolute target from ground truth (not a shared delta), so a second run with no intervening writes finds `ABS(drift) ≤ 0.005` for both checks on every row → 0 rows corrected. **Verdict: PASS**, conditioned on no intervening `movimientos_cuenta` inserts between the two runs (expected and documented behavior, not a flaw — any SAF/SAFR/SAFV insert between runs will correctly re-trigger a correction, which is the intended safety net, not an idempotency violation).

## Immutability (Check 8)

```
grep -n "INSERT INTO movimientos_cuenta\|UPDATE movimientos_cuenta\|DELETE FROM movimientos_cuenta" migrations/0119_fix_trigger_saldo_actual_y_reconciliacion.sql
→ (no matches in executable SQL; all INSERTs referencing movimientos_cuenta appear only inside commented-out dry-run blocks after COMMIT, lines 364-491, every line prefixed `--`)
```
**Verdict: PASS.** Zero writes to `movimientos_cuenta` anywhere in the executable transaction. Both the trigger (writes only `clientes`, fires on an INSERT the *caller* makes elsewhere) and the reconciliation (direct `UPDATE clientes`) respect the immutable-ledger invariant.

## set_config Channel + Multi-Tenant (Check 9)

Reconciliation wraps its `UPDATE clientes` with `PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE)` (line 303) — the same official bypass channel the trigger itself uses. All CTEs (`deuda`, `sal`, `objetivo`, `drift`) join on `empresa_id` alongside `cliente_id` (lines 184/188/194/307-309/319/323-324/327/331/335-336). **Verdict: PASS.**

## REV Assertion Disposition (Check 10)

Kept byte-identical to 0118 (lines 210-225 vs 0118's 237-249). Correctly re-documented: it no longer governs `clientes.saldo_actual` (which now reads live deltas for REV), it exclusively defends the immutable audit column `movimientos_cuenta.saldo_nuevo`. No false-positive risk introduced — the assertion's condition (`saldo_nuevo = saldo_anterior + monto`) is unrelated to how `saldo_actual` is now computed. **Verdict: PASS.**

## Ordering / Transaction Safety (Check 11)

Single `BEGIN;...COMMIT;` wraps both Part 1 (trigger replace) and Part 2 (reconciliation) — any failure in either part rolls back the whole migration atomically. Part 1 (trigger fix) precedes Part 2 (reconciliation) in file order, as the header explains for defense-in-depth against a hypothetical concurrent insert window, even though the reconciliation's direct `UPDATE clientes` never actually goes through the trigger. **Verdict: PASS** (ordering is safe, though its stated rationale is moot given reconciliation bypasses the trigger entirely — a documentation nuance, not a defect).

## Scope (Check 12)

```
git status --porcelain
 M .atl/.skill-registry.cache.json      <- unrelated tooling noise (skill registry), not part of this change
 M .atl/skill-registry.md                <- unrelated tooling noise
 M migrations/README.md                  <- in scope, 2-line addition documenting 0118+0119
?? migrations/0119_...sql                <- the migration itself
?? openspec/changes/fix-trigger-saldo-actual/   <- design.md, tasks.md, this report
```
No other migration file, no app code (`src/`) touched. The `.atl/` changes are incidental session tooling state unrelated to this SQL change — **flag as SUGGESTION to exclude from the PR diff**, not a scope violation of the migration itself.

---

## Issues Found

**CRITICAL**:
1. `saldo_actual` CASE in `migrations/0119` (lines 264-269) has a sign-flip bug in the `SAF`/`SAFR`/`SAFV` branch: the bracket is written `old − new` instead of `new − old`, causing the outer `−(bracket)` to add instead of subtract `Δsaf`. Net effect: every SAF-credit-consuming movement (SAF pago de factura, SAFR anulación de remanente, SAFV aplicado en venta POS) corrupts `clientes.saldo_actual` by `2×monto` in the wrong direction, immediately and permanently, starting from the first such movement after this migration is applied. Confirmed by independent Python simulation of the exact SQL logic (not just manual arithmetic). This is the exact "SAF client" regression the verification brief asked to rule out, and it is present. **Must not ship to production in current form.**

**WARNING**: None beyond the critical finding above (all other checks passed).

**SUGGESTION**:
1. Remove the unrelated `.atl/.skill-registry.cache.json` / `.atl/skill-registry.md` changes from this branch/PR — they're session tooling artifacts, not part of the SQL migration, and will add noise to review.
2. Once the sign is fixed, add a 6th dry-run block (`TC6`) exercising `SAF` (pay invoice with credit) and `SAFV` (apply credit at POS) consumption specifically, mirroring the Python table above — TC2 alone (SAFC creation only) is insufficient coverage for this formula's most error-prone branch and is exactly what let this bug through.

---

## Manual Staging Steps the Owner MUST Run (unchanged list, but now gated on the fix above)

Do **NOT** run any of these against staging until the sign-flip fix is applied and this report is re-run. Once fixed, the file's existing in-file `BEGIN;...ROLLBACK;` blocks are correctly structured and should be run in this order:
- **TC1** (lines 364-414): exact 4-step repro — `FAC→PAG→REV→PAG→REV`, expects step 3→0, step 4→1.
- **TC2** (lines 416-430): `SAFC` credit creation, no deuda — expects `saldo_actual=-100`.
- **TC3** (lines 432-455): `SAL $500` anchor + `FAC $100` — expects `saldo_actual=600`, anchor preserved.
- **TC4** (lines 457-469): reconciliation idempotency — drift+20, run twice, 2nd run reports 0 corrected.
- **TC5** (lines 471-491): REV assertion still rejects inconsistent `saldo_nuevo` with `P0001`.
- **Missing, must be added before sign-off**: a `TC6` exercising `SAF`/`SAFR`/`SAFV` consumption (per the SUGGESTION above) to positively confirm the fix once applied.

**Is running 0119 on staging (which already has 0118 applied) safe/ordered correctly?** Structurally yes — 0119's `CREATE OR REPLACE FUNCTION` correctly starts from the verified post-0118 body, and the reconciliation's `set_config` bypass channel and `empresa_id` filtering are correct. But applying 0119 **as currently written** to staging or production would fix the old `saldo_actual` drift once and then immediately start corrupting `saldo_actual` again on the next SAF-consuming movement — **do not apply until the CRITICAL finding is fixed.**

---

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| Preserve byte-identical trigger body outside intended change | ✅ Confirmed | Checks 1, 10 |
| `saldo_actual` self-heals in vivo (no stale app snapshot) | ⚠️ Partially correct | Correct for FAC/NDB/PAG/NCR/REV/SAFC/SAL; broken for SAF/SAFR/SAFV |
| SAL legacy anchor preserved | ✅ Confirmed | TC3 trace, formula check |
| Two independent drift checks in reconciliation | ✅ Confirmed | Check 6 |
| Reconciliation idempotent | ✅ Confirmed | Check 7 |
| `movimientos_cuenta` immutability | ✅ Confirmed | Check 8, grep evidence |
| Multi-tenant `empresa_id` isolation in reconciliation | ✅ Confirmed | Check 9 |
| REV assertion repurposed correctly, no false positives | ✅ Confirmed | Check 10 |
| SAF-favor clients not broken by the fix | ❌ **Broken** | Checks 2, 4 — CRITICAL |
| Owner's 4-step repro fixed | ✅ Confirmed | Check 5 (but doesn't exercise the broken branch) |

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Relative delta formula (not absolute) to preserve SAL anchor | ✅ Yes | Correctly implemented for the anchor case |
| Reuse existing CASE deltas, don't invent new formulas | ⚠️ Partially | Reused correctly for Δpend; a NEW (and wrong) delta expression was introduced for the SAF/SAFR/SAFV Δsaf branch instead of reusing the `saf_disponible` CASE's own `new−old` shape consistently |
| Two independent drift checks (not shared delta) | ✅ Yes | |
| REV assertion kept, repurposed | ✅ Yes | |
| Design's `saldo_pendiente_usd` paraphrase (incorrectly included SAFV) corrected against real code | ✅ Yes | Apply phase caught and fixed this correctly — ironic that the Δsaf branch introduced a *new* bug of its own while fixing the design's paraphrase bug |

### Verdict

**FAIL** — one CRITICAL finding (SAF/SAFR/SAFV sign-flip in the `saldo_actual` formula) corrupts live financial balances for every future SAF-credit-consuming movement. The fix is a one-line sign correction (swap operand order in the `SAF/SAFR/SAFV` Δsaf bracket to `new − old`), but as shipped this migration is **not safe to apply to staging or production**.
