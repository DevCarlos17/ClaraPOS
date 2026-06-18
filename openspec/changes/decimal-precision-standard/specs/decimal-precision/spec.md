# decimal-precision Specification

## Purpose

Define the behavior of the decimal computation layer that replaces IEEE 754 float arithmetic across all financial operations in ClaraPOS. This spec covers the `currency.ts` API, runtime configuration, DB schema additions, Zod schema migration, hook migration pattern, and smoke test scenarios.

---

## Requirements

### Requirement: DecimalInput type acceptance

`currency.ts` MUST accept `string | number | Decimal` as input to all computation functions via a `DecimalInput` union type. Functions MUST NOT accept raw `number` exclusively. Internally, all inputs MUST be converted to `Decimal` before any arithmetic.

#### Scenario: string input from PowerSync

- GIVEN PowerSync returns a monetary column as string `"1234.56"`
- WHEN `usdToBs("1234.56", "6.5000")` is called
- THEN result is a `Decimal` equal to `8024.6400000000` — no float drift

#### Scenario: number input for compatibility

- GIVEN a call site passes a JS `number` literal `0.1`
- WHEN `usdToBs(0.1, 3.0)` is called
- THEN result equals `Decimal("0.30000000")` — no IEEE 754 rounding error

#### Scenario: Decimal passthrough

- GIVEN an intermediate `Decimal` value from a prior computation
- WHEN passed directly to another function
- THEN no double-conversion occurs; result is numerically identical

---

### Requirement: initCurrencyConfig at startup

`initCurrencyConfig()` MUST be called once at app startup (before any financial computation) with `precisionCalc`, `precisionView`, and `roundingMode` values loaded from `system_settings`. All subsequent `currency.ts` calls MUST use those values.

#### Scenario: config loaded from system_settings

- GIVEN `system_settings` contains `precision_calc=8`, `precision_view=2`, `rounding_mode=HALF_UP`
- WHEN `initCurrencyConfig({ precisionCalc: 8, precisionView: 2, roundingMode: Decimal.ROUND_HALF_UP })` is called at startup
- THEN all formatting and rounding operations respect these values for the session lifetime

#### Scenario: called before first computation

- GIVEN `initCurrencyConfig()` has not been called
- WHEN any `currency.ts` computation function is invoked
- THEN the function MUST use safe fallback defaults (`precisionCalc=8`, `precisionView=2`, `ROUND_HALF_UP`) — it MUST NOT throw

---

### Requirement: toStorageString before every PowerSync write

All financial values MUST be serialized via `toStorageString()` before being written to PowerSync/SQLite. `toStorageString()` MUST return a fixed-decimal string at `precisionCalc` digits (e.g. `"1234.56000000"`). No write MUST pass a raw `number` or unformatted `Decimal`.

#### Scenario: standard serialization

- GIVEN a computed `Decimal("8024.64")`
- WHEN `toStorageString(decimal)` is called with `precisionCalc=8`
- THEN returns `"8024.64000000"`

#### Scenario: prevents float coercion on write

- GIVEN a hook building a PowerSync INSERT payload
- WHEN any monetary field is assigned
- THEN the value in the payload MUST be `toStorageString(value)`, not `value.toNumber()` or `String(value)`

---

### Requirement: Computation functions — arithmetic correctness

`usdToBs`, `bsToUsd`, `applyImpuesto`, and `applyDescuento` MUST perform all arithmetic with `Decimal` and return `Decimal`. MUST NOT call `Number()`, `parseFloat()`, or `.toFixed()` internally on monetary values.

#### Scenario: USD to Bs conversion

- GIVEN `usd = "100.00"`, `tasa = "1000000.0000"` (extreme Venezuelan rate)
- WHEN `usdToBs(usd, tasa)` is called
- THEN result equals `Decimal("100000000.00000000")` — no overflow

#### Scenario: Bs to USD conversion

- GIVEN `bs = "100000000.00"`, `tasa = "1000000.0000"`
- WHEN `bsToUsd(bs, tasa)` is called
- THEN result equals `Decimal("100.00000000")` — no precision loss

#### Scenario: IVA application

- GIVEN `base = "1000.00"`, `pct = "16"` (16% IVA)
- WHEN `applyImpuesto(base, pct)` is called
- THEN result equals `Decimal("160.00000000")`

#### Scenario: descuento application

- GIVEN `precio = "500.00"`, `pct = "10"` (10% discount)
- WHEN `applyDescuento(precio, pct)` is called
- THEN result equals `Decimal("50.00000000")` (discount amount, caller subtracts)

---

### Requirement: Format functions — display precision

`formatUsd`, `formatBs`, and `formatTasa` MUST return display strings formatted to `precisionView` decimals. MUST accept `DecimalInput`. MUST NOT lose internal precision via these functions (they are display-only).

#### Scenario: USD formatting

- GIVEN a `Decimal("1234.56789012")`
- WHEN `formatUsd(val)` is called with `precisionView=2`
- THEN returns `"1,234.57"` (rounded to view precision, locale-formatted)

#### Scenario: tasa formatting

- GIVEN a `Decimal("1000000.1234")`
- WHEN `formatTasa(val)` is called
- THEN returns `"1,000,000.1234"` (4-decimal display for rates)

---

### Requirement: system_settings table

A `system_settings` table MUST exist in PostgreSQL (global — no `empresa_id`). It MUST be seeded with defaults on migration. RLS MUST allow authenticated users SELECT only; no tenant may INSERT, UPDATE, or DELETE.

| Column | Type | Default |
|--------|------|---------|
| `key` TEXT PK | | — |
| `value` TEXT NOT NULL | | — |
| `description` TEXT | | — |

Seed rows: `precision_calc='8'`, `precision_view='2'`, `rounding_mode='HALF_UP'`.

#### Scenario: settings seeded on migration

- GIVEN migration `NNNN_decimal_precision.sql` is applied to a fresh DB
- WHEN `SELECT * FROM system_settings` is executed
- THEN 3 rows exist: `precision_calc`, `precision_view`, `rounding_mode`

#### Scenario: RLS — tenant cannot modify

- GIVEN authenticated user from any empresa
- WHEN they attempt `INSERT` or `UPDATE` on `system_settings`
- THEN PostgreSQL returns permission denied

#### Scenario: app reads settings at startup

- GIVEN `system_settings` is seeded
- WHEN app initializes and calls the startup config loader
- THEN `initCurrencyConfig()` receives values from DB rows, not hardcoded literals

---

### Requirement: system_config_audit table

A `system_config_audit` table MUST exist for internal dev/ops tracking of precision-related changes. No tenant role MUST have access. NOT synced via PowerSync. NOT visible in any tenant UI.

| Column | Type |
|--------|------|
| `id` UUID PK | |
| `changed_at` TIMESTAMPTZ | |
| `changed_by` TEXT | |
| `key` TEXT | |
| `old_value` TEXT | |
| `new_value` TEXT | |

#### Scenario: table inaccessible to tenant roles

- GIVEN an authenticated tenant user
- WHEN any SELECT, INSERT, or UPDATE is attempted on `system_config_audit`
- THEN RLS denies access

---

### Requirement: Column widening — NUMERIC(20,8)

All financial columns currently typed `NUMERIC(12,2)` or `NUMERIC(12,4)` in PostgreSQL MUST be widened to `NUMERIC(20,8)`. The migration MUST use `ALTER COLUMN … TYPE NUMERIC(20,8)` — no data backfill required. Existing data is preserved exactly (widening is non-destructive).

#### Scenario: widening is non-destructive

- GIVEN a column with existing value `"1234.56"` as `NUMERIC(12,2)`
- WHEN `ALTER COLUMN … TYPE NUMERIC(20,8)` is applied
- THEN value reads back as `"1234.56000000"` — no truncation, no data loss

#### Scenario: migration order enforced

- GIVEN the SQL migration and the new app build
- WHEN deploying
- THEN SQL migration MUST be applied first; app deploy MUST follow — never reverse order

#### Scenario: PowerSync column.text already compatible

- GIVEN PowerSync schema maps financial columns as `column.text`
- WHEN the DB column is widened to `NUMERIC(20,8)`
- THEN no PowerSync schema change is required — strings pass through unchanged

---

### Requirement: Migration file naming

Migration files MUST follow the existing `NNNN_` sequential naming in `backend/migrations/`. The decimal precision migration MUST be a single file: `NNNN_decimal_precision.sql` containing column widenings, `system_settings` creation + seed, and `system_config_audit` creation.

#### Scenario: single atomic migration file

- GIVEN the migration file
- WHEN applied via Supabase SQL Editor in order
- THEN all column widenings, table creations, and seed inserts succeed atomically

---

### Requirement: Zod schema migration — monetary fields

All Zod schemas with `z.number()` on monetary fields MUST be migrated to `z.string()` with a `.transform()` that constructs a `Decimal`. Input validation MUST reject values that are not valid numeric strings.

#### Scenario: valid numeric string passes

- GIVEN a form field with value `"1234.56"`
- WHEN validated by a migrated Zod schema
- THEN schema passes and transform produces `Decimal("1234.56")`

#### Scenario: invalid string rejected

- GIVEN a form field with value `"abc"`
- WHEN validated
- THEN schema returns a validation error — no Decimal constructed

#### Scenario: number input coerced (backward compatibility)

- GIVEN a legacy call site passing JS `number` `1234.56`
- WHEN validated by the migrated schema using `z.coerce.string().transform(…)`
- THEN schema coerces to string, transform produces `Decimal("1234.56")`

---

### Requirement: Hook migration pattern

All ~30 hooks and components with direct float arithmetic MUST follow this pattern:
1. Accept values from PowerSync as `string` (already the case via `column.text`)
2. Convert to `Decimal` using `new Decimal(value)` or `currency.ts` helpers at the earliest point
3. Perform ALL intermediate operations as `Decimal`
4. Call `toStorageString()` on every monetary value before building the PowerSync write payload
5. MUST NOT call `Number()`, `parseFloat()`, or `.toFixed()` on monetary values at any point

#### Scenario: hook reads from PowerSync and writes back

- GIVEN a hook that reads `precio_usd` (string from PowerSync) and writes a computed total
- WHEN the hook runs
- THEN `precio_usd` is wrapped in `new Decimal()` immediately; `toStorageString()` is called before INSERT

#### Scenario: multi-line sale total accumulation

- GIVEN a POS sale with 3 line items: `"10.00"`, `"20.00"`, `"0.10"` USD each
- WHEN totals are accumulated
- THEN intermediate sum is `Decimal("30.10")` — no float drift at any step

#### Scenario: payment change calculation

- GIVEN a payment of `"50.00"` USD against a total of `"30.10"` USD
- WHEN change is computed
- THEN result is `Decimal("19.90")` — no rounding error in change calculation

#### Scenario: no raw float ops in src/

- GIVEN the complete `src/` directory after migration
- WHEN audited for `Number(`, `parseFloat(`, `.toFixed(` on monetary variables
- THEN zero occurrences exist on monetary/financial values

---

### Requirement: Smoke test — manual validation checklist

Since no test infrastructure exists, a manual smoke test MUST be executed after each domain migration PR merge. The checklist MUST cover the scenarios below.

#### Scenario: USD→Bs conversion accuracy

- GIVEN tasa `6.5000`, amount `0.10` USD
- WHEN converted via `usdToBs`
- THEN displayed result is `0.65 Bs` — not `0.6499999…`

#### Scenario: Bs→USD conversion accuracy

- GIVEN tasa `6.5000`, amount `0.65` Bs
- WHEN converted via `bsToUsd`
- THEN displayed result is `0.10 USD`

#### Scenario: tax calculation on multi-line sale

- GIVEN sale with 3 lines totaling `"100.00"` USD, IVA 16%
- WHEN total with tax is computed
- THEN result is `"116.00"` USD — no float drift

#### Scenario: multi-line sale total

- GIVEN 10 line items at `"0.10"` USD each
- WHEN summed via hook
- THEN total is `"1.00"` USD — not `"0.9999999…"`

#### Scenario: payment change

- GIVEN payment `"20.00"` USD, total `"19.90"` USD
- WHEN change computed
- THEN result is `"0.10"` USD exactly

---

## Out of Scope

| Item | Reason |
|------|--------|
| PowerSync schema changes | `column.text` already stores strings — no change needed |
| Display-only components (~50 files) | `formatUsd`/`formatBs` signatures become backward-compatible |
| Test infrastructure | Separate change — no `*.test.ts` files exist yet |
| Per-tenant precision settings | `system_settings` is global; per-tenant precision is a future capability |
| `prestamos` spec | Proposal explicitly states no Modified Capabilities |
| `caja` spec | Proposal explicitly states no Modified Capabilities |
