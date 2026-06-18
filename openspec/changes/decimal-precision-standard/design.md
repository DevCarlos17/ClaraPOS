# Design: Decimal Precision Standard

## Technical Approach

Replace all IEEE 754 float arithmetic with `decimal.js` across three layers: PostgreSQL columns widen non-destructively (`NUMERIC(20,8)`), PowerSync already stores `column.text` (zero schema change), and a rewritten `currency.ts` becomes the single arithmetic boundary. Runtime precision is driven by a new `system_settings` table loaded once at app startup via PowerSync query before `RouterProvider` renders.

Migration is domain-by-domain to prevent mixed float/Decimal state during rollout.

---

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Arithmetic library | `decimal.js` | BigInt/integer-scaled, `big.js` | BigInt overflows at Venezuelan rate scale (1M+ Bs/USD × large amounts = exceeds MAX_SAFE_INTEGER). `big.js` lacks `Decimal.Rounding` enum needed for configurable rounding. |
| Config storage | `system_settings` table (PostgreSQL → PowerSync) | Zustand store, env vars, hardcoded | PowerSync syncs it automatically; env vars can't change at runtime; hardcoding blocks future per-tenant precision (explicitly out of scope but not architecturally blocked). |
| Config reactivity | Module-level variables in `currency.ts` | Zustand | Config is write-once at startup. No component re-renders on precision change. Zustand adds unnecessary complexity and bundle weight for a static config. |
| Storage format | `toStorageString()` → fixed 8-decimal string | Raw Decimal object, JSON | PowerSync writes expect strings; NUMERIC(20,8) accepts `'0.30000000'`; downstream reads via `new Decimal(str)` are safe. |
| SQL migration number | `0058_decimal_precision.sql` | Any | Last existing migration is `0057`. Sequential convention. |

---

## Data Flow

```
PostgreSQL NUMERIC(20,8)
        │  (via PowerSync sync)
        ▼
SQLite column.text  ──read──▶  new Decimal(str)  ──calc──▶  Decimal result
                                                                    │
                            ┌───────────────────────────────────────┤
                            │                                       │
                     formatUsd/formatBs/                    toStorageString()
                     formatTasa (UI display)                        │
                            │                                       ▼
                           UI                             tx.execute(..., [str])
                                                                    │
                                                                    ▼
                                                        PowerSync upload → Supabase
```

`initCurrencyConfig()` is called once in `main.tsx` after PowerSync query resolves. If query fails or returns empty, hardcoded defaults apply (`precision_calc=8`, `precision_view=2`, `rounding_mode=HALF_UP`).

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/currency.ts` | Modify | Full rewrite: `DecimalInput` type, `toD()` helper, `initCurrencyConfig()`, `toStorageString()`, locale-aware formatters |
| `src/main.tsx` | Modify | Add `system_settings` PowerSync query + `initCurrencyConfig()` call before `RouterProvider` |
| `migrations/0058_decimal_precision.sql` | Create | Column widening (UP) + `system_settings` + `system_config_audit` tables + DOWN migration |
| `~30 src/features/*/hooks/*.ts` | Modify | Replace `Number((...).toFixed())` with `Decimal` ops + `toStorageString()` for writes |
| `~12 src/features/*/schemas/*.ts` | Modify | `z.number()` → `z.union([z.string(), z.number()]).transform(v => new Decimal(v))` on monetary fields |
| `package.json` / `yarn.lock` | Modify | `yarn add decimal.js` |

---

## Interfaces / Contracts

```typescript
// src/lib/currency.ts

import Decimal from 'decimal.js'

export type DecimalInput = string | number | Decimal

// Call once at app startup
export function initCurrencyConfig(settings: {
  precisionCalc: number
  precisionView: number
  roundingMode: Decimal.Rounding
}): void

// Arithmetic — return Decimal for chaining
export function usdToBs(usd: DecimalInput, tasa: DecimalInput): Decimal
export function bsToUsd(bs: DecimalInput, tasa: DecimalInput): Decimal
export function applyImpuesto(base: DecimalInput, pct: DecimalInput): Decimal
export function applyDescuento(precio: DecimalInput, pct: DecimalInput): Decimal

// Display — formatted string for UI (backward-compatible signature)
export function formatUsd(val: DecimalInput): string
export function formatBs(val: DecimalInput): string
export function formatTasa(val: DecimalInput): string

// Storage — fixed 8-decimal string for SQLite writes
export function toStorageString(val: DecimalInput, decimals?: number): string

// Internal helpers (not exported)
// toD(val): safe conversion, never throws (returns Decimal(0) on NaN)
// addThousands(fixed, sep, decSep): locale formatting without re-parsing to float
```

```typescript
// Zod migration pattern (monetary fields only)
// BEFORE
precio_venta_usd: z.number().min(0)

// AFTER
precio_venta_usd: z.union([z.string(), z.number()])
  .transform(v => new Decimal(v))
  .refine(v => v.gte(0), 'El precio no puede ser negativo')
```

```typescript
// Hook migration pattern
// BEFORE
const totalBs = Number((cantidad * precio * tasa).toFixed(2))
await tx.execute('INSERT ... VALUES (?)', [totalBs])

// AFTER
const totalBs = usdToBs(new Decimal(cantidad).times(precio), tasa)
await tx.execute('INSERT ... VALUES (?)', [toStorageString(totalBs)])
```

---

## Testing Strategy

No test infrastructure exists. Smoke-test checklist per domain:

| Layer | What to Verify | Approach |
|-------|---------------|----------|
| `currency.ts` | `usdToBs(0.1, 3.0).toFixed(8) === '0.30000000'` | Browser console after install |
| SQL migration | `SELECT column_name, data_type, numeric_precision FROM information_schema.columns WHERE table_name = 'ventas'` | Supabase SQL Editor |
| Ventas domain | Create sale, verify `total_bs` receipt matches manual calc at current rate | Manual POS flow |
| Compras domain | Create purchase invoice, verify `monto_usd` stored with 8 decimals | Supabase table view |
| Zod schemas | Form submit with string monetary input from PowerSync read | Manual form flow |

---

## Migration / Rollout

### Deploy Order (MANDATORY — do not reverse)

1. `yarn add decimal.js` — library available before any hook migration
2. Rewrite `currency.ts` (foundation, no callers yet broken)
3. Apply `migrations/0058_decimal_precision.sql` to staging → verify → apply to production
4. `main.tsx`: add `system_settings` query + `initCurrencyConfig()` call
5. Migrate domain-by-domain (whole domain atomically per PR):
   - **Ventas** (highest financial risk — `use-ventas.ts`, `venta-schema.ts`)
   - **Compras + CxP** (`use-compras.ts`, `use-cxp.ts`, `facturas-compra-schema.ts`)
   - **Caja + Tesorería** (`use-caja.ts`, `use-tesoreria.ts`)
   - **Reportes + Dashboard** (mostly read — `formatUsd`/`formatBs` already backward-compatible)
   - Remaining schemas

### SQL Migration Shape

```sql
-- UP: non-destructive widening
ALTER TABLE tasas_cambio ALTER COLUMN valor TYPE NUMERIC(20,8);
ALTER TABLE productos ALTER COLUMN costo_usd TYPE NUMERIC(20,8);
-- ... (all financial columns per task list)

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO system_settings (key, value) VALUES
  ('precision_calc', '8'),
  ('precision_view', '2'),
  ('rounding_mode', '4');  -- Decimal.ROUND_HALF_UP = 4

CREATE TABLE system_config_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT now()
);

-- DOWN: only safe before any 8-decimal values are written
-- ALTER TABLE tasas_cambio ALTER COLUMN valor TYPE NUMERIC(12,4);
-- ...
```

### Rollback Gate

Column widening is permanent once any value with >4 decimals is written. Rollback window closes the moment the new app version reaches production. Snapshot Supabase DB before applying `0058`.

---

## Open Questions

- [ ] PowerSync sync rules — `system_settings` has no `empresa_id`. Confirm the `global` bucket covers it or a new bucket rule is needed.
- [ ] `Decimal.ROUND_HALF_UP` enum value stored in `system_settings.rounding_mode` — using integer `4` matches `decimal.js` enum. Confirm this is stable across `decimal.js` versions.
