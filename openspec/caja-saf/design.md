# Design: Caja SAF — SAF en cuadre de caja

_2026-06-06 | Model: anthropic/claude-opus-4-6_

---

## Technical Approach

Add `sesion_caja_id` to `movimientos_cuenta` so SAF-as-payment records link directly to the cashier session. A new `useSafDiario` hook queries these records per session. `PagosResumen` renders the SAF total as an info section (not cash inflow), with a click-to-drill-down modal. Session close snapshots SAF total into `sesiones_caja_detalle`.

Maps to proposal Opción B (additive migration) + spec CAP-1/CAP-2/CAP-3.

---

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| SAF → session link | Direct column `sesion_caja_id` on `movimientos_cuenta` | JOIN via `venta_id → ventas.sesion_caja_id` | Direct query, no join overhead, consistent with `pagos.sesion_caja_id` pattern |
| Hook location | Add `useSafDiario` inside `use-cuadre.ts` | Separate `use-saf-diario.ts` | All cuadre hooks live in one file; follows `useCobrosViaPOS` pattern; uses shared `buildCuadreWhere`/`buildMovsWhere` helpers |
| SAF section UI | Separate info block after payment rows, before CxC | Row inside payment list | SAF is NOT a cash inflow — it's credit consumption. Visual separation avoids confusion with real payment methods. Mirrors `Cobros CxC via POS` pattern |
| Snapshot metodo | Virtual row in `sesiones_caja_detalle` with `metodo_cobro_id = NULL`, `moneda_id = 'SAF'` | New column on `sesiones_caja` | Reuses existing snapshot table; `moneda_id = 'SAF'` sentinel distinguishes from real methods; no schema migration needed on this table |
| Historical NULL | Excluded via `sesion_caja_id IS NOT NULL` | Backfill | Safe; old records simply invisible in session cuadre. Spec explicitly requires this |

---

## Data Flow

```
[POS Checkout] ─── crearVenta paso 7d ───→ movimientos_cuenta(tipo='SAF', sesion_caja_id=X)
                                                    │
[Cuadre Page] ─── useSafDiario(sesionId) ─────────→ SUM(monto) + JOIN ventas/clientes
                         │                                    │
              PagosResumen renders total ←────────────────────┘
                         │ click
              SafDetalleModal (drill-down list)

[Cierre Sesión] ─── cerrarSesionCaja ───→ query SAF total
                                         │
                         INSERT sesiones_caja_detalle(moneda_id='SAF', total_sistema=safTotal)
```

---

## Interfaces / Contracts

```typescript
// In use-cuadre.ts

export interface SafFacturaItem {
  movimientoCuentaId: string
  ventaId: string
  nroFactura: string
  clienteNombre: string
  montoSafUsd: number
  totalFacturaUsd: number
  esPagoTotal: boolean   // montoSafUsd >= totalFacturaUsd - 0.01
  tasa: number
}

export interface SafDiarioResult {
  totalUsd: number
  items: SafFacturaItem[]
  isLoading: boolean
}

// Hook signature
export function useSafDiario(filters: CuadreFilters | null): SafDiarioResult
```

```typescript
// In saf-detalle-modal.tsx

interface SafDetalleModalProps {
  open: boolean
  onClose: () => void
  items: SafFacturaItem[]
  tasaDelDia: number
}
```

---

## SQL Queries

### Migration

```sql
-- migrations/0051_add_sesion_caja_id_movimientos_cuenta.sql
ALTER TABLE movimientos_cuenta ADD COLUMN sesion_caja_id TEXT;
```

### useSafDiario — aggregate

Uses `buildMovsWhere` (same helper as `useCobrosViaPOS`) to get session-aware WHERE:

```sql
SELECT COALESCE(SUM(CAST(mc.monto AS REAL)), 0) as total_saf
FROM movimientos_cuenta mc
WHERE mc.tipo = 'SAF'
  AND mc.sesion_caja_id IS NOT NULL
  AND {buildMovsWhere: mc.empresa_id = ? AND mc.sesion_caja_id IN (?)}
```

Note: `buildMovsWhere` needs adaptation — it uses `mmc` alias by default. The hook will call it with alias `mc`.

### useSafDiario — drill-down items

```sql
SELECT
  mc.id as movimiento_cuenta_id,
  mc.venta_id,
  mc.monto,
  mc.tasa_pago,
  v.nro_factura,
  v.total_usd,
  c.nombre as cliente_nombre
FROM movimientos_cuenta mc
JOIN ventas v ON mc.venta_id = v.id
JOIN clientes c ON v.cliente_id = c.id
WHERE mc.tipo = 'SAF'
  AND mc.sesion_caja_id IS NOT NULL
  AND {buildMovsWhere: mc.empresa_id = ? AND mc.sesion_caja_id IN (?)}
ORDER BY mc.fecha DESC
```

### crearVenta paso 7d — modified INSERT

Add `sesion_caja_id` to the existing INSERT at line ~1169 of `use-ventas.ts`:

```typescript
// Current columns (line ~1170):
//   id, empresa_id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
//   observacion, venta_id, fecha, created_at, created_by,
//   moneda_pago, monto_moneda, tasa_pago, saf_origen_refs

// Add: sesion_caja_id after created_by
// Value: sesion_caja_id from CrearVentaParams (already available in scope)
```

### cerrarSesionCaja — SAF snapshot

After existing `sesiones_caja_detalle` inserts (line ~848), add:

```sql
SELECT COALESCE(SUM(CAST(monto AS REAL)), 0) as saf_total
FROM movimientos_cuenta
WHERE tipo = 'SAF'
  AND sesion_caja_id = ?
  AND sesion_caja_id IS NOT NULL
  AND empresa_id = ?
```

If `saf_total > 0`: INSERT into `sesiones_caja_detalle` with `metodo_cobro_id = NULL`, `moneda_id = 'SAF'`, `total_sistema = saf_total`, `total_fisico = NULL`, `diferencia = NULL`, `num_transacciones` = COUNT from same query.

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `migrations/0051_add_sesion_caja_id_movimientos_cuenta.sql` | Create | Additive ALTER TABLE — nullable TEXT column |
| `src/core/db/powersync/schema.ts` | Modify | Add `sesion_caja_id: column.text` to `movimientos_cuenta` (line ~552) |
| `src/features/ventas/hooks/use-ventas.ts` | Modify | Step 7d INSERT: add `sesion_caja_id` column + value from `params.sesion_caja_id` |
| `src/features/reportes/hooks/use-cuadre.ts` | Modify | Add `useSafDiario` hook + `SafFacturaItem`/`SafDiarioResult` interfaces + adapt `buildMovsWhere` to accept custom alias |
| `src/features/reportes/components/pagos-resumen.tsx` | Modify | Add SAF info section after `Cobros CxC via POS`, before CxC row. Import `useSafDiario`. Add `onSafClick` prop |
| `src/features/reportes/components/saf-detalle-modal.tsx` | Create | Dialog with table: Factura \| Cliente \| SAF aplicado \| Total factura \| Tipo \| Equiv. Bs |
| `src/features/reportes/components/cuadre-page.tsx` | Modify | Wire `safModalOpen` state + pass `onSafClick` to `PagosResumen` + render `SafDetalleModal` |
| `src/features/caja/hooks/use-sesiones-caja.ts` | Modify | `cerrarSesionCaja`: query SAF total + insert `sesiones_caja_detalle` row if > 0 |

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Manual | SAF visible in cuadre after POS sale with SAF | Create sale with SAF, check cuadre shows amount |
| Manual | Drill-down lists correct invoices | Click SAF row, verify nro_factura, client, amounts |
| Manual | Zero SAF hides section | Session without SAF sales → no SAF section |
| Manual | Session close snapshots SAF | Close session, check `sesiones_caja_detalle` for SAF row |
| Manual | Historical records excluded | Old SAF records (NULL sesion_caja_id) don't appear |

No automated test infrastructure exists in the project.

---

## Migration / Rollout

1. **Deploy migration first**: `ALTER TABLE movimientos_cuenta ADD COLUMN sesion_caja_id TEXT` — safe on live data, nullable, no DEFAULT
2. **Deploy frontend**: schema.ts + hooks + UI components
3. **PowerSync sync rules**: `SELECT *` already includes new column — no manual change needed
4. **Rollback**: `git revert` frontend + `ALTER TABLE movimientos_cuenta DROP COLUMN sesion_caja_id`

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `buildMovsWhere` uses alias `mmc` hardcoded internally | Low | Already accepts `alias` parameter (default `'mmc'`); pass `'mc'` for movimientos_cuenta |
| `sesiones_caja_detalle` has FK to `metodo_cobro_id` — NULL may violate constraint | Medium | Check if column is nullable in Supabase. If NOT NULL, use a sentinel UUID instead. Schema.ts shows `column.text` (nullable in PowerSync) |
| SAF snapshot in `cerrarSesionCaja` runs inside same writeTransaction — adds one more query | Low | Single SUM query; negligible cost |

---

## Open Questions

- [x] `buildMovsWhere` alias flexibility — confirmed: already parametric via `alias` arg
- [x] `sesiones_caja_detalle.metodo_cobro_id` nullable — PowerSync schema shows `column.text` (nullable); Supabase DDL likely allows NULL
