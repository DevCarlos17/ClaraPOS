# Delta for notas-credito-admin

## MODIFIED Requirements

### Requirement: Selector "Devolver dinero" / "Crédito a favor" — con sub-opciones de tesorería y sesión de caja

El modal MUST mostrar un selector con dos opciones: "Devolver dinero" y "Crédito a favor". "Devolver dinero" MUST estar habilitada (solo entry point `TRADICIONAL`). Al seleccionarla, el modal MUST revelar dos sub-opciones, **ambas habilitadas**: "Tesorería" y "Sesión de caja activa" — esta última ya NO es "Próximamente". Seleccionar "Tesorería" MUST revelar el mini-formulario existente (cuenta con saldo, monto en moneda de la cuenta, referencia opcional, cálculo en vivo de pendiente). Seleccionar "Sesión de caja activa" MUST revelar un selector poblado por `useSesionesActivas()` — TODAS las sesiones `ABIERTA` de la empresa del usuario actual, sin restringir a la sesión propia del usuario ni a `venta.sesion_caja_id` — más el MISMO mini-formulario de monto/referencia libre por línea. Confirmar con una sesión elegida y monto(s) válido(s) MUST invocar `crearNotaCredito` con modalidad `REFUND_TESORERIA` y `egresoParams` con al menos una línea `destino: 'SESION_CAJA'` + el `sesion_caja_id` elegido. "Crédito a favor" MUST seguir resultando siempre en `SALDO_FAVOR` (sin cambios).
(Previously: la sub-opción "Sesión de caja activa" era visible pero permanecía deshabilitada con la etiqueta "Próximamente".)

#### Scenario: Ambas opciones visibles

- GIVEN el modal abierto con una factura seleccionada
- WHEN el usuario observa el selector de origen de reverso
- THEN ve "Devolver dinero" y "Crédito a favor"

#### Scenario: Devolver dinero revela ambas sub-opciones activas

- GIVEN el selector visible
- WHEN el usuario selecciona "Devolver dinero"
- THEN se revelan "Tesorería" y "Sesión de caja activa", ambas seleccionables (ninguna deshabilitada)

#### Scenario: Sesión de caja activa revela el selector de sesiones

- GIVEN "Devolver dinero" seleccionada
- WHEN el usuario selecciona la sub-opción "Sesión de caja activa"
- THEN se revela un selector con todas las sesiones `ABIERTA` de la empresa y el mismo mini-formulario de monto/referencia usado por Tesorería

#### Scenario: Selección cross-sesión permitida

- GIVEN una factura de una sesión distinta a las activas (cerrada, o histórica sin sesión)
- WHEN el usuario elige, como destino del egreso, cualquier sesión `ABIERTA` de la empresa
- THEN el sistema lo permite sin exigir que coincida con `venta.sesion_caja_id`

#### Scenario: Selector limitado a sesiones de la propia empresa

- GIVEN un usuario de la empresa A
- WHEN abre el selector de "Sesión de caja activa"
- THEN solo ve sesiones `ABIERTA` con `empresa_id` igual a la suya

#### Scenario: Confirmación usa la tasa histórica de la NC

- GIVEN una NC con `tasa_historica` conocida y una sesión `ABIERTA` elegida
- WHEN el usuario confirma la emisión
- THEN se invoca `crearNotaCredito` con `REFUND_TESORERIA` y línea `destino: 'SESION_CAJA'` convertida a USD con la tasa histórica de la NC, nunca la tasa vigente

#### Scenario: Sesión pasa a cerrada entre selección y confirmación

- GIVEN una sesión `ABIERTA` al abrirse el selector
- WHEN esa sesión pasa a `CERRADA` antes de confirmar y el usuario confirma igual
- THEN la operación se rechaza en el cliente antes de escribir cualquier registro, incluida la NC misma

#### Scenario: Remanente no cubierto por la sesión pasa a SAFC

- GIVEN un monto de NC mayor al asignado a la línea `SESION_CAJA`
- WHEN el usuario confirma con un monto parcial
- THEN el remanente se registra como SAFC, igual que hoy ocurre para Tesorería

#### Scenario: Emisión vía Crédito a favor / Tesorería sin cambios

- GIVEN "Crédito a favor", o "Devolver dinero" → "Tesorería" con datos válidos
- WHEN el usuario confirma la emisión
- THEN se invoca `SALDO_FAVOR` o `REFUND_TESORERIA` (`destino: 'BANCO'`/`'CAJA_FUERTE'`) respectivamente, sin cambios respecto al comportamiento existente

## Out of Scope (Fase 3)

- Paridad completa POS/admin cruzando sesiones en la presentación del cuadre.
- Nivelar mejoras de este flujo admin hacia el flujo POS.
