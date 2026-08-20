# Traspasos Inventario Specification

## Purpose

Introduce a documented, atomic way to move stock between depositos — individually or in batch — mirroring the header/detail pattern already used by `ventas`/`ventas_det` and `facturas_compra`/`facturas_compra_det`.

## Requirements

### Requirement: Traspaso Atomico Individual

A single-product transfer MUST write a paired kardex (salida from origen + entrada to destino) and update `inventario_stock` for BOTH depositos within one `writeTransaction`. It MUST fail entirely if either leg would violate no-negative-stock.

#### Scenario: Traspaso individual mueve stock A→B atomicamente

- GIVEN deposito A has 10 units of producto P
- WHEN a traspaso of 4 units from A to B is confirmed
- THEN kardex gets a salida(A, -4) and entrada(B, +4) sharing `doc_origen_id`
- AND `inventario_stock` reflects A=6, B increased by 4, all in one transaction

### Requirement: Traspaso por Lote

A single `traspasos_inventario` header MAY carry multiple `traspasos_inventario_det` lines (multiple productos), all committed atomically as one document.

#### Scenario: Traspaso batch de varios productos

- GIVEN a batch transfer of 3 different productos from A to B
- WHEN confirmed
- THEN 3 `traspasos_inventario_det` rows and 6 paired kardex rows (3 salida + 3 entrada) are created under one `traspasos_inventario` header, atomically

### Requirement: Correlativo por Usuario

Each traspaso MUST receive a `correlativo_usuario` computed as `COUNT(*) + 1` scoped to `(empresa_id, usuario_id)`, computed inside the same `writeTransaction` (offline-safe, mirrors the facturas COUNT pattern).

#### Scenario: Correlativo incrementa por usuario

- GIVEN usuario U already has 2 traspasos
- WHEN U creates a 3rd traspaso
- THEN `correlativo_usuario = 3`, independent of other users' counts

### Requirement: Bloqueo por Stock Insuficiente en Origen

A transfer MUST be blocked if the origen deposito lacks sufficient `inventario_stock` for the requested cantidad, for the individual product or ANY line in a batch.

#### Scenario: Traspaso bloqueado por falta de stock

- GIVEN deposito A has 2 units of producto P
- WHEN a traspaso of 5 units is attempted
- THEN the transaction is rejected and no kardex/`inventario_stock` rows are written

### Requirement: Placeholders de Autorizacion

`autorizado_por` and `verificado_por` MUST be nullable columns on `traspasos_inventario`, left NULL at creation time (no approval workflow in this change).

#### Scenario: Traspaso creado sin autorizacion

- GIVEN a new traspaso is created
- WHEN it commits
- THEN `autorizado_por` and `verificado_por` are both NULL and the transfer is fully effective (no PENDIENTE/blocked state)

### Requirement: Migracion en Lockstep

`traspasos_inventario` and `traspasos_inventario_det` MUST exist simultaneously in the SQL migration, `schema.ts`, `kysely/types.ts`, and PowerSync sync rules before any code path reads or writes them.

#### Scenario: Lockstep verificado antes de mergear

- GIVEN a PR introduces the traspasos tables
- WHEN the PR is reviewed
- THEN the diff includes `migrations/`, `schema.ts`, `kysely/types.ts`, and sync rules changes together
