# Design: Máscara Visual tipo Excel en Esquema de Precios

## Technical Approach

Extend the ref+display-state pattern already used by `precioVentaUsdFullRef`/`precioMayorUsdFullRef`/`precioEspecialUsdFullRef` and `precioFinalFocusRef` — no custom hook, no new state architecture. The mask is a **commit-on-transition** effect: `onFocus` writes the full-precision string into display state once; `onBlur` writes the 2-decimal string back. `onChange` behaves exactly as today (writes the raw filtered string) while typing. No conditional in `value={}` — keeps the diff mechanical, avoids re-render-time reformatting that would fight the cursor mid-keystroke.

## Architecture Decisions

| Decision | Choice | Alternative rejected | Rationale |
|---|---|---|---|
| Mask mechanism | Extend existing ref+state pattern (onFocus/onBlur commit) | `useDecimalMask()` hook per field | 15+ readers (`applyPricesFromCosto`, `handleFijarCosto`, `recalcularCostoSiExplorando`, `handleSubmit`) consume the plain state vars directly; a hook forces threading its return value through all — bigger, riskier diff. Commit-on-transition is additive only. |
| Full-precision source | `useRef<number>` per field, via existing/new `set*Completo()` wrappers | Recompute display via decimal.js every render | Matches existing pattern (`precioVentaUsdFullRef`), zero extra re-renders; live-recompute-on-render would reformat input on every keystroke, corrupting cursor/trailing `.`/`0`. |
| Focus tracking | Reuse `precioFinalFocusRef` (`Set<string>`) for its existing guard only; other 12 fields need no Set | One global `Set` driving every field's mask | Only Precio Final has a syncing `useEffect` that must skip the focused field; other fields are a pure focus/blur swap, no third writer to guard. |
| Display helper | New `src/lib/decimal-display-mask.ts`: `toMaskedDisplay(value, viewDecimals=2)`, `toFullDisplay(value, calcDecimals=8)` | Reuse `formatUsd`/`formatBs` | Those return `$1,234.56`/`Bs. 1.234,56` (symbols, separators) — unusable as input value. New helper is decimal.js-based, symbol-free, unit-testable without React. |

## Full-Precision Sources (per field)

| Field group | Source of truth on focus | New ref? |
|---|---|---|
| Costo $ | `costoUsdFullRef` (new), written by new `setCostoCompleto()` wrapper replacing bare `setCostoUsd()` in `handleCostoUsdChange`/`handleCostoBsChange`/init sites | Yes |
| Costo Bs | `usdToBs(costoUsdFullRef.current, tasaValor)` computed inline | No |
| Margen % ×3 | `margenFullRef`/`margenMayorFullRef`/`margenEspecialFullRef` (new), written by new `setMargenCompleto()`/`setMargenMayorCompleto()`/`setMargenEspecialCompleto()` wrappers replacing all 33 existing `setMargen*()` call sites | Yes |
| Precio Venta $ ×3 | Existing `precioVenta{Usd,Mayor,Especial}FullRef` (already written by `setPrecio*Completo`) | No (add onFocus/onBlur only — today these fields have neither) |
| Precio Venta Bs ×3 | `usdToBs(precioVenta*UsdFullRef.current, tasaValor)` computed inline on focus | No |
| Precio Final $/Bs ×3×2 | Computed inline on focus from `precioVenta*UsdFullRef.current` + `alicuota` via decimal.js (fixes the existing bug where `pfDetalUsd` etc. use `parseFloat(precioVentaUsd)`, the truncated display, instead of the full ref) | No |

`setCostoCompleto`/`setMargen*Completo` mirror `setPrecioVentaCompleto(fullValue, displayVal)`. Margen wrapper sites keep the same untruncated number they already compute before `.toFixed()` — only the setter changes; back-calc math (`applyPricesFromCosto`, `handleFijarCosto`, `recalcularCostoSiExplorando`) stays untouched (ref is additive).

**Gap resolved vs. proposal**: step 6 extends `handleSubmit` full-ref reads to "Margen y Precio Final" but omits Costo. Once Costo's display masks to 2 decimals on blur, `handleSubmit` MUST read `costoUsdFullRef.current` instead of `parseNumOrZero(costoUsd)` (~L1081) or submitted cost truncates. Margen has no submit involvement (UI-only, never persisted).

## Focus Keying Rule

The mask reveals full precision **only** for the input with `document.activeElement` on it. Each `onFocus`/`onBlur` pair is keyed to its own field's setter — never a sibling's. This directly fixes the cross-field flicker bug: `handlePrecioVentaBsChange` (~L753) keeps writing `usdToBs(num, tasaValor).toFixed(2)` into `precioVentaBs` only; it must never call `setPrecioVentaUsd` with an unformatted value (audit item below).

## Float Audit (report only, not fixed here)

`parseFloat`/native arithmetic in the value chain, ~90+ occurrences: (1) margin % math (`(ventaN-costoN)/costoN*100`, ~10 sites) — native float, never decimal.js; (2) IVA/Precio Final math (`pfDetalUsd`, `ivaDetalUsd`, ~L1304-1314) — same; (3) `parseFloat` for comparisons (`costoN > 0`) — magnitude-bounded, low risk but violates rule #10 in spirit. Documented for a future change; only item 2 is touched here since it feeds the on-focus reveal.

## Testing Strategy

| Layer | What | File |
|---|---|---|
| Unit | `toMaskedDisplay`/`toFullDisplay`: 2/8 decimals, zero/empty, no React | `src/lib/__tests__/decimal-display-mask.test.ts` (new) |
| Component | Submit payload has full precision regardless of focus history; blur re-masks; focusing A doesn't unmask B; Bs→$ no longer flickers unformatted; Margen full-precision doesn't alter back-calc (regression on `producto-precio-gating.test.ts`) | Extend `producto-form-precio-precision-submit.test.tsx`, `-precio-final-live.test.tsx`, `-costo-precision.test.ts`; new `-mascara-visual.test.tsx` |
| Mock | `@/core/db/powersync{,/db,/connector}` + `@powersync/react`, per convention in sibling `__tests__` files | same |

## Documentation Plan

Add a "Máscara visual de precios" subsection to `CLAUDE.md` (Reglas de Negocio Críticas, near rule #10) describing: display = 2 decimals default, full precision on focus, full ref/state is what reaches `handleSubmit` — never the masked string. Cross-reference `decimal-display-mask.ts`.

## Rollback

Single component file + one new pure lib file + test files. Revert restores unmasked 2/8-decimal inconsistent display and current math untouched. No DB/schema/migration involved. `decimal-display-mask.ts` has no dependents outside this file.

## Open Questions

None — the one gap found (Costo missing from `handleSubmit` extension) is resolved above.
