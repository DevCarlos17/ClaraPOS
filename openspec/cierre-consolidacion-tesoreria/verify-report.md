# Verification Report

**Change**: cierre-consolidacion-tesoreria
**Version**: N/A (no versioned spec registry)
**Mode**: Standard (no test runner; `strict_tdd: false`)

## 0. Scope of Verification

No test runner (vitest/jest) and no ESLint exist in this project. Verification consists of:
1. `yarn type-check` (TypeScript compiler, zero-emit) — objective, executed.
2. Static traceability: every spec requirement/scenario mapped to implementing file:line — objective, executed via source reading.
3. A manual QA checklist for runtime behavior — **NOT executed by this report**. No scenario below is claimed to "pass at runtime." Everything under "Spec Compliance Matrix" is marked `VERIFIED-STATIC` (code exists and is structurally correct per reading) or `UNTESTED-AT-RUNTIME` (requires a live app + Supabase + PowerSync sync to actually confirm). Do not treat this report as proof of runtime correctness.

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 13 |
| Tasks complete | 12 |
| Tasks incomplete | 1 (2.6 — manual QA checklist; explicitly out of scope for an automated agent, by design) |

---

### Build & Type-Check Execution

**Build**: not run (no `yarn build` requested; type-check is the agreed proxy per design.md §Verification)

**Type-check**: ✅ Passed for every file touched by this change
```text
$ yarn type-check  (tsc --noEmit)
308 total errors in the full repo output, ALL in files NOT touched by this change:
  - src/lib/__tests__/*.test.ts (identity.test.ts, utils.test.ts, currency.test.ts, dates.test.ts)
  - src/features/**/__tests__/*.test.ts (cliente-schema, tasa-schema, producto-schema)
  - src/features/ventas/schemas/venta-schema.test.ts
  - src/features/cxc/components/factura-detalle-cxc.tsx
  - src/features/configuracion/components/banco-form.tsx (unused import)
  - src/features/citas/components/calendario/calendario-citas.tsx (FullCalendar overload)

Confirmed via `git show --stat bba3b2d` and `git show --stat 4f65cb5`: none of the
7 distinct error-producing files above appear in either commit's changed-file list.
Root cause of the *.test.ts errors: no @types/jest or @types/mocha installed — a
pre-existing gap unrelated to this change (consistent with apply-progress.md's own
PR1/PR2 findings).

Zero errors in the 9 files this change touches:
  migrations/0077_cierre_consolidacion_tesoreria.sql (not TS, N/A)
  src/features/tesoreria/hooks/use-traspasos.ts
  src/features/contabilidad/hooks/use-gastos.ts
  src/features/contabilidad/schemas/cuentas-config-schema.ts
  src/features/caja/hooks/use-sesiones-caja.ts
  src/features/caja/components/sesion-caja-form.tsx
  src/features/reportes/components/cuadre-page.tsx
  src/features/tesoreria/components/movimientos-table.tsx
  src/features/tesoreria/components/reverso-modal.tsx
  src/features/bancos/components/conciliacion-bancaria.tsx
  src/core/db/kysely/types.ts
  src/core/db/powersync/schema.ts
```

**Tests**: ➖ Not available — no test runner installed in this project.

**Lint**: ➖ Not available — `eslint` not installed in `node_modules` (confirmed pre-existing gap, same as reported in tasks.md/apply-progress.md).

**Coverage**: ➖ Not available.

---

### Spec Compliance Matrix

Legend: ✅ `VERIFIED-STATIC` = code exists, structurally matches the requirement, type-checks clean. ⚠️ `UNTESTED-AT-RUNTIME` = cannot be confirmed without a live app/Supabase — added to every row as a qualifier since no runner exists. ❌ `NOT IMPLEMENTED` = no evidence found.

#### Capability: `tesoreria-consolidacion-cierre`

| Requirement | Scenario | Evidence (file:line) | Result |
|---|---|---|---|
| Routing per payment method | Mixed cierre — efectivo USD + efectivo Bs + commission POS | `use-sesiones-caja.ts:1044-1076` (destino resolution: EFECTIVO→caja_fuerte, else→banco); `use-traspasos.ts:700-771` (INGRESO validado=0 per destino.tipo); `use-traspasos.ts:774-799` (traspasos_tesoreria row, cuenta_origen_tipo='SESION_CAJA') | ✅ VERIFIED-STATIC / ⚠️ UNTESTED-AT-RUNTIME |
| Routing per payment method | SAF and zero-total methods skipped | `use-sesiones-caja.ts:990-992` (`metodosParaConsolidar` filters `metodoCobroId &&  v.totalSistemaD.gt(0)`); SAF rows are inserted separately at step 7 (`metodo_cobro_id=NULL`, line 973) and are structurally absent from `consolidacionPorMetodo` (only populated from `metodosUsadosResult`, which itself joins `pagos.metodo_cobro_id`, never NULL) | ✅ VERIFIED-STATIC / ⚠️ UNTESTED-AT-RUNTIME |
| Routing per payment method | Reversed payments already excluded | `use-sesiones-caja.ts:859` (`WHERE p.sesion_caja_id = ? AND COALESCE(p.is_reversed, 0) = 0` in the step-6 query that feeds `consolidacionPorMetodo`) — upstream, unchanged by this PR | ✅ VERIFIED-STATIC (pre-existing logic, correctly inherited) |
| Commission booked as gasto (Option A2) | Commission gasto created with correct currency | `use-sesiones-caja.ts:1129` (`montoComisionNativo = totalSistemaD.times(comisionPct).dividedBy(100)`, native currency); `use-gastos.ts:527-529` (`comisionUsd = monedaCodigo==='VES' ? bsToUsd(...) : montoNativo`); `use-gastos.ts:560-581` (INSERT gastos: `tipo_impuesto='Exento'`, `porcentaje_iva=0`, `tasa=p.tasa.toFixed(4)`) | ✅ VERIFIED-STATIC / ⚠️ UNTESTED-AT-RUNTIME |
| Commission booked as gasto (Option A2) | Missing COMISION_BANCARIA hard-fails | `use-sesiones-caja.ts:1112-1120` (`if (!cuentaComisionId) throw new Error(...)`, method-named, before any gasto insert) | ✅ VERIFIED-STATIC / ⚠️ UNTESTED-AT-RUNTIME |
| Hard-fail on missing destination, atomic rollback | Method without destination aborts whole cierre | `use-sesiones-caja.ts:1045-1049` (EFECTIVO, no `caja_fuerte_id`) and `:1061-1066` (other, no `banco_empresa_id`) both `throw new Error` naming `nombreMetodo`, inside the single `db.writeTransaction` (line 677) — a thrown error inside a PowerSync `writeTransaction` callback rolls back the entire transaction (framework contract; not independently re-verified with a live DB in this pass) | ✅ VERIFIED-STATIC / ⚠️ UNTESTED-AT-RUNTIME (rollback behavior requires PowerSync runtime) |
| Pending records visible in Tesorería | Consolidated movement appears as pendiente | `use-traspasos.ts:761` / `:726` (`validado=0` hardcoded on every consolidation-created row); no new UI added — reuses existing `useTraspasos`/pending views (design.md confirms "no new UI") | ✅ VERIFIED-STATIC / ⚠️ UNTESTED-AT-RUNTIME (requires opening the existing Tesorería pending view against a real synced DB) |
| Migration 0077 enables SESION_CAJA transfers | Migration idempotent, SESION_CAJA syncs cleanly | `migrations/0077_cierre_consolidacion_tesoreria.sql:15-26` (`DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`, 0073/0027 idempotent pattern, adds `'SESION_CAJA'` to both traspasos_tesoreria CHECKs and `'CIERRE_CONSOLIDACION'` to movimientos_bancarios CHECK) | ✅ VERIFIED-STATIC (SQL correctness) / ⚠️ UNTESTED-AT-RUNTIME (must be **applied to the live Supabase instance** — this migration has NOT been run against a real database as part of this verification; local SQLite/PowerSync has no CHECK constraints so this only surfaces on Supabase sync) |

#### Capability: `caja` (delta)

| Requirement | Scenario | Evidence (file:line) | Result |
|---|---|---|---|
| cerrarSesionCaja triggers Tesorería consolidation atomically | Successful cierre also consolidates to Tesorería | `use-sesiones-caja.ts:677` (single `db.writeTransaction`), steps 8-9 at lines 985-1145 execute strictly after step 7 (SAF, line 948) and before the transaction closes (line 1146) — no nested `writeTransaction` opened (confirmed: `consolidarMetodoATesoreriaEnTx` and `insertarGastoComisionEnTx` both take `tx: Transaction` as first param, no internal `db.writeTransaction` calls) | ✅ VERIFIED-STATIC / ⚠️ UNTESTED-AT-RUNTIME |
| cerrarSesionCaja triggers Tesorería consolidation atomically | Consolidation failure blocks the whole cierre | Same single-transaction structure as above — any `throw` inside steps 1-9 (including the step-5 `UPDATE sesiones_caja SET status='CERRADA'` at line 814, which runs BEFORE steps 8-9) is rolled back together by PowerSync's transaction semantics if steps 8-9 throw after it | ✅ VERIFIED-STATIC (structural) / ⚠️ UNTESTED-AT-RUNTIME (rollback-including-earlier-writes-in-same-tx requires live DB proof) |
| Mensaje informativo de depósito — MODIFIED (no reminder toast) | Successful cierre shows no deposit reminder | `sesion-caja-form.tsx`: only 2 `toast.*` calls remain in the file (line 89 open-success, line 483 close-success); the prior "recuerda depositar" `toast.info(...)` is absent (confirmed via grep — no `toast.info` match anywhere in the file) | ✅ VERIFIED-STATIC / ⚠️ UNTESTED-AT-RUNTIME (visual confirmation needed) |
| Mensaje informativo de depósito — MODIFIED | Failed cierre still shows no reminder (unchanged) | No reminder toast existed on the failure path before or after this change (only `sesion-caja-form.tsx:483` success path had it, now removed) — unaffected by this diff | ✅ VERIFIED-STATIC |

**Compliance summary**: 13/13 scenarios have static implementing evidence. 0 are marked NOT IMPLEMENTED. All 13 remain formally UNTESTED-AT-RUNTIME because no test runner or live environment was exercised in this pass — this is expected and disclosed per session config, not a defect.

---

### Design Coherence

| Decision | Followed? | Evidence |
|---|---|---|
| Option A2 — commission booked as real `gastos` row, not netted silently | ✅ Yes | `use-gastos.ts:505-645` (`insertarGastoComisionEnTx`); called only when `comisionPct.gt(0) && destino.tipo === 'BANCO'` (`use-sesiones-caja.ts:1112`) |
| `CIERRE_CONSOLIDACION` new origen value (not reusing `DEPOSITO_CAJA`) | ✅ Yes | `migrations/0077...sql:24-26`; label dicts in `movimientos-table.tsx:37,49`, `reverso-modal.tsx:32`, `conciliacion-bancaria.tsx:22` |
| `COMISION_BANCARIA` as tenant-configurable `cuentas_config` clave, hard-fail if missing (no auto-create) | ✅ Yes | `cuentas-config-schema.ts:31`; `use-sesiones-caja.ts:1113-1120` throws, never fabricates an account |
| No special-casing of `deposito_directo` | ✅ Yes | No `deposito_directo` reference anywhere in the PR2 diff or `use-sesiones-caja.ts` step 8-9 code — matches design's explicit "no special-casing" decision and documented TODO flag |
| Nesting-safety: `consolidarMetodoATesoreriaEnTx` refactor, thin wrapper preserved | ✅ Yes | `use-traspasos.ts:618-799` (tx-scoped body) + `:808-831` (`crearTraspasoSesionATesoreria` thin `db.writeTransaction` wrapper, unchanged external behavior — passes `origenDestino:'TRASPASO'`) |
| Atomic single-transaction, hard-fail semantics | ✅ Yes | Single `db.writeTransaction` in `cerrarSesionCaja` (`use-sesiones-caja.ts:677`); every failure path is a synchronous `throw` before any commit |
| Origen derivation from `destino.tipo` (never independently choosable) — this is the explicit W1 review fix | ✅ Yes | `use-sesiones-caja.ts:1087`: `const origenDestino = destino.tipo === 'CAJA_FUERTE' ? 'DEPOSITO_CIERRE' : 'CIERRE_CONSOLIDACION'` — computed inline from the just-built `destino`, structurally impossible to diverge at this call site |
| Native-currency handling (commission math, session `tasaDelDia`) | ✅ Yes | `use-sesiones-caja.ts:1122-1129` (moneda_codigo-gated tasa hard-fail + native monto calc); `use-gastos.ts:527-529` (`bsToUsd` used, never a raw multiply) |
| Design deviation: EFECTIVO destino resolved via `metodos_cobro.caja_fuerte_id` directly, not a `moneda_id` JOIN against `caja_fuerte` | ⚠️ Documented deviation, low-risk | `use-sesiones-caja.ts:1044-1059` — reads `caja_fuerte_id` from the method config, then separately re-validates that caja fuerte's own `moneda_id` matches the method's `moneda_id` (line 1080, the W4 fix) — functionally equivalent, arguably safer (explicit mismatch check rather than implicit JOIN assumption) |

---

### Traceability of Adversarial Review Fixes

| Fix | Present? | Evidence |
|---|---|---|
| **C1** — `skipSaldoCheck`: `metodos_cobro.saldo_actual` does not include regular ventas payments, so the pre-existing saldo-sufficiency guard is invalid for the cierre path | ✅ Yes | `use-traspasos.ts:641,661,669,692` (`skipSaldoCheck?: boolean` param; guard `if (!p.skipSaldoCheck && montoNum > saldoMetodoAnt + 0.001) throw`; balance mutation skipped when true); called with `skipSaldoCheck: true` at `use-sesiones-caja.ts:1098`. Root-cause confirmed independently: `use-ventas.ts:1308` comment states "saldo_actual en metodos_cobro no incluye apertura ni ventas regulares" |
| **C2 (native-currency total)** — `totalSistemaD` computed in the method's native currency instead of always-USD (was previously subvaluing Bs methods by ~tasa factor) | ✅ Yes | `use-sesiones-caja.ts:849-854`: `CASE WHEN mo.codigo_iso = 'USD' THEN CAST(p.monto_usd AS REAL) ELSE CAST(p.monto AS REAL) END` — replaces an always-USD sum; comment at line 845-847 documents the bug this fixes |
| **W2 (moneda-aware diferencia display)** | ✅ Present in this PR's diff, but sits on a **pre-existing broken query** (see Residual Risks §1 — CRITICAL) | `cuadre-page.tsx:1693-1695`: `d.moneda === 'BS' ? formatBs(dif) : formatUsd(dif)` (confirmed via `git show 4f65cb5` diff — this exact 1-line-to-3-line change is in the commit). However the feeding query at `cuadre-page.tsx:1534` selects `mc.moneda`, and `metodos_cobro` has **no `moneda` column** (only `moneda_id` — confirmed against `migrations/0005_caja_tesoreria.sql:37-51` and `schema.ts:182-204`, unchanged since introduction on 2026-05-07, commit `d5debc1`). This is NOT a regression from PR1/PR2 — it predates this change — but it means `d.moneda` will always be `undefined` at runtime, so the new moneda-aware branch silently always falls to `formatUsd`, and worse, the query itself may throw "no such column: mc.moneda" against Supabase/Postgres (SQLite's typing may or may not accept it depending on PowerSync's local schema — needs runtime confirmation either way) |
| **W3 (method-named errors)** | ✅ Yes | Every hard-fail `throw` in the step 9 loop interpolates `nombreMetodo` (`use-sesiones-caja.ts:1047,1057,1063,1073,1082,1116,1125`) |
| **W4 (destino currency validation)** | ✅ Yes | `use-sesiones-caja.ts:1080-1085`: `if (destinoMonedaId !== config.moneda_id) throw new Error(...)` — reads the resolved destino's own `moneda_id` (from `caja_fuerte`/`bancos_empresa`) and compares against the method's configured `moneda_id` before consolidating |
| **W5 (efectivo-commission warn, not silent)** | ✅ Yes | `use-sesiones-caja.ts:1104-1111`: `console.warn(...)` when `comisionPct.gt(0) && destino.tipo !== 'BANCO'` — commission ignored for EFECTIVO methods but logged, matching the documented deviation rationale in apply-progress.md |
| **empresa_id filter on method-config batch SELECT** | ✅ Yes | `use-sesiones-caja.ts:1004`: `WHERE mc.id IN (${inPhConsolidar}) AND mc.empresa_id = ?` — multi-tenant isolation preserved (CLAUDE.md rule #11) |

All fixes named in the orchestrator brief are present in the committed code with direct line evidence. One (W2) has a caveat: the display fix is correctly written but the data path feeding it appears broken by a pre-existing, unrelated bug — flagged below as CRITICAL for the user's awareness, not attributed to this change's authors.

---

### Issues Found

**CRITICAL**:
1. **`cuadre-page.tsx:1534` selects `mc.moneda`, a column that does not exist on `metodos_cobro`** (only `moneda_id` exists — confirmed in `migrations/0005_caja_tesoreria.sql` and `schema.ts`). This is a **pre-existing bug from 2026-05-07** (commit `d5debc1`), NOT introduced by PR1/PR2, but it directly undermines the W2 fix's runtime effect: the `ResumenSesionCerradaModal`'s "Detalle por metodo" query may either (a) error against Postgres/Supabase-backed PowerSync sync validation, or (b) silently return `moneda: undefined` for every row against local SQLite (PowerSync/wa-sqlite is often permissive about unknown column references in some drivers — this needs a live-app check, not assumed). Either way, the moneda-aware `formatBs`/`formatUsd` branch this PR added at line 1693-1695 will not behave as intended until this pre-existing bug is fixed (likely should read `mo.codigo_iso` via a `JOIN monedas mo ON mc.moneda_id = mo.id`, mirroring the pattern already used correctly elsewhere in the same file, e.g. `use-sesiones-caja.ts:849-858`). **Recommend filing this as a separate bug/change** — it is out of scope for `cierre-consolidacion-tesoreria` to fix, but must be flagged now since it directly affects manual QA item (b) in this same report.

**WARNING**:
1. Migration 0077 has **not been applied to the live Supabase database** as part of this verification pass — this was explicitly out of scope (static-only verification). Per tasks.md's "Migration-apply ordering (critical)" note, every consolidated cierre will fail to sync (`23514`) with a `SESION_CAJA`-typed `traspasos_tesoreria` row until this migration runs in Supabase. This blocks ALL of the manual QA checklist below until resolved.
2. Concurrent-close race on `caja_fuerte.saldo_actual` / `bancos_empresa.saldo_actual` (read-then-write, no row locking) — explicitly documented as pre-existing and out of scope in design.md's Edge Cases table. Not a regression, but a known gap that becomes more consequential now that cierre auto-writes to these balances on every session close.
3. `insertarGastoComisionEnTx`'s EGRESO-bancario leg (`use-gastos.ts:594-624`) does not itself validate that `saldoBancoNuevo` doesn't go negative — it nets the gross deposit that `consolidarMetodoATesoreriaEnTx` just credited moments earlier in the same transaction, so under normal conditions it cannot go negative for THIS specific flow, but there is no explicit assertion; worth a defensive check if this helper is ever reused elsewhere.
4. `use-gastos.ts:513` (`insertarGastoComisionEnTx`'s `tasa` param) is typed `number`, and the caller passes `tasaDelDia ?? 0`, which is then validated inside as `if (p.tasa <= 0) throw` (`use-gastos.ts:520`) — correct, but means a caller could theoretically pass a negative tasa and only the `<=0` guard catches it (fine, just noting the guard is the sole line of defense — no upstream validation of `tasaDelDia`'s sign before this point).

**SUGGESTION**:
1. Consider adding a lightweight assertion/comment in `consolidarMetodoATesoreriaEnTx` documenting that `skipSaldoCheck` should ONLY ever be set by `cerrarSesionCaja` — currently enforced by convention (only one call site sets it), not by type-level restriction (e.g., a distinct internal-only export). Low risk today since it's a single call site, but worth hardening if more callers are added later.
2. The `Deviation #3` in apply-progress.md (commission gated on `destino.tipo === 'BANCO'`, silently skipped+warned for EFECTIVO with `comision_pct>0`) is a reasonable interpretation but was explicitly flagged by the implementer as "trivial to change to a hard-fail if the business actually wants that guarded" — worth a product decision, not a code defect.

---

## Manual QA Checklist (execute against a live app + Supabase — NOT run by this verification)

**Precondition (blocking)**: Apply migration `0077_cierre_consolidacion_tesoreria.sql` to the target Supabase instance BEFORE running any of the following. Without it, every `SESION_CAJA`-typed `traspasos_tesoreria` sync will fail with Postgres error `23514`.

### a) Happy path — mixed methods with commission
1. Configure: one EFECTIVO USD método (`caja_fuerte_id` → a USD caja fuerte), one EFECTIVO VES método (`caja_fuerte_id` → a Bs caja fuerte), one bank-routed método (PUNTO/TARJETA) with `banco_empresa_id` set and `comision_pct > 0`. Configure the `COMISION_BANCARIA` clave in Contabilidad > Cuentas de Configuración.
2. Open a session, register sales/payments across all three methods, then close the session with a valid `tasaDelDia`.
3. Confirm in the DB (or via existing Tesorería/Contabilidad views):
   - A `mov_caja_fuerte` INGRESO row per EFECTIVO currency: `origen='DEPOSITO_CIERRE'`, `validado=0`.
   - A `movimientos_bancarios` INGRESO row for the bank method's **gross** total: `origen='CIERRE_CONSOLIDACION'`, `validado=0`.
   - A `movimientos_bancarios` EGRESO row for the commission: `origen='GASTO'`.
   - A `gastos` row against the `COMISION_BANCARIA` account: correct native-currency amount, correct `monto_usd` (via `bsToUsd` if Bs), correct `tasa`.
   - `traspasos_tesoreria` rows for each consolidated method: `cuenta_origen_tipo='SESION_CAJA'`, `sesion_caja_id` populated.
   - **Verify Bs amounts are NOT understated** — confirm the VES method's `total_sistema` in `sesiones_caja_detalle` and the consolidated `mov_caja_fuerte`/`traspasos_tesoreria` amounts reflect the native Bs total, not a USD-converted (and therefore ~tasa-times-smaller) figure. This directly tests the C2 fix.

### b) Diferencia display (moneda-aware) — ⚠️ pre-existing bug may block this
1. Open the "Resumen de Sesión Cerrada" modal (cuadre-page.tsx) for the session closed in (a).
2. Check the "Detalle por método" table's "Dif." column for the EFECTIVO VES row.
3. **Expected** (if the pre-existing `mc.moneda` bug is fixed first, or coincidentally doesn't break the query): the Bs difference should render via `formatBs` (e.g. "Bs 1.234,56"), not `formatUsd` (e.g. "$1,234.56").
4. **If it renders in USD/breaks/shows blank**: this is the CRITICAL pre-existing issue documented above (`mc.moneda` does not exist) — file it as a separate bug, it is not this change's regression.

### c) Hard-fail — missing destino
1. Use a non-EFECTIVO método with `banco_empresa_id = NULL`, register a payment on it in an open session.
2. Attempt to close the session.
3. Confirm: cierre throws a Spanish error **naming the método**; `sesiones_caja.status` remains `ABIERTA`; NO `sesiones_caja_detalle`, `traspasos_tesoreria`, `mov_caja_fuerte`, or `movimientos_bancarios` rows persisted for this attempt.

### d) Hard-fail — commission account unconfigured
1. Use a bank-routed método with `comision_pct > 0`, but do NOT configure `COMISION_BANCARIA`.
2. Attempt to close the session.
3. Confirm: cierre throws naming the método and the missing config; session stays `ABIERTA`; no partial rows (including the same method's own consolidation call, which ran just before the commission check in the same loop iteration) persisted — full transaction rollback.

### e) Hard-fail — destino currency mismatch
1. Misconfigure a método's destino (e.g., an EFECTIVO-VES método pointing at a USD caja fuerte).
2. Attempt to close a session using that method.
3. Confirm: cierre throws, naming the método, before any writes for that method.

### f) Skips
1. Confirm a session with a SAF row (`metodo_cobro_id IS NULL` in `sesiones_caja_detalle`) does not attempt consolidation for it.
2. Confirm a método used with `totalSistemaD <= 0` is skipped silently (no error, no rows).
3. Confirm `is_reversed` payments are excluded from the consolidated total (already handled upstream, unchanged by this PR).

### g) Toast removal
1. Confirm the "El efectivo reportado debe ser depositado..." toast no longer appears after a successful cierre — only the existing success toast should show.

### h) Sync precondition confirmation
1. Confirm migration `0077` is applied in Supabase.
2. Confirm a `SESION_CAJA`-origin `traspasos_tesoreria` row created by this feature (or by the pre-existing manual POS↔Tesorería traspaso flow) **actually syncs to Supabase without a `23514` error** — this also confirms the pre-existing sync bug (unrelated to this feature, present since the `sesion_caja_id` column was added in migration 0072) is now fixed as a side effect of 0077.

---

### Verdict

**PASS WITH WARNINGS**

Type-check is clean across every file this change touches (zero regressions; all 308 pre-existing errors are in untouched test files and 2 unrelated components). Every spec requirement and scenario across both delta specs has direct, traceable static implementation evidence, and every named adversarial-review fix (C1, C2, W1, W3, W4, W5) is confirmed present with exact file:line citations. W2 (moneda-aware display) is correctly coded but rides on top of a pre-existing, out-of-scope query bug (`mc.moneda` does not exist) that should be fixed separately and will otherwise make manual QA item (b) fail or behave unexpectedly. No runtime scenario has been executed — the manual QA checklist above is mandatory before this change can be considered production-verified, and migration 0077 must be applied to Supabase first.

---

## Addendum: Post-Merge Hotfix — "Opcion 1" (uncommitted at time of this review)

**Trigger**: Live QA on PR2 surfaced exactly the risk the previous verdict flagged as UNTESTED-AT-RUNTIME: `fn_validate_sesion_abierta` (migration 0041) rejected the consolidation's `movimientos_metodo_cobro` EGRESO inserts on Supabase with `P0001`, because the old step order ran `UPDATE sesiones_caja SET status='CERRADA'` (old step 5) *before* the consolidation loop (steps 8-9) in the same `writeTransaction`.

**Fix reviewed**: `src/features/caja/hooks/use-sesiones-caja.ts` — the `UPDATE sesiones_caja` (steps 6-9's former step 5) was moved to be the **last** write of `cerrarSesionCaja`'s single `writeTransaction` (new step 10, lines 1125-1157), executing strictly after the consolidation loop (steps 8-9, lines 963-1123). Diff is uncommitted (`git diff` against `src/features/caja/hooks/use-sesiones-caja.ts`).

### Adversarial checks performed

| # | Check | Result |
|---|---|---|
| 1 | Do steps 6-9 (sesiones_caja_detalle populate, SAF snapshot, consolidation) depend on `sesiones_caja.status` already being `CERRADA`? | ✅ No — `status` is read exactly once, at step 1 (line 696-698), guarded by a throw if not `ABIERTA`. No later SELECT/INSERT in steps 6-9 references `sesiones_caja.status`. |
| 2 | Are `montoSistemaUsd`, `montoFisicoUsdD`, `diferenciaUsd`, `montoSistemaBs`, `montoFisicoBsD`, `diferenciaBs`, `observaciones_cierre`, `usuario_cierre_id`, `now`, `id` still in scope and unmutated at the relocated UPDATE (lines 1130-1157)? | ✅ Yes — all `const`, declared lines 663-675/801-811, never reassigned. |
| 3 | Is `movimientos_metodo_cobro` the *only* table inserted in steps 6-9 that is guarded by `fn_validate_sesion_abierta`? | ✅ Confirmed. Migration grep across the whole `migrations/` dir shows the trigger is attached ONLY to `movimientos_metodo_cobro` (0041:99-102) and `pagos` (0041:105-108). Every other insert touched by steps 6-9/consolidation (`sesiones_caja_detalle`, `mov_caja_fuerte`, `movimientos_bancarios`, `traspasos_tesoreria`, `gastos`, `gasto_pagos`, `libro_contable` via `use-traspasos.ts:618-799` and `use-gastos.ts:505-644`) has no such trigger. |
| 4 | Is the flip still inside the same `db.writeTransaction`, with no early return/silent skip between consolidation and the flip? | ✅ Yes — single `writeTransaction` opened at line 677, closed at line 1158; the new step 10 (1125-1157) is the last statement before `})`. Every failure path in steps 8-9 is a synchronous `throw` (rolls back the whole tx per PowerSync semantics), never a silent `continue` past a required write. |
| 5 | Re-entrancy: does deferring the flip create a double-processing window? | ✅ No new risk — status is validated once per call (step 1); PowerSync/SQLite serializes `writeTransaction`s on a single write connection, so a concurrent second call blocks until the first commits and then correctly sees `CERRADA` and throws at step 1. Unchanged from pre-fix behavior. |
| 6 | Does `fn_validate_sesion_abierta` also gate `pagos`? Does the reorder touch any `pagos` INSERT? | ✅ Trigger does gate `pagos` (0041:105-108) too, but steps 6-9 only `SELECT` from `pagos`, never `INSERT` — no interaction with the reorder. |

### Critical confirming discovery (not requested, found during review)

The fix is correct not only for local SQLite semantics but for the **actual root cause at the sync layer**. `src/core/db/powersync/connector.ts:328` (`uploadData`) iterates `transaction.crud` **sequentially, in original write order**, issuing one Supabase REST call per op and `throw`-ing on error. `P0001` is in `FATAL_RESPONSE_CODES` (connector.ts:23). On a FATAL error, the catch block at connector.ts:557-570 calls `transaction.complete()` — which **discards the entire remaining batch**, including ops that were never sent (not just the failing one).

This means the pre-fix bug was worse than "the insert gets rejected": the old op order was `[...UPDATE status=CERRADA (early)..., movimientos_metodo_cobro INSERT, mov_caja_fuerte/movimientos_bancarios INSERT, traspasos_tesoreria INSERT, ...]`. The `UPDATE` (op 1, no trigger on `sesiones_caja` itself) succeeded on Supabase first, flipping the row to `CERRADA` server-side; the next op (`movimientos_metodo_cobro` INSERT) then hit the now-`CERRADA` row and got `P0001`-rejected, and `transaction.complete()` discarded everything after — a partial state where Postgres shows the session `CERRADA` with **no** consolidation rows, matching the user's exact report ("Ilega a tesoreria pero se borra").

With the fix, the op order becomes `[...consolidation INSERTs..., UPDATE status=CERRADA (last)]`. Since ops upload strictly in order, every `movimientos_metodo_cobro` INSERT reaches Postgres while the session is still `ABIERTA` there too (the `UPDATE` hasn't been sent yet), so the trigger passes, and the `UPDATE` — which has no trigger dependency of its own — runs last and closes out the batch. This directly and correctly eliminates the reported failure mode, confirmed against the real upload mechanism, not just local transaction semantics.

### Issues Found (Addendum)

**CRITICAL**: None.

**WARNING**:
1. This fix is **uncommitted and has not yet been re-tested live** against Supabase (the original bug was only caught in manual QA, per `task.md`'s pasted console errors). Given the confirming trace through `connector.ts` above, the fix is expected to resolve it, but a live re-test (close a session mixing efectivo + a bank method with commission, confirm no `P0001` in the browser console and that `traspasos_tesoreria`/`movimientos_bancarios`/`mov_caja_fuerte` rows persist on Supabase after sync) should be run before considering this closed.
2. Residual, pre-existing (not introduced by this fix): PowerSync's per-op sequential upload + discard-entire-remaining-batch-on-FATAL model (`connector.ts:557-570`) means that if consolidation succeeds for method 1 of 2 in a cierre and then fails for an unrelated reason on method 2 (e.g., a bank record deleted between local write and sync), Postgres could end up with method 1's rows landed but the final `status='CERRADA'` UPDATE discarded — leaving the session `ABIERTA` on Postgres with partial consolidation. This is **strictly no worse than before** (the old order guaranteed the flip landed even on a downstream failure, which was actually a worse inconsistency — `CERRADA` with zero consolidation), but it is a systemic gap in the upload connector worth hardening generally (e.g., true multi-statement atomicity via a Postgres RPC/function for the whole cierre payload), not specific to this diff.

**SUGGESTION**:
1. Minor documentation-only nit: the step comments now jump from step 4 straight to a `NOTA` block (no step 5) to step 6 — cosmetic, since step 5 (the old flip) was relocated to step 10. Consider renumbering the comments (`4 → 5(consolidation note) → 6...`) for readability, no functional impact.

### Verdict (Addendum)

**PASS**

The reorder is structurally sound: no upstream dependency on the flip existing early, all closed-over variables remain valid, atomicity is preserved (single `writeTransaction`, throw-to-rollback), and — critically — tracing the actual PowerSync upload mechanism (`connector.ts`) confirms the fix addresses the real root cause (sequential, order-preserving op upload where the previously-early `UPDATE` was the first op to reach Postgres and poisoned every subsequent trigger-guarded insert in the same batch). Recommend a live re-test before closing the underlying production incident, but no code defect blocks merging this specific change.
