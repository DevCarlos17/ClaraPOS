# Tasks: caja-saf — SAF en cuadre de caja

_2026-06-06 | Model: anthropic/claude-sonnet-4-6_

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~220–240 |
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
| 1 | Full caja-saf change | PR 1 | All 8 files; ~230 lines; under 400-line budget |

---

## Phase 1: Infrastructure — T-01, T-02

No dependencies. Can be written in parallel.

- [x] 1.1 **(T-01)** Create `migrations/0051_add_sesion_caja_id_movimientos_cuenta.sql` — single statement `ALTER TABLE movimientos_cuenta ADD COLUMN sesion_caja_id TEXT;` · spec: CAP-3 · ✓ file exists and SQL is syntactically valid
- [x] 1.2 **(T-02)** `src/core/db/powersync/schema.ts` line ~551 — add `sesion_caja_id: column.text` after `saf_origen_refs` in `movimientos_cuenta` table definition · spec: CAP-3 · ✓ `yarn type-check` passes

---

## Phase 2: Data Origin — T-03

_Depends on: T-01, T-02_

- [x] 2.1 **(T-03)** `src/features/ventas/hooks/use-ventas.ts` ~line 1169 — in the SAF INSERT (`tipo='SAF'`): add `sesion_caja_id` after `created_by` in the column list; add `params.sesion_caja_id` at the matching position in VALUES · spec: CAP-3 · ✓ new SAF movement has `sesion_caja_id` populated; historical rows remain NULL

---

## Phase 3: Query Layer — T-04

_Depends on: T-03_

- [x] 3.1 **(T-04)** `src/features/reportes/hooks/use-cuadre.ts` — (a) export `SafFacturaItem` + `SafDiarioResult` interfaces per design contracts; (b) add `useSafDiario(filters: CuadreFilters | null): SafDiarioResult` using `buildMovsWhere(filters, empresaId, 'mc')` for both the aggregate SUM query and the drill-down JOIN query (ventas + clientes); both queries include `AND mc.sesion_caja_id IS NOT NULL` · spec: CAP-1, CAP-2 · ✓ returns correct total; returns empty array when no SAF

---

## Phase 4: UI Layer — T-05, T-06, T-07

_T-05 and T-06 depend on T-04 and are parallel. T-07 depends on both._

- [x] 4.1 **(T-05)** Create `src/features/reportes/components/saf-detalle-modal.tsx` — Dialog with table columns: Factura | Cliente | SAF aplicado | Total factura | Tipo (total/parcial badge) | Equiv. Bs; empty state: "No hay ventas pagadas con saldo a favor hoy" · spec: CAP-2 · ✓ modal renders list and empty state correctly
- [x] 4.2 **(T-06)** `src/features/reportes/components/pagos-resumen.tsx` — add `onSafClick?: () => void` prop; add info block after CxC-via-POS section using `useSafDiario`; hide block when `totalUsd === 0`; clicking total amount calls `onSafClick` · spec: CAP-1 · ✓ section visible with SAF; hidden on sessions without SAF
- [x] 4.3 **(T-07)** `src/features/reportes/components/cuadre-page.tsx` — add `safModalOpen` boolean state; pass `onSafClick={() => setSafModalOpen(true)}` to `PagosResumen`; render `<SafDetalleModal>` with `items` and `tasaDelDia` from `useSafDiario` · spec: CAP-1, CAP-2 · ✓ modal opens on click and shows drill-down items

---

## Phase 5: Session Close — T-08

_Depends on: T-03_

- [x] 5.1 **(T-08)** `src/features/caja/hooks/use-sesiones-caja.ts` `cerrarSesionCaja` — after existing `sesiones_caja_detalle` inserts (~line 865): query `SUM(CAST(monto AS REAL))` WHERE `tipo='SAF' AND sesion_caja_id=? AND empresa_id=?`; if `saf_total > 0`, INSERT `sesiones_caja_detalle` with `metodo_cobro_id = NULL`, `moneda_id = NULL`, `total_sistema = saf_total`, `total_fisico = NULL`, `diferencia = NULL`, `num_transacciones` from COUNT. DEVIATION: design used `moneda_id = 'SAF'` but column is UUID type. Both columns store NULL. Migration 0052 was added to soften FK constraints. · spec: CAP-1 · ✓ closing a session with SAF creates the snapshot row
  > ⚠️ **Risk resolved**: Supabase DDL confirmed `metodo_cobro_id NOT NULL` and `moneda_id NOT NULL REFERENCES monedas(id)`. Added migration 0052 to drop FK constraints and allow NULL. Design's `moneda_id='SAF'` sentinel was invalid (UUID column); implementation uses NULL instead.
