# Proposal: Consulta de Factura + Evolución Post-Emisión

## Intent

El modal `ReimprimirFacturaModal` ya cubre reimpresión (solo lectura), pero los
usuarios necesitan **consultar** el estado completo de una factura: métodos de
pago recibidos, si fue reversada (NC total/parcial), si tuvo abonos
posteriores, reversos de abono, o si generó saldo a favor. Hoy esa info es
parcial (NC solo por cantidad, sin monto), vive únicamente en el modal, y
"Métodos de pago" está oculta en pantalla aunque ya se calcula. Se renombra el
modal a su propósito real y se cierra la brecha de paridad con PDF/imagen.

## Scope

### In Scope
- **A. Rename**: `reimprimir-factura-modal.tsx`/`ReimprimirFacturaModal` →
  `consulta-factura-modal.tsx`/`ConsultaFacturaModal`; título "Reimprimir
  Factura" → "Consulta de Factura". Mismo prop shape. Actualiza 1 consumidor
  (`cliente-detalle.tsx`) + 2 tests.
- **B. Paridad de pagos**: un-hide "Métodos de pago" en `FacturaDetallePanel`
  (helpers ya exportados, cero query nueva).
- **C. Evolución post-emisión** (NUEVO, aditivo, en los 3 outputs — modal, PDF,
  texto/PNG): `ReciboData.evolucion` con reversos (monto real vía
  `notas_credito.total_usd/total_bs`, extendiendo `useReversosFactura`),
  abonos/reversos-de-pago/saldo-a-favor-generado (vía nuevo hook
  `useEvolucionFactura`, `movimientos_cuenta` tipo `PAG`/`REV`/`SAFC`,
  `empresa_id`-scoped).

### Out of Scope
- POS "facturas del día" standalone, `ventas-consultas-modal.tsx` (deferido en
  `reimpresion-factura-fiscal`).
- Cualquier escritura — el flujo es 100% lectura.
- Comportamiento de los 2 modales NC (FROZEN): `nota-credito-pos-modal`,
  `crear-ncr-modal`.
- Corregir la causa raíz del "capped pagos" SAF-FIFO en `use-ventas.ts`
  (caveat aceptado, documentado, no tocado).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `reimpresion-factura`: rename de superficie, un-hide pagos, sección de
  evolución en el modal (reemplaza el bloque NC solo-cantidad).
- `recibo-venta-exportacion`: nueva sección de evolución aditiva en PDF y
  texto/PNG, guardada tras el bloque de pagos.

## Approach

Single-source-of-truth: el hook (`useReciboDesdeFactura`) compone
`useReversosFactura` (extendido +`total_usd`/`total_bs`) y el nuevo
`useEvolucionFactura`; la función pura (`buildReciboDataDesdeFacturaGuardada`
→ `buildReciboData`) mapea a `ReciboData.evolucion?` (todo opcional/vacío por
default ⇒ salida byte-idéntica, misma disciplina que `esReimpresion`). Los 3
renderers leen ese único campo. Fuente de reversos: `notas_credito` propio
(NO `movimientos_cuenta` NCR — no confiable para contado, confirmado en
exploración). `agruparReversosPorNc` debe tomar el monto **una vez por NC**,
no por línea join.

## Affected Areas

| Area | Impacto | Descripción |
|---|---|---|
| `ventas/components/reimprimir-factura-modal.tsx` → `consulta-factura-modal.tsx` | Renamed | Archivo + componente + título |
| `ventas/components/factura-detalle-panel.tsx` | Modified | Un-hide pagos (B); sección evolución (C); reemplaza bloque NC cantidad-only; reescribe comentario L117-132 |
| `ventas/utils/factura-export.ts` | Modified | Tipos `ReciboEvolucion*`; inyección en `construirLineasRecibo` y `buildReciboPdfBlob` |
| `ventas/utils/recibo-desde-factura.ts` | Modified | Compone hooks de evolución; builder gana param aditivo `evolucion` |
| `ventas/hooks/use-notas-credito.ts` | Modified | `useReversosFactura` SELECT +`total_usd,total_bs`; `ReversoFacturaRowInput`/`ReversoAplicado` +monto (aditivo) |
| `cxc/hooks/use-cxc.ts` | Modified | Nuevo `useEvolucionFactura(ventaId, empresaId)` (PAG/REV/SAFC) |
| `clientes/components/cliente-detalle.tsx` | Modified | Import/uso del componente renombrado |
| `clientes/components/__tests__/cliente-detalle.test.tsx` | Modified | Mock path + testid |
| `ventas/components/__tests__/reimprimir-factura-modal.test.tsx` → renamed | Modified | Rename/reescritura |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Un-hide pagos expone el caveat SAF-FIFO "monto capado" en pantalla por primera vez | Low | Aceptado explícitamente por el usuario; compensado por la línea "saldo a favor generado" del lado origen; documentar en design |
| `agruparReversosPorNc` suma `total_usd` por línea join en vez de una vez por NC | Medium | Test unitario explícito con NC multi-línea |
| Extender `useReversosFactura`/`ReversoAplicado` rompe los 2 modales NC FROZEN | Medium | Extensión estrictamente aditiva; correr sus suites sin modificar |
| Tipo compartido `ReciboData` + ambos renderers tocados | Low | Campo opcional; default vacío = sin cambio; test de regresión byte-idéntico |

## Rollback Plan

Cambios aditivos/rename sobre ruta de solo-lectura, sin migración de esquema.
Revertir = `git revert` por slice de PR; feature-branch-chain permite
descartar una slice tardía (p.ej. evolución) sin afectar slices previas ya
mergeadas (rename, un-hide).

## Dependencies

- Depende de `reimpresion-factura-fiscal` (archivado): modal base,
  `useReciboDesdeFactura`, `buildReciboDataDesdeFacturaGuardada`.
- Base branch: `feat/reimpresion-factura-fiscal`. Tracker:
  `feat/consulta-factura-evolucion`.

## Success Criteria

- [ ] Modal renombrado; 1 consumidor + 2 tests actualizados y verdes
- [ ] "Métodos de pago" visible en modal, idéntico a PDF/imagen
- [ ] Evolución (reversos/abonos/reversos-pago/SAF) igual en los 3 outputs
- [ ] Evolución vacía ⇒ salida byte-idéntica a hoy (regresión verificada)
- [ ] Suites de los 2 modales NC FROZEN pasan sin modificar
- [ ] Toda query nueva filtra por `empresa_id`

## Review Workload Forecast — Slices Propuestas

| Slice (PR) | Contenido | Est. líneas |
|---|---|---|
| PR1 | Rename (A) completo + tests actualizados | ~80-120 |
| PR2 | Un-hide "Métodos de pago" (B) + test | ~40-80 |
| PR3 | Extender `useReversosFactura`/`ReversoAplicado` +monto, tests NC-modals sin tocar | ~120-180 |
| PR4 | Nuevo `useEvolucionFactura` (PAG/REV/SAFC) + tests | ~120-160 |
| PR5 | `ReciboData.evolucion` + composición en hook/builder + tests | ~150-200 |
| PR6a | Inyección en `construirLineasRecibo` + `buildReciboPdfBlob` + regresión byte-idéntica | ~200-280 |
| PR6b | Sección evolución en `FacturaDetallePanel` (reemplaza bloque NC) + tests | ~150-200 |

Total estimado ~860-1220 líneas repartidas en 7 slices, cada una bajo el
budget de 400 líneas. **Decision needed before apply: No** (chain ya
resuelto). **Chained PRs recommended: Yes.** **400-line budget risk: Low**
(pre-sliced).
