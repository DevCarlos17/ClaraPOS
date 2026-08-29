# Delta for Deposito Inactivo Guard

## ADDED Requirements

### Requirement: Guardia `is_active` en Traspaso

`crearTraspaso` MUST re-verificar que origen y destino tengan `is_active=1` antes de abrir la `writeTransaction`, scoped a `empresa_id`, rechazando en español si cualquiera está inactivo — mismo patrón que la Guardia `is_active` en Venta.

#### Scenario: Traspaso rechazado por origen inactivo
- GIVEN un depósito origen con `is_active=0`
- WHEN se intenta crear un traspaso desde ese depósito
- THEN se rechaza en español antes de escribir movimientos

#### Scenario: Traspaso rechazado por destino inactivo
- GIVEN un depósito destino con `is_active=0`
- WHEN se intenta crear un traspaso hacia ese depósito
- THEN se rechaza en español antes de escribir movimientos

#### Scenario: Traspaso permitido entre depósitos activos
- GIVEN origen y destino con `is_active=1`
- WHEN se crea el traspaso
- THEN procede normalmente y el stock se actualiza en ambos depósitos
