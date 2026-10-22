# Delta for Preview de Facturas Afectadas por Reverso de Tesorería

## ADDED Requirements

### Requirement: Acción de reverso expuesta y gateada por presencia de SAF

El panel de facturas afectadas MUST exponer una acción de reverso habilitada SOLO cuando `facturasSaf` esté vacío para el ingreso previsualizado. Cuando `facturasSaf` no esté vacío, el panel MUST deshabilitar la acción y mostrar el mensaje de bloqueo SAF.

#### Scenario: Sin SAF — acción habilitada

- GIVEN un preview con `facturasSaf: []` y `facturasDirectas` no vacío
- WHEN se renderiza el panel
- THEN la acción de reverso está habilitada

#### Scenario: Con SAF — acción deshabilitada con mensaje

- GIVEN un preview con `facturasSaf` no vacío
- WHEN se renderiza el panel
- THEN la acción de reverso está deshabilitada y se muestra "Este abono generó saldo a favor consumido en otras facturas; reversar desde tesorería no está disponible todavía"
