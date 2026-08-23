# Deposito Inactivo Guard Specification

## Purpose

Close the gap where `depositos.is_active=0` is decorative. An inactive depósito MUST NOT send/receive kardex, nor be deactivated while a caja uses it. 3 layers: UI, hook, DB trigger, plus automatic NCR fallback.

## Requirements

### Requirement: Bloqueo y Reasignación al Desactivar un Depósito

`actualizarDeposito` MUST reject deactivating a depósito with (a) an open `sesiones_caja` via `cajas.deposito_id`, or (b) any `cajas.deposito_id` still pointing to it — scoped to `empresa_id`. Errors MUST be Spanish, instructing to close the session or reassign the caja.

#### Scenario: Bloqueada por sesión abierta
- GIVEN a depósito referenced by a caja with an open session
- WHEN a Propietario/Supervisor attempts `is_active=0`
- THEN the hook rejects fail-fast, in Spanish, naming the blocking session

#### Scenario: Bloqueada por caja sin sesión abierta
- GIVEN a depósito selected by `cajas.deposito_id`, no open session
- WHEN the owner attempts to deactivate it
- THEN the hook rejects it, instructing to reassign the caja first

#### Scenario: Permitida sin cajas referenciándolo
- GIVEN a depósito no caja points to (reassigned or never selected)
- WHEN the owner sets `is_active=0`
- THEN the deactivation succeeds

### Requirement: Transparencia de Uso en el Listado de Depósitos

The depósitos list UI MUST show which cajas have each depósito selected, and whether any has an open session, scoped to `empresa_id`.

#### Scenario: Depósito en uso con sesión abierta
- GIVEN a depósito selected by a caja with an open session
- WHEN the Propietario views the depósitos list
- THEN the row shows the caja name and its active-session status

#### Scenario: Depósito sin cajas asociadas
- GIVEN a depósito not selected by any caja
- WHEN the Propietario views the depósitos list
- THEN the row shows no associated cajas

### Requirement: Guardia `is_active` en Venta

`crearVenta` MUST resolve the egress depósito via `sesiones_caja -> cajas.deposito_id` and reject the sale (before `writeTransaction`) if `is_active=0`, scoped to `empresa_id`.

#### Scenario: Venta bloqueada
- GIVEN a caja whose `deposito_id` resolves to an inactive depósito
- WHEN a cajero attempts a sale
- THEN it is rejected in Spanish before any stock is discounted

#### Scenario: Venta permitida
- GIVEN a caja whose `deposito_id` resolves to an active depósito
- WHEN a cajero completes a sale
- THEN it proceeds and stock is discounted normally

### Requirement: Reingreso Automático en NCR POS-Express

`crearNotaCredito` (flujo POS express, "reversar factura del día") MUST reintegrate stock to `venta.deposito_id` when active, or fall back automatically to `es_principal=1` when inactive, without prompting the cajero. The not-yet-built NCR admin module (explicit destino choice) is out of scope.

#### Scenario: Reingreso al depósito de origen
- GIVEN a venta whose `deposito_id` is still active
- WHEN a cajero creates an NCR POS-express for it
- THEN stock reintegrates to the original depósito automatically

#### Scenario: Fallback automático al principal
- GIVEN a venta whose `deposito_id` is now inactive
- WHEN a cajero creates an NCR POS-express for it
- THEN stock reintegrates to the current principal depósito, no choice presented to the cajero

### Requirement: Guardia DB — Rechazo de Movimiento Hacia Depósito Inactivo

`validate_movimiento_inventario_insert` MUST reject any INSERT targeting `is_active=0` — defense-in-depth mirroring PR #57. MUST NOT reject the NCR fallback, since the app already resolves to an active depósito before writing.

#### Scenario: Escritura cruda rechazada
- GIVEN a raw INSERT targeting an inactive depósito, bypassing UI/hooks
- WHEN the trigger evaluates the row
- THEN it raises an exception; no row persists

#### Scenario: Fallback de NCR no rechazado
- GIVEN an NCR fallback already resolved to the active principal depósito
- WHEN the resulting INSERT is written
- THEN the trigger accepts it

### Requirement: Aislamiento Multi-tenant

Every guard query/count MUST filter by `empresa_id`.

#### Scenario: Validaciones scoped a la empresa
- GIVEN two empresas with similarly-shaped depósitos/cajas
- WHEN empresa A's owner deactivates a depósito
- THEN only empresa A's data is read or affected
