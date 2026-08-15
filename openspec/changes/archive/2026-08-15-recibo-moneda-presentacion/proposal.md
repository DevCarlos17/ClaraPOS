# Proposal: Moneda de Presentacion del Recibo de Venta

## Intent

Hoy el recibo de venta (PDF/PNG/texto) muestra la mayoria de sus montos SOLO en USD: lineas de
articulo, y 5 filas intermedias de totales (exento, base imponible, IVA por alicuota, TOTAL
FACTURA pre-IGTF, IGTF). Solo pagos, cierre de excedente/credito y los 2 totales finales ya son
bimonetarios. El negocio necesita que CADA monto del recibo muestre siempre USD y Bs juntos, y que
la empresa pueda elegir cual de las dos moneda va PRIMERO (primaria) sin perder la otra.

## Scope

### In Scope
- Toggle "moneda de presentacion" (USD/Bs) por empresa, en `company-data-form.tsx` (tab
  "Datos Generales" de `datos-empresa.tsx`).
- Persistencia en `empresas.config` (JSON), campo nuevo `moneda_presentacion_documentos?: 'USD'
  | 'BS'` (default `'USD'`). Primer uso real del parametro `config` de `updateCompany`.
- Tipo `MonedaPresentacion = 'USD' | 'BS'` threaded como `monedaPresentacion?: MonedaPresentacion`
  en `BuildReciboDataInput`/`buildReciboData` (default `'USD'`) — controla SOLO cual moneda es
  primaria/orden; ambas siempre se calculan y muestran.
- Cerrar los 7 gaps "ambas monedas siempre" confirmados en exploracion, SOLO en el recibo de venta:
  1. Linea de articulo (precio unitario + total): agregar Bs, en `ReciboLinea`/`buildReciboData`
     loop, y render en AMBOS paths (`construirLineasRecibo` texto/PNG + `buildReciboPdfBlob`
     `artBody` PDF — 2 fixes, no comparten codigo).
  2-6. Filas "Monto Exento", "Base Imponible", "IVA {pct}%", "TOTAL FACTURA" (pre-IGTF), "IGTF" en
     `construirFilasTotales` — agregar campo `bs` a `FilaTotal`; un solo fix cubre texto/PNG y PDF
     (comparten la funcion).
  7. Pago nativo en Bs sin su equivalente USD en `formatMontoPago` — fix de render puro (el dato
     `montoUsd` ya existe en `ReciboPagoLinea`).
- Tests unitarios (TDD estricto, `yarn test:run`): extender `factura-export.test.ts` (gaps 1-6),
  agregar assertion `montoUsd` en `recibo-pagos.test.ts` (gap 7), y nuevo test file para el toggle
  + write path de `company-data-form.tsx`.

### Out of Scope
- Refactor de `lib/currency.ts` a un motor de monedas generico — se reutiliza `formatUsd`,
  `formatBs`, `usdToBs`, `bsToUsd` tal cual, por nombre.
- Cualquier documento que NO sea el recibo de venta (reportes de ventas/CxC/compras, facturas
  de compra, etc.) aunque el campo persistido se llame generico (`moneda_presentacion_documentos`)
  para no requerir migracion cuando se extienda a otros documentos en el futuro.
- Cambios de layout/estructura del recibo: mismas secciones, mismo orden; solo cambia que moneda
  es primaria y que ahora TODO monto tiene su contraparte.
- Reemplazar `moneda_contable` (campo muerto, no se toca ni se reutiliza).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `recibo-venta-exportacion`: agrega requisito de bimonetariedad total (USD+Bs siempre visibles)
  en lineas de articulo y filas de totales intermedias, mas un toggle de moneda primaria por
  empresa. **Coordinacion**: esta capability tiene deltas activas y no archivadas en
  `recibo-desglose-pagos-orden`, `recibo-igtf-orden-abono-factura`, `recibo-ancho-termico-58mm` y
  `factura-descarga-compartir`. `sdd-spec` decide si esta delta se agrega en paralelo o coordina
  con esos requirements (ej. el orden de filas de totales que toca `recibo-igtf-orden-abono-factura`).

## Approach

1. **Config**: `EmpresaConfig` (`use-company.ts`) gana `moneda_presentacion_documentos?: 'USD' |
   'BS'`. `CompanyDataForm` lee `parseEmpresaConfig(company.config)`, agrega el toggle, y en
   submit llama `updateCompany(id, { config: JSON.stringify({ ...current,
   moneda_presentacion_documentos: value }) })`.
2. **Seam de moneda**: tipo `MonedaPresentacion = 'USD' | 'BS'` en `factura-export.ts`, mas
   `monedaPresentacion?: MonedaPresentacion` (default `'USD'`) en `BuildReciboDataInput`. El
   valor solo decide orden/enfasis (cual imprime primero/en bold); el calculo de ambas monedas
   sigue siendo incondicional, igual que ya ocurre hoy en pagos/cierre/totales finales.
3. **Datos**: `buildReciboData` loop de lineas calcula `precioUnitarioBs`/`totalBs` via
   `usdToBs(x, tasa)`; `FilaTotal` gana campo `bs` calculado en `construirFilasTotales`.
4. **Render**: `construirLineasRecibo` (texto/PNG) y `buildReciboPdfBlob` `artBody` (PDF) muestran
   ambos valores en lineas de articulo — 2 fixes independientes porque no comparten codigo.
   `construirFilasTotales` es compartida, asi que su fix cubre texto/PNG y PDF a la vez.
   `formatMontoPago` agrega el equivalente USD para pagos nativos en Bs — cubre texto y PDF porque
   ambos llaman la misma funcion.
5. **TDD**: cada gap cerrado con test antes/junto al fix, siguiendo el patron ya usado en los
   archivos de test existentes (no se crean archivos nuevos para el recibo; si para el toggle de
   UI).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/configuracion/hooks/use-company.ts` | Modified | Nuevo campo `moneda_presentacion_documentos` en `EmpresaConfig` |
| `src/features/configuracion/components/company-data-form.tsx` | Modified | Nuevo toggle USD/Bs, escribe en `config` via `updateCompany` |
| `src/features/ventas/utils/factura-export.ts` | Modified | Tipo `MonedaPresentacion`, `ReciboLinea`/`FilaTotal` con campos Bs, `buildReciboData` loop, `construirFilasTotales`, `construirLineasRecibo`, `formatMontoPago`, `buildReciboPdfBlob` `artBody` y totales |
| `src/features/ventas/components/venta-exitosa-modal.tsx` | Modified | `construirRecibo` pasa `monedaPresentacion` (leida de `useCompany()`) a `buildReciboData` |
| `src/features/ventas/utils/recibo-pagos.ts` | Unchanged | Dato `montoUsd` ya correcto; solo se agrega assertion de test |
| `src/features/ventas/utils/__tests__/factura-export.test.ts` | Modified | Tests para gaps 1-6 |
| `src/features/ventas/utils/__tests__/recibo-pagos.test.ts` | Modified | Assertion `montoUsd` faltante (gap 7) |
| `src/features/configuracion/components/__tests__/company-data-form.test.tsx` (new) | New | Test del toggle + write path |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Divergencia PDF vs texto/PNG en linea de articulo (2 paths, no comparten codigo) | Medium | Fix explicito en ambos paths + test que compara ambos outputs para el mismo input |
| Cambios de orden en filas de totales colisionan con `recibo-igtf-orden-abono-factura` (delta hermana, no archivada) | Medium | Coordinar en `sdd-spec`; este change NO reordena filas, solo agrega campo `bs` |
| Redondeo Bs distinto entre linea de articulo (nuevo) y total ya existente | Low | Reusar `usdToBs`/`formatBs` (ya usados en pagos/totales) para consistencia |
| Config JSON malformado en empresas existentes rompe `parseEmpresaConfig` | Low | `parseEmpresaConfig` ya tiene fallback; nuevo campo es opcional con default `'USD'` |

## Rollback Plan

Cambios son extensiones aditivas (campos opcionales nuevos en tipos existentes, un toggle nuevo
en un form existente). Si falla, revertir el commit de render (`factura-export.ts`) y el commit
del toggle (`company-data-form.tsx`/`use-company.ts`) por separado; el recibo sigue funcionando
en su forma USD-primario actual sin el campo `moneda_presentacion_documentos`.

## Dependencies

- Coordinacion con `recibo-igtf-orden-abono-factura` en `sdd-spec` (ambas tocan filas de totales
  de la misma capability no archivada).
- Ninguna dependencia nueva de npm.

## Success Criteria

- [ ] Lineas de articulo muestran USD y Bs (PDF y texto/PNG).
- [ ] Las 5 filas de totales intermedias (exento, base imponible, IVA, TOTAL FACTURA pre-IGTF,
      IGTF) muestran USD y Bs (PDF y texto/PNG).
- [ ] Pagos nativos en Bs muestran tambien su equivalente USD.
- [ ] El toggle de moneda de presentacion en "Datos Generales" persiste en
      `empresas.config.moneda_presentacion_documentos` y sobrevive a un refresh.
- [ ] Cuando el toggle es `BS`, la moneda primaria/bold en articulos y totales es Bs (USD sigue
      visible como contraparte); cuando es `USD` (default), es al reves.
- [ ] `lib/currency.ts` no fue modificado.
- [ ] Tests nuevos/extendidos pasan (`yarn test:run`).
