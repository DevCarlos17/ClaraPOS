# Verify Report: Recibo Moneda de Presentación — Work Unit 3 (FINAL)

**Change**: `recibo-moneda-presentacion`
**Slice**: Work Unit 3 (PDF article table parity, 2x-work spot) — PR 3 of 3, **final slice**
**Version**: spec.md (current, uncommitted-to-archive)
**Mode**: Strict TDD (wrong-oracle history — all values independently hand-computed, not trusted from green)
**Branch**: `feat/recibo-moneda-presentacion-wu3`
**Commit**: `1a762bf` — "feat(ventas): render both currencies in recibo PDF article table"
**Date**: 2026-08-14
**Model**: anthropic/claude-sonnet-5

Adversarial, fresh-context verification. I did not write this code and distrust the "407/407
green" claim by default. Every monetary string asserted by the new tests was independently
recomputed by hand from `src/lib/currency.ts` before comparing to the assertion. I also
**physically reverted** the 2-line source fix and re-ran the new tests to confirm RED, then
restored the fix — not inferred from narrative.

---

## 1. Test Suite Execution

```text
$ yarn test:run
 Test Files  29 passed (29)
      Tests  407 passed (407)
      Duration  89.53s (reproduced independently on this branch, working tree clean)
```

```text
$ yarn type-check:test
$ tsc --noEmit --project tsconfig.test.json
Done in 39.13s.   (0 errors)
```

**Result**: ✅ 407/407 passed, matches claim exactly. Type-check clean.

---

## 2. Parity — the whole point of WU3 (verified for real)

Read both render paths directly:

**Text/PNG** (`construirLineasRecibo`, `factura-export.ts` L402-408):
```ts
const precioUnitario = formatMontoBimonetario(linea.precioUnitarioUsd, linea.precioUnitarioBs, recibo.monedaPresentacion)
const total = formatMontoBimonetario(linea.totalUsd, linea.totalBs, recibo.monedaPresentacion)
```

**PDF** (`buildReciboPdfBlob` `artBody`, `factura-export.ts` L523-524):
```ts
formatMontoBimonetario(linea.precioUnitarioUsd, linea.precioUnitarioBs, recibo.monedaPresentacion),
formatMontoBimonetario(linea.totalUsd, linea.totalBs, recibo.monedaPresentacion),
```

**Finding**: The two call sites are **byte-identical function invocations** — same helper
(`formatMontoBimonetario`), same source values (`linea.precioUnitarioUsd/Bs`, `linea.totalUsd/Bs`
from the shared `ReciboLinea`, computed once in `buildReciboData`), same currency-order argument
(`recibo.monedaPresentacion`). There is no way for these two paths to diverge — they call the
exact same pure function with the exact same arguments. **PARITY CONFIRMED**, not approximated.

Column layout unchanged: PDF head is still `['Codigo', 'Producto', 'Cant.', 'P.Unit', 'Subtotal']`
(5 columns, same as before WU3) — no `autoTable` layout break.

---

## 3. Oracle Math — independently recomputed, not trusted

Fixture: `precioUnitarioUsd = 10.00`, `tasa = 500`.

- `usdToBs(10, 500) = 10 × 500 = 5000` (confirmed via `currency.ts` L60-62: `usd.times(tasa)`, no division).
- `formatUsd(10)` → `$10.00` (2 view decimals, `currency.ts` L109-116).
- `formatBs(5000)` → intPart `"5000"`, thousands-grouped from the right → `"5.000"`, decPart `"00"` → `Bs. 5.000,00` (`currency.ts` L119-126, dot-thousands/comma-decimal).

| Orientation | Expected (hand-computed) | Test asserts (`factura-export.test.ts` L594-595, L628-629) | Match |
|---|---|---|---|
| `'USD'` primary, unit price | `$10.00 (Bs. 5.000,00)` | `'$10.00 (Bs. 5.000,00)'` | ✅ |
| `'USD'` primary, line total | `$10.00 (Bs. 5.000,00)` | `'$10.00 (Bs. 5.000,00)'` | ✅ |
| `'BS'` primary, unit price | `Bs. 5.000,00 ($10.00)` | `'Bs. 5.000,00 ($10.00)'` | ✅ |
| `'BS'` primary, line total | `Bs. 5.000,00 ($10.00)` | `'Bs. 5.000,00 ($10.00)'` | ✅ |

Zero discrepancy. Not a divided, inverted, or mis-formatted value in either orientation.

---

## 4. Tasa Direction

`artBody` (L523-524) reads `linea.precioUnitarioBs` / `linea.totalBs` **directly off the
already-built `ReciboLinea`** (computed once in `buildReciboData`, L210/212, via
`usdToBs(precioUnitarioUsd, input.tasa)` — multiplication, never division). The PDF path performs
**no re-computation** of Bs — it consumes the precomputed pair, structurally eliminating the risk
of an inverted (`bsToUsd`-shaped) value being introduced independently in the PDF path.

**No division found. No inversion risk.**

---

## 5. Backward Compatibility

With `'USD'` default (toggle omitted), the USD figure format is unchanged (`formatUsd` output
identical to pre-WU3: `$10.00`). The only change is the **added** `(Bs. 5.000,00)` counterpart —
purely additive, matches the design's stated backward-compat contract ("new content is additive —
it did not exist before, so it cannot regress"). Column count/order in the PDF `autoTable` call
unchanged (still 5 columns, same head, same `columnStyles`).

---

## 6. Test Teeth — physically verified, not inferred

I reverted `factura-export.ts` to the pre-WU3 commit (`190c710`, PR #37 merge) and re-ran only the
2 new tests:

```text
$ git checkout 190c710 -- src/features/ventas/utils/factura-export.ts
$ yarn vitest run factura-export.test.ts -t "WU3"
 FAIL  ... con moneda "USD" (default) ...
   - "$10.00 (Bs. 5.000,00)"
   + "$10.00"
 FAIL  ... con moneda "BS" ...
   - "Bs. 5.000,00 ($10.00)"
   + "$10.00"
 Tests  2 failed | 65 skipped (67)
```

Both tests **genuinely fail** against pre-WU3 code (single-currency `artBody`, still uses
`formatUsd` only). This is real RED evidence, not a proxy — restored the fix afterward
(`git checkout HEAD -- ...`) and reconfirmed 407/407 green.

**Result**: ✅ Tests have real teeth. Not worthless-green.

---

## 7. Scope Discipline

```text
$ git diff develop...HEAD --stat
 openspec/changes/recibo-moneda-presentacion/tasks.md                              | 10 ++--
 src/features/ventas/utils/__tests__/factura-export.test.ts                        | 70 ++++++++++++++
 src/features/ventas/utils/factura-export.ts                                        |  4 +-
 3 files changed, 77 insertions(+), 7 deletions(-)
```

- Exactly the 3 files claimed: source (2 lines changed, confirmed via source diff — pure
  `formatUsd(...)` → `formatMontoBimonetario(...)` substitution, no other lines touched),
  test file (+70 lines, 2 new tests only), `tasks.md` (checkbox + note updates for 3.1/3.2/4.1-4.3).
- Text/PNG path (`construirLineasRecibo`): **unchanged** in this diff (was already fixed in WU2).
- `construirFilasTotales` (totals): **unchanged** in this diff (WU2 scope).
- Config UI (`company-data-form.tsx`): **not touched** (WU1 scope).
- No `.atl/` noise, no stray `verify-report-*.md` pre-committed by the apply phase (this WU3
  report and the WU1/WU2 reports found on disk are pre-existing artifacts from prior verify runs,
  untracked — not part of the WU3 commit diff).

**Result**: ✅ Scope strictly limited to the claimed 2x-work fix.

---

## 8. Feature-Completeness Sanity (WU1+WU2+WU3 combined, final slice)

For a receipt with `monedaPresentacion = 'BS'`, checked every section:

| Section | Bimonetary? | Toggle-aware? | Evidence |
|---|---|---|---|
| Article lines (unit price + total) | ✅ Yes | ✅ Yes | `construirLineasRecibo` L402-408 (text/PNG) + `artBody` L523-524 (PDF, this WU) — both via `formatMontoBimonetario` |
| Intermediate totals (Exento, Base Imponible, IVA%, TOTAL FACTURA pre-IGTF, IGTF) | ✅ Yes | ✅ Yes | `construirFilasTotales` L312-346 via `formatMontoBimonetario`, shared by text/PNG (L412) and PDF (L540) |
| Final bold totals (TOTAL FACTURA no-IGTF / TOTAL + IGTF) | ✅ Yes | ➖ Fixed format (by design, spec-scoped out of toggle) | `construirFilasTotales` L348/354 — `` `${formatUsd} / ${formatBs}` ``, deliberately NOT toggled per design decision, preserves backward compat |
| Payments | ✅ Yes | ➖ N/A — native currency always primary, independent of toggle (spec requirement) | `formatMontoPago` L285-289 |
| Cierre (vuelto/SAF/crédito/etc.) | ✅ Yes | ➖ Fixed `Bs (USD)` order, pre-existing/out of scope | `formatearCierre` L363-364, untouched across all 3 WUs |

**No gap found.** Every monetary line in the receipt shows both currencies across all 3 render
paths (text, PNG, PDF), consistent with the spec's "Ambas monedas siempre visibles" requirement.
The 2 areas that are NOT toggle-aware (final bold totals, cierre) are **explicit, spec-justified
design exclusions** documented in `design.md`, not omissions — cierre's format was never in
this change's requirement scope (spec.md coordination note: this change "ADDS bimonetary display
only... does NOT reorder totals rows... nor change payment grouping").

---

## 9. Spec Compliance Matrix (WU3-relevant scenario)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Ambas monedas siempre visibles en montos del recibo | Línea de artículo... PDF y texto/PNG, mismos valores en ambas rutas | `factura-export.test.ts` L566-635, "paridad: PDF vs texto en linea de articulos (WU3)" | ✅ COMPLIANT |
| Moneda primaria y contraparte | Bs primero en 'BS', USD primero en default — misma línea, ambas direcciones | Same 2 tests, both orientations | ✅ COMPLIANT |

**Compliance summary**: 2/2 WU3-relevant scenarios compliant. Combined with WU1 (5/5, PASS) and
WU2 (5/5, PASS) verify reports on disk: full spec now compliant end-to-end.

---

## 10. TDD Compliance

`apply-progress` (engram #1634) documents RED→GREEN for task 3.1/3.2 in narrative form (not the
formal RED/GREEN/TRIANGULATE/SAFETY NET table) — same documented gap flagged as WARNING in the
WU2 verify report, still present. Substance confirmed independently in Section 6 above (physical
revert + re-run), which is stronger evidence than the table format itself would provide.

No shared-builder extraction was needed — confirmed by reading `artBody`'s construction: it
remains inline inside `buildReciboPdfBlob`, no new exported function. The existing
`vi.mock('jspdf-autotable', ...)` spy (from WU2) already made `artBody`'s content inspectable via
`mockedAutoTable.mock.calls[0][1].body` without extraction. Claim of "no builder extraction"
confirmed accurate.

---

## 11. Assertion Quality

Both new tests: call real production code (`buildReciboPdfBlob`, `buildReciboTextoPlano`), assert
specific non-trivial string values (not type-only, not tautological, not smoke-test-only), and
each test also cross-checks the text-path output in the same test body (`expect(texto).toContain(...)`)
— a real triangulation within a single test rather than a lone assertion. No mock/assertion ratio
concern (1 `vi.mocked` spy read, 2 `expect` calls per test).

**Assertion quality**: ✅ All assertions verify real behavior (0 CRITICAL, 0 WARNING).

---

## Issues Found

**CRITICAL**: None.

**WARNING**:
1. (Carried over from WU2, unresolved) `apply-progress` still does not use the formal "TDD Cycle
   Evidence" table format expected by the strict-tdd-verify module — narrative format instead.
   Substance is present and independently verified here (Section 6), not blocking.

**SUGGESTION**: None new for WU3.

---

## Verdict

**PASS**

WU3's claimed 2-line fix is exactly what's in the diff. PDF/text parity is real and structural
(identical function calls, not approximated formatting). Oracle math independently recomputed and
matches exactly in both orientations for unit price and line total. Tasa direction correct
(consumes precomputed `usdToBs` values, no re-computation/inversion risk). Backward-compat is
purely additive. The 2 new tests were physically proven to fail against pre-WU3 code (real RED,
not inferred). Scope strictly limited to the claimed files. 407/407 tests green (reproduced),
type-check clean. Feature-completeness sanity across all 3 work units combined: no gap found —
every monetary section is bimonetary; the 2 sections that stay in fixed format (final bold totals,
cierre) are explicit spec-scoped design exclusions, not omissions.

**This SDD change (`recibo-moneda-presentacion`) is feature-complete across WU1+WU2+WU3 and ready
for archive**, contingent on WU3's PR opening/merging per the stacked-to-main chain (out of this
verify phase's scope — orchestrator handles PR/merge).
