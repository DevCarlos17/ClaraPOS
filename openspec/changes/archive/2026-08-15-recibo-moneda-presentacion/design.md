# Design: Moneda de Presentacion del Recibo de Venta

## Technical Approach

Add a typed seam `MonedaPresentacion = 'USD' | 'BS'` that threads from persisted company
config through `buildReciboData` down to render functions. Both currencies are ALWAYS
computed (unconditional); the seam only decides which one prints first. A single
lookup-table helper in `factura-export.ts` is the ONE place that maps a currency choice to
`{ primario, contraparte }` strings — future currencies only touch that map. No changes to
`lib/currency.ts`.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Currency mapping | One lookup-table function `formatParPrimarioContraparte(usd, bs, moneda)` in `factura-export.ts`, built from existing precomputed `usd`/`bs` pairs (no `tasa` param) | Pass `tasa` into every render function and call `usdToBs` there | Bs values are already computed unconditionally in `buildReciboData`/`construirFilasTotales`; renderers should format, not convert. Keeps `tasa` out of render-layer signatures |
| `MonedaPresentacion` type location | Canonical `export type MonedaPresentacion` in `factura-export.ts` (per proposal); `EmpresaConfig.moneda_presentacion_documentos?: 'USD' \| 'BS'` uses an inline literal (structurally identical, no import) | Import the type into `use-company.ts`/`company-data-form.tsx` | Avoids `configuracion` depending on `ventas` types; structural typing makes the inline literal assignment-compatible with zero coupling |
| **Final 2 bold total rows (TOTAL FACTURA no-IGTF / TOTAL + IGTF) format** | **Keep CURRENT unconditional `${formatUsd} / ${formatBs}` format, ignore the toggle** | Apply `formatMontoBimonetario` (parens, toggle-aware) to all rows uniformly | Spec requirement scopes the toggle to "artículos y **totales intermedios**" only, excluding final totals. These 2 rows are already bimonetary today — changing their format/order would break byte-identical backward compat for the current default (`USD` absent) case |
| New intermediate rows (Exento, Base Imponible, IVA%, TOTAL FACTURA pre-IGTF, IGTF) | Toggle-aware `primario (contraparte)` via `formatMontoBimonetario` | Same slash format as final rows | These rows are currently USD-only (no prior format to preserve); spec explicitly requires parens + toggle order here |
| Payment lines (`formatMontoPago`) | Native currency always primary, counterpart always shown, **independent of the toggle** | Reuse `formatMontoBimonetario`/toggle | Spec: "independiente del toggle del recibo" — payments use their own currency, not the document-wide setting |

## Data Flow

    empresas.config (JSON) --parseEmpresaConfig--> moneda_presentacion_documentos
        --> venta-exitosa-modal.tsx (construirRecibo) --> BuildReciboDataInput.monedaPresentacion
        --> buildReciboData() --> ReciboData.monedaPresentacion (+ Bs fields computed unconditionally)
        --> construirLineasRecibo (text/PNG) ─┐
        --> buildReciboPdfBlob artBody (PDF)  ─┼─> formatMontoBimonetario(usd, bs, monedaPresentacion)
        --> construirFilasTotales (shared)    ─┘

## Interfaces / Contracts

```ts
// factura-export.ts
export type MonedaPresentacion = 'USD' | 'BS'

export interface ReciboLinea {
  // ...existing fields
  precioUnitarioBs: number   // NEW: usdToBs(precioUnitarioUsd, tasa)
  totalBs: number            // NEW: usdToBs(totalUsd, tasa)
}

export interface ReciboAlicuota {
  pct: number; baseUsd: number; ivaUsd: number
  ivaBs: number               // NEW
}

export interface ReciboTotales {
  // ...existing usd fields
  montoExentoBs: number       // NEW
  baseImponibleBs: number     // NEW
  igtfBs: number | null       // NEW
  // totalFacturaBs / totalGeneralBs unchanged (already existed)
}

export interface ReciboData {
  // ...existing
  monedaPresentacion: MonedaPresentacion  // NEW, resolved default 'USD'
}

export interface BuildReciboDataInput {
  // ...existing
  monedaPresentacion?: MonedaPresentacion // NEW, default 'USD'
}

export interface FilaTotal {
  label: string
  monto: string   // REPLACES usd/bs?: fully formatted, either toggle-aware or fixed (see decision table)
  bold: boolean
}

// THE mapping seam — future currencies only touch this
type ParPrimarioContraparte = { primario: string; contraparte: string }
export function formatParPrimarioContraparte(
  usd: number, bs: number, monedaPrimaria: MonedaPresentacion
): ParPrimarioContraparte
export function formatMontoBimonetario(
  usd: number, bs: number, monedaPrimaria: MonedaPresentacion
): string // `${primario} (${contraparte})`

export function construirFilasTotales(
  totales: ReciboTotales,
  monedaPresentacion: MonedaPresentacion   // NEW param
): FilaTotal[]

// export (was private) for direct unit testing of gap 7
export function formatMontoPago(linea: ReciboPagoLinea): string
```

```ts
// use-company.ts
export interface EmpresaConfig {
  moneda_contable?: 'USD' | 'BS'                          // untouched, dead
  moneda_presentacion_documentos?: 'USD' | 'BS'            // NEW, default 'USD'
}
```

## The 3 Render Paths

| Path | Function | Change | Shares code with |
|---|---|---|---|
| Text/PNG article lines | `construirLineasRecibo` (332-338) | Use `formatMontoBimonetario(linea.totalUsd, linea.totalBs, recibo.monedaPresentacion)` and same for `precioUnitario*` | PNG reuses via `buildReciboImagenBlob` |
| **PDF article table (2x-work spot)** | `buildReciboPdfBlob` `artBody` (448-454) | Same fix applied a SECOND time — does not reuse path 1 | Nothing — independent path |
| Totals (both) | `construirFilasTotales` | Single fix: intermediate rows get `monto` via `formatMontoBimonetario`; final 2 bold rows keep fixed format (see decision table) | Consumed by both text/PNG (341) and PDF (469) |

## Config UI

`company-data-form.tsx`: add local state `monedaPresentacion`, init from
`parseEmpresaConfig(company?.config).moneda_presentacion_documentos ?? 'USD'`. Render a
shadcn `Select` (pattern already used in `step-checkout.tsx`) whose `SelectItem`s map over
a local array `MONEDA_PRESENTACION_OPTIONS: { value: 'USD'|'BS'; label: string }[]` (no
hardcoded JSX literals). On submit: `updateCompany(company.id, { config:
JSON.stringify({ ...parseEmpresaConfig(company.config), moneda_presentacion_documentos:
monedaPresentacion }) })`.

## Testing Strategy

| Target | File | Coverage |
|---|---|---|
| `formatParPrimarioContraparte`/`formatMontoBimonetario` | `factura-export.test.ts` (extend) | Both orientations (USD/BS primary) for a known usd/bs pair |
| `buildReciboData` output | same (extend) | New `*Bs` fields correct per `tasa`; default `monedaPresentacion` = `'USD'` when omitted |
| `construirFilasTotales` | same (extend) | Toggle flips intermediate rows only; final 2 rows format is FIXED regardless of toggle |
| PDF/text parity | same (extend, new assertion) | Same input → identical values via both `buildReciboTextoPlano` and `buildReciboPdfBlob` (covers the 2x-work risk) |
| `formatMontoPago` gap 7 | same (extend, now exported) | BS-native payment includes `(${formatUsd(montoUsd)})` |
| Toggle UI + persistence | `company-data-form.test.tsx` (new) | Select renders 'USD' default; selecting 'BS' + submit calls `updateCompany` with correct `config` JSON |

## Backward Compatibility

When `moneda_presentacion_documentos` is absent (today's state for all existing empresas),
output must be byte-identical to current behavior for content that is ALREADY bimonetary:
payments (`formatMontoPago` USD-native branch unchanged), `formatearCierre` (untouched,
not in scope), and the 2 final bold total rows (format/order fixed, ignores toggle). New
content (article-line Bs, 5 intermediate total rows, BS-native payment USD counterpart) is
additive — it did not exist before, so it cannot regress; it is the entire point of this
change.

## Migration / Rollout

No migration required. All new fields are optional with `'USD'` fallback; `parseEmpresaConfig`
already tolerates missing/malformed JSON.

## Risks

| Risk | Mitigation |
|---|---|
| PDF `artBody` diverges from text/PNG (2 independent fixes) | Explicit parity test comparing both outputs for the same input (Testing Strategy) |
| Changing final-row format by mistake breaks byte-identical default output | Locked as explicit Architecture Decision; final rows keep current fixed format, verified by existing passing tests (not modified) |
| `construirFilasTotales` signature change (`+monedaPresentacion` param) missed at a call site | Only 2 call sites (line ~341, ~469); TypeScript compiler enforces both are updated |

## Open Questions

None blocking.
