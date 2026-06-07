# Archive Report: caja-saf

_Change: caja-saf | Archived: 2026-06-06 | Model: anthropic/claude-sonnet-4-6_

---

## Executive Summary

**caja-saf** closes the visibility gap for SAF (saldo a favor) as a direct payment method in the cashier closing report (cuadre de caja). Prior to this change, SAF-applied amounts were invisible in the cuadre because they write to `movimientos_cuenta` (not to `pagos` or `movimientos_metodo_cobro`, which the cuadre queries). The fix was additive: a new `sesion_caja_id` column on `movimientos_cuenta` links SAF payments directly to a session, a new `useSafDiario` hook aggregates them, and a drilldown modal lets cashiers inspect each SAF-covered invoice.

**Verification result**: PASS — 17/17 spec scenarios (100%), 2 passes (Pass 2 fixed CAP-2 pago parcial).  
**Build**: clean (`yarn build` 29.47s, 250 PWA entries). Zero new TypeScript errors across all 9 changed files.  
**Delivery**: single PR, ~255 lines changed.

---

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Opción B directa** — `sesion_caja_id` column on `movimientos_cuenta` (not JOIN via `venta_id`) | Direct query, no join overhead, consistent with `pagos.sesion_caja_id` pattern. Cleaner than intermediate option A. |
| 2 | **Migration 0052** — drop FK + NOT NULL on `sesiones_caja_detalle.metodo_cobro_id` / `moneda_id` | Supabase DDL had both columns as NOT NULL with FK constraints. Required to allow the virtual SAF snapshot row with NULLs. Not in original design; discovered during apply T-08. |
| 3 | **SAF snapshot uses NULL sentinel** (not `moneda_id = 'SAF'`) | `moneda_id` is UUID — can't store the string `'SAF'`. Approved deviation from design's sentinel approach. Both columns stored as NULL. |
| 4 | **`buildMovsWhere` with alias `'mc'`** — reuses existing helper | `buildMovsWhere` already accepts a custom alias parameter (default `'mmc'`). Calling with `'mc'` for `movimientos_cuenta` avoids code duplication and inherits the empresa_id + sesion_caja_id session filters for free. |
| 5 | **`GROUP_CONCAT` + `lastIndexOf(':')` parser** for pago parcial desglose | Handles method names that contain `:` (e.g., "Zelle: USD"). Using `lastIndexOf` makes the parser robust against colons in method names. |
| 6 | **SAF block hidden when `totalUsd < 0.001`** — not $0.00 exact | Float comparison tolerance to avoid showing stale 0.000001 remainder from float arithmetic. |

---

## Approved Deviations

| Deviation | Approved |
|-----------|----------|
| `moneda_id = NULL` in snapshot row instead of `'SAF'` sentinel (UUID column) | ✅ |
| Migration 0052 added post-design (not in original design.md) | ✅ |
| Empty state text "en esta sesión" vs. spec's "hoy" — more accurate | ✅ |

---

## Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `migrations/0051_add_sesion_caja_id_movimientos_cuenta.sql` | Created | Additive ALTER TABLE — nullable TEXT column on `movimientos_cuenta` |
| `migrations/0052_sesion_detalle_nullable_metodo_moneda.sql` | Created | Drops FK + NOT NULL on `sesiones_caja_detalle.metodo_cobro_id` and `moneda_id` |
| `src/core/db/powersync/schema.ts` | Modified | Added `sesion_caja_id: column.text` to `movimientos_cuenta` definition (line ~552) |
| `src/features/ventas/hooks/use-ventas.ts` | Modified | Step 7d SAF INSERT: added `sesion_caja_id` column + `params.sesion_caja_id ?? null` value |
| `src/features/reportes/hooks/use-cuadre.ts` | Modified | Added `SafFacturaItem` + `OtroPago` + `SafDiarioResult` interfaces; `useSafDiario` hook with aggregate + drill-down queries; `GROUP_CONCAT` LEFT JOIN pagos+metodos_cobro; null-safe parser |
| `src/features/reportes/components/saf-detalle-modal.tsx` | Created | Dialog: Factura \| Cliente \| SAF aplicado \| Total factura \| Tipo (total/parcial/desglose) \| Equiv. Bs |
| `src/features/reportes/components/pagos-resumen.tsx` | Modified | Added SAF info block (violet) after CxC-via-POS; `onSafClick` prop; hidden when `haySaf = false` |
| `src/features/reportes/components/cuadre-page.tsx` | Modified | `safModalOpen` state; `onSafClick` wired; `<SafDetalleModal>` rendered |
| `src/features/caja/hooks/use-sesiones-caja.ts` | Modified | `cerrarSesionCaja` step 7: SUM SAF query + conditional INSERT into `sesiones_caja_detalle` if `safTotal > 0` |

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `openspec/specs/caja/spec.md` | **Created** | New domain spec — CAP-3 (schema migration), CAP-1 (saf-cuadre, 8 scenarios), CAP-2 (saf-detalle-facturas, 6 scenarios). 17 scenarios total. |

---

## Post-Deploy Instructions

**MANDATORY — apply in order in Supabase SQL Editor before or with frontend deploy:**

```sql
-- migrations/0051: nueva columna en movimientos_cuenta
ALTER TABLE movimientos_cuenta ADD COLUMN sesion_caja_id TEXT;

-- migrations/0052: flexibilizar sesiones_caja_detalle para filas SAF virtuales
ALTER TABLE sesiones_caja_detalle
  DROP CONSTRAINT IF EXISTS sesiones_caja_detalle_metodo_cobro_id_fkey;
ALTER TABLE sesiones_caja_detalle
  ALTER COLUMN metodo_cobro_id DROP NOT NULL;
ALTER TABLE sesiones_caja_detalle
  DROP CONSTRAINT IF EXISTS sesiones_caja_detalle_moneda_id_fkey;
ALTER TABLE sesiones_caja_detalle
  ALTER COLUMN moneda_id DROP NOT NULL;
```

Both migrations are safe for live data. No backfill required. Historical `sesion_caja_id = NULL` is valid and expected. Rollback: `DROP COLUMN sesion_caja_id` on `movimientos_cuenta`; restoring FK constraints on `sesiones_caja_detalle` requires no existing NULL rows.

---

## Residual Technical Debt

| ID | Severity | Location | Description |
|----|----------|----------|-------------|
| DEUDA-1 | Warning | `use-sesiones-caja.ts` | `ResumenSesionCerradaModal` uses `INNER JOIN metodos_cobro mc ON scd.metodo_cobro_id = mc.id` — the virtual SAF row (`metodo_cobro_id = NULL`) is invisible in the closed-session summary. Requires a `LEFT JOIN` + SAF detection for that modal. |
| DEUDA-2 | Suggestion | `saf-detalle-modal.tsx` L20 | Empty state text says "en esta sesión" instead of spec's "hoy". Implementation is more semantically accurate; no functional impact. |

---

## SDD Cycle Summary

| Phase | Status | Model |
|-------|--------|-------|
| Proposal | ✅ Complete | anthropic/claude-sonnet-4-6 |
| Spec | ✅ Complete | anthropic/claude-sonnet-4-6 |
| Design | ✅ Complete | anthropic/claude-opus-4-6 |
| Tasks | ✅ Complete (8/8) | anthropic/claude-sonnet-4-6 |
| Apply | ✅ Complete (8 tasks + 1 patch post-verify) | anthropic/claude-sonnet-4-6 |
| Verify | ✅ PASS 17/17 (2 passes) | anthropic/claude-sonnet-4-6 |
| Archive | ✅ Complete | anthropic/claude-sonnet-4-6 |

The SDD cycle for `caja-saf` is fully complete.
