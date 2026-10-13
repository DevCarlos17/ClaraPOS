# Design: Ventas Estado Derivado (CxC Foundation — estado-only)

> Change: `cxc-sync-snapshot-redesign` | Phase: design (AMENDED) | Project: clarapos

## Amendment Note (read first)

This change was originally proposed as a bundle of two independent pieces:
`ventas.estado` + `clientes.saf_disponible`. **The `saf_disponible` half already
shipped** under `saf-snapshot-y-trazabilidad` (migrations `0101`-`0103`, verified
PASS) and later evolved further into an open-item accounting model
(`saf_creditos_lotes`/`saf_creditos_aplicaciones`, migrations `0104`-`0105`,
also shipped). This design is amended to drop everything related to
`saf_disponible` and keep **only `ventas.estado`**. The
`cliente-saf-materializado` spec in this change folder is superseded — see
`specs/cliente-saf-materializado/spec.md` for the pointer. The
`ventas-estado-derivado` spec is unchanged and still the source of truth for
requirements.

All migration numbers below are renumbered: latest real migration on disk is
`0105`, so this change now occupies **`0106`-`0107`** (previously planned as
stale `0100`-`0103`, all four of which are now occupied by unrelated shipped
SQL — see table below).

| Stale # (old design) | Real content at that number today |
|---|---|
| 0100 | `departamento_codigo_server_side.sql` (unrelated) |
| 0101 | `clientes_saf_disponible_column.sql` (saf, shipped) |
| 0102 | `extender_trigger_saf_disponible.sql` (saf, shipped) |
| 0103 | `backfill_saf_disponible.sql` (saf, shipped) |

## Amendment Note 2 (CRITICAL fix — read second, after Amendment Note above)

Adversarial verify of Phase 1 (`sdd/cxc-sync-snapshot-redesign/verify-report`,
CRITICAL-1) found that §4's original table entry — *"FAC → Column `DEFAULT
'pendiente'` at INSERT (no UPDATE trigger fires)"* — is **wrong for CONTADO
sales**. `prevent_venta_mutation()` is `BEFORE UPDATE OR DELETE` only
(unchanged since `0006`); it never fires on INSERT, so a CONTADO sale
(`saldo_pend_usd = 0` at birth, written directly into the single `INSERT INTO
ventas` by `crearVenta()` — confirmed single-write invariant, no follow-up
UPDATE ever happens) is stuck forever at `DEFAULT 'pendiente'`, contradicting
spec's own "CONTADO sale fully paid at creation → `pago`" scenario. CREDITO
sales happen to match the default by coincidence (`saldo_pend_usd = total_usd`
→ `'pendiente'` is correct), masking the bug. Once Phase 3's read-path swap
ships (`estado != 'pago'`), every CONTADO sale would wrongly show as CxC
pending — silent mass descuadre. Full evidence trail: Engram
`sdd/cxc-sync-snapshot-redesign/explore-estado-insert`.

**Fix, in two parts, both required:**
1. A **new, separate** `BEFORE INSERT ON ventas` trigger function (§3b) that
   derives `estado` by saldo magnitude only (no `reversado`/`parcial` possible
   at birth — see §3b for why). **Hard constraint, must not be violated**:
   this must NOT be folded into `prevent_venta_mutation()` — see §3b.
2. Client-side optimistic `estado` write on both live INSERT paths (§3c):
   `crearVenta()` (`use-ventas.ts`, shared by POS + Citas/Agenda) and the SAL
   legacy-import INSERT (`use-importar-cxc.ts`). Today these write no
   `estado` at all, so the local SQLite row is `NULL` (not even
   `'pendiente'`) until the next sync-down — a secondary, smaller bug fixed
   by the same change.

No connector.ts change is needed (§3c explains why). `DEFAULT 'pendiente'`
stays unchanged (§4, defensive fallback for the one bypass case: a bulk
import run with triggers disabled). Migration numbering: the INSERT trigger
is **folded into the still-unapplied, uncommitted `0106`** rather than given
its own number — see §8 for the rationale. Everything else in this design
(§1, §2, §5-§7, §9) is unchanged and still correct; only §3/§4/§8 and the
risk tables are amended below.

## Architecture Overview

One new trigger-derived column (`ventas.estado`), one existing trigger function
extended (not replaced), one additive migration, one read-only backfill. No
sync-rules change (sibling scope, untouched). The hardest problem — offline
correctness with no local SQLite triggers — reuses a mechanism **already live
in production** for `clientes.saldo_actual`/`saf_disponible`:
`connector.ts`'s `TRIGGER_MANAGED_PATCH_COLUMNS` strip-before-upload list.

## 1. Offline-Hybrid Trigger Reconciliation (core decision)

**Chosen: local-optimistic + server-authoritative, via the existing
strip-on-upload mechanism.**

Verified in `src/core/db/powersync/connector.ts:124-135`:
`TRIGGER_MANAGED_PATCH_COLUMNS` already strips `clientes: ['saldo_actual',
'saf_disponible']` and `saf_creditos_lotes: [...]` from every `PATCH` before
it reaches Supabase. Local writes compute the value optimistically in TS for
instant UI feedback; the authoritative value only arrives back down via the
normal replication/download stream once the server trigger computes it.

**Decision**: add `ventas: ['estado']` to that same dict. The client computes
an optimistic local `estado` as a **pure function** of
`saldo_pend_usd`/`total_usd` (+ last-`REV`-movement lookup), mirroring the
trigger's CASE logic exactly (§3/§4 below) — new file
`src/features/cxc/lib/estado-venta.ts`.

```ts
// src/features/cxc/lib/estado-venta.ts (new)
export type EstadoVenta = 'pendiente' | 'parcial' | 'pago' | 'reversado'

/** Mirrors prevent_venta_mutation()'s CASE in migrations/0106. Keep in sync. */
export function calcularEstadoVenta(
  saldoPendUsd: Decimal,
  totalUsd: Decimal,
  ultimoMovimientoTipo: string | null
): EstadoVenta {
  const tol = new Decimal('0.005')
  if (ultimoMovimientoTipo === 'REV' && saldoPendUsd.gt(tol)) return 'reversado'
  if (saldoPendUsd.lte(tol)) return 'pago'
  if (saldoPendUsd.gte(totalUsd.minus(tol))) return 'pendiente'
  return 'parcial'
}
```

The local write path (`use-cxc.ts`'s payment/NC/reversal mutations) calls this
function to set `estado` on the local SQLite row immediately after computing
the new `saldo_pend_usd`, same place it already sets the optimistic
`saldo_pend_usd` value. Because `estado` is stripped from the PATCH upload,
the client's guess can never fight the server's answer over the wire — the
column simply gets overwritten by the authoritative value on the next
download cycle, exactly like `saldo_actual` has worked since migration 0061.

**PowerSync propagation — resolved from docs, not a spike**: Context7
(`/powersync-ja/powersync-docs`, "Custom Conflict Resolution") confirms the
backend→client path: *"Source database updates ... → PowerSync Service
detects changes through replication stream → Clients download updates →
Local SQLite updates."* Replication reads the Postgres WAL, which captures
trigger-caused writes identically to application writes. No spike needed for
propagation itself.

**Phase-0 spike (narrower, real risk) — CLOSED by precedent, not re-executed.**
See `rollout/phase0-spike-runbook.md` (status annotated at top of that file).
The open question was: does a local `writeTransaction()` spanning
`movimientos_cuenta` INSERT + `ventas` PATCH upload to Supabase in the same
order, so the trigger's "last movement" lookup never reads a stale row? This
was never formally executed under this change's own banner (only step 0.1,
instrumentation, ran — see `tasks.md` Phase 0). It is de-risked by a
**strictly harder** real-world precedent: `saf-snapshot-y-trazabilidad`'s own
design explicitly asserts the same ordering guarantee and ships a 4-table
chain (`movimientos_cuenta → saf_creditos_lotes → saf_creditos_aplicaciones →
ventas`) on top of it — verified PASS WITH WARNINGS in production, with zero
reported ordering failures (the one production bug found there, #5180, was a
missing sync-rules table entry, unrelated to ordering). This change's
2-table chain (`movimientos_cuenta → ventas`) is a subset of that already-proven
chain. **Decision: treat as closed by precedent, documented here rather than
re-run.**

## 2. Conflict/Ordering (saldo_pend_usd dependency — residual, pre-existing risk)

`estado` is a **pure function of `ventas.saldo_pend_usd`/`total_usd`** (never
of raw ledger replay). Consequence: `estado`'s correctness is bounded by
`saldo_pend_usd`'s correctness, and `saldo_pend_usd` is maintained by
client-computed-delta PATCHes (last-arrival-wins per row), **not recomputed
server-side from the ledger** — a pre-existing concurrency limitation (same
category as the 0097 bug history), not introduced or fixed by this change.
The §6 invariant query is the detection mechanism for drift, not a cure.

## 3. Trigger Design — UPDATE/DELETE Path (existing, unchanged scope)

**`prevent_venta_mutation()` (BEFORE UPDATE OR DELETE ON `ventas`) — extend,
all existing guards byte-identical to migration 0097 (verified: unchanged
since 0097, confirmed via grep — no migration since has touched it):**

```sql
CREATE OR REPLACE FUNCTION prevent_venta_mutation()
RETURNS TRIGGER AS $$
DECLARE
  last_mov_tipo TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las ventas no se pueden eliminar';
  END IF;
  -- Frozen-columns guard — byte-identical to 0097, UNCHANGED.
  IF NEW.nro_factura IS DISTINCT FROM OLD.nro_factura
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     OR NEW.total_usd IS DISTINCT FROM OLD.total_usd
     OR NEW.total_bs IS DISTINCT FROM OLD.total_bs
     OR NEW.tasa IS DISTINCT FROM OLD.tasa
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.deposito_id IS DISTINCT FROM OLD.deposito_id
     OR NEW.total_exento_usd IS DISTINCT FROM OLD.total_exento_usd
     OR NEW.total_base_usd IS DISTINCT FROM OLD.total_base_usd
     OR NEW.total_iva_usd IS DISTINCT FROM OLD.total_iva_usd
     OR NEW.total_igtf_usd IS DISTINCT FROM OLD.total_igtf_usd THEN
    RAISE EXCEPTION 'Solo se puede actualizar saldo_pend_usd, status y estado de una venta';
  END IF;
  -- status transition guard — byte-identical to 0097, UNCHANGED.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status != 'ACTIVA' OR NEW.status != 'ANULADA' THEN
      RAISE EXCEPTION 'El status solo puede cambiar de ACTIVA a ANULADA';
    END IF;
  END IF;
  -- saldo_pend_usd ceiling guard — byte-identical to 0097, UNCHANGED.
  IF NEW.saldo_pend_usd > OLD.saldo_pend_usd AND NEW.saldo_pend_usd > NEW.total_usd THEN
    RAISE EXCEPTION 'El saldo pendiente no puede exceder el total de la factura';
  END IF;

  -- NEW (this migration): derive estado whenever saldo_pend_usd changes.
  IF NEW.saldo_pend_usd IS DISTINCT FROM OLD.saldo_pend_usd THEN
    SELECT tipo INTO last_mov_tipo FROM movimientos_cuenta
    WHERE venta_id = NEW.id
    ORDER BY fecha DESC, created_at DESC, id DESC LIMIT 1;

    NEW.estado := CASE
      WHEN last_mov_tipo = 'REV' AND NEW.saldo_pend_usd > 0.005 THEN 'reversado'
      WHEN NEW.saldo_pend_usd <= 0.005 THEN 'pago'
      WHEN NEW.saldo_pend_usd >= NEW.total_usd - 0.005 THEN 'pendiente'
      ELSE 'parcial'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Correctness note on ordering**: this lookup only works if the
`movimientos_cuenta` row lands in Postgres *before* the `ventas` PATCH.
Verified against current write-sites (`use-cxc.ts`: ledger INSERT always
precedes the balance-column UPDATE within the same local transaction) —
consistent with the closed Phase-0 spike in §1.

**No whitelist code change required**: the frozen-columns `OR`-chain lists
explicit column names; `estado` is not among them, so the ALTER TABLE adding
the column does not need a separate guard patch to become writable. We still
update the function's error message (`'...status y estado...'`) and add a
comment documenting `estado` as explicitly-mutable, to stop a future
maintainer from reflexively adding it to the frozen list.

## 3b. Trigger Design — INSERT Path (NEW — separate function, hard constraint)

**HARD CONSTRAINT (verbatim from exploration, must not be violated by
apply):** this MUST be a separate trigger function. Do **NOT** widen
`prevent_venta_mutation()` to also fire `BEFORE INSERT` — on INSERT, Postgres
sets `OLD` to `NULL` for the whole row, so every frozen-column
`NEW.x IS DISTINCT FROM OLD.x` guard in §3 evaluates `TRUE` for every
non-null `NEW.x`, and **every single `crearVenta()` call would immediately
fail** with `'Solo se puede actualizar saldo_pend_usd, status y estado de una
venta'` (P0001 — the connector treats this as FATAL). This is verified by
direct read of the guard logic, not hypothetical. Keep `prevent_venta_mutation()`
exactly as shipped in `0106` (§3) — zero changes to that function.

**New function, `derive_venta_estado_insert()`, `BEFORE INSERT ON ventas`,
magnitude-only (no last-movement lookup — see why below):**

```sql
CREATE OR REPLACE FUNCTION derive_venta_estado_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.estado := CASE
    WHEN NEW.saldo_pend_usd <= 0.005 THEN 'pago'
    ELSE 'pendiente'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_venta_estado_insert
  BEFORE INSERT ON ventas
  FOR EACH ROW EXECUTE FUNCTION derive_venta_estado_insert();
```

**Why magnitude-only is correct, not a simplification that loses cases:** at
INSERT time, `saldo_pend_usd` is always exactly `0` (CONTADO/ABSORBER/
DIFERENCIAL_FALTANTE) or `total_usd` (CREDITO) — `crearVenta()`'s binary
split (`calcular-cierre-venta-saf.ts:78`), never a partial value at birth.
`'parcial'`/`'reversado'` are therefore **structurally unreachable** at
INSERT: a brand-new invoice cannot have been partially paid or reversed
before its own ledger entry exists. The `movimientos_cuenta` `'FAC'` row for
this venta is inserted *after* the `ventas` INSERT in the same
`writeTransaction` (`use-ventas.ts:969-970`), so a last-movement lookup
inside this trigger would find zero rows every time — not usable and not
needed. This CASE is exactly what `calcularEstadoVenta(saldo, total, null)`
already returns for `ultimoMovimientoTipo = null` — the TS mirror needs zero
changes, it was just never called from the INSERT write-sites (§3c).

**`DEFAULT 'pendiente'` is unaffected and still correct (§4 Q4):** the new
`BEFORE INSERT` trigger unconditionally overwrites `NEW.estado` on every
INSERT through the normal path — the default only matters for the
theoretical bypass case (`ALTER TABLE ventas DISABLE TRIGGER ALL` for a bulk
import), where falling back to `'pendiente'` is the safe/conservative choice
(visible as owing money, never silently invisible as `'pago'`).

## 3c. Client-Side Optimistic `estado` at INSERT (2 write-sites, exhaustive)

Every existing UPDATE write-site (`use-cxc.ts`/`use-notas-credito.ts`, 29
call-sites) already sets optimistic `estado` locally before its PATCH. The
INSERT write-sites set none today — not an architectural difference, a gap.
Fixing it makes the pattern uniform across 100% of write-sites, the same
local-optimistic + server-authoritative principle as §1, applied to the one
place it was missing:

| Write-site | File | Fix |
|---|---|---|
| `crearVenta()` — POS checkout (`cobro-modal.tsx`) **and** Citas/Agenda (`use-citas.ts`), same shared function | `src/features/ventas/hooks/use-ventas.ts` INSERT (~line 542) | Add `estado` to the column list, value = `calcularEstadoVenta(saldoPendFinal, totalUsd, null)` |
| SAL legacy opening-balance import | `src/features/cxc/hooks/use-importar-cxc.ts` INSERT (~line 170) | Add `estado` to the column list, value = `calcularEstadoVenta(montoUsd, montoUsd, null)` (always born-pending, matches `DEFAULT`) |

No other `INSERT INTO ventas` exists anywhere in `src/` (confirmed exhaustive
grep; the only other hit is in `_backup/cxc_20260606/`, a dead folder not
part of the build). `estado-venta.ts` itself needs zero changes — it already
returns the correct value for `ultimoMovimientoTipo = null`.

**Why no `connector.ts` change is needed:** `TRIGGER_MANAGED_PATCH_COLUMNS`
strips `estado` from `PATCH` uploads only (§1); the `PUT` path (fires for a
brand-new local row) has no such strip and uploads the client's optimistic
`estado` as-is. This is harmless by construction: the `BEFORE INSERT` trigger
(§3b) reassigns `NEW.estado` server-side after Postgres binds the incoming
row's values but before it's stored, so the trigger's derived value always
wins regardless of what the client's PUT payload contained — the same
end-effect as the PATCH-strip mechanism, through trigger-overwrite instead of
payload-filtering. Adding PUT-side stripping for `ventas` would be
unnecessary complexity for no behavioral benefit.

## 4. `estado` State Machine + Module × Movement Matrix

| `movimientos_cuenta.tipo` | Touches `ventas.saldo_pend_usd`? | Effect on `estado` |
|---|---|---|
| FAC, CONTADO (`saldo_pend_usd = 0` at birth) | Sets initial debt | **Trigger-derived at INSERT** (§3b) → `'pago'` |
| FAC, CREDITO (`saldo_pend_usd = total_usd` at birth) | Sets initial debt | **Trigger-derived at INSERT** (§3b) → `'pendiente'` (matches `DEFAULT`, but now trigger-authoritative, not coincidental) |
| PAG, NCR, SAF | Yes (reduces) | Recomputed by magnitude: 0→`pago`, 0<x<total→`parcial`, else unreachable (never increases) |
| NDB | No (separate `notas_debito` entity, not tied to a `ventas.id`) | No effect |
| REV | Yes (reopens, capped at `total_usd` per 0097) | `reversado` if resulting saldo>0 (distinguishes "never collected" from "collected-then-reversed"); if a later PAG/NCR/SAF reduces it again, `last_mov_tipo` is no longer `REV` and estado flips to `parcial`/`pago` normally |
| SAL | Yes (opening-balance import, 0043) | Magnitude rule, same as PAG |
| SAFC | No (credit creation, not invoice-specific) | No effect |

CONTADO+NC fully covering the invoice → `saldo_pend_usd=0` → `pago` (not
stuck `parcial`), matching the spec's explicit example.

## 5. Index

New Postgres index (server-side; current `movimientos_cuenta` indexes are
only `empresa_id`/`cliente_id`/`fecha`, confirmed via `0006_ventas.sql:114-116`
— no `venta_id` index exists):
- `idx_mov_cuenta_venta ON movimientos_cuenta(venta_id, fecha DESC, created_at DESC)`
  — critical path for the trigger's "last movement" lookup (§3).

New PowerSync client-side index (`schema.ts`'s `movimientos_cuenta` table,
currently `{ indexes: {} }` — confirmed at line 657): `{ indexes: { by_venta:
['venta_id'] } }` — supports the local TS optimistic lookup mirroring §3's
query.

> Dropped from the original design: `idx_mov_cuenta_cliente_tipo` — that
> index existed only to support the `saf_disponible` invariant/backfill
> aggregate, which already shipped under a different design with its own
> indexing strategy (`saf_creditos_lotes`/`saf_creditos_aplicaciones`). Not
> needed for estado-only scope.

## 6. Validation Query (verification, no mutation)

Estado-only invariant — re-derives `estado` independently from
`movimientos_cuenta` and compares against the stored column, for every
`ventas` row:

```sql
SELECT v.id, v.empresa_id, v.estado AS estado_actual,
  CASE
    WHEN last.tipo = 'REV' AND v.saldo_pend_usd > 0.005 THEN 'reversado'
    WHEN v.saldo_pend_usd <= 0.005 THEN 'pago'
    WHEN v.saldo_pend_usd >= v.total_usd - 0.005 THEN 'pendiente'
    ELSE 'parcial'
  END AS estado_calculado,
  CASE WHEN v.estado = (CASE
    WHEN last.tipo = 'REV' AND v.saldo_pend_usd > 0.005 THEN 'reversado'
    WHEN v.saldo_pend_usd <= 0.005 THEN 'pago'
    WHEN v.saldo_pend_usd >= v.total_usd - 0.005 THEN 'pendiente'
    ELSE 'parcial'
  END) THEN 'PASS' ELSE 'FAIL' END AS resultado
FROM ventas v
LEFT JOIN LATERAL (
  SELECT tipo FROM movimientos_cuenta mc WHERE mc.venta_id = v.id
  ORDER BY mc.fecha DESC, mc.created_at DESC, mc.id DESC LIMIT 1
) last ON true
ORDER BY resultado DESC;
```

## 7. Backfill Design (`0107`)

```sql
BEGIN;

UPDATE ventas v SET estado = sub.estado_calc
FROM (
  SELECT v2.id,
    CASE WHEN last.tipo = 'REV' AND v2.saldo_pend_usd > 0.005 THEN 'reversado'
         WHEN v2.saldo_pend_usd <= 0.005 THEN 'pago'
         WHEN v2.saldo_pend_usd >= v2.total_usd - 0.005 THEN 'pendiente'
         ELSE 'parcial' END AS estado_calc
  FROM ventas v2
  LEFT JOIN LATERAL (
    SELECT tipo FROM movimientos_cuenta mc WHERE mc.venta_id = v2.id
    ORDER BY mc.fecha DESC, mc.created_at DESC, mc.id DESC LIMIT 1
  ) last ON true
) sub
WHERE v.id = sub.id AND v.estado IS DISTINCT FROM sub.estado_calc;

-- Verification: run §6 query here, inspect PASS/FAIL, THEN replace ROLLBACK with COMMIT.
ROLLBACK;
```

Read-only against `movimientos_cuenta` (SELECT/JOIN only); only `ventas` is
written. Idempotent via `IS DISTINCT FROM` (re-running after COMMIT is a
no-op).

## 8. Migration Plan (renumbered — next sequential: latest real is `0105`)

| # | File | Content |
|---|---|---|
| 0106 | `ventas_estado_column.sql` | `ALTER TABLE ventas ADD COLUMN estado ...` + `CREATE INDEX idx_mov_cuenta_venta ...` (§5) + `CREATE OR REPLACE FUNCTION prevent_venta_mutation()` (§3, UPDATE/DELETE path) **+ NEW: `derive_venta_estado_insert()` function + `trg_venta_estado_insert` trigger (§3b, INSERT path)**, all in one file/transaction |
| 0107 | `backfill_ventas_estado.sql` | §7, BEGIN/ROLLBACK-verified by owner before flipping to COMMIT — unchanged, still the number after 0106 |

**Why combined into one migration (0106) instead of separate
column-then-trigger files**: the column and its derivation logic are two
halves of one atomic unit of behavior — a column that exists but is never
derived is a worse intermediate state (silently stuck at `DEFAULT
'pendiente'` for every future UPDATE) than not having the column at all.
Since Postgres migrations already run as a single transaction, splitting
them into two files buys no deployability benefit and adds a renumbering
surface. The backfill (0107) stays separate because it must run only *after*
0106 is live and because the owner verifies it manually via BEGIN/ROLLBACK
before committing — a genuinely separate operational step.

**Why the §3b INSERT trigger is folded into `0106` rather than given its own
number (e.g. a new `0107`, pushing backfill to `0108`):** `0106` is
**unapplied and uncommitted** — task 1.2 (manual Supabase verification) was
never run, and the original CRITICAL-1 gap exists precisely because Phase 1
was never fully closed out. There is no real database, migration-history row,
or open PR anywhere that already depends on `0106`'s current on-disk shape,
so there is no cost to editing it in place — unlike `0097`, which this file
already correctly treats as immutable precedent because it IS applied. Giving
the INSERT trigger its own migration number would create an orphan
file-splitting the column, its UPDATE-derivation, and its INSERT-derivation
across two files for a feature that must ship atomically (a column whose
INSERT path is wrong is exactly the same "worse intermediate state" argument
made above for the column/UPDATE-trigger pairing — it now extends naturally
to the INSERT-trigger pairing too). Folding keeps one coherent "this is how
`ventas.estado` behaves, in full, on both INSERT and UPDATE" migration file.
The backfill (0107) is unaffected by this choice and keeps its number.

Companion code changes (not migrations): `schema.ts` (+`estado: column.text`
on `ventas`, +`by_venta` index on `movimientos_cuenta`), `connector.ts`
`TRIGGER_MANAGED_PATCH_COLUMNS` (+`ventas: ['estado']`), new
`src/features/cxc/lib/estado-venta.ts` (TS mirror of §3's CASE logic, shown
in §1), `use-cxc.ts` read-path swap (read `estado` column, drop dead
`'REVERSADA'` string filter at line 154), **and (this amendment)**
`use-ventas.ts`/`use-importar-cxc.ts` INSERT column lists (§3c) — no
`connector.ts` change needed for the INSERT path (§3c reasoning).

## 9. Duplicated-Derivation-Logic Risk (trigger SQL vs. client TS)

Two independent implementations of the same CASE logic exist: the Postgres
triggers (§3 UPDATE path + §3b INSERT path, now two functions, same source
column list) and the TS pure function (§1). This is a **drift risk** — if one
is edited without the other, local-optimistic and server-authoritative
`estado` values can silently diverge for the window between a local write and
the next sync-down.

**Single source of truth**: the server trigger is authoritative, always. The
client's TS function is optimistic-only — its output is never uploaded
(`TRIGGER_MANAGED_PATCH_COLUMNS` strip) and is always overwritten by the
replicated server value. Drift is therefore cosmetic (a brief UI flash of a
wrong local `estado` between write and next sync), never a data-integrity
bug.

**Mitigation**:
1. Cross-reference comments in both files (`estado-venta.ts` → "mirrors
   prevent_venta_mutation() in migrations/0106, keep in sync"; the migration
   → "mirrored in src/features/cxc/lib/estado-venta.ts").
2. A parity test (`estado-venta.test.ts`) encodes the full §4 matrix as
   fixture data (`saldoPendUsd`, `totalUsd`, `ultimoMovimientoTipo` →
   expected `estado`) and asserts `calcularEstadoVenta()` matches every row.
   The same fixture table is pasted as a comment block in migration `0106`'s
   header so a human reviewer can visually diff the SQL CASE branches against
   the TS branches at the time either one changes. There is no automated
   cross-language enforcement (no DB-test infra exists in this codebase to
   run SQL and TS against the same fixture in one test run) — this is the
   same accepted-risk category as the pre-existing `saldo-cliente.ts` /
   `actualizar_saldo_cliente()` dual-implementation (migration 0088
   precedent).

## Open Risks Remaining

| Risk | Needs spike? |
|---|---|
| Upload-queue order-preservation across tables within one local transaction, under partial-failure/reconnect | **No** — closed by precedent (§1): `saf-snapshot-y-trazabilidad` shipped a strictly harder 4-table chain on the same assumption, verified PASS in production |
| `saldo_pend_usd` last-write-wins drift under multi-device concurrency (pre-existing, not fixed here) | No spike — documented residual risk, monitored via §6 query |
| Local TS mirror of §3's CASE logic drifting from the SQL trigger over time | No spike — mitigated via §9 (cross-reference comments + fixture parity test); cosmetic-only impact since client value is never uploaded |
| §3b's INSERT trigger implemented as a widened `prevent_venta_mutation()` instead of a separate function | No spike — this is a hard design constraint (§3b), not a judgment call; if violated, every `crearVenta()` call hard-fails in production (P0001). Apply-phase must follow §3b's SQL verbatim, and task 1.2's manual Supabase verification (still pending from Phase 1) must include an INSERT smoke test before this is considered closed |
| `use-ventas.test.ts`/`use-importar-cxc.ts` tests asserting the exact INSERT column list break once `estado` is added | No spike — expected, budgeted into tasks.md (§ Phase 1 additions) |
