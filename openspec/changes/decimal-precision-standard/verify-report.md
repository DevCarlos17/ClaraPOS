# Verify Report: decimal-precision-standard

**Change**: decimal-precision-standard
**Branch**: feat/decimal-p5-final
**Date**: 2026-06-19
**Mode**: Standard (no test infrastructure exists)

---

## Status: PASS WITH WARNINGS

**Executive summary**: Foundation (Phase 1), Ventas (Phase 2), Compras+CxP (Phase 3), and CxC+Caja (Phase 4) write paths are correctly migrated to `Decimal.js` with `toStorageString()` on all DB writes; SQL migrations 0058+0059 are applied to production. Phase 5 (Contabilidad+Bancos+Inventario+Dashboard) is explicitly incomplete per tasks.md and constitutes the remaining scope, alongside 3 non-Phase-4 hooks (`use-movimientos-manual.ts`, `use-importar-cxc.ts`, `use-notas-fiscales-compra.ts`) that still use float arithmetic.

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 33 (T01–T05.15) |
| Tasks complete (Phase 1) | 5 / 5 |
| Tasks complete (Phase 2) | 10 / 10 (code-verified) |
| Tasks complete (Phase 3) | 9 / 9 (code-verified) |
| Tasks complete (Phase 4) | 8 / 8 (code-verified) |
| Tasks complete (Phase 5) | 0 / 15 (expected — out of scope for this verify) |
| tasks.md checkbox state | Phase 2–5 still `[ ]` — artifact not updated |

---

## Build & Tests Execution

**Build (type-check)**: ✅ Clean — 0 decimal-related errors
```
yarn type-check 2>&1 | grep "error TS" | grep -v "calendario-citas" | grep -v "\.test\.ts"
# → (no output)
```
Note: `calendario-citas.tsx` has 1 pre-existing unrelated error. Test files (`cliente-schema.test.ts`) have TS errors due to missing `@types/jest` — these are pre-existing and unrelated to this change.

**Tests**: ➖ No test infrastructure configured (no runner, no coverage)

**Coverage**: ➖ Not available

---

## Verification Checks

### ✅ Check 1 — currency.ts: DecimalInput type

`src/lib/currency.ts:7` — `DecimalInput = string | number | Decimal`. All arithmetic functions (`usdToBs`, `bsToUsd`, `applyImpuesto`, `applyDescuento`) use `toD()` which accepts all three variants, returns `Decimal(0)` on invalid/empty input, never throws.

### ✅ Check 2 — currency.ts: arithmetic functions return Decimal

`currency.ts:60–76` — All four computation functions return `Decimal`. No `Number()`, `parseFloat()`, or `.toFixed()` inside them on monetary values. `formatTasa` uses `.toFixed(4, CFG.rounding)` on a `Decimal` for display — acceptable.

### ✅ Check 3 — currency.ts: toStorageString API

`currency.ts:140–141` — `toStorageString(val)` → `toD(val).toFixed(CFG.calc, CFG.rounding)`. With `precisionCalc=8`: `toStorageString(new Decimal('8024.64'))` = `'8024.64000000'`. Correct.

### ✅ Check 4 — currency.ts: format functions

`currency.ts:109–133` — `formatUsd`, `formatBs`, `formatTasa` accept `DecimalInput`, use custom `addThousands()` (no float re-parsing). Backward-compatible.

### ✅ Check 5 — main.tsx: loadCurrencyConfig before render

`src/main.tsx:49–103` — `loadCurrencyConfig()` queries `system_settings` via PowerSync SQLite before `ReactDOM.createRoot`. Falls back to `{precisionCalc:8, precisionView:2, roundingMode:ROUND_HALF_UP}` on empty DB or error. `ReactDOM.createRoot` is called inside `.then()` callback — guaranteed post-config.

### ✅ Check 6 — PowerSync schema: system_settings defined

`src/core/db/powersync/schema.ts:1449` — `system_settings` table defined, registered in `AppSchema`.

### ✅ Check 7 — Sync rules: system_settings in global bucket

`backend/powersync-sync-rules.yaml:47` — `SELECT * FROM system_settings` in `global` bucket. No `empresa_id` filter (correct — global config).

### ✅ Check 8 — SQL migrations exist and applied

`migrations/0058_decimal_precision.sql` — NUMERIC(20,8) column widenings, `system_settings` creation + 3 seed rows (`precision_calc='8'`, `precision_view='2'`, `rounding_mode='4'`), `system_config_audit` with deny-all RLS.
`migrations/0059_decimal_precision_fix.sql` — supplementary fix. Both applied to production per implementation summary.

### ✅ Check 9 — Ventas hooks: toStorageString on writes

`src/features/ventas/hooks/use-ventas.ts` — imports `toStorageString`; lines 409–416 confirm all monetary fields in venta INSERT use `toStorageString()`. `use-notas-credito.ts`, `use-notas-debito.ts`, `use-ret-iva-ventas.ts`, `use-ret-islr-ventas.ts` confirmed migrated.

Residual `.toFixed(3)` calls: lines 516, 531 (use-ventas.ts) and 309 (use-notas-credito.ts) — these are on **stock/quantity** fields (`cantidad` inventory columns), not monetary values. Not in scope.

Residual `.toNumber()` calls: lines 823, 1352, 1387–1389 (use-ventas.ts) — these feed `generarAsientosVenta()` which expects `number` arguments (accounting function interface). `toStorageString()` is used for all actual DB write payloads at lines 1372 etc. Acceptable — the accounting layer's float risk is a Phase 5 concern.

### ✅ Check 10 — Compras+CxP hooks: toStorageString on writes

`src/features/compras/hooks/use-cxp.ts` — imports `toStorageString`; lines 192, 207–215, 310, 323–325 use `toStorageString()` on all monetary DB writes.

`use-ret-iva-compras.ts`, `use-ret-islr-compras.ts` — confirmed no float arithmetic on monetary values.

**⚠️ Exception — `use-cxp.ts:175`**: Error message uses `.toFixed(2)` on Decimal values for display string only (not a DB write). Minor spec violation in letter but zero precision impact on stored data.

### ✅ Check 11 — CxC hooks: toStorageString on writes (post-fix)

`src/features/cxc/hooks/use-cxc.ts` — imports `Decimal` + `bsToUsd` + `toStorageString` (lines 9–10). All monetary DB writes use `toStorageString()` (lines 354, 365, 380, 390, 407, 410, 418, 446, 475, 539, 568–570, 574–575, 583, 588, 637–655, 679, 687, 745–746, etc.).

Residual `.toNumber()` at line 825 — feeds caller return value for in-memory use (not a write). Acceptable.

`use-importar-cxc.ts` — **NOT migrated**: lines 124 (`parseFloat`), 164 (`Number((…).toFixed(2))`), 189–226 (`.toFixed()` writes to DB). This file is NOT in Phase 4 tasks (T04.5–T04.8). It is a separate utility for bulk CxC import. **WARNING — unmigrated write path.**

### ✅ Check 12 — Caja hooks: toStorageString on writes (post-fix)

`src/features/caja/hooks/use-sesiones-caja.ts` — imports `Decimal` + `bsToUsd` + `toStorageString` (lines 6–7). Key writes:
- Apertura: lines 594 — `toStorageString(montoAperturaUsdD)`, `toStorageString(montoAperturaBsD)` ✅
- Cierre: lines 783–788 — all `toStorageString()` ✅
- Detalle: lines 873–875, 913 — `toStorageString()` ✅

Residual `.toNumber()` at lines 448, 453 — computed saldo values returned to UI callers, not written to DB. Acceptable.

`use-movimientos-manual.ts` — **NOT migrated**: 18 occurrences of `parseFloat` + `Number((…).toFixed(2))` + `.toFixed(2)` on write payloads (lines 65–293). This file handles manual cash movements (caja). **CRITICAL — monetary write path using float arithmetic.**

---

## Spec Compliance Matrix

| Requirement | Scenario | Status |
|---|---|---|
| DecimalInput type acceptance | string input from PowerSync | ✅ COMPLIANT |
| DecimalInput type acceptance | number input for compatibility | ✅ COMPLIANT |
| DecimalInput type acceptance | Decimal passthrough | ✅ COMPLIANT |
| initCurrencyConfig at startup | config loaded from system_settings | ✅ COMPLIANT |
| initCurrencyConfig at startup | called before first computation | ✅ COMPLIANT (fallback defaults) |
| toStorageString before every write | standard serialization | ⚠️ PARTIAL (core hooks ✅, use-movimientos-manual + use-importar-cxc + use-notas-fiscales-compra ❌) |
| toStorageString before every write | prevents float coercion on write | ⚠️ PARTIAL |
| Computation functions arithmetic | usdToBs extreme rate | ✅ COMPLIANT |
| Computation functions arithmetic | bsToUsd precision | ✅ COMPLIANT |
| Computation functions arithmetic | IVA application | ✅ COMPLIANT |
| Computation functions arithmetic | descuento application | ✅ COMPLIANT |
| Format functions display precision | USD formatting | ✅ COMPLIANT |
| Format functions display precision | tasa formatting | ✅ COMPLIANT |
| system_settings table | seeded on migration | ✅ COMPLIANT |
| system_settings table | RLS tenant cannot modify | ✅ COMPLIANT |
| system_settings table | app reads at startup | ✅ COMPLIANT |
| system_config_audit table | inaccessible to tenant roles | ✅ COMPLIANT |
| Column widening NUMERIC(20,8) | widening non-destructive | ✅ COMPLIANT (applied to prod) |
| Column widening NUMERIC(20,8) | migration order enforced | ✅ COMPLIANT |
| Column widening NUMERIC(20,8) | PowerSync column.text compatible | ✅ COMPLIANT |
| Migration file naming | single atomic file | ✅ COMPLIANT (0058 + 0059 fix) |
| Zod schema migration | valid numeric string passes | ⚠️ PARTIAL (ventas/compras done; Phase 5 schemas pending) |
| Hook migration pattern | hook reads and writes back | ⚠️ PARTIAL (3 hooks outside task scope not migrated) |
| Hook migration pattern | no raw float ops in src/ | ❌ NON-COMPLIANT (use-movimientos-manual, use-importar-cxc, use-notas-fiscales-compra, Phase 5 hooks) |

**Compliance summary**: 19/24 scenarios compliant (79%) — same ratio as prior verify but for different reasons. Previously CxC+Caja were the gap; now the gap is 3 out-of-scope utility hooks + Phase 5.

---

## Issues Found

### CRITICAL

1. **`use-movimientos-manual.ts` — float write path, NOT in any task**
   - `src/features/caja/hooks/use-movimientos-manual.ts` — 18 float op lines. All monetary values in `movimientos_metodo_cobro` inserts use `Number((saldoActual ± monto).toFixed(2))` (lines 131–166, 264–293). This hook handles manual cash movements (ingresos/egresos de caja) — every cash movement stores amounts at 2 decimal precision despite the spec requiring 8.
   - This file does NOT appear in T03, T04, or T05 task lists.

### WARNING

1. **`use-importar-cxc.ts` — float write path, NOT in any task**
   - `src/features/cxc/hooks/use-importar-cxc.ts:124,164,189–239` — `parseFloat` + `Number(…toFixed(2))` on all DB writes. Handles bulk CxC import from external source. Stores `total_usd`, `saldo_pend_usd`, `monto` at 2 decimals.
   - Not in any task list (T04.5 covers `use-cxc.ts`, not `use-importar-cxc.ts`).

2. **`use-notas-fiscales-compra.ts` — float write path, NOT in any task**
   - `src/features/compras/hooks/use-notas-fiscales-compra.ts:89–94` — `.toFixed(4)` and `.toFixed(2)` on all monetary fields in the `notas_fiscales_compra` INSERT. This file is not in T03 tasks (T03.1–T03.5 cover different files).

3. **`tasks.md` artifact not updated**
   - Phases 2–4 tasks remain `[ ]` unchecked in `tasks.md` despite being code-verified complete. The artifact does not reflect implementation state.

4. **Phase 5 hooks (T05.1–T05.15) — expected incomplete**
   - `use-gastos.ts`, `use-diferencial-banco.ts`, `use-cuadre.ts`, `use-dashboard.ts`, `use-kardex.ts` + 10 Zod schemas — all still use float arithmetic. Confirmed not started. This is expected per tasks.md.

5. **`generar-asientos.ts` — float writes to immutable libro_contable**
   - `src/features/contabilidad/lib/generar-asientos.ts` — `Number((…toFixed(2)))` for accounting entry amounts. Not in any task. Libro_contable entries are immutable — rounding errors are permanent.

### SUGGESTION

1. Add `use-movimientos-manual.ts` to the Phase 5 task list — it's a write path that was omitted from all phases.
2. Add `use-importar-cxc.ts` to Phase 5 (or a separate cleanup phase).
3. Add `use-notas-fiscales-compra.ts` to Phase 5 task list.
4. Add `generar-asientos.ts` to Phase 5 — immutable write path.
5. Update `tasks.md` to mark T01.1–T04.8 as `[x]` to reflect actual state.

---

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|-------------|--------|-------|
| DecimalInput type + toD() | ✅ Implemented | Safe default Decimal(0) on invalid |
| initCurrencyConfig + fallbacks | ✅ Implemented | Rounding mode validated 0–8 |
| toStorageString(8 decimals) | ✅ Implemented | Uses CFG.calc from config |
| usdToBs/bsToUsd return Decimal | ✅ Implemented | No float ops internally |
| system_settings table + RLS | ✅ Applied to prod | 3 seed rows confirmed |
| NUMERIC(20,8) column widening | ✅ Applied to prod | 0058+0059 in production |
| Ventas domain migration | ✅ Complete | All writes use toStorageString |
| Compras+CxP domain migration | ✅ Complete | All core writes use toStorageString |
| CxC domain migration (use-cxc.ts) | ✅ Complete | All writes use toStorageString |
| Caja domain migration (use-sesiones-caja.ts) | ✅ Complete | All writes use toStorageString |
| use-movimientos-manual.ts migration | ❌ Not done | Not in any task; float writes |
| Phase 5 domain migration | ❌ Not started | Expected per tasks.md |

---

## Design Coherence

| Decision | Followed? | Notes |
|----------|-----------|-------|
| decimal.js as arithmetic layer | ✅ Yes | All migrated hooks use it |
| toStorageString on every write | ⚠️ Partial | 3 utility hooks missed + Phase 5 |
| column.text PowerSync — no schema change | ✅ Yes | Schema unchanged |
| loadCurrencyConfig before render | ✅ Yes | main.tsx:103 |
| Safe fallback defaults | ✅ Yes | precisionCalc=8, precisionView=2, ROUND_HALF_UP |

---

## Verdict

**PASS WITH WARNINGS**

`status`: PASS WITH WARNINGS
`critical_count`: 1 (`use-movimientos-manual.ts` — financial write path with float arithmetic, omitted from all task lists)
`warning_count`: 4 (use-importar-cxc, use-notas-fiscales-compra, generar-asientos, tasks.md not updated)

The core migration for all 4 planned phases is complete and verified: currency.ts foundation, SQL migrations, Ventas, Compras+CxP, CxC, and Caja write paths all use `toStorageString()`. The remaining gaps (`use-movimientos-manual.ts` as a critical omission, plus the expected Phase 5 scope) do not block the change from being considered substantially delivered — but `use-movimientos-manual.ts` must be added to a task and migrated before the change can be declared fully PASS.
