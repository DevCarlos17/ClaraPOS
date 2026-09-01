# Tasks: Fix SAF write-order bug in POS checkout

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines (app code) | ~430-480 (fn ~80, test ~130, use-ventas.ts reorder ~236, cobro-modal.tsx ~10) |
| manual-verify.md | ~60-100 lines, process artifact, excluded from budget |
| Suggested split | Single PR, 4 work-unit commits |
| Delivery strategy | ask-on-risk |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

**Why no chaining**: the `use-ventas.ts` reorder (Steps 6/7/7d → one block) is a single atomic unit in the codebase's most sensitive function. Splitting the pure-fn extraction from its wiring would ship an untested intermediate write-order state. Recommend `size:exception` single PR; confirm with user before apply.

**Dependency**: requires PR #66 (`fix/cxc-deuda-credito-lectura`) — `calcularCreditoDisponible` (`src/features/cxc/lib/deuda-credito-cliente.ts`) + `SAFC` tipo — before Work Unit 2.

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Pure fn `calcularCierreVentaConSaf` + tests (RED→GREEN) | No dependency |
| 2 | `crearVenta()` reorder wiring the pure fn | Needs Unit 1 + PR #66 |
| 3 | `cobro-modal.tsx` capping toast | Needs Unit 2 (`safFueCapeado`) |
| 4 | `manual-verify.md` for sdd-verify | Needs Units 1-3 |

## Phase 1: Pure Function (TDD)

- [x] 1.1 [RED] `src/features/ventas/lib/__tests__/calcular-cierre-venta-saf.test.ts` — failing cases: full SAF coverage→CONTADO/pend=0 (spec req.1 scn.1); partial SAF+cash→CONTADO (scn.2); partial SAF+credit→CREDITO, pend=0.80 not 1.30 (scn.3, regression); SAF+cash+credit split (scn.4); SAF capped when requested>available, `safFueCapeado=true`, no negative credit (req.2 scn.2); full-coverage-no-SAF regression guard.
- [x] 1.2 [GREEN] Create `src/features/ventas/lib/calcular-cierre-venta-saf.ts` — `calcularCierreVentaConSaf(input)`: Bs-anchored pendiente math (`usdToBs(total,tasa) - abonadoBsNativo - usdToBs(abonadoUsdNativo,tasa)`, clamp ≥0); 3-way cap `min(solicitado, disponible, pendienteAntesDeSaf)`; rounding-threshold auto-absorb (`tasa*0.01`) unless `respetarEleccionCredito`; `tipo = saldoPendUsd.gt('0.001') ? 'CREDITO' : 'CONTADO'`. `Decimal`-based, DB-free. `yarn test:run` until green.
- [x] 1.3 `yarn type-check:test` — confirm clean.

## Phase 2: crearVenta Reorder (needs Phase 1 + PR #66)

- [x] 2.1 `src/features/ventas/hooks/use-ventas.ts` — inside the existing `db.writeTransaction`, replace Steps 6 (L865-881) + 7 (L883-927) + 7d (L1332-1393) with one merged block: (a) if `safEntry` present, SELECT `SUM(SAFC)`/`SUM(SAF)` scoped `cliente_id+empresa_id` → `calcularCreditoDisponible`; (b) call `calcularCierreVentaConSaf(...)`; (c) `UPDATE ventas.saldo_pend_usd`, `UPDATE ventas.tipo` only if it disagrees with frontend value; (d) INSERT `movimientos_cuenta tipo='FAC'` only if `tipo==='CREDITO' && saldoPendUsd>0.001` (keep ABSORBER/DIFERENCIAL_FALTANTE exclusions); (e) INSERT `movimientos_cuenta tipo='SAF'` (capped amount, `venta_id`, `referencia='SAF-VTA-{nroFactura}'`) only if `safAplicadoUsd>0.001`; (f) single `UPDATE clientes.saldo_actual` from one read (FAC delta then SAF delta). Step 7c (discrepancy switch, L929-1330) untouched, runs after.
- [x] 2.2 Extend `CrearVentaResult` with optional `safAplicadoUsd?: number`, `safFueCapeado?: boolean`, from the pure-fn result.
- [x] 2.3 Confirm no intermediate SAF-unaware committed state between FAC/SAF writes (same tx) — spec req.3 scn.1.
- [x] 2.4 `yarn type-check` on the modified file.

## Phase 3: cobro-modal Capping Notice (needs Phase 2)

- [x] 3.1 `src/features/ventas/components/cobro-modal.tsx` success handler — add `toast.warning(...)` when `result.safFueCapeado` is true. Additive only; checkbox/input logic (`safMonto = min(safDisponible, totalEfectivoUsd)`) already correct, unchanged.

## Phase 4: Manual Verification (needs Phases 1-3)

- [x] 4.1 Write `openspec/changes/pos-aplicar-saf-checkout/manual-verify.md` — fresh test client/empresa: full-cover SAF→CONTADO/no CxC; partial SAF+cash→CONTADO; partial SAF+credit→CREDITO pend=0.80 (regression); SAF request>available→capped+toast, no negative credit; cierre de caja on SAF+cash sale shows only cash portion.
