# Proposal: Reordenar Secciones y Desglose de Pagos en Recibo de Venta

## Intent

El tester probo el recibo de venta (PRs #26/#27) y reporto 3 problemas: (1) el orden de secciones no sigue la lectura natural de un comprobante venezolano, (2) no existe desglose de metodos de pago ni de como se manejo un sobrepago (vuelto/SAF/propina) o un saldo a credito, (3) los textos largos de direccion/razon social/usuario del emisor desbordan el ancho del documento. Los datos de pagos, excedente y credito YA estan modelados y persistidos (`pagos`, `movimientos_metodo_cobro`, `movimientos_cuenta`, `ventas.saldo_pend_usd`) pero nunca llegaron al recibo (PDF/PNG); es un problema de wiring, no de modelado.

## Scope

### In Scope
- Reordenar secciones del recibo (PDF y PNG) a: emisor -> nro+fecha -> cliente -> articulos -> subtotales/totales -> desglose de pagos.
- Nueva seccion "Metodos de pago": una linea consolidada por `metodo_cobro_id` (SUM de multiples `pagos` del mismo metodo), moneda nativa del metodo + equivalente en Bs si el metodo es USD.
- Reconciliar: suma de abonos en Bs debe cuadrar con el total de la factura en Bs.
- Linea de cierre de excedente (si `discrepancyMode` fue VUELTO/SAF/PROPINA/DIFERENCIAL_SOBRANTE): texto + monto segun el modo.
- Linea de cierre de credito (si `ventas.saldo_pend_usd > 0`): "Quedo a credito: Bs X ($ Y)".
- Threading: `cobro-modal.tsx` (linea ~501, hoy descarta `discrepancyMode`/montos de excedente) -> `VentaExitosaData` -> `buildReciboData()` -> `ReciboData`.
- Fix de layout: wrap/truncado de direccion, razon social y usuario respetando el ancho del documento en PDF (autoTable/text wrapping) y PNG (canvas measureText + wrap manual).
- Funcion pura y testeada unitariamente para agrupar/reconciliar pagos por metodo (TDD estricto activo en el repo).

### Out of Scope
- Compartir PDF/imagen como archivo en mobile (tester #3, requiere deploy para probar).
- Reactivacion de descuentos comerciales (pausado, flag `DESCUENTOS_HABILITADOS=false`).
- Cambios en como se PERSISTE el excedente/credito (solo se lee/muestra lo ya guardado).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `recibo-venta-exportacion`: se agregan requisitos de orden de secciones, desglose de pagos por metodo con reconciliacion, cierre por excedente/credito, y ajuste de layout para texto largo.

## Approach

1. **Tipos**: extender `ReciboData` (`factura-export.ts`) con `pagos: ReciboPagoLinea[]` (metodo, moneda, montoNativo, montoBsEquiv) y `cierre: { tipo: 'EXCEDENTE' | 'CREDITO' | null, ...montos }`.
2. **Funcion pura**: `agruparPagosPorMetodo(pagos, metodosCobro)` — SUM por `metodo_cobro_id`, resuelve moneda via `metodos_cobro`/`monedas`, retorna lineas consolidadas + reconciliacion contra el total en Bs. Cubierta por test unitario (yarn test:run).
3. **Wiring**: `cobro-modal.tsx` pasa `discrepancyMode` + montos de excedente (ya calculados localmente, ej. `vueltoMontoBs`, `safMonto`) hacia `VentaExitosaData`; `venta-exitosa-modal.tsx` los pasa a `buildReciboData()`; credito se deriva de `ventas.saldo_pend_usd` post-creacion (ya disponible via `result`/query).
4. **Render**: `construirLineasRecibo()` reordena secciones y agrega la nueva seccion de pagos + cierre, compartida por `buildReciboPdfBlob` y `buildReciboImagenBlob`.
5. **Layout**: aplicar wrap de texto (autoTable `columnStyles`/`splitTextToSize` en PDF; canvas `measureText` + salto manual en PNG) a los 3 campos de emisor/usuario reportados.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/ventas/utils/factura-export.ts` | Modified | `ReciboData` + nueva seccion de pagos/cierre + reordenamiento + fix de wrap en PDF/PNG |
| `src/features/ventas/components/cobro-modal.tsx` | Modified | Threading de `discrepancyMode` + montos de excedente hacia `onSuccess` (linea ~501) |
| `src/features/ventas/components/venta-exitosa-modal.tsx` | Modified | `construirRecibo` pasa pagos + excedente + credito a `buildReciboData` |
| `src/features/ventas/utils/factura-export.test.ts` (nuevo) | New | Test unitario de `agruparPagosPorMetodo` (agrupacion, moneda, reconciliacion Bs) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Reconciliacion Bs no cuadra por redondeo de tasa | Medium | Usar `Decimal.js` (ya usado en el archivo) en toda la cadena, no `number`, hasta el formateo final |
| Multiples modos de excedente (VUELTO/SAF/PROPINA/DIFERENCIAL) con textos distintos mal mapeados | Medium | Un mapa explicito `discrepancyMode -> texto` con test que cubra los 4 casos |
| Wrap de texto rompe layout existente de PDF/PNG en recibos ya probados | Low | Cambio acotado a 3 campos especificos, verificar visualmente ambos formatos antes de cerrar |
| `saldo_pend_usd` no disponible inmediatamente tras `crearVenta` (timing offline-first) | Low | Usar el valor calculado localmente en el momento del cobro (`totalEfectivoUsd - sum(pagos)`) en vez de re-query |

## Rollback Plan

Cambios son extensiones aditivas a tipos/funciones existentes (nuevos campos opcionales en `ReciboData`, nueva seccion de render) mas un reordenamiento de secciones ya existentes. Si falla, revertir el commit del reordenamiento/seccion de pagos en `factura-export.ts` y el threading en `cobro-modal.tsx`; el recibo sigue funcionando en su forma actual (sin desglose de pagos).

## Dependencies

Ninguna dependencia nueva de npm. Reusa `Decimal.js`, `jsPDF`/`jspdf-autotable`, y Canvas 2D ya presentes en `factura-export.ts`.

## Success Criteria

- [ ] El recibo (PDF y PNG) muestra las secciones en el orden: emisor, nro+fecha, cliente, articulos, totales, pagos.
- [ ] La seccion de pagos consolida multiples pagos del mismo metodo en una sola linea, mostrando Bs (y $ + Bs si el metodo es USD).
- [ ] La suma de las lineas de pago en Bs reconcilia con el total de la factura en Bs.
- [ ] Si hubo excedente (VUELTO/SAF/PROPINA/DIFERENCIAL_SOBRANTE), el recibo muestra como se manejo y el monto.
- [ ] Si la venta quedo a credito, el recibo muestra "Quedo a credito: Bs X ($ Y)".
- [ ] Direccion, razon social y usuario del emisor no desbordan el ancho del documento en PDF ni PNG.
- [ ] `agruparPagosPorMetodo` tiene test unitario pasando (`yarn test:run`).
