# Tasks: Precio Venta Bs editable + cascada bidireccional (sandbox Tasa Paralela, modo manual)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~505 (gating ~35, tests ~180, producto-form.tsx ~290) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (pure functions + tests, ~215) → PR 2 (form state/handlers/JSX, ~290) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (ask user: stacked-to-main vs feature-branch-chain) |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | 3 pure cascada functions + full test coverage (TDD) | PR 1 | Self-contained, `yarn test:run` is the verification; zero JSX/UI risk; independently revertible |
| 2 | Form state, handlers, `calcularPreviewNivel` branch, pre-fill, JSX column/inputs/block | PR 2 | Depends on PR 1's exports; base = PR 1 branch (or main if stacked) |

## Phase 1: Pure Functions — TDD (producto-precio-gating.ts)

- [x] 1.1 RED: tests for `calcularMargenPreservandoPvp` (no coverage today) — costo<=0→0, pvp<=0→0, normal case.
- [x] 1.2 RED: tests for `cascadaDesdeMargenManual` — margen normal, margen muy negativo (pvp clamp a 0), margen=0.
- [x] 1.3 RED: tests for `cascadaDesdePvpUsdManual` — pvp>costo, pvp<costo, pvp=0.
- [x] 1.4 RED: tests for `cascadaDesdePvpBsManual` — tasa normal, tasa=0 guard (no NaN/Infinity), round-trip USD→Bs→USD precision.
- [x] 1.5 GREEN: implement the 3 functions in `producto-precio-gating.ts` (compose existing `calcularPrecioPreservandoMargenD`/`calcularMargenPreservandoPvp` + `usdToBs`/`bsToUsd` from `src/lib/currency.ts`, new import).
- [x] 1.6 `yarn test:run` green; confirm no regression in the existing 141-line test file.

## Phase 2: Form State & Non-JSX Wiring (producto-form.tsx)

- [x] 2.1 Add 6 `useState` + 6 `useRef` near L482-526: `sbManualPvpUsd{Detal,Mayor,Especial}`, `sbManualPvpBs{Detal,Mayor,Especial}`.
- [x] 2.2 Add 6 `*Completo` setters (e.g. `setSbManualPvpUsdDetalCompleto`) writing ref + display, same molde as `setPrecioVentaCompleto`.
- [x] 2.3 Bifurcate `calcularPreviewNivel` (L1143-1170): 'manual' branch reads margen/pvpUsd/pvpBs from state/refs (no recompute); 'margen'/'mantener_pvp' branches stay byte-identical.
- [x] 2.4 Extend `handleSetModoRecalculo('manual')` pre-fill (L1230-1239) to also pre-fill PVP $/Bs from `precioVentaUsdFullRef`/etc + `usdToBs(tasaValor)`.
- [x] 2.5 Add 9 handlers (3 fields × 3 niveles): each builds a fresh Decimal from raw input (never the masked display), calls the matching cascada function, writes the other 2 fields.
- [x] 2.6 Add `hayMargenNegativoManual()` helper (direct state read, no memo). **Deviation**: the actual boolean check was extracted into a pure, exported, unit-tested `hayMargenNegativoEnNiveles()` in `producto-precio-gating.ts`; the component helper is a thin wrapper around it (improvement, no behavior change).

## Phase 3: JSX Wiring (producto-form.tsx, L2657-2750)

- [x] 3.1 Add "Precio Venta Bs" `<th>` + conditional `<td>` per nivel, visible only when `modoRecalculo === 'manual'`.
- [x] 3.2 Wire Precio $ input per nivel: onChange (fresh Decimal), onFocus `toFullDisplay(ref)`, onBlur `toMaskedDisplay(ref)`, Enter→blur — pattern from L2869-2902.
- [x] 3.3 Wire Precio Bs input per nivel: same onFocus/onBlur/onChange contract using the respective `*FullRef`.
- [x] 3.4 Add per-row message "Margen negativo en este nivel." when that nivel's margen < 0.
- [x] 3.5 Disable "Confirmar cambios" (L2735) via `hayMargenNegativoManual()`; show "No se puede confirmar: hay niveles con margen negativo." near the button.

## Phase 4: Verification

- [x] 4.1 `yarn type-check` — no `any`, no new errors.
- [x] 4.2 `yarn lint` — SKIPPED (eslint not installed in this repo; documented tooling guard, not a deviation).
- [x] 4.3 `yarn test:run` — full suite green (2462/2465, 3 pre-existing unrelated PowerSync/jsdom failures); manual smoke test confirmed 'margen'/'mantener_pvp' branches byte-identical (no E2E runner exists for this sandbox).

## Delivery Record

| PR | Scope | Lines | Verdict |
|----|-------|-------|---------|
| #270 (merged 2026-10-26) | PR 1/2 — 3 pure cascade functions + tests | 176 (2 files) | PASS |
| #271 (merged 2026-10-27) | PR 2/2 — form state/handlers/JSX wiring | 451 (3 files, 51 over 400-line budget) | PASS WITH WARNINGS — accepted as `size:exception` |

### Post-merge fast-follows (direct, non-SDD PRs — not part of this change's task list, mentioned for traceability)
- #272 (merged 2026-10-27): select-all-on-focus for price/cost inputs in producto-form.
- #273 (merged 2026-10-27): coherent manual-mode pre-fill (keep margin, recompute PVP) — fixed a prefill inconsistency found after #271 shipped.
