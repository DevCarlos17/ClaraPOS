## Verification Report

**Change**: conciliacion-lotes-pos
**Version**: N/A (openspec/conciliacion-lotes-pos/spec.md, 2026-07-24)
**Mode**: Standard — no automated test runner exists in this project (no `*.test.ts` infra beyond a handful of pre-existing, already-broken jest-style files unrelated to this change). Verification performed via full source inspection, `yarn type-check` execution, git history precedent checks, and adversarial tracing of every write path touched by this change. No runtime test evidence exists or was claimed for any SDD phase of this project.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 34 |
| Tasks complete (code, `[x]`) | 19 |
| Tasks incomplete (manual QA / non-regression checklist, `[ ]`) | 15 |

The 15 incomplete items are exclusively the "Manual QA" / "Non-regression" checklist rows (1.6-1.9, 2.10-2.14, 3.6-3.11) that explicitly require a live Supabase + PowerSync environment with migration 0079 applied — correctly left unchecked, not a completeness defect. All code-producing tasks (1.1-1.5, 2.1-2.9, 3.1-3.5) are marked done and match the actual diff.

### Build & Tests Execution

**Build**: ➖ Not run (orchestrator instruction: do not run `yarn build`)

**Type-check**: ✅ Re-executed independently, exit code 2, 308 errors — re-verified byte-identical to the claimed baseline.
```text
yarn type-check
→ 308 "error TS" lines total
→ Files with errors (all pre-existing, none touched by this change):
  src/features/citas/components/calendario/calendario-citas.tsx
  src/features/configuracion/components/banco-form.tsx
  src/features/cxc/components/factura-detalle-cxc.tsx
  src/features/clientes/schemas/__tests__/cliente-schema.test.ts
  src/features/configuracion/schemas/__tests__/tasa-schema.test.ts
  src/features/inventario/schemas/__tests__/producto-schema.test.ts
  src/features/ventas/schemas/venta-schema.test.ts
  src/lib/__tests__/currency.test.ts
  src/lib/__tests__/dates.test.ts
  src/lib/__tests__/identity.test.ts
  src/lib/__tests__/utils.test.ts
```
Zero new errors in any of the 13 touched/new files. Confirmed independently, not just trusted from the orchestrator's claim.

**Tests**: ➖ No test runner configured in this project (`package.json` has no `test` script wired to a runner; the `*.test.ts` files above fail to type-check because no jest/mocha types are installed — pre-existing, unrelated to this change).

**Coverage**: ➖ Not available.

### Spec Compliance Matrix (static evidence — no runtime test exists for any scenario)

| Requirement | Scenario | Evidence | Result |
|-------------|----------|----------|--------|
| Lectura descripcion con fallback | SC-01 / SC-02 | `conciliacion-tesoreria.tsx:65` — `'observacion' in mov ? (mov.descripcion ?? mov.observacion) : mov.descripcion`, type-guarded correctly for the `MovBancario \| MovCajaFuerte` union | ✅ COMPLIANT (static) |
| Referencia condicionada | SC-03 / SC-04 | `cobro-modal.tsx:308-311` blocks `handleAddPago` (the only path that appends to `pagos`) when `requiere_referencia===1 && !referencia.trim()`, Spanish toast | ✅ COMPLIANT (static) |
| Sesion legible | SC-05 | `formatSesionId()` in `format.ts`, used in all 3 consolidation `descripcion` templates (consolidado, por-lote, sin-lotes) in `use-sesiones-caja.ts:1162,1180,1200` | ✅ COMPLIANT (static) |
| Captura de lotes | SC-06 / SC-07 | `LotesPosMiniTable` — add/edit/delete wired to `agregarLote`/`actualizarLote`/`eliminarLote`; `sum(lotes)` synced into `fisico[m.nombre]` via `useEffect` (`cuadre-conteo-fisico.tsx:142-151`) | ✅ COMPLIANT (static) |
| Lote unico por metodo | SC-08 | `UNIQUE (empresa_id, metodo_cobro_id, sesion_caja_id, nro_lote)` — Postgres-only, see WARNING-1 for local-schema gap | ⚠️ PARTIAL (server-enforced only) |
| Persistencia offline-first | SC-09 | Local `db.writeTransaction()` per CRUD op; upload path unaffected by sync rules — BUT see CRITICAL-1: table not in `by_empresa` bucket, so data cannot be read back down | ⚠️ PARTIAL — upload works, download/multi-device read does not |
| Enrutamiento consolidado / por-lote | SC-10 / SC-11 | `use-sesiones-caja.ts:1150-1185` — `config.consolidar_lotes===1` → one `consolidarMetodoATesoreriaEnTx` on `sumaLotesD` + one commission on total; `===0` → N× transfer + N× commission per lote | ✅ COMPLIANT (static) |
| Moneda nativa / fail-close | SC-12 | W4 check (`destinoMonedaId !== config.moneda_id`, line 1081) runs before the lote branch for every method, unconditionally | ✅ COMPLIANT (static) |
| No regresion no-POS / sin lotes | SC-13 (HARD) | ELSE branch (`use-sesiones-caja.ts:1190-1203`) is byte-identical to pre-change code except `id` → `formatSesionId(id)` in the description text (intended, global T2 change, not POS-specific) | ✅ COMPLIANT (static) |
| Atomicidad | SC-14 | All lote-routing writes execute inside the existing `writeTransaction`; `UPDATE status='CERRADA'` confirmed still the last write (line 1213-1215), unchanged relative position | ✅ COMPLIANT (static) |

**Compliance summary**: 8/10 requirement groups fully compliant by static inspection; 2 flagged PARTIAL due to the sync-rules gap (CRITICAL-1) and the missing local unique-index mirror (WARNING-1).

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Non-regression (non-PUNTO / no-batch path) | ✅ Implemented | Structurally exclusive `if (lotesDelMetodo.length > 0) {...} else {...}` — the ELSE path is untouched aside from the intentional, spec-mandated `formatSesionId` swap |
| No double-counting | ✅ Implemented | `consolidacionPorMetodo` is a `Map` keyed by `metodo_cobro_id` (one entry per method, built once from a `GROUP BY` query) → `metodosParaConsolidar` has each method at most once → the lote/no-lote branch is a single `if/else`, structurally impossible to hit both paths for the same method in the same close |
| `sesiones_caja_detalle.total_sistema` stays pagos-derived | ✅ Implemented | Step 6 (`~line 822-925`) is entirely outside this diff — confirmed via `git diff` hunks, no changes in that region |
| Atomicity / Opcion 1 ordering | ✅ Implemented | Batch query + branching happen after step 7 (SAF), before step 10 (`UPDATE status='CERRADA'`), all inside one `writeTransaction`; verified via direct file read at both boundaries |
| Batch query multi-tenant filter | ✅ Implemented | `WHERE empresa_id = ? AND sesion_caja_id = ?` (`use-sesiones-caja.ts` new lotes query) |
| `use-lotes-pos.ts` read filter | ✅ Implemented | `useLotesPos` SELECT filters `empresa_id` + `sesion_caja_id` |
| `use-lotes-pos.ts` write filter (UPDATE/DELETE by id, no `empresa_id` in WHERE) | ✅ Consistent with codebase convention | Verified against 130+ existing `UPDATE ... WHERE id = ?` / `DELETE ... WHERE id = ?` call sites across `use-payment-methods.ts`, `use-bancos.ts`, `use-cxc.ts`, `use-ventas.ts`, etc. — this project's established pattern relies on RLS (`empresa_id = current_empresa_id()`) + PowerSync bucket scoping for id-keyed mutations, not an inline filter. Not a deviation introduced by this change. |
| Bimonetary / decimal precision | ✅ Implemented | `monto` stored `NUMERIC(18,4)` in Postgres, `column.text` in PowerSync/Kysely (decimal-as-string convention); all close-time math uses `Decimal` (`decimal.js`), never `float`/`Number` for money |
| Migration 0079 correctness | ✅ Implemented | Table/columns/NOT NULL/CHECK/indexes/trigger/RLS (SELECT+INSERT+UPDATE+DELETE, explicitly deviating from the immutable-ledger default per design) all present and match `design.md` exactly; `ALTER PUBLICATION powersync ADD TABLE lotes_pos_cuadre` present, idempotent via `DO $$ ... IF NOT EXISTS` guard |
| PowerSync schema.ts / Kysely types mirror | ✅ Implemented | `column.integer` for `consolidar_lotes` (boolean-as-int), `column.text` for `monto` (decimal-as-string) — matches project convention exactly; `LotesPosCuadre` Kysely interface mirrors 1:1 |
| Zod `lote-pos-schema.ts` | ✅ Implemented | `nro_lote: z.string().min(1)`, `monto: z.number().positive()`, `metodo_cobro_id`/`moneda_id: z.string().uuid()` |
| UI: mini-table only for `tipo==='PUNTO'` | ✅ Implemented | Conditional render at `cuadre-conteo-fisico.tsx:~101`; non-PUNTO methods render the original single-input block unchanged (structurally identical JSX, just re-indented) |
| UI: readOnly / closed-session path | ✅ Implemented | `sesionCajaId` forced to `null` when `readOnly` — falls back to the pre-existing `total_fisico`-from-`sesiones_caja_detalle` read-only display path (lines 80-104), which already existed and is untouched |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Batch sum replaces `totalSistemaD` (never summed on top) | ✅ Yes | `if/else` structurally exclusive, confirmed by direct read |
| Live persistence (not buffered) | ✅ Yes | Every `agregarLote`/`actualizarLote`/`eliminarLote` call is its own `db.writeTransaction()` |
| RLS deviation (full CRUD, no anti-mutation trigger) | ✅ Yes | Migration matches design exactly |
| `tipo='PUNTO'` filter (not `usa_pos`) | ✅ Yes | Used consistently in `cuadre-conteo-fisico.tsx`, `use-sesiones-caja.ts`, `metodosPuntoData` query |
| Batch query as `GROUP BY metodo_cobro_id` (design pseudocode) | ⚠️ Deviation (benign) | Design's pseudocode (`SELECT nro_lote, monto ... GROUP BY metodo_cobro_id`) is not valid grouped SQL as written (selects non-aggregated columns under a `GROUP BY`); the actual implementation does a plain `SELECT metodo_cobro_id, nro_lote, monto ...` and groups in JS into a `Map`. This is a correct fix of the design's pseudocode, not a functional problem — noted for design-doc hygiene only. |
| **Migration/rollout: PowerSync sync rules** | ❌ **Missing from design entirely** | See CRITICAL-1. `design.md`'s File Changes table never mentions `backend/powersync-sync-rules.yaml`, even though the established project precedent (commit `bba3b2d`, "fundacion consolidacion cierre a tesoreria") added `caja_fuerte`, `mov_caja_fuerte`, `traspasos_tesoreria` to that exact file's `by_empresa` bucket in the same PR that added those tables via migration + `ALTER PUBLICATION`. This is a gap in the design artifact, not just an apply-phase slip. |

### Issues Found

**CRITICAL**:

1. **`lotes_pos_cuadre` is missing from `backend/powersync-sync-rules.yaml`'s `by_empresa` bucket — new table cannot be read back down from Supabase, defeating the sync/multi-device guarantees the feature depends on.**
   - File: `backend/powersync-sync-rules.yaml` (not modified by this change; verified via `git diff --stat` returning empty for this path).
   - Evidence of precedent: `git log -p --follow -- backend/powersync-sync-rules.yaml` shows commit `bba3b2d` ("fundacion consolidacion cierre a tesoreria (PR1)") added `caja_fuerte`, `mov_caja_fuerte`, and `traspasos_tesoreria` to this file's `by_empresa` bucket in the SAME change that introduced those tables via migration + `ALTER PUBLICATION`. The file's own header comment states: *"Cada vez que se agregan tablas nuevas a este archivo, tambien hay que agregarlas a la publicacion de replicacion logica de Supabase"* — i.e., adding to sync-rules.yaml and running `ALTER PUBLICATION` are two halves of ONE required step for any new PowerSync table. `migrations/0079_lotes_pos_cuadre.sql` does the `ALTER PUBLICATION` half (line 63-71) but the sync-rules.yaml half was never done, and neither `design.md`'s File Changes table nor `tasks.md` mentions this file at all.
   - Impact: PowerSync sync rules govern DOWNLOAD (what data flows from Supabase into each client's local SQLite via buckets); local writes still upload fine via the connector's `uploadData()` regardless of sync rules, so rows DO land in Postgres (satisfying the literal letter of SC-09's "sincroniza a Supabase" on the write side). But because no bucket ever delivers `lotes_pos_cuadre` rows back down: (a) a second device/tab for the same empresa (e.g., a supervisor terminal reviewing the same open session) will show ZERO lotes even though they exist in Postgres; (b) if the local PowerSync client ever performs a full resync (logout/login, token refresh edge cases, browser storage cleared, cache eviction) between the moment lotes are captured and the moment the session is closed, the locally-inserted rows disappear entirely (since they are never re-populated from any bucket) — `cerrarSesionCaja`'s own batch query (`use-sesiones-caja.ts`, new `lotesResult`) reads exclusively from local SQLite, so it would silently take the `ELSE`/`totalSistemaD` path with **no error, no warning**, discarding the very bank-settlement reconciliation this entire feature (SC-06 through SC-14) exists to provide.
   - Fix: add `- SELECT * FROM lotes_pos_cuadre WHERE empresa_id = bucket.empresa_id` to the `by_empresa` bucket in `backend/powersync-sync-rules.yaml`, and re-paste the updated rules into the PowerSync Cloud Dashboard (same manual step already flagged for the migration itself).

**WARNING**:

1. **No client-side duplicate-`nro_lote` guard; local schema has no matching unique index.**
   - Files: `src/features/reportes/components/cuadre-conteo-fisico.tsx` (`LotesPosMiniTable.handleAgregar`, ~L244-275); `src/core/db/powersync/schema.ts` (`lotes_pos_cuadre` Table defined with `{ indexes: {} }`, no unique index mirrored locally).
   - The Postgres `UNIQUE (empresa_id, metodo_cobro_id, sesion_caja_id, nro_lote)` constraint (migration 0079) is enforced only server-side. Nothing in `handleAgregar` checks the already-loaded `lotes` prop for a duplicate `nro_lote` before calling `agregarLote`, and the local PowerSync SQLite table has no local unique index. An offline (or even online, race-prone) cajero can type the same `nro_lote` twice for the same método+sesión; both inserts succeed locally with no feedback. The conflict only surfaces later as an upload rejection, which — combined with CRITICAL-1's sync-rules gap — may go unnoticed by the cajero entirely.
   - Suggest: add a client-side duplicate check in `handleAgregar` before calling `agregarLote`, using the already-available `lotes` prop.

2. **`usePagosPorMetodo` (drives which `PUNTO` methods can receive lote entries in the cuadre UI) does not filter `is_reversed`, while `cerrarSesionCaja`'s `metodosUsadosResult` (drives `metodosParaConsolidar`, which gates whether captured lotes are ever routed) does.**
   - Files: `src/features/reportes/hooks/use-cuadre.ts:351-369` (`buildCuadreWhere`, no `is_reversed` clause) vs. `src/features/caja/hooks/use-sesiones-caja.ts:838` (`AND COALESCE(p.is_reversed, 0) = 0`).
   - Pre-existing inconsistency, not introduced by this change. But its financial blast radius grows here: before this change, the "Físico" input was a pure comparison value with zero effect on the actual transferred amount. Now, for `tipo='PUNTO'` methods, the lote sum directly REPLACES the Tesorería transfer amount. If a `PUNTO` method's only `pagos` rows in the session were later reversed, the method could still surface in the cuadre UI (letting the cajero load lotes against it) yet never appear in `metodosParaConsolidar` (built from non-reversed pagos only) — captured lotes for that method would be silently dropped at close: no transfer, no error, no diferencia flag pointing at it specifically.
   - Suggest: either filter `is_reversed` in `usePagosPorMetodo`'s main query, or add a close-time guard that surfaces (warns, or fails-closed) when `lotesPorMetodoMap` has an entry for a `metodoCobroId` absent from `metodosParaConsolidar`.

3. **Unrelated files modified in the same working tree** — `openspec/specs/caja/spec.md`, `.atl/.skill-registry.cache.json`, `.atl/skill-registry.md`, `task.md` are all modified but belong to archiving the separate `cierre-consolidacion-tesoreria` change (new `openspec/cierre-consolidacion-tesoreria/archive-report.md` is untracked evidence of this). Not a defect in `conciliacion-lotes-pos` itself, but flagging so these are NOT bundled into PR-A/B/C commits for this change.

**SUGGESTION**:

1. UI-side lote-sum totals (`cuadre-conteo-fisico.tsx` — `suma = lotes.reduce((acc, l) => acc + (parseFloat(l.monto) || 0), 0)`, and the same pattern inside `LotesPosMiniTable`) use plain JS floats, matching the pre-existing single "Físico" input's precision level (not a regression). Since lote amounts now drive a real Tesorería transfer (via the `Decimal`-safe `use-sesiones-caja.ts` code, which is correct), consider switching the UI running-total display to `Decimal` too, purely for display consistency at the edges (2-decimal POS amounts make an actual float bug astronomically unlikely, but it's a one-line change for full rule-10 consistency end-to-end).
2. `migrations/0079_lotes_pos_cuadre.sql:80` — `UPDATE metodos_cobro SET consolidar_lotes = TRUE WHERE consolidar_lotes IS NULL;` is unreachable dead code (`ADD COLUMN ... NOT NULL DEFAULT TRUE` already backfills all existing rows atomically in the same statement). Harmless, but can be dropped for clarity.

### Verdict (original review)
**FAIL** — superseded below by the re-review addendum.

Reason (historical): the core financial logic (non-regression, no double-counting, atomicity/ordering, bimonetary/decimal handling, multi-tenant filtering on reads) is correctly implemented and matches design.md and spec.md exactly under static inspection, and `yarn type-check` is independently confirmed clean on every touched file. However, CRITICAL-1 (`lotes_pos_cuadre` never added to `backend/powersync-sync-rules.yaml`'s `by_empresa` bucket) is a real, precedent-contradicting gap that breaks the offline-first sync guarantee this feature is built on: captured batch data can silently vanish from local storage before session close (multi-device, full resync, cache eviction), causing `cerrarSesionCaja` to fall back to the pre-change `totalSistemaD` path with no error — quietly defeating the entire point of the feature (bank-settlement reconciliation) exactly in the scenario it exists to handle. This must be fixed (one YAML line + re-paste into PowerSync Cloud Dashboard) before PR-B/PR-C ship.

---

## Re-review addendum (fresh-context, adversarial, two fixes only)

**Scope**: independently re-verify FIX 1 (CRITICAL-1) and FIX 2 (WARNING #2) only, from a clean context, without trusting the prior review's own conclusions. Source re-read in full; `git diff` inspected against the pre-feature base; `yarn type-check` re-executed independently.

### FIX 1 — `backend/powersync-sync-rules.yaml` (resolves CRITICAL-1)

`git diff` confirms exactly two additions, nothing else touched:
- Header prerequisite comment block (lines 31-32): `ALTER PUBLICATION powersync ADD TABLE "public"."lotes_pos_cuadre";`, in the same style as the other documented tables.
- `by_empresa` bucket, CAJA/TESORERIA section (line 107): `- SELECT * FROM lotes_pos_cuadre WHERE empresa_id = bucket.empresa_id`, inserted directly after `sesiones_caja_detalle` and before `movimientos_metodo_cobro` — byte-identical pattern to every sibling line in that bucket.

YAML structure verified intact end-to-end (full file re-read, 146 lines, all other buckets/lines unchanged). **CRITICAL-1 is resolved.**

### FIX 2 — `src/features/caja/hooks/use-sesiones-caja.ts` (resolves WARNING #2)

Traced `cerrarSesionCaja` end-to-end against the exact `git diff` hunk (not just the final file) to separate "what changed for this fix" from "what PR-C already established."

- **Union construction** (`metodosParaConsolidarBase` from pagos/`is_reversed=0`, `metodoIdsConLotes` from a new `SELECT DISTINCT metodo_cobro_id FROM lotes_pos_cuadre WHERE empresa_id=? AND sesion_caja_id=?`, `metodoIdsSoloLotes = metodoIdsConLotes \ metodoIdsBase`): mathematically a disjoint union. `metodosParaConsolidarBase` comes from a `Map` (unique keys by construction); `metodoIdsSoloLotes` is explicitly filtered to exclude anything already in `metodoIdsBase`. **No metodo_cobro_id can appear twice in `metodosParaConsolidar`** — verified by construction, not just by testing a scenario.
- **No double-routing**: the per-method loop body is still a single `if (lotesDelMetodo.length > 0) {...} else {...}`, structurally exclusive. A method present in both the pagos-set and the lotes-set is still processed exactly once, and — per the PR-C rule already verified in the original review — its lote sum *replaces* `totalSistemaD` rather than adding to it. This part of the logic was untouched by FIX 2 (confirmed via the diff hunk); FIX 2 only changed *which methods enter the loop*, not what happens once they're inside it.
- **Non-regression for lote-less methods**: `lotesDelMetodo = lotesPorMetodoMap.get(metodoCobroId) ?? []` is empty for any method absent from `lotes_pos_cuadre`, so they take the unchanged `else` branch — confirmed byte-identical (comment even says "Camino existente sin cambios") except the pre-existing, already-reviewed `formatSesionId(id)` swap.
- **Solo-lotes correctness**: every `mid` in `metodoIdsSoloLotes` originates from the *same* `lotes_pos_cuadre` table/filter (`empresa_id`+`sesion_caja_id`) as `lotesPorMetodoMap`, so `lotesDelMetodo.length > 0` is guaranteed true for these entries — the `new Decimal(0)`/`''` placeholder is provably dead data, never read for routing. Confirmed no code path reads `totalSistemaD`/`monedaIdBase` outside the `lotesDelMetodo.length > 0` check and the `monedaId = monedaIdBase || config.moneda_id` fallback.
- **Currency fail-close**: the `destinoMonedaId !== config.moneda_id` check (W4) sits before the `lotesDelMetodo.length > 0` branch and does not depend on `monedaIdBase` — it runs unconditionally for every entry in `metodosParaConsolidar`, solo-lotes included. Confirmed still present and unmoved relative to the branch point.
- **Atomicity / Opcion 1 ordering**: the new `metodosConLotesResult` query is a plain `tx.execute(SELECT ...)` — read-only, no interleaving write — placed inside the same `writeTransaction` callback, before the step-8/9 config+lotes fetch and loop, and well before the step-10 `UPDATE status='CERRADA'` (confirmed still the transaction's last statement).
- **Multi-tenant**: `metodosConLotesResult` filters `WHERE empresa_id = ? AND sesion_caja_id = ?` with `[empresaId, id]` — both dimensions present.

No regression, no double-count, no dead-currency risk found. **WARNING #2 is resolved.**

### Type-check re-verification

Re-ran `yarn type-check` independently: exit code 2, **308** `error TS` lines — identical count to the original baseline. Filtered out every line matching `*.test.ts`, `calendario-citas.tsx`, `banco-form.tsx`, `factura-detalle-cxc.tsx`: **zero remaining matches**, i.e. zero new errors anywhere, including in the two touched files. Baseline unchanged.

### Remaining deferred debt (unchanged by these fixes, still non-blocking)

- **WARNING #1** (no client-side duplicate-`nro_lote` guard; no local unique index) — untouched by either fix, still applies as documented above.
- **WARNING #3** (unrelated working-tree files from `cierre-consolidacion-tesoreria`'s archive: `openspec/specs/caja/spec.md`, `.atl/.skill-registry.cache.json`, `.atl/skill-registry.md`, `task.md`) — still present per `git status`, still out of scope for this change's commits.
- **SUGGESTION 1** (float-based UI running totals) and **SUGGESTION 2** (dead UPDATE line in migration 0079) — both untouched, still low-severity, non-blocking.

None of these became blocking as a result of the two fixes; none interact with the fixed code paths.

### Verdict (re-review)
**PASS WITH WARNINGS**

Both blocking issues from the original FAIL verdict are confirmed fixed with no regression: CRITICAL-1 (sync-rules.yaml gap) is closed with the exact minimal, pattern-matching addition; WARNING #2 (is_reversed inconsistency causing silent lote drop) is closed with a provably-correct, deduplicated union that preserves the existing non-regression and no-double-count guarantees. `yarn type-check` baseline is unchanged (308 pre-existing errors, zero new). Remaining WARNING #1/#3 and both SUGGESTIONs are accepted as pre-existing, non-blocking debt, unaffected by this round of fixes. Cleared to ship.
