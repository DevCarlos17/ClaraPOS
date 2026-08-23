# Tasks: Guarda de Depósito Inactivo en el Write-Path de Inventario

## Review Workload Forecast

| File | Action | Est. lines |
|------|--------|-----------|
| `src/features/inventario/lib/deposito-inactivo.ts` | Create | ~100 |
| `src/features/inventario/lib/__tests__/deposito-inactivo.test.ts` | Create | ~160 |
| `src/features/inventario/hooks/use-depositos.ts` | Modify | ~45 |
| `src/features/inventario/components/depositos/deposito-list.tsx` | Modify | ~55 |
| `src/features/inventario/components/depositos/reasignar-caja-dialog.tsx` | Create | ~140 |
| `src/features/ventas/hooks/use-ventas.ts` | Modify | ~30 |
| `src/features/ventas/hooks/use-deposito-activo.ts` | Modify | ~10 |
| `src/features/ventas/hooks/use-notas-credito.ts` | Modify | ~25 |
| `migrations/0087_deposito_inactivo_guard.sql` | Create | ~85 |
| **Total** | | **~650** |

Nearly 1.6x the 400-line budget (larger than PR #57's ~318 est., itself already above budget). Follows the design's suggested 2-slice split — Slice A is self-contained (deactivation guard + reassignment UX), Slice B depends on Slice A only conceptually (shared lib file).

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Slice A — deactivation guard + reasignación + list transparency (~340 lines: lib bloqueo/agrupación fns + tests, `use-depositos.ts`, `deposito-list.tsx`, `reasignar-caja-dialog.tsx`) | PR 1 | Self-contained; no ventas/NCR/DB touched |
| 2 | Slice B — sale guard + NCR fallback + DB trigger (~310 lines: lib reingreso fn + tests, `use-ventas.ts`, `use-deposito-activo.ts`, `use-notas-credito.ts`, migration 0087) | PR 2 | Base boundary depends on chosen chain strategy |

Migration numbering verified: `0086_deposito_unico_principal.sql` is the last applied migration → `0087` is next free.

## Phase 1: Lib puro — Slice A (bloqueo + agrupación)

- [x] 1.1 (RED) `deposito-inactivo.test.ts`: casos para `agruparCajasPorDeposito` y `resolveBloqueoDesactivacion` (SESION_ABIERTA, CAJA_SIN_SESION, permitida sin cajas)
- [x] 1.2 (GREEN) `deposito-inactivo.ts`: implementar ambas funciones puras para pasar 1.1

## Phase 2: Slice A — Desactivación + transparencia UI

- [x] 2.1 `use-depositos.ts` — `actualizarDeposito`: pre-check fail-fast (fuera de `writeTransaction`) usando `resolveBloqueoDesactivacion`; errores en español por `motivo`
- [x] 2.2 Crear `reasignar-caja-dialog.tsx`: lista cajas `CAJA_SIN_SESION`, selector de depósito destino (activo, `permite_venta=1`, ≠ actual) por caja; `actualizarCaja` ×N → `actualizarDeposito`
- [x] 2.3 `deposito-list.tsx`: query agrupada cajas+sesión (`EXISTS` correlacionado) vía `useMemo`+`agruparCajasPorDeposito`; columna de transparencia
- [x] 2.4 `deposito-list.tsx` — toggle proactivo: `SESION_ABIERTA`→toast bloqueo; `CAJA_SIN_SESION`→abre diálogo; sin cajas→llamada directa
- [x] 2.5 RTL: `DepositoList`/`ReasignarCajaDialog` — flujo toggle→dialog vs toast (mock `actualizarDeposito`/`actualizarCaja`)

## Phase 3: Lib puro — Slice B (reingreso NCR)

- [ ] 3.1 (RED) `deposito-inactivo.test.ts`: casos para `resolveDepositoReingresoNcr` (origen activo, fallback a principal, principal null)
- [ ] 3.2 (GREEN) `deposito-inactivo.ts`: implementar `resolveDepositoReingresoNcr` para pasar 3.1

## Phase 4: Slice B — Venta + NCR + DB trigger

- [ ] 4.1 (RED) `use-ventas` tests: venta rechazada (mensaje español) cuando el depósito de la caja tiene `is_active=0`, antes de `writeTransaction`
- [ ] 4.2 (GREEN) `use-ventas.ts`: pre-check JOIN `sesiones_caja→cajas→depositos` (`is_active`) antes de abrir `writeTransaction`; throw si inactivo
- [ ] 4.3 `use-deposito-activo.ts`: tratar `cajaDepositoId` como `null` si su `is_active=0`, antes de `resolveDepositoEgresoVenta`
- [ ] 4.4 `use-notas-credito.ts`: leer `is_active` de `venta.deposito_id` + `depositoId` principal; aplicar `resolveDepositoReingresoNcr` antes del INSERT/`upsertStockDeposito`
- [ ] 4.5 Crear `migrations/0087_deposito_inactivo_guard.sql`: `validate_movimiento_inventario_insert` + chequeo `is_active=0` reject-only, estilo idempotente de `0086`; documentar verificación manual (INSERT crudo rechaza / fallback NCR ya resuelto acepta)

## Phase 5: Cierre de scope

- [ ] 5.1 Verificar que las 6 requirements filtran por `empresa_id` en cada query/count nuevo
- [ ] 5.2 No crear guard en `abrirSesionCaja` (diferido, backlog #2231) — no marcar como omisión en `sdd-verify`
- [ ] 5.3 No tocar módulo NCR administrativo (futuro, fuera de scope) ni el checkbox de Finding 1 (fix directo aparte)
