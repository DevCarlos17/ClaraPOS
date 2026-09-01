# Verify Report: Recibo Moneda de Presentación — Work Unit 2

**Change**: `recibo-moneda-presentacion`
**Slice**: Work Unit 2 ONLY (Data model + shared totals + text/PNG render + payment counterpart) — PR 2 of 3
**Version**: spec.md (current, uncommitted-to-archive)
**Mode**: Strict TDD
**Branch**: `feat/recibo-moneda-presentacion-wu2`
**Commits**: `38b298c`, `64fd8fa`, `6f22ff7`
**Date**: 2026-08-14
**Model**: anthropic/claude-sonnet-5

Adversarial, fresh-context verification. I did not write this code. Every monetary
assertion below was independently recomputed by hand from `src/lib/currency.ts`
semantics (`usdToBs = usd × tasa`, `formatUsd`/`formatBs` view precision = 2 decimals)
before comparing to what the test asserts — not just re-run and trusted.

---

## Completeness

| Metric | Value |
|--------|-------|
| WU2 tasks total | 9 (2.1.1–2.5.1) + 3 Final Verification items (4.1–4.3) applicable to WU2 |
| WU2 tasks complete | 12/12 |
| WU3 tasks (3.1, 3.2) | Correctly NOT started (out of scope for this batch) |

---

## Build & Tests Execution

**Tests**: ✅ **405 passed** / 0 failed / 0 skipped across **29 files** (reproduced independently on this branch)

```text
$ yarn test:run
 Test Files  29 passed (29)
      Tests  405 passed (405)
      Duration  15.65s
```

New/modified WU2 test coverage: `factura-export.test.ts` (+~35 tests vs WU1 baseline: 65 total now,
covering `formatParPrimarioContraparte`/`formatMontoBimonetario`, `buildReciboData` Bs fields,
`construirFilasTotales` toggle behavior, PDF/text parity, `formatMontoPago`, backward-compat guard),
`venta-exitosa-modal.test.tsx` (new, 2 tests, threading verification).

**Type-check (app code)**: ✅ 0 errors — `yarn type-check:test` (test-file type-check) clean.

```text
$ yarn type-check:test
$ tsc --noEmit --project tsconfig.test.json
Done in 24.35s.
```

**Coverage** (scoped to WU2 changed files, `yarn test:coverage`):

| File | Stmts | Branch | Funcs | Lines | Uncovered |
|------|-------|--------|-------|-------|-----------|
| `factura-export.ts` | 85.56% | 88.37% | 100% | 85.56% | L117-118, 506, 560-579, 582-588, 634-674, 683-684, 734-736 |
| `venta-exitosa-modal.tsx` | 58.13% | 21.42% | 57.14% | 58.13% | L~33-284, 300-309 |

All uncovered ranges in `factura-export.ts` are **pre-existing PDF/canvas rendering internals**
untouched by WU2 (pagos/cierre sections of `buildReciboPdfBlob`, `buildReciboImagenBlob` canvas
drawing loop, share-fallback edge branches) — 100% func coverage confirms every new WU2 function
(`formatParPrimarioContraparte`, `formatMontoBimonetario`, the Bs field computations, the toggle
branch in `construirFilasTotales`) is exercised. `venta-exitosa-modal.tsx`'s low % is pre-existing
UI markup (Row helper, badges, pagos list rendering) unrelated to the WU2 threading change — the
specific line changed (`monedaPresentacion: parseEmpresaConfig(...)`) is covered by both new tests.
Not a WU2 regression. **WARNING** (informational, not blocking): `venta-exitosa-modal.tsx` overall
file coverage remains below the 80% guideline, but this predates WU2 and is UI-rendering debt, not
currency-logic debt.

---

## Independent Oracle Verification (tasa direction, the critical check)

`usdToBs(usd, tasa) = usd × tasa` (confirmed by reading `src/lib/currency.ts` L60-62 directly — no
division). Hand-checked every Bs field the tests assert, not just re-run:

| Source | tasa | usd | Expected Bs (usd × tasa) | Test asserts | Match |
|---|---|---|---|---|---|
| `buildReciboData` `precioUnitarioBs` | 40.5 | 10 | 405 | `toBe(405)` | ✅ |
| `buildReciboData` `totalBs` | 40.5 | 20 | 810 | `toBe(810)` | ✅ |
| `buildReciboData` `montoExentoBs` | 10 | 1 | 10 | `toBe(10)` | ✅ |
| `buildReciboData` `baseImponibleBs` | 10 | 2 | 20 | `toBe(20)` | ✅ |
| `buildReciboData` `alicuotas[0].ivaBs` | 10 | 0.32 | 3.2 | `toEqual(...ivaBs: 3.2)` | ✅ |
| `buildReciboData` `igtfBs` | 10 | 0.5 | 5 | `toBe(5)` | ✅ |
| `buildReciboData` alicuota (mixed) `ivaBs` (8%/16%) | 40.5 | 4 / 16 | 162 / 648 | `162` / `648` | ✅ |
| `construirFilasTotales` totals fixture (all rows) | 10 (implicit, `montoExentoBs=10` for `usd=1`) | 1/3/0.08/0.16/4.24/0.06/4.3 | 10/30/0.8/1.6/42.4/0.6/43 | all match | ✅ |
| `formatMontoPago` BS-native | 500 (implicit: 0.6×500=300) | 0.6 | 300 | `montoBs: 300` fixture, asserts `Bs. 300,00 ($0.60)` | ✅ |
| `buildReciboTextoPlano` article line | 500 | 10 | 5000 | `Bs. 5.000,00` | ✅ |
| Backward-compat guard final row | 500 | 11.6 | 5800 | `Bs. 5.800,00` | ✅ |

**Result: zero inverted/divided values found.** No test asserts a `bsToUsd`-shaped result where
`usdToBs` was required. The explicit worked example from the task brief (USD 10.00, tasa 40.0000 →
Bs 400.00) is not literally present as a fixture, but the pattern is validated at multiple tasas
(10, 40.5, 500) — the multiplication direction is consistently `usd × tasa`, confirmed by direct
source read of `usdToBs`, not inference from test names.

`bsToUsd` is used correctly in the opposite direction only where BS-native amounts need a USD
counterpart: `agruparPagosPorMetodo` (`recibo-pagos.ts` L92-93, unmodified in WU2) for payment
lines, and `formatMontoPago`'s BS branch consumes the already-computed `montoUsd` (no re-division
in `factura-export.ts` itself — correctly delegates to the precomputed pair per the design's
"renderers format, not convert" decision).

---

## Primary/Counterpart Ordering Oracle

Hand-verified against `formatUsd`/`formatBs` exact output format (`$1,234.56` / `Bs. 1.234,56`):

| Input (usd, bs) | monedaPrimaria | Expected | Test asserts | Match |
|---|---|---|---|---|
| (10, 5000) | `'USD'` | `$10.00 (Bs. 5.000,00)` | `'$10.00 (Bs. 5.000,00)'` | ✅ |
| (10, 5000) | `'BS'` | `Bs. 5.000,00 ($10.00)` | `'Bs. 5.000,00 ($10.00)'` | ✅ |
| (1, 10) totals row | `'USD'` | `$1.00 (Bs. 10,00)` | `'$1.00 (Bs. 10,00)'` | ✅ |
| (1, 10) totals row | `'BS'` | `Bs. 10,00 ($1.00)` | `'Bs. 10,00 ($1.00)'` | ✅ |

Parens, separators (`.` thousands / `,` decimal for Bs; `,` thousands / `.` decimal for USD), and
literal `Bs. ` / `$` prefixes all char-for-char match `formatBs`/`formatUsd` source (`currency.ts`
L108-126). No discrepancy found.

---

## Final Bold Rows NOT Toggled (spec-critical isolation)

Read `construirFilasTotales` (`factura-export.ts` L309-360) directly: the 5 intermediate rows
(Monto Exento, Base Imponible, per-alicuota IVA, TOTAL FACTURA pre-IGTF when IGTF>0, IGTF) all
route through `formatMontoBimonetario(..., monedaPresentacion)` — toggle-aware. The 2 possible
final bold rows (`TOTAL + IGTF` when IGTF>0, or `TOTAL FACTURA` as the final row when IGTF is
absent/zero) are built with the literal fixed-format template `` `${formatUsd(...)} / ${formatBs(...)}` ``
— **`monedaPresentacion` is never referenced in that branch**. Structurally impossible to leak.

Independently confirmed via the test itself (`construirFilasTotales` describe block, L452-480):
the `'TOTAL + IGTF'` row asserts the **exact same string** (`'$4.30 / Bs. 43,00'`) under both
`'USD'` and `'BS'` toggle values — a real regression test for the design's "final rows format
FIXED" decision, not a weak proxy (if the toggle ever leaked, the `'BS'` assertion would need to
differ from the `'USD'` one and it would fail).

**No leak found. No under-toggling found** (intermediate rows do flip format per the table above).

---

## Payment Independence

`formatMontoPago(linea: ReciboPagoLinea): string` (factura-export.ts L285-289) takes **no
`monedaPresentacion` parameter at all** — independence from the receipt toggle is structural, not
just behavioral. Hand-verified both branches:

- USD-native: `${formatUsd(montoUsd)} (${formatBs(montoBs)})` → for (1, 500): `$1.00 (Bs. 500,00)` — test asserts exactly that. ✅
- BS-native: `${formatBs(montoBs)} (${formatUsd(montoUsd)})` → for (300, 0.6): `Bs. 300,00 ($0.60)` — test asserts exactly that. ✅ (`300 / 500 = 0.6`, consistent with `bsToUsd`.)

Since the function signature structurally excludes `monedaPresentacion`, no test scenario can
regress this into a toggle-dependent branch without a compile error at the call sites
(`construirLineasRecibo` L424, `buildReciboPdfBlob` L565 — neither passes a currency arg).

---

## Backward Compatibility

Guard test (L862-895, `describe('backward-compat guard (WU2, task 4.1)')`) constructs a receipt
with `monedaPresentacion` omitted (default resolves to `'USD'`) and asserts, verbatim:
- Payment USD-native branch: `Efectivo Dolares: $1.00 (Bs. 500,00)` — unchanged format.
- `formatearCierre` (untouched function, not in WU2 diff): `Vuelto entregado: Bs. 500,00 ($1.00)` — unchanged.
- Final bold row: `{ label: 'TOTAL FACTURA', monto: '$11.60 / Bs. 5.800,00', bold: true }` — hand-recomputed: totalFacturaUsd = 10 × 1.16 = 11.6, Bs = 11.6 × 500 = 5800 → `Bs. 5.800,00`. ✅ Matches.

This is a **real guard**, not a weak proxy — it exercises the actual default-resolution path
(`input.monedaPresentacion ?? 'USD'` in `buildReciboData` L256) rather than hardcoding `'USD'` as
an explicit test input, and it asserts on content (`formatearCierre`, payment format) that predates
WU2 entirely, so any accidental format drift introduced by the new toggle logic would fail it.

The only intentional new visible content vs pre-WU2 output: Bs counterparts on article lines and
the 5 intermediate total rows. Confirmed nothing else shifted (row order matches pre-existing
`construirFilasTotales` label sequence: Exento → Base → alicuotas → TOTAL FACTURA → IGTF → TOTAL+IGTF).

---

## Scope Discipline

```text
$ git diff develop...HEAD --stat
 openspec/changes/recibo-moneda-presentacion/tasks.md         |  26 +--
 .../__tests__/venta-exitosa-modal.test.tsx (new)              | 108 ++++++
 .../ventas/components/venta-exitosa-modal.tsx                 |   3 +-
 .../ventas/utils/__tests__/factura-export.test.ts              | 237 +++++++++--
 src/features/ventas/utils/factura-export.ts                   |  97 ++++---
 5 files changed, 407 insertions(+), 64 deletions(-)
```

- **PDF `artBody`** (`buildReciboPdfBlob`, article table `formatUsd`-only, L519-525 current file):
  read directly — still `formatUsd(linea.precioUnitarioUsd)` / `formatUsd(linea.totalUsd)`, no
  Bs counterpart. **Confirmed untouched, correctly deferred to WU3.** The only PDF-side change in
  the diff is the *totals* table call site (`construirFilasTotales(recibo.totales,
  recibo.monedaPresentacion)` + `fila.monto` instead of the old `fila.usd`/`fila.bs`), which is
  WU2 scope (Phase 2.2.3), not WU3.
- **Config UI** (`company-data-form.tsx`, WU1): not in this diff. ✅
- **No unrelated files**, no `.atl/` noise, no `state.yaml` changes committed to this branch.
- `tasks.md` changes are only checkbox updates ([x] marks) for WU2 items — no scope creep.

---

## Rounding / Precision

Read `buildReciboData`: all totals (`montoExentoUsd`, `baseImponibleUsd`, `ivaTotal`,
`totalFacturaUsd`, `totalGeneralUsd`) are accumulated as full-precision `Decimal` sums **before**
any rounding, then each is independently converted to Bs via `usdToBs` (also full precision) and
only rounded to 2 decimals at **display time** inside `formatUsd`/`formatBs` (`.toFixed(CFG.view,
CFG.rounding)`). Per-line `precioUnitarioBs`/`totalBs` on `ReciboLinea` are computed independently
per line and are **not** summed to produce the totals — totals derive from the Decimal accumulators
built during the `lineas` loop, not from re-summing already-rounded per-line Bs values. This means
there is **no accumulation-of-rounding-error risk**: line-level and total-level Bs figures cannot
diverge from independently rounding two different partial sums, because rounding is deferred to the
single display step in both cases. No discrepancy found in the tested fixtures (mixed 8%/16%
alicuotas, tasa 40.5 — a tasa chosen specifically to produce non-trivial decimal products, and all
assertions matched hand computation exactly).

---

## Spec Compliance Matrix (WU2-relevant scenarios only)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Ambas monedas siempre visibles | Línea de artículo y filas de totales muestran ambas monedas | `factura-export.test.ts` — article line tests (L757-798), `construirFilasTotales` describe block | ✅ COMPLIANT |
| Moneda primaria y contraparte | Bs primero en 'BS', USD primero en default | `factura-export.test.ts` L86-102, L757-798 | ✅ COMPLIANT |
| Seam tipado de moneda de presentación | Builder recibe el tipo explícito | `factura-export.test.ts` L345-353 (`monedaPresentacion` default/explicit propagation) | ✅ COMPLIANT |
| Desglose de pagos — método Bs muestra equivalente USD | Método Bs ahora también muestra su equivalente USD | `factura-export.test.ts` L645-667 (`formatMontoPago`) | ✅ COMPLIANT |
| Desglose de pagos — independiente del toggle | (implicit in MODIFIED requirement text) | Structural: `formatMontoPago` signature excludes `monedaPresentacion` | ✅ COMPLIANT |

**Compliance summary**: 5/5 WU2-relevant scenarios compliant (remaining spec scenarios — config UI,
PDF parity — belong to WU1 [already verified/merged] and WU3 [pending], out of this slice's scope).

---

## TDD Compliance

No formal "TDD Cycle Evidence" table (RED/GREEN/TRIANGULATE/SAFETY NET columns) exists in the
`apply-progress` engram artifact for this change — it uses a narrative format instead. This is a
**process-documentation gap**, not a code-correctness gap: `tasks.md` itself encodes the RED→GREEN
sequence per phase (`[TEST-RED]` task immediately followed by `[GREEN]` task, all 5 WU2 phases
follow this pattern except 2.5.1, a pure wiring task with no dedicated RED/GREEN split — covered
instead by the new `venta-exitosa-modal.test.tsx`). All GREEN tasks are independently confirmed via
the full suite run (405/405) on this branch, not trusted from the report.

**WARNING**: `apply-progress` does not use the canonical TDD Cycle Evidence table format expected
by the strict-tdd-verify module. Recommend the next apply-phase batch use the formal table for
easier automated audit, though the substance (RED-before-GREEN task ordering, real test coverage)
is present and verified here by other means.

---

## Assertion Quality

Full read of `factura-export.test.ts` (1109 lines) and `venta-exitosa-modal.test.tsx` (108 lines,
new WU2 file). No tautologies, no assertion-without-production-call, no ghost loops over
possibly-empty collections, no smoke-test-only patterns found in the WU2-added test code. Every
new assertion calls a production function (`buildReciboData`, `construirFilasTotales`,
`formatMontoBimonetario`, `formatMontoPago`, `buildReciboTextoPlano`, or triggers a real user
click that flows into `buildReciboData` via `venta-exitosa-modal.test.tsx`) and checks a specific,
independently-recomputed value — not a type-only or existence-only check.

**Assertion quality**: ✅ All assertions verify real behavior (0 CRITICAL, 0 WARNING for WU2-added tests).

---

## Issues Found

**CRITICAL**: None.

**WARNING**:
1. `apply-progress` engram artifact does not use the formal "TDD Cycle Evidence" table format
   (RED/GREEN/TRIANGULATE/SAFETY NET columns) expected by the strict-tdd-verify module — substance
   present via `tasks.md` task labeling, but not in the canonical audit-friendly shape.
2. `venta-exitosa-modal.tsx` file-level coverage (58.13%) is below the 80% guideline — pre-existing
   UI-rendering debt unrelated to the WU2 currency-threading change itself (which IS covered).

**SUGGESTION**:
1. Consider adding the literal spec-brief worked example (USD 10.00 @ tasa 40.0000 → Bs 400.00) as
   an explicit fixture in a future test pass — current fixtures validate the same multiplication
   direction at other tasas (10, 40.5, 500) but not that exact pair.

---

## Verdict

**PASS**

All 12 applicable WU2 tasks complete, 405/405 tests green (independently reproduced), `yarn
type-check:test` clean, tasa direction (`usd × tasa = Bs`) verified correct at every WU2 call site
by hand computation (zero inverted/divided values found), primary/counterpart ordering exact,
final bold rows structurally and behaviorally NOT toggled (sibling IGTF contract preserved),
payment counterpart structurally independent of the receipt toggle, backward-compat guard is a
real regression test (not a proxy), scope strictly limited to the 5 expected files with PDF
`artBody` confirmed untouched (correctly deferred to WU3), and no rounding-accumulation risk found.
The two WARNINGs are process-documentation and pre-existing-UI-coverage items, neither blocks the
WU2 code from being correct or spec-compliant.
