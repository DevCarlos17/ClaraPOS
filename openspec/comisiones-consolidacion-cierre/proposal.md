# Proposal: comisiones-consolidacion-cierre

_Date: 2026-08-03 | Model: anthropic/claude-sonnet-5_

---

## Intent

**Correction of scope vs. exploration #901**: that exploration was written on the stale branch `feat/pos-metodos-dinamicos` and concluded "no consolidation exists at all." Verified on our actual working branch (`feat/gastos-qol-pos-metodos-dinamicos`, current HEAD) that this is **false** — `cierre-consolidacion-tesoreria` and `conciliacion-lotes-pos` are both already implemented and merged ancestors: `cerrarSesionCaja` (`use-sesiones-caja.ts:1014-1250`) already fans out per-método totals (and per-lote/consolidated-lote totals) to Tesorería (banco/caja fuerte) atomically, and already books a commission gasto via `insertarGastoComisionEnTx`. So Cambio B is **not** greenfield — it is a **targeted migration + gap-fix** of code that exists today.

Two concrete bugs, verified by reading the current code:

1. **The commission step still reads the deprecated single `metodos_cobro.comision_pct`** (`use-sesiones-caja.ts:1139`, `use-gastos.ts:505-618`), not the N-generic `metodo_cobro_deducciones` table built in `feat/gastos-qol-pr3-metodos-deducciones` (already merged, PR #9). A método with real deducciones configured (comisión + ISLR + otro, each its own `cuenta_gasto_id`) has its config silently ignored at cierre — only a flat legacy `comision_pct` (now hardcoded to `'0'` on every save, per `banco-form.tsx:876`) is read. **This is the reported bug**: tesorería gets the ingreso, deductions never post.
2. **`insertarGastoComisionEnTx` generates `nro_gasto` via `SELECT COUNT(*) FROM gastos`** (`use-gastos.ts:544-549`) — the exact multi-device collision pattern already fixed once elsewhere via UUID-slice numbering (commit `22d6094`). Reintroduced here; must not ship migrated code with the same bug twice.

Additionally, decision #3 (below) surfaces a **third, currently-unbuilt timing mode** ("depósito directo con comisión at sale time"). Per user decision (2026-08-03), this change (Cambio B) is **scoped to Pieza 1 only** — the cierre-time migration + `nro_gasto` fix. The sale-time "depósito directo" path and its double-booking-exclusion are **deferred to a separate future change (Cambio C)**, since that path does not exist today (it is new feature work, not a bug in the reported flow), and mixing new sale-flow feature work with a targeted cierre bugfix would enlarge the change and its risk surface unnecessarily.

> **DOUBLE-BOOKING NOTE (deferred, not ignored)**: `deposito_directo=1` methods book their ingreso at sale time (`use-ventas.ts:1444-1487`) but are not currently excluded from the cierre consolidation loop. This is a **latent** risk (harmless today because comisiones are silently skipped and `deposito_directo` deposits already happen). It becomes relevant only when Cambio C builds the sale-time path. Cambio B (Pieza 1) must be careful NOT to make it worse: the N-deducciones migration applies to the cierre/lotes path exactly where `comision_pct` was read today — it does not add new ingreso booking, so it does not introduce new double-booking. Cambio C will own both the sale-time egreso AND the cierre-loop exclusion together.

---

## Branch status (resolved — not a blocker)

Work happens directly on `feat/gastos-qol-pos-metodos-dinamicos`. Verified via `git merge-base --is-ancestor`: both `feat/gastos-qol-pr3-metodos-deducciones` (métodos_cobro_deducciones) and `feat/pos-tesoreria-integration-p2` (POS↔Tesorería primitives) ARE ancestors of current HEAD. No branch reconciliation needed. No PR to `main` right now — user is keeping this on the current feature branch.

---

## Scope

### In Scope (Cambio B = Pieza 1 only)

- **Migrate commission computation** in `cerrarSesionCaja`'s `aplicarComisionSiCorresponde` (cierre consolidation, modes "por lotes" / "por lotes acumulativos" / plain `totalSistemaD`) from single `comision_pct` to a loop over active `metodo_cobro_deducciones` rows (`ORDER BY orden`), per método, computed on the método's **native currency** `total_sistema`/lote amount — **no USD conversion for the % base** (Decision 1). Each deducción posts its own gasto against its own `cuenta_gasto_id` (Decision 2 — all deducción types, including `ISLR`, route the same way; no special-casing by `tipo`).
- **Fix `insertarGastoComisionEnTx`'s `nro_gasto`**: replace `COUNT(*)`-based numbering with UUID-slice numbering (e.g. `POS-COM-${sesionCajaId.slice(0,8)}-${orden}`), matching the `POS-ABSORB-` precedent in `use-ventas.ts`.
- **Accounting posting**: QoL-registry only (Decision 4) — this is already the pattern in place (`insertarGastoComisionEnTx` has no `libro_contable` call); no change needed here beyond preserving it through the migration.
- Reflect multiple deducción rows per método in the resulting gastos (was previously exactly one commission row per método).

### Deferred to Cambio C (NOT in this change)

- **Sale-time "depósito directo con comisión" timing mode (Decision 3, mode 1)**: posting deducción egreso(s) at sale registration for `deposito_directo=1` methods.
- **Double-booking exclusion**: excluding `deposito_directo=1` methods from the cierre consolidation ingreso loop. This pairs with the sale-time path above and must be built together with it, not split.

### Out of Scope

- Real double-entry accounting (`libro_contable`) for deducciones — confirmed QoL-only (Decision 4).
- Routing `ISLR`-type deducciones to a different destination than `COMISION`/`OTRO` — confirmed all types → `gastos` (Decision 2).
- Cross-método aggregation of gastos sharing the same `cuenta_gasto_id` into a single row — the current (and proposed) pattern is one gasto per deducción per método; grouping across métodos was the stale exploration's assumption, not confirmed by the user. **Flagged as an open question below**, not committed to scope.
- New `lote_id`-level granularity beyond what `conciliacion-lotes-pos` already built (`lotes_pos_cuadre` table) — reused as-is.
- Fixing the pre-existing `caja_fuerte.saldo_actual`/`bancos_empresa.saldo_actual` read-then-write race — documented risk only, not fixed here.
- PR/merge to `main` — stays on `feat/gastos-qol-pos-metodos-dinamicos`.

---

## Capabilities

> Existing spec: `openspec/specs/tesoreria-consolidacion-cierre/spec.md` (already merged/archived — documents the CURRENT, comision_pct-based behavior this change modifies). `conciliacion-lotes-pos` (lotes/consolidar_lotes) appears implemented in code but its own spec is not yet in `openspec/specs/` — treat as a sibling in-flight capability, not re-litigated here.

### New Capabilities
- None. This change modifies existing consolidation behavior; it does not introduce a new domain capability.

### Modified Capabilities
- `tesoreria-consolidacion-cierre`: the "Commission booked as a real gasto (Option A2)" requirement changes from single `comision_pct`/one-gasto-per-método to N-`metodo_cobro_deducciones`/one-gasto-per-deducción-per-método, computed on native-currency base, with corrected UUID-based `nro_gasto`.
- `caja` (sale registration path, `use-ventas.ts`): `deposito_directo=1` methods gain deducción-egreso posting at sale time (new behavior, not previously present) and are excluded from cierre-time consolidation ingreso.

---

## Approach

Reuse the existing atomic shape exactly — no new transaction, no new UI trigger. Two touch points, both already inside existing `writeTransaction`s:

1. **Cierre path** (`use-sesiones-caja.ts`, inside `cerrarSesionCaja`'s existing transaction): replace the single `comisionPct`/`aplicarComisionSiCorresponde` read with a query of `metodo_cobro_deducciones WHERE metodo_cobro_id = ? AND is_active = 1 ORDER BY orden`, looping per active row, each producing one `insertarGastoComisionEnTx`-style call parameterized by that row's `cuenta_gasto_id`/`concepto`/`porcentaje` instead of the `COMISION_BANCARIA` cuentas_config lookup (the FK is now direct on the deducción row — no indirection needed). This only runs for the "por lotes" / "por lotes acumulativos" branches (`deposito_directo=0`), matching current code structure.
2. **Sale-time path** (`use-ventas.ts`, inside the existing sale-registration transaction, step 8): where `depositoDirecto` is already read (line 1439) but only used for the ingreso, add the same deducción-loop-and-gasto-insert logic for the egreso side, using the pago's native-currency `monto` as the base.
3. **Exclusion**: at the top of the cierre consolidation loop (`consolidacionPorMetodo` population, ~line 873), skip/exclude métodos with `deposito_directo=1` from `metodosParaConsolidar` so their ingreso is never double-booked.

`insertarGastoComisionEnTx` (or its N-deducción successor) is refactored to accept a `tx` handle in both call sites (already the case) and to generate `nro_gasto` via the UUID-slice pattern, not `COUNT(*)`.

---

## Open Questions (surface to user — do not resolve here)

1. **Flag mapping completeness**: `deposito_directo` (sale-time) and `consolidar_lotes` (lote-summing, only meaningful for `PUNTO` methods with entered lotes) together encode the 3 modes for `PUNTO`-type methods with lotes. But non-`PUNTO` bank methods (e.g. `TRANSFERENCIA`, `PAGO_MOVIL`) with `deposito_directo=0` and no lotes fall through to the plain `totalSistemaD` cierre path regardless of `consolidar_lotes` — is that acceptable as "mode 2/3 collapsed to one row" for those methods, or does a distinguishing attribute need to exist independent of whether lotes were entered?
2. **Idempotency guard for cierre consolidation** — none exists today beyond "cierre only runs once because `status` flips to `CERRADA`". Is that sufficient, or does the N-deducciones migration need its own guard (e.g. re-running consolidation for a correction)?
3. **Reversal path** if a deducción-gasto is later found wrong: per-row `anularGasto` (existing) is assumed sufficient — confirm, since N-row-per-método changes the "undo everything from this cierre" story from 1 gasto to N.
4. **Cross-método grouping by `cuenta_gasto_id`**: keep current one-gasto-per-deducción-per-método granularity, or introduce grouping (deferred, see Out of Scope)?

---

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/caja/hooks/use-sesiones-caja.ts` (~L1014-1250) | Modified | Replace `comision_pct` read + `aplicarComisionSiCorresponde` with N-deducciones loop; exclude `deposito_directo=1` methods from `metodosParaConsolidar` |
| `src/features/contabilidad/hooks/use-gastos.ts` (~L490-620) | Modified | `insertarGastoComisionEnTx` generalized to one-call-per-deducción, direct `cuenta_gasto_id` param (no `cuentas_config` lookup), UUID-based `nro_gasto` (fixes COUNT-collision bug) |
| `src/features/ventas/hooks/use-ventas.ts` (~L1418-1490) | Modified | `deposito_directo=1` sale-time path gains deducción-egreso posting alongside the existing ingreso |
| `src/features/configuracion/hooks/use-metodo-cobro-deducciones.ts` | None (read-only consumer) | `useDeduccionesDeMetodo` equivalent raw query reused as-is |
| `openspec/specs/tesoreria-consolidacion-cierre/spec.md` | Modified (delta) | Commission requirement updated for N-deducciones behavior |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|--------------|
| Double-booking of ingreso for `deposito_directo=1` methods once cierre commission logic actually processes them (currently latent — no reported case yet because comisiones are silently skipped today) | Medium — newly discovered, not in original bug report | Explicit exclusion from `metodosParaConsolidar`, covered by a dedicated scenario in spec/design |
| N gastos per método (vs. 1 today) increases write volume per cierre | Low | Same transaction, same order of magnitude as existing per-lote loop already in place |
| `nro_gasto` COUNT-collision bug shipped a second time if migration copies `insertarGastoComisionEnTx` verbatim | Medium (self-inflicted if not fixed) | Explicit in-scope fix item above; verify phase must assert UUID-based numbering |
| Sale-time deducción egreso adds latency/complexity to the hot POS checkout path | Low-Medium | Same transaction already does the ingreso INSERT; egreso is additive, not a new transaction |
| Open question 1 (flag completeness) left unresolved could mean non-PUNTO bank methods never get deducciones applied correctly | Medium | Must be resolved at spec/design before implementation, not deferred to apply |

---

## Rollback Plan

- Both touch points are modifications inside existing transactions in existing files — revertible via `git revert` of the affected commits, no schema/migration changes required (schema for `metodo_cobro_deducciones` already exists and is unchanged by this proposal).
- No data migration needed: existing `gastos`/`movimientos_bancarios` rows from the old `comision_pct` path are untouched; only new cierres/sales use the new path going forward.

---

## Dependencies

- None outstanding — both hard prerequisites (`metodo_cobro_deducciones`, POS↔Tesorería primitives) are already ancestors of HEAD.

---

## Success Criteria

- [ ] A método with N active `metodo_cobro_deducciones` rows produces N distinct `gastos` rows at cierre (por lotes / por lotes acumulativos modes), each against its own `cuenta_gasto_id`, computed on native-currency base with no USD conversion.
- [ ] `insertarGastoComisionEnTx` (or successor) generates `nro_gasto` via UUID-slice, never `COUNT(*)`.
- [ ] A `deposito_directo=1` método posts its deducción egreso(s) at sale time, in the same transaction as the sale's ingreso.
- [ ] A `deposito_directo=1` método is excluded from the cierre consolidation loop's ingreso — no double booking.
- [ ] `yarn type-check` and `yarn lint` pass.

---

## Estimated Effort / Review Size

**S-M** — smaller than the stale exploration's 500-900 line estimate because ~80% of the fan-out infrastructure (Tesorería routing, atomicity, lotes handling, gasto-insertion shape) already exists and is being modified, not built. Realistic estimate: ~150-300 changed lines across 2-3 files (cierre loop migration, gasto-insertion generalization, sale-time egreso addition). Likely fits within the 400-line review budget as a single PR, but the final call — including whether open question 1 forces additional scope — happens at `sdd-tasks`.
