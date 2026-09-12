# Tasks: Facturas emitidas — tabla blanca con borde + tabs unidos al filtro

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~20-35 (Adj.1: ~1-3 lines in 1 shared file; Adj.2: ~15-30 lines across 3 files) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-always |
| Chain strategy | standalone (own branch `feat/facturas-emitidas-tabla-tabs-ui` off `develop`, own PR later) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: standalone
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Adj.1 + Adj.2 together (single cohesive visual slice) | PR (own, to `develop`) | Both adjustments are on the same screen, low line count combined; no reason to split. |

## Phase 1: Adjustment 1 — Tabla blanca con borde (DataTable compartido)

- [x] 1.1 Editar `src/components/data-table/data-table.tsx:73-76`: cambiar `'flex flex-1 flex-col rounded-2xl bg-background border overflow-hidden'` → `'flex flex-1 flex-col rounded-2xl bg-card border shadow-lg overflow-hidden'`.
- [x] 1.2 Correr `yarn test:run` completo — confirmar que ningun test de `facturas-empresa-tab.test.tsx`, `cliente-detalle.test.tsx`, `ventas-consultas-modal.test.tsx` se rompe (no assertan className, per exploracion).
- [ ] 1.3 QA visual manual: abrir `Ventas > Facturas emitidas` tab "Facturas" — confirmar tabla blanca con borde, no gris. **PENDIENTE (manual QA, jsdom no puede verificar CSS)**
- [ ] 1.4 QA visual manual: abrir `Clientes > detalle de un cliente con facturas` — confirmar que el borde da separacion visible contra el `bg-card` exterior de `cliente-detalle.tsx:46` (no blanco-sobre-blanco). Si se ve plano, evaluar reforzar el borde (p.ej. `border-border/60` mas visible) antes de cerrar la tarea. **PENDIENTE (manual QA)**
- [ ] 1.5 QA visual manual: abrir el modal de consultas de ventas (`ventas-consultas-modal.tsx`) — confirmar estilo consistente con los otros 2 sitios. **PENDIENTE (manual QA)**

## Phase 2: Adjustment 2 — Tabs unidas a la tarjeta de filtros

- [x] 2.1 Editar `src/features/ventas/components/notas-credito-page.tsx:19`: quitar/reducir `gap-4` en `<Tabs>` (p.ej. `gap-0`) para eliminar el espacio entre `TabsList` y `TabsContent`.
- [x] 2.2 Editar `notas-credito-page.tsx:20`: agregar `className` a `<TabsList>` (`w-full justify-start rounded-b-none`, + fondo que combine con la tarjeta de filtros) para que se lea como header de la tarjeta.
- [x] 2.3 Editar `src/features/ventas/components/facturas-empresa-tab.tsx:80` (`FacturasEmpresaFiltros`): cambiar `rounded-2xl` → `rounded-b-2xl rounded-t-none` en el div contenedor para encajar debajo del `TabsList` sin gap ni esquinas duplicadas.
- [x] 2.4 Editar `src/features/ventas/components/notas-credito-tab.tsx:56` (bloque de filtro inline): aplicar el mismo ajuste de esquinas que 2.3, para paridad visual entre ambas tabs.
- [x] 2.5 Correr `yarn test:run` completo — confirmar que `notas-credito-page.test.tsx` sigue en verde (asserta via rol/`data-state`, no className).
- [ ] 2.6 QA visual manual: tab "Facturas" — TabsList y tarjeta de filtros se ven como una sola unidad, sin seam. **PENDIENTE (manual QA)**
- [ ] 2.7 QA visual manual: tab "Notas de credito" — mismo resultado visual que 2.6, paridad entre tabs. **PENDIENTE (manual QA)**
- [ ] 2.8 QA visual manual: confirmar que los filtros de cada tab siguen siendo independientes (cambiar un filtro en "Facturas" no afecta "Notas de credito" y viceversa) — la union es solo visual. **PENDIENTE (manual QA)**

## Phase 3: Verificacion final

- [x] 3.1 Correr `yarn test:run` una vez mas sobre el estado final combinado (Adj.1 + Adj.2) — suite completa en verde (1411/1411, pre-existing unrelated `Worker is not defined` unhandled rejection confirmed present on baseline too).
- [x] 3.2 Correr `yarn type-check:test` — sin errores nuevos (pre-existing `use-pwa-update.ts` TS6133 confirmed present on baseline, unrelated to this change).
- [ ] 3.3 Confirmar los 4 criterios de exito del `proposal.md` cumplidos antes de abrir el PR. **PENDIENTE (requiere QA visual manual, no verificable via jsdom)**
