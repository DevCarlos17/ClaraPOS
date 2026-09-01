# Gastos: Costeo por Base Imponible Specification

## Purpose

Toda escritura y lectura de `gastos` (manual o generada por cargos de compra: empaque/flete) presenta tres valores distintos y consistentes: **Base** (costo real), **IVA** (impuesto, no es costo) y **Total** (base + IVA, desembolso). Los reportes de costo/gasto se arman desde la base imponible, nunca desde base+IVA.

Fuera de alcance: migración de datos históricos, IVA por alícuota detallado, módulo de asientos contables (`libro_contable`, `generarAsientosCompra`).

## Requirements

### Requirement: Separación de Costo e Impuesto en Gastos

El sistema DEBE almacenar, en todo registro `gastos`, el costo en `base_imponible_usd` y el impuesto en `monto_iva_usd`, como valores distintos del desembolso total (base+IVA). En filas de cargo de compra (empaque/flete), el costo reportado del gasto DEBE igualar la base imponible, no base+IVA.

#### Scenario: Cargo de flete con IVA 16%

- GIVEN cargo "flete" de base $1.00 y 16% IVA
- WHEN `crearCompra` genera el `gastos` asociado
- THEN `base_imponible_usd=1.00`, `monto_iva_usd=0.16`
- AND el costo reportado es $1.00, no $1.16

#### Scenario: Cargo de empaque exento (IVA 0%)

- GIVEN cargo "empaque" con alícuota 0%
- WHEN se genera el `gastos` asociado
- THEN costo=base, impuesto=0, total=base

### Requirement: Reportes y Dashboard con Desglose Base | IVA | Total

Los reportes y dashboard de gastos DEBEN presentar costo (suma `base_imponible_usd`), impuesto (suma `monto_iva_usd`) y total (suma base+IVA por fila), para TODAS las filas (manuales y de cargo), sin doble conteo.

#### Scenario: Gasto manual con base y IVA

- GIVEN gasto manual con base $100 e IVA $16
- WHEN se visualiza en el reporte
- THEN muestra costo $100, impuesto $16, total $116

#### Scenario: Agregación mixta (manual + cargo)

- GIVEN filas `gastos` manuales y de cargo mezcladas
- WHEN el reporte agrega totales
- THEN costo total = suma de bases, impuesto total = suma de IVA, total general = suma de totales por fila, sin discrepancias

#### Scenario: Regresión — totalmente exento

- GIVEN gasto o compra con IVA 0% en todas sus líneas
- WHEN se reporta
- THEN costo = total, impuesto = 0

### Requirement: Desglose en Pantalla del Formulario de Compra Incluye Cargos

El resumen de `compra-form` DEBE incluir las líneas de cargo (empaque/flete) en su desglose base/IVA, reconciliando con el total general (que ya las incluye).

#### Scenario: Compra con producto y flete

- GIVEN compra con línea de producto y línea de cargo de flete, cada una con base e IVA propios
- WHEN se visualiza el resumen antes de confirmar
- THEN el desglose incluye el aporte del flete
- AND base+IVA del desglose = total general mostrado

### Requirement: Columnas Base e IVA en Listado de Compras

`compra-list` DEBE mostrar columnas Base e IVA junto a Total, usando `facturas_compra.total_base_usd`/`total_iva_usd` ya existentes.

#### Scenario: Factura con base 100 e IVA 16

- GIVEN factura con `total_base_usd=100`, `total_iva_usd=16`, total=116
- WHEN se visualiza la fila en el listado
- THEN se muestran Base 100, IVA 16, Total 116

### Requirement: Consistencia de Escritura en Todos los Orígenes de Gasto

Todo camino de creación de `gastos` (manual `crearGasto`, cargo empaque/flete de `crearCompra`, ajustes de sobrantes/faltantes) DEBE poblar `base_imponible_usd`, `monto_iva_usd` y total de forma coherente (base+IVA=total).

#### Scenario: Gasto manual creado directamente

- GIVEN usuario crea gasto manual con base $100 e IVA $16
- WHEN se guarda
- THEN `base_imponible_usd=100`, `monto_iva_usd=16`, total=116, consistente con gastos de cargo de compra
