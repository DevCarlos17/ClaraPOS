# Proposal: CxC/CxP Rediseno — Phase 1 (boton, listas cortas + busqueda CxP)

> **Alcance de esta propuesta: PHASE 1 unicamente.** Phase 2 (mobile row→card +
> master-detail 2-step en CxC y CxP) queda deferida y se planifica por
> separado — ver `sdd/cxc-cxp-rediseno-responsive/explore` en Engram para el
> analisis completo de las 5 slices originales.

## Intent

CxC y CxP tienen dos problemas de UX de escritorio, sin relacion con mobile:
1. El boton "Importar Saldos" usa `variant="outline"` en ambas pantallas —
   se confunde con el fondo, mientras el resto de acciones primarias del
   sistema (Nuevo Departamento, Consultar Kardex) usan el azul `bg-primary`.
2. El panel izquierdo de deudores renderiza la lista COMPLETA sin limite
   (ya ordenada DESC por deuda), forzando scroll infinito quan hay muchos
   clientes/proveedores. CxC ya tiene buscador; CxP no tiene ninguno.

## Scope

### In Scope
- Slice 1: boton "Importar Saldos" a variante `default` (azul) en
  `cuentas-por-cobrar.tsx` y `cxp.tsx`.
- Slice 2: CxC — panel izquierdo muestra top-5 deudores cuando la busqueda
  esta vacia; buscador existente (`useBuscarClientesDeuda`) sin cambios.
- Slice 3: CxP — nuevo hook `useBuscarProveedoresDeuda` (mismo patron que
  CxC) + input de busqueda nuevo + panel izquierdo top-5 cuando vacio.

### Out of Scope
- Phase 2: mobile row→card, master-detail 2-step (`md:` breakpoints) — CxC
  1 tabla, CxP 2 tablas (facturas + gastos). Planificado por separado.
- Refactor de componentes compartidos entre CxC/CxP (no existe hoy nada
  compartido; unificarlos es deuda tecnica futura, no parte de este cambio).
- Cambios a flujos Pagar / Abono Global / Imprimir, bimonetario, precision
  decimal.
- "Arreglar" el patron `LIKE '%term%'` sin escape de wildcards del usuario
  en la busqueda existente de CxC — CxP debe replicarlo EXACTO, no corregirlo.

## Capabilities

### New Capabilities
- `cxc-cxp-boton-importar-saldos`: variante visual del boton "Importar
  Saldos" en ambas pantallas.
- `cxc-lista-deudores-corta`: panel izquierdo de CxC muestra top-N
  deudores cuando no hay busqueda activa.
- `cxp-lista-deudores-corta`: panel izquierdo de CxP con buscador nuevo y
  top-N deudores cuando no hay busqueda activa.

### Modified Capabilities
- Ninguna (no existen specs previas para estas pantallas en `openspec/specs/`).

## Approach

Client-side slicing, no SQL LIMIT: `useClientesConDeuda`/
`useProveedoresConDeuda` siguen trayendo TODOS los deudores sin limite,
porque sus resultados alimentan los KPIs/totales del pie (`totalDeuda`,
`totalSAF`, `deudaTotal`, etc.) que deben reflejar el universo completo, no
solo el top-N. El recorte a N=5 se aplica solo al arreglo que se RENDERIZA
en la lista, nunca a la fuente de los totales. Una consulta con `LIMIT`
rompería silenciosamente esos totales.

CxP replica el patron exacto de `useBuscarClientesDeuda` (mismo umbral de 2
caracteres, mismo `LIKE '%term%'` sin escapar, mismo `LIMIT 20`,
`empresa_id` obligatorio via `useCurrentUser()`).

## Affected Areas

| Area | Impacto | Descripcion |
|------|---------|-------------|
| `src/routes/_app/clientes/cuentas-por-cobrar.tsx:25` | Modified | boton `variant="default"` |
| `src/routes/_app/compras/cxp.tsx:32` | Modified | boton `variant="default"` |
| `src/features/cxc/components/cxc-list.tsx` | Modified | slice cliente-side a top-5 cuando no hay busqueda |
| `src/features/compras/hooks/use-cxp.ts` | Modified | nuevo hook `useBuscarProveedoresDeuda` |
| `src/features/compras/components/cxp-page.tsx` | Modified | input de busqueda + slice top-5 |

## Risks

| Riesgo | Prob. | Mitigacion |
|---|---|---|
| LIMIT en SQL rompe KPIs/totales del pie | Alta si se hace mal | Recorte SIEMPRE client-side, nunca en la query de `useClientesConDeuda`/`useProveedoresConDeuda` |
| CxP replica el gap de wildcard-escaping como si fuera nuevo bug | Media | Documentado como comportamiento exacto a replicar, no a corregir |
| 3 slices exceden el budget de 400 lineas en un solo PR | Media-Alta | Ver Review Workload Forecast en `tasks.md`; feature-branch-chain con 1 PR por slice |

## Rollback Plan

Cada slice es un commit/PR independiente sobre `feat/cxc-cxp-rediseno-responsive`.
Revert del PR de la slice basta — ningun cambio de schema, ninguna
migracion, ningun dato persistido nuevo.

## Dependencies

- Ninguna externa. Depende del branch `feat/cxc-cxp-rediseno-responsive`
  (creado desde `develop`) segun sesion SDD cacheada.

## Success Criteria

- [ ] Boton "Importar Saldos" azul (`bg-primary`) en ambas pantallas, mismo
      onClick/icono/label.
- [ ] CxC: lista vacia de busqueda muestra solo 5 deudores (orden DESC
      preservado); buscar filtra igual que antes; KPIs/totales sin cambio.
- [ ] CxP: buscador nuevo filtra por razon_social/rif con `empresa_id`;
      lista vacia de busqueda muestra solo 5 deudores; KPIs/totales sin cambio.
- [ ] Suite existente (~1411 tests) sigue en verde; nuevos tests RED→GREEN
      por slice.
