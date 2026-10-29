# Tasks: Reverso de abono directo desde Consulta de Factura (Slice 1)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Unit 1 ~220-290, Unit 2 ~430-590, Unit 3 ~210-350. **Total ~860-1230** |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (adapter) → PR 2 (UI, base=PR1) ; PR 3 (CxC fix, base=tracker, parallel) |
| Delivery strategy | ask-on-risk (default, not overridden) |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Unit 2 alone (~430-590) likely exceeds the 400-line budget by itself. If the real diff confirms the high end, split it further at apply time into 2a (list UI in `factura-detalle-panel.tsx` + wiring) and 2b (confirm modal + its tests) before opening the PR.

### Suggested Work Units

| Unit | Goal | PR | Base |
|------|------|----|----|
| 1 | Classification adapter: `pago_id → ingreso_id`, DIRECT/BATCH/SAF/LEGACY, closed-session check | PR 1 | tracker (`feat/consulta-factura-reverso-abono-directo`, off `origin/develop@027ed93`) |
| 2 | Consulta de Factura UI: individual abonos list + confirm modal (fan-in preview, 3 disables, closed-session warning) + orchestrator wiring | PR 2 | PR 1 branch |
| 3 | `FacturaDetalleCxc` bug-fix: extract `reversarPagoEnTx`, route DIRECT to tesorería orchestrator | PR 3 | tracker (independent of PR1/PR2; may run in parallel) |

## Phase 0: Setup

- [x] 0.1 `git fetch origin && git checkout -b feat/consulta-factura-reverso-abono-directo origin/develop` (must include PR #278, commit `027ed93`).

## Unit 1 — Classification Adapter (PR 1)

- [x] 1.1 Create `src/features/ventas/hooks/use-clasificar-abono-reverso.ts`: pure resolver `resolverIngresoIdParaPago(empresaId, pagoId)` → `SELECT ingreso_id FROM movimientos_bancarios_pagos WHERE pago_id=? AND empresa_id=?`.
- [x] 1.2 In same file, pure classifier: bridge row found → `DIRECT`; no row + `metodos_cobro.deposito_directo=0` → `BATCH`; no row + `deposito_directo=1` → `LEGACY`.
- [x] 1.3 For `DIRECT`, resolve fan-in group (reuse bridge-by-`ingreso_id` lookup) and loop `detectarLoteSafDePago` (`reversa-pago-saf.ts`) per member → `safBlocked: boolean`.
- [x] 1.4 Add closed-session check: resolve `pago.sesion_caja_id` → `sesiones_caja.status`; return `sesionCerrada: boolean`.
- [x] 1.5 Export `useClasificarAbonoParaReverso(pagoId)` hook wrapping 1.1-1.4, filtered by `empresa_id` via `useCurrentUser()`.
- [x] 1.6 Create `src/features/ventas/hooks/__tests__/use-clasificar-abono-reverso.test.ts`: cases DIRECT, BATCH, LEGACY, DIRECT+SAF-blocked, DIRECT+sesión CERRADA.
- [x] 1.7 Verify: `yarn test:run src/features/ventas/hooks/__tests__/use-clasificar-abono-reverso.test.ts`.

## Unit 2 — Consulta de Factura UI (PR 2, base=PR1 branch)

- [ ] 2.1 In `src/features/ventas/components/factura-detalle-panel.tsx`, add a new section listing raw `usePagosFactura` rows (not `agruparPagosPorMetodo` output) with a per-row "Reversar" action (hidden/disabled when `is_reversed`).
- [ ] 2.2 Create `src/features/ventas/components/confirmar-reverso-abono-modal.tsx`: on open, call `useClasificarAbonoParaReverso(pagoId)`; if DIRECT, call `previewFacturasAfectadas(empresaId, ingresoId)` to render only-this-invoice vs fan-in list.
- [ ] 2.3 Render 3 distinct disabled states with exact messages: BATCH → "reverso por lote no disponible todavía"; SAF → existing `SAF_BLOCK_MESSAGE` copy; LEGACY → "sin trazabilidad" message.
- [ ] 2.4 Render passive warning banner when `sesionCerrada`; confirm button stays enabled in that case (warn-and-allow per decision 3A).
- [ ] 2.5 On confirm (DIRECT, not SAF-blocked), call `reversarAbonoDirectoDesdeTesoreria({ ingresoId, ... })`; on success, close modal, toast (Sonner), invalidate affected PowerSync queries.
- [ ] 2.6 Wire list+modal through `consulta-factura-modal.tsx` so all 4 usage sites (`cliente-detalle.tsx`, `ventas-consultas-modal.tsx`, `facturas-empresa-tab.tsx`, `nota-credito-pos-modal.tsx` Reimprimir) inherit it without per-site edits.
- [ ] 2.7 Create `src/features/ventas/components/__tests__/confirmar-reverso-abono-modal.test.tsx`: fan-in list render, each of the 3 disabled states with its message, closed-session warning + enabled confirm, successful confirm invokes orchestrator with correct `ingresoId`.
- [ ] 2.8 Update `src/features/ventas/components/__tests__/factura-detalle-panel.test.tsx`: assert individual abono rows render (not grouped) with a "Reversar" action per row.
- [ ] 2.9 Verify: `yarn test:run src/features/ventas/components/__tests__/confirmar-reverso-abono-modal.test.tsx src/features/ventas/components/__tests__/factura-detalle-panel.test.tsx`.

## Unit 3 — `FacturaDetalleCxc` Bug Fix (PR 3, base=tracker)

- [ ] 3.1 In `src/features/cxc/hooks/use-cxc.ts`, extract `registrarReversoAbono`'s internal body into `reversarPagoEnTx(tx, params)` (accepts caller's `tx`, opens no transaction of its own); `registrarReversoAbono` becomes a thin wrapper opening its own `db.writeTransaction` and delegating.
- [ ] 3.2 Extend `src/features/cxc/hooks/__tests__/reversar-pago-en-tx.test.ts` to assert `reversarPagoEnTx` never opens a nested `db.writeTransaction`.
- [ ] 3.3 In `src/features/cxc/components/factura-detalle-cxc.tsx` `handleConfirmReverso`, resolve the bridge (`SELECT ingreso_id FROM movimientos_bancarios_pagos WHERE pago_id=? AND empresa_id=?`; reuse Unit 1's resolver if already merged, else inline).
- [ ] 3.4 Branch: DIRECT → `reversarAbonoDirectoDesdeTesoreria({ ingresoId, ... })`; non-DIRECT → keep calling `registrarReversoAbono` unchanged.
- [ ] 3.5 Create `src/features/cxc/components/__tests__/factura-detalle-cxc.test.tsx` (new file, none exists today): DIRECT pago routes to `reversarAbonoDirectoDesdeTesoreria`; non-DIRECT pago still routes to `registrarReversoAbono` with identical prior behavior (regression guard).
- [ ] 3.6 Verify: `yarn test:run src/features/cxc/hooks/__tests__/reversar-pago-en-tx.test.ts src/features/cxc/components/__tests__/factura-detalle-cxc.test.tsx`.

## Fuera de alcance (no bloqueante)

- Slice 2 (batch single-factura + guard de sesión cerrada), Slice 3 (SAF reconciliación), cambio #3 (presentación en cuadre), fan-in de abono global por lote, y el bug de puente POS-global-abono (#5944).
