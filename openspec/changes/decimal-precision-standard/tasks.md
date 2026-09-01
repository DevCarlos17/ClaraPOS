# Tasks: Decimal Precision Standard

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900–1200 (30 hooks + 12 schemas + currency.ts + main.tsx + SQL + sync rules) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (Foundation) → PR2 (Ventas) → PR3 (Compras+CxP) → PR4 (Caja+CxC) → PR5 (Contabilidad+Bancos+Inventario+Dashboard) |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation: `decimal.js` + `currency.ts` + SQL + sync rules + `main.tsx` | PR 1 | Base: `feature/decimal-precision-standard`. ~150 lines. Gate for all other PRs. |
| 2 | Ventas domain (hooks + schemas + components) | PR 2 | Base: PR 1 branch. ~200–250 lines. Highest financial risk. |
| 3 | Compras + CxP domain (hooks + schemas + components) | PR 3 | Base: PR 2 branch. ~200 lines. |
| 4 | Caja + CxC domain (hooks + components) | PR 4 | Base: PR 3 branch. ~150 lines. |
| 5 | Contabilidad + Bancos + Inventario + Dashboard (hooks + remaining schemas) | PR 5 | Base: PR 4 branch. ~200 lines. |

---

## Phase 1: Foundation (PR 1) — ~150 lines

- [x] T01.1 `yarn add decimal.js` — add dependency (`package.json` + `yarn.lock`)
- [x] T01.2 Rewrite `src/lib/currency.ts`: `DecimalInput` type, `toD()`, `initCurrencyConfig()` (module-level vars + safe defaults), `toStorageString()`, `usdToBs`, `bsToUsd`, `applyImpuesto`, `applyDescuento`, `formatUsd`, `formatBs`, `formatTasa` — all accepting `DecimalInput`, all returning `Decimal` or `string`
- [x] T01.3 Create `migrations/0058_decimal_precision.sql`: UP section (all `NUMERIC(20,8)` widenings for all financial columns across all 63-table schema, `system_settings` creation + seed with `precision_calc='8'`, `precision_view='2'`, `rounding_mode='4'`, `system_config_audit` creation with RLS deny-all + `system_settings` RLS SELECT-only for authenticated) + DOWN comments
- [x] T01.4 Update `backend/powersync-sync-rules.yaml`: add `system_settings` to `global` bucket with `SELECT * FROM system_settings` (no filter)
- [x] T01.5 Modify `src/main.tsx`: query `system_settings` via PowerSync before `RouterProvider` renders; call `initCurrencyConfig()` with parsed values; fall back to hardcoded defaults on empty/error

**Acceptance criteria T01:**
- `usdToBs(0.1, 3.0).toFixed(8) === '0.30000000'` — verifiable in browser console
- `toStorageString(new Decimal('8024.64')) === '8024.64000000'`
- `formatUsd('1234.56789') === '1,234.57'`
- `migrations/0058` applies without error on staging; `SELECT * FROM system_settings` returns 3 rows
- `system_settings` visible in PowerSync `global` bucket sync
- App startup calls `initCurrencyConfig()` — verifiable via console log in dev

---

## Phase 2: Ventas Domain (PR 2) — ~220 lines

- [ ] T02.1 Migrate `src/features/ventas/hooks/use-ventas.ts`: all monetary arithmetic → `Decimal`; all writes → `toStorageString()`
- [ ] T02.2 Migrate `src/features/ventas/hooks/use-notas-credito.ts`
- [ ] T02.3 Migrate `src/features/ventas/hooks/use-notas-debito.ts`
- [ ] T02.4 Migrate `src/features/ventas/hooks/use-ret-iva-ventas.ts`
- [ ] T02.5 Migrate `src/features/ventas/hooks/use-ret-islr-ventas.ts`
- [ ] T02.6 Migrate `src/features/ventas/schemas/venta-schema.ts`: `z.number()` → `z.union([z.string(), z.number()]).transform(v => new Decimal(v))` on all monetary fields
- [ ] T02.7 Migrate `src/features/ventas/schemas/nota-debito-schema.ts`
- [ ] T02.8 Migrate `src/features/ventas/components/pos-terminal.tsx`: all internal arithmetic → `Decimal`; no `Number()`, `.toFixed()`, `parseFloat()` on monetary vars
- [ ] T02.9 Migrate `src/features/ventas/components/cobro-modal.tsx`
- [ ] T02.10 Migrate `src/features/ventas/components/linea-items.tsx`

**Acceptance criteria T02:**
- Multi-line POS sale with 10 × $0.10 items totals exactly $1.00 (no float drift)
- Payment change for $50 paid on $30.10 total = $19.90 exactly
- Nota crédito computed values match source venta totals
- No `Number(`, `parseFloat(`, `.toFixed(` on monetary vars in these files

---

## Phase 3: Compras + CxP Domain (PR 3) — ~200 lines

- [ ] T03.1 Migrate `src/features/compras/hooks/use-compras.ts`
- [ ] T03.2 Migrate `src/features/compras/hooks/use-cxp.ts`
- [ ] T03.3 Migrate `src/features/compras/hooks/use-importar-cxp.ts`
- [ ] T03.4 Migrate `src/features/compras/hooks/use-ret-iva-compras.ts`
- [ ] T03.5 Migrate `src/features/compras/hooks/use-ret-islr-compras.ts`
- [ ] T03.6 Migrate `src/features/inventario/schemas/compra-schema.ts`
- [ ] T03.7 Migrate `src/features/compras/components/pago-cxp-modal.tsx`
- [ ] T03.8 Migrate `src/features/compras/components/pago-gasto-cxp-modal.tsx`
- [ ] T03.9 Migrate `src/features/inventario/components/compras/compra-form.tsx`

**Acceptance criteria T03:**
- Create purchase invoice; verify `monto_usd` stored with 8 decimals in Supabase table view
- IVA retention calculation matches manual calc at current tasa
- CxP abono FIFO applies correctly with Decimal arithmetic

---

## Phase 4: Caja + CxC Domain (PR 4) — ~150 lines

- [ ] T04.1 Migrate `src/features/caja/hooks/use-sesiones-caja.ts`
- [ ] T04.2 Migrate `src/features/caja/hooks/use-rendimiento-caja.ts`
- [ ] T04.3 Migrate `src/features/caja/components/sesion-caja-form.tsx`
- [ ] T04.4 Migrate `src/features/caja/components/apertura-sesion-pos-modal.tsx`
- [ ] T04.5 Migrate `src/features/cxc/hooks/use-cxc.ts`
- [ ] T04.6 Migrate `src/features/cxc/components/pago-factura-modal.tsx`
- [ ] T04.7 Migrate `src/features/cxc/components/abono-global-modal.tsx`
- [ ] T04.8 Migrate `src/features/cxc/components/aplicar-saf-modal.tsx`

**Acceptance criteria T04:**
- Open/close caja session; verify saldo values stored at 8 decimals
- CxC payment against specific invoice records correct remaining balance
- Abono global FIFO allocation matches manual calculation

---

## Phase 5: Contabilidad + Bancos + Inventario + Dashboard + Remaining Schemas (PR 5) — ~200 lines

- [ ] T05.1 Migrate `src/features/contabilidad/hooks/use-gastos.ts`
- [ ] T05.2 Migrate `src/features/bancos/hooks/use-diferencial-banco.ts`
- [ ] T05.3 Migrate `src/features/reportes/hooks/use-cuadre.ts`
- [ ] T05.4 Migrate `src/features/dashboard/hooks/use-dashboard.ts`
- [ ] T05.5 Migrate `src/features/inventario/hooks/use-kardex.ts`
- [ ] T05.6 Migrate `src/features/contabilidad/components/gasto-form.tsx`
- [ ] T05.7 Migrate `src/features/tesoreria/schemas/tesoreria-schemas.ts`
- [ ] T05.8 Migrate `src/features/contabilidad/schemas/gasto-schema.ts`
- [ ] T05.9 Migrate `src/features/contabilidad/schemas/libro-contable-schema.ts`
- [ ] T05.10 Migrate `src/features/clientes/schemas/cliente-schema.ts`
- [ ] T05.11 Migrate `src/features/proveedores/schemas/proveedor-schema.ts`
- [ ] T05.12 Migrate `src/features/inventario/schemas/producto-schema.ts`
- [ ] T05.13 Migrate `src/features/inventario/schemas/kardex-schema.ts`
- [ ] T05.14 Migrate `src/features/inventario/schemas/receta-schema.ts`
- [ ] T05.15 Migrate `src/features/inventario/schemas/departamento-schema.ts`

**Acceptance criteria T05:**
- Dashboard KPIs render without NaN
- Cuadre de caja report totals match POS session data
- Diferencial bancario calculation matches manual reference
- All 15 files: zero `Number(`, `parseFloat(`, `.toFixed(` on monetary vars

---

## Smoke Test Checklist

### Foundation (after T01)
- [ ] Browser console: `import { usdToBs } from '@/lib/currency'; usdToBs(0.1, 3.0).toFixed(8)` → `'0.30000000'`
- [ ] Browser console: `usdToBs('100', '1000000').toFixed(2)` → `'100000000.00'` (no overflow)
- [ ] Supabase SQL: `SELECT * FROM system_settings` → 3 rows (`precision_calc`, `precision_view`, `rounding_mode`)
- [ ] Supabase SQL: `SELECT column_name, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name = 'ventas' AND column_name LIKE '%usd%'` → precision 20, scale 8
- [ ] App loads without JS error; dev log shows `initCurrencyConfig called with {precisionCalc:8,...}`

### Ventas (after T02)
- [ ] POS: create sale with 10 × $0.10 line items → total shows `$1.00` (not `$0.9999…`)
- [ ] POS: pay $50 on $30.10 total → change shows `$19.90`
- [ ] POS: apply 16% IVA to $100 base → IVA amount shows `$16.00`
- [ ] Supabase: `SELECT total_usd FROM ventas ORDER BY created_at DESC LIMIT 1` → 8 decimal places stored

### Compras (after T03)
- [ ] Create factura compra → `monto_usd` column in Supabase shows 8 decimal places
- [ ] Retention IVA calculation on $1000 base → `$160.00000000` stored
- [ ] CxP abono parcial → remaining balance correct after Decimal arithmetic

### Caja + CxC (after T04)
- [ ] Open caja session, enter base amount → stored with 8 decimals
- [ ] CxC: pay specific invoice → remaining saldo matches `monto - pago` exactly
- [ ] CxC: abono global FIFO → applied to oldest invoice first, no rounding residue

### Contabilidad + Bancos + Inventario (after T05)
- [ ] Dashboard KPIs: no NaN or `undefined` in monetary cells
- [ ] Cuadre de caja report: saldo display matches Bs values at 2 decimal view precision
- [ ] Diferencial bancario: computed differential matches manual (monto_bs - monto_usd × tasa)
- [ ] Kardex movement: `cantidad` and `costo_unitario` stored with 8 decimals

---

## Staging Validation Steps

1. **Snapshot staging DB**: Supabase Dashboard → Settings → Database → Create backup
2. **Apply SQL migration**: Supabase SQL Editor → paste contents of `migrations/0058_decimal_precision.sql` → Run
3. **Verify column widening**:
   ```sql
   SELECT table_name, column_name, numeric_precision, numeric_scale
   FROM information_schema.columns
   WHERE numeric_precision IS NOT NULL
     AND table_schema = 'public'
   ORDER BY table_name, column_name;
   ```
   All financial columns must show `(20, 8)`.
4. **Verify system_settings**: `SELECT * FROM system_settings` → 3 rows
5. **Verify RLS on system_settings**: connect as anon/authenticated user, attempt `INSERT INTO system_settings VALUES ('x','y')` → must fail with permission denied
6. **Verify system_config_audit inaccessible**: `SELECT * FROM system_config_audit` as tenant user → must fail
7. **Run app against staging**: `yarn dev --mode staging`
8. **Execute Foundation smoke tests** from checklist above
9. **Run each domain smoke test** after merging each domain PR to staging branch
10. **Confirm zero float drift** in browser console for all 5 smoke test numeric scenarios

---

## Deploy Order (MANDATORY — do not reverse)

```
1. yarn add decimal.js                    → PR 1 prereq (local + CI)
2. Apply 0058 to staging Supabase         → staging validation steps above
3. ✅ Validate staging → run smoke tests
4. Apply 0058 to production Supabase      → snapshot prod DB FIRST
5. Deploy PR 1 app build (currency.ts + main.tsx + sync rules)
6. Verify Foundation smoke tests in prod
7. Deploy PR 2 (Ventas domain)
8. Verify Ventas smoke tests in prod
9. Deploy PR 3 (Compras + CxP domain)
10. Verify Compras smoke tests in prod
11. Deploy PR 4 (Caja + CxC domain)
12. Verify Caja + CxC smoke tests in prod
13. Deploy PR 5 (Contabilidad + Bancos + Inventario + Dashboard)
14. Verify full smoke checklist in prod
15. Rollback gate closes — column widening permanent once 8-decimal values written to prod
```

> **Rollback gate**: SQL widening is permanent once any `toStorageString()` value (8 decimals) is written to production. The window to revert columns closes the moment PR 1 app hits production users. Snapshot before step 4 is non-negotiable.
