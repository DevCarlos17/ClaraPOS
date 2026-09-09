# Producto — Back-cálculo de Costo Specification

## Purpose

Modo exploración: con ambos costos vacíos, editar margen/PVP/final de detal, mayor o especial recalcula el costo en vivo desde el último nivel tocado. "Fijar costo" ancla y cascada los 3 niveles. Solo productos, no combos.

## Historial (superseded)

Reemplaza "blur-and-anchor" (`blur`, solo detal, anclaje inmediato) con **Activación** + **Recálculo Continuo** + botón **"Fijar Costo"** (reemplaza el aviso de texto).

## Requirements

### Requirement: Modo Exploración — Activación

MUST activar exploración si AMBOS costos están vacíos (`trim() === ''`); MUST desactivarlo si alguno tiene valor. Combos MUST NOT entrar (costo `0` fijo).

#### Scenario: Producto nuevo o costos limpiados
- GIVEN costo USD y Bs vacíos, no combo
- WHEN se abre el formulario o se limpian ambos costos
- THEN exploración activa

#### Scenario: Combo nunca entra en exploración
- GIVEN `esComboLocal === true`
- WHEN se edita margen o PVP de cualquier nivel
- THEN costo `0`, sin exploración

### Requirement: Recálculo Continuo de Costo en Exploración

MUST recalcular el costo en CADA cambio (no solo `blur`) de margen, PVP o final de CUALQUIER nivel, desde el nivel editado. MUST usar `decimal.js`, redondeo al final. MUST escribir ambos costos (tasa `<= 0` omite Bs).

Fórmula: `costo = pvp_N / (1 + margen_N/100)`; con precio final: `pvp_N = final_N / (1 + iva/100)` primero.

#### Scenario: Canónico sin IVA, continuo
- GIVEN exploración activa, margen detal 50%, PVP detal 150
- WHEN se edita margen o PVP y se sigue ajustando
- THEN costo `= 100.00`, se actualiza en cada cambio, sin anclarse

#### Scenario: Canónico con IVA
- GIVEN exploración activa, margen detal 50%, PVP detal 150, IVA 16%
- WHEN se edita precio final detal a `174`
- THEN PVP `= 150.00`, costo `= 100.00`

#### Scenario: Nivel no-detal define la fuente
- GIVEN exploración activa
- WHEN se edita margen o PVP de MAYOR
- THEN el costo se recalcula desde MAYOR, no desde detal

### Requirement: Botón "Fijar Costo"

MUST mostrar "Fijar costo" solo si hay exploración activa Y costo calculado. Al presionarlo MUST: anclar el costo, cascada los 3 niveles (`precio = costo * (1 + margen_nivel/100)`, y final si hay IVA), salir de exploración, ocultar el botón.

#### Scenario: Botón aparece tras el primer cálculo
- GIVEN exploración activa, sin costo calculado
- WHEN se calcula un costo por primera vez
- THEN "Fijar costo" se muestra

#### Scenario: Fijar costo ancla y cascada
- GIVEN costo `100.00` calculado (detal 50%→150, mayor 25%, especial 0.01%)
- WHEN se presiona "Fijar costo"
- THEN costo `100.00`/Bs anclado; mayor `= 125.00`, especial `= 100.01`; botón desaparece; flujo normal reanuda

### Requirement: Vínculo Bidireccional entre Costo USD y Bs

MUST limpiar el costo restante cuando el otro se vacía (fix: antes no lo hacía); MUST reactivar exploración si ambos quedan vacíos.

#### Scenario: Limpiar uno limpia el otro y reactiva exploración
- GIVEN costo USD `100.00` y Bs `4000.00`
- WHEN se borra costo USD
- THEN costo Bs también vacío; exploración se activa

### Requirement: Flujo Normal con Costo Fijo

Con exploración inactiva, MUST mantener el flujo existente: editar margen recalcula PVP (y final si hay IVA); editar PVP o final recalcula margen.

#### Scenario: Margen y PVP se recalculan mutuamente
- GIVEN costo `100.00` fijo, margen detal `50%`, PVP `150.00`
- WHEN se cambia margen a `60%` (o PVP a `200.00`)
- THEN PVP `= 160.00` (o margen recalculado); costo no cambia

### Requirement: Bloqueo de Margen Negativo

MUST impedir margen negativo en cualquier nivel; MUST clamparse a `0` con aviso no bloqueante.

#### Scenario: Margen negativo clampado
- GIVEN se tipea `-10` en el margen de cualquier nivel
- WHEN el campo se procesa
- THEN margen `0`, aparece aviso de corrección

## Out of Scope

Migrar handlers fuera del back-calc a `decimal.js`; parches Zod `costo_usd` vs mayor/especial; cambios a combos o servicios.
