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
- [x] 1.7 Verified: `yarn type-check` passes with zero errors in all touched files (pre-existing unrelated failures in `*.test.ts` files and `factura-detalle-cxc.tsx` are untouched by this change). `yarn lint` cannot run: `eslint` is not installed in `node_modules` in this environment (pre-existing, unrelated to this change).

### Deviations from Design (PR1)

1. **`origenDestino` type widened**: design.md's interface for `consolidarMetodoATesoreriaEnTx` specifies `origenDestino: 'DEPOSITO_CIERRE' | 'CIERRE_CONSOLIDACION'`. To satisfy the PR1 requirement of **zero behavior change** for the existing `crearTraspasoSesionATesoreria` (whose original code inserted `origen='TRASPASO'` into `mov_caja_fuerte`, not `'DEPOSITO_CIERRE'`), the union was widened to `'DEPOSITO_CIERRE' | 'CIERRE_CONSOLIDACION' | 'TRASPASO'`. The thin wrapper passes `'TRASPASO'` to preserve the exact original origen value. PR2 passes `'DEPOSITO_CIERRE'` or `'CIERRE_CONSOLIDACION'`, always **derived from `destino.tipo` at the call site** (never freely chosen) — see PR2 Deviations below for the review finding this addresses.
2. **`schema.ts` comment**: task 1.3 said "check for any origen-related comments needing the same update" — none existed in `powersync/schema.ts` prior to this change (only `mov_caja_fuerte.origen` had one, and it already included `DEPOSITO_CIERRE`). Added a new comment on `movimientos_bancarios.origen` there too, purely for documentation consistency with `kysely/types.ts`.

### Files Changed (PR1)

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

### Status (PR1)

7/7 Phase 1 (PR1) tasks complete.

---

## Batch: PR2 (Phase 2 — Wiring cierre + cleanup, activates behavior)

**Mode**: Standard (no test runner, `strict_tdd: false`)
**Chain strategy**: stacked-to-main (PR2 of 2, depends on PR1)

### Completed Tasks

- [x] 2.1 In `src/features/caja/hooks/use-sesiones-caja.ts` `cerrarSesionCaja`: added step 8 (batch-SELECT `metodos_cobro` joined to `monedas` for `tipo, banco_empresa_id, caja_fuerte_id, comision_pct, codigo_iso`, for the method IDs collected in a new `consolidacionPorMetodo` map). The map is populated **during the existing step 6 loop** (captures `totalSistemaD`/`monedaId` already computed there per method — no recomputation) rather than re-deriving totals independently, as instructed.
- [x] 2.2 Added step 9: loops `consolidacionPorMetodo` entries with `totalSistemaD > 0` (SAF rows structurally absent — `metodo_cobro_id` is always truthy in this map by construction, defensive filter kept anyway). Resolves `destino`: `tipo === 'EFECTIVO'` → `{ tipo: 'CAJA_FUERTE', id: config.caja_fuerte_id }` (hard-fail with Spanish error if `caja_fuerte_id` is null); otherwise → `{ tipo: 'BANCO', id: config.banco_empresa_id }` (hard-fail with Spanish error if `banco_empresa_id` is null). Calls `consolidarMetodoATesoreriaEnTx(tx, {...})` with `origenDestino` **derived from `destino.tipo`** (`CAJA_FUERTE` → `'DEPOSITO_CIERRE'`, `BANCO` → `'CIERRE_CONSOLIDACION'`) — see Deviations/Review-finding note below.
- [x] 2.3 In the same loop, if `comision_pct > 0` **and** `destino.tipo === 'BANCO'`: resolves `COMISION_BANCARIA` via a single `cargarMapaCuentas(tx, empresaId)` call made once before the loop (not per-iteration), hard-fails (Spanish error) if the clave is unconfigured; computes `montoComisionNativo = totalSistemaD * comisionPct / 100` in the method's native currency; hard-fails if the method's currency is VES/Bs and `tasaDelDia` is missing or `<= 0`; calls `insertarGastoComisionEnTx(tx, {...})`.
- [x] 2.4 Removed the `toast.info('El efectivo reportado debe ser depositado...')` line in `src/features/caja/components/sesion-caja-form.tsx` (`FormCierre.handleSubmit`, right after `toast.success(...)`).
- [x] 2.5 Ran `yarn type-check` — PASS, zero errors in `use-sesiones-caja.ts` or `sesion-caja-form.tsx` (verified via grep of full output against both filenames — no matches). Remaining errors in the output are 100% pre-existing: `*.test.ts` files (no test-runner types configured, same as PR1) and `factura-detalle-cxc.tsx` (unrelated, untouched file). `yarn lint` could not run: `eslint` is not installed in `node_modules` (pre-existing environment gap, unrelated — same as PR1, not fixed per instructions).
- [ ] 2.6 Manual verification checklist — cannot be executed by the apply agent (no test runner, no live Supabase/PowerSync environment). See "MANUAL VERIFICATION CHECKLIST" below for the QA procedure to run post-merge.

### Deviations from Design (PR2)

1. **Review finding W1 addressed — `origenDestino` always derived, never passed independently**: the orchestrator prompt flagged a risk from PR1's design where a caller could pass a mismatched `(destino.tipo, origenDestino)` pair (e.g. `BANCO` + `DEPOSITO_CIERRE`), which would insert locally but fail Supabase sync with a `23514` CHECK violation (only `CAJA_FUERTE` rows in `mov_caja_fuerte` are constrained to `DEPOSITO_CIERRE`; only `BANCO` rows in `movimientos_bancarios` are constrained to `CIERRE_CONSOLIDACION`). Rather than modifying `consolidarMetodoATesoreriaEnTx`'s signature (which would also affect the PR1 `crearTraspasoSesionATesoreria` wrapper and its `'TRASPASO'` origen), the fix was applied **at the PR2 call site only**: `const origenDestino = destino.tipo === 'CAJA_FUERTE' ? 'DEPOSITO_CIERRE' : 'CIERRE_CONSOLIDACION'` is computed directly from the `destino` object that was just constructed two branches above — it is structurally impossible for these two values to diverge in this call site. This is a lower-risk fix than touching the shared tx-helper's contract.
2. **`metodos_cobro.caja_fuerte_id` is the sole source of truth for EFECTIVO destino resolution** (not a `moneda_id` JOIN against `caja_fuerte`): the design's phrase "caja_fuerte by moneda_id" was interpreted as *how the admin configures it* (a separate EFECTIVO-USD `metodos_cobro` row and a separate EFECTIVO-VES row, each with its own `caja_fuerte_id` already pointing at the correct-currency caja fuerte — confirmed via `src/core/db/powersync/schema.ts` line 201 `metodos_cobro.caja_fuerte_id` and `src/features/configuracion/hooks/use-payment-methods.ts` which lets admins set this field per method), not as an additional runtime JOIN. This is simpler, avoids assuming exactly one caja fuerte per moneda_id exists, and matches "EFECTIVO+USD → USD caja fuerte; EFECTIVO+VES → Bs caja fuerte" from the routing instructions exactly, since that pairing is what the admin already configured on the method itself.
3. **Commission logic gated on `destino.tipo === 'BANCO'`**: the orchestrator prompt's instruction says "if `comision_pct > 0` for a bank-routed method, ALSO call `insertarGastoComisionEnTx`" — read literally as bank-routed only. `insertarGastoComisionEnTx` requires a real `bancoEmpresaId` for its EGRESO-bancario leg; calling it with a caja-fuerte id would be a type/logic error. Design's edge-case table also frames commission as inherently bank-routed ("Commission but no `banco_empresa_id`" is the only commission-related edge case listed). If an EFECTIVO method somehow has `comision_pct > 0` configured, this batch silently skips the commission step for it rather than hard-failing — no scenario in specs/design covers this combination, and hard-failing on a value the admin might have left at a non-zero default on a cash method seemed more likely to block cierre than protect data integrity. Flagged here for user review; trivial to change to a hard-fail if the business actually wants that guarded.
4. **`cargarMapaCuentas` called once before the loop, not once per method inside it**: minor efficiency choice, not a design deviation — the design's data flow describes resolving `COMISION_BANCARIA` "if comision_pct > 0" per method, but nothing requires re-querying the full cuentas_config map on every iteration when multiple commission-bearing methods exist in the same cierre.

### Issues Found (PR2)

None — implementation satisfies design.md's Data Flow (steps 8-9), Interfaces/Contracts, Currency Correctness, and Edge Cases sections, plus the orchestrator's explicit W1 fix instruction.

### Files Changed (PR2)

| File | Action | What Was Done |
|------|--------|----------------|
| `src/features/caja/hooks/use-sesiones-caja.ts` | Modified | Added imports for `consolidarMetodoATesoreriaEnTx`, `DestinoConsolidacion`, `insertarGastoComisionEnTx`, `cargarMapaCuentas`. In `cerrarSesionCaja`: added `consolidacionPorMetodo` map populated inside the existing step-6 loop; added steps 8-9 (batch metodo config SELECT + consolidation/commission loop) after the step-7 SAF snapshot block, inside the same `writeTransaction`. |
| `src/features/caja/components/sesion-caja-form.tsx` | Modified | Removed the redundant "recuerda depositar" `toast.info(...)` call in `FormCierre.handleSubmit` (deposits are now automatic via the new consolidation step). |

### Verification (PR2)

- `yarn type-check` (`tsc --noEmit`): completes with errors ONLY in the same pre-existing files as PR1's baseline (`src/features/**/__tests__/*.test.ts`, `src/lib/__tests__/*.test.ts`, `src/features/ventas/schemas/venta-schema.test.ts` — missing test-runner type defs; `src/features/cxc/components/factura-detalle-cxc.tsx` — pre-existing nullable-check issue, untouched file). **Zero errors in `use-sesiones-caja.ts` or `sesion-caja-form.tsx`** (verified via targeted grep of the full type-check output against both filenames — no matches).
- `yarn lint`: fails immediately — `eslint` is not present in `node_modules` (confirmed pre-existing, same root cause as PR1; per instructions this was reported, not fixed).
- No test runner exists in this project (per session config) — no tests were written, per `strict_tdd: false`.

### MANUAL VERIFICATION CHECKLIST (PR2 — no test runner, run against a live app + Supabase)

**a) Happy path — mixed methods with commission**
1. Configure at least: one EFECTIVO USD método (`caja_fuerte_id` = a USD caja fuerte), one EFECTIVO VES método (`caja_fuerte_id` = a Bs caja fuerte), and one bank-routed método (e.g. PUNTO/TARJETA) with `banco_empresa_id` set and `comision_pct > 0`. Configure `COMISION_BANCARIA` in Contabilidad > Cuentas de Configuración.
2. Open a session, register sales/payments in each of the three methods, then close the session (cuadre) with a valid `tasaDelDia`.
3. Confirm: a `mov_caja_fuerte` INGRESO row per EFECTIVO currency (`origen='DEPOSITO_CIERRE'`, `validado=0`); a `movimientos_bancarios` INGRESO row for the bank method's gross total (`origen='CIERRE_CONSOLIDACION'`, `validado=0`) AND a `movimientos_bancarios` EGRESO row for the commission (`origen='GASTO'`); a `gastos` row against the `COMISION_BANCARIA` account with correct native-currency amount, `monto_usd`, and `tasa`; `traspasos_tesoreria` rows for each consolidated method tagged with `cuenta_origen_tipo='SESION_CAJA'` and `sesion_caja_id`; each consolidated `metodos_cobro.saldo_actual` drained to (approximately) zero for this session's contribution (EGRESO `movimientos_metodo_cobro`, `origen='EGRESO_TESORERIA'`).

**b) Hard-fail — missing destino**
1. Use (or misconfigure) a non-EFECTIVO método with `banco_empresa_id = NULL`, register a payment on it in an open session.
2. Attempt to close the session.
3. Confirm: the cierre throws a Spanish error naming the missing bank config; `sesiones_caja.status` remains `ABIERTA`; no `sesiones_caja_detalle`, `traspasos_tesoreria`, `mov_caja_fuerte`, or `movimientos_bancarios` rows were created/left behind for this cierre attempt (whole transaction rolled back).

**c) Hard-fail — commission account unconfigured**
1. Use a bank-routed método with `comision_pct > 0`, but remove/never configure the `COMISION_BANCARIA` clave in `cuentas_config`.
2. Attempt to close the session.
3. Confirm: the cierre throws a Spanish error naming the missing `COMISION_BANCARIA` config; session stays `ABIERTA`; no partial rows (including no `consolidarMetodoATesoreriaEnTx` side effects) persisted — since the commission check runs per method in the same loop after the consolidation call for THAT method, verify the whole transaction (including prior methods' consolidation already run in the same loop iteration set) rolls back atomically.

**d) Skips**
1. Confirm a session with a SAF (`saldo a favor`) virtual row (`metodo_cobro_id IS NULL` in `sesiones_caja_detalle`) does not attempt consolidation for that row (it's structurally absent from `consolidacionPorMetodo`).
2. Confirm a método used in the session with `totalSistemaD <= 0` (e.g. fully offset by manual egresos) is skipped — no consolidation attempt, no error.
3. Confirm `is_reversed` payments are excluded from `totalSistemaD` (already handled upstream by the existing `metodosUsadosResult` query — unchanged by this batch).

**e) Toast removal**
1. Confirm the "El efectivo reportado debe ser depositado..." toast no longer appears after a successful cierre.

**f) Migration precondition (cross-check with PR1)**
1. Confirm migration `0077` was applied in Supabase before this PR2 code is deployed to any environment with live sync — otherwise every consolidated cierre's `SESION_CAJA`-origin `traspasos_tesoreria` row will fail to sync with a `23514` CHECK violation.

### Status (PR2)

5/6 Phase 2 (PR2) tasks complete (2.1-2.5 done; 2.6 is a manual QA checklist for the user/QA team — cannot be executed by the apply agent). Both PR1 and PR2 implementation work for `cierre-consolidacion-tesoreria` is now complete: 12/13 total tasks across both phases (only the manual QA checklist item remains, by design).
