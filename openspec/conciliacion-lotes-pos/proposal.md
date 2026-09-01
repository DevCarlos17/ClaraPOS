
# Proposal: conciliacion-lotes-pos

_Date: 2026-07-24 | Model: anthropic/claude-sonnet-5_

---

## Intent

Bank reconciliation is illegible today: `movimientos-table.tsx` only reads `mov.descripcion` while every INSERT path (ventas, CxC, abono global) writes the human-readable text into `observacion` instead — so the table shows `-` for almost every row even though the data exists. Cash sessions are shown as raw uuids. And POS payment methods (tarjeta débito/crédito) have no concept of a "lote de punto de venta" (batch report) anywhere in the system, even though that's how cashiers actually reconcile against the bank: some banks (Banesco) settle **one transfer per batch**, others (Mercantil) settle **one consolidated transfer per day**. Today the cierre only produces a single summed amount per method, with no batch traceability and no way to model either settlement pattern.

This change is additive, built directly on top of the just-stabilized `cierre-consolidacion-tesoreria` transaction (obs #537) — it must not change behavior for non-POS methods or the already-fixed consolidation ordering.

---

## Scope

### In Scope

**TANDA 1 — bugfix (low risk):**
- 1a. `movimientos-table.tsx` reads `descripcion ?? observacion` (matches the pattern already used correctly in the older `conciliacion-bancaria.tsx:207`).
- 1b. `cobro-modal.tsx` respects `metodos_cobro.requiere_referencia` instead of always showing "Ref. (opcional)" — same pattern already implemented in `gasto-form.tsx:1317` and `citas/step-checkout.tsx:222`.

**TANDA 2 — session legibility (small):**
- Session displayed as `SES-${id.slice(0,8).toUpperCase()}` wherever a raw session uuid currently shows (starting with the consolidation description in `use-sesiones-caja.ts:1077`). No schema change, no new correlativo.

**TANDA 3 — lotes POS (feature, new schema):**
- New auxiliary table in `cuadre-conteo-fisico.tsx` for POS payment methods: N rows of `{ metodo_cobro_id, nro_lote (manual text), monto }`, editable/deletable before the session closes. **Replaces** the single amount input for POS methods only; the method's total = sum of its batches.
- New column `metodos_cobro.consolidar_lotes` (boolean): `false` → each batch produces its own Tesorería transfer + its own commission (e.g. Banesco); `true` → one summed transfer per method, with batch numbers listed in the description (`"Lotes: 10, 11"`) (e.g. Mercantil). Commission math is unchanged in principle — applied per the amount it's computed against (batch or total, per flag).
- Non-POS methods (efectivo, transferencia, etc.) are untouched.

### Out of Scope

- Sequential session correlativo (`SES-C01-000123` style) — postponed, conflicts with offline-first eventual sync until the architecture is defined.
- Date/lote-number/monto range queries in the bancos module (bank-style search) — explicitly deferred by the user to a future change.
- Reopening a closed session, and the pre-existing `caja_fuerte.saldo_actual` concurrency race — untouched, out of scope.

---

## Capabilities

> Existing specs: `openspec/specs/caja/spec.md`. No `tesoreria`/`conciliacion` main spec exists yet — `tesoreria-consolidacion-cierre` still lives unarchived under `openspec/cierre-consolidacion-tesoreria/specs/` pending QA (dependency, see Risks).

### New Capabilities
- `conciliacion-bancaria-legibilidad`: reconciliation table shows the real transaction text (`descripcion ?? observacion`), reference field only appears when the method requires it, and sessions display as `SES-XXXXXXXX`.
- `lotes-pos-cuadre`: capture N POS batch reports per method at cierre, sum into the method total, and route each batch or the consolidated total to Tesorería per the method's `consolidar_lotes` flag.

### Modified Capabilities
- `caja`: `cuadre-conteo-fisico.tsx` gains the batch-entry table replacing the simple amount input, for POS methods only.
- `tesoreria-consolidacion-cierre` (sibling, unarchived): the consolidation loop in `cerrarSesionCaja` gains per-lote vs. consolidated branching for `consolidar_lotes=true/false`.

---

## Approach

T1/T2 are pure read/display fixes — no schema, no transaction changes, safe to ship first. T3 adds a new PowerSync table (batches captured locally, offline-first, no server sequence) plus a boolean flag on `metodos_cobro`, and extends the *existing* per-method consolidation loop in `cerrarSesionCaja` (from the sibling change) with an if/else: iterate batches individually when `consolidar_lotes=false`, or sum them into one transfer with a `"Lotes: ..."` description when `true`. This is additive surgery on a loop that already exists — no new transaction shape, no change to non-POS branches. Bimonetary safety is reused as-is: batch amounts are captured in the method's native currency; existing destino-moneda validation in `cerrarSesionCaja` applies unchanged.

---

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/tesoreria/components/movimientos-table.tsx` (PendienteTable/PendienteRow ~L166-370) | Modified | Read `descripcion ?? observacion` (T1a) |
| `src/features/caja/hooks/use-mov-bancarios.ts:121-203` | None (verify) | `useMovBancariosFiltrados` — confirm no JOIN needed once T1a fix lands |
| `src/features/ventas/.../cobro-modal.tsx:769-776` | Modified | Respect `metodos_cobro.requiere_referencia` (T1b) |
| `src/features/caja/hooks/use-sesiones-caja.ts` (consolidacion loop ~L1007-1078) | Modified | `SES-XXXXXXXX` display (T2) + per-lote/consolidated branching (T3) |
| `src/features/reportes/components/cuadre-conteo-fisico.tsx` (~L300-311) | Modified | Replace simple amount input with batch table for POS methods (T3) |
| `src/features/tesoreria/hooks/use-traspasos.ts` | Modified | Extend to accept per-batch transfer calls under `consolidar_lotes=false` |
| `src/core/db/powersync/schema.ts` + `src/core/db/kysely/types.ts` | Modified | New table for batch rows; new `consolidar_lotes` column (integer 0/1) |
| `src/features/configuracion/components/payment-method-form.tsx` + `schemas/payment-method-schema.ts` | Modified | New `consolidar_lotes` toggle (T3) |
| `migrations/00XX_lotes_pos_cuadre.sql` (new) | New | New batch table (empresa_id-scoped) + `metodos_cobro.consolidar_lotes` column |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|--------------|
| T3 extends the same financial `cerrarSesionCaja` transaction touched in `cierre-consolidacion-tesoreria`, which is still unarchived/pending QA | Medium | Sequence T3 after that change's QA is confirmed; keep the branching change minimal (if/else) to limit surface |
| New batch table needs correct PowerSync conventions (booleans as `column.integer`, decimals as `column.text`) and must filter by `empresa_id` | Medium | Follow existing `schema.ts` patterns exactly; add to sync rules alongside other empresa-scoped tables |
| Batch numbers can repeat across different methods (not globally unique) | Low | Uniqueness constraint scoped to `(empresa_id, metodo_cobro_id, nro_lote, sesion_caja_id)` at design time, not global |
| Scope creep into T1/T2 while building T3 | Low | Non-POS method flow and already-fixed consolidation ordering must stay behaviorally identical — explicit user instruction: "no modificar las demás cosas" |

---

## Rollback Plan

- **T1/T2**: pure read-side changes, revertible via `git revert` with zero data impact.
- **T3 migration**: additive only (new table + new boolean column) — revertible by dropping the table and column. `consolidar_lotes` must default to `true` for existing methods, since today's behavior is already "one summed transfer per method" — the default preserves current behavior for every method until a tenant explicitly opts a method into per-batch transfers.
- **T3 frontend**: batch-entry table and consolidation branching confined to `cuadre-conteo-fisico.tsx`, `use-sesiones-caja.ts`, `use-traspasos.ts` — revertible via `git revert` of the affected commits.

---

## Dependencies

- T3 should land after the `cierre-consolidacion-tesoreria` change is QA'd and archived (it modifies the same consolidation loop).
- PRs target `feat/decimal-p5-final` per project convention; user assembles PRs, orchestrator commits/pushes only on request.

---

## Success Criteria

- [ ] Reconciliation table shows real transaction text for rows that previously showed `-`.
- [ ] Reference field only appears for methods with `requiere_referencia=1`.
- [ ] Sessions display as `SES-XXXXXXXX` wherever previously a raw uuid appeared.
- [ ] Cuadre for a POS method with `consolidar_lotes=false` shows N distinct pending Tesorería transfers, one per batch, each with its own commission.
- [ ] Cuadre for a POS method with `consolidar_lotes=true` shows one pending transfer with `"Lotes: X, Y"` in the description.
- [ ] Non-POS methods and non-lote paths behave identically to before this change.
- [ ] `yarn type-check` and `yarn lint` pass.

---

## Estimated Effort / Review Size

**S (T1+T2) / M-L (T3)** — T1+T2 is a light, low-risk PR (~2 files, read-side only). T3 touches the financial cierre transaction again plus a schema migration and a config form change — recommend it as its own PR, likely near or over the 400-line review budget once schema + UI + consolidation branching are included. Delivery is ask-always: the user decides when/if to split further.
