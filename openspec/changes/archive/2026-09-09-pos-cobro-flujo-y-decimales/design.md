# Design: POS Cobro Flow — Typography, Layout, Decimal Correctness & Checkout Guards

## Technical Approach

Six contained, additive edits across 4 files + 1 new pure-lib module. No schema/write-path changes. R3 threads an already-exact `Decimal` chain (currently computed but discarded in `cobro-modal.tsx`) through `onSuccess(...)` instead of letting `venta-exitosa-modal.tsx` re-derive it via lossy float math. R4 deletes one auto-select branch. R5/R6 share one pure guard predicate + one side-effecting wrapper, called from all 8 entry points that can start/switch a discrepancy resolution or submit the sale.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| R3 source of truth | Extract pure `calcularPendienteVenta()` in `src/features/ventas/lib/`; `cobro-modal.tsx` calls it, passes `.toNumber()` results (not raw `Decimal`) via `VentaExitosaData` | (a) Inline fix only in `venta-exitosa-modal.tsx`; (b) pass raw `Decimal` instances as props | (a) leaves the exact math untestable and duplicated; (b) is unnecessary — `.toNumber()` on an unrounded chain loses no precision the app cares about (rule #10 rounds only at `formatBs`/`formatUsd`, both accept `DecimalInput`). Matches existing `clamp-saf-monto.ts` precedent (pure fn, feature `lib/`, own test file) |
| R4 scope | Remove only the `else { setDiscrepancyMode('CREDITO') }` branch inside the existing faltante effect | Rewrite/split the whole auto-select effect | Sub-cent `DIFERENCIAL_FALTANTE` suggestion and the VUELTO overpago auto-select must stay byte-identical — minimal diff = minimal regression surface |
| R5/R6 guard | One pure predicate `evaluarPagoPendiente()` (new `lib/pago-guard.ts`) + one `guardOrWarn()` wrapper in `cobro-modal.tsx` for toast + glow; called at all 8 sites | Duplicate the two `if` checks inline at each call site | Proposal's own risk list names "8 entry points" as the failure mode — a single wrapper makes "did I call the guard" auditable in one file scan, and the predicate is unit-testable without rendering the component |
| Glow mechanism | Toggle `glowAddButton` state + Tailwind's built-in `ring-2 ring-primary animate-pulse`, auto-cleared via a tracked `setTimeout` ref | Custom CSS `@keyframes` | Tailwind 4 already ships `animate-pulse`; zero new CSS |
| R2 breakpoint | `window.matchMedia('(max-width: 767px)')`, recomputed inside the existing `useLayoutEffect` (resize/scroll listeners already present) + a `mq.addEventListener('change', ...)` | CSS anchor positioning (`anchor-name`/`position-anchor`) | Confirmed via `modern-web-guidance` in exploration: not Baseline/supported in any major browser yet. `767px` matches Tailwind's unmodified `md`=768px |

## Data Flow — R3

```
cobro-modal.tsx (Decimal, exact)
  totalEfectivoBs, igtfBs, totalPagadoBs, tasaUsada
        │
        ▼
  calcularPendienteVenta()  ──►  { pendienteBs, pendienteUsd }   (lib/pendiente-venta.ts, pure, unit-tested)
        │  .toNumber() each (no intermediate rounding)
        ▼
  onSuccess({ ...VentaExitosaData, pendienteBs, pendienteUsd })
        │
        ▼
venta-exitosa-modal.tsx
  formatBs(data.pendienteBs)  formatUsd(data.pendienteUsd)   ← only rounding happens here (view=2)
```

Before (bug): `venta-exitosa-modal.tsx` computed `saldoPendUsd = Math.max(0, Number((data.totalUsd - totalAbonadoUsd).toFixed(2)))` then `usdToBs(saldoPendUsd, tasa)` — rounds USD to 2dp *before* the Bs conversion. After: both rows read the same pre-rounded-nowhere Decimal chain; only `formatBs`/`formatUsd` round, once, at render.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/features/ventas/lib/pendiente-venta.ts` | Create | `calcularPendienteVenta(totalEfectivoBs, igtfBs, totalPagadoBs, tasa): { pendienteBs4: Decimal; pendienteBs: Decimal; pendienteUsd: Decimal }` — pure, mirrors current inline lines 176/181 |
| `src/features/ventas/lib/__tests__/pendiente-venta.test.ts` | Create | Vitest: $5.41@tasa 500/0 pagos → Bs 2.704,00 exact; partial payment; contado (≤0.01) |
| `src/features/ventas/lib/pago-guard.ts` | Create | `evaluarPagoPendiente({ metodoId, montoStr, referencia })` pure predicate (R5/R6) |
| `src/features/ventas/lib/__tests__/pago-guard.test.ts` | Create | Vitest: all state combinations below |
| `src/features/ventas/components/cobro-modal.tsx` | Modify | Use `calcularPendienteVenta`; extend `onSuccess(...)` payload; delete CREDITO auto-select branch; add `glowAddButton` state + `guardOrWarn()`; call it at 8 sites |
| `src/features/ventas/components/venta-exitosa-modal.tsx` | Modify | Extend `VentaExitosaData` with `pendienteBs`/`pendienteUsd`; delete local `saldoPendUsd`/`totalAbonadoUsd` computation; consume the two new fields in the "Pendiente" row and `construirRecibo` |
| `src/features/ventas/components/pos-terminal.tsx` | Modify | Line ~934: `text-sm` → `text-lg` on the USD total `<p>` (stays `text-muted-foreground`, already below Bs) |
| `src/features/ventas/components/producto-buscador.tsx` | Modify | `useLayoutEffect` (~103-117): add `matchMedia('(max-width: 767px)')` branch — mobile sets `left: 8, width: 'calc(100vw - 16px)'`; desktop unchanged; add `mq` change listener |

## Interfaces / Contracts

```ts
// venta-exitosa-modal.tsx
export interface VentaExitosaData {
  // ...existing fields unchanged
  pendienteBs: number   // NEW — Decimal.max(0, pendienteBs4).toNumber(), exact
  pendienteUsd: number  // NEW — bsToUsd(pendienteBs, tasa).toNumber(), exact
}

// lib/pago-guard.ts
type PagoGuardResult =
  | { blocked: false }
  | { blocked: true; reason: 'ABONO_SIN_AGREGAR' | 'METODO_SIN_MONTO' }
function evaluarPagoPendiente(s: { metodoId: string; montoStr: string; referencia: string }): PagoGuardResult
// montoStr or referencia non-empty  → ABONO_SIN_AGREGAR (R5, priority)
// else metodoId set + montoStr empty → METODO_SIN_MONTO (R6)
// else → not blocked
```

`guardOrWarn()` in `cobro-modal.tsx`: calls the predicate; on block, fires `toast.warning(...)` (R5) or `toast.error(...)` (R6) with the exact Spanish strings from the spec, triggers the glow (`setGlowAddButton(true)` + tracked `setTimeout` reset), returns `false`. Called at the top of `handleProcesar` (covers Procesar button + F12 + Enter shortcut, 1 call site), inside `selectModeRef.current` before any `setDiscrepancyMode` (covers F5/F6/F7, 1 call site), and inside each of the 6 mode-button `onClick`s (VUELTO/SAF/PROPINA/CREDITO/DIFERENCIAL_FALTANTE/ABSORBER). Purely additive: never called where `puedeProcesar` previously allowed a *different* action to fail.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `calcularPendienteVenta` | Vitest, deterministic Decimal cases (spec's $5.41/tasa 500 scenario) |
| Unit | `evaluarPagoPendiente` | Vitest, all `{metodoId, montoStr, referencia}` combinations incl. post-commit reset |
| Manual/visual | R1 typography, R2 mobile dropdown width, glow animation, `puedeProcesar` disabled-state after R4 | QA checklist per proposal risk table; no test infra for visual regression in this repo |

## Migration / Rollout

No migration. 4 modified files + 2 new pure-lib files (+2 test files). `git revert` is sufficient; no data backfill.

## Risks & Rollback

| Area | Risk | Mitigation | Rollback |
|---|---|---|---|
| R3 (financial display) | Wrong field wired in `onSuccess`, PDF recibo (`construirRecibo`) shows stale/wrong pending | `pendienteBs`/`pendienteUsd` sourced from the same pure fn used for the on-screen "Pendiente" row in `cobro-modal.tsx` itself — single source, no divergent recompute | `git revert`, no DB writes touched (`crearVenta` runs before `onSuccess`) |
| R4 (gate) | Removing auto-select could leave `puedeProcesar` accidentally `true` with no mode chosen | Verified: faltante branch of `puedeProcesar` already returns `false` unless `discrepancyMode` is CREDITO/ABSORBER/DIFERENCIAL_FALTANTE — no code change needed there | `git revert` one branch |
| R5/R6 (gate) | Missing 1 of 8 entry points reintroduces the bug silently | Single `guardOrWarn()` wrapper + pure predicate makes site coverage a grep-able list of 8 call sites | `git revert`; guard is additive-only, never loosens `puedeProcesar` |

## Open Questions

None — all six requirements map to confirmed file/line targets from exploration.
