## Verification Report

**Change**: nc-refund-tesoreria
**Version**: N/A
**Mode**: Strict TDD
**Branch**: feat/nc-refund-tesoreria (local, not pushed, not merged)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 21 (excl. 3 manual/blocked Supabase steps) |
| Tasks complete | 18 code tasks [x] + 3 manual (1.2/1.3 correctly deferred to user) |
| Tasks incomplete | 0 code tasks |

### Build & Tests Execution

**Type-check**: ⚠️ Partial pass
```text
yarn type-check
- 2 REAL errors in a file this change created:
  src/features/ventas/components/refund-tesoreria-form.tsx(43,44/63):
    TS2345 Argument of type 'Value' is not assignable to parameter of type 'DecimalInput'
    (formatEnMonedaCuenta's `monto: Decimal.Value` param includes `bigint`,
    which `DecimalInput = string | number | Decimal` does not accept)
- 1 pre-existing unrelated error: src/hooks/use-pwa-update.ts(8,20) unused var
  'swUrl' (file confirmed UNTOUCHED by this branch's diff)
- ~6300 additional errors are a pre-existing, project-wide tsconfig gap:
  every *.test.ts(x) file (old AND new, e.g. notas-credito-fiscal.test.ts,
  notas-credito-ui.test.ts — untouched by this branch) fails with
  "Cannot find name 'describe'/'it'/'expect'/'vi'" because `yarn type-check`
  does not include vitest globals types. This is NOT specific to this change.
```

**Lint**: ➖ Not available (`eslint` binary not resolvable in this environment — `yarn lint` fails with "'eslint' is not recognized")

**Tests**: ✅ 1496 passed / ❌ 3 failed / (1499 total, 125 files)
```text
yarn test:run
Test Files: 2 failed | 123 passed (125)
Tests:      3 failed | 1496 passed (1499)
Duration:   219.71s

Failures (both in files CONFIRMED ABSENT from `git diff develop...feat/nc-refund-tesoreria --stat`):
  - src/features/clientes/components/__tests__/cliente-detalle.test.tsx
  - src/features/cxc/components/__tests__/cxc-cliente-detalle.test.tsx
  Root cause: `ReferenceError: Worker is not defined` inside
  @powersync/web's WASQLiteOpenFactory (jsdom test environment has no
  Worker global) — a pre-existing PowerSync/vitest environment gap,
  unrelated to any code touched by nc-refund-tesoreria.
  Independently confirmed: neither file appears anywhere in the branch's
  18-file diff vs develop. Treated as PRE-EXISTING FLAKE, not attributed
  to this change.
```

Independently re-ran the 4 new/most-relevant test files in isolation to cross-check the numbers claimed in tasks.md/apply-progress — all matched exactly:
| File | Claimed | Verified |
|------|---------|----------|
| `notas-credito-refund.test.ts` | 8/8 | ✅ 8/8 |
| `use-notas-credito.test.ts` | 57/57 | ✅ 57/57 |
| `refund-tesoreria-form.test.tsx` | 5/5 | ✅ 5/5 |
| `crear-ncr-modal.test.tsx` | 19/19 | ✅ 19/19 |

**Coverage**: Not run (no coverage tool detected in cached capabilities for this repo)

### Scenario Count Discrepancy (documentation nit)

The launch prompt and `tasks.md` both cite "22 scenarios." Independent count via `grep -c "^#### Scenario"` on both delta spec files:
- `notas-credito-liquidacion/spec.md`: **12** scenarios
- `notas-credito-admin/spec.md`: **7** scenarios
- **Total: 19**, not 22.

`tasks.md`'s own line ("19 of the 22 scenarios... explicitly mapped... remaining 3 are implied byproducts") is internally inconsistent with the actual spec file content — there is no un-mapped remainder because there are only 19 scenario headers total, and all 19 are mapped. This is a SUGGESTION-level documentation slip, not a functional gap — all 19 real scenarios have covering evidence (see matrix below).

### Spec Compliance Matrix (19 real scenarios)

**notas-credito-liquidacion** (12/12 compliant):
| Scenario | Test | Result |
|---|---|---|
| Egreso pendiente de conciliación | `use-notas-credito.test.ts` > "Scenario 'Egreso pendiente de conciliación'" | ✅ COMPLIANT |
| Sin impacto en sesión POS activa | `use-notas-credito.test.ts` > "Scenario 'Sin impacto en sesión POS activa'" | ✅ COMPLIANT |
| Intento de forzar salida de efectivo en modalidad no-efectivo | `use-notas-credito.test.ts` > gate `it.each` (SALDO_FAVOR/AJUSTE_CXC/COMPENSACION_VENTA) | ✅ COMPLIANT |
| Array vacío no dispara el gate en REFUND_TESORERIA | `use-notas-credito.test.ts` > "Scenario 'Array vacío no dispara el gate' en REFUND_TESORERIA" | ✅ COMPLIANT |
| Array no vacío requerido cuando hay reembolso real | `use-notas-credito.test.ts` > "Scenario 'Array no vacío requerido...'" | ✅ COMPLIANT |
| Cuenta bancaria en Bolívares | `notas-credito-refund.test.ts` + `use-notas-credito.test.ts` "Scenario 'Cuenta bancaria en Bolivares'" | ✅ COMPLIANT |
| Cuenta en USD | `notas-credito-refund.test.ts` > "Scenario 'Cuenta en USD'" | ✅ COMPLIANT |
| Refund dividido entre banco y caja fuerte | `notas-credito-refund.test.ts` + `use-notas-credito.test.ts` "Scenario 'Refund dividido...'" | ✅ COMPLIANT |
| Tope — intento de exceder rechazado | `notas-credito-refund.test.ts` + `use-notas-credito.test.ts` "Scenario 'Intento de exceder...'" | ✅ COMPLIANT |
| NC 100, refund parcial 60, resto a SAFC | `notas-credito-refund.test.ts` (exact 100/60/40 asserted) + `use-notas-credito.test.ts` (same numbers, engine level) | ✅ COMPLIANT |
| Refund excede saldo de caja fuerte | `use-notas-credito.test.ts` > "Scenario 'Refund excede saldo de caja fuerte' (rechazo real)" | ✅ COMPLIANT |
| Banco sin guard de sobregiro | `use-notas-credito.test.ts` > "Scenario 'Banco sin guard de sobregiro'" | ✅ COMPLIANT |

**notas-credito-admin** (6/7 compliant, 1 deviation, 1 partial):
| Scenario | Test | Result |
|---|---|---|
| Ambas opciones visibles | Split across two tests (Devolver dinero enabled test + Credito a favor enabled test); no single test asserts both simultaneously | ⚠️ PARTIAL |
| Devolver dinero habilitada revela sub-opciones | `crear-ncr-modal.test.tsx` > "Scenario 'Devolver dinero habilitada revela sub-opciones'" | ✅ COMPLIANT |
| Sesión de caja activa permanece deshabilitada | `crear-ncr-modal.test.tsx` > "Scenario 'Sesión de caja activa permanece deshabilitada'" | ✅ COMPLIANT |
| Seleccionar Tesorería revela el mini-formulario | `crear-ncr-modal.test.tsx` > "Scenario 'Seleccionar Tesorería revela el mini-formulario'" | ✅ COMPLIANT |
| Emisión vía Crédito a favor sigue siendo AJUSTE_CXC | `crear-ncr-modal.test.tsx` pre-existing test asserts `modalidad === 'SALDO_FAVOR'`, NOT `AJUSTE_CXC` — documented DEVIATION | ⚠️ DEVIATION (documented) |
| Emisión vía Tesorería invoca REFUND_TESORERIA | `crear-ncr-modal.test.tsx` > "Scenario 'Emisión vía Tesorería invoca REFUND_TESORERIA'" | ✅ COMPLIANT |
| Selector muestra saldo por cuenta | `refund-tesoreria-form.test.tsx` > "Scenario 'Selector muestra saldo por cuenta'" | ✅ COMPLIANT |

**Compliance summary**: 18/19 fully compliant, 1 partial (cosmetic), 1 intentional documented deviation.

### Correctness (Static + Runtime Evidence) — Financial Focus

| Check | Status | Evidence |
|---|---|---|
| No double-counting (Step A cancels debt / egress moves real money / SAFC = remainder only) | ✅ Verified | `remanenteALiquidar` is already net of Step A (design confirms, code confirms — Step B branch operates on `remanenteALiquidar` post-Step-A); `calcularRemanenteRefund` test asserts exact NC100/refund60/SAFC40 split; engine test asserts SAFC insert of `40.00000000` + egress of `60.00000000`, matching totals |
| NC cap enforced at function level, before any egress write, full rollback on exceed | ✅ Verified | Guard runs as a full read-only pass (`calcularRemanenteRefund`) BEFORE the write loop in `use-notas-credito.ts`; test "Intento de exceder..." asserts throw AND asserts zero `INSERT INTO movimientos_bancarios`/`mov_caja_fuerte` occurred |
| Multi-currency conversion uses `tasa_historica`, not current rate | ✅ Verified | Code: `notas_credito.tasa_historica` is set from `venta.tasa` (L732) and the SAME `venta.tasa` is reused for `nativoAUsd(...)` at the refund branch (L1151) — same transaction, same value, by construction can never diverge from what's persisted as `tasa_historica`. Bs test (4000 Bs @ tasa 40 = 100.00 USD) passes independently in both pure-calc and engine layers |
| Anti-fraude empty-array gate (`[]` = no-egress, not a block) | ✅ Verified | `assertGateAntiFraudeNoDesembolso` uses `Array.isArray(egresoParams) && egresoParams.length > 0`; dedicated tests for `[]` on SALDO_FAVOR/AJUSTE_CXC/COMPENSACION_VENTA and REFUND_TESORERIA all pass |
| Multi-source: lines sum-reconcile against NC total | ✅ Verified | "Refund dividido entre banco y caja fuerte" test: 100+50=150==NC total, asserts zero SAFC row written |
| Atomicity — single `db.writeTransaction` | ✅ Verified (code read) | One `await db.writeTransaction(async (tx) => {...})` at L489; the entire `REFUND_TESORERIA` branch (guard, N egress writes, SAFC write) lives inside that same callback — no nested/secondary transaction |
| `empresa_id` on every insert (Rule #11) | ✅ Verified (code read) | Present as a bound param on both the `movimientos_bancarios`/`mov_caja_fuerte` INSERT and the SAFC `movimientos_cuenta` INSERT |
| `movimientos_*` insert-only (Rule #2) | ✅ Verified (code read) | Branch only issues `INSERT`s + a `saldo_actual` `UPDATE` on the *account* table (not on the movement table itself) — no `UPDATE`/`DELETE` on `movimientos_bancarios`/`mov_caja_fuerte`/`movimientos_cuenta` rows |
| $0.00 impact on active POS drawer (Regla de Oro) | ✅ Verified | Dedicated test with an active `sesion_caja_id` asserts zero `INSERT INTO movimientos_metodo_cobro ... 'NCR'`; confirmed by code read — the branch never touches `movimientos_metodo_cobro` |
| Caja fuerte guard reused; banks NOT blocked | ✅ Verified | `escribirEgresoTesoreriaEnTx` only throws on `destino === 'CAJA_FUERTE' && montoNativo.gt(saldoAnt)`; dedicated tests prove caja fuerte rejects 80 vs saldo 50, and bank accepts the identical 80-vs-50 case with no rejection |

### Regression Check (pre-existing modalidades)

- Full `use-notas-credito.test.ts` (48 tests before this change, 57 after) is 57/57 green, independently re-verified.
- Reviewed the file diff directly: the ONLY test removed is the placeholder `"REFUND_TESORERIA rechaza como 'no implementado'"` — the expected, correct removal once the real behavior replaced the stub throw. Every other change to the test file is an ADDITION (new fixtures fields, new gate cases, new Slice 4 describe block). No existing assertion for EFECTIVO_REAL/SALDO_FAVOR/COMPENSACION_VENTA/AJUSTE_CXC was weakened, loosened, or deleted.
- `crear-ncr-modal.test.tsx`: the pre-existing test `'emision con "Credito a favor" seleccionado... resulta en modalidad SALDO_FAVOR'` is UNMODIFIED and still passes — this is the direct proof backing the DEVIATION decision below. One pre-existing test's TITLE ("es la unica opcion seleccionable") is now stale wording (Devolver dinero is no longer disabled) but its assertions were not changed and remain valid — cosmetic only.
- `nota-credito-pos-modal.tsx` confirmed untouched (0 lines in diff) — REFUND_TESORERIA correctly stays excluded from the POS flow per design's explicit non-goal.

### DEVIATION Assessment: "Crédito a favor" → SALDO_FAVOR (not AJUSTE_CXC)

Independent judgment: **preserving `SALDO_FAVOR` is the correct call.** The spec scenario's own GIVEN/WHEN/THEN text says "sin cambios respecto al comportamiento existente" (no changes vs. existing behavior) — but the spec's requirement prose separately claims the target modality is `AJUSTE_CXC`. These two clauses are self-contradictory: the pre-existing, still-green test proves the actual existing behavior has always been `SALDO_FAVOR`, never `AJUSTE_CXC`. Design.md's six resolved forks never mention touching this mapping, and it is causally unrelated to `REFUND_TESORERIA` (this change's entire scope). Changing an unrelated, previously-untested-for-this-purpose financial mapping as a side effect of a treasury-refund feature would be a scope violation and an unrequested behavior change to a live financial code path. The implementer's choice to keep `SALDO_FAVOR` and flag it is the conservative, correct action — it should be raised to the spec author as a likely authoring slip and resolved in a dedicated follow-up change with its own tests if `AJUSTE_CXC` genuinely was intended.

### Migration 0093 Verdict

✅ File-only (not applied to Supabase — confirmed by apply-progress notes and by design; nothing in this repo applies migrations automatically).
✅ Idempotent (`DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`, same pattern as 0035/0077/0091).
✅ Alters `origen` CHECK on BOTH `movimientos_bancarios_origen_check` and `mov_caja_fuerte_origen_check`, adding `'REEMBOLSO_NCR'` to the full existing value list in each (verified against migrations 0077/0035 as cited).
✅ Sequential numbering confirmed (`0092_producto_costo_factura_tasa_paralela.sql` is the prior file; `0093` is next, no gap, no reuse).
✅ Follows `migrations/README.md` conventions (`NNNN_description.sql`, idempotent, includes rollback block).
✅ Documents the PowerSync-no-CHECK caveat explicitly and thoroughly — cross-checked against `src/core/db/powersync/schema.ts` L913/L959: `origen: column.text` with NO validation, confirming the documented risk is real and accurately described.

### Assertion Quality Audit

Scanned all new/modified test files (`notas-credito-refund.test.ts`, the Slice-3/4 additions in `use-notas-credito.test.ts`, `refund-tesoreria-form.test.tsx`, the Slice-6 additions in `crear-ncr-modal.test.tsx`). No tautologies, no assertion-free tests, no ghost loops, no mock-heavy files. Assertions consistently check concrete computed values (exact decimal amounts, SQL bound params, specific rejected/accepted branches) rather than type-only or smoke checks. One minor note: several engine tests assert on raw SQL string prefixes (e.g. `sql.startsWith('INSERT INTO movimientos_bancarios')`) which is a mild implementation-detail coupling, but this matches the pre-existing convention of the entire file (48 prior tests use the identical pattern) — not a new problem introduced by this change.

**Assertion quality**: ✅ No CRITICAL issues; 0 new WARNING-level trivial assertions.

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. `yarn type-check` fails with 2 real (non-test) type errors introduced by this change in `refund-tesoreria-form.tsx` (lines 43,44 and 43,63): `formatEnMonedaCuenta(monto: Decimal.Value, ...)` passes a `Decimal.Value` (which includes `bigint`) into `formatBs`/`formatUsd`, which only accept `DecimalInput` (`string | number | Decimal`). Does not affect runtime/tests (esbuild strips types, `saldo_actual` is always a string in practice) but will fail a CI `type-check` gate if one exists. One-line fix: narrow the parameter to `DecimalInput` (or `Decimal.Value` minus `bigint`).

**SUGGESTION**:
1. `tasks.md` states "19 of the 22 scenarios... mapped, remaining 3 implied" — the actual scenario count in both delta spec files is 19 total (`grep -c "^#### Scenario"` = 12 + 7), not 22. Internally inconsistent; harmless (all 19 real scenarios ARE covered), but worth a one-line correction for future readers.
2. Scenario "Ambas opciones visibles" (notas-credito-admin) has no single dedicated test asserting both "Devolver dinero" and "Crédito a favor" are visible together — coverage is split across two separate tests that each check one button. Low risk (both buttons are unconditionally rendered, not behind a flag), but a direct test would close the gap cleanly.
3. The pre-existing test title `'"Credito a favor" es la unica opcion seleccionable...'` in `crear-ncr-modal.test.tsx` is now stale wording post-change (Devolver dinero is no longer disabled) — the assertions themselves are still valid, just the title is misleading now.
4. `yarn lint` is not runnable in this environment (`eslint` binary not found) — could not verify lint cleanliness of the new files. Recommend running lint in CI/locally before merge.

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| (a) `EgresoParams` as array from day 1, `.length>0` gotcha fix | ✅ Yes | Exact interface match, gate fixed as specified |
| (b) `doc_origen_tipo = 'NOTA_CREDITO'` reused (not a new value) | ✅ Yes | Confirmed in all three insert sites (egress lines + SAFC) |
| (c) `origen = 'REEMBOLSO_NCR'` in both tables | ✅ Yes | Migration + write code both use the exact value |
| (d) Array-order distribution, tope guard before any write | ✅ Yes | Full read-only pass before write loop |
| (e) Pure calc module, zero DB/React | ✅ Yes | `notas-credito-refund.ts` has zero imports beyond `decimal.js`/`currency.ts` |
| (f) Migration 0093, file-only, documents PowerSync caveat | ✅ Yes | Matches design §f almost verbatim |
| "Tesorería no sabe qué es una NC" (no imports from `ventas` into treasury tables) | ✅ Yes | Helper functions are local/private to `use-notas-credito.ts`, write generic `doc_origen_id`/`doc_origen_tipo`, no reverse dependency created |
| "No se toca": `use-cxp.ts`, `use-traspasos.ts`, `use-cuentas-tesoreria.ts`, `nota-credito-pos-modal.tsx` | ✅ Yes | Confirmed 0 diff lines on all four vs develop |

### Verdict
**PASS WITH WARNINGS**

The implementation is faithful to spec and design, financially sound (double-counting, tope, tasa_historica, multi-source, atomicity, empresa_id, immutability, and the $0.00 POS-impact rule are all independently verified by real passing tests plus direct code inspection), and does not regress any of the ~48 pre-existing NC tests. The only non-cosmetic issue is a narrow, easily-fixed `yarn type-check` failure in the new UI component (2 errors, no runtime/financial impact). The SALDO_FAVOR-vs-AJUSTE_CXC deviation is judged correct and is already flagged for the user's own decision, not a defect. Migration 0093 is safe, idempotent, and correctly documented as not-yet-applied. Safe to proceed to `sdd-archive` once the `Decimal.Value`/`DecimalInput` type mismatch is fixed (trivial) and, ideally, the user confirms the SALDO_FAVOR-vs-AJUSTE_CXC call.
