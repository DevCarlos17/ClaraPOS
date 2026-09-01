# Tasks: Líneas de cargo (Material de Empaque / Flete) en Factura de Compra

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~220-320 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full feature (migration → lib+tests → tx insert → form UI → validation → regression) | PR 1 | Single cohesive PR, ~220-320 lines, under 400 budget. No chaining needed. |

## Phase 1: Foundation (Migration + Config Registration)

- [x] 1.1 Create `migrations/0082_seed_material_empaque_flete_cuentas.sql`: INSERT new `plan_cuentas` row `6.1.26 FLETES Y TRANSPORTE DE MERCANCIA` (GASTO, DEUDORA, under 6.1, `es_cuenta_detalle=TRUE`, flat/no subgroup) — apply to ALL existing empresas with `ON CONFLICT DO NOTHING`. **DEVIATION**: code changed from `6.1.25` (as designed) to `6.1.26` — `6.1.25` was taken by migration `0081` (`GASTOS DE VENTA` group, applied after design.md was written), discovered during implementation.
- [x] 1.2 In same migration: INSERT `cuentas_config` rows for `MATERIAL_EMPAQUE` (→ existing 6.1.16) and `FLETE_COMPRA` (→ new 6.1.26) for all existing empresas, `ON CONFLICT DO NOTHING`.
- [x] 1.3 In same migration: `CREATE OR REPLACE FUNCTION seed_plan_cuentas` and `seed_cuentas_config` (mirror `migrations/0064`/`0081` pattern) so new empresas get 6.1.26 + both config keys on registration.
- [x] 1.4 Add `MATERIAL_EMPAQUE` and `FLETE_COMPRA` to `CLAVES_CONFIG` in `src/features/contabilidad/schemas/cuentas-config-schema.ts`.

## Phase 2: Pure Logic (TDD — write tests FIRST)

- [x] 2.1 RED: Write `src/features/inventario/lib/__tests__/compra-lineas-cargo.test.ts` covering `totalizarLineasCargo`: empty array → zeros; single 0% line; single 16% line; mixed lines both concepts.
- [x] 2.2 RED: Extend same test file for `consolidarLineasCargo`: empty → `[]`; single concept single line; same concept multiple lines summed; same concept mixed IVA (0%+16%) → base/IVA summed independently; both concepts present → exactly 2 groups; Decimal precision (non-terminating amounts, no float drift).
- [x] 2.3 GREEN: Create `src/features/inventario/lib/compra-lineas-cargo.ts` with `LineaCargoUI` type, `calcularLineaCargo`, `totalizarLineasCargo`, `consolidarLineasCargo` (per design contracts) — implement until 2.1/2.2 pass. Use `Decimal.js` + `toStorageString()`.
- [x] 2.4 REFACTOR: Clean up duplication between the three functions; run `yarn test:run` + `yarn type-check:test` to confirm still green.

## Phase 3: Schema Validation

- [x] 3.1 RED: Add Zod tests for `lineaCargoSchema` (`src/features/inventario/schemas/__tests__/compra-lineas-cargo-schema.test.ts`): reject `monto <= 0`; reject `porcentaje_iva` not in `{0,16}`; accept valid line.
- [x] 3.2 GREEN: Add `lineaCargoSchema` to `src/features/inventario/schemas/compra-schema.ts` — `concepto: z.enum(['EMPAQUE','FLETE'])`, `monto` as `campoFinanciero`-style positive number, `porcentaje_iva: z.union([z.literal(0), z.literal(16)])`. Export `LineaCargoUI`-compatible type.

## Phase 4: Write Path (crearCompra integration)

- [x] 4.1 In `src/features/inventario/hooks/use-compras.ts`, add optional `lineasCargo?: LineaCargoUI[]` to `CrearCompraParams`.
- [x] 4.2 Inside `crearCompra`, call `totalizarLineasCargo(lineasCargo)` and fold result into the existing `totalExentoUsd`/`totalBaseUsd`/`totalIvaUsd` accumulation (before the `facturas_compra` INSERT), so stored totals already include cargo amounts — product-line loop untouched.
- [x] 4.3 After the product-line loop (still inside the same `writeTransaction`), call `consolidarLineasCargo(lineasCargo)`. For each returned concept group: `SELECT cuenta_contable_id FROM cuentas_config WHERE empresa_id = ? AND clave = ?` (`MATERIAL_EMPAQUE` or `FLETE_COMPRA`); if no row found, `throw` (aborts whole tx).
- [x] 4.4 For each resolved concept, raw `tx.execute('INSERT INTO gastos (...) VALUES (...)', [...])` following the `use-ajustes.ts` column pattern: `doc_origen_tipo='FACTURA_COMPRA'`, `doc_origen_id=compraId`, `empresa_id`, amounts from the consolidated base/IVA sums, bimonetario using the invoice's tasa, `tipo_impuesto`/`porcentaje_iva` dynamic. Does NOT call `crearGasto()`.
- [ ] 4.5 DEFERRED — no PowerSync/wa-sqlite integration test harness exists in this repo (confirmed via cached testing-capabilities: WASM not runnable in Node, no mocks built). `crearCompra`/`aplicarAjuste` have zero existing direct tests for the same reason (repo-wide precedent) — only their extracted pure helpers are tested. Mocking `db.writeTransaction`/`tx.execute` from scratch would need 10+ mocks, violating strict-tdd.md Mock Hygiene Rules.
- [ ] 4.6 DEFERRED — same reason as 4.5. Partial coverage via pure-logic tests: `totalizarLineasCargo([])`/`consolidarLineasCargo([])` unit tests prove zero-line input contributes nothing / produces zero groups; the `crearCompra` wiring only adds an `if (gruposCargo.length > 0)` gate, product-line loop diff-verified untouched.

## Phase 5: Form UI

- [x] 5.1 In `src/features/inventario/components/compras/compra-form.tsx`, add `lineasCargo` state array (separate from `lineas`), with add/remove/update handlers.
- [x] 5.2 Add "+ Material de empaque" and "+ Flete" buttons that push a new blank cargo-line row for the respective concept; allow multiple lines per concept.
- [x] 5.3 Render charge-line rows: monto input (form's already-selected currency) + IVA dropdown restricted to `0%`/`16%` (no free text) + remove-row button.
- [x] 5.4 Fold `lineasCargo` into the displayed total using `totalizarLineasCargo` from `compra-lineas-cargo.ts`, alongside the existing product-line total computation.
- [x] 5.5 Add submit-guard validation: block processing while any charge line has missing/invalid `monto`; surface inline error next to the cargo section + amber row highlight on the incomplete line.
- [x] 5.6 Pass `lineasCargo` through to `crearCompra()` call on submit.
- [x] 5.7 Verified product-line UI/logic in `compra-form.tsx` is untouched (diff review: no changes to existing `lineas` state, inventory/kardex/PVP/lotes wiring).

## Phase 6: Verification

- [x] 6.1 Run `yarn test:run` — all new and existing tests green (249/249: 230 baseline + 19 new).
- [x] 6.2 Run `yarn type-check:test` — no type errors. `yarn type-check` — zero new non-test errors.
- [ ] 6.3 Manual QA per proposal success criteria — not performed in this session (no running dev/DB environment); left for orchestrator/user.
