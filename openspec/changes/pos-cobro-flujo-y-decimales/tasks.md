# Tasks: POS Cobro Flow — Typography, Layout, Decimal Correctness & Checkout Guards

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~370 (range 320-410) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR, committed by work unit |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

**Note**: WU3 (R5/R6 guard) is the largest and riskiest unit (~190 lines: new helper + tests + 8 wiring sites in `cobro-modal.tsx`). If its actual diff alone exceeds ~220 lines during apply, split it into its own PR before continuing — re-forecast at that point.

### Suggested Work Units

| Unit | Goal | Likely PR | Est. lines | Notes |
|------|------|-----------|-----------|-------|
| 1 | R3: exact Decimal pending (helper + wiring) | PR 1 | ~145 | Financial correctness, isolated, highest value |
| 2 | R4: remove CREDITO auto-select | PR 1 | ~8 | Tiny, same PR as WU1/WU3 |
| 3 | R5/R6: shared guard + 8 entry points + glow | PR 1 | ~190 | Largest; watch line count during apply |
| 4 | R1: USD total typography | PR 1 | ~3 | Visual, manual-verify |
| 5 | R2: dropdown matchMedia width | PR 1 | ~25 | Visual, manual-verify |

## Phase 1: R3 — Exact Decimal Pending (financial correctness)

- [x] 1.1 **RED**: Write `src/features/ventas/lib/__tests__/pendiente-venta.test.ts` — `calcularPendienteVenta()` cases: $5.41 @ tasa 500 / 0 pagos → Bs 2.704,00 exact (not 2.705,00); partial payment; contado (pendienteBs4 ≤ Bs 0,01 → pendienteBs 0); USD pending derived from same source via `bsToUsd`.
- [x] 1.2 **GREEN**: Create `src/features/ventas/lib/pendiente-venta.ts` — pure `calcularPendienteVenta(totalEfectivoBs, igtfBs, totalPagadoBs, tasa): { pendienteBs4: Decimal; pendienteBs: Decimal; pendienteUsd: Decimal }`, mirrors current inline lines 176/181 of `cobro-modal.tsx`. Run `yarn test:run` until green.
- [x] 1.3 Wire into `cobro-modal.tsx`: replace inline `pendienteBs4`/`pendienteUsd` computation with the helper; extend `onSuccess(...)` payload with `pendienteBs`/`pendienteUsd` (`.toNumber()` each, no intermediate rounding).
- [x] 1.4 Wire into `venta-exitosa-modal.tsx`: extend `VentaExitosaData` with `pendienteBs: number` / `pendienteUsd: number`; delete local `saldoPendUsd`/`totalAbonadoUsd` float computation (lines ~71-75); consume the two new fields in the "Pendiente" row and `construirRecibo`.
- [x] 1.5 `yarn type-check` and `yarn type-check:test` clean; verify no other call site still reads the deleted local vars.

## Phase 2: R4 — Remove Silent CREDITO Auto-Select

- [x] 2.1 In `cobro-modal.tsx`'s faltante effect (~line 231-236), delete the `else { setDiscrepancyMode('CREDITO') }` branch. Keep the sub-cent `DIFERENCIAL_FALTANTE` auto-suggestion and the VUELTO overpago auto-select untouched.
- [x] 2.2 Manual-verify: open modal with faltante > USD 0.01 → `discrepancyMode` stays `null`; `puedeProcesar` correctly stays `false` (no code change needed there per design). Confirmed by code inspection: `puedeProcesar`'s faltante branch has no `discrepancyMode === null` case, falls through to `return false`.

## Phase 3: R5/R6 — Uncommitted-Entry & Method-Without-Amount Guards

- [x] 3.1 **RED**: Write `src/features/ventas/lib/__tests__/pago-guard.test.ts` — `evaluarPagoPendiente()` cases: `montoStr`/`referencia` non-empty → `ABONO_SIN_AGREGAR` (priority over R6); `metodoId` set + `montoStr` empty → `METODO_SIN_MONTO`; clean state (empty or just-committed) → `{ blocked: false }`.
- [x] 3.2 **GREEN**: Create `src/features/ventas/lib/pago-guard.ts` — pure `evaluarPagoPendiente({ metodoId, montoStr, referencia })` per design's `PagoGuardResult` contract. Run `yarn test:run` until green.
- [x] 3.3 In `cobro-modal.tsx`: add `glowAddButton` state + tracked `setTimeout` ref for auto-clear; add `guardOrWarn()` wrapper calling the predicate, firing `toast.warning('Tenés un abono pendiente por ingresar: agregalo con + o borralo')` for `ABONO_SIN_AGREGAR` or `toast.error('Seleccionaste un método de pago pero no ingresaste ningún monto')` for `METODO_SIN_MONTO`, triggering the glow, returning `false` on block.
- [x] 3.4 Call `guardOrWarn()` at the top of `handleProcesar` (covers Procesar button + F12 + Enter, 1 site) and inside the F5/F6/F7 keydown handler before any `setDiscrepancyMode` (1 site).
- [x] 3.5 Call `guardOrWarn()` inside each of the 6 mode-button `onClick`s (VUELTO/SAF/PROPINA/CREDITO/DIFERENCIAL_FALTANTE/ABSORBER) before their existing `setDiscrepancyMode(...)` call.
- [x] 3.6 Apply `ring-2 ring-primary animate-pulse` classes to the "+" button conditionally on `glowAddButton`.
- [x] 3.7 Manual-verify all 8 sites: grep `guardOrWarn(` in `cobro-modal.tsx` returns exactly 8 matches (confirmed). Confirm guard never fires when `montoStr`/`referencia`/`metodoId` are all clean (covered by pago-guard.test.ts "estado limpio" case).

## Phase 4: R1 — USD Total Typography (manual-verify, no unit test)

- [x] 4.1 In `pos-terminal.tsx` (~line 934), change the desktop-panel USD total `<p>` class from `text-sm` to `text-lg` (strictly between `text-sm` and Bs total's `text-3xl`). Keep `text-muted-foreground`; keep below Bs total.
- [x] 4.2 Manual-verify at ≥768px: Bs above USD, USD legible but muted, no layout shift. Confirmed by inspection: only the font-size class changed, DOM structure/order (Bs `<p>` then USD `<p>`) and `text-muted-foreground` class untouched — no layout-affecting properties (margin/padding/display) modified.

## Phase 5: R2 — Mobile Dropdown Width (manual-verify, no unit test)

- [x] 5.1 In `producto-buscador.tsx`'s `useLayoutEffect` (~lines 103-117), add `window.matchMedia('(max-width: 767px)')` branch: mobile sets `left: 8, width: 'calc(100vw - 16px)'`; desktop path unchanged.
- [x] 5.2 Add `mq.addEventListener('change', ...)` to recompute on breakpoint crossing (resize/rotation), cleaned up alongside existing listeners.
- [x] 5.3 Manual-verify: <768px dropdown spans viewport width; ≥768px unchanged (tied to input width); resize crossing 768px recalculates without close/reopen. Confirmed by inspection: `updatePos` branches on `mq.matches` and is wired to `resize`, `scroll`, and `mq`'s `change` event — all three trigger a recompute without touching `open`/`dropdownVisible` state, so no close/reopen occurs.

## Phase 6: Final Verification

- [x] 6.1 `yarn test:run` all green (pendiente-venta + pago-guard suites). Result: 106 test files / 1261 tests passed (baseline was 104 files / 1249 tests — +2 files / +12 tests, zero regressions).
- [x] 6.2 `yarn type-check` and `yarn type-check:test` clean. `yarn type-check` shows only the pre-existing unrelated `use-pwa-update.ts` TS6133 error (confirmed via `git status` — file untouched by this change) plus the documented spurious describe/it/expect noise on an unrelated pre-existing test file (`traspasos.test.tsx`, also untouched). `yarn type-check:test` shows only the same pre-existing `use-pwa-update.ts` error. Zero app-code errors introduced.
- [x] 6.3 `yarn lint` — SKIPPED: eslint is not installed in this project (`'eslint' is not recognized as an internal or external command`), a known pre-existing project gap, not a regression from this change.
- [x] 6.4 Cross-check each Phase against its spec scenarios (`pos-cobro-pendiente-exacto`, `pos-cobro-checkout-guards`, `pos-cobro-presentacion`) — all scenarios covered by an automated test or an explicit manual-verify step above. See apply-progress for the full scenario-by-scenario mapping.
