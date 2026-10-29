# Proposal: Reverso de abono directo desde Consulta de Factura (Slice 1)

## Intent

Hoy solo se reversa un abono desde Tesorería. El owner quiere hacerlo desde "Consulta de Factura" (4 sitios), eligiendo el abono puntual y viendo si afecta solo esa factura o un abono global. `FacturaDetalleCxc` ya tiene un "Reversar" con el orquestador equivocado (`registrarReversoAbono`, sin pata bancaria) que infla `bancos_empresa.saldo_actual` en directos — bug en producción que esta entrega corrige.

## Scope

### In Scope
- UI de abonos individuales en Consulta de Factura (`usePagosFactura`; hoy agrupados por método, pierden `pago.id`).
- Preview de fan-in (reuso `previewFacturasAfectadas`) antes de confirmar un directo.
- Confirmar → `reversarAbonoDirectoDesdeTesoreria` vía adapter `pago_id → ingreso_id` (query sobre `movimientos_bancarios_pagos`).
- Fix: "Reversar" de `FacturaDetalleCxc` enruta DIRECTOS al orquestador de tesorería.
- 3 disables sin conflar: BATCH, SAF (`detectarLoteSafDePago` post fan-in), LEGACY sin trazabilidad.
- Sesión CERRADA + directo: warning pasivo, permite confirmar.

### Out of Scope (slices futuros)
- Slice 2: reverso batch de 1 factura + guard de sesión cerrada.
- Slice 3: reconciliar SAF (bloqueo vs. compensación).
- Cambio #3: cómo el cuadre-de-caja muestra un reverso post-cierre.
- Fan-in de abono global por lote (sin tabla puente).

## Capabilities

### New Capabilities
- `consulta-factura-reverso-abono`: selección de abono + preview de fan-in + reverso directo/global-directo, con 3 disables y warning de sesión cerrada.

### Modified Capabilities
- `tesoreria-reverso-abono-directo`: su escenario "Reverso standalone desde CxC" asumía que `FacturaDetalleCxc` siempre llama `registrarReversoAbono`. Ahora enruta DIRECTOS al orquestador de tesorería; `registrarReversoAbono` queda solo para no-directos.

## Approach

Reuso total de los orquestadores existentes + UI nueva + adapter 1-query + fix con la misma rama direct/no-direct.

## Affected Areas

| Area | Impacto |
|---|---|
| `consulta-factura-modal.tsx`, `factura-detalle-panel.tsx` | Nuevo: lista de abonos + preview/confirmación |
| nuevo hook/util | Nuevo: adapter `pago_id → ingreso_id` + clasificación |
| `factura-detalle-cxc.tsx` | Modificado: enruta DIRECTOS a tesorería |
| `use-reverso-abono-directo.ts`, `use-preview-facturas-afectadas.ts`, `reversa-pago-saf.ts` | Reuso |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Conflar los 3 disables | Media | Helper único, 4 salidas exhaustivas |
| Fix de CxC rompe ruta no-directa | Baja | No-directa queda sin cambios |
| Tamaño de PR | Media | Split si supera 400 líneas |

## Rollback Plan

Revertir el PR restaura el modal read-only original; revertir el fix de CxC reintroduce el bug conocido.

## Dependencies

- `origin/develop@027ed93` (PR #278 mergeado); implementación parte de `develop`.

## Success Criteria

- [ ] Los 4 sitios listan abonos individuales por factura.
- [ ] Reverso directo (simple o fan-in) = efectos de `ReversoModal`.
- [ ] Batch/SAF/legacy: mensajes distintos, sin confirmar.
- [ ] `FacturaDetalleCxc` ya no infla el saldo bancario en directos.
- [ ] Sesión CERRADA + directo: warning, confirma igual.
