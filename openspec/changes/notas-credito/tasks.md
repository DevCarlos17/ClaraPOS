# Tasks: notas-credito

Test runner confirmed (sdd-init cache, strict_tdd: true): `yarn test:run` (CI single-run), `yarn type-check:test` (tsc --noEmit --project tsconfig.test.json). Existing precedent: `src/features/ventas/hooks/__tests__/use-notas-credito.test.ts` already has TDD coverage for the current TOTAL-only function — all new behavior is RED→GREEN in that same file or a new sibling test file. All tasks below are TDD test-first where a runner target exists (SQL migrations are the one exception — no automated migration test framework; manual Supabase SQL Editor deploy per `migrations/README.md`).

## Aggregate Review Workload Forecast (top-level)

| Field | Value |
|---|---|
| Total estimated changed lines (10 PRs) | ~2350–2650 |
| Slices exceeding 400 lines alone | None *after* splitting 4 and 5 into a/b (see below) — 4 and 5 WOULD exceed 400 if kept as single PRs |
| Chained PRs recommended | **Yes** |
| Recommended PR sequencing | 1 → 2 → 3 → 4a → 4b → 5a → 5b → 6 → 7 → 8 (dependency order; 6 is safely postponable, see below) |
| Delivery strategy | ask-on-risk |
| Chain strategy | **pending** — not chosen this session. Orchestrator MUST ask the user (stacked-to-main vs feature-branch-chain) before `sdd-apply` starts slice 1 |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

**Slice 6 (REFUND_TESORERIA) recommendation**: estimated standalone at ~220–260 lines — comfortably fits the 400-line budget as its own PR (Low-Medium risk). The aggregate risk of this change comes from the *number* of slices (10 PRs), not from slice 6's size. Slice 6 has **zero dependents** (slices 7–8 do not read REFUND_TESORERIA-specific code), so it is the single safest slice to defer to a follow-up change ("al toro") if the chain grows too long to land in one sitting — but on size grounds alone it does NOT need to be split out. **Recommendation: keep in scope, sequence last-but-one (position 8 of 10), and treat it as the first candidate to cut if the user wants to shorten the chain.**

## Slice 1 — Bugfix `created_by` + Schema Foundation (Design §created_by decision, §schema migration 0091)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~110–130 |
| 400-line budget risk | Low |
| Chained PRs | No — single PR |

- [x] 1.1 Create `migrations/0091_notas_credito_schema.sql` (NEW file — never edit 0006). Idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern (see 0078 precedent): `notas_credito` += `created_by uuid`, `sesion_caja_id uuid`, `liquidacion_modalidad text`, `no_desembolso boolean`; `notas_credito_det` += `venta_det_id uuid`, `subtotal_bs text`. [Design §5 schema migration 0091]
- [x] 1.2 Same migration: idempotent `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` on `movimientos_metodo_cobro.origen` CHECK, adding `'NCR'` (mirror 0078 pattern exactly). [Design §4 Regla de Oro condition]
- [x] 1.3 Same migration: `INSERT INTO permisos (modulo, slug, nombre, descripcion)` for `ventas.nota_credito` (mirror 0048/0047 pattern). [Spec notas-credito-pos: doble PIN — permiso determina el PIN]
- [x] 1.4 Update `src/core/db/powersync/schema.ts`: add `created_by`, `sesion_caja_id`, `liquidacion_modalidad`, `no_desembolso` (all `column.text`/`column.integer` per booleans-as-integer convention) to `notas_credito` Table (~L753); add `venta_det_id`, `subtotal_bs` to `notas_credito_det` Table (~L776). **Discovery: `created_by` is referenced by the CURRENT `use-notas-credito.ts` INSERT (line 244) but is missing from BOTH the Postgres schema AND `schema.ts` — this is the actual live bug (local SQLite insert fails silently until this column exists).**
- [x] 1.5 Manual verification: apply 0091 via Supabase SQL Editor in sequence after 0090; confirm no error; confirm `schema.ts` change does not break existing `yarn type-check` / `yarn test:run` (additive-only, zero behavior change expected). Automated portion done: `yarn type-check:test` and `yarn test:run` both green (839/839 tests, 79 files). Manual Supabase SQL Editor apply is a deploy-time action outside this session's scope — documented in migration file's deploy-order comment.

## Slice 2 — `sesion_caja_id` link + conditional egreso (Regla de Oro) + reverse `pagos.is_reversed` (Design §4 Regla de Oro condition)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~190–250 |
| 400-line budget risk | Medium |
| Chained PRs | No — single PR |

- [x] 2.1 RED: `use-notas-credito.test.ts` — add scenarios: POS+EFECTIVO_REAL+sesión activa inserta `movimientos_metodo_cobro` EGRESO origen `'NCR'` con `sesion_caja_id` activo; Tradicional/no-efectivo NO inserta nada; `pagos.is_reversed` se marca solo para NC `tipo='TOTAL'`. [Spec notas-credito-pos: Impacto condicional — Regla de Oro; Spec caja: Consumo de egreso condicional]
- [x] 2.2 GREEN: extend `crearNotaCredito` params with `entryPoint: 'POS' | 'TRADICIONAL'` and `sesionCajaActivaId?: string`; implement condition `entryPoint==='POS' && modalidad==='EFECTIVO_REAL' && venta.sesion_caja_id===sesionCajaActivaId` gating the `movimientos_metodo_cobro` EGRESO insert (reuse `doc_origen_id=ncrId`, no new FK). [Design §4]. **Note**: slice 2 has no `modalidad` param yet (lands in slice 3) — `crearNotaCredito` only supports the TOTAL/implicit-EFECTIVO_REAL flow today, so the condition is implemented as `entryPoint==='POS' && venta.sesion_caja_id===sesionCajaActivaId` (documented in code comment); slice 3 will thread the real `modalidad` value through.
- [x] 2.3 GREEN: loop `pagos` for the venta, `UPDATE pagos SET is_reversed=1 WHERE venta_id=? AND is_reversed=0` — only when NC `tipo='TOTAL'` (PARCIAL never flips this, per Design §3).
- [x] 2.4 Wire `entryPoint`/`sesionCajaActivaId` from `crear-ncr-modal.tsx` call site (pass current session context via `useCurrentUser`/caja store). **Note**: `crear-ncr-modal.tsx`/`notas-credito-page.tsx` IS the Tradicional module (dedicated NC screen, searches ANY factura) — wired `entryPoint: 'TRADICIONAL'` there; no POS-express entry point exists yet (that UI lands in Slice 5a), so `sesionCajaActivaId` wiring for the POS path is deferred to 5a.
- [x] 2.5 Verify: `yarn test:run` + `yarn type-check:test` green; confirm `use-cuadre.ts` is untouched (grep diff — zero lines changed in that file, per Design confirmation).

## Slice 3 — Liquidation modalities (SALDO_FAVOR, AJUSTE_CXC) + no-desembolso gate (Design §Regla de Oro condition, Spec notas-credito-liquidacion)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~260–320 |
| 400-line budget risk | Medium (monitor) |
| Chained PRs | No — single PR, but close to budget; do not add scope |

- [ ] 3.1 **Decision task — COMPENSACION_VENTA shape**: implement as design's accepted tradeoff — TWO sequential transactions, NOT one mega-tx. `crearNotaCredito` always emits a SAFC leftover via `registrarSafExcedente` when `modalidad==='COMPENSACION_VENTA'`; the caller (slice 5 UI) makes a SEPARATE `crearVenta()` call that consumes the SAFC via the existing `safEntry` mechanism. Add a code comment at the call site documenting this is intentional (not itself a design flaw) and a test asserting `crearNotaCredito` does NOT internally call `crearVenta`. [Design §3 — open question, resolved here]
- [ ] 3.2 RED: tests for modalidad matrix — `SALDO_FAVOR` calls `registrarSafExcedente` traceable to `nota_credito_id`, zero caja/banco writes; `AJUSTE_CXC` reduces `clientes.saldo_actual` via `movimientos_cuenta`, zero caja writes; gate rejects a forced `EGRESO_MANUAL`-style cash-out param when modalidad is non-cash, called directly (function-level, no UI). [Spec notas-credito-liquidacion: Gate anti-fraude de no-desembolso]
- [ ] 3.3 GREEN: add `modalidad: 'SALDO_FAVOR' | 'COMPENSACION_VENTA' | 'AJUSTE_CXC' | 'REFUND_TESORERIA'` (REFUND_TESORERIA validated but not yet implemented until slice 6 — throw `not implemented` there) as required param; implement the anti-fraude gate as the FIRST check in the function body (step 0b, before any DB write, per Design §3): throw if a cash-out flag is set and modalidad is not `REFUND_TESORERIA`/POS-EFECTIVO_REAL-Regla-de-Oro.
- [ ] 3.4 GREEN: implement `AJUSTE_CXC` branch reusing the existing saldo-reduction pattern already in the file (lines ~407–444) adapted to the new modalidad switch; implement `SALDO_FAVOR` branch calling `registrarSafExcedente` (existing function, `src/features/cxc/hooks/use-cxc.ts:1934`).
- [ ] 3.5 Verify: `yarn test:run` + `yarn type-check:test` green.

## Slice 4a — Pure fiscal-breakdown + double-credit-guard module (Design §2 partial-NC fiscal breakdown)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~260–320 |
| 400-line budget risk | Medium (monitor) |
| Chained PRs | Yes — 4a/4b split (see below) |

- [ ] 4a.1 RED: new `src/features/ventas/utils/__tests__/notas-credito-fiscal.test.ts` (pure-module pattern, mirrors `recibo-pagos.ts` precedent) — table-driven cases for `calcularDesgloseLineaNC(linea, ventaTasa)`: Exento line → `totalExentoUsd`; Base+IVA line → `totalBaseUsd`+`totalIvaUsd` (same formula as `use-ventas.ts` lines 398–408); mixed-alícuota multi-line PARCIAL; tasa histórica = `venta.tasa` verbatim regardless of tasa vigente today.
- [ ] 4a.2 RED: same file — `validarTopeDobleCredito(ventaDetId, cantidadDevolver, yaAcreditado)` cases: rejects when `SUM(ya acreditado) + cantidadDevolver > cantidad original de la línea`; accepts when within remaining quantity. [Design §2 — "gap real no cubierto por el trigger existente"]
- [ ] 4a.3 GREEN: implement `src/features/ventas/utils/notas-credito-fiscal.ts` — zero DOM/tx dependencies, pure functions only (Decimal.js), exporting `calcularDesgloseLineaNC` and a query-shape helper `sumCantidadYaAcreditada` (SQL string + row-mapping, tx-agnostic).
- [ ] 4a.4 Verify: `yarn test:run` + `yarn type-check:test` green. This PR has NO integration wiring — pure module + tests only (same shape as the `recibo-pagos.ts` PR1 precedent).

## Slice 4b — Wire PARCIAL into `crearNotaCredito` atomic tx (Design §3 atomic tx shape, §2 venta_det_id FK)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~260–320 |
| 400-line budget risk | Medium (monitor) |
| Chained PRs | Yes — depends on 4a |

- [ ] 4b.1 RED: extend `use-notas-credito.test.ts` — TOTAL regression (still passes unchanged); PARCIAL happy path with 2+ selected lines; PARCIAL double-credit rejected (reuses 4a guard); PARCIAL Kardex reingresa solo las líneas seleccionadas (no toda la venta); PARCIAL servicio (`tipo='S'`) no genera movimiento por receta cuando esa línea no fue seleccionada.
- [ ] 4b.2 GREEN: replace `CrearNotaCreditoParams.venta_id`-only shape with `{ venta_id, tipo: 'TOTAL' | 'PARCIAL', lineas?: { venta_det_id: string; cantidadDevolver: string }[], ... }`; when `tipo==='TOTAL'`, derive `lineas` from ALL `ventas_det` rows (preserves current behavior as a special case, avoids duplicating logic).
- [ ] 4b.3 GREEN: per selected línea — call `calcularDesgloseLineaNC` (4a) for fiscal breakdown, call `sumCantidadYaAcreditada` + throw on tope, `INSERT INTO notas_credito_det` (`venta_det_id`, `subtotal_usd`, `subtotal_bs`, `tipo_impuesto`, `impuesto_pct`) per línea, adapt the existing per-línea Kardex/receta loop (currently lines 265–405) to iterate only over selected líneas instead of the full `ventas_det` result set.
- [ ] 4b.4 GREEN: `notas_credito` header INSERT now also writes `total_exento_usd`/`total_base_usd`/`total_iva_usd` (columns already exist in `schema.ts`, previously unused) by summing across selected líneas.
- [ ] 4b.5 Verify: `yarn test:run` + `yarn type-check:test` green; confirm the existing Postgres trigger (tope acumulado por factura) still fires correctly alongside the new per-línea guard (defense in depth, not a replacement).

## Slice 5a — Dual PIN + depósito picker wiring (Design invariant, Spec notas-credito-pos + deposito-inactivo-guard delta)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~200–260 |
| 400-line budget risk | Low-Medium |
| Chained PRs | Yes — depends on 4b |

- [ ] 5a.1 RED (where testable — PIN gating logic, not the dialog itself): unit tests for "permiso `ventas.nota_credito` presente → sin PIN de emisión" vs "ausente → exige PIN de emisión"; "segundo PIN de supervisor desbloquea selector explícito de depósito" vs "sin segundo PIN → riel automático (origen si activo, principal si no)".
- [ ] 5a.2 GREEN: wire two independent `SupervisorPinDialog` instances in `crear-ncr-modal.tsx` (mirror existing dual-PIN patterns in `cobro-modal.tsx`/`pos-terminal.tsx`) — PIN A (emisión, permission-gated) and PIN B (segundo PIN, depósito override only).
- [ ] 5a.3 GREEN: Tradicional module — new depósito selector component reusing `useDepositosVentaActivos` (per deposito-inactivo-guard delta spec, "Reingreso con Elección Explícita"), filtered `empresa_id`, excludes inactive depósitos.
- [ ] 5a.4 Verify: `yarn test:run` + `yarn type-check:test` green.

## Slice 5b — PARCIAL line-selection UI (POS + Tradicional) (Spec notas-credito-emision)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~180–230 |
| 400-line budget risk | Low |
| Chained PRs | Yes — depends on 5a and 4b |

- [ ] 5b.1 Extend `crear-ncr-modal.tsx` (or split into a Tradicional-specific modal if the TOTAL-only dialog diverges too much): checkbox + qty-input per `ventas_det` línea, disabled beyond remaining-creditable qty (surface 4a's `sumCantidadYaAcreditada` result in the UI as a hint, not just a hard DB error).
- [ ] 5b.2 Wire `entryPoint`/modalidad selector (SALDO_FAVOR/COMPENSACION_VENTA/AJUSTE_CXC, REFUND_TESORERIA hidden until slice 6 lands) into the confirm action, calling the slice 4b `crearNotaCredito` signature.
- [ ] 5b.3 Verify: manual smoke test (TOTAL still default/fastest path in POS) + `yarn type-check` clean.

## Slice 6 — REFUND_TESORERIA (conditional, standalone) (Design §5 "no new schema needed", Spec notas-credito-liquidacion)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~220–260 |
| 400-line budget risk | Low-Medium |
| Chained PRs | No — single PR, safely postponable to a follow-up change if the chain needs to be cut short (zero dependents in slices 7–8) |

- [ ] 6.1 RED: tests — `REFUND_TESORERIA` inserts into `movimientos_bancarios` or `mov_caja_fuerte` (per chosen origen) with `validado=0`; `doc_origen_id`/reference links back to `nota_credito_id`; zero writes to `movimientos_metodo_cobro` of the active POS session (Regla de Oro: `$0.00` impact on active cajón regardless of the NC's originating session).
- [ ] 6.2 GREEN: implement `REFUND_TESORERIA` branch in the modalidad switch from slice 3, gated by the same no-desembolso rule (this IS the one modalidad allowed to move real money outside the POS drawer).
- [ ] 6.3 GREEN: liquidation UI exposes `REFUND_TESORERIA` as an option only in Tradicional (never POS-express, per scope).
- [ ] 6.4 Verify: `yarn test:run` + `yarn type-check:test` green; confirm existing conciliación bancaria screen picks up the `validado=0` row with zero changes to that screen (additive, per Design "no new schema needed").

## Slice 7 — Printable document (Spec notas-credito-emision, precedent: recibo-pagos)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~260–340 |
| 400-line budget risk | Medium (monitor) |
| Chained PRs | No — single PR |

- [ ] 7.1 RED: pure data-prep function tests (mirror `recibo-pagos.ts` precedent) — `construirDatosImpresionNC(nc, det, venta)` producing the printable shape (header, líneas, desglose fiscal, modalidad de liquidación).
- [ ] 7.2 GREEN: implement the pure prep function; extend/reuse `factura-export.ts` jsPDF machinery for an NC layout (or new `nota-credito-export.ts` if the layout diverges enough to avoid entangling with factura printing).
- [ ] 7.3 GREEN: wire a print/export action from the NC detail view and from `crear-ncr-modal.tsx` post-success toast.
- [ ] 7.4 Verify: `yarn test:run` + `yarn type-check:test` green; manual PDF/PNG check per recibo precedent (no automated visual regression exists).

## Slice 8 — Reporting Z + cross-link NC# (Spec caja: Consumo de egreso condicional — display only, formula NOT touched)

### Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~200–280 |
| 400-line budget risk | Low-Medium |
| Chained PRs | No — single PR |

- [ ] 8.1 RED: tests for the cross-link query — egreso detail row resolves `doc_origen_id` → `nro_ncr` when `origen='NCR'`; confirms `empresa_id` isolation.
- [ ] 8.2 GREEN: reporting/detail component join (NOT `use-cuadre.ts` core formula — that file stays untouched per Design confirmation) to display `nro_ncr` next to NC-originated egresos in the Reporte Z breakdown.
- [ ] 8.3 GREEN: NC listing (`useNotasCredito`) — add modalidad/sesión filters for reporting.
- [ ] 8.4 Verify: `yarn test:run` + `yarn type-check:test` green; grep diff on `use-cuadre.ts` to confirm zero lines changed (hard invariant from Design).

## Cross-cutting invariants (apply to every slice above)

- Migration 0091 is a NEW file — never edit 0006 or any applied migration.
- Every NC query filters `empresa_id`.
- Financial immutability: `notas_credito`/`notas_credito_det`/`movimientos_inventario`/`movimientos_cuenta`/`libro_contable` are INSERT-only.
- Regla de Oro egreso only ever targets the ACTIVE session (`sesion_caja_id` match required, not just "any open session").
- `use-cuadre.ts` is NOT modified anywhere in this change (verified additive per Design).
- PowerSync convention: booleans → `column.integer`, decimals → `column.text`.
- Slice 5b's `crear-ncr-modal.tsx` changes replace the OLD `crearNotaCredito` call at line 44 — update that call site and its existing test (`use-notas-credito.test.ts`) together, never leave them out of sync.
