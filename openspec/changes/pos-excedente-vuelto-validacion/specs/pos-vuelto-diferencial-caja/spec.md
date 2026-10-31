# pos-vuelto-diferencial-caja Specification

## Purpose

When a POS sale's "Dar vuelto" distribution (`vueltoEntries`) does not exactly match the computed ideal excedente, `crearVenta` MUST book the difference using the existing diferencial-cambiario accounting primitives already read by `use-cuadre.ts`, so the gap is never silently absorbed by the cash drawer without a record. This capability does not modify `use-cuadre.ts`, schema/migrations, or the SAF/Propina flows.

## Requirements

### Requirement: Book vuelto EGRESO entries for the distributed amount

`crearVenta`'s `'VUELTO'` case MUST insert one `movimientos_metodo_cobro` EGRESO row per entry in `discrepancy.vueltoEntries` (not the legacy single `vuelto` param, when `vueltoEntries` is present), for exactly the distributed amount per method.

#### Scenario: Multi-method distribution booked per entry
- GIVEN `vueltoEntries = [{EFECTIVO $, montoUsd}, {EFECTIVO Bs, montoBs}]`
- WHEN `crearVenta` processes the `'VUELTO'` case
- THEN one EGRESO row is inserted per entry, for its own distributed amount

### Requirement: Book the sobrante delta when distributed is less than ideal

When the sum of `vueltoEntries` (converted to a common unit at full precision) is less than the ideal excedente, `crearVenta` MUST additionally insert a `movimientos_metodo_cobro` row with `tipo='INGRESO'`, `origen='DIFERENCIAL_CAMBIARIO'`, for the delta.

#### Scenario: Cashier gives less change than owed
- GIVEN ideal excedente is Bs 500 and distributed total is Bs 50
- WHEN `crearVenta` processes `'VUELTO'`
- THEN EGRESO rows total Bs 50, AND one INGRESO `DIFERENCIAL_CAMBIARIO` row of Bs 450 is inserted

### Requirement: Book the faltante delta when distributed exceeds ideal

When distributed total exceeds the ideal excedente, `crearVenta` MUST additionally insert a `gastos` row with `descripcion='DIFERENCIAL_CAMBIARIO_FALTANTE'`, for the delta.

#### Scenario: Cashier gives more change than owed
- GIVEN ideal excedente is Bs 500 and distributed total is Bs 520
- WHEN `crearVenta` processes `'VUELTO'`
- THEN EGRESO rows total Bs 520, AND one `gastos` `DIFERENCIAL_CAMBIARIO_FALTANTE` row of Bs 20 is inserted

### Requirement: No diferencial row when distributed equals ideal

When distributed total equals the ideal excedente at full precision, `crearVenta` MUST NOT insert any `DIFERENCIAL_CAMBIARIO` or `DIFERENCIAL_CAMBIARIO_FALTANTE` row — only the vuelto EGRESO rows.

#### Scenario: Exact distribution
- GIVEN distributed total equals the ideal excedente
- WHEN `crearVenta` processes `'VUELTO'`
- THEN only EGRESO vuelto rows are inserted; no diferencial row is created

### Requirement: Delta computed at full precision before display rounding

The comparison between distributed total and ideal excedente MUST use full internal precision (per bimonetario precision rules), not the 2-decimal display value. The system MAY tolerate a negligible floating-point hygiene epsilon strictly to absorb binary-float rounding noise; this epsilon MUST NOT be a business threshold (e.g. MUST NOT reuse `umbralBs`/tasa*0.01) and MUST NOT suppress a real, owner-visible difference.

#### Scenario: Sub-cent rounding does not trigger a false diferencial
- GIVEN distributed total differs from the ideal only by floating-point noise (display-rounds equal)
- WHEN `crearVenta` evaluates the delta at full precision
- THEN no diferencial row is created; a real, non-negligible delta still books correctly

### Requirement: Atomic booking inside the existing writeTransaction

All EGRESO, `DIFERENCIAL_CAMBIARIO`, and `DIFERENCIAL_CAMBIARIO_FALTANTE` rows for a single `'VUELTO'` case MUST be inserted inside `crearVenta`'s existing `writeTransaction`, filtered by the caller's `empresa_id`; if any insert fails, the entire sale rolls back.

#### Scenario: Insert failure rolls back the whole sale
- GIVEN a diferencial row insert fails mid-transaction
- WHEN `crearVenta` processes `'VUELTO'`
- THEN the sale, pagos, and all vuelto/diferencial rows for that transaction are rolled back together

### Requirement: No regression to use-cuadre.ts, SAF, or Propina

This capability MUST NOT modify `use-cuadre.ts` or any SAF/Propina `crearVenta` logic. Diferencial rows booked here MUST be reported by `use-cuadre.ts`'s existing diferencial-cambiario reads without any change to that hook.

#### Scenario: Cuadre reflects the booked delta unchanged
- GIVEN a sobrante or faltante delta was booked by this capability
- WHEN `use-cuadre.ts` runs its existing diferencial-cambiario aggregation
- THEN the booked delta appears in the report with no code change to `use-cuadre.ts`
