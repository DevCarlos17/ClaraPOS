# Proposal: Facturas emitidas — tabla blanca con borde + tabs unidos al filtro

## Intent

Pantalla `Ventas > Facturas emitidas` (`notas-credito-page.tsx`) tiene dos defectos visuales puramente cosmeticos: (1) la tabla de facturas se ve gris/sin blanco porque el `DataTable` generico usa `bg-background` (gris, igual al fondo de pagina) en vez de la convencion `bg-card` (blanco) usada en el resto de la app; (2) las tabs "Facturas"/"Notas de credito" (ya son un `Tabs` shadcn real) se ven como una pastilla flotante desconectada de la tarjeta de filtros de abajo por un `gap-4` y un `TabsList` `w-fit`. Se corrige la percepcion visual sin tocar logica de negocio, filtros, ni el flujo de `ConsultaFacturaModal`/`Aplicar NC` recien mergeado en PR #104.

## Scope

### In Scope
- Cambiar el wrapper del `DataTable` generico (`src/components/data-table/data-table.tsx:73-76`) de `bg-background border` a `bg-card border shadow-lg` (blanco + borde, alineado a la convencion de 40+ tarjetas del app, con borde explicito para mantener separacion visual en `cliente-detalle.tsx`).
- Unir visualmente `TabsList` con la tarjeta de filtros en `notas-credito-page.tsx`, `facturas-empresa-tab.tsx` y `notas-credito-tab.tsx` (className-only, sin mover estado ni compartir filtros entre tabs).
- QA visual manual en los 3 consumidores de `FacturasEmpresaTable` (esta pantalla, `cliente-detalle.tsx`, `ventas-consultas-modal.tsx`) y en ambas tabs.

### Out of Scope
- Cualquier cambio de datos, hooks, filtros, `empresa_id`, o logica de `Aplicar nota de credito`.
- Compartir estado de filtros entre "Facturas" y "Notas de credito" (siguen duplicados a proposito).
- Refactor de `components/ui/tabs.tsx` (el primitivo shadcn no cambia; solo overrides via `className`).
- Extraer un componente `TableFiltros` compartido (deuda tecnica preexistente, no pedida).

## Capabilities

### New Capabilities
- `facturas-emitidas-listado-ui`: requisitos visuales/presentacionales de la pantalla "Facturas emitidas" (estilo de tarjeta blanca de la tabla y union visual tabs-filtro). No existe spec previo para esta pantalla.

### Modified Capabilities
- None (no hay spec de comportamiento funcional que cambie).

## Approach

**Adjustment 1 (tabla blanca con borde)** — fix en el componente compartido, no en cada llamador:
- `data-table.tsx:73-76`: `'flex flex-1 flex-col rounded-2xl bg-background border overflow-hidden'` → `'flex flex-1 flex-col rounded-2xl bg-card border shadow-lg overflow-hidden'`.
- `DataTable` tiene un unico consumidor (`FacturasEmpresaTable`), con 3 call-sites: esta pantalla, `cliente-detalle.tsx:143`, `ventas-consultas-modal.tsx:128,165`. El fix cascada a los 3 de forma consistente sin tocar otras pantallas.
- Se conserva el `border` explicito (a diferencia de la convencion pura `bg-card shadow-lg` sin borde de `notas-credito-tab.tsx:104`) porque `cliente-detalle.tsx:46` ya envuelve `FacturasEmpresaTable` en su propio `bg-card shadow-lg` — sin borde, la tabla se veria blanco-sobre-blanco sin separacion. El borde resuelve el riesgo en los 3 sitios con un solo cambio de linea, sin plomeria de props nueva.

**Adjustment 2 (tabs unidas al filtro)** — CSS-only, 3 archivos, sin logica nueva:
- `notas-credito-page.tsx:19`: quitar `gap-4` del `<Tabs>` root (o `gap-0` local) para eliminar el espacio entre `TabsList` y el `TabsContent` activo.
- `notas-credito-page.tsx:20`: `TabsList` recibe `className` override (`w-full justify-start rounded-b-none` + fondo que combine con la tarjeta) para leerse como el "header" de la tarjeta de filtros.
- `facturas-empresa-tab.tsx:80` (`FacturasEmpresaFiltros`) y `notas-credito-tab.tsx:56` (filtro inline): cambiar `rounded-2xl` → `rounded-b-2xl rounded-t-none` solo en el elemento superior, para que la tarjeta de filtro "encaje" debajo del `TabsList` sin esquinas redondeadas duplicadas ni gap.
- Ambos tabs duplican el bloque de filtro (a proposito, sin estado compartido) — el ajuste de className se aplica en AMBOS archivos para que ambas tabs luzcan identicas.
- Riesgo conocido: las clases base de shadcn/radix (`w-fit`, `rounded-lg`, `bg-muted`) son muchas y order-sensitive con `cva`; tailwind-merge deberia resolverlas via `cn()`, pero requiere verificacion visual (no solo lectura de codigo).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/components/data-table/data-table.tsx:73-76` | Modified | Wrapper `bg-background border` → `bg-card border shadow-lg`. Componente compartido, unico consumidor real. |
| `src/features/ventas/components/notas-credito-page.tsx:19-23` | Modified | `Tabs`/`TabsList` className para unir con la tarjeta de abajo. |
| `src/features/ventas/components/facturas-empresa-tab.tsx:80` | Modified | `FacturasEmpresaFiltros` className (esquina superior). |
| `src/features/ventas/components/notas-credito-tab.tsx:56` | Modified | Filtro inline duplicado, mismo ajuste className. |
| `src/features/clientes/components/cliente-detalle.tsx:143` (visual only) | Verified | Confirmar que el borde da separacion suficiente (blanco-sobre-blanco). |
| `src/features/reportes/components/ventas-consultas-modal.tsx:128,165` (visual only) | Verified | Confirmar estilo consistente dentro del modal. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|--------------|
| `cliente-detalle.tsx` se ve blanco-sobre-blanco sin separacion | Medium | Borde explicito (`border`) en el wrapper compartido de `DataTable`; verificar visualmente tras el cambio. |
| tailwind-merge no resuelve bien el override de `TabsList`/filtro (clases `cva` order-sensitive) | Low-Medium | QA visual manual en ambas tabs tras aplicar; ajustar orden/especificidad de clases si el seam persiste. |
| Cambio compartido en `DataTable` afecta 2 pantallas ademas de esta (`cliente-detalle`, `ventas-consultas-modal`) | Low | Es una mejora consistente con la convencion ya usada en 40+ lugares; no hay otro consumidor de `DataTable` en el codebase. |

## Rollback Plan

Revertir el commit/PR de este cambio. Son ediciones `className` puras en 4 archivos sin migraciones, sin cambios de datos ni de hooks — revert directo sin efectos secundarios.

## Dependencies

- Rama `feat/facturas-emitidas-tabla-tabs-ui` creada desde `develop` (PR #104 ya mergeado, incluye `ConsultaFacturaModal` + `stopPropagation`). Ninguna dependencia externa nueva.

## Success Criteria

- [ ] La tabla de facturas en "Facturas emitidas" se ve blanca con borde, no gris.
- [ ] `cliente-detalle.tsx` mantiene separacion visual clara (no blanco-sobre-blanco).
- [ ] `ventas-consultas-modal.tsx` mantiene estilo consistente.
- [ ] Las tabs "Facturas"/"Notas de credito" se ven unidas (sin gap/seam) a su tarjeta de filtros, en ambas tabs.
- [ ] Suite completa (`yarn test:run`) sigue en verde — cero regresiones en `notas-credito-page.test.tsx`, `facturas-empresa-tab.test.tsx`, `cliente-detalle.test.tsx`, `ventas-consultas-modal.test.tsx`.
