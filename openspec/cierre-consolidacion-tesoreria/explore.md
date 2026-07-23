# Exploration: cierre-consolidacion-tesoreria

_Date: 2026-07-22 | Change: cierre-consolidacion-tesoreria_

---

## 1. Problem Statement & Current Behavior

### What `cerrarSesionCaja` does today

`src/features/caja/hooks/use-sesiones-caja.ts:653-965` — runs entirely inside one `db.writeTransaction`:

1. Reads the session, asserts `status === 'ABIERTA'` (guards against double-close — line 690-692).
2. Computes `montoSistemaUsd`/`montoSistemaBs` (apertura + pagos efectivo + manuales − egresos).
3. Updates `sesiones_caja` → `status='CERRADA'`, stores `monto_sistema_*`, `monto_fisico_*`, `diferencia_*`.
4. Populates `sesiones_caja_detalle`: one row per `metodo_cobro_id` used, with `total_sistema` = pagos (in `monto_usd`) + manual ingresos − manual egresos for that method (lines 878-925).
5. Inserts a virtual SAF row if applicable.

**What's missing**: no call to Tesorería anywhere. Cash and POS/tarjeta totals stay parked in `metodos_cobro.saldo_actual` — the money is only "logically" closed, never routed to a bank or caja fuerte. The only existing hint to the user is a UI toast reminder (`sesion-caja-form.tsx`, from the prior `pos-tesoreria-integration` change) telling the cashier to manually deposit — this is exactly the manual step this change automates.

### What already exists to build on

- `crearTraspasoSesionATesoreria()` (`use-traspasos.ts:602-728`) is the *exact* pattern for SESION_CAJA → CAJA_FUERTE: EGRESO in `movimientos_metodo_cobro` (origen `EGRESO_TESORERIA`) + PENDING (`validado=0`) INGRESO in `mov_caja_fuerte` + a `traspasos_tesoreria` row tagged `sesion_caja_id`. It decrements `metodos_cobro.saldo_actual` and increments `caja_fuerte.saldo_actual`.
- No equivalent exists for **SESION_CAJA → BANCO** (POS/tarjeta method with `banco_empresa_id`). This is a genuine gap this change must fill.
- `export-tesoreria.ts` (`exportConsolidadoPendientesPdf`/`Excel`) already lists pending rows by `validado=0 AND reversado=0` for both `movimientos_bancarios` and `mov_caja_fuerte` — the "pending transfers" UI is origen-agnostic, so new consolidation rows appear automatically with no UI work required, as long as `validado=0` is set correctly.

---

## 2. Options: Where to Trigger Consolidation

### Option 1 — Inside `cerrarSesionCaja`'s existing `db.writeTransaction` (RECOMMENDED)

Add the consolidation logic as new steps (7-9) inside the same transaction that already updates `sesiones_caja` and `sesiones_caja_detalle`.

- **Atomicity**: guaranteed. PowerSync's `db.writeTransaction` runs as one local SQLite transaction — if any INSERT fails, the entire cierre (including the status flip to `CERRADA`) rolls back. The cashier never ends up in a state where the session is closed but money "vanished" without a Tesorería record.
- **Idempotency for free**: the existing guard at step 1 (`if (sesion.status !== 'ABIERTA') throw ...`) already prevents the function from running twice on the same session. Since consolidation lives in the same call, it inherits that guard — no extra dedup logic needed.
- **Offline-first fit**: this is exactly how the rest of the app already treats "atomic financial event" (venta + kardex + pagos, apertura, cierre) — one `writeTransaction`, sync happens later. Consistent with existing conventions.
- **Rollback**: nothing to design — the whole cierre is undone if any insert fails (e.g., a method has commission but no bank linked → the whole close fails, cashier sees one clear error, nothing partially written).
- Con: The transaction gets larger (more INSERTs/UPDATEs per close). Given cierre already does 2 SELECT+2 SELECT+UPDATE+N inserts for `sesiones_caja_detalle`, this is an incremental addition, not a new order of magnitude.

### Option 2 — Separate post-cierre step (hook or subsequent call after commit)

Call a new `consolidarCierreATesoreria(sesionId)` function right after `cerrarSesionCaja()` resolves in the UI layer (`sesion-caja-form.tsx`).

- **Atomicity broken**: two independent transactions. If the app crashes, loses connectivity, or the user closes the tab between the two calls, the session ends up `CERRADA` with **no** Tesorería records — silently losing the automation this change exists to provide. In an offline-first PWA this window of failure is not theoretical; it's the norm (cashier closes register and puts the tablet away).
- **Idempotency must be built by hand**: needs a guard (e.g. "does a `traspasos_tesoreria` row already exist for this `sesion_caja_id`?") to avoid double-consolidation on retry — logic that Option 1 gets for free from the `status='ABIERTA'` check.
- **Rollback**: if it fails, the session is already `CERRADA` — recovering requires either a manual retry button or reopening the session (which doesn't exist in this codebase — see §6).
- Pro: keeps `cerrarSesionCaja` smaller; separates "closing math" from "treasury routing" as distinct concerns.

### Recommendation

**Option 1.** The atomicity and free idempotency outweigh the modest increase in transaction size. This project's own architecture note (`CLARAPOS.md` rule #9 — "operaciones financieras deben ser transaccionales") backs this directly. The prior `pos-tesoreria-integration` change also treats POS↔Tesorería moves as single-transaction operations — this keeps the pattern consistent.

---

## 3. Source of Per-Method Totals (Grouped by Destination)

`cerrarSesionCaja` **already computes, inside the same transaction**, exactly the numbers needed — do NOT recompute via a separate query or via the `usePagosPorMetodo`/`useSaldoEfectivoBimonetario` read-hooks from `src/features/reportes/hooks/use-cuadre.ts`.

Reasons:

- `usePagosPorMetodo` / `useSaldoEfectivoBimonetario` are **React hooks** (`useQuery` from `@powersync/react`) — they cannot run inside a plain async `db.writeTransaction(tx => ...)` callback. They're UI-layer only.
- Step 6 of `cerrarSesionCaja` (lines 837-925) already computes, per `metodo_cobro_id`, a `totalSistemaD` (= `SUM(pagos.monto_usd)` + manual ingresos − manual egresos for that method) and writes it into `sesiones_caja_detalle.total_sistema`. This is the authoritative "money that belongs to this method for this session" number, computed from `metodosUsadosResult` (pagos, grouped by `metodo_cobro_id, moneda_id`) + `movsManualPorMetodoResult` (manual movements, grouped by `metodo_cobro_id`).
- Using the **same row already looped in step 6** guarantees the consolidation total always matches what's shown in `sesiones_caja_detalle` (i.e. what the cashier saw in the cuadre before confirming cierre) — no risk of drift between two independently-computed sums.

**Concrete plan**: after inserting each `sesiones_caja_detalle` row in the existing loop (or in a follow-up loop over the same `metodosUsadosResult` rows), for each `metodo_cobro_id` with `totalSistemaD > 0`:

1. Look up `metodos_cobro` row for `banco_empresa_id`, `caja_fuerte_id`, `comision_pct`, `tipo`, `moneda_id` (one query, can be batched with `IN (...)` across all method IDs used this session, same style as existing `metodosUsadosResult` query).
2. Route:
   - `tipo = 'EFECTIVO'` and `moneda_id` → USD: route `totalSistemaD` to the USD `caja_fuerte`.
   - `tipo = 'EFECTIVO'` and `moneda_id` → VES: route `totalSistemaD` to the Bs `caja_fuerte`.
   - Any other `tipo` (e.g. `PUNTO`) with a `banco_empresa_id` set: route `totalSistemaD` to that bank.
   - `deposito_directo = true` methods might need to be excluded (see Risks) — needs a decision in design, not resolved here.

**Important nuance on currency for banks**: `caja_fuerte` is unique per currency (confirmed — `caja_fuerte.moneda_id NOT NULL`, one row per currency per empresa per migration 0035). `bancos_empresa.moneda_id` also exists (schema.ts:214) — a bank account has its own fixed currency. The consolidation must use the **method's own `moneda_id`** for `monto_origen`/`monto_destino` in `traspasos_tesoreria` (same-currency transfer, `tasa_cambio = null` or `1`, exactly like `crearTraspasoSesionATesoreria` does today) — never mix USD/Bs math per rule #1 in CLAUDE.md.

---

## 4. Commission Mechanics (Option A — decided)

For a method with `comision_pct > 0` (e.g., Punto Mercantil with 3% comisión):

- Deposit the **gross** `totalSistemaD` to the linked bank as INGRESO (full sale amount, no netting).
- Generate a **separate EGRESO** for `totalSistemaD * comision_pct / 100`.

**Where the EGRESO lands — two viable options, not decided here:**

**Option A1 — `movimientos_bancarios` EGRESO on the same bank account.**
- Same table, same transaction, no new domain concept. `origen` needs a value — none of the existing CHECK values (`DEPOSITO_CAJA, TRANSFERENCIA_CLIENTE, PAGO_PROVEEDOR, GASTO, MANUAL, TRASPASO, REVERSO`) precisely names "commission withheld from a POS batch." Closest reusable value is `GASTO` (generic expense) with `descripcion` spelling out "Comisión POS {metodo_cobro.nombre} {pct}%". A new explicit value (e.g. `COMISION_LOTE`) would need adding to the CHECK constraint (see §5) but gives a cleaner audit trail / filterable origen for reporting.
- Pro: minimal moving parts, one more row in the same account's ledger (`movimientos_bancarios`), no NUMERIC(18,4) rounding surprises since it's derived from the already-computed `totalSistemaD`.
- Con: commission never appears as a "real" expense in `contabilidad`/`gastos` reports — it's just a ledger deduction on the bank account.

**Option A2 — full `gastos` table entry.**
- Creates a proper `gastos` row (with IVA/ISLR fields, `cuenta_config` linkage, possibly `gasto_pagos`) tied to this bank account and tagged to the session.
- Pro: shows up in Gastos/Contabilidad reports as a real periodic expense (bank commissions are usually a recognized cost center).
- Con: `gastos` is a heavier domain object — has its own validation rules, tax fields, and is designed for user-entered/approved expenses, not machine-generated ones at cierre time. Auto-inserting a full `gastos` row on every cierre with a commission-bearing method adds meaningful complexity and a new failure surface (e.g. required `cuentas_config` linkage might not exist for a tenant that never configured "gastos bancarios").

**Recommendation to carry into design phase**: Option A1 (`movimientos_bancarios` EGRESO with a new dedicated `origen` value) is the lower-risk default — it stays inside the same atomic transaction as everything else, requires only a CHECK-constraint migration (already needed anyway, see §5), and keeps commission visible per-bank-account in the existing Tesorería ledger/export. Option A2 should only be chosen if the business explicitly wants commissions to flow through Contabilidad's Gastos reporting — that's a product decision, not an architecture one, and should be confirmed with the user before/at proposal stage.

---

## 5. Schema Gaps

### 5.1 — CRITICAL, pre-existing, must-fix: `traspasos_tesoreria.cuenta_origen_tipo`/`cuenta_destino_tipo` CHECK does not include `'SESION_CAJA'`

- `migrations/0035_conciliacion_tesoreria.sql:117,120` defines: `CHECK (cuenta_origen_tipo IN ('BANCO','CAJA_FUERTE'))` and the same for `cuenta_destino_tipo`. **No later migration alters this constraint** (verified by grepping every migration file for `traspasos_tesoreria`/`cuenta_origen_tipo` — only 0035 and 0072 touch the table; 0072 only adds the nullable `sesion_caja_id` column).
- Yet `use-traspasos.ts` (`crearTraspasoSesionATesoreria` line 716, `crearTraspasoTesoreriaASesion` line 852, `reversarTraspaso`'s `SESION_CAJA` branches) **inserts/reads `cuenta_origen_tipo = 'SESION_CAJA'` / `cuenta_destino_tipo = 'SESION_CAJA'`**, which the live CHECK constraint (per the migration files) would reject with Postgres error 23514 on sync.
- Two independent, later migration authors documented **contradictory beliefs** about this:
  - `openspec/pos-tesoreria-integration/design.md:56-58` claims *"No check constraint exists... column is TEXT without CHECK... 'SESION_CAJA' works without migration"* — and consequently `openspec/pos-tesoreria-integration/tasks.md` (TASK-001) explicitly did **not** add a migration for this.
  - `migrations/0076_merge_efectivo_bs_duplicado.sql:46-49` (newer, dated after 0072) explicitly says: *"se verificó el schema (0035, 0072) y las columnas... solo aceptan los literales 'BANCO' y 'CAJA_FUERTE' (CHECK constraint)"*.
- These cannot both be true against the same migration files. Since migration 0035's SQL is unambiguous and no ALTER ever touched that CHECK, **the design.md claim from the prior change appears to have been wrong** (likely checked against a stale/mismatched environment). This means the *existing* `crearTraspasoSesionATesoreria`/`crearTraspasoTesoreriaASesion` code paths may already be failing to sync to Supabase in production today (would still work locally in SQLite since PowerSync's `schema.ts` has no CHECK constraints — only Postgres enforces this).
- **This must be verified against the live Supabase schema before this change proceeds** (e.g., `\d+ traspasos_tesoreria` in the Supabase SQL editor, or `information_schema.check_constraints`). This exploration cannot query the live DB.
- **Regardless of the verification outcome, this change needs `'SESION_CAJA'` to work for BOTH `CAJA_FUERTE` (already coded) and `BANCO` (new) destinations.** The safe, idempotent fix is a new migration (`0077_...`) that does `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT ... CHECK (... IN ('BANCO','CAJA_FUERTE','SESION_CAJA'))` on both columns — following the exact idempotent pattern already used in migrations 0073 and 0027 for identical "origen/tipo value missing from CHECK" bugs. This is a **required** migration for this change, not optional, whether or not the older gap was already silently biting production.

### 5.2 — `crearTraspasoSesionATesoreria` needs a BANCO-destination variant (or a generalized version)

- Current `crearTraspasoSesionATesoreria` (use-traspasos.ts:602-728) hardcodes the destination side to `caja_fuerte`/`mov_caja_fuerte`. It cannot write to `bancos_empresa`/`movimientos_bancarios`.
- **Recommendation direction (not decided — for design phase)**: generalize the function to accept a destination discriminator (`{ tipo: 'CAJA_FUERTE', id } | { tipo: 'BANCO', id }`), mirroring how the generic `crearTraspaso()` already branches on `destino.tipo === 'BANCO'` vs the caja-fuerte else-branch (use-traspasos.ts:219-277). This avoids duplicating the whole function body for a near-identical BANCO path, and keeps `reversarTraspaso()` (which already branches on `cuenta_destino_tipo`) working unchanged since it only reads `cuenta_destino_tipo` off the `traspasos_tesoreria` row, not off the function used to create it.

### 5.3 — New `origen` values needed?

- `mov_caja_fuerte_origen_check` (migration 0035) already contains **`'DEPOSITO_CIERRE'`** — added in the original migration, labeled `"Cierre de caja"` in `movimientos-table.tsx:36` and `reverso-modal.tsx:31`, but **never inserted by any code today** (0 matches for an INSERT using it). This is the perfect, already-reserved value for the cash-consolidation-to-caja-fuerte `mov_caja_fuerte` rows this change creates — no migration needed on this table/column.
- `movimientos_bancarios_origen_check` (migration 0035) contains `'DEPOSITO_CAJA'` (labeled "Deposito caja" in the same two UI dictionaries) — the closest existing semantic match for "POS batch deposited to bank at cierre," though it's also unused today. Reusable as-is, or a new dedicated value (e.g. `CIERRE_CONSOLIDACION`) could be added in the same 0077 migration for a more explicit label distinguishing automatic cierre-driven deposits from ad-hoc manual bank deposits. This choice affects UI labels only (`movimientos-table.tsx`, `reverso-modal.tsx`, `conciliacion-bancaria.tsx` all keep local dictionaries mapping `origen` → Spanish label) — low risk either way, decide at design/spec time.
- Commission EGRESO origen: see §4 — depends on Option A1 vs A2 choice.
- `movimientos_metodo_cobro_origen_check` (migration 0073) already includes `'EGRESO_TESORERIA'` — reusable as-is for the EGRESO side that drains `metodos_cobro.saldo_actual` at cierre (same semantics as the existing manual traspaso).

### 5.4 — Migration needed

Yes — one migration is required regardless of other decisions: extend the `cuenta_origen_tipo`/`cuenta_destino_tipo` CHECK on `traspasos_tesoreria` to include `'SESION_CAJA'` (§5.1). Optionally, in the same migration, add a new `origen` value to `movimientos_bancarios_origen_check` if the design phase decides against reusing `DEPOSITO_CAJA`/`GASTO`. Latest migration on disk is **`0076_merge_efectivo_bs_duplicado.sql`** — next file should be **`0077_...`**.

---

## 6. Reversal / Reopen Behavior

- **No "reopen a closed session" feature exists anywhere in this codebase** (grepped for `reabrirSesion`/`REABRIR`/`reopenSesion` — zero matches). Closing is a one-way, terminal state transition today (`sesiones_caja.status: 'ABIERTA' → 'CERRADA'`, no path back).
- This significantly simplifies the concern: there is no "what if the session gets reopened" case to design for *right now*, because the capability doesn't exist. If it's added later, that future change would need to handle reversing any consolidated `traspasos_tesoreria` rows created at cierre (the existing `reversarTraspaso()` already supports reversing `SESION_CAJA`-origin traspasos, but explicitly **blocks reversal once the session is `CERRADA`** — `use-traspasos.ts:399-401` for origin side, `:510-512` for destination side). That guard would need to be relaxed or replaced by a different manual "reversar consolidación de cierre" action scoped to Tesorería (via `reversarTraspaso` called directly on the resulting `traspasos_tesoreria` row, which does NOT check session status inside `reversarTraspaso` itself for the "money side" reversal — only the `SESION_CAJA`-branch reversal touches session status).
- **What already handles "I made a mistake"**: the consolidated `mov_caja_fuerte`/`movimientos_bancarios` rows land `validado=0` (pending). Tesorería can reject/adjust via the existing manual reversal flow (`reversarTraspaso`) on the resulting `traspasos_tesoreria` row — this works today for the CAJA_FUERTE side (`cuenta_destino_tipo='CAJA_FUERTE'` branch doesn't check session status) and will work identically for the new BANCO side once §5.2 is implemented, since neither the BANCO nor CAJA_FUERTE destination branches in `reversarTraspaso` are gated by session status — only the `SESION_CAJA`-typed side is. Since the *origin* side of our new traspasos will be `SESION_CAJA` and the session will already be `CERRADA`, **reversal of the session-side leg will be blocked by the existing guard** (`use-traspasos.ts:399-401`). This is consistent with the intended workflow (post-cierre, the session is closed and immutable) — Tesorería can still un-validate/reject the bank/caja-fuerte side of the pending transfer, but cannot push money back into an already-closed POS session. This should be confirmed as acceptable behavior at design/spec time, since it means a "wrong deposit" from a closed session cannot self-correct back into that session — it would need a manual correcting entry instead.

---

## 7. Idempotency

- Consolidation runs inside `cerrarSesionCaja`, which already guards against re-entry: step 1 reads `sesiones_caja.status` and throws `'La sesion de caja ya fue cerrada'` if it's not `'ABIERTA'` (line 690-692). Because this check happens **before** any writes in the transaction, and Option 1 keeps consolidation inside the same transaction, a retried call on an already-closed session will always fail fast before creating any duplicate `traspasos_tesoreria`/`movimientos_bancarios`/`mov_caja_fuerte` rows.
- The only edge case: a `db.writeTransaction` that fails partway through (e.g., a thrown error on step 8 of 9) rolls back entirely in local SQLite — no partial rows survive locally. Standard PowerSync semantics; no special handling needed.
- No additional idempotency key (e.g. a `sesion_caja_id` uniqueness constraint on `traspasos_tesoreria`) is needed given the above — but note this differs from a hypothetical Option 2 design, which would need one.

---

## 8. Risks & Edge Cases

| Risk / Edge case | Notes |
|---|---|
| **Pre-existing CHECK gap (§5.1)** | Highest-priority finding. Must be resolved (migration) regardless of how the rest of this change is designed; may indicate the prior `pos-tesoreria-integration` feature has been silently failing to sync `SESION_CAJA` traspasos to Supabase. Recommend verifying live schema before/at proposal. |
| Method with commission but no `banco_empresa_id` linked | Config error — a `PUNTO`/`TRANSFERENCIA` method with `comision_pct > 0` but `banco_empresa_id IS NULL` has nowhere to deposit. Must fail the cierre with a clear Spanish error naming the method, not silently skip it (silent skip = money "disappears" from Tesorería tracking). |
| Method with no destination configured at all | E.g., a `PUNTO` method with neither `banco_empresa_id` nor `caja_fuerte_id`. Same as above — must be a hard validation error before allowing cierre, or excluded from consolidation entirely with a warning (decide at design/spec time). |
| Zero-total methods | `sesiones_caja_detalle` already only inserts rows for methods actually used (`metodosUsadosResult` only returns methods with activity) — a method with `totalSistemaD = 0` won't appear and needs no transfer. No special handling needed beyond skipping non-positive totals. |
| Mixed currency | `caja_fuerte` is one-per-currency; `bancos_empresa.moneda_id` is fixed per bank. Consolidation must never sum USD and Bs totals together — each method's total routes in its own `moneda_id`, matching rule #1 in CLAUDE.md. Already naturally enforced by routing per-method (not per-currency-bucket). |
| `is_reversed` payments | Already excluded — `metodosUsadosResult` and `movsManualPorMetodoResult` both operate on `pagos`/`movimientos_metodo_cobro` which the existing cierre math already filters correctly (`COALESCE(p.is_reversed, 0) = 0` on the payments query). No new handling needed; the totals being consolidated are already net of reversals. |
| SAF (saldo a favor) | Handled as a separate virtual `sesiones_caja_detalle` row with `metodo_cobro_id = NULL` (step 7 of cierre). This is a client-account credit event, not cash/POS money movement — should NOT be routed to Tesorería. Consolidation loop must explicitly skip rows where `metodo_cobro_id IS NULL`. |
| `deposito_directo` flag on `metodos_cobro` (migration 0069) | Exists but its semantics relative to this feature are undefined — worth clarifying at design time whether `deposito_directo = true` means "already handled outside this flow, skip consolidation" or something else. Not resolved by this exploration; flagging as an open question. |
| Multiple sessions closing concurrently on cash-shared caja fuerte | `caja_fuerte.saldo_actual` updates happen via `UPDATE ... SET saldo_actual = ?` (read-then-write, not atomic increment) in the existing `crearTraspasoSesionATesoreria` pattern — a pre-existing race condition risk (not introduced by this change) if two sessions close at the exact same instant targeting the same caja fuerte. Out of scope to fix here, but worth a one-line mention in design since this change increases the frequency of writes to that pattern (every cierre now writes to caja_fuerte, not just manual retiros). |

---

## 9. Affected Files

| File | Why |
|---|---|
| `src/features/caja/hooks/use-sesiones-caja.ts` | `cerrarSesionCaja` (~line 653) gains the new consolidation steps inside its existing `writeTransaction`. |
| `src/features/tesoreria/hooks/use-traspasos.ts` | `crearTraspasoSesionATesoreria` needs a BANCO-destination variant or generalization (§5.2); possibly a new exported helper reused by `cerrarSesionCaja` (or the consolidation logic is inlined directly in the cierre transaction using `tx.execute`, since `crearTraspasoSesionATesoreria` opens its own `db.writeTransaction` and can't be nested inside another). **Note for design phase**: since PowerSync's `writeTransaction` cannot be nested, the consolidation logic likely needs to be refactored into a plain function that takes a `tx` handle (not a new top-level `writeTransaction` call), so it can be invoked either standalone (existing manual flows) or from inside `cerrarSesionCaja`'s transaction. |
| `migrations/0077_*.sql` (new) | Fix `traspasos_tesoreria` CHECK constraint (§5.1, §5.4); possibly new `origen` value(s) for `movimientos_bancarios`/commission tracking. |
| `src/core/db/kysely/types.ts` | Update `origen` comments if new values are introduced. |
| `src/features/configuracion/hooks/use-payment-methods.ts` | Read-only reference — confirms `banco_empresa_id`, `caja_fuerte_id`, `comision_pct`, `moneda_id`, `tipo` are already exposed per method; no changes needed unless new fields are required. |
| `src/features/tesoreria/utils/export-tesoreria.ts` | No changes needed — pending-transfer export queries are origen-agnostic (`validado=0 AND reversado=0`), new rows appear automatically. |
| `src/features/tesoreria/components/movimientos-table.tsx`, `reverso-modal.tsx`, `src/features/bancos/components/conciliacion-bancaria.tsx` | Local origen→label dictionaries; may need a new label if a new `origen` value is introduced for commission or cierre-specific bank deposits. |
| `src/features/caja/components/sesion-caja-form.tsx` | The existing "recuerda depositar" toast (from `pos-tesoreria-integration`) becomes misleading/redundant once deposits are automatic — likely needs removal or rewording at design/apply time (flagging, not deciding). |

---

## 10. Recommendation & Readiness

**Recommendation**: Option 1 (consolidate inside `cerrarSesionCaja`'s existing transaction), reusing the already-computed `sesiones_caja_detalle` per-method totals as the source of truth, routing via each method's own `banco_empresa_id`/`caja_fuerte_id`/`moneda_id`, landing all consolidated movements as `validado=0` (pending) exactly like the existing `crearTraspasoSesionATesoreria` pattern, tagged with `sesion_caja_id` (on `traspasos_tesoreria`) and `doc_origen_tipo='SESION_CAJA'` + `doc_origen_id=sesion_caja_id` (on the individual `movimientos_bancarios`/`mov_caja_fuerte` rows, following the existing tagging convention).

**Blocking item for design phase**: the `traspasos_tesoreria` CHECK constraint gap (§5.1) must be resolved — this is not optional cleanup, it's a hard prerequisite since this change's core mechanism (SESION_CAJA-origin traspasos) depends on that value being legal in Postgres.

**Open decisions to carry into `sdd-propose`/`sdd-design`** (deliberately not resolved here per constraints):
1. Commission EGRESO placement — `movimientos_bancarios` (Option A1) vs full `gastos` entry (Option A2). Recommend A1.
2. Exact new `origen` value(s) if the design decides not to reuse `DEPOSITO_CAJA`/`GASTO`.
3. Hard-fail vs skip-with-warning for methods with commission-but-no-bank or no-destination-at-all.
4. Whether to reword/remove the existing "recuerda depositar" toast in `sesion-caja-form.tsx`.
5. Semantics of `deposito_directo` relative to this flow.

**Ready for proposal**: Yes, with the note that `sdd-propose`/`sdd-design` must explicitly address the §5.1 schema-gap verification and the 5 open decisions above before task breakdown.
