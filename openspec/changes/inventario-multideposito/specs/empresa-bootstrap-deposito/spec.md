# Empresa Bootstrap Deposito Specification

## Purpose

A new empresa must be immediately operational for inventory-aware invoicing on day 1, without requiring the owner to manually create a deposito and caja before the first sale.

## Requirements

### Requirement: Deposito y Caja Sembrados al Registrar Empresa

`register-owner` MUST create exactly one principal deposito (`es_principal = true`, `permite_venta = true`) and one linked `cajas` row (`deposito_id` = that deposito's id) for every new empresa, immediately after the existing `caja_fuerte`/`metodos_cobro` seeding step.

#### Scenario: Nueva empresa tiene deposito+caja utilizables

- GIVEN a new owner completes registration
- WHEN `register-owner` finishes
- THEN the empresa has exactly 1 deposito (`es_principal = true`) and exactly 1 caja linked to it, both visible on first sync

#### Scenario: Dia 1 sin configuracion manual

- GIVEN a freshly registered empresa with no manual deposito/caja setup
- WHEN the owner creates a product and confirms an invoice
- THEN both operations succeed using the seeded deposito/caja without additional setup

### Requirement: Numeracion de Caja No Manual

The bootstrap insert MUST NOT set `cajas.nro_caja` explicitly; the existing Postgres `BEFORE INSERT` trigger MUST assign it.

#### Scenario: nro_caja asignado por trigger

- GIVEN the bootstrap inserts the caja row without `nro_caja`
- WHEN the insert executes
- THEN the trigger sets `nro_caja = 1` (first caja for a new empresa)
