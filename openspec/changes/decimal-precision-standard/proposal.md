# Proposal: Decimal Precision Standard

## Intent

`currency.ts` uses `Number` + `.toFixed()` — IEEE 754 rounding errors accumulate across financial operations. In a bimonetary system with historically volatile Venezuelan rates (1M+ Bs/USD), errors cascade into incorrect totals and receipt discrepancies. Fix before codebase grows further.

## Scope

### In Scope
- Rewrite `currency.ts` with `decimal.js` — new `DecimalInput` API, `toStorageString()`, `initCurrencyConfig()`
- New `system_settings` table (global, no `empresa_id`): `precision_calc=8`, `precision_view=2`, `rounding_mode=HALF_UP` + `system_config_audit` trail
- Widen all financial columns: `NUMERIC(12,2)` / `NUMERIC(12,4)` → `NUMERIC(20,8)`
- Migrate ~30 hooks/components with direct float arithmetic to new API
- Migrate ~12 Zod schemas: `z.number()` → `z.string()` + transform on monetary fields
- `initCurrencyConfig()` call at app startup (`src/main.tsx`)

### Out of Scope
- PowerSync schema (`column.text` already stores strings)
- ~50 display-only components (signatures become backward-compatible)
- Test infrastructure (zero tests — separate change)
- Per-tenant precision settings

## Capabilities

### New Capabilities
- `decimal-precision`: `decimal.js` computation layer — `DecimalInput` type, `system_settings` runtime config, `toStorageString()` for PowerSync writes

### Modified Capabilities
None — `caja` / `prestamos` specs cover displayed results only; internal arithmetic is not specified.

## Approach

- **`decimal.js`**: PowerSync `column.text` is already string — 100% compatible. Integer-scaled alternative overflows `BIGINT` at extreme Venezuelan rates.
- **`NUMERIC(20,8)`**: `ALTER COLUMN` widens non-destructively — no backfill.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/currency.ts` | Modified | Full rewrite with `decimal.js` |
| `migrations/NNNN_decimal_precision.sql` | New | Column widening + `system_settings` |
| ~30 hooks in `src/features/*/hooks/` | Modified | Replace float arithmetic |
| ~12 schemas in `src/features/*/schemas/` | Modified | `z.number()` → `z.string()` + transform |
| `src/main.tsx` | Modified | `initCurrencyConfig()` at startup |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mixed float/Decimal during migration | High | Migrate domain-by-domain in separate PRs |
| No tests — regressions invisible | High | Manual smoke checklist per domain; test infra is follow-up change |
| Column widening corrupts data | Low | `ALTER COLUMN` preserves values exactly; snapshot DB pre-migration |

## Rollback Plan

- **SQL**: Snapshot Supabase DB pre-migration; revert column type only if no new data written at wider precision.
- **JS/schemas**: Revert per-domain PRs; `currency.ts` holds no state.

## Dependencies

- `yarn add decimal.js` before hook migration; SQL migration deployed before `toStorageString()` hits production.

## Success Criteria

- [ ] `usdToBs(0.1, 3.0)` === `0.30000000` — no float drift
- [ ] All ~30 hooks use `Decimal` internally; call `toStorageString()` before writes
- [ ] All ~12 Zod schemas accept monetary fields as strings
- [ ] `system_settings` seeded with defaults; `initCurrencyConfig()` called at app startup
- [ ] Zero float ops (`Number()`, `.toFixed()`, `parseFloat()`) on monetary values in `src/`
