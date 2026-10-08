# Tasks v2: SAF — Lotes de Crédito + Asignaciones (reemplaza Fases 6-7 de `tasks.md`)

**Supersedes** Fases 6-7 de `tasks.md` (tabla plana). Fases 1-5 (Slice 1) ya mergeadas (PR #203), sin cambios. Design: `design-v2.md`. Decisiones: engram #5061, #5067.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1250-1500 total (see per-PR split below) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1=migrations → PR2=schema/connector/helpers → PR3=write-sites 1D → PR4=abono-global 2D+bugfix → PR5=read-path+verification |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (cached) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Base | Est. lines |
|---|---|---|---|---|
| 1 | Migrations 0104+0105: tables, triggers, RLS, indexes | PR1 | main | ~300 |
| 2 | schema.ts + connector.ts wiring + pure helper (TDD) | PR2 | PR1 | ~150 |
| 3 | Write-sites: 1D creation (3) + 1D consumption (3) | PR3 | PR2 | ~450 |
| 4 | `registrarAbonoGlobal` 2D cascade + overflow bug fix | PR4 | PR3 | ~400 |
| 5 | Read-path query swap + UX-unchanged verification | PR5 | PR4 | ~100 |

## Phase 1: Migrations (no vitest, BEGIN/ROLLBACK)

- [x] 1.1 `0104_saf_creditos_lotes.sql`: table (cols per design-v2 §3) + 3 indexes + RLS (SELECT/INSERT/UPDATE) + `validate_saf_lote_update()` + trigger; verify `BEGIN`→INSERT→blocked direct UPDATE of `saldo_disponible_usd`→`ROLLBACK`
- [x] 1.2 `0105_saf_creditos_aplicaciones.sql`: table (cols per design-v2 §4) + 4 indexes + RLS (SELECT/INSERT only) + `consumir_saf_lote()` + trigger; verify `BEGIN`→INSERT within limit→overdraft INSERT raises P0001→`ROLLBACK`
- [x] 1.3 Ship 0104+0105 same PR (0105 FK depends on 0104); reconciliation check `monto_original_usd - SUM(aplicaciones) = saldo_disponible_usd`, 0 mismatches

## Phase 2: Pure Helper + Schema/Connector Wiring (TDD)

- [x] 2.1 RED: failing tests for `calcularSaldoLoteDespues(saldoAntes, montoAplicado)` mirroring `consumir_saf_lote()` math, incl. overdraft rejection, floor-at-zero
- [x] 2.2 GREEN+REFACTOR: implement in `saldo-cliente.ts` (sibling helper); `yarn test:run` green
- [x] 2.3 `schema.ts`: add `saf_creditos_lotes` (after `vencimientos_cobrar`, `column.text` decimals) + `saf_creditos_aplicaciones` (`insertOnly: true`); register both in `AppSchema`
- [x] 2.4 `connector.ts`: `TRIGGER_MANAGED_PATCH_COLUMNS.saf_creditos_lotes = ['saldo_disponible_usd','status','updated_at']`; add `saf_creditos_aplicaciones` to `IMMUTABLE_TABLES`
- [x] 2.5 Connector test: lotes PATCH excludes trigger-managed cols; aplicaciones retry uses `ON CONFLICT DO NOTHING`

## Phase 3: Write Sites — Creation (pair each SAFC with 1 lote row, same tx; `saldo_disponible_usd=monto_original_usd`)

- [x] 3.1 `registrarSafExcedente` (`use-cxc.ts` ~L2002-2053), `origen_tipo='VENTA'`
- [x] 3.2 POS Paso B remainder (`use-ventas.ts` ~L1140-1177), `origen_tipo='VENTA'`
- [x] 3.3 NC remainder — SALDO_FAVOR/COMPENSACION_VENTA/REFUND_TESORERIA (`use-notas-credito.ts` ~L1285), `origen_tipo='NOTA_CREDITO'`
- [x] 3.4 Test per site: SAFC INSERT → paired lote row, correct balance

## Phase 4: Write Sites — Consumption (FIFO over active lotes by `fecha`, `idx_saf_lotes_cliente_disponible`; INSERT 1..N `saf_creditos_aplicaciones` rows)

- [ ] 4.1 `aplicarSaldoFavor` (`use-cxc.ts` ~L1675)
- [ ] 4.2 `registrarPagoFactura` inline SAF branch (`use-cxc.ts` ~L678-787)
- [ ] 4.3 POS checkout SAF-as-payment, `invoiceAssignments` branch (`use-ventas.ts` ~L1069-1105)
- [ ] 4.4 Test per site: multi-lote consumption sums to SAF ledger amount; overdraft raises

## Phase 5: `registrarAbonoGlobal` — 2D Cascade + Overflow Bug Fix (highest complexity)

- [ ] 5.1 RED: 2 lotes × 3 facturas simultaneous, assert `SUM(aplicaciones.monto_aplicado_usd)` = total SAF ledger amount, exact per-lote/per-factura split
- [ ] 5.2 GREEN: nest lote-FIFO inside existing factura-FIFO loop (~L960-986), INSERT `saf_creditos_aplicaciones` per lote×factura combo touched
- [ ] 5.3 Bug fix: promote `pagoAnticipoId` overflow (~L989-1013, today `Decimal.max(0,...)` drops it) → INSERT SAFC `movimientos_cuenta` + `saf_creditos_lotes` row, `origen_tipo='PAGO'`, `origen_id=pagoAnticipoId`
- [ ] 5.4 REFACTOR + edge cases: 0 lotes available, exact-balance lote, partial last lote
- [ ] 5.5 `yarn test:run` green; cuadre regression unchanged (zero new rows read by cuadre)

## Phase 6: Read Path + UX-Unchanged Verification

- [ ] 6.1 `factura-detalle-cxc.tsx` (~L194-202): replace `movimientos_cuenta WHERE venta_id AND tipo='SAF'` with `saf_creditos_aplicaciones WHERE venta_id=? ORDER BY fecha` (`idx_saf_aplic_venta`); fixes blind spot for abono-global (`venta_id` was NULL there)
- [ ] 6.2 Test: invoice touched only via abono-global now shows "SAF aplicado"
- [ ] 6.3 Checklist: POS gen/apply, CxC abono gen/apply, cuadre, invoice-list flag, SAF-vs-pending display — identical to pre-change UX (design-v2 §9)
- [ ] 6.4 Staging spot-check: `monto_original_usd - SUM(aplicaciones) = saldo_disponible_usd` for all lotes after test writes
