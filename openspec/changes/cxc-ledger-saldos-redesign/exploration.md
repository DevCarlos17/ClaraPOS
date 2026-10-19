# Exploration: cxc-ledger-saldos-redesign

> Branch: `feat/cxc-ledger-saldos-redesign` | Phase: explore | Project: clarapos
> All claims below are cited `file:line` against the real working tree. Where I
> could not verify something directly, it's marked as an open question, not an
> assumption.

## 0. Prior-art already in `develop` (confirmed, re-verified on this branch)

`cxc-sync-snapshot-redesign` (migrations `0106`/`0107`/`0108`) is live:
- `ventas.estado` (`pendiente|parcial|pago|reversado`), trigger-derived with
  exact tolerance 0, two triggers: `prevent_venta_mutation()` (UPDATE/DELETE,
  `migrations/0108_ventas_estado_tolerancia_cero.sql:146-196`) and
  `derive_venta_estado_insert()` (INSERT,
  `migrations/0108_ventas_estado_tolerancia_cero.sql:201-210`). TS mirror:
  `src/features/cxc/lib/estado-venta.ts` (imported at
  `src/features/cxc/hooks/use-cxc.ts:16`).
- `clientes.saf_disponible` is an O(1) snapshot (`migrations/0101_clientes_saf_disponible_column.sql:29-30`),
  maintained atomically inside `actualizar_saldo_cliente()`
  (`migrations/0102_extender_trigger_saf_disponible.sql:79-126`, the
  `saf_disponible = CASE ... END` expression at lines 115-119 — no
  read-before-write, so no race condition by construction, unlike
  `saldo_actual`, see §3).
- Full open-item SAF model: `saf_creditos_lotes` (lots,
  `migrations/0104_saf_creditos_lotes.sql`) + `saf_creditos_aplicaciones`
  (FIFO consumption events, `migrations/0105_saf_creditos_aplicaciones.sql`),
  consumer code in `src/features/cxc/hooks/use-cxc.ts:1894-1965` (`consumirSafLotesEnTx`).
- Debt and SAF are kept separate, never netted
  (`src/features/cxc/hooks/use-cxc.ts:80-96` doc comment,
  `src/features/cxc/hooks/use-deuda-cliente.ts:5-12,65-80`).
- `main` vs `develop` diverge on SAF (ceiling-based scan on `main` vs
  snapshot-based on `develop`) — this exploration is against `develop`, confirmed
  via `src/features/cxc/hooks/use-cxc.ts:84-88` comment and the shipped 0101-0105 migrations.

## 1. Current-state map — the 4 target values

| Value | Read path (file:line) | Classification |
|---|---|---|
| **saldo_pendiente** (debt) | `use-cxc.ts:100` — `COALESCE((SELECT SUM(CAST(v.saldo_pend_usd AS REAL)) FROM ventas v WHERE v.cliente_id=c.id AND v.empresa_id=c.empresa_id AND CAST(v.saldo_pend_usd AS REAL) > 0), 0)`. Duplicated verbatim in `use-deuda-cliente.ts:24` (single client) and `:50` (batch `IN`). | **FULL-AGGREGATION**, not materialized, **3 call-sites doing the same scan**. |
| **saldo_a_favor** (credit) | `use-cxc.ts:101` — `CAST(c.saf_disponible AS REAL) as credito_disponible_usd`. | **ALREADY O(1)-MATERIALIZED** (0101/0102), plus full FIFO open-item audit (0104/0105). |
| **facturas_pendientes** (count) | COUNT variant of the same subquery, `use-cxc.ts:99` (uses `saldo_pend_usd > 0` magnitude, NOT `estado`). The separate list query `useFacturasPendientes` (`use-cxc.ts:163-178`) correctly uses `estado != 'pago'` (the shipped column). | **FULL-AGGREGATION** for the count; **INDEXED-PREFIX only** for the list (see below) — and the two use **different, inconsistent predicates** for the same "is pending" question in the same file. |
| **abonos no aplicados** (unapplied payments) | No direct ClaraPOS equivalent found. | **NOT-EXISTS as a distinct concept** — see §1.1. |

### 1.1 Why "facturas_pendientes" is only partially indexed

PowerSync client schema for `ventas` only defines
`idx_ventas_cliente_empresa_fecha: ['cliente_id','empresa_id','fecha']`
(`src/core/db/powersync/schema.ts:813-820`) — no index covers `estado` or
`saldo_pend_usd`. So `useFacturasPendientes`'s `estado != 'pago'` filter
(`use-cxc.ts:172`) narrows to the client via the index prefix but then scans
**all** of that client's historical invoice rows to find the pending subset —
there's no partial/covering index that skips non-pending rows. For a client
with a long invoice history this degrades linearly, which is exactly the
"device recalculates history" problem the user described.

### 1.2 "abonos no aplicados" — what ClaraPOS actually does today

By deliberate design (not an oversight), a payment never sits "unapplied":
- `registrarPagoFactura`/`aplicarPagoFacturaEnTx` apply 100% of the payment to
  one invoice (`use-cxc.ts:580-585`), or
- `registrarAbonoGlobal` FIFO-distributes across pending invoices
  (`use-cxc.ts:1025-1111`), and any remainder is **immediately promoted** to a
  SAF credit lot in the **same transaction** (`use-cxc.ts:1113-1141`,
  `pagoAnticipoId` anchor) — never left as a standalone "pending application"
  row.
So "abono no aplicado" maps 1:1 onto **saldo a favor**, which is already
solved (§0). If the user means something structurally different from SAF,
that needs a concrete scenario — see Open Questions §5.2.

## 2. Ledger gap analysis — is `movimientos_cuenta` already a usable ledger?

**Mostly yes.** `migrations/0006_ventas.sql:94-150` defines it with:
- `tipo IN ('FAC','PAG','NCR','NDB')` at birth, widened to add `'REV','SAL'`
  (pre-existing by the time of 0057), `'SAF'` (`migrations/0057_fix_duplicate_trigger_and_saf_tipo.sql:38-41`),
  `'SAFC'` (`migrations/0090_add_safc_tipo_movimientos_cuenta.sql:29-32`) — **8 types, covers FAC/PAG/NCR/NDB/REV/SAF/SAFC/SAL**, i.e. "all client movements" as the user wants, already.
- Open-item snapshot per row: `saldo_anterior`/`saldo_nuevo`
  (`0006_ventas.sql:101-102`), maintained atomically by
  `actualizar_saldo_cliente()` (evolved 0006→0057→0060→0061→0088→0102, 5 bugfix
  migrations — see §3).
- Append-only: `trg_mov_cuenta_no_update`/`_no_delete`
  (`0006_ventas.sql:147-150`).
- Indexed for ledger reads: server-side `idx_mov_cuenta_empresa/cliente/fecha`
  (`0006_ventas.sql:114-116`) + `idx_mov_cuenta_venta(venta_id, fecha DESC, created_at DESC)`
  (`migrations/0106_ventas_estado_column.sql:131-132`); client-side `by_venta`
  + `idx_movimientos_cuenta_cliente_empresa_tipo`
  (`src/core/db/powersync/schema.ts:674-677`).
- Polymorphic origin link: `doc_origen_id`/`doc_origen_tipo`
  (`0006_ventas.sql:105-106`).

**What's missing to be THE single source of truth:**

1. **No chronological-ledger index.** The only client-scoped index leads with
   `(cliente_id, empresa_id, tipo)` (`schema.ts:676`) — good for per-type SUM,
   not for "show me this client's full ledger in order" (needs
   `(cliente_id, fecha)`).
2. **Currency representation is inconsistent across row types.** `monto` is
   always USD (CHECK `monto > 0`, `0006_ventas.sql:100`, confirmed every tipo
   writes USD via `calcularSaldoNuevoMovimientoCuenta`). The native-currency
   columns `moneda_pago`/`monto_moneda`/`tasa_pago` (`schema.ts:659-661`) are
   only populated on PAG/SAF write-paths (`use-cxc.ts:600-608,809`) — FAC/NCR/
   NDB/REV rows leave them `NULL`. A "libro mayor" that must render native
   amounts for every row type can't rely on these columns uniformly yet.
3. **`vencimientos_cobrar` is a separate, app-maintained parallel balance
   table — not derived from `movimientos_cuenta`, no DB trigger maintains it.**
   Confirmed by grep across every migration file: only the table DDL
   (`0006_ventas.sql:566-592`) and `trg_vencimientos_cobrar_updated`
   (`updated_at` only, `0006_ventas.sql:590-591`) exist — zero
   balance-maintaining trigger. It's synced manually from **4 separate TS
   write-sites**: `use-cxc.ts:620-650` (pago-a-factura), `use-cxc.ts:1080-1106`
   (abono-global FIFO), `use-cxc.ts:1410-1496`+`2092` (reverso/insert), and
   `use-ventas.ts:1618` (insert on venta creation with a `PRESTAMO` cargo). See
   §3 for the drift risk this creates.
4. **FIFO multi-invoice abonos lose the per-invoice breakdown at the ledger
   level.** `registrarAbonoGlobal` writes **N** `pagos` rows (one per invoice
   touched, `use-cxc.ts:1049-1069`) but only **ONE** aggregate
   `movimientos_cuenta` PAG row for the total (`use-cxc.ts:1179-1200`). This is
   exactly the "header + auxiliary" shape the POC spreadsheet proposes
   (`ABONOS`=header, `AUX_ABO`=per-invoice detail — see §2.1) — **ClaraPOS
   already built this pattern, but only for SAF** (`saf_creditos_lotes` +
   `saf_creditos_aplicaciones`), not for plain multi-invoice cash abonos. Today
   the header/detail split is implicit and inconsistent (sometimes 1:1
   `movimientos_cuenta`:`pagos`, sometimes 1:N) instead of a formally modeled
   relationship.
5. `movimientos_metodo_cobro` (cash-register-method ledger) is a wholly
   separate ledger (not a `movimientos_cuenta` descendant) with its own
   currency-ambiguity issue — see §3. It's cajero-side, not client-side, so
   it's arguably out of scope for "a unified ledger for each client", but
   worth flagging since the user's framing ("ALL client movements") could be
   read to include it.

### 2.1 What the POC spreadsheet (`Hoja de cálculo sin título.xlsx`, found
untracked at repo root) actually contains

Parsed directly (10 sheets): `ESTADO_CLIENTE`, `ESTADO_EMISION`,
`ESTADO_DEUDA`, `CLIENTE_ID`, `VENTAS`, `ESTADO_ABONO`, `ABONOS`, `AUX_ABO`,
`ESTADO_NC`, `NOTA_CREDITO`.

- `CLIENTE_ID`: `cliente_id, nombre, saldo_pendiente, saldo_a_favor, ESTADO` —
  a flat materialized-balance row per client. Functionally what `clientes` +
  `saf_disponible` already is, minus `saldo_pendiente` (§1 gap).
- `VENTAS`: `venta_id, cliente_id, monto_total, monto_abonado, estado_emision,
  ESTADO_DEUDA` — materializes `monto_abonado` (the inverse of ClaraPOS's
  `saldo_pend_usd`, same idea, opposite direction). `ESTADO_DEUDA` is the
  POC's version of `estado` (already shipped).
- `ABONOS` + `AUX_ABO`: **the header+auxiliary pattern for abonos**. `ABONOS`
  (header): `abono_id, cliente_id, monto_original, monto_disponible,
  ESTADO_ABONO, referencia_original_id` — note `monto_disponible`, an
  unapplied remainder tracked on the SAME abono row, and
  `referencia_original_id` (self-link for reversals). `AUX_ABO` (detail):
  `ABO_AUX_ID, abono_id, VENTA_ID, MONTO, ESTADO_ABONO` — the per-invoice
  application, exactly mirroring `saf_creditos_lotes`→`saf_creditos_aplicaciones`.
  **This is the structural gap in §2 point 4** — ClaraPOS has this shape for
  SAF only.
- `ESTADO_ABONO` catalog: `APLICADO | PENDIENTE | REVERSADO` — a THREE-state
  model where an abono can sit `PENDIENTE` (unapplied) indefinitely. This is
  the one genuine behavioral difference from ClaraPOS's current design, which
  resolves every payment immediately (§1.2) — confirms the open question
  about whether the user wants to deliberately introduce this third state.
- Explicit state-catalog tables (`ESTADO_CLIENTE`, `ESTADO_EMISION`,
  `ESTADO_DEUDA`, `ESTADO_ABONO`, `ESTADO_NC`) are lookup tables with an `ID`+
  `ESTADO` shape. ClaraPOS's equivalent is `CHECK (col IN (...))` constraints
  (e.g. `0006_ventas.sql:178`, `migrations/0106...sql:128-129`) — functionally
  similar (closed enum), structurally different (no separate lookup table, no
  FK). Switching to real lookup tables would be a much larger, largely
  cosmetic change with no functional gain found in this POC — flagging but
  not recommending.

## 3. Impact surface — what reads/writes what

### `clientes.saldo_actual` (the netted balance)

Grep across `src/` (425 raw hits, deduplicated to structurally relevant
call-sites):
- Write paths (always paired with the ledger INSERT, read-before-write
  pattern): `use-cxc.ts:588-616,767-839,896-999,1154-1206`; `use-ventas.ts:941-1051,1131-1230`;
  `use-notas-credito.ts:1124-1518`; `use-importar-cxc.ts:89-248`.
- Explicitly documented as NEVER used for debt/credit-limit gating — comments
  at `use-cxc.ts:80-96`, `use-deuda-cliente.ts:5-12`, `use-ventas.ts:446,1006`.
  POS/CxC gates always use `deuda_usd`/`useDeudaFacturasCliente`
  (`SUM(saldo_pend_usd)`), never `saldo_actual`.
- Legitimate remaining uses: client-detail/estado-de-cuenta display, and as
  the running-total INPUT that produces each ledger row's
  `saldo_anterior`/`saldo_nuevo` snapshot (`calcularSaldoNuevoMovimientoCuenta`,
  `saldo-cliente.ts`).
- **Risk**: unlike `saf_disponible` (atomic `CASE`-expression UPDATE,
  `migrations/0102...sql:115-119`, no read-before-write), `saldo_actual` is
  read-then-written in app code in many places — this read-before-write
  pattern is **exactly** what caused the 3 historical race-condition bugs
  fixed across `migrations/0060`, `0061`, `0088`. Any redesign that keeps this
  pattern inherits the same bug class.

### `vencimientos_cobrar`

Readers: `use-vencimientos-cobrar.ts:36,39,63`, `prestamos-page.tsx:181`,
`prestamo-detalle-modal.tsx:121`, `use-dashboard.ts:159`,
`factura-detalle-cxc.tsx:603`.
Writers (manual sync, no trigger — **confirmed**, see §2 point 3):
`use-cxc.ts:620-650,1080-1106,1410-1496,2092`, `use-ventas.ts:1618`.
**Confirmed**: zero PowerSync client index on this table either
(`schema.ts:681-697`, `{ indexes: {} }`).

### `movimientos_metodo_cobro` currency ambiguity

- Table `migrations/0005_caja_tesoreria.sql:232-248` has **no `moneda`
  column**. Trigger `actualizar_saldo_metodo_cobro()`
  (`0005_caja_tesoreria.sql:255-272`) does `saldo_nuevo := saldo_anterior +/-
  NEW.monto` **unconditionally**, blind to what currency `monto` represents.
- **Confirmed real, not hypothetical**: for `origen='VENTA'` rows, `monto` is
  always the USD-equivalent (`montoMovVenta` = `montoUsd`,
  `use-ventas.ts:842-853,896`). For `origen='VUELTO'` rows, the code's own
  comment says monto is stored in "moneda nativa del metodo (no USD)"
  (`use-ventas.ts:913-915`) specifically so cuadre sums correctly by
  `codigo_iso`. **Same column, same table, different meaning depending on
  `origen`.**
- **Blast-radius check — is `metodos_cobro.saldo_actual` (the corrupted
  snapshot) actually used in cuadre math?** NO. `use-cuadre.ts:905,916,934`
  explicitly **excludes** `origen IN ('VENTA','COBRO','PROPINA')` from its
  `movimientos_metodo_cobro`-based sums — comment: "ya se cuentan en
  dataPagosUsd" — and instead sums directly from `pagos` (which correctly
  tracks `moneda_id`/`monto`/`monto_usd` per row). `use-sesiones-caja.ts:260-276,438-439`
  same pattern (joins `mo.codigo_iso` via `metodos_cobro.moneda_id` for
  currency bucketing on non-VENTA origins, which ARE stored in native
  currency). So **cuadre de caja / tesorería math is NOT corrupted today** —
  the bug is isolated to `metodos_cobro.saldo_actual`, which the code's own
  comment already flags as unreliable ("no incluye apertura ni ventas
  regulares", `use-ventas.ts:1523-1524`) and uses only as a last-resort
  fallback when no active session exists (`use-ventas.ts:1568-1570`).
- **Conclusion**: real, confirmed data-model smell; currently **contained**
  (low risk to cuadre/tesorería as read today). Only relevant to this change
  if it decides to touch `movimientos_metodo_cobro` directly — it shouldn't
  need to, since it's a cajero-ledger, not a client-ledger.

### SAF v2 (`saf_creditos_lotes`/`saf_creditos_aplicaciones`) consumers

Write: `use-ventas.ts:1207`, `use-notas-credito.ts:1335,1502`,
`use-cxc.ts:1240,1922-1965,2292`. Read: `use-cxc.ts:421-433`
(`useSafAplicacionesFactura`), `factura-detalle-cxc.tsx:172`. Already fully
shipped, tested (extensive FIFO-across-N-lots coverage in
`__tests__/use-cxc.test.ts`), verified PASS. Any redesign must not duplicate
or compete with this for the credit side.

### Sibling overlap — `powersync-sync-scope-optimization` (CRITICAL, uncommitted)

`openspec/changes/powersync-sync-scope-optimization/proposal.md` is an
**untracked, draft-only** proposal already sitting in this workspace (not yet
in spec/design/tasks phase per its `state.yaml` absence) that targets the
**same tables** this change cares about for the user's goal #2
("reducing the record load PowerSync must sync... trimming tables"):
classifies `movimientos_cuenta` as TRIMMED (recent-window), `vencimientos_cobrar`
and `ventas` as OPEN-BALANCE-AWARE (`proposal.md:42-43`). This is a direct
overlap, not a tangential one. The two changes are not yet reconciled — doing
either independently risks contradicting assumptions about ledger shape
(e.g. Approach B's §4 chronological-ledger index work would need to
re-validate that sibling's TRIMMED classification for `movimientos_cuenta`).

## 4. Two candidate approaches (comparison only — no decision made)

### Approach A — minimal materialization

- Add `clientes.saldo_pendiente_usd`, maintained by the **same atomic
  CASE-UPDATE pattern already proven** for `saf_disponible`
  (`migrations/0102...sql:115-119`) — no read-before-write, no new race-class.
- Fix `DEUDA_CREDITO_CLIENTE_SELECT`'s COUNT (`use-cxc.ts:99`) to reuse the
  already-shipped `estado != 'pago'` predicate instead of re-deriving by
  `saldo_pend_usd` magnitude — removes the inconsistency flagged in §1.
  Consolidate `use-deuda-cliente.ts`'s two duplicated SUM queries to read the
  new column.
- Leave `movimientos_cuenta` schema/triggers untouched.
- Do NOT touch `movimientos_metodo_cobro` (contained risk, separate ledger —
  §3).
- "abonos no aplicados": resolve the open question first (§5.2); if it's SAF,
  nothing to build.
- **Touches**: 1 migration (new column + CASE branch, near-literal mirror of
  0101/0102) + TS mirror update (`saldo-cliente.ts`) + 1-2 hook files
  (`use-cxc.ts`, `use-deuda-cliente.ts`) + 1 read-only backfill (mirrors 0107's
  BEGIN/ROLLBACK-verify discipline).
- **Migration risk**: LOW — same pattern already verified PASS in production
  for the analogous `saf_disponible` column.
- **Backfill risk**: LOW — same shape as 0107.
- **PowerSync sync-trimming benefit**: NONE directly (doesn't touch sync
  rules). Makes future trimming of `ventas`/`movimientos_cuenta` safer to
  reason about (app no longer needs the full per-client scan to display
  debt), but the sibling proposal's row-level `saldo_pend_usd > 0` filter
  doesn't change either way.
- **Reviewer burden**: SMALL, comfortably under the 400-line PR budget.

### Approach B — promote `movimientos_cuenta` to a formal ledger

- Normalize currency representation across all 8 `tipo`s (fix §2 point 2).
- Add a `(cliente_id, fecha)` covering index for true chronological reads.
- Derive `vencimientos_cobrar` balances from `movimientos_cuenta` instead of
  the current 4-site manual app-code sync (removes §2 point 3's drift risk) —
  non-trivial: `vencimientos_cobrar` tracks PER-INSTALLMENT state, and today's
  FIFO distribution logic lives entirely in TS loops (`use-cxc.ts`), not SQL.
- Formalize header+auxiliary for general abonos (mirror
  `saf_creditos_lotes`/`aplicaciones`) so multi-invoice FIFO abonos get the
  same open-item audit trail SAF already has (closes §2 point 4 / §2.1's
  `ABONOS`+`AUX_ABO` gap).
- Add an ongoing reconciliation/invariant check (not just a one-time migration
  comment like 0105's trailer, but a real CI/cron-style check).
- **Touches**: likely 4-8 migrations, rewrites of
  `registrarAbonoGlobal`/`aplicarPagoFacturaEnTx`/vencimientos-sync logic
  inside an already 2300+-line `use-cxc.ts`, and directly interacts with the
  sibling `powersync-sync-scope-optimization` proposal's draft classification
  for `movimientos_cuenta`.
- **Migration risk**: MEDIUM-HIGH — touching `actualizar_saldo_cliente()`
  means touching a function with a 5-migration bugfix history
  (0057→0060→0061→0088→0102); inherently higher-risk than adding a sibling
  column.
- **Backfill risk**: MEDIUM — per the SAF precedent
  (`migrations/0104...sql` header: "arranca vacio... ningun lote historico se
  reconstruye"), a new open-item abono table would almost certainly ship with
  **no backfill**, leaving historical abonos without the new audit trail —
  a visible UI inconsistency between old and new data.
- **PowerSync sync-trimming benefit**: theoretically higher, but speculative —
  the sibling proposal already drafted a full trimming strategy **without**
  needing any of these schema changes, which suggests Approach B's trimming
  benefit is not load-bearing for the user's stated goal #2.
- **Reviewer burden**: LARGE — multi-PR, touches the two files with the
  longest bugfix histories in the ledger subsystem; needs chained/stacked PRs
  (per this project's own `chained-pr`/`work-unit-commits` conventions).

## 5. Open questions (for the user, via the orchestrator)

1. **Scope boundary with `powersync-sync-scope-optimization`** (uncommitted
   draft, same repo, overlapping tables): should this change run strictly
   before it, strictly after it, absorb it, or stay independent? They make
   potentially conflicting assumptions about `movimientos_cuenta`/
   `vencimientos_cobrar`/`ventas` shape.
2. **"Abonos no aplicados"** — does this mean (a) `saldo_a_favor`/SAF, already
   fully solved; (b) a genuinely new third state between "payment" and "SAF
   credit" that doesn't exist today by design (every payment resolves
   immediately, §1.2); or (c) the POC's `ABONOS.monto_disponible` /
   `ESTADO_ABONO='PENDIENTE'` concept specifically? A concrete business
   scenario where a payment needs to sit unapplied would resolve this.
3. Does the general multi-invoice FIFO abono (`registrarAbonoGlobal`) need
   the SAME header+auxiliary open-item audit trail SAF already has, or is the
   current `movimientos_cuenta` (aggregate) + `pagos` (per-invoice) pairing
   "good enough" and out of scope for this change?
4. Is fixing the `movimientos_metodo_cobro` currency-ambiguity bug (§3) in
   scope here, or a fully separate follow-up? Confirmed real but currently
   contained — no urgency unless this redesign plans to touch that table.
5. Is PowerSync sync-trimming ("reducing record load... trimming tables")
   actually in scope for THIS change's implementation, or is the goal purely
   client-side materialization (no recompute-from-history), leaving
   wire/sync-level trimming entirely to the sibling proposal?
6. For `vencimientos_cobrar`: should it become a true derived
   view/table from `movimientos_cuenta` (Approach B direction), or is its
   current independently-app-maintained-parallel-balance acceptable risk,
   with this change only adding a reconciliation check (Approach A
   direction)?

## Ready for Proposal

**Partially.** The current-state map, ledger gap analysis, and impact surface
are solid enough to write a proposal for **Approach A** today. Approach B (or
any blend) cannot be responsibly proposed until Open Questions 1-3 and 6 are
answered — they change which tables/files are even in scope. Recommend the
orchestrator take §5 to the user before `sdd-propose`.
