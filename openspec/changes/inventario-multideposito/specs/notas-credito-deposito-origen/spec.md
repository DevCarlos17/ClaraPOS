# Notas Credito Deposito Origen Specification

## Purpose

A credit note egreso-reversal must return stock to the exact deposito the original sale drew from, keeping per-deposit stock accurate after returns.

## Requirements

### Requirement: Reingreso al Deposito de Origen de la Venta

A nota de credito's stock reversal MUST return stock to `venta.deposito_id` — the same deposito the original sale drew from. It MUST NOT re-derive the empresa principal independently.

#### Scenario: Nota de credito devuelve stock al deposito original

- GIVEN a venta that drew stock from deposito B
- WHEN a full or partial credit note is confirmed
- THEN the kardex entrada and `inventario_stock` increment occur for deposito B, matching `venta.deposito_id`

#### Scenario: inventario_stock incrementado correctamente

- GIVEN `inventario_stock` for `(producto, deposito B)` = N before the credit note
- WHEN the credit note commits
- THEN `inventario_stock` for `(producto, deposito B)` = N + cantidad_devuelta, within the same `writeTransaction` as the kardex entrada
