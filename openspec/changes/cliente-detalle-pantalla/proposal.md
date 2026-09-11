# Proposal: Cliente detalle — pantalla dedicada con historial completo de facturas

## Intent

Hoy el click en una fila de "Gestion de Clientes" abre un panel lateral inline (`cliente-detalle.tsx`) que encoge la tabla y solo muestra saldo + estado de cuenta, sin facturas. Se reemplaza por una **pantalla dedicada** con el **historial completo de facturas**, reusando la tabla rica del admin de ventas (`FacturasEmpresaTable`, badges CONTADO/CREDITO/ABONADA/reverso).

## Scope

### In Scope
- Ruta nueva `src/routes/_app/clientes/gestion.$clienteId.tsx`.
- `cliente-list.tsx`: `handleVerDetalle` usa `navigate()`; se retira grid-shrink y columnas condicionales.
- Contenido de `cliente-detalle.tsx` (saldo, filtro de fechas, Estado de Cuenta, **reverso de abono con PIN completo**) migra al cuerpo de la nueva pantalla.
- Seccion "Facturas": `FacturasEmpresaTable` filtrada por `clienteId`; extender `buildFacturasEmpresaFiltro` de forma **aditiva** (parametro opcional) sin romper `facturas-empresa-tab.tsx`.
- Migracion de `cliente-list.test.tsx` (router wrapper) y `cliente-detalle.test.tsx`.

### Out of Scope
Paginacion de facturas; modal "Consultas de Ventas"; paths de escritura inmutables.

## Capabilities

### New Capabilities
- `clientes-detalle`: pantalla dedicada (saldo, estado de cuenta, reverso de abono, facturas), reemplaza el panel inline.

### Modified Capabilities
None — extension de `buildFacturasEmpresaFiltro` es aditiva a nivel implementacion, sin cambiar requirements de `notas-credito-admin`.

## Approach

Reemplazo completo, sin coexistencia panel+ruta. `cliente-detalle.tsx` pierde `onClose`, pasa a ser cuerpo de la nueva ruta, que resuelve `clienteId` via `Route.useParams()` + query PowerSync (patron `$usuarioId.editar.tsx`). **Decision primaria para `sdd-design`**: como pasar `clienteId` a `buildFacturasEmpresaFiltro` sin romper sus llamadores.

## Affected Areas

`gestion.$clienteId.tsx` (nuevo) · `cliente-list.tsx` 320 lin., `cliente-detalle.tsx` 634 lin. (modificados) · `notas-credito-admin-filters.ts` 226 lin. (aditivo) · `facturas-empresa-tab.tsx`/`FacturasEmpresaTable` 283 lin. (reusado) · tests hermanos 95+212 lin. (migrados)

## Risks

| Risk | Prob. | Mitigacion |
|------|-------|------------|
| Regresion en `notas-credito-admin` (archivo compartido) | Med | Parametro opcional, tests existentes sin cambios |
| Perder reverso de abono (PIN + dialogs + permisos) | Med | Migrar `cliente-detalle.tsx` como unidad |
| `useNavigate` rompe test sin router hoy | High | Replicar patron de `usuario-list.tsx` |

## Rollback Plan

`git revert` de la ruta nueva y `cliente-list.tsx`, restaurar el panel. Extension del filtro es segura de dejar sin uso.

## Success Criteria

- [ ] Click en fila navega a `/clientes/gestion/$clienteId`, sin panel inline.
- [ ] Pantalla muestra saldo, estado de cuenta y todas las facturas via `FacturasEmpresaTable`.
- [ ] Reverso de abono identico; `notas-credito-admin` sigue pasando tests; toda query filtra por `empresa_id`.

## Review Workload / Size Forecast

Estimado: **~1000-1600 lineas** (mover 634 lineas, ruta nueva, extension de filtro, 2 tests) — excede el budget de 400 lineas en una PR. Encadenar: (1) ruta + navegacion, `cliente-detalle.tsx` movido tal cual sin Facturas; (2) extension del filtro + `FacturasEmpresaTable`; (3) limpieza de tests.

`Decision needed before apply: Yes` | `Chained PRs recommended: Yes` | `400-line budget risk: High`
