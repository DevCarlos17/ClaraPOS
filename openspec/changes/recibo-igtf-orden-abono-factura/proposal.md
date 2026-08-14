# Proposal: Orden fiscal de IGTF y referencia de factura en abono/excedente del recibo

## Intent

Dos hallazgos de tester en el recibo de venta:
- **B2**: IGTF está mezclado en el total de alícuotas en vez de aplicarse DESPUÉS del subtotal
  de factura (grava el pago, no la mercancía).
- **B5**: cuando un excedente se aplica como saldo a favor (SAF) vía FIFO, el recibo no dice a
  qué factura, aunque el dato ya existe.

## Scope

### In Scope
- B2: línea nueva "TOTAL FACTURA" (subtotal sin IGTF) tras alícuotas; IGTF después; total final
  relabeled "TOTAL + IGTF". Ambos paths: PDF y PNG/texto.
- B5: restaurar `invoiceAssignments` (descartado en `cobro-modal.tsx:516-518`), enhebrarlo al
  cierre SAF: "abono aplicado a factura(s) N por Bs X ($Y)", multi-factura. Solo PNG/texto.
  Fallback sin factura destino: texto actual.

### Out of Scope
- B5 en PDF (render independiente, no probado por tester).
- Schema/persistencia (dato ya persistido; threading puro).
- Backlog previo (subtotal por artículo, desglose COMPRA).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `recibo-venta-exportacion`: cambia orden de totales y cierre SAF. **Coordinación**: el
  requirement "Cierre por manejo de excedente" vive en la delta spec del change hermano no
  archivado `recibo-desglose-pagos-orden`. `sdd-spec` decide si extiende o crea delta paralela.

## Approach

- **B2**: exponer `totalFacturaUsd/Bs` (= total - igtf) en `buildReciboData:184`; insertar línea
  bold tras alícuotas en ambos paths; relabel final.
- **B5**: incluir `invoiceAssignments` en el payload de `cobro-modal.tsx:501-519`; campo opcional
  en `ReciboDiscrepancyInput`/`ReciboCierre`; renderizar lista en `formatearCierre`.
- TDD: subtotal y formateo de lista como funciones puras, sin I/O.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `factura-export.ts` (136-208, 280-295, 419-429, 237-251) | Modified | Subtotal pre-IGTF, reorden PNG+PDF (B2), render facturas (B5) |
| `cobro-modal.tsx:501-519` | Modified | No descartar `invoiceAssignments` (B5) |
| `venta-exitosa-modal.tsx:20-36,77-113` | Modified | Tipo `discrepancy` + pass-through |
| `recibo-pagos.ts:24-36,97-119` | Modified | Campo opcional en tipos de cierre |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Multiplicidad FIFO | Med | Renderizar lista, no factura única |
| SAF sin `invoiceAssignments` | Med | Fallback al texto actual |
| Requirement en change hermano no archivado | Med | Coordinar en `sdd-spec` |
| B2 desincroniza PDF vs PNG | Low | Mismos valores derivados |

## Rollback Plan

Revertir el commit: display-only, sin migración.

## Dependencies

- Coordinación con `recibo-desglose-pagos-orden` en `sdd-spec`.

## Success Criteria

- [ ] PDF y PNG/texto: alícuotas → TOTAL FACTURA → IGTF → TOTAL + IGTF.
- [ ] Cierre SAF lista factura(s) aplicada(s) cuando existe `invoiceAssignments`.
- [ ] Subtotal y formateo cubiertos por unit tests puros.
- [ ] Ninguna query nueva ni cambio de schema.
