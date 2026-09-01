# Gasto Detalle Desglose Specification

## Purpose

Define correct display of totals and the Base/IVA breakdown in the "Detalle de Gasto" modal (`FacturaProveedorModal`, tipo='GASTO'). Fixes the bug where "Total Factura" showed the pre-IVA base (`monto_factura`) instead of the tax-inclusive total (`monto_usd`), and adds a dynamic breakdown per `tipo_impuesto` matching the "Confirmar Registro" summary.

During implementation, a second bug was found and fixed by re-verification: an early version re-divided the already-converted `monto_usd` by the exchange rate again for BS gastos with tasa paralela (double currency conversion, e.g. displaying $2.90 instead of $116.00). The requirement below reflects the corrected, final behavior — `monto_usd` is the single canonical USD total and is never re-converted at render time.

## Requirements

### Requirement: Total Factura Incluye IVA

"Detalle de Gasto" MUST display "Total Factura" as the tax-inclusive total (`monto_usd` = base + IVA). It MUST NOT display the pre-IVA base (`monto_factura`) alone as the total.

#### Scenario: Gasto gravable con IVA 16%

- GIVEN a Gasto with base 10.00 USD and IVA 16% (1.60 USD)
- WHEN the user opens "Detalle de Gasto"
- THEN "Total Factura" shows 11.60 USD
- AND "Total Bs" shows 11.60 * tasa vigente

#### Scenario: Abono igual al total no muestra incoherencia

- GIVEN the same Gasto (Total Factura = 11.60 USD)
- WHEN an abono of 11.60 USD has been registered
- THEN "Abonado" equals "Total Factura" (11.60 = 11.60) and status reads "completamente pagada"
- AND the modal MUST NOT show "Abonado" greater than "Total Factura"

### Requirement: Desglose Dinamico por Tipo de Impuesto

The modal MUST render a totals breakdown driven by the Gasto's `tipo_impuesto`, reusing the pure selectors in `gasto-montos.ts` (`montoCostoGasto`, `montoIvaGasto`, `montoTotalGasto`).

#### Scenario: Gasto gravable (IVA > 0)

- GIVEN a Gasto with `tipo_impuesto = 'GRAVABLE'` and IVA > 0
- WHEN the breakdown renders
- THEN it shows "Base imponible", "IVA ({porcentaje_iva}%)", and "Total con IVA"

#### Scenario: Gasto exento

- GIVEN a Gasto with `tipo_impuesto = 'EXENTO'`
- WHEN the breakdown renders
- THEN it shows a single line "Monto Exento (sin IVA)" with no IVA line

#### Scenario: Gasto exonerado

- GIVEN a Gasto with `tipo_impuesto = 'EXONERADO'`
- WHEN the breakdown renders
- THEN it shows a single line "Monto Exonerado (sin IVA)" with no IVA line

#### Scenario: Coherencia con Confirmar Registro

- GIVEN the same Gasto values shown in "Confirmar Registro" (`gasto-form.tsx`, `ResumenConfirm`)
- WHEN comparing both screens for the same Gasto
- THEN breakdown labels and amounts in "Detalle de Gasto" MUST match "Confirmar Registro"

### Requirement: Presentacion Bimonetaria

The modal MUST show both USD and the Bs equivalent for every monetary line where it already shows both currencies today (Total Factura, breakdown lines, Abonado, Saldo Pendiente).

#### Scenario: Conversion Bs con tasa vigente

- GIVEN a Gasto without tasa paralela
- WHEN the modal renders monetary lines
- THEN each USD amount has an adjacent Bs amount computed as `usd * tasa vigente`

### Requirement: Visualizacion de Solo Lectura

The modal MUST be display-only: it MUST NOT mutate any stored `gasto` field (`monto_factura`, `monto_usd`, `base_imponible_usd`, `monto_iva_usd`) when deriving or rendering totals.

#### Scenario: Renderizado sin efectos secundarios

- GIVEN a Gasto record
- WHEN "Detalle de Gasto" opens and renders totals
- THEN no write/update operation is issued against the `gastos` table as a side effect of rendering

### Requirement: Total Factura Usa el Monto USD Canonico (Sin Reconversion)

> **Correction note**: this requirement replaces an earlier, incorrect version ("Conversion con Tasa Paralela Usa el Total") that specified dividing `monto_usd` by the exchange rate for the BS/tasa-paralela case. That formula was implemented, caught a CRITICAL double-conversion bug during re-verification (a $116.00 total displayed as $2.90), and was corrected. This is the final, verified behavior.

`gasto.monto_usd` is the single canonical USD total (base + IVA), already converted exactly once at creation time by `crearGasto` (`use-gastos.ts`), regardless of `moneda_factura` or `usa_tasa_paralela`. "Total Factura" (`totalProveedorUsd`) MUST equal `monto_usd` directly and unconditionally. It MUST NOT be divided again by `tasa_proveedor` or `tasa` when rendering — including when the invoice currency is BS and the Gasto uses a tasa paralela.

#### Scenario: Gasto en Bs con tasa paralela

- GIVEN a Gasto with `moneda_factura = 'BS'`, `usa_tasa_paralela = 1`, base 4000 Bs, `tasa_proveedor = 40`, IVA 16% — persisted as `monto_usd = 116`
- WHEN "Total Factura" is derived
- THEN `totalProveedorUsd` equals `monto_usd` (116 USD) directly
- AND `totalProveedorUsd` MUST NOT be recomputed by dividing `monto_usd` by `tasa_proveedor` again (which would incorrectly yield 2.90)

#### Scenario: Sin regresion en Facturas de Compra (CxP)

- GIVEN the same modal rendering a record with `tipo != 'GASTO'` (factura de compra / CxP)
- WHEN totals render
- THEN existing CxP total/breakdown behavior MUST remain unchanged — `CompraRow` uses `total_usd`/`total_bs` columns that are already post-IVA and structurally independent of this fix
</content>
