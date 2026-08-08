# Tasks: Centralizar manejo de zona horaria VET

## Review Workload Forecast

Estimated changed lines: ~395-445 (PR1 ~265L, PR2 ~130-180L)
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
Delivery strategy: ask-on-risk

| Unit | Goal | PR |
|------|------|-----|
| 1-4 | format.ts tz param + formatMesAnio + Cat B SQL + kardex/conciliacion fix + vencimientos dedup (TDD) | PR1 ~265L |
| 5 | PR1 verification gate | PR1 |
| 6-13 | Cat A/C mechanical migration by folder | PR2 ~130-180L |
| 14 | PR2 verification gate | PR2 |

## Phase 1: format.ts signatures (TDD) — commit 1, PR1 — DONE (4c373e4)

- [x] 1.1 RED `format.test.ts` (new): default-tz unchanged, explicit non-VET tz, bare-date no midnight-shift (bug #3) — all 3 formatters
- [x] 1.2 RED: formatDateTime with kardex ISO shapes (space/offset)
- [x] 1.3 RED: formatMesAnio default+explicit tz (regex assert)
- [x] 1.4 GREEN `format.ts`: add optional `tz=VE_TZ` param to the 3 functions
- [x] 1.5 GREEN: add `formatMesAnio(dateStr, tz=VE_TZ)` (noon-anchor, month/year)
- [x] 1.6 `yarn test:run` green
- [x] 1.7 REFACTOR: comment noon-anchor limitation

## Phase 2: Cat B kardex SQL (TDD) — commit 2, PR1 — DONE (ce92bb4)

- [x] 2.1 RED `kardex-sql.test.ts` (new — see deviation note below): `buildMovimientosFiltradosSql()` contains `T00:00:00-04:00`/`T23:59:59-04:00`
- [x] 2.2 GREEN: extract exported `buildMovimientosFiltradosSql()` in new `kardex-sql.ts` (pure file, see deviation note), interpolate `VE_OFFSET`
- [x] 2.3 GREEN: `useMovimientosFiltrados` calls the extracted function
- [x] 2.4 `yarn test:run` green

## Phase 3-4: Kardex print, conciliacion, vencimientos dedup — commits 3-4, PR1 — DONE (552c9db, 08f7e6a)

- [x] 3.1 `kardex-list.tsx` L121 `${mov.fecha}` → `formatDateTime(mov.fecha)`
- [x] 3.2 `kardex-list.tsx` L154 → `formatDateTime(localNow())`
- [x] 3.3 `conciliacion-tesoreria.tsx` L380 → `formatMesAnio(desde)`
- [x] 3.4 VERIFY: formatMesAnio matches prior axis shape; kardex print matches on-screen (both ISO shapes) — confirmed via node repro: `toLocaleDateString('es-VE',{month:'short',year:'2-digit'})` and `Intl.DateTimeFormat('es-VE',{...}).format()` produce byte-identical `"ene. 26"` output
- [x] 4.1 `vencimientos.ts`: remove local `VE_TZ`, import from `@/lib/dates`
- [x] 4.2 `yarn test:run` — vencimientos.test.ts still green

## Phase 5: PR1 verification gate — commit 5 — DONE

- [x] 5.1 `yarn test:run` full suite green (221/221, baseline was 206)
- [x] 5.2 `yarn type-check:test` for `*.test.ts` — clean
- [x] 5.3 `yarn type-check` app code green — only known spurious `*.test.ts` describe/it/expect noise, zero real errors
- [x] 5.4 Manual: kardex screen/print, conciliacion axis — flagged for human spot-check (see apply-progress)

## Phase 6-13: Cat A/C mechanical migration by folder — PR2 — DONE

Import `formatDate`/`formatDateTime`/`formatHora` (+ `localNow`). Exact helper/line: spec.md table (obs #1258). Cat A default: `formatDateTime(localNow())`.

- [x] 6.1 inventario (11 files, commit fb99a5c): lote-list, ajuste-masivo, ajuste-list, ajuste-detalle-modal, unidad-list, servicio-list, combo-list, lote-trazabilidad, deposito-productos-modal, deposito-list, routes/inventario/reportes
- [x] 7.1 reportes (6 files, commit 8c5d339): cuadre-page (exception: formatHora + formatDate, preserved split), ventas-reportes-pdf, inventario-valor-modal, inventario-rotacion-modal, ventas-consultas-modal, cuadre-imprimir
- [x] 8.1 tesoreria (commit 51274a9): export-tesoreria.ts (4 sites) → formatDate(localNow())
- [x] 9.1 contabilidad (commit 50b0554): gastos-dashboard, gasto-form, libro-contable-list
- [x] 10.1 configuracion (commit 77d998f): tasa-form, usuario-list
- [x] 11.1 compras + proveedores (commit 3564de9): cxp-page, nota-fiscal-compra-list, ret-iva-compra-list, ret-islr-compra-list, proveedor-list
- [x] 12.1 clientes (commit b41c30b): cliente-detalle.tsx (3 sites, mixed formatDate/formatDateTime)
- [x] 13.1 dashboard + ventas + cxc (commit 7c8e282): dashboard-prestamos-widget (dropped manual `T00:00:00`), prestamo-detalle-modal, cxc-cliente-detalle

## Phase 14: PR2 verification gate — DONE

- [x] 14.1 `yarn test:run` full suite green (223/223, unchanged)
- [x] 14.2 `yarn type-check` app code green (only known spurious `*.test.ts` noise, zero real errors)
- [ ] 14.3 Manual: 2-3 PDF/print exports render correct VET date — flagged for human spot-check
- [x] 14.4 `git grep -n "America/Caracas"` outside dates.ts: empty

## Phase 15: PR2 scope-completeness amendment — DONE (a7be7bb, 9a7129a)

PR-gate re-verify (obs #1279) found 5 real date/time sites missed by spec/exploration
grep (only `toLocaleDateString`/`toLocaleString('es-VE')` were searched, missing
`toLocaleTimeString`), plus one factually incorrect spec claim ("file does not exist").
Closed on `feat/timezone-migration` before PR creation.

- [x] 15.1 `prestamos-page.tsx:23` (commit a7be7bb) — dropped manual `+"T00:00:00"`
      midnight-anchor workaround (bug #3 pattern), `formatFecha()` now delegates to
      `formatDate()`
- [x] 15.2 `pago-cxp-modal.tsx:68` (commit a7be7bb) — caja session opening-hour →
      `formatHora(row.fecha_apertura)`
- [x] 15.3 `pago-gasto-cxp-modal.tsx:58` (commit a7be7bb) — same pattern → `formatHora`
- [x] 15.4 `gasto-form.tsx:377` (commit a7be7bb) — same pattern → `formatHora`
- [x] 15.5 `compra-form.tsx:319` (commit a7be7bb, `src/features/inventario/components/compras/`)
      — same pattern → `formatHora`
- [x] 15.6 `cuadre-page.tsx:1300` WARNING-2 fix (commit 9a7129a) — restored `'—'`
      invalid-date fallback for the `fecha` cell, matching the sibling `hora` cell
- [x] 15.7 WARNING-1 (Cat A "Generado:" 12h→24h format change, already committed in
      PR2 commits fb99a5c..7c8e282) — documented as INTENTIONAL and ACCEPTED, no code
      change. 24h VET format is consistent with the rest of the app.
- [x] 15.8 Completeness self-check: `toLocaleDateString` (empty), `toLocaleTimeString`
      (empty), `toLocaleString` (10 hits, all number/currency formatting — none
      date/time, none citas module), `America/Caracas` (only `src/lib/dates.ts:11`)
- [x] 15.9 `yarn test:run` 223/223 green (unchanged). `yarn type-check:test` clean.
      `yarn type-check` app: zero real errors in changed files (only known
      `*.test.ts` noise)
