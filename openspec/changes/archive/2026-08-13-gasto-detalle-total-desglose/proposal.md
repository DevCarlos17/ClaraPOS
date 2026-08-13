# Proposal: Fix Total Factura y Desglose Base/IVA en Detalle de Gasto

## Intent

"Detalle de Gasto" (`FacturaProveedorModal`, tipo=`GASTO`) muestra "Total Factura" = `monto_factura` (base sin IVA), no el total con IVA (`monto_usd`). Ej: Base $10.00, Total $11.60 — "Total Factura" muestra $10.00 mientras "Abonado" muestra $11.60 (parece abonado > total). El desglose Base/IVA/Total ya existe (`gasto-montos.ts`, PR #25) pero se aplico a un componente **muerto** (`gasto-detalle-modal.tsx`, sin imports).

## Scope

### In Scope

- Corregir `totalProveedorUsd` en `factura-proveedor-modal.tsx` (rama `GASTO`, `useMemo amounts`, ~L231-237): usar el TOTAL con IVA (`monto_usd`), no la base; con tasa paralela + BS, convertir el total, no solo la base.
- Portar el desglose Base / IVA (%) / Total — dinamico por `tipo_impuesto` — al bloque "Totales" real, reusando `gasto-montos.ts`.
- Test unitario de la derivacion (USD/BS, con/sin paralela, 3 `tipo_impuesto`).
- Anotar `gasto-detalle-modal.tsx` como dead code (TODO), sin eliminarlo.

### Out of Scope

- Compartir PDF mobile y descuentos comerciales — deferred, backlog #1493.
- Multiples alicuotas de IVA / N gastos por factura — limitacion de modelo (PR #25).
- Eliminar fisicamente `gasto-detalle-modal.tsx` (solo se marca).
- Mismo bug en `main` — foco en `develop`.

## Capabilities

### New Capabilities

- `gasto-detalle-desglose`: presentacion del total y desglose Base/IVA/Total en el modal Detalle de Gasto (`FacturaProveedorModal`, tipo=`GASTO`).

### Modified Capabilities

None.

## Approach

1. Derivar `totalProveedorUsd` desde `totalContableUsd` (`monto_usd`); con tasa paralela + BS, convertir el total, no la base.
2. Extender `amounts` con base/IVA/`tipo_impuesto` via `gasto-montos.ts`; renderizar desglose analogo al `ResumenConfirm` de `gasto-form.tsx`.
3. Extraer la derivacion como funcion pura testeable, cubierta con `yarn test:run`.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `factura-proveedor-modal.tsx` | Modified | Fix `totalProveedorUsd` + bloque desglose Base/IVA/Total (rama GASTO) |
| `gasto-montos.ts` | Reused | Selectores puros, sin cambios |
| `contabilidad/lib/__tests__/` | New | Cobertura de la derivacion de totales |
| `gasto-detalle-modal.tsx` | Flagged | Dead code — anotar para limpieza futura |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Romper calculo Bs en rama de tasa paralela (compartida con CxP) | Med | Test unitario cubre ambas ramas |
| Fix futuro vuelve a aplicarse al componente muerto | Med | TODO explicito marcandolo como no usado |

## Rollback Plan

`git revert` del commit/PR (acotado a `factura-proveedor-modal.tsx` + test). Sin migraciones ni cambios de schema.

## Dependencies

- Rama base: `develop` (contiene `gasto-montos.ts` y el desglose de PR #25).

## Success Criteria

- [ ] "Total Factura" = `monto_usd`; nunca menor que "Abonado".
- [ ] Desglose Base/IVA(%)/Total correcto por `tipo_impuesto`.
- [ ] Conversion Bs con tasa paralela usa el TOTAL, no la base.
- [ ] `yarn test:run` y `yarn type-check` limpios.
