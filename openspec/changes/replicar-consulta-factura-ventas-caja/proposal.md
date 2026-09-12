# Proposal: Replicar consulta de factura (ConsultaFacturaModal) en Ventas emitidas y Facturas de caja

## Intent

El patrón "click en fila → `ConsultaFacturaModal` (detalle fiscal + evolución
post-emisión)" ya está probado en `cliente-detalle.tsx`. Dos pantallas
todavía NO lo tienen y arrastran implementaciones bespoke/incompletas:

1. **Ventas → Consultas** (`ventas-consultas-modal.tsx`): tabla cruda propia +
   ~310 líneas de detalle/PDF duplicado, con un shape de fila (`FacturaBusqueda`)
   incompatible con el pipeline compartido.
2. **Nota de crédito POS** (`NotaCreditoPosModal`): seleccionar una factura
   dispara DE INMEDIATO la emisión de NC completa — no hay forma de solo
   *consultar* la factura (ver detalle + evolución + reimprimir) sin arrancar
   el flujo irreversible de anulación.

## Scope

### In Scope
- **Pantalla 1 (Ventas emitidas)**: reemplazar `FacturaBusqueda`/tabla
  bespoke/`FacturaDetalle` inline por `useFacturasEmpresa` (shape
  `FacturaParaAnular`, sin adapter) + `FacturasEmpresaTable`
  (`mostrarAcciones={false}`) + `ConsultaFacturaModal` vía `onRowClick`, en
  las pestañas "Por Factura" y "Por Cliente". Pasar `fechaDesde` explícito y
  amplio para preservar la búsqueda de todo el histórico (hoy sin
  restricción de fecha). Eliminar el builder jsPDF/detalle inline duplicado.
  "Por Producto" no se toca.
- **Pantalla 2 (`NotaCreditoPosModal`)**: agregar un **reveal-gate** sobre la
  sección de emisión de NC. Al seleccionar factura: solo detalle (artículos,
  base imponible, IVA, TOTAL, métodos de pago) + footer `Volver` ·
  `Reimprimir` · `Emitir nota de crédito`. `Reimprimir` abre
  `ConsultaFacturaModal` (reusa `useReciboDesdeFactura`/`useEvolucionFactura`,
  patrón intacto). `Emitir nota de crédito` revela la sección NC existente
  (Tipo NC → alerta irreversible) y pasa el footer al flujo de anulación
  actual sin reescribirlo. El gate se resetea (oculta NC) al cambiar de
  factura, cerrar el panel, o al presionar `Volver` (`Volver` es de una sola
  etapa: siempre vuelve al estado vacío de selección).
- Tests nuevos por slice (strict TDD, Vitest) — `ventas-consultas-modal.tsx`
  no tiene suite hoy y la necesita; `nota-credito-pos-modal.test.tsx`
  (1105 líneas) debe seguir en verde sin modificar sus casos existentes.

### Out of Scope
- Cualquier cambio a la lógica de validación/emisión de NC en sí
  (modalidad, motivo, depósito, `Confirmar Anulación`) — solo se gatea su
  visibilidad, no se reescribe.
- Crear los botones "Tipo de nota de crédito" (Total/Parcial) — ya existen,
  solo se mueven bajo el gate.
- Corregir el gap pre-existente de `empresa_id` en
  `useDetalleFactura`/`usePagosFactura` (deuda aceptada, documentada en
  `consulta-factura-evolucion`, no se reintroduce ni se agrava).
- Cambiar `FacturasEmpresaTable` o `ConsultaFacturaModal` — ya son
  suficientemente genéricos, no requieren generalización.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `reimpresion-factura`: el requirement "Apertura del detalle por click en
  fila" amplía su alcance más allá de Gestión de Clientes — ahora también
  aplica a `ventas-consultas-modal.tsx` (Ventas → Consultas) como segundo
  consumidor de `FacturasEmpresaTable` + `ConsultaFacturaModal`.
- `notas-credito-pos`: la selección de factura ya NO dispara directamente
  la sección de emisión de NC; se agrega un estado intermedio (solo
  detalle + footer `Volver`/`Reimprimir`/`Emitir NC`) antes de revelarla.
  Nuevo requirement de reimpresión (`Reimprimir` → `ConsultaFacturaModal`)
  dentro de este flujo.

## Approach

Ningún componente compartido cambia de forma — `FacturasEmpresaTable` y
`ConsultaFacturaModal` son drop-in en ambas pantallas. El trabajo es 100%
"cablear el patrón existente en dos call sites":

- **Pantalla 1**: swap de hooks (`useBuscarFacturas`/`useFacturasPorCliente`
  → `useFacturasEmpresa`) + swap de tabla + wiring de modal + borrado del
  código bespoke. Efecto neto: limpieza tanto como feature.
- **Pantalla 2**: un único booleano de estado (`mostrarSeccionNc` o
  equivalente) controla el render condicional de la sección NC existente
  y del set de botones del footer. Se resetea en 3 triggers explícitos
  (cambio de factura, cierre de panel, `Volver`). Nueva pieza de estado
  local (factura para `ConsultaFacturaModal` vía `Reimprimir`), sin tocar
  el árbol de estado de la emisión de NC.

## Affected Areas

| Area | Impacto | Descripción |
|---|---|---|
| `reportes/components/ventas-consultas-modal.tsx` (731 líneas) | Modified | Swap hooks+tabla+modal; borra `FacturaDetalle`/jsPDF inline (~310 líneas) |
| `reportes/hooks/use-ventas-reportes.ts` | Sin cambio funcional | `FacturaBusqueda`/`useBuscarFacturas`/`useFacturasPorCliente` quedan sin uso en este flujo (evaluar si otro consumidor los necesita antes de borrar el tipo) |
| `reportes/components/__tests__/ventas-consultas-modal.test.tsx` (nuevo) | New | No existe hoy — requerido por TDD estricto |
| `ventas/components/nota-credito-pos-modal.tsx` (750 líneas) | Modified | Reveal-gate + footer condicional + wiring `ConsultaFacturaModal` para `Reimprimir` |
| `ventas/components/__tests__/nota-credito-pos-modal.test.tsx` (1105 líneas) | Modified (aditivo) | Casos nuevos para gate/reset/reimprimir; casos existentes de emisión NC sin tocar |
| `ventas/components/consulta-factura-modal.tsx` | Reused as-is | Sin cambios |
| `ventas/hooks/use-facturas-empresa.ts`, `use-facturas-sesion-activa.ts` | Reused as-is | Ya devuelven `FacturaParaAnular`, ya filtran por `empresa_id` |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `useFacturasEmpresa` por defecto usa mes actual — regresión de "buscar todo el histórico" en Pantalla 1 | Medium | Pasar `fechaDesde` explícito y amplio en ambas pestañas; test de regresión con factura antigua |
| Reveal-gate en Pantalla 2 rompe el flujo de emisión de NC ya probado (1105 líneas de tests) | Medium-High | Gate estrictamente aditivo (solo controla visibilidad), cero cambios a la lógica de validación/confirmación; correr suite completa sin modificar casos existentes |
| Cambio visual del PDF en Pantalla 1 (bespoke compacto → recibo térmico estándar vía `descargarReciboPdf`) | Low | Comportamiento deseado (consistencia), pero es un cambio visible a documentar, no un refactor invisible |
| Gap `empresa_id` pre-existente en `useDetalleFactura`/`usePagosFactura` | Low (no se agrava) | Ya documentado como deuda aceptada; no se toca en este cambio |
| `FacturaBusqueda`/hooks viejos de Pantalla 1 quedan huérfanos | Low | Verificar otros consumidores antes de borrar tipos/hooks; si no hay, limpiar en la misma slice de borrado |

## Rollback Plan

Cambios de solo-lectura (Pantalla 1) y de gating de UI (Pantalla 2), sin
migración de esquema ni escritura nueva. Revertir por slice vía `git revert`
en la feature-branch-chain; una slice tardía (p. ej. borrado del código
bespoke) puede descartarse sin afectar las slices previas ya mergeadas
(swap de datos/tabla).

## Success Criteria

- [ ] Pantalla 1: click en fila (pestañas "Por Factura" y "Por Cliente")
      abre `ConsultaFacturaModal` con detalle + evolución; búsqueda de
      facturas antiguas (fuera del mes actual) sigue funcionando
- [ ] Pantalla 1: código bespoke de detalle/PDF eliminado; PDF sale por
      `descargarReciboPdf` compartido
- [ ] Pantalla 2: seleccionar factura muestra solo detalle + footer
      `Volver`/`Reimprimir`/`Emitir nota de crédito`; NC no se auto-expande
- [ ] Pantalla 2: `Reimprimir` abre `ConsultaFacturaModal`; `Emitir nota de
      crédito` revela la sección NC existente sin alterar su lógica
- [ ] Pantalla 2: gate se resetea en cambio de factura, cierre de panel, y
      `Volver` (single-stage)
- [ ] Suite existente de `nota-credito-pos-modal.test.tsx` (1105 líneas)
      pasa sin modificar sus casos de emisión de NC
- [ ] Toda query nueva/tocada sigue filtrando por `empresa_id`

## Review Workload Forecast

| Slice (PR) | Contenido | Est. líneas (add+del) |
|---|---|---|
| PR1 (Pantalla 1a) | "Por Factura": swap `useBuscarFacturas`→`useFacturasEmpresa` (fechaDesde amplio) + `FacturasEmpresaTable` + `ConsultaFacturaModal` + borrado `FacturaDetalle`/jsPDF + tests nuevos (sin suite previa) | ~300-400 |
| PR2 (Pantalla 1b) | "Por Cliente": mismo wiring reusando infraestructura de PR1 (`useFacturasEmpresa({ clienteId })`) + tests | ~100-180 |
| PR3 (Pantalla 2a) | Reveal-gate: estado, render condicional NC, footer `Volver`/`Reimprimir`/`Emitir NC`, reset en 3 triggers + tests aditivos | ~250-400 (riesgo de exceder — evaluar sub-slice en `sdd-tasks`) |
| PR4 (Pantalla 2b) | `Reimprimir` → `ConsultaFacturaModal` (wiring + tests) | ~80-150 |

Total estimado ~730-1130 líneas repartidas en 4 slices.

**Decision needed before apply: No** (chain ya resuelto por esta propuesta,
la única slice en riesgo de exceder el budget — PR3 — debe re-evaluarse en
`sdd-tasks` con posible sub-split gate-visual / footer-y-reset).
**Chained PRs recommended: Yes.**
**400-line budget risk: Medium** (PR1 y PR3 son las slices más grandes;
PR3 concentra el mayor riesgo por tocar un archivo con 1105 líneas de
tests existentes).
