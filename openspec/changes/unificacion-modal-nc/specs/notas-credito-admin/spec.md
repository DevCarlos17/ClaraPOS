# Delta for notas-credito-admin

## ADDED Requirements

### Requirement: Orden de la sección "artículos a devolver" en el flujo Parcial

Al elegir Parcial en el modal admin, la sub-sección "artículos a devolver" (`SeleccionLineasNc`) MUST renderizarse INMEDIATAMENTE debajo de los botones Total/Parcial, antes de "Origen del reverso" y de "Motivo de anulación". Este es el ÚNICO cambio de este change al modal admin — ninguna regla de validación, cálculo o gating se modifica.

#### Scenario: Artículos a devolver aparece justo debajo de Total/Parcial

- GIVEN una factura seleccionada en el modal admin
- WHEN el usuario elige Parcial
- THEN "artículos a devolver" se renderiza inmediatamente debajo de los botones Total/Parcial

#### Scenario: Origen del reverso y Motivo se muestran después

- GIVEN Parcial elegido y "artículos a devolver" visible
- WHEN el usuario continúa el flujo
- THEN "Origen del reverso" y "Motivo de anulación" aparecen debajo de "artículos a devolver", no antes

#### Scenario: Sin cambio de reglas de validación

- GIVEN el reorden aplicado
- WHEN el usuario completa el flujo Parcial (límites por línea, `es_decimal`, mínimo una línea > 0)
- THEN todas las validaciones existentes se comportan exactamente igual que antes del reorden
