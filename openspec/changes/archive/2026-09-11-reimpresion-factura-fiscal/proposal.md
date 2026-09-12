# Proposal: Reimpresion de Factura Fiscal (Gestion de Clientes)

## Intent

Desde la ficha de un cliente (Clientes → Gestion → detalle de cliente), permitir
reimprimir cualquier factura historica en el **mismo formato termico 58mm** que
usa el POS al momento de la venta, marcada con "REIMPRESION" para distinguirla
del original. Hoy esa tabla de facturas (`FacturasEmpresaTable` en
`cliente-detalle.tsx`) solo lista, sin forma de recuperar el comprobante.

## Scope

### In Scope (v1) — una sola superficie
- Click en una FILA de `FacturasEmpresaTable` (dentro de `cliente-detalle.tsx`)
  abre un modal de detalle (NO boton por fila — evita montar cientos de
  botones que no se usan).
- Modal muestra: `FacturaDetallePanel` (reuso tal cual) + 2 botones
  "Descargar PDF" / "Compartir", ambos contra el pipeline termico existente
  (`descargarReciboPdf` / `compartirReciboImagen`). "Compartir" oculto si
  `navigator.share` no existe (contrato ya vigente).
- Marca "REIMPRESION" centrada, entre el header y la tabla de articulos —
  unico diff visual vs. el recibo original.
- Extraer la reconstruccion `ventas → ReciboData` (hoy duplicada byte-a-byte
  en `nota-credito-pos-modal.tsx` y `crear-ncr-modal.tsx`) a una funcion/hook
  reutilizable, y consumirla desde ambos lugares + el nuevo modal.

### Out of Scope (v1 — diferido, pendiente de validar v1)
- Reimpresion dentro de `nota-credito-pos-modal.tsx` (FROZEN, ver Risks).
- `ventas-consultas-modal.tsx` (Ventas → consulta de facturas): su PDF ad-hoc
  no-termico queda TAL CUAL, no se toca ni se reemplaza.
- Cualquier boton de accion por fila.

## Capabilities

### New Capabilities
- `reimpresion-factura`: reimprimir una factura guardada desde
  Gestion de Clientes en formato termico POS, marcada "REIMPRESION",
  via modal de detalle abierto por click de fila.

### Modified Capabilities
- None (no se modifica ningun requisito de capacidades existentes; la
  extraccion de la reconstruccion de recibo es refactor interno sin cambio
  de comportamiento observable en `nota-credito-pos-modal.tsx` /
  `crear-ncr-modal.tsx`).

## Approach

1. **Extraer** el mapeo duplicado `ventas+detalle+pagos+empresa → ReciboData`
   en una funcion pura o hook (`buildReciboDataDesdeFacturaGuardada` /
   `useReciboDesdeFactura(ventaId)`), consumiendo los hooks ya probados
   `useDetalleFactura` + `usePagosFactura` (cxc) + `useCompany()`.
   `nota-credito-pos-modal.tsx` y `crear-ncr-modal.tsx` pasan a usarla —
   comportamiento identico, mismos tests en verde.
2. **Flag aditivo** `esReimpresion?: boolean` en `BuildReciboDataInput` /
   `ReciboData` (default `false`), inyectando "REIMPRESION" centrada en los
   2 puntos ya identificados: `construirLineasRecibo` (texto/PNG) y
   `buildReciboPdfBlob` (PDF). Ausente/false = cero impacto en el recibo de
   venta en vivo.
3. **UI nueva**: `FacturasEmpresaTable` gana `onRowClick` (el `DataTable`
   subyacente YA soporta esta prop — cero cambios en `DataTable`).
   `cliente-detalle.tsx` mantiene estado `facturaSeleccionadaId` y renderiza
   un nuevo modal (p. ej. `reimprimir-factura-modal.tsx`) que usa el hook del
   paso 1 + `FacturaDetallePanel` + los 2 botones de reimpresion (mismo JSX
   que `venta-exitosa-modal.tsx`, reusado).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/ventas/utils/factura-export.ts` | Modified | `esReimpresion?` en `BuildReciboDataInput`/`ReciboData`; inyeccion de marca en `construirLineasRecibo` y `buildReciboPdfBlob`; helper `centrarTexto` (o flag `centered` en `LineaRecibo`) |
| extraction target (nuevo modulo, p. ej. `src/features/ventas/utils/recibo-desde-factura.ts` o hook en `use-cxc.ts`/`use-notas-credito.ts`) | New | Funcion/hook `buildReciboDataDesdeFacturaGuardada` / `useReciboDesdeFactura(ventaId)` |
| `src/features/ventas/components/nota-credito-pos-modal.tsx` | Modified (extraction-only) | Reemplaza bloque duplicado L263-291 por la funcion extraida — **FROZEN**, sin cambio de comportamiento |
| `src/features/ventas/components/crear-ncr-modal.tsx` | Modified (extraction-only) | Reemplaza bloque duplicado L121-149 por la funcion extraida |
| `src/features/ventas/components/facturas-empresa-tab.tsx` | Modified | `FacturasEmpresaTable` gana `onRowClick`/prop de seleccion (via `DataTable.onRowClick`, ya existente) |
| `src/features/clientes/components/cliente-detalle.tsx` | Modified | Wiring: estado de fila seleccionada + render del nuevo modal |
| Nuevo componente `reimprimir-factura-modal.tsx` (ubicacion a decidir en design: `features/clientes` vs `features/ventas`) | New | `FacturaDetallePanel` + botones Descargar/Compartir (JSX espejo de `venta-exitosa-modal.tsx`) |
| `src/features/ventas/components/factura-detalle-panel.tsx` | Reused as-is | Sin cambios |
| Tests: `nota-credito-pos-modal.test.tsx`, `crear-ncr-modal.test.tsx`, `facturas-empresa-tab.test.tsx`, `cliente-detalle.test.tsx`, nuevos tests del modal/hook/marca | New/Modified | TDD por `strict_tdd: true` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tocar `nota-credito-pos-modal.tsx` (documentado FROZEN) | Med | Extraccion estrictamente mecanica (import + delete bloque duplicado); tests existentes deben quedar en verde sin modificarlos |
| `usePagosFactura` no filtra `is_reversed` (pre-existente) | Low | Fuera de scope v1; documentar como deuda conocida, no introducida por este cambio |
| `useDetalleFactura`/`usePagosFactura` filtran solo por `venta_id` (sin `empresa_id`) | Low | Pre-existente y documentado; `venta_id` siempre llega ya escopeado por `useFacturasEmpresa` (empresa_id-filtrado) en esta superficie |
| Centrado de "REIMPRESION" en canvas/texto (fuente monospace aproximada) | Low | Usar `centrarTexto` con `RECIBO_ANCHO_CHARS=32`, ya validado visualmente en el resto del recibo |
| `discrepancy` (vuelto/SAF/propina) no reconstruible desde factura guardada | N/A (aceptado) | Comportamiento ya existente en los 2 modales NC: reimpresion no muestra esa linea, es correcto (no debe re-mostrar "vuelto" de una venta pasada) |

## Rollback Plan

Cambio puramente aditivo + un refactor de extraccion acotado:
- Revertir el PR (o los PRs encadenados) restaura `nota-credito-pos-modal.tsx`
  / `crear-ncr-modal.tsx` a su bloque inline original (git revert simple, sin
  migraciones ni cambios de schema involucrados — es 100% frontend, sin
  escritura a BD).
- El flag `esReimpresion` es aditivo y por defecto `false`; removerlo no
  afecta ningun otro consumidor.

## Dependencies

- Ninguna externa. Depende de la exploracion ya realizada
  (`exploration.md`) que confirma que toda la data necesaria ya existe en
  tablas persistidas (`ventas`, `ventas_det`, `pagos`, `clientes`, `empresas`).

## Success Criteria

- [ ] Click en una fila de `FacturasEmpresaTable` (vista cliente) abre el
      modal de detalle sin boton por fila.
- [ ] El PDF/imagen/texto reimpreso es byte-identico al recibo original
      salvo por la linea "REIMPRESION" centrada entre header y articulos.
- [ ] El recibo de venta en vivo (`venta-exitosa-modal.tsx`) no cambia en
      absoluto (flag default false).
- [ ] `nota-credito-pos-modal.tsx` y `crear-ncr-modal.tsx` pasan sus tests
      existentes sin modificarlos, usando la funcion extraida.
- [ ] Reimpresion es 100% lectura: ninguna escritura nueva a `ventas`,
      `movimientos_*`, ni ninguna otra tabla.
- [ ] Toda query de reconstruccion sigue escopeada (directa o
      transitivamente) por `empresa_id`.
