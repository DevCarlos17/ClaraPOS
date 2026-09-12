# Proposal: Consulta de factura por click de fila en Facturas emitidas (admin)

## Intent

El patrón "click en fila → `ConsultaFacturaModal` (detalle fiscal + evolución)"
ya vive en `cliente-detalle.tsx` y en `ventas-consultas-modal.tsx`
(`replicar-consulta-factura-ventas-caja`). La pantalla admin **Facturas
emitidas** (`/ventas/facturas-emitidas` → pestaña "Facturas",
`facturas-empresa-tab.tsx`) todavía no lo tiene: solo existe el botón
"Aplicar nota de crédito" por fila. `notas-credito-admin` (spec vigente)
marca el modal de consulta como diferido explícitamente. Este change lo
entrega, cerrando ese gap documentado.

Diferencia clave vs. los dos consumidores previos: en TODOS ellos el botón
de acción por fila estaba oculto (`mostrarAcciones={false}`) cuando se usó
`onRowClick`. Acá el botón "Aplicar nota de crédito" DEBE seguir visible y
funcional en la misma fila que ahora también es clickeable — por lo que el
botón necesita `stopPropagation()` para no disparar ambos modales a la vez.

## Scope

### In Scope
- Click en una fila de la tabla en `facturas-empresa-tab.tsx` (fuera del
  botón "Aplicar nota de crédito") abre `ConsultaFacturaModal` con el
  detalle fiscal completo + sección Evolución (reversos/abonos/saldo a
  favor) + Descargar PDF / Compartir, igual que `cliente-detalle.tsx`.
- El botón "Aplicar nota de crédito" (definido en el componente compartido
  `FacturasEmpresaTable`) gana `e.stopPropagation()` en su `onClick`, para
  no disparar también la apertura de `ConsultaFacturaModal` al hacer click
  en el botón.
- Nuevo estado local independiente en `FacturasEmpresaTab`
  (`facturaConsulta`/`consultaAbierta` o equivalente) para
  `ConsultaFacturaModal`, sin tocar el estado existente de `CrearNcrModal`
  (`facturaSeleccionada`/`modalOpen`).
- Tests nuevos (strict TDD, Vitest) en
  `facturas-empresa-tab.test.tsx` cubriendo row-click, coexistencia con el
  botón, y aislamiento de estado entre ambos modales.

### Out of Scope
- Cambiar `ConsultaFacturaModal`, `useReciboDesdeFactura` o
  `useEvolucionFactura` — reuso byte-identical, sin modificaciones.
- Cambiar `CrearNcrModal` o la lógica de emisión de NC.
- Cualquier texto de reverso "enriquecido" (p. ej. "reversada con NC XX")
  mencionado como diferido en `notas-credito-admin` — `ConsultaFacturaModal`
  no lo tiene hoy y este change no se lo agrega.
- Corregir el gap pre-existente de `empresa_id` en
  `useDetalleFactura`/`usePagosFactura` (deuda aceptada, documentada en
  `consulta-factura-evolucion`).
- Cambiar `DataTable` (`onRowClick` ya soportado, sin cambios).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `reimpresion-factura`: el requirement "Apertura del detalle por click en
  fila" gana una TERCERA superficie (Facturas emitidas admin,
  `facturas-empresa-tab.tsx`), y documenta el primer caso donde el botón de
  acción por fila coexiste con el row-click en la misma tabla (requiere
  `stopPropagation()` en el botón compartido).
- `notas-credito-admin`: cierra el ítem diferido "modal de consulta de
  detalle de factura" de la nota de la sección Purpose — la pestaña
  Facturas gana un nuevo requirement de apertura de detalle por click de
  fila, coexistiendo con "Aplicar nota de crédito" sin conflicto.

## Approach

Wiring 100% local a `facturas-empresa-tab.tsx`:

1. **Fix compartido mínimo** (`FacturasEmpresaTable`, componente exportado
   en el mismo archivo): agregar `e.stopPropagation()` al `onClick` del
   botón "Aplicar nota de crédito" (línea ~238). Blast radius: cero en los
   otros 3 consumidores (`cliente-detalle.tsx`,
   `ventas-consultas-modal.tsx` x2) porque todos usan
   `mostrarAcciones={false}` — la línea tocada es código muerto para ellos.
2. **Wiring local** (`FacturasEmpresaTab`, contenedor en el mismo archivo):
   nuevo par de estado independiente para `ConsultaFacturaModal`, pasar
   `onRowClick` a `FacturasEmpresaTable`, montar el modal como sibling de
   `CrearNcrModal` (ya montado).

Sin cambios a `DataTable` ni a `ConsultaFacturaModal` — ambos ya soportan
exactamente lo necesario (confirmado en exploración, obs #3388).

## Affected Areas

| Area | Impacto | Descripción |
|---|---|---|
| `ventas/components/facturas-empresa-tab.tsx` | Modified | `stopPropagation()` en botón NC (componente `FacturasEmpresaTable`) + nuevo estado/wiring `onRowClick` + mount `ConsultaFacturaModal` (componente `FacturasEmpresaTab`) |
| `ventas/components/__tests__/facturas-empresa-tab.test.tsx` | Modified (aditivo) | Tests nuevos para row-click, coexistencia con botón, aislamiento de estado; suite existente del botón NC sin modificar sus asserts |
| `ventas/components/consulta-factura-modal.tsx` | Reused as-is | Sin cambios |
| `ventas/components/crear-ncr-modal.tsx` | Sin cambio | Su estado (`facturaSeleccionada`/`modalOpen`) queda intacto y aislado del nuevo |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `stopPropagation()` en el botón compartido rompe algún consumidor existente | Low | Los otros 3 callers ocultan el botón (`mostrarAcciones={false}`); correr suite completa de `facturas-empresa-tab.test.tsx`, `cliente-detalle.test.tsx`, `ventas-consultas-modal.test.tsx` sin regresión |
| Doble apertura de modal (click en botón dispara ambos) si se olvida el guard | Medium | Test explícito: click en botón → solo `CrearNcrModal` abre, `ConsultaFacturaModal` permanece cerrado |
| Colisión de estado entre `ConsultaFacturaModal` y `CrearNcrModal` | Low | Piezas de estado (`useState`) completamente separadas; test explícito de independencia |

## Rollback Plan

Cambio de solo-UI (un `stopPropagation` + wiring de estado local), sin
migración de esquema ni escritura nueva. Revertir con `git revert` del
commit de esta slice única; no afecta a `cliente-detalle.tsx` ni
`ventas-consultas-modal.tsx` (ambos ya usan `mostrarAcciones={false}`, no
dependen del guard nuevo).

## Success Criteria

- [ ] Click en fila (fuera del botón) en Facturas emitidas admin abre
      `ConsultaFacturaModal` con la factura correcta (detalle + evolución)
- [ ] Click en "Aplicar nota de crédito" NO abre `ConsultaFacturaModal`
      (stopPropagation funciona) y sigue abriendo `CrearNcrModal`
- [ ] Los dos modales tienen estado independiente (abrir uno no afecta al
      otro)
- [ ] Toda query existente sigue filtrando por `empresa_id` (sin queries
      nuevas)
- [ ] Suite existente de `facturas-empresa-tab.test.tsx` (botón NC) pasa
      sin modificar sus asserts

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~60-100 (1 prod file wiring + ~1 stopPropagation line; test file additions) |
| Chained PRs recommended | No |
| 400-line budget risk | Low |
| Decision needed before apply | No |

Slice única, bien por debajo del budget de 400 líneas. Un solo PR hacia
`develop` desde `feat/facturas-emitidas-consulta-rowclick`.
