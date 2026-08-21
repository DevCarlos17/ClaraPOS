# Compras Por Linea Deposito Specification

## Purpose

A purchase invoice can contain products with different default depositos. Each line's stock-in must route to its OWN product's deposito instead of one deposito prefetched for the whole invoice.

## Requirements

### Requirement: Enrutamiento de Ingreso por Linea

Each `factura_compra_det` line MUST route its stock-in kardex entry to ITS product's `deposito_id` (fallback empresa principal per the `producto-deposito-default` capability), not a single deposito resolved once for the whole invoice.

#### Scenario: Compra multi-producto en 2 depositos

- GIVEN a purchase invoice with product X (`deposito_id = A`) and product Y (`deposito_id = B`)
- WHEN the invoice is confirmed
- THEN kardex has an entrada for X routed to A and an entrada for Y routed to B

#### Scenario: Linea con producto sin deposito default

- GIVEN a line's product has `deposito_id = NULL`
- WHEN the invoice is confirmed
- THEN that line's stock-in routes to the empresa's principal deposito

### Requirement: Atomicidad del Ingreso Multi-Deposito

All kardex and `inventario_stock` updates originating from a single invoice, regardless of how many depositos it spans, MUST commit as one atomic `writeTransaction`.

#### Scenario: Fallo parcial revierte todo

- GIVEN a purchase invoice spanning 2 depositos
- WHEN any line fails validation during confirm
- THEN no kardex row for ANY line of that invoice is committed
