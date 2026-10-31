# Proposal: Validación de excedente y distribución de vuelto en Cobro POS

## Intent

En "Cobro" del POS, ante excedente la UI pre-selecciona "Dar vuelto" y deja "Procesar" habilitado sin que el cajero distribuya el vuelto. Esto permite sobre-abono silencioso: el remanente no se registra ni como SAF ni como ingreso de caja.

## Scope

### In Scope
- Quitar auto-select de `discrepancyMode='VUELTO'`; ninguna de las 3 opciones (Dar vuelto / Saldo a favor / Propina) queda pre-seleccionada.
- Bloquear "Procesar" hasta elegir opción; en "Dar vuelto", hasta distribución no vacía (no exige igualar el excedente).
- Mensaje simple si lo distribuido difiere del ideal (se registra como sobrante/faltante de caja); permite procesar igual.
- `crearVenta` (`'VUELTO'`): bookear la diferencia con primitivas YA existentes: `DIFERENCIAL_SOBRANTE` (distribuido < ideal) / `DIFERENCIAL_FALTANTE` (distribuido > ideal).
- Tests nuevos en `cobro-modal.test.tsx` y `use-ventas`.

### Out of Scope
- `use-cuadre.ts`, schema/migración, flujos de SAF/Propina.
- Subtipo de movimiento dedicado (Approach 2) y modelo de cierre de sesión (Approach 3), no pedidos por el owner.
- Trigger `consumir_saf_lote` en vuelo (PR #288).

## Capabilities

### New Capabilities
- `pos-vuelto-diferencial-caja`: `crearVenta` compara distribuido vs ideal y registra la diferencia (primitivas existentes).

### Modified Capabilities
- `pos-cobro-checkout-guards`: extender "No discrepancy mode pre-selected" (hoy solo `'CREDITO'`) al excedente/`'VUELTO'`; nuevo requisito: bloquear `'VUELTO'` sin distribución.

## Approach

Approach 1 de la exploración: gating en `cobro-modal.tsx` + wiring en `use-ventas.ts` para bookear el delta vía primitivas ya leídas por `use-cuadre.ts`. 2 archivos + tests, sin schema ni migración.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `cobro-modal.tsx` | Modified | Quitar auto-select; endurecer `splitVueltoValid`/`puedeProcesar`; mensaje sobrante/faltante |
| `use-ventas.ts` | Modified | `case 'VUELTO'`: comparar `vueltoEntries` vs ideal, bookear delta |
| `*.test.ts(x)` | Modified | Nuevos casos: pre-selección, gating, booking |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Regresión fallback legacy `vuelto` | Medium | `vueltoEntries` sigue de fuente de verdad |
| Reabrir gap AND-gate `safEstado==='ok'` (#5293) | Low | Test de regresión explícito |
| Sin epsilon fijo del owner | Low | Mensaje dispara ante diferencia ≠ 0 |
| Presupuesto de revisión (400 líneas) | Low | Diff acotado a 2 archivos + tests |

## Rollback Plan

Revertir commits de `cobro-modal.tsx`/`use-ventas.ts` (sin migración/schema).

## Dependencies

- PR #288 (`consumir_saf_lote`) toca `use-ventas.ts` — coordinar merge.

## Success Criteria

- [ ] Excedente: ninguna opción pre-seleccionada; Procesar bloqueado hasta elegir una
- [ ] Dar vuelto: Procesar bloqueado con distribución vacía; mensaje si distribuido ≠ ideal, Procesar sigue permitido
- [ ] `crearVenta` registra el delta vía `DIFERENCIAL_SOBRANTE`/`FALTANTE`; `use-cuadre.ts` lo refleja sin cambios
- [ ] AND-gate `safEstado==='ok'` y `vueltoEntries` preservados como fuente de verdad
