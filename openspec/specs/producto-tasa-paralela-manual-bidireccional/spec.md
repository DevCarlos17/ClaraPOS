# Producto Tasa Paralela Manual Bidireccional Specification

## Purpose

En el sandbox "Tasa Paralela" de `producto-form.tsx`, modo `modoRecalculo === 'manual'` ("Editar manual todo"), el usuario debe poder editar Margen %, Precio Venta $ o Precio Venta Bs por nivel de precio (Detal/Mayor/Especial) y ver los otros dos campos recalculados automaticamente, usando `tasaValor` (tasa interna) para la conversion $<->Bs. El costo contable (`costoContablePreview`) es fijo durante esta edicion. Los modos 'margen' y 'mantener_pvp' no cambian.

## Requirements

### Requirement: Columna Precio Venta Bs en tabla preview modo manual

La tabla preview del sandbox, cuando `modoRecalculo === 'manual'`, MUST mostrar una columna "Precio Venta Bs" ademas de "Margen (%)" y "Precio Venta $", para cada nivel (Detal, Mayor, Especial).

#### Scenario: Columna Bs visible al entrar en modo manual

- GIVEN el usuario activo "Usa tasa paralela" con `costoContablePreview` valido y selecciono el modo "Editar manual todo"
- WHEN la tabla preview se renderiza
- THEN se muestra una columna adicional "Precio Venta Bs" junto a Margen (%) y Precio Venta $ para Detal, Mayor y Especial

### Requirement: Precio Venta $ editable recalcula Margen % y Precio Bs

En modo manual, el campo Precio Venta $ de cada nivel MUST ser editable. Al editarlo, el sistema MUST recalcular Margen % via `calcularMargenPreservandoPvp(costoContable, precio$)` y Precio Venta Bs via `usdToBs(precio$, tasaValor)`, usando aritmetica Decimal con precision interna de 8 decimales.

#### Scenario: Editar Precio $ de Detal recalcula Margen y Bs

- GIVEN modo manual activo, costo contable > 0 y `tasaValor` > 0 para el nivel Detal
- WHEN el usuario escribe un nuevo Precio Venta $ en el campo Detal
- THEN el Margen % de Detal se recalcula como `(precio$ - costoContable) / costoContable * 100`
- AND el Precio Venta Bs de Detal se recalcula como `precio$ * tasaValor`

#### Scenario: Editar Precio $ con costo contable cero no recalcula margen

- GIVEN `costoContablePreview` es 0 o nulo (tabla no deberia renderizarse, pero el handler debe ser defensivo)
- WHEN se invoca el handler de cambio de Precio $ de un nivel
- THEN el Margen % resultante es 0 (guard de `calcularMargenPreservandoPvp`), sin lanzar excepcion ni division por cero

### Requirement: Precio Venta Bs editable recalcula Precio $ y Margen %

En modo manual, el campo Precio Venta Bs de cada nivel MUST ser editable. Al editarlo, el sistema MUST recalcular Precio Venta $ via `bsToUsd(precioBs, tasaValor)` y Margen % via `calcularMargenPreservandoPvp(costoContable, precio$)`.

#### Scenario: Editar Precio Bs de Mayor recalcula Precio $ y Margen

- GIVEN modo manual activo, costo contable > 0 y `tasaValor` > 0 para el nivel Mayor
- WHEN el usuario escribe un nuevo Precio Venta Bs en el campo Mayor
- THEN el Precio Venta $ de Mayor se recalcula como `precioBs / tasaValor`
- AND el Margen % de Mayor se recalcula usando el nuevo Precio $ y el costo contable

#### Scenario: Editar Precio Bs con tasaValor en 0 o vacio no divide por cero

- GIVEN `tasaValor` es 0, vacio o invalido
- WHEN el usuario intenta editar el Precio Venta Bs de cualquier nivel
- THEN la conversion Bs -> $ usa el guard existente de `bsToUsd` y retorna 0 sin lanzar excepcion
- AND el campo Precio $ resultante muestra 0 en vez de `NaN`/`Infinity`

### Requirement: Margen % editable tambien recalcula Precio Bs (ademas de Precio $)

El campo Margen % de cada nivel, YA editable en modo manual, MUST seguir recalculando Precio Venta $ via `calcularPrecioPreservandoMargenD(costoContable, margenPct)` y ADEMAS MUST recalcular Precio Venta Bs via `usdToBs(precio$, tasaValor)`.
(Previamente: el Margen % solo recalculaba Precio $; no existia columna Bs que actualizar.)

#### Scenario: Editar Margen de Especial recalcula Precio $ y ahora tambien Bs

- GIVEN modo manual activo, costo contable > 0 y `tasaValor` > 0 para el nivel Especial
- WHEN el usuario escribe un nuevo Margen % en el campo Especial
- THEN el Precio Venta $ de Especial se recalcula como `costoContable * (1 + margenPct/100)`, clampeado a 0 si resulta negativo
- AND el Precio Venta Bs de Especial se recalcula como `precio$ * tasaValor`

### Requirement: Contrato de mascara de precision en los 2 campos nuevos

Los campos Precio Venta $ y Precio Venta Bs del modo manual MUST seguir el contrato de mascara: valor real guardado en un ref de precision completa (hasta 8 decimales) escrito por un setter dedicado en cada `onChange`; `onFocus` MUST revelar el valor completo; `onBlur` y Enter MUST re-enmascarar a 2 decimales. Cualquier computo interno (cascadas) MUST leer el ref de precision completa, nunca el string de display enmascarado.

#### Scenario: Foco revela precision completa y blur re-enmascara

- GIVEN el campo Precio Venta $ de un nivel muestra "12.35" (enmascarado)
- WHEN el usuario hace foco en el campo
- THEN el campo muestra el valor completo hasta 8 decimales (ej. "12.3456789") via `toFullDisplay`
- WHEN el usuario pierde el foco o presiona Enter
- THEN el campo vuelve a mostrar 2 decimales via `toMaskedDisplay`, y el ref de precision completa no cambia por el cambio de display

#### Scenario: Computo de cascada nunca lee el string enmascarado

- GIVEN el usuario edito Precio Venta Bs y el display muestra un valor enmascarado a 2 decimales
- WHEN el sistema recalcula Precio Venta $ y Margen %
- THEN el calculo usa el Decimal construido a partir del input crudo tipeado (o el ref de precision completa), nunca `parseFloat` sobre el string ya enmascarado

### Requirement: Bloqueo de confirmar por margen negativo

Si, tras editar cualquiera de los 3 campos (Margen %, Precio $, Precio Bs) de cualquier nivel en modo manual, el Margen % resultante de ALGUN nivel es negativo, el boton "Confirmar cambios" del sandbox MUST deshabilitarse y MUST mostrarse un mensaje visible indicando cual(es) nivel(es) tienen margen negativo.

#### Scenario: Precio $ editado por debajo del costo bloquea confirmar

- GIVEN modo manual activo con costo contable > 0 para el nivel Detal
- WHEN el usuario edita el Precio Venta $ de Detal a un valor menor que el costo contable
- THEN el Margen % de Detal resulta negativo
- AND el boton "Confirmar cambios" se deshabilita
- AND se muestra un mensaje indicando que Detal tiene margen negativo

#### Scenario: Margen positivo en todos los niveles habilita confirmar

- GIVEN modo manual activo y los 3 niveles tienen Margen % >= 0 tras cualquier edicion
- WHEN el usuario revisa el estado del boton "Confirmar cambios"
- THEN el boton esta habilitado

### Requirement: Persistencia sin cambios — solo 4 campos USD a 8 decimales

Al confirmar el sandbox, el sistema MUST seguir persistiendo unicamente los campos USD (`costo_usd`, `precio_venta_usd`, `precio_mayor_usd`, `precio_especial_usd`, mas `costo_factura_usd`/`tasa_paralela_ref`) con precision completa via los setters `set*Completo`. Margen % y Precio Venta Bs MUST permanecer derivados y MUST NOT persistirse como valor congelado.

#### Scenario: Confirmar tras editar Precio Bs persiste solo el USD derivado

- GIVEN el usuario edito el Precio Venta Bs de Mayor, lo que recalculo Precio $ y Margen
- WHEN el usuario presiona "Confirmar cambios"
- THEN el Precio Venta $ de Mayor resultante se escribe al form real via `setPrecioVentaMayorCompleto` con precision de 8 decimales
- AND el Precio Venta Bs de Mayor en el form real se recalcula como display derivado (`usdToBs(...).toFixed(2)`), nunca como valor persistido independiente

### Requirement: Pre-fill extendido al entrar en modo manual

`handleSetModoRecalculo('manual')` MUST pre-llenar, para cada nivel, no solo el Margen % (comportamiento actual) sino tambien el Precio Venta $ y el Precio Venta Bs actuales del form real, de modo que los 3 campos arranquen consistentes entre si antes de cualquier edicion.
(Previamente: solo se pre-llenaba el Margen %; Precio $ y Bs no existian como campos editables.)

#### Scenario: Entrar a modo manual pre-llena los 3 campos consistentes

- GIVEN el form real tiene Margen 30%, Precio Venta $ 13.00 y Precio Venta Bs derivado para el nivel Detal
- WHEN el usuario selecciona el modo "Editar manual todo"
- THEN los campos Margen %, Precio Venta $ y Precio Venta Bs de Detal se pre-llenan con esos 3 valores consistentes entre si

### Requirement: No regresion en modos 'margen' y 'mantener_pvp'

Los modos 'margen' (default) y 'mantener_pvp' MUST seguir siendo 100% read-only en la tabla preview, sin columna editable nueva, y MUST producir exactamente los mismos valores de Margen %/Precio $ que antes de este cambio.

#### Scenario: Modo margen sigue siendo read-only

- GIVEN el usuario esta en modo 'margen' (default)
- WHEN la tabla preview se renderiza
- THEN Margen (%) y Precio Venta $ se muestran como texto derivado, no como inputs editables, igual que antes del cambio

#### Scenario: Modo mantener_pvp sigue siendo read-only

- GIVEN el usuario selecciono el modo 'mantener_pvp'
- WHEN la tabla preview se renderiza
- THEN el Precio Venta $ se mantiene fijo al valor actual del form real y el Margen % se muestra como informativo derivado, sin inputs editables
</content>
