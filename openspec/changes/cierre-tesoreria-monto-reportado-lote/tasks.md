# Tasks: Consolidar monto reportado (no sistema) a Tesorería para métodos por-lote

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~140-160 (resolver ~20, tests ~80, hook ~15-20) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR: resolver TDD + call-site wiring + tests |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: RED — Failing Unit Tests

- [ ] 1.1 Create `src/features/caja/lib/__tests__/resolucion-monto-consolidacion.test.ts` (Vitest), importing `resolverMontoConsolidacionLote` from `../resolucion-monto-consolidacion` (not yet created).
- [ ] 1.2 Add 5 cases (assert `.toString()`): `Decimal(1000)`==system→`'1000'`; `Decimal(0)`→`'0'` (faltante, no fallback); `Decimal(123.45)`>system (sobrante)→`'123.45'` exact; `null`→`'0'`; `Decimal(10.999)`→`'10.999'` exact, no rounding.
- [ ] 1.3 Run `yarn test:run` on the new file — confirm RED.

## Phase 2: GREEN — Implement Pure Resolver

- [ ] 2.1 Create `src/features/caja/lib/resolucion-monto-consolidacion.ts`: export `ResolverMontoConsolidacionLoteParams` (`{ totalFisicoNativo: Decimal | null }`) and `resolverMontoConsolidacionLote(params): Decimal` = `params.totalFisicoNativo ?? new Decimal(0)`. No `totalSistemaD` param.
- [ ] 2.2 Re-run the test file — confirm GREEN (5 cases pass).
- [ ] 2.3 Run `yarn type-check:test` — new test file clean.

## Phase 3: Wire Call-Site (use-sesiones-caja.ts)

- [ ] 3.1 Import `resolverMontoConsolidacionLote`; extend `consolidacionPorMetodo` Map type (~L877) with `totalFisicoNativo: Decimal | null`.
- [ ] 3.2 Reorder: compute `totalFisicoNativo` (`Decimal | null`, ~L902-908) BEFORE `consolidacionPorMetodo.set(...)` (~L896), and pass it into that `.set(...)` call; keep the `sesiones_caja_detalle` snapshot (~L920-922) fed by the same value.
- [ ] 3.3 Extend `metodosParaConsolidar` tuple type and `metodoIdsSoloLotes` placeholders (~L1007-1016) with `totalFisicoNativo: null` (unused — lote-only methods always take the lotes branch); update the loop destructure (~L1073) to include it too.
- [ ] 3.4 In the sin-lotes `else` branch (~L1251-1269): compute `const montoReportadoD = resolverMontoConsolidacionLote({ totalFisicoNativo })` once; use it for `toStorageString(montoReportadoD)` in `consolidarMetodoATesoreriaEnTx` (~L1259) and for `aplicarComisionSiCorresponde(montoReportadoD)` (~L1268). Do NOT touch the lotes branch (~L1209-1250) or the faltante/cuadre snapshot (~L899-927).

## Phase 4: Full Verification

- [ ] 4.1 `yarn test:run` — full suite green, no regressions.
- [ ] 4.2 `yarn type-check` + `yarn type-check:test` — clean.
- [ ] 4.3 Code review: confirm `montoReportadoD` computed once per method, reused identically at both call sites (~L1259 deposit, ~L1268 commission).

## Phase 5: Manual QA (tester handoff — integration gap per obs #2539, not automated)

- [ ] 5.1 By-batch, reported < system (incl. 0) → INGRESO = reported; faltante snapshot keeps full system total.
- [ ] 5.2 By-batch, reported == system → no regression.
- [ ] 5.3 By-batch, reported > system (sobrante) → INGRESO = reported, precision preserved.
- [ ] 5.4 EFECTIVO → `mov_caja_fuerte` INGRESO uses counted cash, not accumulated sales.
- [ ] 5.5 By-batch with `comision_pct`, reported < system → commission on reported, not system total.
- [ ] 5.6 `deposito_directo=1` method → still fully excluded from cierre consolidation.

## Known Follow-ups (out of scope)

- Historical reconciliation for sessions with `diferencia <> 0` pre-fix (obs #2554) — needs business authorization.
- The "rechazar" action for tesorería pendientes — unrelated feature.
</content>
</invoke>
