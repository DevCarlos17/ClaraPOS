# Tasks: PowerSync Sync Scope Optimization

> Size note (same precedent as design.md): this artifact exceeds the usual 530-word task budget. Renumbered migrations, a discovered cross-window guardrail bug, 5 resolved UNSURE decisions, and a no-staging production rollout sequence cannot be condensed without hiding the guardrail that prevents a silent CxC desync. Slicing still keeps each reviewable PR small.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~40 (S1) + ~90 (S2, now incl. app-code guardrail+test) + 180 (S3) + ~75 (S4, now incl. sesiones_caja) + 2 (S5) = **~387** |
| 400-line budget risk | Low (per-slice) / Medium (if shipped as one PR) |
| Chained PRs recommended | Yes |
| Suggested split | PR 5 → PR 1 → PR 2 → PR 3 → PR 4 (order = production rollout order, see below) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (each slice independently deployable/rollback-able) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low

Slice 3 (~150-180 lines) remains closest to budget pressure — split into 3a/3b if it grows past ~200. Slice 2 grew (~50→~90) after adding the app-code guardrail (task 2.9) + its test (2.10); still comfortably under budget. Slice 4 grew (~60→~75) after absorbing `sesiones_caja` role+state scoping (moved out of Slice 2 per owner decision).

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 5 | `compra-list.tsx` `daysAgo(4)` swap | PR 1 (ships first) | Zero sync-rule risk, no dependency — production win with no rollback exposure |
| 1 | FULL/TRIMMED reclassify Inventario+Config in YAML, incl. live controlled spike (task 0.1) | PR 2 | No staging exists — first real sync-rule deploy, one table at a time |
| 2 | OPEN-BALANCE-AWARE for Ventas/Proveedores/CxC + citas (two-sided) + cita_log + window-coupling guardrail (YAML comment) + `registrarReversoAbono` throw fix + test | PR 3 | `sesiones_caja` moved OUT to PR 4 (role-scoped, not date-scoped) |
| 3 | `libro_contable` reclass + 3 hook Supabase-fetch rewrites | PR 4 | Largest code slice; independent of 1/2 |
| 4 | `tiene_acceso_contable` migration+trigger + `by_empresa_contable` bucket + `sesiones_caja`/`sesiones_caja_detalle` role+state scoping | PR 5 | Gated by task 0.2 (production-observed, no staging) |

## Production Rollout Order (no staging environment — owner-confirmed)

Deploy order for real production traffic: **Slice 5 → Slice 1 (live controlled spike) → Slice 2 → Slice 3 → Slice 4**. This differs from git merge order only in urgency, not dependency — merge order can match this sequence directly (stacked-to-main).

1. **Slice 5 first** (Phase 5) — local-query-only change, does not touch `powersync-sync-rules.yaml`. Zero sync risk, immediate win.
2. **Slice 1 as a live controlled spike** (task 0.1) — no staging exists, so the former "staging spike" becomes a single reversible production observation: deploy ONE low-risk TRIMMED table alone, during low traffic, with the prior full-`SELECT *` line saved for instant paste-back rollback.
3. **Slice 2** — includes the window-coupling guardrail and the `registrarReversoAbono` defensive fix.
4. **Slice 3** — `libro_contable` + hook rewrites.
5. **Slice 4** — gated by its own production observation (task 0.2), includes `sesiones_caja` role+state scoping.

## Mandatory Post-Deploy Gate (run after EVERY sync-rule deploy, every slice)

1. `yarn test:run` — full suite, especially `use-deuda-cliente.test.ts` / `use-cxc.test.ts` (CxC) and CxP-equivalent suites.
2. Manual reconciliation: compare total CxC debt (`SUM(saldo_pend_usd)` over `ventas`) and total CxP debt (`facturas_compra`) shown in-app vs a direct Supabase SQL query, on one real tenant. Must match to the cent.
3. If either check fails: rollback immediately (paste back the prior YAML), do not proceed to the next slice.

## Phase 0: Pre-flight (no staging — production-safe spikes)

- [ ] 0.1 **[LIVE CONTROLLED SPIKE — replaces the impossible staging spike, gates the rest of Phase 1]** After Slice 5 ships, deploy ONLY `movimientos_inventario`'s TRIMMED clause alone (not the full Slice 1 YAML) during a documented low-traffic window for one tenant. Before deploying, save the current full `SELECT * FROM movimientos_inventario WHERE empresa_id = bucket.empresa_id` line verbatim as the paste-back rollback. After deploy, observe ONE real connected device: (a) does it prune out-of-window rows automatically or only on a full resync; (b) full redownload vs incremental; (c) measured local storage/quota delta. Record findings in `design.md` Open Questions before proceeding to the rest of Slice 1.
- [ ] 0.2 **[Production controlled observation, replaces staging spike, gates Phase 4]** Using a real low-privilege throwaway test user (cajero, no `contabilidad.gastos`), add the single-table parameter query (`SELECT empresa_id, tiene_acceso_contable FROM usuarios WHERE id = token_parameters.user_id AND tiene_acceso_contable = 1`) gating a test bucket in production. Confirm zero rows for that user; flip the flag, confirm rows appear. Record result in design.md Open Questions.

## Phase 1: Slice 1 — Inventario + Config FULL/TRIMMED (YAML only)

- [ ] 1.1 In `backend/powersync-sync-rules.yaml`, regroup `by_empresa.data` Inventario+Config rows into commented `# FULL` / `# TRIMMED` sections per proposal's classification table.
- [ ] 1.2 Resolve UNSURE #1 (`tasas_cambio`) as FULL — no window clause. ~365 rows/year, trivial volume (owner decision; a future 6-month cap is explicitly deferred, do not add it here).
- [ ] 1.3 Resolve UNSURE #2 (`lotes`) as FULL — no window clause. Confirmed technical criterion (not owner preference): active lots with stock must stay FULL for FEFO even if old.
- [ ] 1.4 Add TRIMMED window clause to `movimientos_inventario`: `WHERE empresa_id = bucket.empresa_id AND fecha >= '<window-literal>'` — already live-validated by task 0.1's spike before this task runs.
- [ ] 1.5 Add TRIMMED window clauses to `ajustes`, `ajustes_det`, `traspasos_inventario`, `traspasos_inventario_det` with the same literal-window pattern.
- [ ] 1.6 Verify: manual review — every row in this slice still has `WHERE empresa_id = bucket.empresa_id` as the leading/joined condition (Requirement: Multi-Tenant Isolation Is Preserved).
- [ ] 1.7 Verify: `yarn type-check` (YAML has no TS impact, confirms no accidental code touch this slice).
- [ ] 1.8 Manual production verification: confirm task 0.1's live-spike observation applies cleanly before pasting the REMAINING Slice 1 tables (1.5) to the production PowerSync Cloud dashboard. Run the Mandatory Post-Deploy Gate.

## Phase 2: Slice 2 — Open-Balance-Aware Ventas/Proveedores/Citas + window-coupling guardrail (YAML + 1 app-code fix)

- [ ] 2.1 In `backend/powersync-sync-rules.yaml`, add `# OPEN-BALANCE-AWARE` section for `ventas`: `WHERE empresa_id = bucket.empresa_id AND (CAST(saldo_pend_usd AS REAL) > 0 OR fecha >= '<window-literal>')`.
- [ ] 2.2 Add same open-balance-aware pattern for `facturas_compra` (`saldo_pendiente_usd`), `vencimientos_cobrar`, `vencimientos_pagar` — **HARD CONSTRAINT**: never a plain date-window on these 4 tables.
- [ ] 2.3 Add TRIMMED clauses for `ventas_det`, `pagos`, `notas_credito`, `notas_credito_det`, `notas_debito`, `notas_debito_det` (confirmed no `saldo_pend_usd` field).
- [ ] 2.4 Add TRIMMED clauses for `facturas_compra_det`, `retenciones_iva`, `retenciones_islr`, `notas_fiscales_compra`, `notas_fiscales_compra_det`, `movimientos_cuenta_proveedor`, `retenciones_iva_ventas`, `retenciones_islr_ventas`.
- [ ] 2.5 Add TRIMMED clauses for `movimientos_metodo_cobro`, `movimientos_bancarios`, `mov_caja_fuerte`, `traspasos_tesoreria`. (`sesiones_caja` / `sesiones_caja_detalle` are NOT part of this slice anymore — moved to Phase 4, see 4.4-4.6, because the owner resolved them as role-scoped, not date-scoped.)
- [ ] 2.6 Resolve UNSURE #4 (`citas`) as **OPEN-BALANCE-AWARE**, not lower-bound-only TRIMMED as originally drafted — owner decision: future/open appointments must ALWAYS sync regardless of age; only PAST closed ones trim: `WHERE empresa_id = bucket.empresa_id AND (cita_status IN ('RESERVADA','EN_PROCESO') OR fecha_inicio >= '<window-literal>')` (columns confirmed in `src/core/db/powersync/schema.ts:1430-1466`). Keep `citas_servicios`, `cita_trabajadores`, `cita_items_extras` as plain lower-bound TRIMMED on their own timestamps — same accepted precedent as `ventas_det` under open-balance-aware `ventas`.
- [ ] 2.7 Resolve UNSURE #5 (`cita_log`) as TRIMMED: `WHERE empresa_id = bucket.empresa_id AND created_at >= '<window-literal>'`.
- [ ] 2.8 **[GUARDRAIL — window-coupling invariant]** In `backend/powersync-sync-rules.yaml`, add a YAML comment directly above `pagos`'s TRIMMED clause: `pagos` retained window MUST be <= `ventas`'s closed-row window — if `pagos` ever retains longer than `ventas`, a `pago` can outlive its evicted parent `venta` and silently desync CxC (see task 2.9). Re-check this invariant any time either window is tuned (cross-ref design.md Open Questions "window lengths... tune later").
- [ ] 2.9 **[GUARDRAIL — defensive app-code fix, not YAML]** In `src/features/cxc/hooks/use-cxc.ts`, in `registrarReversoAbono` (~line 1556), the `if (ventaResult.rows && ventaResult.rows.length > 0) { ... }` branch (restores `ventas.saldo_pend_usd`) has no `else`. Add `else { throw new Error('No se encontro la factura local asociada a este pago; sincronice el dispositivo e intente de nuevo') }` — today it silently no-ops when the parent `venta` isn't locally found (e.g. evicted by an uncoupled window), while step 4 (restore `clientes.saldo_actual`) still runs unconditionally right after, permanently desyncing the client-visible CxC balance.
- [ ] 2.10 Add a Vitest test in `src/features/cxc/hooks/__tests__/use-cxc.test.ts` asserting `registrarReversoAbono` throws when the `ventas` SELECT returns zero rows for a pago with a non-null `venta_id` (simulates the "venta evicted by sync window" case).
- [ ] 2.11 Verify: manual review confirms every open-balance-aware row uses `OR` (not `AND`) between the balance/status condition and the date-window condition. **Insufficient alone** — this only catches the local syntax bug, not the cross-table window-coupling bug fixed by 2.8/2.9/2.10.
- [ ] 2.12 Verify: `yarn test:run` — confirms `use-deuda-cliente.test.ts`, `use-cxc.test.ts` (incl. the new 2.10 test) pass.
- [ ] 2.13 Manual production verification: deploy during low-traffic window, confirm an old-but-open `factura_compra`/`venta` row still appears locally after redeploy. Run the Mandatory Post-Deploy Gate.

## Phase 3: Slice 3 — libro_contable reclass + Supabase-fetch hooks

- [ ] 3.1 Create `migrations/0098_libro_contable_scope.sql` (renumbered — `0097` was already consumed by the shipped `bugfix-reversa-cxc` change; `0097_permitir_reverso_saldo_venta.sql` is on disk. Verify highest existing migration before applying) — no schema/trigger change; header comment documenting the new bucket query for `libro_contable` (Decision 3), for audit-trail parity with other migrations.
- [ ] 3.2 In `backend/powersync-sync-rules.yaml`, reclassify `libro_contable` from absent/NO-SYNC to OPEN-BALANCE-AWARE-style: `WHERE empresa_id = bucket.empresa_id AND (estado = 'PENDIENTE' OR fecha_registro >= '<window-90d>')`.
- [ ] 3.3 In `src/features/contabilidad/hooks/use-libro-contable.ts`, rewrite the list query (`useLibroContable`) to fetch via `connector.client.from('libro_contable').select(...)` (Supabase, on-demand) instead of local `useQuery`, preserving the existing `FiltrosLibro` shape and adding its own loading/error state. Leave `crearAsientoManual`, `conciliarAsiento`, `reversarAsientoManual` untouched — they must keep using `db.writeTransaction()` against the local (now partially-synced) table.
- [ ] 3.4 In `src/features/contabilidad/hooks/use-balance-comprobacion.ts`, apply the same Supabase-fetch swap; map the existing date-range filter to `.gte()/.lte()`.
- [ ] 3.5 In `src/features/bancos/hooks/use-diferencial-banco.ts`, swap only the `libroRaw` query (SUM by banco, no date bound) to Supabase fetch; leave the other 3 local queries (bancos, monedas, tasas) untouched.
- [ ] 3.6 Add/update unit tests for the 3 modified hooks: mock `connector.client.from(...).select(...)` and assert the same filter params map to the correct `.eq()/.gte()/.lte()` calls.
- [ ] 3.7 Verify: `src/features/contabilidad/lib/__tests__/generar-asientos.test.ts` and any `use-gastos.test.ts` still pass unmodified — they mock `tx.execute` directly, confirming the write-path is untouched by this slice.
- [ ] 3.8 Verify: `yarn test:run`, `yarn type-check`, `yarn type-check:test`.
- [ ] 3.9 Manual production verification: create a PENDIENTE asiento on device A, confirm device B (different local DB, same tenant) can still see and reverse/conciliar it. Run the Mandatory Post-Deploy Gate.

## Phase 4: Slice 4 — Permission-scoped `by_empresa_contable` bucket + `sesiones_caja` role+state scoping

- [ ] 4.1 Create `migrations/0099_usuarios_acceso_contable.sql` (renumbered — see 3.1 note): add `usuarios.tiene_acceso_contable boolean DEFAULT false NOT NULL`; create trigger function `sync_acceso_contable()` fired on `rol_permisos`/`roles` INSERT/UPDATE/DELETE, recomputing the flag by checking for permission slug `'contabilidad.gastos'` (reuse `PERMISSIONS.ACCOUNTING_VIEW` at `src/core/hooks/use-permissions.ts:26`); backfill existing rows in the same migration.
- [ ] 4.2 In `backend/powersync-sync-rules.yaml`, add new bucket `by_empresa_contable` with parameter query `SELECT empresa_id, tiene_acceso_contable FROM usuarios WHERE id = token_parameters.user_id AND tiene_acceso_contable = 1` and data rows `plan_cuentas`, `cuentas_config` scoped by `bucket.empresa_id`.
- [ ] 4.3 Confirm zero changes required in `src/core/db/powersync/connector.ts` and `src/core/auth/auth-provider.tsx` — `token_parameters.user_id` already flows from the existing `fetchCredentials()` JWT `sub` claim; add a one-line comment near the connector's credential-fetch call noting this.
- [ ] 4.4 Resolve UNSURE #3 (`sesiones_caja`) as **role+state scoped, NOT date-scoped** (owner decision). Extend the `by_empresa` bucket's parameter query to also select `level`: `SELECT empresa_id, level FROM usuarios WHERE id = token_parameters.user_id` — `usuarios.level` already exists in Postgres (`migrations/0001_initial_schema.sql:681`, values 1=Propietario/2=Supervisor/3=Cajero) and needs **no new migration/trigger** (unlike `tiene_acceso_contable`, which needs one because contabilidad access is dynamic via `rol_permisos`; `level` is a static column).
- [ ] 4.5 Move `sesiones_caja` out of `by_empresa`'s plain listing into a role+state clause: `WHERE empresa_id = bucket.empresa_id AND status = 'ABIERTA' AND (bucket.level = 1 OR usuario_apertura_id = token_parameters.user_id)` (columns confirmed in `src/core/db/powersync/schema.ts:843-866`; `status`/`ABIERTA` values confirmed in `src/features/caja/hooks/use-sesiones-caja.ts:97,193`). Propietario (level 1) sees ALL open sessions tenant-wide; cajero/supervisor see only their own open session. Closed sessions are never synced.
- [ ] 4.6 Remove `sesiones_caja_detalle` from `by_empresa` entirely (was previously plain TRIMMED). Confirmed in `use-sesiones-caja.ts` (lines 947, 988, "poblar sesiones_caja_detalle") that detalle rows are created ONLY at session CLOSE — so under 4.5's open-only rule, every `sesiones_caja_detalle` row belongs to a session that will never sync locally. "Follow its parent" therefore means fully on-demand: add a minimal read-only Supabase fetch for `sesiones_caja_detalle` by `sesion_caja_id` in the existing closed-session detail consumer (nearest caller of `use-sesiones-caja.ts`'s closed-session query, e.g. rendimiento/reportes view) — required here, not a deferred follow-up, since Slice 4 makes local access structurally unreachable.
- [ ] 4.7 Verify: `yarn type-check` and `yarn type-check:test`.
- [ ] 4.8 Manual production verification: repeat task 0.2's observation against the final `by_empresa_contable` YAML (cajero test user gets zero `plan_cuentas`/`cuentas_config` rows, propietario gets full rows). ALSO confirm `sesiones_caja`: a cajero test user's sync shows ONLY their own open session, a propietario test user's sync shows ALL open sessions tenant-wide, neither sees closed sessions. Confirm the 4.6 on-demand fetch correctly renders a real closed session's cierre totals. Run the Mandatory Post-Deploy Gate.

## Phase 5: Slice 5 — Compras default window

**PRODUCTION ROLLOUT: ship this FIRST** (see Production Rollout Order) — pure client-side default, zero sync-rule risk.

- [x] 5.1 In `src/features/inventario/components/compras/compra-list.tsx:74`, change `getDefaultDates()` from `startOfMonth()` to `daysAgo(4)` (helper already exists at `src/lib/dates.ts:66`).
- [x] 5.2 Verify: manual check that pagination and manual date-filter inputs still work with the new default.
- [x] 5.3 Verify: `yarn type-check`.

## Phase 6: Cross-slice regression gate (final check, after all slices are deployed to production)

- [ ] 6.1 Run full `yarn test:run` — confirm `use-deuda-cliente.test.ts`, `use-cxc.test.ts` (incl. the 2.10 guardrail test), `generar-asientos.test.ts`, and all other existing suites pass unmodified end-to-end.
- [ ] 6.2 Run `yarn type-check` and `yarn type-check:test` against the full repo.
- [ ] 6.3 Update `design.md` Open Questions checklist: check off both spike items (0.1, 0.2) with their production-observed results (or note deviations found and their resolution). Note the no-staging constraint explicitly.
- [ ] 6.4 Final full-scope reconciliation: run the Mandatory Post-Deploy Gate one more time across all deployed slices combined, on the real tenant used throughout — confirms no slice interaction regressed CxC/CxP balance integrity.

## Out of Scope (explicit — do not add here)

- Multi-module reversal propagation (Tesoreria + Caja, A/B by payment method) — separate, postponed feature.
- "Ver mas viejo desde BD on-demand" read paths for trimmed tables (agenda, contabilidad reports, closed sessions) — separate follow-up, EXCEPT `libro_contable` (3.3-3.5) and `sesiones_caja_detalle` (4.6), which this change already requires.
