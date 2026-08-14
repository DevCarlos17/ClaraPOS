# Delta for Recibo Venta Exportación

> **Coordination note**: this delta ADDS requirements that refine the SAF branch of "Cierre
> por manejo de excedente" — a requirement owned by the sibling change
> `recibo-desglose-pagos-orden`, still unarchived. It does NOT redefine or duplicate that
> requirement's VUELTO/PROPINA/DIFERENCIAL_SOBRANTE scenarios. On archive, whichever change
> lands second MUST MERGE its ADDED requirements into `openspec/specs/recibo-venta-exportacion/spec.md`
> alongside the other's, never overwrite.

## ADDED Requirements

### Requirement: Orden fiscal de totales del recibo

El recibo (PDF y PNG/texto) MUST renderizar la sección de totales en este orden exacto: Monto
Exento → Base Imponible → alícuotas de IVA presentes → **TOTAL FACTURA** (subtotal de factura
sin IGTF) → **IGTF** (si aplica) → **TOTAL + IGTF** (total final, TOTAL FACTURA + IGTF). Ambas
rutas de render MUST derivar estos valores de los mismos totales de origen (bimonetario, Bs y
$), sin mutar ningún valor persistido.

#### Scenario: Venta con IGTF muestra TOTAL FACTURA y TOTAL + IGTF por separado

- GIVEN una venta con Monto Exento $1, Base Imponible $3, IVA 8% $0.08, IVA 16% $0.16, IGTF $0.06
- WHEN se genera el recibo
- THEN aparece "TOTAL FACTURA: $4.24" tras las alícuotas
- AND luego "IGTF: $0.06"
- AND luego "TOTAL + IGTF: $4.30" como línea final

#### Scenario: Venta sin IGTF no muestra línea de IGTF

- GIVEN una venta sin IGTF aplicable
- WHEN se genera el recibo
- THEN no aparece línea "IGTF"
- AND la línea final de total muestra solo el total de factura, sin sufijo "+ IGTF"

#### Scenario: PDF y PNG/texto usan el mismo orden

- GIVEN la misma venta con IGTF
- WHEN se genera el recibo en PDF y en PNG/texto
- THEN ambas rutas muestran Exento → Base Imponible → alícuotas → TOTAL FACTURA → IGTF →
  TOTAL + IGTF, con los mismos montos

### Requirement: Referencia de factura(s) en cierre SAF por excedente

Cuando un excedente se aplica como saldo a favor (SAF) contra factura(s) pendiente(s) vía
FIFO, el recibo (solo PNG/texto) MUST listar la(s) factura(s) destino en la línea de cierre:
"Abono aplicado a factura(s) {nro} por Bs X ($Y)". Esto refina — sin reemplazar — el caso SAF
de "Cierre por manejo de excedente"; los modos VUELTO, PROPINA y DIFERENCIAL_SOBRANTE, y el
caso SAF sin factura destino, MUST permanecer sin cambios. Ningún valor persistido MUST
mutarse al renderizar.

#### Scenario: Excedente aplicado a una sola factura

- GIVEN un excedente SAF con `invoiceAssignments` de una sola factura (nro 1234, Bs 500, $1)
- WHEN se genera el recibo
- THEN la línea de cierre muestra "Abono aplicado a factura(s) 1234 por Bs 500 ($1)"

#### Scenario: Excedente aplicado a múltiples facturas (FIFO)

- GIVEN un excedente SAF con `invoiceAssignments` de dos facturas (nro 1234 Bs 300/$0.60, nro
  1235 Bs 200/$0.40)
- WHEN se genera el recibo
- THEN la línea de cierre lista ambas facturas con su monto aplicado (Bs y $) cada una

#### Scenario: SAF sin factura destino conserva el texto actual

- GIVEN un excedente SAF puro (`safSubMode` distinto de `FACTURAS`, sin `invoiceAssignments`)
- WHEN se genera el recibo
- THEN la línea de cierre muestra "Saldo a favor del cliente: Bs X ($Y)" sin lista de facturas

#### Scenario: Otros modos de excedente no cambian

- GIVEN un excedente con `discrepancyMode` VUELTO, PROPINA o DIFERENCIAL_SOBRANTE
- WHEN se genera el recibo
- THEN la línea de cierre conserva su texto y comportamiento actuales, sin referencia a facturas
