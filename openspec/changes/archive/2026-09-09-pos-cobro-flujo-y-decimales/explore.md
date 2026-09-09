# Exploration: pos-cobro-flujo-y-decimales

Six user-reported issues in the POS checkout flow (main screen, product search, Cobro modal, success screen). Grouped: 1 typography tweak, 1 responsive layout fix, 1 financial-correctness bug, 3 flow-guard changes (all in one file).

## Current State

### R1 — POS main screen total typography
`src/features/ventas/components/pos-terminal.tsx:900-935` — desktop-only right panel (`hidden md:flex`, "COL RIGHT"). Total block at lines 903-935:
```tsx
<p className="text-3xl font-bold leading-tight tabular-nums">{formatBs(totalBs)}</p>
<p className="text-sm text-muted-foreground mt-0.5">{formatUsd(totalUsd)}</p>
```
Bs is already above USD, USD is already muted (`text-muted-foreground`). Only the **size** needs to grow: `text-sm` (14px) → target something between `text-sm` and `text-3xl`, e.g. `text-base`/`text-lg`. Order and muting already satisfy the requirement — this is a one-class change.

Two other total displays exist in the same file (mobile bottom bar line 1036/1038, and cart Sheet footer line 1275/1276) using the same `text-2xl`/`text-xs` and `text-xl`/`text-xs` pairs respectively — NOT explicitly in scope (user said "main POS screen" = Image 1 = desktop), but worth flagging for consistency since they're the same visual pattern repeated 3x with different scales.

### R2 — Search results dropdown width (mobile)
`src/features/ventas/components/producto-buscador.tsx:103-117` — `useLayoutEffect` computes `dropdownStyle` (`top`, `left`, `width`) from `inputRef.current.getBoundingClientRect()`, re-run on `scroll`/`resize`. Applied via inline `style={dropdownStyle}` on a `position: fixed` div (line 193-197) that escapes `overflow-hidden` parents. `width: rect.width` ties the dropdown exactly to the search input's width — on mobile the input is narrow, so long product names (`p.nombre`, line 220-224) get truncated (the `<p className="truncate">` at line 220).

Confirmed: no Tailwind config file exists — Tailwind 4 CSS-based `@theme` in `src/index.css`, breakpoints NOT customized (default `md` = 768px, matches `.hidden md:flex` usage elsewhere in the codebase).

### R3 — Decimal discrepancy Total vs Pendiente (FINANCIAL)

**First, the stale-memory correction**: the brief's premise — "known regression: `usdToBs`/`bsToUsd` leak Decimal objects instead of returning `number`, 9 failing tests in `currency.test.ts`" — is **outdated and no longer true**. Verified directly:
- `src/lib/currency.ts:60-68` — `usdToBs`/`bsToUsd` are explicitly typed to return `Decimal` (not `number`), by design, per the `decimal-precision-standard` change (`openspec/changes/decimal-precision-standard/verify-report.md`, dated 2026-06-19, verdict PASS WITH WARNINGS).
- `src/lib/__tests__/currency.test.ts` **already asserts** `Decimal`-returning behavior (`usdToBs(100, 36.5).toNumber()`, line 5) — the tests are written against the current (correct) contract.
- Ran `yarn test:run src/lib/__tests__/currency.test.ts` live: **20/20 passing**, 0 failures.

Conclusion: engram observations #962/#963 (dated 2026-08-03, claiming ~10 failing tests) describe a state that predates the `decimal-precision-standard` fix, or refer to a different/already-resolved issue. **This memory should be superseded** — flagged below as a standalone recommendation, not baked into this change's artifact.

**The actual R3 bug** is isolated to `src/features/ventas/components/venta-exitosa-modal.tsx` and does NOT touch `currency.ts`:

- `data.totalBs` (Row "Total", line 179) = `totalEfectivoBs.toNumber()`, set in `cobro-modal.tsx:532`. `totalEfectivoBs` (`cobro-modal.tsx:151`) is the result of an all-Decimal chain (`totalProductosBs.plus(totalCargosNativosBs).minus(descuentoBs)`, clamped to ≥0) — **no intermediate rounding**. This value is correct per rule #10 (round only at the end).
- `saldoPendUsd` (Row "Pendiente", `venta-exitosa-modal.tsx:71-75`):
  ```ts
  const totalAbonadoUsd = data.pagos.reduce((sum, p) => {
    const montoUsd = p.moneda === 'BS' ? Number((p.monto / data.tasa).toFixed(2)) : p.monto
    return sum + montoUsd
  }, 0)
  const saldoPendUsd = Math.max(0, Number((data.totalUsd - totalAbonadoUsd).toFixed(2)))
  ```
  This is **plain float arithmetic** (`/`, `-`, `.toFixed(2)`, `Number(...)`) on `data.totalUsd`/`data.tasa` — both already-serialized numbers — then it's **rounded to 2 decimals BEFORE being reconverted to Bs**:
  ```ts
  formatBs(usdToBs(saldoPendUsd, data.tasa))   // line 223
  ```
  This rounds mid-chain, not at the end — a direct violation of rule #10. `usdToBs(saldoPendUsd, tasa)` re-multiplies an already-2-decimal-rounded USD figure by the exact tasa, producing a Bs figure that is a **different, independently-derived number** from `totalEfectivoBs` (which came from a completely separate Decimal chain involving cargos/descuento in Bs, not a single USD×tasa multiplication).

  With the reported example (Total $5.41 / Bs 2.704,00, fully unpaid credit sale, `totalAbonadoUsd = 0`): `saldoPendUsd = Number((5.41...).toFixed(2)) = 5.41`, then `5.41 * tasa` is computed fresh — and does not necessarily equal the original `totalEfectivoBs` because `totalEfectivoBs` was never literally `totalUsd × tasa` (it's the sum of Bs-native cargo amounts + Bs-native descuento minus, not a pure multiplication run through a 2-decimal USD midpoint). The **premature 2-decimal rounding of the USD intermediate is the root cause** of the 1-Bs (or more) drift the user is seeing.

  **Verdict: "Total" (Bs 2.704,00) is correct. "Pendiente" (Bs 2.705,00) is wrong.** For a fully-unpaid credit sale, the pending Bs amount should just BE the total Bs amount (or, more generally, `totalEfectivoBs - totalPagadoBs`, both already exact Decimals) — not a value re-derived through a rounded USD midpoint.

  Critically: `VentaExitosaData` (the interface, `venta-exitosa-modal.tsx:20-36`) does NOT carry the exact `pendienteBs4` Decimal that `cobro-modal.tsx` already computed correctly at line 176 (`totalEfectivoBs.plus(igtfBs).minus(totalPagadoBs)`). The success modal is forced to **re-derive** the pending amount from scratch using only `totalUsd`/`totalBs`/`pagos`/`tasa`, and that re-derivation is where the double-rounding sneaks in.

  **Fix does NOT require touching `currency.ts`** (which is correct and stable per the passing test suite). It requires: (a) passing the already-exact `pendienteBs4` (or equivalently `saldoPendUsd` derived without intermediate `.toFixed(2)`) from `cobro-modal.tsx` through `onSuccess(...)` into `VentaExitosaData`, and (b) having `venta-exitosa-modal.tsx` consume that value directly instead of recomputing it from `pagos`+`toFixed(2)` reductions. This is a **small, isolated, cross-file change** (2 files: add 1 field to the interface + `onSuccess` payload in `cobro-modal.tsx`; consume it in `venta-exitosa-modal.tsx`, delete the recompute block).

### R4 — "Factura a crédito" pre-selected by default
`src/features/ventas/components/cobro-modal.tsx:205-243` — the auto-select `useEffect`:
```ts
useEffect(() => {
  if (pendienteBs4.abs().lte('0.01')) { setDiscrepancyMode(null); return }
  if (pendienteBs4.lt('-0.01')) { /* overpago: sets VUELTO */ }
  else if (pendienteBs4.gt('0.01')) {
    if (discrepancyMode === null || discrepancyMode === 'VUELTO' || ... ) {
      const faltanteUsd = bsToUsd(pendienteBs4, tasaUsada)
      if (faltanteUsd.gt(0) && faltanteUsd.lt('0.01')) setDiscrepancyMode('DIFERENCIAL_FALTANTE')
      else setDiscrepancyMode('CREDITO')   // ← line 235, the auto-select the user wants removed
    }
  } else setDiscrepancyMode(null)
}, [pendienteBs4])
```
Fires every time `pendienteBs4` (the outstanding balance) crosses from ≤0.01 to >0.01 with `discrepancyMode` still `null` (i.e., as soon as the cashier hasn't paid anything yet and there's a client selected) — auto-picks `'CREDITO'`.

### R5/R6 — Guard against half-entered payment / method-without-amount
State involved (`cobro-modal.tsx`): `metodoId` (string, line 92), `montoStr` (string, line 93), `referencia` (string, line 94). All three reset to `''` in the modal-open effect (lines 125-127) and after a successful `handleAddPago()` (lines 338-340). **Key invariant**: whenever any of these three is non-empty, the cashier has typed something into "Agregar pago" that has NOT been committed via the `+` button (`handleAddPago`, lines 321-341).

Entry points that need the guard:
- `handleProcesar` (line 358) — reachable via the "Procesar" button (line 1145-1157, gated by `puedeProcesar`) and via `F12`/`Enter` keydown (lines 593-600, also gated by `puedeProcesar`).
- `selectModeRef.current` (lines 570-584) — the F5/F6/F7 keyboard shortcuts that call `setDiscrepancyMode(...)`.
- The 6 discrepancy-mode buttons' direct `onClick={() => setDiscrepancyMode('X')}` handlers (lines 866, 879, 891, 1046, 1058, 1070) — same effect as F5/F6/F7 but via mouse click, currently NOT routed through `selectModeRef`.

## Affected Areas

- `src/features/ventas/components/pos-terminal.tsx` — R1 (1 className), optionally 2 more Total displays for consistency (mobile bar, Sheet footer) — flag only, not required by the ask.
- `src/features/ventas/components/producto-buscador.tsx` — R2 (`useLayoutEffect` + `dropdownStyle` state, lines 96-117; JSX line 193-197).
- `src/features/ventas/components/cobro-modal.tsx` — R3 (add exact pending-Bs to `onSuccess` payload, line 525-551), R4 (edit auto-select effect, lines 205-243), R5/R6 (new guard + glow state, touching `handleProcesar` line 358, `selectModeRef` lines 570-584, 6 button `onClick`s, and the `+` button JSX line 830-839).
- `src/features/ventas/components/venta-exitosa-modal.tsx` — R3 (`VentaExitosaData` interface line 20-36, delete recompute block lines 71-75, consume new field at line 223).

## Approaches

### R2 — responsive dropdown width

1. **JS breakpoint check inside `updatePos()`** (recommended) — inside the existing `useLayoutEffect`, check `window.matchMedia('(max-width: 767.98px)').matches` (mirrors the project's untouched Tailwind default `md` breakpoint). If mobile: `{ top: rect.bottom + 4, left: 8, width: window.innerWidth - 16 }`. If desktop: current behavior unchanged.
   - Pros: single source of truth for positioning logic (already JS-driven, already re-runs on resize/scroll — no new listeners needed), minimal diff (~8 lines), no CSS/inline-style fighting.
   - Cons: hardcodes `768px` in JS, duplicating Tailwind's breakpoint value (drifts silently if the theme's `md` is ever customized — currently it is NOT customized, confirmed via `src/index.css`).
   - Effort: Low.

2. **CSS custom property + Tailwind arbitrary width classes** — keep `left`/`top` JS-computed, but instead of setting `style.width` directly, set a CSS var (`style={{ '--anchor-w': rect.width + 'px', top, left }}`) and drive width via Tailwind classes: `className="w-[var(--anchor-w)] max-md:w-[calc(100vw-1rem)] max-md:left-2"`.
   - Pros: breakpoint logic lives in Tailwind (single source of truth, no JS duplication of `768px`), degrades gracefully.
   - Cons: `left` still needs a mobile override (JS-set `left` conflicts with `max-md:left-2`); mixing inline style + Tailwind arbitrary-value classes for the same property is unusual and more surprising to a future reader; slightly more moving parts for a fix this small.
   - Effort: Low-Medium.

3. **Native CSS anchor positioning** (`anchor-name`/`position-anchor`) — investigated via `modern-web-guidance`: **ruled out**, not implemented in any major browser yet (confirmed live via the skill's `css-layout` guide, section 5: "Anchor positioning is not natively supported by any major browser yet"). Not viable today regardless of browser-support policy.

**Recommendation**: Approach 1. It keeps the fix contained to the single file/effect that already owns positioning, avoids introducing a second styling mechanism, and the breakpoint-duplication risk is low (project has no history of customizing Tailwind breakpoints).

## Risks

- **R1 — UI-only, zero risk.** Single Tailwind class change.
- **R2 — UI-only, low risk.** No data/logic touched; verify the dropdown still closes/repositions correctly on rotation (resize listener already exists).
- **R3 — FINANCIAL, must be reviewed carefully**, but the fix is a **plumbing** fix (pass an already-correct value instead of recomputing it badly), not a change to any Decimal/currency primitive. Does not touch `currency.ts`. Blast radius: `cobro-modal.tsx` (`onSuccess` payload + `VentaExitosaData` interface) and `venta-exitosa-modal.tsx` (consume instead of recompute). No DB writes involved (this is a post-sale success-screen display value only — `crearVenta(...)` already ran and wrote the authoritative Decimal values before `onSuccess` fires). Low risk of regressing the actual sale record; the risk is purely "does the success screen show the right number," which is exactly the bug being fixed.
- **R4/R5/R6 — touch the checkout gate (`puedeProcesar`), the highest-risk area of this file** because `puedeProcesar` gates the only path to `crearVenta(...)` (the actual financial write). Confirmed via full-file grep: `discrepancyMode` state is 100% local to `cobro-modal.tsx` (55 matches, all within this one file) — no external consumers, so R4's change cannot break other components. R5/R6 similarly only touch local UI state (`montoStr`/`referencia`/`metodoId`) and don't change what `crearVenta` receives — they only ADD a pre-submit gate, they don't relax any existing check. Net risk: low-to-medium, purely additive/restrictive (makes the flow stricter, never looser), but needs careful manual QA of all 3 keyboard shortcuts (F5/F6/F7) and both mouse-click paths (direct button `onClick`s) since the guard must intercept all of them consistently.
- **Cross-cutting**: R4 changes what `discrepancyMode` is when the modal opens with an existing balance; R5/R6 add a NEW blocking condition on `handleProcesar`/mode-switch. These three should be implemented and tested together (same file, overlapping code paths) even if delivered as separate requirements in tasks.md.

## Recommendation

**Split into two changes, not one:**

1. **`pos-cobro-ui-cosmetica`** (or similar) — R1 + R2. Pure UI/typography/responsive-layout, zero business logic, trivially reviewable, safe to ship independently and fast.
2. **`pos-cobro-flujo-y-decimales`** (this change, scope narrowed) — R3 + R4 + R5 + R6. All four live in the checkout gate area of `cobro-modal.tsx` (R3 also touches `venta-exitosa-modal.tsx`), share the same review context (the `puedeProcesar`/`discrepancyMode`/payment-entry state machine), and benefit from one focused design + one verify pass covering the whole gate.

Rationale for splitting: R1/R2 have literally zero coupling to R3-R6 (different files/concerns, cosmetic vs. financial/flow), and bundling them would force a UI-only review to wait on a financial-correctness review (or vice versa) inside the same 400-line PR budget. Keeping R3-R6 together (rather than splitting further) makes sense because they share the same state (`discrepancyMode`, `montoStr`, `referencia`, `metodoId`, `puedeProcesar`) in the same file and are easiest to design/verify as one coherent "checkout gate" unit — splitting them further would mean re-reading the same 60-line block 3 times across 3 changes.

If the orchestrator prefers to keep the original single change name (`pos-cobro-flujo-y-decimales`) covering all 6, that's also workable — the risk split above still applies, just contained in one proposal/design/tasks set instead of two.

## Estimated changed-lines forecast (rough)

| Req | Files | Est. lines changed | Notes |
|---|---|---|---|
| R1 | `pos-terminal.tsx` | ~1-3 | className edit only |
| R2 | `producto-buscador.tsx` | ~10-15 | `updatePos()` branch + maybe a `matchMedia` listener for live breakpoint changes |
| R3 | `cobro-modal.tsx` + `venta-exitosa-modal.tsx` | ~15-25 | add 1 field to interface + payload; delete recompute block; consume new field |
| R4 | `cobro-modal.tsx` | ~5-10 | remove/gate the `setDiscrepancyMode('CREDITO')` auto-default branch |
| R5+R6 | `cobro-modal.tsx` | ~40-60 | new guard fn + glow state/animation + wire into `handleProcesar`, `selectModeRef`, 6 button `onClick`s, `+` button className |
| **Total** | 4 files | **~70-115** | Comfortably inside a single 400-line review budget even if kept as one change |

## Ready for Proposal

**Yes**, with one open design question to resolve before/during `sdd-propose`: **R4 scope precision** — the user said "Factura a crédito" specifically should not be pre-selected. The same `useEffect` also auto-selects `DIFERENCIAL_FALTANTE` for sub-cent rounding faltantes (line 233) — should that ALSO stop being auto-selected, or is that sub-cent auto-suggestion intentionally fine to keep (it's a near-zero, cosmetic rounding case, arguably not a "real" discrepancy decision)? Recommend confirming with the user during propose: keep `DIFERENCIAL_FALTANTE` auto-select for the sub-cent case, remove only the `CREDITO` default — this matches the literal ask and preserves a genuinely harmless auto-suggestion.

## Standalone Engram Correction (recommended, not part of this artifact)

Observations #962/#963 ("`usdToBs`/`bsToUsd` leak Decimal instead of number, ~10 failing tests") should be marked superseded — verified live that `currency.ts` correctly returns `Decimal` by design (post `decimal-precision-standard`, 2026-06-19) and `yarn test:run src/lib/__tests__/currency.test.ts` passes 20/20. Recommend the orchestrator or a follow-up session run `mem_compare`/`mem_judge` against those observation IDs with `relation: supersedes` once confirmed.
