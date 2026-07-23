# Apply Progress: Cierre → Consolidación automática a Tesorería

## Batch: PR1 (Phase 1 — Foundation, no cierre wiring)

**Mode**: Standard (no test runner, `strict_tdd: false`)
**Chain strategy**: stacked-to-main (PR1 of 2)

### Completed Tasks

- [x] 1.1 Created `migrations/0077_cierre_consolidacion_tesoreria.sql` — idempotent DROP/ADD on `traspasos_tesoreria` (`cuenta_origen_tipo`/`cuenta_destino_tipo` CHECK → add `'SESION_CAJA'`), DROP/ADD `movimientos_bancarios_origen_check` → add `'CIERRE_CONSOLIDACION'`, following the 0073/0027 pattern. Verified current live CHECK definitions in 0035/0072 before writing (no other migration touched these constraints since 0035).
- [x] 1.2 Added `COMISION_BANCARIA: 'Comisiones bancarias (cierre de caja)'` to `CLAVES_CONFIG` in `src/features/contabilidad/schemas/cuentas-config-schema.ts`.
- [x] 1.3 Updated `src/core/db/kysely/types.ts` — added `origen` comment on `MovimientosBancarios` listing all valid values incl. `CIERRE_CONSOLIDACION`. Also added a matching comment in `src/core/db/powersync/schema.ts` (no prior comment existed there for this column; added for consistency — PowerSync schema has no CHECK constraints so this is documentation-only).
- [x] 1.4 In `src/features/tesoreria/hooks/use-traspasos.ts`: extracted the body of `crearTraspasoSesionATesoreria` into new exported `consolidarMetodoATesoreriaEnTx(tx, {...})` (tx-scoped, does not open its own `writeTransaction`) accepting `destino: { tipo: 'CAJA_FUERTE' | 'BANCO'; id }`. Branches the destino INGRESO insert between `mov_caja_fuerte` (CAJA_FUERTE) and `movimientos_bancarios` (BANCO, new). Redefined `crearTraspasoSesionATesoreria` as a thin `db.writeTransaction(tx => consolidarMetodoATesoreriaEnTx(tx, {...}))` wrapper passing `destino: { tipo: 'CAJA_FUERTE', id: cajaFuerteId }` and `origenDestino: 'TRASPASO'` — existing callers unaffected (see Deviation note below).
- [x] 1.5 In `src/features/contabilidad/hooks/use-gastos.ts`: added `insertarGastoComisionEnTx(tx, {...})` — tx-scoped (no own `writeTransaction`), INSERTs `gastos` (status='REGISTRADO', tipo_impuesto='Exento', porcentaje_iva=0, saldo_pendiente_usd='0.00', cuenta_id=cuentaComisionId), one `gasto_pagos` row (`metodo_cobro_id=NULL` deliberately, `banco_empresa_id` set), `movimientos_bancarios` EGRESO (`origen='GASTO'`) + bank saldo update, then `generarAsientosGasto(tx, {...})` via `cargarMapaCuentas`/`leerMonedaContable`. Does NOT call `crearGasto` (would double-drain `metodos_cobro.saldo_actual`).
- [x] 1.6 Added `CIERRE_CONSOLIDACION` label + color entries to the origen dictionaries in `src/features/tesoreria/components/movimientos-table.tsx`, `src/features/tesoreria/components/reverso-modal.tsx`, and `src/features/bancos/components/conciliacion-bancaria.tsx`.
- [x] 1.7 Verified: `yarn type-check` passes with zero errors in all touched files (pre-existing unrelated failures in `*.test.ts` files and `factura-detalle-cxc.tsx` are untouched by this change — see Verification section). `yarn lint` cannot run: `eslint` is not installed in `node_modules` in this environment (pre-existing, unrelated to this change — see Verification section). `consolidarMetodoATesoreriaEnTx` and `insertarGastoComisionEnTx` are exported, typed, and unused by any caller outside their own module (no unused-export lint errors possible to verify since ESLint itself is unavailable; TypeScript does not flag unused exports by design).

### Remaining Tasks (Phase 2 — PR2, NOT in this batch)

- [ ] 2.1 In `cerrarSesionCaja`, add step 8: batch-SELECT `metodos_cobro` config for methods used in the session.
- [ ] 2.2 Add step 9: loop methods, resolve destino, call `consolidarMetodoATesoreriaEnTx`.
- [ ] 2.3 In the same loop, if `comision_pct > 0`: call `insertarGastoComisionEnTx`.
- [ ] 2.4 Remove the "recuerda depositar" toast in `sesion-caja-form.tsx`.
- [ ] 2.5 Run `yarn type-check` and `yarn lint`.
- [ ] 2.6 Manual verification checklist (5 items, see tasks.md).

### Deviations from Design

1. **`origenDestino` type widened**: design.md's interface for `consolidarMetodoATesoreriaEnTx` specifies `origenDestino: 'DEPOSITO_CIERRE' | 'CIERRE_CONSOLIDACION'`. To satisfy the PR1 requirement of **zero behavior change** for the existing `crearTraspasoSesionATesoreria` (whose original code inserted `origen='TRASPASO'` into `mov_caja_fuerte`, not `'DEPOSITO_CIERRE'`), the union was widened to `'DEPOSITO_CIERRE' | 'CIERRE_CONSOLIDACION' | 'TRASPASO'`. The thin wrapper passes `'TRASPASO'` to preserve the exact original origen value. PR2 will pass `'DEPOSITO_CIERRE'` or `'CIERRE_CONSOLIDACION'` for the new cierre-wiring call sites. This does not affect the migration or any spec requirement — it only affects an internal TS parameter type, and it was necessary to avoid changing the manual POS→Tesorería traspaso's audit trail semantics.
2. **`schema.ts` comment**: task 1.3 said "check for any origen-related comments needing the same update" — none existed in `powersync/schema.ts` prior to this change (only `mov_caja_fuerte.origen` had one, and it already included `DEPOSITO_CIERRE`). Added a new comment on `movimientos_bancarios.origen` there too, purely for documentation consistency with `kysely/types.ts` (PowerSync schema has no CHECK constraints, so this is a no-op for runtime behavior).

### Issues Found

None — implementation matches design.md's Data Flow, Interfaces/Contracts, and Currency Correctness sections exactly (aside from the noted `origenDestino` type widening).

### Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `migrations/0077_cierre_consolidacion_tesoreria.sql` | Created | Idempotent CHECK constraint fixes for `traspasos_tesoreria` (add `SESION_CAJA`) and `movimientos_bancarios` (add `CIERRE_CONSOLIDACION`). |
| `src/features/contabilidad/schemas/cuentas-config-schema.ts` | Modified | Added `COMISION_BANCARIA` clave to `CLAVES_CONFIG`. |
| `src/core/db/kysely/types.ts` | Modified | Added `origen` comment on `MovimientosBancarios` including `CIERRE_CONSOLIDACION`. |
| `src/core/db/powersync/schema.ts` | Modified | Added matching `origen` comment on `movimientos_bancarios` table def (documentation only). |
| `src/features/tesoreria/hooks/use-traspasos.ts` | Modified | Added `consolidarMetodoATesoreriaEnTx` (+ `DestinoConsolidacion` type) and `Transaction` import; refactored `crearTraspasoSesionATesoreria` into a thin wrapper delegating to it. |
| `src/features/contabilidad/hooks/use-gastos.ts` | Modified | Added `insertarGastoComisionEnTx` and `Transaction`/`todayStr` imports. |
| `src/features/tesoreria/components/movimientos-table.tsx` | Modified | Added `CIERRE_CONSOLIDACION` to `ORIGEN_LABELS` and `ORIGEN_COLORS`. |
| `src/features/tesoreria/components/reverso-modal.tsx` | Modified | Added `CIERRE_CONSOLIDACION` to `ORIGEN_LABELS`. |
| `src/features/bancos/components/conciliacion-bancaria.tsx` | Modified | Added `CIERRE_CONSOLIDACION` to `ORIGEN_LABELS`. |

### Verification

- `yarn type-check` (`tsc --noEmit`): completes with errors ONLY in pre-existing test files (`src/features/**/__tests__/*.test.ts`, `src/lib/__tests__/*.test.ts`, `src/features/ventas/schemas/venta-schema.test.ts` — all fail because no test-runner type defs (`jest`/`mocha`/`vitest`) are configured in `tsconfig`, a pre-existing project-wide gap, not introduced by this change) and one pre-existing nullable-check issue in `src/features/cxc/components/factura-detalle-cxc.tsx` (unrelated file, not touched). **Zero errors in any file touched by this change** (verified via targeted grep of the type-check output against the 9 changed/created files).
- `yarn lint`: fails immediately with `'eslint' is not recognized as an internal or external command`. Root cause: `eslint` is not present in `node_modules` at all (confirmed via `find node_modules -iname "*eslint*"` → no results), despite `package.json` defining `"lint": "eslint"`. This is a pre-existing environment/dependency-installation gap unrelated to this change — could not be run or verified as part of this batch.
- No test runner exists in this project (per session config) — no tests were written, per `strict_tdd: false`.

### Workload / PR Boundary

- Mode: chained PR slice (stacked-to-main), PR1 of 2
- Current work unit: Foundation — migration + generalized helpers + config clave + label dicts, NO cierre wiring
- Boundary: Starts from a clean baseline (no prior apply-progress). Ends with `consolidarMetodoATesoreriaEnTx` and `insertarGastoComisionEnTx` exported and typed but not yet called from `cerrarSesionCaja` — zero behavior change to any existing flow. Safe to merge/deploy independently; migration 0077 has independent value (fixes the pre-existing `pos-tesoreria-integration` sync bug for manual POS↔Tesorería traspasos with `SESION_CAJA`).
- Estimated review budget impact: within the ~520-600 total estimate's PR1 share; well under 400 lines for this slice alone.

### Status

7/7 Phase 1 (PR1) tasks complete. Phase 2 (PR2, 6 tasks) remains — depends on PR1 being merged (or branched from) per `stacked-to-main` chain strategy. Ready for orchestrator to commit and open PR1, then launch the next apply batch for Phase 2.
