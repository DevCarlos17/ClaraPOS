# Compra Lineas Cargo Specification

## Purpose

Permitir registrar cargos no-producto (material de empaque, flete) dentro de la factura de compra existente, sumarlos al total, y al procesar consolidarlos por concepto hacia registros `gastos` — sin alterar la logica de producto (inventario, kardex, PVP, lotes).

## Requirements

### Requirement: Injecting Charge Lines

El formulario de compra MUST permitir agregar lineas de cargo no-producto de dos conceptos: `MATERIAL_EMPAQUE` y `FLETE`, mediante dos botones dedicados ("+ Material de empaque", "+ Flete"). El sistema MUST permitir multiples lineas por concepto. La logica de lineas de producto MUST permanecer sin cambios de comportamiento.

#### Scenario: Add a single empaque line

- GIVEN un formulario de compra abierto con lineas de producto ya cargadas
- WHEN el usuario hace clic en "+ Material de empaque"
- THEN se agrega una nueva linea de cargo de concepto `MATERIAL_EMPAQUE`
- AND las lineas de producto existentes no se modifican

#### Scenario: Add multiple lines of the same concept

- GIVEN un formulario de compra con una linea de flete ya agregada
- WHEN el usuario hace clic en "+ Flete" nuevamente
- THEN se agrega una segunda linea independiente de concepto `FLETE`
- AND ambas lineas de flete coexisten y pueden editarse por separado

### Requirement: Charge Line Fields

Cada linea de cargo MUST tener: concepto (`empaque` | `flete`), monto expresado en la moneda ya seleccionada en el formulario, y una tasa de IVA restringida a `{0%, 16%}` seleccionable solo por dropdown. El sistema MUST rechazar cualquier valor de IVA fuera de ese conjunto.

#### Scenario: IVA dropdown restricts to allowed values

- GIVEN una linea de cargo de flete en edicion
- WHEN el usuario abre el selector de IVA
- THEN solo estan disponibles las opciones 0% y 16%
- AND no existe forma de ingresar un porcentaje libre

### Requirement: Charges Included in Invoice Total

El monto total mostrado al usuario MUST incluir la suma de las bases y el IVA de todas las lineas de cargo (empaque y flete), ademas del total de las lineas de producto.

#### Scenario: Total reflects charge amounts

- GIVEN una factura con lineas de producto que totalizan $100 base
- AND una linea de flete de $10 base con IVA 16%
- WHEN el usuario revisa el total de la factura
- THEN el total mostrado incluye $100 + $10 + $1.60 (IVA de flete) mas el IVA de las lineas de producto

### Requirement: Blank Charge Line Blocks Processing

El sistema MUST impedir procesar/guardar la factura mientras exista una linea de cargo incompleta (monto ausente o invalido). El usuario MUST completar la linea o eliminarla antes de continuar.

#### Scenario: Incomplete charge line blocks submit

- GIVEN una linea de empaque agregada sin monto ingresado
- WHEN el usuario intenta procesar la factura
- THEN el sistema bloquea el envio y senala la linea incompleta
- AND la factura no se guarda

#### Scenario: Removing incomplete line unblocks submit

- GIVEN una linea de empaque incompleta que bloquea el envio
- WHEN el usuario elimina esa linea
- THEN el sistema permite procesar la factura normalmente

### Requirement: Consolidation by Concept into Gastos

Al procesar la factura, el sistema MUST consolidar las lineas de cargo por concepto en exactamente un registro `gastos` por concepto presente. La consolidacion MUST sumar las bases de todas las lineas del concepto y sumar el IVA de todas las lineas del concepto POR SEPARADO, incluso cuando las lineas del mismo concepto tienen tasas de IVA distintas (0% y 16% mezcladas). Si un concepto no tiene lineas, el sistema MUST NOT crear un `gastos` para ese concepto.

#### Scenario: Multiple empaque lines consolidate into one gasto

- GIVEN dos lineas de empaque con montos $5 y $8, ambas con IVA 16%
- WHEN el usuario procesa la factura
- THEN se crea exactamente 1 registro `gastos` de concepto `MATERIAL_EMPAQUE`
- AND su base es $13 y su IVA es $2.08

#### Scenario: Mixed-IVA consolidation within the same concept

- GIVEN una linea de flete de $10 con IVA 0% y otra linea de flete de $20 con IVA 16%
- WHEN el usuario procesa la factura
- THEN se crea exactamente 1 registro `gastos` de concepto `FLETE`
- AND su base es $30 (suma de ambas bases)
- AND su IVA es $3.20 (suma del IVA de cada linea calculado por separado: $0 + $3.20)

#### Scenario: Both concepts present produce two gastos

- GIVEN al menos una linea de empaque y al menos una linea de flete en la factura
- WHEN el usuario procesa la factura
- THEN se crean exactamente 2 registros `gastos`: uno de concepto `MATERIAL_EMPAQUE` y uno de concepto `FLETE`

#### Scenario: No charge lines means zero gastos (regression)

- GIVEN una factura de compra normal sin ninguna linea de cargo agregada
- WHEN el usuario procesa la factura
- THEN no se crea ningun registro `gastos` para empaque ni flete
- AND el comportamiento de la factura es identico al existente antes de este cambio

### Requirement: Gasto Record Shape and Traceability

Cada `gastos` consolidado MUST resolver su cuenta contable via la clave correspondiente en `cuentas_config` (`MATERIAL_EMPAQUE` o `FLETE_COMPRA`), MUST fijar `doc_origen_tipo = 'COMPRA'` y `doc_origen_id` igual al id de la compra, MUST fijar `empresa_id` desde el usuario actual, y MUST calcularse en modalidad bimonetaria usando la tasa de cambio ya fotografiada por la factura (USD base + Bs). La insercion MUST ocurrir dentro de la MISMA `writeTransaction` de `crearCompra()`, mediante insercion cruda (`tx.execute`), sin abrir una transaccion anidada ni invocar `crearGasto()`.

#### Scenario: Gasto references the originating compra

- GIVEN una factura de compra con una linea de flete que se procesa exitosamente
- WHEN se consulta el registro `gastos` de concepto `FLETE` resultante
- THEN `doc_origen_tipo` es `'COMPRA'` y `doc_origen_id` es el id de la compra procesada
- AND `empresa_id` coincide con la empresa del usuario que proceso la factura

#### Scenario: Gasto amounts use the invoice exchange rate

- GIVEN una factura de compra en Bolivares con tasa de cambio fotografiada de 40.0000
- AND una linea de empaque de Bs 400 con IVA 16%
- WHEN se procesa la factura
- THEN el `gastos` de `MATERIAL_EMPAQUE` registra el monto equivalente en USD usando la tasa 40.0000
- AND respeta precision decimal (2 decimales en montos, 4 en tasa)

### Requirement: Financial Immutability and Multi-Tenant Isolation

Los registros `gastos` creados por esta consolidacion MUST cumplir las mismas reglas de inmutabilidad financiera que cualquier otro `gastos` (sin UPDATE de montos, transiciones de estado via el flujo de anulacion existente). Toda lectura y escritura relacionada con lineas de cargo MUST estar aislada por `empresa_id`.

#### Scenario: Consolidated gasto is immutable like any other

- GIVEN un `gastos` creado por consolidacion de lineas de empaque
- WHEN se intenta modificar sus montos financieros directamente
- THEN el sistema no ofrece una via de edicion directa; solo el flujo de anulacion existente puede cambiar su estado

## Non-Goals

- No incluye el formulario de Gasto standalone (`gasto-form.tsx` / `crearGasto`).
- No modifica la logica de producto en `compra-form.tsx` (PVP, lotes, unidades, kardex).
- No introduce un nuevo mecanismo de tasa de cambio.
- No remapea el modulo de contabilidad hacia cuentas de costo.
- No admite IVA fuera de `{0%, 16%}` en lineas de cargo.
