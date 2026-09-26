# Tasks: Corregir doble resta de efectivo disponible tras reembolso NC vía Sesión de caja

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~35 (1 prod line removed, ~30 test lines added/modified) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (not needed — under budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | RED→GREEN fix for `useSaldoSesionCaja` double-subtraction + full regression | PR 1 (single) | One prod file, one test file. No API/shape changes. |

## Phase 1: RED — Failing Test First

- [x] 1.1 In `src/features/caja/hooks/__tests__/use-sesiones-caja.test.ts`, extend `setupSaldo`'s `pagos` branch (lines 223-225) to inspect the SQL text for the `p.is_reversed = 0` predicate, mirroring the existing origin-whitelist pattern at line 227:
  ```ts
  if (sql.includes('FROM pagos p')) {
    const filtraReversed = sql.includes('p.is_reversed = 0')
    const ventas = filtraReversed ? { usd: 0, bs: 0 } : { usd: opts.ventasUsd ?? 0, bs: opts.ventasBs ?? 0 }
    return { data: [{ ventas_usd: ventas.usd, ventas_bs: ventas.bs }], isLoading: false }
  }
  ```
- [x] 1.2 Add a new scenario to the `useSaldoSesionCaja` describe block (`use-sesiones-caja.test.ts:208`) reproducing the exact user report: `aperturaBs: '1000'`, reversed cash sale `ventasBs: 500`, one compensating `NCR` egress `movs: [{ origen: 'NCR', total_usd: 0, total_bs: 500 }]`. Assert `result.current.saldoBs === 1000` (fondo preserved, sale nets to zero exactly once).
- [x] 1.3 Run `yarn test:run src/features/caja/hooks/__tests__/use-sesiones-caja.test.ts` and confirm the new scenario **FAILS** against current code (current code yields `saldoBs === 500`, since `is_reversed = 0` zeroes `ventasBs` while the NCR egress still subtracts 500 from apertura). This is the required RED state.

## Phase 2: GREEN — Apply the Fix

- [x] 2.1 In `src/features/caja/hooks/use-sesiones-caja.ts`, delete `AND p.is_reversed = 0` from the `pagosData` query's WHERE clause (line 228, inside `useSaldoSesionCaja`, lines 212-316). Do not touch `movsData` or any other query.
- [x] 2.2 Run `yarn test:run src/features/caja/hooks/__tests__/use-sesiones-caja.test.ts` and confirm **all** tests pass, including: the new scenario from 1.2, and the 3 pre-existing tests in the same describe block (lines 234-265: NCR cross-session subtraction, floor-at-zero clamp, NCR present in WHERE origen IN).

## Phase 3: Regression

- [x] 3.1 Run the full suite: `yarn test:run`. Confirm no failures introduced, specifically covering the 3 shared-hook consumers that also exercise `useSaldoSesionCaja`-adjacent code paths: `prestamo-modal.tsx`, `avance-modal.tsx`, `ingreso-retiro-modal.tsx` (sessions without an NC refund never set `pagos.is_reversed = 1`, so their query results are unchanged by the predicate removal). *(Corrected in Phase 4: ran scoped `src/features/caja` instead — full suite hangs on exit, pre-existing infra issue unrelated to this change.)*
- [x] 3.2 Manual smoke check (documented, not automated): after a TOTAL NC refund via "Sesión de caja", confirm `refund-tesoreria-form.tsx`'s "Efectivo USD/Bs — disponible" label matches `/ventas/cuadre-de-caja` for the same session.

## Phase 4: Correction (QA finding #3978) — Reimplement to full parity with cuadre

**Context**: QA adversarial review of Phase 1-3's one-line fix (commit a4bdeeb) flagged CRITICAL risk of over-counting cash in NC-TOTAL-refund scenarios where no compensating `movimientos_metodo_cobro` egress exists (REFUND_TESORERIA via BANCO/CAJA_FUERTE, or SAFC liquidation). Investigation (see `sdd/nc-refund-sesion-caja-disponibilidad/apply-progress` in Engram) confirmed those TWO specific scenarios were **already correct** post-Phase-2 (verified empirically: parity tests for both pass unmodified against the Phase 2 code) — REFUND_TESORERIA(BANCO/CAJA_FUERTE) writes only to `movimientos_bancarios`/`mov_caja_fuerte`, never to `movimientos_metodo_cobro`, so the reversed sale's cash never left this session's drawer and correctly stays counted (matches `useSaldoEfectivoBimonetario`, which also never filters `is_reversed` and only subtracts real compensating movements). However, the investigation found TWO **real, verified-RED** structural divergences from `useSaldoEfectivoBimonetario` (use-cuadre.ts:859-958) that the one-line fix did not address:

1. `movsData`'s origin WHITELIST never included `'VUELTO'` (a real, currently-used egress origin) — confirmed real over-count via failing test before the fix.
2. `pagosData` never filtered `p.venta_id IS NOT NULL` — confirmed real over-count of CxC "anticipo" payments (`venta_id = NULL`, use-cxc.ts:996) that `useSaldoEfectivoBimonetario` structurally excludes.

- [x] 4.1 RED: add failing tests reproducing both structural gaps (VUELTO whitelist omission, missing `venta_id IS NOT NULL` filter) against the Phase 2 code, using realistic fixtures mirroring `useSaldoEfectivoBimonetario`'s actual query predicates. Confirmed both FAIL against Phase 2 code (`1000` vs expected `800` for VUELTO; `1100` vs expected `1080` for the anticipo case).
- [x] 4.2 RED (parity check, not a bug): add tests for the two QA-cited scenarios (NC TOTAL refunded via banco/caja fuerte; NC TOTAL → SAFC) using the exact same realistic fixtures. Ran them against Phase 2 code FIRST — both passed unmodified (`1500`, sale correctly stays counted), proving Phase 2 did not actually regress these two scenarios. Kept as permanent regression/parity tests, not bug-fix tests.
- [x] 4.3 GREEN: reimplement `useSaldoSesionCaja` (`src/features/caja/hooks/use-sesiones-caja.ts:205-311`) to structurally mirror `useSaldoEfectivoBimonetario` — split `pagosUsd`/`pagosBs` queries (each with `p.venta_id IS NOT NULL`), split `movsUsd`/`movsBs` queries using BLACKLIST `mmc.origen NOT IN ('VENTA', 'COBRO', 'PROPINA')` (replacing the WHITELIST), and generic `INGRESO`/`EGRESO` summation instead of hardcoded per-origen variables. Public return shape (`{ saldoUsd, saldoBs, isLoading }`) unchanged — no consumer changes needed.
- [x] 4.4 Rewrote all `useSaldoSesionCaja` test mocks (`use-sesiones-caja.test.ts:208-427`) to match the new split-query shape. Ran `yarn vitest run src/features/caja/hooks/__tests__/use-sesiones-caja.test.ts` — 12/12 pass (4 pre-existing NCR scenarios preserved + 2 structural SQL-shape assertions + 2 structural bug-fix scenarios + 2 QA-scenario parity scenarios + 2 non-`useSaldoSesionCaja` tests in the same file).
- [x] 4.5 Regression: `yarn vitest run src/features/caja --reporter=dot` — 28/28 pass. `yarn type-check:test` — 0 new errors in `caja`/`use-sesiones-caja` (3 pre-existing unrelated errors in `producto-form`/`use-pwa-update` untouched).

## Explicitly Out of Scope (do not implement here)

- The P0001 double-reversal sync bug (tracked separately in `nc-doble-reversa-sync-p0001`).
- Extracting a shared pure function between `useSaldoSesionCaja` and `useSaldoEfectivoBimonetario` (design rejected Option B in Phase 1-3 — kept as two structurally-aligned but separate query sets, per Phase 4's convergence instead of unification).
- Any `empresa_id` filtering gap (tracked separately in `nc-admin-saldo-disponible-sesion/design.md`).
- `useSaldoEfectivoBimonetario`'s own pre-existing quirks discovered during this investigation (e.g. its comment claiming `is_pos_saf_allocation = 1` exclusion does not match its actual SQL — no such filter is present in `use-cuadre.ts:876-902`) — out of scope, `use-cuadre.ts` is the oracle, not a target of this change.
