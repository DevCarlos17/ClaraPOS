# Proposal: Descargar/Compartir Recibo desde Venta Procesada

## Intent

Tras procesar una venta en el POS, el usuario no tiene forma de entregar un comprobante al cliente (PDF, imagen o texto). El modal "Venta Procesada" (`venta-exitosa-modal.tsx`) solo muestra un resumen en pantalla. Se necesita generar un documento fiscal-friendly (RECIBO, no "Factura" por ahora) descargable en desktop y compartible via share sheet nativo en mobile, con contenido dinamico completo (exentos, IGTF, multiples alicuotas de IVA).

## Scope

### In Scope
- Corregir `cobro-modal.tsx` para pasar `ventaId` (ya devuelto por `crearVenta()`, hoy descartado) hacia `onSuccess`.
- Builder de datos de recibo: header emisor (empresa/RIF/direccion), header cliente, lineas de producto (marca "(E)" en exentos/exonerados), y totales dinamicos (exento, base imponible, total por alicuota, IGTF condicional, total general).
- Formato **texto plano**: string monoespaciado, compartido via `navigator.share({ text })` en mobile.
- Formato **PDF**: `jsPDF` + `jspdf-autotable` (reusa patron de `ventas-consultas-modal.tsx`), `doc.output('blob')`, descarga por anchor+blob en desktop.
- Deteccion de capacidad por feature-detection (`typeof navigator.share === 'function'`), NO por viewport (`use-mobile.ts` descartado para esto).
- Nuevo util `src/features/ventas/utils/factura-export.ts` con los builders de datos/documento, reusable por el flujo de reimpresion existente.

### Out of Scope (diferido a PR de seguimiento)
- Formato **imagen (PNG)** via Canvas 2D dibujado a mano.
- Web Share API Level 2 con archivos (`navigator.canShare({ files })`) — PDF/imagen compartidos como archivo en mobile.
- Retenciones IVA/ISLR en el recibo (no confirmado como requerido).
- Renombrar "RECIBO" a "Factura" (pendiente de definicion fiscal futura).

## Capabilities

### New Capabilities
- `recibo-venta-exportacion`: generación y entrega (descarga/compartir) del documento RECIBO de una venta procesada, en múltiples formatos, con contenido fiscal dinámico.

### Modified Capabilities
None — no existe spec previo de ventas que cubra exportación de comprobantes.

## Approach

1. **Fix previo**: threading de `ventaId` en `cobro-modal.tsx` → `VentaExitosaData`.
2. **Data layer**: reusar/consolidar `useDetalleFactura(ventaId)` (hoy duplicado en `use-cxc.ts` y `use-notas-credito.ts`) + `useCompany()` para armar el modelo de datos del recibo con agrupación por alícuota.
3. **Builders puros** en `factura-export.ts`: `buildReciboData()`, `buildReciboTextoPlano()`, `buildReciboPdfBlob()`.
4. **UI** en `venta-exitosa-modal.tsx`: botones de acción condicionados por feature-detection — mobile → `navigator.share({ text })`; desktop → descarga de PDF vía Blob.
5. Todo 100% local/offline (SQLite + jsPDF + Canvas), sin llamadas de red, respetando el modelo offline-first.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/ventas/components/cobro-modal.tsx` | Modified | Threading de `ventaId` hacia `onSuccess` |
| `src/features/ventas/components/venta-exitosa-modal.tsx` | Modified | Botones de descarga/compartir, deteccion de capacidad |
| `src/features/ventas/utils/factura-export.ts` | New | Builders de datos y documentos (texto/PDF) |
| `src/features/ventas/hooks/use-ventas.ts` (o similar) | Modified | Consolidar `useDetalleFactura` en un solo hook canonico |
| `src/features/reportes/components/ventas-consultas-modal.tsx` | Modified (opcional) | Reusar builders nuevos en `handleImprimirPdf` para evitar duplicacion |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Quirk de iOS Safari con `navigator.share` + gesto de usuario | Medium | Mantener la llamada a `share()` cerca del handler de click, sin `await` previos bloqueantes; probar en dispositivo real |
| Recibos con muchas lineas desbordan una pagina PDF | Low | Usar patron `addPage` de jsPDF ya existente en el repo |
| Fuente de IGTF incierta (condicion de aplicacion) | Medium | Reusar el mismo dato que ya llega a `VentaExitosaData` (`igtfUsd`/`tasaIgtfPct`), validar con datos reales antes de spec |
| Duplicacion de `useDetalleFactura` genera drift | Low | Consolidar a un solo hook canonico como parte de este change |

## Rollback Plan

Los cambios son aditivos (nuevo util, nuevos botones) salvo el threading de `ventaId` (cambio de firma no rompiente, campo opcional). Si falla, revertir el commit del util nuevo y de los botones en `venta-exitosa-modal.tsx`; el flujo de venta y el modal de exito siguen funcionando sin la feature de exportacion.

## Dependencies

Ninguna dependencia nueva de npm. Reusa `jsPDF`, `jspdf-autotable` (ya instalados) y Web Share API nativa.

## Success Criteria

- [ ] Tras procesar una venta, en mobile aparece opcion de compartir texto plano del recibo con contenido fiscal completo (header, lineas, exentos marcados, totales por alicuota, IGTF si aplica).
- [ ] En desktop aparece opcion de descargar el mismo recibo en PDF con igual contenido.
- [ ] `ventaId` llega correctamente a `venta-exitosa-modal.tsx` sin romper el flujo existente de cobro.
- [ ] Ningun texto de UI usa la palabra "Factura"; se usa "RECIBO".
- [ ] Funciona completamente offline (sin llamadas de red).
