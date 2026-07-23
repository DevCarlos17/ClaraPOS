# Tasks: Cierre → Consolidación automática a Tesorería

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520-600 (migration ~20, use-traspasos.ts refactor+add ~120, use-gastos.ts new export ~90, cuentas-config-schema.ts ~2, use-sesiones-caja.ts wiring ~110, 3 label dicts ~6, toast removal ~2, schema/types comments ~10) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (user decides: stacked-to-main vs feature-branch-chain) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation: migration 0077, generalized traspaso/gasto helpers, config clave, label dicts — no behavior change to cierre yet | PR 1 | Backward-compatible; helpers added but unused by `cerrarSesionCaja`. Safe to merge/deploy alone. |
| 2 | Wire consolidation into `cerrarSesionCaja` + remove toast + manual verification | PR 2 | Depends on PR 1 merged (or based on PR 1 branch). Activates the new cierre behavior. |

**Migration-apply ordering (critical)**: Migration `0077` MUST be applied in Supabase **before** PR 2's code ships to any environment that syncs `SESION_CAJA`-typed `traspasos_tesoreria` rows — without it, every consolidated cierre fails to sync (`23514`). This migration also retroactively unbreaks the pre-existing `pos-tesoreria-integration` sync bug (manual POS↔Tesorería traspasos), so applying it with PR 1 has independent value even before PR 2 lands.

## Phase 1: Foundation (PR 1 — helpers, no cierre wiring)

- [x] 1.1 Create `migrations/0077_cierre_consolidacion_tesoreria.sql` — idempotent DROP/ADD on `traspasos_tesoreria` (`cuenta_origen_tipo`/`cuenta_destino_tipo` CHECK → add `'SESION_CAJA'`), DROP/ADD `movimientos_bancarios_origen_check` → add `'CIERRE_CONSOLIDACION'` (0073/0027 pattern). Verify: idempotent re-run is a no-op.
- [x] 1.2 Add `COMISION_BANCARIA` to `CLAVES_CONFIG` in `src/features/contabilidad/schemas/cuentas-config-schema.ts`.
- [x] 1.3 Update `src/core/db/kysely/types.ts` `origen` comment (movimientos_bancarios) to include `CIERRE_CONSOLIDACION`; check `src/core/db/powersync/schema.ts` for any origen-related comments needing the same update.
- [x] 1.4 In `src/features/tesoreria/hooks/use-traspasos.ts`: extract the body of `crearTraspasoSesionATesoreria` (lines ~615-727) into new exported `consolidarMetodoATesoreriaEnTx(tx, {...})` accepting `destino: { tipo: 'CAJA_FUERTE' | 'BANCO'; id }`; branch step 6 insert between `mov_caja_fuerte` (current) and `movimientos_bancarios` (new) by `destino.tipo`. Redefine `crearTraspasoSesionATesoreria` as a thin `db.writeTransaction(tx => consolidarMetodoATesoreriaEnTx(tx, {...params, destino: {tipo:'CAJA_FUERTE', id: params.cajaFuerteId}}))` wrapper — existing callers unaffected.
- [x] 1.5 In `src/features/contabilidad/hooks/use-gastos.ts`: add `insertarGastoComisionEnTx(tx, {...})` per design.md interfaces block — INSERT `gastos` (status='REGISTRADO', tipo_impuesto='Exento', porcentaje_iva=0, cuenta_id=cuentaComisionId), one `gasto_pagos` row (`metodo_cobro_id=NULL` deliberadamente), `movimientos_bancarios` EGRESO (`origen='GASTO'`) + bank saldo update, then `generarAsientosGasto(tx, {...})` reusing `cargarMapaCuentas`. Do NOT call `crearGasto` (double-drena `metodos_cobro.saldo_actual`).
- [x] 1.6 Add `CIERRE_CONSOLIDACION` label + color entries to the origen dictionaries in `src/features/tesoreria/components/movimientos-table.tsx` (~lines 35-53), `src/features/tesoreria/components/reverso-modal.tsx` (~lines 30-37), and `src/features/bancos/components/conciliacion-bancaria.tsx` (~lines 21-25).
- [x] 1.7 Verify: `yarn type-check` + `yarn lint` pass. Manually call `consolidarMetodoATesoreriaEnTx` and `insertarGastoComisionEnTx` are exported and typed correctly (no callers yet — confirm no unused-export lint errors).
  - `yarn type-check`: PASS (zero errors in touched files; pre-existing unrelated test-file/factura-detalle-cxc.tsx errors untouched).
  - `yarn lint`: could not run — `eslint` is not installed in `node_modules` in this environment (pre-existing gap, unrelated to this change).

## Phase 2: Wiring cierre + cleanup (PR 2 — activates behavior)

- [x] 2.1 In `src/features/caja/hooks/use-sesiones-caja.ts` `cerrarSesionCaja`, add step 8 right after step 7 (SAF snapshot, ends ~line 962, before the transaction's closing `})`): batch-SELECT `metodos_cobro` (`banco_empresa_id, caja_fuerte_id, comision_pct, tipo, moneda_id`) for the IDs already present in `metodosUsadosResult` (from step 6, ~line 839).
- [x] 2.2 Add step 9: loop `metodosUsadosResult` rows with `totalSistemaD > 0`; skip `metodo_cobro_id IS NULL` (defensive); resolve destino (EFECTIVO → caja fuerte by `moneda_id`, else → `banco_empresa_id`), hard-fail (Spanish error naming the method) if none; call `consolidarMetodoATesoreriaEnTx(tx, {...})` con `origenDestino` = `'DEPOSITO_CIERRE'` (caja fuerte) o `'CIERRE_CONSOLIDACION'` (banco).
- [x] 2.3 In the same loop, if `comision_pct > 0`: resolve `COMISION_BANCARIA` via `cargarMapaCuentas`, hard-fail (Spanish error naming the method) if missing; call `insertarGastoComisionEnTx(tx, {...})` with method-native currency, session `tasaDelDia` (hard-fail if Bs method + missing/zero tasa).
- [x] 2.4 Remove the "recuerda depositar" toast (`toast.info(...)`, line ~484) in `src/features/caja/components/sesion-caja-form.tsx`.
- [x] 2.5 Run `yarn type-check` and `yarn lint`; fix any resulting errors.
  - `yarn type-check`: PASS — zero errors in any file touched by this batch (`use-sesiones-caja.ts`, `sesion-caja-form.tsx`); pre-existing unrelated test-file/`factura-detalle-cxc.tsx` errors untouched, identical to PR1 baseline.
  - `yarn lint`: could not run — `eslint` is not installed in `node_modules` in this environment (pre-existing gap, unrelated to this change, same as PR1).
- [ ] 2.6 **Manual verification checklist** (no test runner in this project):
  - [ ] Close a session mixing EFECTIVO USD + EFECTIVO Bs + a commission-bearing PUNTO method → confirm `mov_caja_fuerte` rows (`origen='DEPOSITO_CIERRE'`, `validado=0`) per currency, `movimientos_bancarios` INGRESO (`origen='CIERRE_CONSOLIDACION'`, `validado=0`) + EGRESO (`origen='GASTO'`), one `gastos` row against `COMISION_BANCARIA`'s account with correct Bs/USD/tasa, `traspasos_tesoreria` rows tagged `sesion_caja_id`.
  - [ ] Close a session using a used method with no destino configured → confirm the whole cierre throws, `sesiones_caja.status` stays `ABIERTA`, no partial/orphan rows in `sesiones_caja_detalle` or Tesorería tables.
  - [ ] Close a session with a commission-bearing method but no `COMISION_BANCARIA` clave configured → confirm hard-fail, no partial rows.
  - [ ] Confirm the "recuerda depositar" toast no longer renders after a successful cierre.
  - [ ] Confirm migration 0077 applied cleanly in Supabase and a `SESION_CAJA`-origin traspaso now syncs without `23514`.

Item 2.6 is a manual QA checklist against a running app + Supabase — cannot be executed by the apply agent (no test runner, no live environment access). Left unchecked for the user/QA to run post-merge; see "MANUAL VERIFICATION CHECKLIST" in the apply-progress artifact for the full expanded procedure.
