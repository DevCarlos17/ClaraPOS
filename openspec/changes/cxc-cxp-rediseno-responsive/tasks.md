# Tasks: CxC/CxP Rediseno — Phase 1 (boton + listas cortas + busqueda CxP)

> PHASE 1 only (3 slices). Phase 2 (mobile row→card, master-detail 2-step)
> is deferred and will get its own propose/spec/tasks pass later.

## Review Workload Forecast — Phase 1 (all 3 slices)

Estimated changed lines (additions + deletions, prod + tests):
- Slice 1 (boton, ambas pantallas): ~90-150
- Slice 2 (CxC lista corta): ~110-175
- Slice 3 (CxP hook nuevo + lista corta + busqueda): ~260-395
- **Phase 1 total: ~460-720**

Decision needed before apply: **Yes**
Chained PRs recommended: **Yes**
400-line budget risk: **Low** (Slice 1), **Low-Medium** (Slice 2),
**Medium-High** (Slice 3 — upper bound ~395 is close to the 400 ceiling)

### Suggested Work Units (Feature Branch Chain — branch `feat/cxc-cxp-rediseno-responsive` off `develop`)

| PR | Slice | Scope | Target branch |
|---|---|---|---|
| PR 1 | Slice 1 | Boton azul, ambas rutas | `feat/cxc-cxp-rediseno-responsive` |
| PR 2 | Slice 2 | CxC lista corta (client-side top-5) | PR 1's branch |
| PR 3 | Slice 3 | CxP hook busqueda + lista corta + UI | PR 2's branch |

Si Slice 3 se acerca o supera 400 lineas durante `sdd-apply` (riesgo
Medium-High ya anticipado), dividirla en dos sub-PRs encadenados:
- PR 3a: `useBuscarProveedoresDeuda` (hook) + su test unitario.
- PR 3b: UI de busqueda + slicing top-5 en `cxp-page.tsx` + su test,
  apilado sobre PR 3a.

Cada PR/slice tiene inicio y fin claros, alcance autonomo, verificacion
propia (RED→GREEN) y rollback trivial (revert del commit/PR, sin
migraciones ni datos persistidos nuevos).

---

## Phase 1.1 — Slice 1: Boton "Importar Saldos" azul (ambas pantallas)

- [x] 1.1.1 RED: `src/routes/_app/clientes/__tests__/cuentas-por-cobrar.test.tsx`
      — mock `usePermissions` (`isOwner: true`), `CxcList`, `ImportarCxcModal`;
      test que falla: boton "Importar Saldos" NO tiene `data-variant="default"`
      (renderiza `variant="outline"` actual).
- [x] 1.1.2 GREEN: `src/routes/_app/clientes/cuentas-por-cobrar.tsx:25` —
      quitar `variant="outline"` del `<Button>` (queda `variant="default"`
      por default de `button.tsx`). Icono/label/onClick sin cambio.
- [x] 1.1.3 RED: `src/routes/_app/compras/__tests__/cxp.test.tsx` — mismo
      patron: mock `usePermissions`, `CxpPage`, `ImportarCxpModal`; test que
      falla sobre el boton actual `variant="outline"`.
- [x] 1.1.4 GREEN: `src/routes/_app/compras/cxp.tsx:32` — quitar
      `variant="outline"`. Sin cambios de icono/label/onClick.
- [x] 1.1.5 Confirmar que ambos tests tambien cubren: boton invoca
      `setModalImportarAbierto(true)` on click (comportamiento preexistente,
      no debe regresionar).

## Phase 1.2 — Slice 2: CxC lista corta (top-5 client-side)

- [ ] 1.2.1 RED: `src/features/cxc/components/__tests__/cxc-list.test.tsx`
      (nuevo) — mock `useClientesConDeuda` (8 clientes), `useBuscarClientesDeuda`,
      `useTasaActual`, `CxcClienteDetalle`, `CxcReportesGeneral`. Test que
      falla: con busqueda vacia, el panel renderiza mas de 5 filas (hoy
      renderiza las 8).
- [ ] 1.2.2 GREEN: `src/features/cxc/components/cxc-list.tsx` — agregar
      constante `TOP_N_DEUDORES = 5`; computar el arreglo a RENDERIZAR
      (`clientesVisibles = isSearching ? clientes : clientes.slice(0, TOP_N_DEUDORES)`)
      SIN tocar `allClientes` (usado por KPIs/totales) ni el hook
      `useClientesConDeuda` (permanece SIN `LIMIT`). Solo el `.map()` de
      filas usa `clientesVisibles`.
- [ ] 1.2.3 RED→GREEN en el mismo archivo: test que con busqueda de 2+
      caracteres (mock `useBuscarClientesDeuda` retornando 12 resultados),
      el panel muestra los 12 (no recortado a 5).
- [ ] 1.2.4 RED→GREEN: test que los KPIs superiores (`Deuda Total`, etc.) y
      el resumen del pie siguen calculados sobre las 8 filas completas de
      `allClientes`, no sobre las 5 visibles.
- [ ] 1.2.5 RED→GREEN: test que seleccionar un cliente de la lista corta
      (posicion 3 de 5) sigue mostrando `CxcClienteDetalle` para ese
      cliente.
- [ ] 1.2.6 Confirmar `empresa_id` intacto: no se toca `useClientesConDeuda`
      ni `useBuscarClientesDeuda` mas alla de lo ya cubierto — solo lectura
      del arreglo ya devuelto.

## Phase 1.3 — Slice 3: CxP hook de busqueda + lista corta + UI

- [ ] 1.3.1 RED: `src/features/compras/hooks/__tests__/use-cxp.test.ts`
      (nuevo, o extender si ya existe) — mock `@powersync/react` (`useQuery`),
      `@/core/hooks/use-current-user`, `@/core/db/powersync/db`,
      `cargarMapaCuentas`, `generarAsientosPagoCxP`, `leerMonedaContable`
      (mismo patron de aislamiento que `use-cxc.test.ts`). Test que falla:
      `useBuscarProveedoresDeuda` no existe / no filtra por `empresa_id` +
      `razon_social`/`rif` LIKE.
- [ ] 1.3.2 GREEN: `src/features/compras/hooks/use-cxp.ts` — nuevo
      `useBuscarProveedoresDeuda(query)`: mismo umbral `query.trim().length >= 2`,
      mismo patron `%term%` sin escapar, `WHERE p.empresa_id = ?` obligatorio,
      misma subquery UNION facturas_compra+gastos que `useProveedoresConDeuda`,
      `ORDER BY razon_social ASC LIMIT 20`. Retorna `ProveedorConDeuda[]`.
- [ ] 1.3.3 RED→GREEN (mismo test file): threshold de 1 caracter NO dispara
      query (`shouldSearch === false`, sin llamada SQL).
- [ ] 1.3.4 RED: `src/features/compras/components/__tests__/cxp-page.test.tsx`
      (nuevo) — mock `useProveedoresConDeuda` (10 proveedores),
      `useBuscarProveedoresDeuda` (nuevo mock), `useFacturasCompraPendientes`,
      `useGastosPendientesProveedor`. Test que falla: no existe input de
      busqueda en el panel izquierdo; con busqueda vacia se renderizan mas
      de 5 filas.
- [ ] 1.3.5 GREEN: `src/features/compras/components/cxp-page.tsx` — agregar
      `searchQuery` state + input (mismo patron UX que `CxcList`: icono
      `MagnifyingGlass`, placeholder, estilos); `isSearching` deriva del
      mismo umbral; `proveedoresVisibles = isSearching ? searchResults : proveedores.slice(0, 5)`;
      KPIs y total del pie siguen usando `proveedores` completo
      (`useProveedoresConDeuda`, sin `LIMIT`).
- [ ] 1.3.6 RED→GREEN: test que buscar con 2+ caracteres muestra los
      resultados de `useBuscarProveedoresDeuda` sin recorte adicional a 5.
- [ ] 1.3.7 RED→GREEN: test que seleccionar un proveedor de la lista corta
      sigue mostrando `DetallePanel` (facturas + gastos) para ese proveedor.
- [ ] 1.3.8 Confirmar `empresa_id` intacto en ambos hooks involucrados
      (`useProveedoresConDeuda` sin cambios; `useBuscarProveedoresDeuda`
      nuevo, cubierto por 1.3.1-1.3.3).

---

## Regression Guard (todas las slices)

- [ ] R.1 Suite completa (`yarn test:run`) permanece en verde: baseline
      114 archivos / 1411 tests pasando (mas los nuevos de este cambio).
- [ ] R.2 Ningun cambio a: Pagar factura, Abono Global, Imprimir (CxC/CxP),
      bimonetario USD+Bs, precision decimal, filtrado `empresa_id` en
      hooks preexistentes.
- [ ] R.3 Ningun hook de lectura (`useClientesConDeuda`,
      `useProveedoresConDeuda`) recibe `LIMIT` en su SQL — el recorte a
      top-N es siempre client-side sobre el arreglo ya devuelto.
