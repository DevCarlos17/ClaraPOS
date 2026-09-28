# Tasks: Wizard mobile para Compras y Gastos

## Review Workload Forecast

| PR | Files changed | Est. lines | 400 budget | Chained | Decision before apply |
|---|---|---|---|---|---|
| W1 | 3 (2 new, 1 modify) | ~300 | OK | No | Yes (ask-always) |
| W2a | 4 new, 1 modify | ~400 | At limit | Yes (1/2) | Yes |
| W2b | 5 new | ~750 | Over | Yes (2/2) | Yes |
| W3a | 4 new, 1 modify | ~450 | Over | Yes (1/2) | Yes |
| W3b | 4 new | ~560 | Over | Yes (2/2) | Yes |
| W4a | 2 new, 2 modify | ~310 | OK | Yes (1/3) | Yes |
| W4b-i | 1 new, 1 modify | ~360 | OK | Yes (2/3) | Yes |
| W4b-ii | 1 new, 1 modify | ~260 | OK | Yes (3/3) | Yes |
| W5 | 2 modify | ~90 | OK | No | Yes |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

Chain: W2a→W2b (own tracker), W3a→W3b (own tracker), W4a→W4b-i→W4b-ii (own tracker). W1 and W5 are standalone. Each `feature-branch-chain` PR base = tracker (PR1) or previous sibling branch (PR2+).

### Suggested Work Units

| Unit | Goal | PR | Notes |
|---|---|---|---|
| 1 | Shared wizard primitives | W1 | No deps. Ships first, unlocks W2b/W3b. |
| 2 | Gasto fiscal extraction + desktop refactor | W2a | Depends on W1 merged (imports WizardStepIndicator later, but hook itself has no dep — order for review clarity only). |
| 3 | Gasto wizard steps + orchestrator | W2b | Base = W2a branch. |
| 4 | Compra fiscal extraction + desktop refactor | W3a | No dep on W2. |
| 5 | Compra wizard cabecera+cargos/pagos | W3b | Base = W3a branch. |
| 6 | PVP pure-fn extraction + sheet.tsx container plumbing | W4a | Base = W3b branch (needs compra-wizard-store.ts to exist). |
| 7 | paso-productos.tsx + store line actions | W4b-i | Base = W4a branch. |
| 8 | pvp-confirm-sheet.tsx + wiring | W4b-ii | Base = W4b-i branch. |
| 9 | Route bifurcation (useMobile gate) | W5 | Base = main, after W2b+W3b+W4b-ii merged. |

---

## PR W1 — Shared wizard primitives (~300 lines, Low risk)

- [ ] 1.1 Create `src/components/shared/wizard-step-indicator.tsx`: extract indicator block from `nueva-cita-wizard.tsx` L210-257, generalize props to `{ steps: { label: string }[]; currentStep: number; completedSteps: number[]; onStepClick?: (n: number) => void }`.
- [ ] 1.2 Create `src/components/shared/wizard-acumulador.tsx`: collapsible sticky summary per design contract — props `{ itemCount, totalLabel, lines: {label, detail?, amountLabel}[], paymentSummary?: {label, amountLabel}[], defaultExpanded? }`. `sticky top-0 z-10 bg-card border-b`, chevron toggles local `useState`.
- [ ] 1.3 Modify `src/features/citas/components/wizard/nueva-cita-wizard.tsx`: replace inline indicator block with `<WizardStepIndicator>`. No behavior change.
- [ ] 1.4 Manual-QA: cita wizard renders identically (steps, active/completed states, click-to-navigate) before/after.
- [ ] 1.5 Verify: `yarn type-check`, `yarn test:run`.

---

## PR W2a — Gasto fiscal extraction + desktop refactor (~400 lines, chained 1/2)

- [ ] 2a.1 RED: create `src/features/contabilidad/lib/use-gasto-totales.test.ts` — write failing Vitest cases first, using exact input/output pairs read live from `gasto-form.tsx` L470-552 (Gravable/Exento/Exonerado, USD/BS, tasa paralela on/off).
- [ ] 2a.2 GREEN: create `src/features/contabilidad/lib/use-gasto-totales.ts` implementing `UseGastoTotalesParams`/`UseGastoTotalesResult` per design contract, 1:1 extraction of `gasto-form.tsx` L470-552 logic (decimal.js only, no float math). Make 2a.1 pass.
- [ ] 2a.3 VERIFY: confirm test outputs are byte-identical to current `gasto-form.tsx` console values for the same inputs (manual comparison, log before/after).
- [ ] 2a.4 Modify `src/features/contabilidad/components/gasto-form.tsx`: replace L470-552 block with `useGastoTotales(...)` call. No JSX/behavior change.
- [ ] 2a.5 Create `src/stores/gasto-wizard-store.ts`: Zustand store, `GastoWizardState` per design contract (step 1|2|3, all step-1/2/3 fields, `isStep1Valid`/`isStep2Valid`/`isStep3Valid` selectors, `openSheet`/`closeSheet`/`setStep`/`setIdentificacion`/`setMonto`/`agregarPago`/`actualizarPago`/`eliminarPago`/`reset`). No `persist` middleware — draft actions (`hidratarDesdeBorrador`, `guardarDraft`) delegate to existing `useGastoBorradorStore` (same key `clarapos-gasto-borrador`), no new localStorage key.
- [ ] 2a.6 Manual-QA (desktop regression): run gasto-form.tsx flows — Gravable+USD, Exento+BS, tasa paralela ON — confirm identical totals/UI to pre-refactor baseline.
- [ ] 2a.7 Verify: `yarn type-check`, `yarn test:run` (use-gasto-totales.test.ts passes).

---

## PR W2b — Gasto wizard steps + orchestrator (~750 lines, chained 2/2, base=W2a)

- [ ] 2b.1 Create `src/features/contabilidad/components/wizard/paso-identificacion.tsx`: no-props, reads `useGastoWizardStore()`. Fields: nroFactura, nroControl, cuentaId (select from `useCuentasDetallePorTipo`), proveedorId (opt select), descripcion (textarea), fecha (date, auto-fills tasaInterna on change), observaciones. Uses `store.setIdentificacion`.
- [ ] 2b.2 Create `src/features/contabilidad/components/wizard/paso-monto.tsx`: monedaFactura toggle, usaTasaParalela checkbox, tasaProveedor (conditional), tasaInterna (auto/manual override), tipoImpuesto 3-button toggle, montoFactura input, porcentajeIva (conditional, catalog shortcuts). Live totals via `useGastoTotales` fed by store state. Uses `store.setMonto`.
- [ ] 2b.3 Create `src/features/contabilidad/components/wizard/paso-pagos.tsx`: pagos rows (metodo select, banco, moneda, monto, referencia), add/remove via `store.agregarPago`/`actualizarPago`/`eliminarPago`. Saldo pendiente banners from `useGastoTotales`. Session-active detection sets `destinoCobro=CAJA` (component-level `useEffect`, same pattern as `gasto-form.tsx` L368-391 — no I/O in the store).
- [ ] 2b.4 Create `src/features/contabilidad/components/wizard/gasto-wizard.tsx`: orchestrator — `WizardStepIndicator`, `WizardAcumulador` (expanded on steps 1/3), step routing 1→2→3, validity gating from `isStepNValid()`, inline confirmation summary before submit, calls same `crearGasto` mutation as `gasto-form.tsx`.
- [ ] 2b.5 Create `src/features/contabilidad/components/wizard/gasto-wizard-sheet.tsx`: `BottomSheet` wrapper, `title="Nuevo Gasto"`, footer Back/Next/Submit buttons (h-11 rounded-xl), calls `store.hidratarDesdeBorrador()` on open.
- [ ] 2b.6 Manual-QA checklist: 3 steps fill correctly; fecha change auto-fills tasa; Gravable reveals IVA fields; pagos add/remove; submit creates gasto; reopening sheet after close recovers draft; labels use `text-muted-foreground`, values `text-foreground font-semibold`.
- [ ] 2b.7 Verify: `yarn type-check`, `yarn test:run`.

---

## PR W3a — Compra fiscal extraction + desktop refactor (~450 lines, chained 1/2)

- [ ] 3a.1 RED: create `src/features/inventario/lib/use-compra-desglose-usd.test.ts` — failing Vitest cases from live `compra-form.tsx` L443-568 outputs: single línea gravable, single exento, multi-línea mixed, with/without cargo, tasa paralela on/off.
- [ ] 3a.2 GREEN: create `src/features/inventario/lib/use-compra-desglose-usd.ts` implementing `UseCompraDesgloseUsdParams`/`UseCompraDesgloseUsdResult` per design contract (reuses existing `DesgloseFiscalUsd`/`TotalLineasCargo` types from `compra-lineas-cargo.ts`), decimal.js only. Make 3a.1 pass.
- [ ] 3a.3 VERIFY: byte-identical comparison vs current `compra-form.tsx` console output for same inputs.
- [ ] 3a.4 Modify `src/features/inventario/components/compras/compra-form.tsx`: replace L443-568 block with `useCompraDesgloseUsd(...)`. No JSX/behavior change.
- [ ] 3a.5 Create `src/stores/compra-wizard-store.ts`: Zustand store, `CompraWizardState` per design contract — step, cabecera fields (fechaFactura, nroFactura, nroControl, proveedorId, moneda, usaTasaParalela, tasaInterna, tasaProveedor), `lineas: LineaWizardCompra[]`, `pvpPendienteLineaIdx`, `lineasCargo: CargoWizard[]`, `pagos: PagoWizardCompra[]`, `destinoCobro`/`sesionActivaId`, sheet actions, `setCabecera`, `agregarLinea`/`actualizarLinea`/`quitarLinea`, `agregarCargo`/`actualizarCargo`/`quitarCargo`, `agregarPago`/`actualizarPago`/`quitarPago`, `isStep1Valid`/`isStep2Valid`/`isStep3Valid`. PVP actions (`abrirPvpDecision`/`confirmarPvpDecision`/`cancelarPvpDecision`) stubbed as no-ops in this PR (real impl lands in W4a) — do NOT wire to `compra-pvp-decision.ts` yet, it doesn't exist. `guardarDraft`/`restaurarDraft` use own key `compra_wizard_draft`, 24h expiry (same pattern as `cita-wizard-store.ts`).
- [ ] 3a.6 Manual-QA (desktop regression): compra-form.tsx flows — single línea gravable, multi-línea mixed, cargo EMPAQUE+FLETE, tasa paralela ON — identical totals/UI to baseline.
- [ ] 3a.7 Verify: `yarn type-check`, `yarn test:run`.

---

## PR W3b — Compra wizard cabecera + cargos/pagos (~560 lines, chained 2/2, base=W3a)

- [ ] 3b.1 Create `src/features/inventario/components/compras/wizard/paso-cabecera.tsx`: fechaFactura, nroFactura (+key-guard/paste-sanitizer, same as `compra-form.tsx`), nroControl, proveedorId (select + "Nuevo" trigger), moneda toggle USD/Bs, usaTasaParalela checkbox, tasaProveedor (conditional), tasaInterna (auto-fill by fecha, manual override). Uses `store.setCabecera`.
- [ ] 3b.2 Create `src/features/inventario/components/compras/wizard/paso-cargos-pagos.tsx`: lineasCargo rows (concepto EMPAQUE/FLETE, monto, porcentaje_iva select, add/remove via `store.agregarCargo`/`actualizarCargo`/`quitarCargo`), pagos rows (metodo, monto, "Max" button, referencia conditional, destinoCobro CAJA/TESORERIA toggle, add/remove via `store.agregarPago`/`actualizarPago`/`quitarPago`), running totals from `useCompraDesgloseUsd`.
- [ ] 3b.3 Create `src/features/inventario/components/compras/wizard/compra-wizard.tsx`: orchestrator — `WizardStepIndicator`, `WizardAcumulador` (collapsed default on step 2), step routing 1→2→3, `isStepNValid` gating, inline confirmation summary (mirrors `compra-form.tsx` `showConfirm` Dialog content), calls `crearCompra`. Step 2 renders a **placeholder**: "Agregar productos →" button (wired to real `paso-productos.tsx` in W4b-i) with empty `WizardAcumulador` state; `isStep2Valid()` temporarily allows `lineas.length === 0` in this PR only (tightened back to real gating in W4b-i).
- [ ] 3b.4 Create `src/features/inventario/components/compras/wizard/compra-wizard-sheet.tsx`: `BottomSheet` wrapper, `title="Nueva Factura de Compra"`, footer Back/Next/Confirmar, restores draft via `store.restaurarDraft()` on open.
- [ ] 3b.5 Manual-QA checklist: Step 1 fills + tasa auto-fill + moneda switch; Step 3 cargo/pago add-remove; "Max" button fills monto; submit with 0 products succeeds (temporary W3 scope — real product gate lands W4b-i); labels/values a11y pattern respected.
- [ ] 3b.6 Verify: `yarn type-check`, `yarn test:run`.

---

## PR W4a — PVP pure-fn extraction + sheet stacking plumbing (~310 lines, chained 1/3, base=W3b)

- [ ] 4a.1 RED: create `src/features/inventario/lib/compra-pvp-decision.test.ts` — failing Vitest cases from live `compra-form.tsx` L713-956 outputs: cost unchanged (no PVP prompt), cost changed (prompt required), each of the 3 decisions (Mantener PVP / Mantener margen % / Manual), multi-level, USD/BS.
- [ ] 4a.2 GREEN: create `src/features/inventario/lib/compra-pvp-decision.ts` implementing the 5 pure functions per design contract (`getCostoNuevoUsdForLinea`, `construirPvpNiveles`, `aplicarDecisionNivel`, `actualizarPvpInput`, `actualizarMargenInput`), parametrized (no `setLineas` dependency), decimal.js only. Make 4a.1 pass.
- [ ] 4a.3 VERIFY: byte-identical comparison vs current `compra-form.tsx` PVP-gating console output for same inputs.
- [ ] 4a.4 Modify `src/features/inventario/components/compras/compra-form.tsx`: `handleNuevoCostoChange` and related PVP handlers (L713-956) delegate their internal calc to the 5 extracted functions; handlers themselves stay (same signatures, same `setLineas` calls). No JSX/behavior change.
- [ ] 4a.5 Modify `src/stores/compra-wizard-store.ts`: wire real PVP actions — `abrirPvpDecision(idx)` sets `pvpPendienteLineaIdx`; `confirmarPvpDecision(idx, niveles)` writes `lineas[idx].pvp_niveles` and clears pending; `cancelarPvpDecision(idx)` reverts `nuevo_costo_raw=''`/`costo_input=costo_actual`/`pvp_niveles=[]` and clears pending. All call `compra-pvp-decision.ts` functions, never mutate state directly outside a Zustand action.
- [ ] 4a.6 Modify `src/components/ui/sheet.tsx`: `SheetContent` accepts optional `container?: HTMLElement | null` prop, forwards to `SheetPortal` (same pattern as `dialog.tsx` L51/67).
- [ ] 4a.7 Modify `src/components/shared/bottom-sheet.tsx`: forwards optional `portalContainer` prop to `SheetContent`'s new `container` prop; exposes the `SheetContent` DOM node via a `contentRef` prop so a child Sheet can stack on it.
- [ ] 4a.8 Manual-QA (desktop regression): compra-form.tsx PVP flow — cost change triggers modal, each of 3 decisions per level, violated-margin red highlight, confirm/cancel — identical to baseline.
- [ ] 4a.9 Verify: `yarn type-check`, `yarn test:run` (compra-pvp-decision.test.ts passes).

---

## PR W4b-i — paso-productos.tsx + store line actions (~360 lines, chained 2/3, base=W4a)

- [ ] 4b-i.1 Create `src/features/inventario/components/compras/wizard/paso-productos.tsx`: product search bar (`useProductosTipo('P')`, excludes already-added lineas), selection card per added línea (nombre, costo actual, cantidad input, unidad select via `useConversiones`, lote fields when `maneja_lotes===1`, `nuevo_costo_raw` input). On cost-changed input → calls `store.abrirPvpDecision(idx)` (auto-open, mirrors desktop). On cost unchanged → `store.agregarLinea(producto)` directly, no PVP prompt. Shows inline "Confirmar precios →" affordance when `pvpPendienteLineaIdx !== null` (no modal yet — that's W4b-ii).
- [ ] 4b-i.2 Modify `src/features/inventario/components/compras/wizard/compra-wizard.tsx`: replace Step 2 placeholder with `<PasoProductos>`; `WizardAcumulador` on step 2 defaults `defaultExpanded=false` per design (product list is primary content).
- [ ] 4b-i.3 Modify `src/stores/compra-wizard-store.ts`: tighten `isStep2Valid()` to real gating — `lineas.length > 0 && !lineas.some(l => lineaTieneDecisionBloqueante(costoCambio(l), l.pvp_niveles))` (removes the W3b temporary `lineas.length === 0` allowance).
- [ ] 4b-i.4 Manual-QA checklist: search/add product with unchanged cost adds directly; search/add with changed cost blocks step-2 completion until PVP resolved (no modal to resolve it yet in this PR — expected, verify the block itself, not the modal); lote fields appear conditionally; unidad conversion updates cantidad correctly.
- [ ] 4b-i.5 Verify: `yarn type-check`, `yarn test:run`.

---

## PR W4b-ii — pvp-confirm-sheet.tsx + wiring (~260 lines, chained 3/3, base=W4b-i)

- [ ] 4b-ii.1 Create `src/features/inventario/components/compras/wizard/pvp-confirm-sheet.tsx`: secondary `<Sheet side="bottom">`, no props — reads `pvpPendienteLineaIdx` from store, renders `null` when `null`. `container` prop = the `contentRef` node exposed by `CompraWizardSheet` (via `bottom-sheet.tsx`'s new `contentRef`). Shows producto name/código, costo nuevo vs actual, per-nivel rows (nombre, PVP actual, margen actual, 3 decision buttons + manual input), red highlight row when `violado`. "Confirmar" disabled until `lineaTieneDecisionBloqueante(true, niveles) === false`; on confirm calls `store.confirmarPvpDecision(idx, niveles)`; "Cancelar" calls `store.cancelarPvpDecision(idx)`.
- [ ] 4b-ii.2 Modify `src/features/inventario/components/compras/wizard/compra-wizard-sheet.tsx`: pass a ref to the underlying `SheetContent` node down through `BottomSheet`'s `contentRef` prop and forward it as `portalContainer` context for `pvp-confirm-sheet.tsx` (render `<PvpConfirmSheet>` inside, alongside `<PasoProductos>`).
- [ ] 4b-ii.3 Manual-QA — full wizard E2E: complete compra with 2 products (one cost-changed, one unchanged), 1 cargo EMPAQUE, 1 pago CONTADO. Verify PVP mini-modal opens/closes correctly and stacks visually above the wizard sheet (not behind), decisions persist in `WizardAcumulador`, submit creates the compra with correct kardex entries matching what the desktop form would produce for the same inputs.
- [ ] 4b-ii.4 Verify: `yarn type-check`, `yarn test:run`.

---

## PR W5 — Route bifurcation (~90 lines, Low risk, base=main after all wizards merged)

- [ ] 5.1 Modify `src/features/inventario/components/compras/compra-list.tsx`: wrap "Registrar compra" button — `useMobile(1024)`: desktop branch unchanged (existing navigation), mobile branch opens `CompraWizardSheet` (local `useState` open/close).
- [ ] 5.2 Modify `src/features/contabilidad/components/gastos-dashboard.tsx`: wrap "+ Agregar gasto" button — `useMobile(1024)`: desktop branch unchanged (existing inline form), mobile branch opens `GastoWizardSheet` (local `useState` open/close).
- [ ] 5.3 Manual-QA: desktop (≥1024px) both buttons behave exactly as before this change; mobile (<1024px) both buttons open their respective wizard sheet; closing a sheet without submitting preserves draft recovery on next open.
- [ ] 5.4 Verify: `yarn type-check`, `yarn test:run`, full manual regression pass on both desktop forms (confirms zero behavior drift across the whole change).
