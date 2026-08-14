# Tasks: Moneda de Presentacion del Recibo de Venta

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~430-480 (WU1 ~110, WU2 ~230, WU3 ~90) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (WU1: config seam + UI) -> PR 2 (WU2: data + totals + text/PNG) -> PR 3 (WU3: PDF parity) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Currency mapping helper + type + config field + parse/default + config UI selector | PR 1 | Self-contained, testable, no receipt render change yet. Base: main |
| 2 | `buildReciboData` Bs fields + `construirFilasTotales` intermediate rows + text/PNG article table + payment counterpart | PR 2 | Base: main (after PR 1 merges), or PR 1 branch if stacking before merge |
| 3 | PDF `artBody` parity fix | PR 3 | 2x-work risk isolated; smallest, easiest to review/rollback alone. Base: main (after PR 2) |

## Work Unit 1: Currency seam, config, and settings UI

### Phase 1.1: Type + mapping helper (foundation)

- [x] 1.1.1 **[TEST-RED]** In `src/features/ventas/utils/__tests__/factura-export.test.ts`, add tests for `formatParPrimarioContraparte(usd, bs, moneda)` and `formatMontoBimonetario(usd, bs, moneda)`: both orientations (`'USD'` -> `$Y.YY (Bs. X,XX)`, `'BS'` -> `Bs. X,XX ($Y.YY)`) for a known usd/bs pair. Spec: "Moneda primaria y contraparte en montos del recibo".
- [x] 1.1.2 **[GREEN]** In `src/features/ventas/utils/factura-export.ts`, add `export type MonedaPresentacion = 'USD' | 'BS'`, `type ParPrimarioContraparte = { primario: string; contraparte: string }`, and `export function formatParPrimarioContraparte(usd, bs, monedaPrimaria)` / `export function formatMontoBimonetario(usd, bs, monedaPrimaria)` per design Interfaces/Contracts. Design: "Currency mapping" decision.

### Phase 1.2: Config field + default resolution

- [x] 1.2.1 **[TEST-RED]** Add test to `use-company.ts` test coverage (or inline in `company-data-form.test.tsx` if no `use-company.test.ts` exists) asserting `parseEmpresaConfig` returns `moneda_presentacion_documentos: 'USD'` default when the field is absent or has an invalid value. Spec: "Configuración de moneda de presentación por empresa" scenario "Config 'BS' vs ausente/inválida".
- [x] 1.2.2 **[GREEN]** In `src/features/configuracion/hooks/use-company.ts`, add `moneda_presentacion_documentos?: 'USD' | 'BS'` to `EmpresaConfig` (line 5-7). No `updateCompany` signature change needed (`config?: string` already exists, line 61).

### Phase 1.3: Settings UI

- [x] 1.3.1 **[TEST-RED]** Create `src/features/configuracion/components/__tests__/company-data-form.test.tsx`: (a) Select renders with `'USD'` selected by default when `company.config` has no `moneda_presentacion_documentos`; (b) selecting `'BS'` + submit calls `updateCompany(company.id, { config: <JSON with moneda_presentacion_documentos: 'BS'> })` preserving other existing config keys. Design: "Config UI" section.
- [x] 1.3.2 **[GREEN]** In `src/features/configuracion/components/company-data-form.tsx`: import `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@/components/ui/select` (pattern: `src/features/citas/components/wizard/step-checkout.tsx`) and `parseEmpresaConfig` from `../hooks/use-company`. Add local array `MONEDA_PRESENTACION_OPTIONS: { value: 'USD' | 'BS'; label: string }[]` (no hardcoded JSX literals). Add `monedaPresentacion` state, init in the existing `useEffect` (line 18-25) from `parseEmpresaConfig(company.config).moneda_presentacion_documentos ?? 'USD'`. Render the `Select` bound to it. On submit (`handleSubmit`, line 27-52), extend the `updateCompany` call with `config: JSON.stringify({ ...parseEmpresaConfig(company.config), moneda_presentacion_documentos: monedaPresentacion })`.
  - **Deviation**: initial state uses a lazy `useState` initializer from `company?.config` (not just the `useEffect`) to avoid a Radix Select v2 bug: a same-tick 'USD' -> real-value transition right after mount races the hidden native `<select>` (rendered for form association) that Radix uses to bubble native `change` events back into `onValueChange`; if the transition happens before its `<option>`s finish registering, it resets the controlled value to `''`. Initializing correctly on the very first render (the form is gated behind `isLoading`, so `company` is already available) avoids the transition entirely. The `useEffect` sync is kept for `company` identity changes, matching the existing pattern for `nombre`/`rif`/etc.

## Work Unit 2: Data model, shared totals, text/PNG render, payments

### Phase 2.1: Bs fields on data model (foundation for this WU)

- [x] 2.1.1 **[TEST-RED]** Extend `factura-export.test.ts`: `buildReciboData` output has `lineas[].precioUnitarioBs`/`totalBs` correct per `tasa`, and `monedaPresentacion` defaults to `'USD'` when `BuildReciboDataInput.monedaPresentacion` is omitted. Spec: "Ambas monedas siempre visibles..." + "Seam tipado de moneda de presentación".
- [x] 2.1.2 **[GREEN]** In `factura-export.ts`: add `precioUnitarioBs`, `totalBs` to `ReciboLinea` (line 23-30); add `ivaBs` to `ReciboAlicuota` (line 32-36); add `montoExentoBs`, `baseImponibleBs`, `igtfBs` to `ReciboTotales` (line 38-48); add `monedaPresentacion: MonedaPresentacion` to `ReciboData` (line 62-71) and `monedaPresentacion?: MonedaPresentacion` to `BuildReciboDataInput` (line 82-93). In `buildReciboData` (line 143-215): compute the new Bs fields via `usdToBs(x, input.tasa)` in the lineas loop and totals assembly; resolve `monedaPresentacion` default `'USD'`.

### Phase 2.2: Shared totals rows (`construirFilasTotales`)

- [x] 2.2.1 **[TEST-RED]** Extend `factura-export.test.ts` for `construirFilasTotales(totales, monedaPresentacion)`: toggle flips the 5 intermediate rows (Exento, Base Imponible, IVA%, TOTAL FACTURA pre-IGTF, IGTF) between `$Y.YY (Bs. X,XX)` and `Bs. X,XX ($Y.YY)`; the 2 final bold rows (`TOTAL FACTURA` no-IGTF / `TOTAL + IGTF`) format is FIXED regardless of toggle (unchanged from current `${formatUsd} / ${formatBs}`). Spec: "Ambas monedas siempre visibles..."; Design: final-rows decision.
- [x] 2.2.2 **[GREEN]** In `factura-export.ts`: change `FilaTotal` (line 245-250) — replace `usd`/`bs?` fields with `monto: string`. Update `construirFilasTotales` (line 260-293) to accept `monedaPresentacion: MonedaPresentacion` param; build the 5 intermediate rows via `formatMontoBimonetario`; keep the 2 final bold rows on the current fixed `${formatUsd(...)} / ${formatBs(...)}` format.
- [x] 2.2.3 **[GREEN]** Update both call sites for the new signature: `construirLineasRecibo` (line 341, pass `recibo.monedaPresentacion`) and `buildReciboPdfBlob` (line 469, pass `recibo.monedaPresentacion`) — TypeScript compiler enforces both. Update the render of `fila.monto` (was `fila.usd`/`fila.bs`) in both consumers (line 342-345 text/PNG; line 469-472 PDF body mapping).

### Phase 2.3: Text/PNG article lines

- [x] 2.3.1 **[TEST-RED]** Extend `factura-export.test.ts`: `buildReciboTextoPlano` output for an article line shows both currencies in the toggle-aware order (e.g. default `'USD'` -> `$10.00 (Bs. 5.000,00)`; `'BS'` -> `Bs. 5.000,00 ($10.00)`). Spec: "Línea de artículo y filas de totales muestran ambas monedas" + "Bs primero en 'BS', USD primero en default".
- [x] 2.3.2 **[GREEN]** In `construirLineasRecibo` (line 332-338): replace the `formatUsd(linea.precioUnitarioUsd)` / `formatUsd(linea.totalUsd)` calls with `formatMontoBimonetario(linea.precioUnitarioUsd, linea.precioUnitarioBs, recibo.monedaPresentacion)` and the total equivalent.

### Phase 2.4: Payment counterpart (gap 7)

- [x] 2.4.1 **[TEST-RED]** Extend `src/features/ventas/utils/__tests__/recibo-pagos.test.ts` (or `factura-export.test.ts` since `formatMontoPago` lives there): Bs-native payment line includes its USD equivalent, e.g. Bs 300 @ tasa 500 -> `Bs. 300,00 ($0.60)`. Spec: "Método Bs ahora también muestra su equivalente USD" — independent of the document toggle.
- [x] 2.4.2 **[GREEN]** In `factura-export.ts`, change `formatMontoPago` (line 238-242) from module-private to `export function formatMontoPago`. Update the `'BS'`/else branch to `${formatBs(linea.montoBs)} (${formatUsd(linea.montoUsd)})`, always showing the counterpart regardless of `monedaPresentacion` (native currency stays primary).

### Phase 2.5: Wire the config through to the builder call

- [x] 2.5.1 In `src/features/ventas/components/venta-exitosa-modal.tsx`, import `parseEmpresaConfig` from `@/features/configuracion/hooks/use-company` and pass `monedaPresentacion: parseEmpresaConfig(company?.config).moneda_presentacion_documentos ?? 'USD'` into the `buildReciboData` call inside `construirRecibo` (line 78-113). Design: Data Flow.

## Work Unit 3: PDF article table parity (2x-work spot)

- [ ] 3.1 **[TEST-RED]** Extend `factura-export.test.ts` with the PDF/text parity assertion: same `ReciboData` input produces identical currency values via `buildReciboTextoPlano` and `buildReciboPdfBlob` (extract text from the PDF's `autoTable` body args, e.g. by spying/mocking `jspdf-autotable`'s `autoTable` call args, matching the existing test file's mocking pattern). Design: Testing Strategy "PDF/text parity"; Risk: "PDF `artBody` diverges".
- [ ] 3.2 **[GREEN]** In `buildReciboPdfBlob`'s `artBody` (line 448-454): replace `formatUsd(linea.precioUnitarioUsd)` / `formatUsd(linea.totalUsd)` with `formatMontoBimonetario(linea.precioUnitarioUsd, linea.precioUnitarioBs, recibo.monedaPresentacion)` and the total equivalent — same fix as Phase 2.3, applied to the independent PDF path.

## Final Verification

- [x] 4.1 **[BACKWARD-COMPAT GUARD]** Add/verify test asserting that when `moneda_presentacion_documentos` is absent (today's default state), all existing passing assertions for payments (`formatMontoPago` USD-native branch), `formatearCierre`, and the 2 final bold total rows remain byte-identical to pre-change output. (WU2 scope: covers WU2's own additions. WU3 PDF `artBody` parity pending.)
- [x] 4.2 Run `yarn test:run` — all tests green, including extended `factura-export.test.ts`, `recibo-pagos.test.ts`, and new `company-data-form.test.tsx`. (WU2: 404/404 green, includes new `venta-exitosa-modal.test.tsx`.)
- [x] 4.3 Run `yarn type-check` — must be clean for non-test files. Spurious vitest-globals errors on `*.test.ts`/`*.test.tsx` files are EXPECTED noise, not a regression; use `yarn type-check:test` to validate test files instead. (WU2: 0 errors outside `*.test.ts(x)`; `yarn type-check:test` clean.)
