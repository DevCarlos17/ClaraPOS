# Tasks: Cliente detalle — pantalla dedicada

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated lines | ~1000-1600 |
| Suggested split | PR1 → PR2 → PR3 |
| Delivery strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

**Nota**: `FacturasEmpresaTable` vive en `src/features/ventas/components/facturas-empresa-tab.tsx` (no un archivo standalone). Tasks usan la ruta real.

### Suggested Work Units

| Unit | Goal | PR | Base |
|------|------|----|------|
| 1 | `clienteId` aditivo en filtro/hook | PR1 | tracker branch |
| 2 | Ruta + navegación, sin Facturas | PR2 | PR1 branch |
| 3 | Sección Facturas + `mostrarAcciones` | PR3 | PR2 branch |

## PR1 — Filtro aditivo

- [x] T1-1 RED: `notas-credito-admin-filters.test.ts` — `clienteId` presente inserta `AND v.cliente_id = ?` tras rango de fecha/antes de `busqueda`, param en esa posición; ausente = sin cambios. Falla (campo no existe).
- [x] T1-2 GREEN: `notas-credito-admin-filters.ts` — `clienteId?: string` en `FiltroFacturasEmpresa`; `buildFacturasEmpresaFiltro` inserta cláusula/param. T1-1 pasa; 228 tests existentes intactos.
- [x] T1-3 RED: `use-facturas-empresa.test.ts` — `useFacturasEmpresa({ clienteId })` reenvía al builder (SQL/params). Falla (campo no existe en hook).
- [x] T1-4 GREEN: `use-facturas-empresa.ts` — `clienteId?: string` en `FiltroFacturasEmpresaHook`, pasa tal cual al builder. T1-3 pasa; tests existentes intactos.

## PR2 — Pantalla funcional sin facturas

- [x] T2-1 RED: `cliente-detalle-resolver.test.tsx` (nuevo) — mocks `useQuery`+`useCurrentUser`: loading→spinner, resuelto→`ClienteDetalle`, otra empresa/inexistente→"no encontrado", query incluye `empresa_id`. Falla (módulo no existe).
- [x] T2-2 GREEN: `cliente-detalle-resolver.tsx` (nuevo) — `ClienteDetalleResolver({ clienteId, onVolver })` per design.md. T2-1 pasa.
- [x] T2-3 RED: `cliente-detalle.test.tsx` — renombra `onClose`→`onVolver` en `render()`; assert botón "Volver" invoca `onVolver` (reemplaza asserts del ícono `X`). Falla contra estado actual.
- [x] T2-4 GREEN: `cliente-detalle.tsx` — `ClienteDetalleProps.onClose`→`onVolver`; botón `X`→"Volver"; retira `lg:sticky lg:top-6`. T2-3 pasa; tests de reverso/saldo/estado-cuenta intactos.
- [x] T2-5 GREEN (sin RED — wiring sin lógica, precedente `$usuarioId.editar.tsx`, sin test de ruta en repo): `gestion.$clienteId.tsx` (nuevo) — exporta solo `Route`; local llama `Route.useParams()`+`useNavigate()`, delega a `ClienteDetalleResolver`. Smoke manual: navega y "Volver" regresa.
- [x] T2-6 RED: `cliente-list.test.tsx` — mockea `useNavigate`; click de fila/"Ver detalle" llaman `navigate({ to: '/clientes/gestion/$clienteId', params: { clienteId } })`; retira asserts de panel inline/grid-shrink. Falla contra `setDetalleCliente` actual.
- [x] T2-7 GREEN: `cliente-list.tsx` — `handleVerDetalle` usa `navigate()`; retira `detalleCliente`, wrapper `xl:grid-cols-[2fr_3fr]`, columnas condicionales, `<ClienteDetalle>` inline. T2-6 pasa; columnas completas siempre visibles.

## PR3 — Tabla rica de facturas

- [x] T3-1 RED: `facturas-empresa-tab.test.tsx` — `<FacturasEmpresaTable mostrarAcciones={false} .../>` NO renderiza columna/botón "Aplicar nota de credito"; omitido/`true` sí. Falla (prop no existe).
- [x] T3-2 GREEN: `facturas-empresa-tab.tsx` — `mostrarAcciones?: boolean` (default `true`) en `FacturasEmpresaTableProps`; columna `acciones` condicional a `!== false`. T3-1 pasa; tests existentes intactos.
- [x] T3-3 RED: `cliente-detalle.test.tsx` — mockea `useFacturasEmpresa` con `FacturaParaAnular[]` fijas; sección "Facturas" con badges CONTADO/CREDITO/ABONADA+reverso, vacío sin facturas, sin botón NC (`mostrarAcciones={false}`). Falla (sección no existe).
- [x] T3-4 GREEN: `cliente-detalle.tsx` — sección "Facturas" con `useFacturasEmpresa({ clienteId: cliente.id })` → `<FacturasEmpresaTable ... mostrarAcciones={false} />`. T3-3 pasa; `empresa_id` sigue forzado vía el hook.
