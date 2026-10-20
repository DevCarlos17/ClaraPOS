# Verify Report: fix-reverso-doble-conteo-saldo-pendiente

**Verdict**: PASS
**PR-ready**: YES
**Verified**: 2026-10-20 (fresh-context, independent of apply phase)

## Scope confirmed

`git diff --stat` showed only two files touched by this change:
- `src/core/db/powersync/connector.ts` (8 lines, 6 additions / 2 deletions)
- `src/core/db/__tests__/connector-saldo-pendiente-patch-strip.test.ts` (new, untracked)

Unrelated noise found in the working tree: `.atl/.skill-registry.cache.json` and `.atl/skill-registry.md`, modified by an unrelated background skill-registry auto-refresh. Flagged WARNING — excluded from this change's commit via selective staging.

## Mechanism trace

Read `connector.ts` upload path (~L608-624): for PATCH ops, `patchPayload` is filtered to strip any key listed in `TRIGGER_MANAGED_PATCH_COLUMNS[op.table]` before calling `table.update(patchPayload)` against Supabase. This is upload-only — the local SQLite write via `tx.execute()` in `use-cxc.ts` is untouched, so the optimistic UI value is unaffected.

Traced `registrarReversoAbono` (`use-cxc.ts` ~L1960-2029): `UPDATE clientes` (literal value, ~L1985-1988) still runs *before* `INSERT INTO movimientos_cuenta` (tipo REV, ~L2008-2028) — the root-cause statement order is unchanged. What changed is that the PATCH generated from that local UPDATE never uploads `saldo_pendiente_usd` anymore, leaving the Postgres trigger `actualizar_saldo_cliente()` (migration 0110) as the sole server-side authority for the relative increment. Mechanism is sound.

## Test quality

Compared `connector-saldo-pendiente-patch-strip.test.ts` against its precedent `connector-saf-disponible-patch-strip.test.ts` side by side — exact mirror pattern, not a tautology:
- Test 1 asserts 3 properties absent from the uploaded payload AND 1 property (`updated_at`) present.
- Test 2 asserts full-skip behavior — `update()` is never called when the PATCH only touches trigger-managed columns.

Independently reproduced RED via `git stash` (untracked test file survives the stash) against the pre-fix `connector.ts`: both tests failed exactly as the apply-progress report described — an `AssertionError` for the property-presence case and a `TypeError` on `.eq()` for the skip-entirely case. Restored the fix via `git stash pop` and re-confirmed GREEN.

## Test execution (fresh, independent)

| Suite | Result |
|---|---|
| `src/core/db/__tests__/` | 6 files / 36 tests passed |
| `use-cxc.test.ts` + `reversa-pago-saf.test.ts` | 2 files / 90 tests passed |

Zero regressions.

## Pre-existing failures confirmed unrelated (not fixed here)

- `cliente-detalle.test.tsx` — fails with the same ambiguous `/facturas/i` DOM match reported by apply; file untouched in this change's diff.
- `yarn type-check:test` — same 3 pre-existing errors: 2x `producto-form` (`Producto.costo_factura_usd` type mismatch), 1x unused `swUrl` in `use-pwa-update.ts`. None in `connector.ts` or the new test file.
- `yarn type-check` (app tsconfig, not test tsconfig) produces ~9954 errors across the entire test suite uniformly — missing vitest globals (`vi`/`describe`/`expect`) under the app's tsconfig, which doesn't include vitest types. This is a systemic, pre-existing repo config gap affecting every test file identically (including the precedent test), not specific to this change. Flagged as SUGGESTION only. The correct command for test files is `yarn type-check:test`.

## Findings

- **CRITICAL**: None.
- **WARNING**: `.atl/` skill-registry files modified by an unrelated background process — excluded from this change's commit.
- **WARNING**: apply-progress did not include a formally structured "TDD Cycle Evidence" table; the RED→GREEN narrative existed in prose and was independently re-verified to be accurate — a process/format gap, not a substance gap.
- **SUGGESTION**: keep steering agents to `yarn type-check:test` (not `yarn type-check`) for test-file type safety, since the app tsconfig lacks vitest globals.

## Learned

`git stash` does not touch untracked files, which allowed reverting only the tracked `connector.ts` fix while keeping the new untracked test file in place — a reliable technique for adversarial RED-reproduction during verify without a second worktree or extra commit. Also confirmed PowerSync's CRUD-batch upload ordering model: local writes to SQLite happen synchronously in the app's tx; the connector's `uploadData()` consumes the queued CRUD ops asynchronously later, and only the upload-time PATCH payload is affected by `TRIGGER_MANAGED_PATCH_COLUMNS` stripping — this class of fix never risks the local optimistic UI value.

## Manual gate (Phase 4) — resolved post-verify

QA manual en staging (post-merge, post-verify): reversar abono de CLIENTE TEST 2 (C01-000024) y CLIENTE TEST 3 (C01-000022). Resultado confirmado por el usuario: deuda restaurada correctamente a $30 y $50 respectivamente (no $52). Ver `archive-report.md` para el cierre de ciclo.
