# Recibo de Venta — Exportación Specification

## Purpose

Tras procesar una venta, el sistema MUST generar un RECIBO con contenido fiscal dinámico: PDF descargable (desktop) o texto compartible (mobile, Web Share API), offline, filtrado por `empresa_id`.

## Requirements

### Requirement: Encabezado emisor y cliente

El sistema MUST poblar el encabezado con emisor (razón social, RIF, dirección desde `empresas`/`empresas_fiscal_ve`, por `empresa_id`) y cliente (razón social, RIF, dirección) de la venta.

#### Scenario: Encabezado completo desde empresa y cliente

- GIVEN una venta procesada con cliente asociado
- WHEN se genera el recibo
- THEN el encabezado muestra razón social, RIF y dirección del emisor y del cliente, de `empresa_id` del usuario actual

### Requirement: Líneas de producto con marca de exento

Cada línea MUST derivarse de `ventas_det`: nombre, cantidad, precio unitario y total SIN IVA. El nombre MUST incluir "(E)" si el producto es Exento o Exonerado.

#### Scenario: Producto exento marcado con (E)

- GIVEN una venta con línea Exenta y línea Gravada
- WHEN se generan las líneas
- THEN la Exenta muestra "(E)" y la Gravada no; ambas con precios SIN IVA

### Requirement: Totales dinámicos, IGTF y metadatos

El sistema MUST agrupar líneas gravadas por cada alícuota distinta, generando una línea de "total por alícuota" por grupo, más total exento, base imponible y total factura; IGTF MUST aparecer solo si `igtfUsd > 0`. El recibo MUST incluir siempre número, fecha de emisión y total general.

#### Scenario: Venta con múltiples alícuotas

- GIVEN una venta con líneas a 16% y 8% de IVA
- WHEN se calculan los totales
- THEN aparecen dos líneas de "total por alícuota" (una por tasa), cada una con su base y monto de IVA

#### Scenario: Venta totalmente exenta

- GIVEN una venta donde todas las líneas son Exentas o Exoneradas
- WHEN se calculan los totales
- THEN se muestra el total exento y NO aparece ninguna línea de "total por alícuota"

#### Scenario: IGTF presente y ausente

- GIVEN ventas con `igtfUsd > 0` y con `igtfUsd = 0`
- WHEN se generan los recibos
- THEN la primera muestra la línea IGTF; la segunda no

#### Scenario: Metadatos siempre presentes

- GIVEN cualquier venta procesada
- WHEN se genera el recibo
- THEN número, fecha de emisión y total general aparecen en el documento

### Requirement: Formatos de entrega y detección de capacidad

El sistema MUST generar texto monoespaciado con todas las secciones, ofrecido vía `navigator.share({ text })` si `typeof navigator.share === 'function'`; si no, MUST ofrecer solo descarga de un blob PDF equivalente. MUST NOT usar el ancho de viewport para decidir.

#### Scenario: Compartir texto en dispositivo compatible

- GIVEN `typeof navigator.share === 'function'`
- WHEN el usuario selecciona compartir
- THEN se invoca `navigator.share` con el texto plano completo, sin red

#### Scenario: Fallback a descarga PDF sin Web Share API

- GIVEN `navigator.share` no está definido
- WHEN se renderizan las opciones
- THEN solo se ofrece descarga PDF, sin importar el tamaño de pantalla

### Requirement: Terminología RECIBO

El documento y su UI MUST usar "RECIBO"; MUST NOT usar "Factura" en ningún texto generado (texto o PDF).

#### Scenario: Ausencia de la palabra Factura

- GIVEN cualquier recibo generado
- WHEN se inspecciona su contenido
- THEN no aparece la palabra "Factura"

### Requirement: Aislamiento multi-tenant y generación offline

Toda consulta de datos (venta, líneas, empresa, cliente) MUST filtrar por `empresa_id` actual. La generación (datos, texto, PDF) MUST funcionar sin red, usando solo SQLite local y `jsPDF`/`jspdf-autotable`.

#### Scenario: Datos de otra empresa excluidos

- GIVEN un usuario de la empresa A
- WHEN genera un recibo
- THEN solo se usan datos de `empresa_id` de A

#### Scenario: Generación sin red disponible

- GIVEN el dispositivo sin conexión
- WHEN se genera y descarga/comparte el recibo
- THEN el documento se produce sin ninguna petición de red
