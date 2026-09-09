# Producto Precio Mascara Visual Specification

## Purpose

Visual mask for the product form's pricing inputs (Costo, Margen, Precio
Venta $/Bs, Precio Final $/Bs) x 3 levels: 2 decimals by default, full
precision on focus, never degrading the persisted value.

## Requirements

### Requirement: Masked Default Display

Price, cost, and margin inputs MUST show exactly 2 decimals when unfocused.

#### Scenario: Unfocused shows 2 decimals

- GIVEN a Precio Venta $ input with real value `12.34567891`
- WHEN unfocused
- THEN it displays `12.35`

#### Scenario: Empty stays empty

- GIVEN a price input with no value
- WHEN unfocused
- THEN it displays empty, never `0.00`

### Requirement: Full Precision Reveal On Focus

An input MUST reveal its full-precision real value (up to 8 decimals) on
focus.

#### Scenario: Focus reveals full precision

- GIVEN a Precio Final $ input with real value `8.5`
- WHEN focused
- THEN it displays the full-precision value, not the 2-decimal mask

#### Scenario: Bs field derives precision on focus

- GIVEN a Precio Venta Bs input with a USD full-precision reference and a
  current rate
- WHEN focused
- THEN it displays `usdToBs(fullRef, tasa)`, not a stale masked value

### Requirement: Re-mask On Blur

An input MUST reapply the 2-decimal mask on blur.

#### Scenario: Blur re-masks

- GIVEN a focused input showing 5+ decimals
- WHEN it loses focus
- THEN it redisplays with 2 decimals

#### Scenario: Enter re-masks

- GIVEN a focused, masked input
- WHEN the user presses Enter
- THEN it blurs and redisplays with 2 decimals

### Requirement: Full-Precision Value Reaches Persistence

The submitted value MUST always be full precision, never the display
string — even if never focused.

#### Scenario: Submit without focusing

- GIVEN a Precio Final Bs input never focused, or typed with more than 2
  decimals
- WHEN the form is submitted
- THEN the payload has the exact full-precision value (up to 8 decimals)

### Requirement: Field Isolation On Focus

Focusing one input MUST NOT alter the display of any other input.

#### Scenario: Cross-field flicker fixed

- GIVEN Precio Venta $ shows its 2-decimal mask
- WHEN the user types into Precio Venta Bs
- THEN Precio Venta $ stays unaffected

### Requirement: Margen Extended Precision

Margen MUST preserve more than 2 decimals internally; its full-precision
value MUST feed back-calculation, without changing the back-calc's result.
Margen is UI-only — it is never persisted in the submit payload — so
"full precision preserved" means the live value chain (the ref/state that
feeds every downstream computation and re-render), not a payload field.

#### Scenario: Margen feeds back-calc at full precision

- GIVEN a user types Margen with 4 decimals
- WHEN back-calc runs
- THEN back-calculated cost matches the existing formula using the
  full-precision margin (never the 2-decimal masked display), and Margen
  follows the same 2-decimal / focus-reveal / blur-re-mask lifecycle as
  other price inputs

### Requirement: Cost-Exploration Mode Unaffected By Mask

In exploration mode (`!costoBackCalculado`), the mask MUST stay
display-only: recalculation MUST read the raw typed value, never the
masked display string.

#### Scenario: Exploration reads raw value

- GIVEN cost is in exploration mode
- WHEN the user types a price with more than 2 decimals
- THEN explored cost recalculates using full precision, matching pre-mask
  behavior

### Requirement: Decimal-Safe Value Chain

Computation (cost, margin, price, USD↔Bs) MUST use `decimal.js`, never
native floats. Rounding to 2 decimals happens only at the display layer;
stored/submitted values keep up to 8 decimals.

#### Scenario: Precision survives the chain

- GIVEN a cost with 8 decimals feeding margin, price, and Bs conversion
- WHEN each step computes
- THEN no step loses precision from display formatting, and combo products
  (`tipo === 'C'`) skip the pricing scheme and this mask entirely

### Requirement: Mask Pattern Documented

The visual-mask-vs-real-value pattern MUST be documented in `CLAUDE.md` or
this change's `design.md`.

#### Scenario: Pattern documented for future agents

- GIVEN the mask is implemented
- WHEN a future agent reads project docs
- THEN it finds the mask/reveal/submit rule described
