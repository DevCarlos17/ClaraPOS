# Verify Report: cxc-mejoras-pagos

_Change: cxc-mejoras-pagos | Pass: 3 (final) | Date: 2026-06-06 | Model: anthropic/claude-sonnet-4-6_

---

## Verification Report

**Change**: cxc-mejoras-pagos  
**Version**: spec.md 2026-06-06  
**Mode**: Standard (no test infrastructure — static code analysis + build evidence)

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 8 |
| Tasks complete | 8 |
| Tasks incomplete | 0 |

All 8 tasks (T-01 through T-08) remain `[x]` complete.  
Pass 3 fix: `pago-factura-modal.tsx` — PRESTAMOS S2 overpayment panel added.

---

### Build & Tests Execution

**TypeScript type-check**: ✅ No new errors in changed files

```text
yarn type-check — same pre-existing errors as passes 1 and 2:
  use-sesiones-caja.ts(572,19): TS7053  → pre-existing, unrelated
  calendario-citas.tsx(580,13): TS2769  → pre-existing, unrelated
  *.test.ts files: missing @types/jest  → pre-existing infrastructure gap

Zero new errors in all 9 files changed by this change
(migration, schema, hooks, modals, history component).
```

**Tests**: ➖ Not available (no test infrastructure in project per CLAUDE.md)

**Coverage**: ➖ Not available

---

### Pass 3 Focus: PRESTAMOS S2 — RESOLVED ✅

**File**: `src/features/cxc/components/pago-factura-modal.tsx`

#### What changed vs Pass 2

| Line | Pass 2 | Pass 3 |
|------|--------|--------|
| 179 | `excedeSaldoPrestamo = ... → canSubmit = false` | `estaOverpagoPrestamo = destino === 'PRESTAMO' && montoUsd > saldoRequeridoConSaf + 0.01` |
| 180 | (none) | `excedentePrestamo = estaOverpagoPrestamo ? ... : 0` |
| 182 | (none) | `overpayResuelto = (!estaOverpago && !estaOverpagoPrestamo) \|\| overpayMode !== null` |
| 188-192 | `canSubmit` had `!excedeSaldoPrestamo` blocking | `canSubmit` uses `overpayResuelto` — covers both FACTURA and PRESTAMO |
| 749-785 | (no PRESTAMO panel) | PRESTAMO overpayment panel: SAF + Vuelto (no Propina — approved deviation) |
| 208-253 | (no overpay handler for PRESTAMO) | `estaOverpagoPrestamo && overpayMode` branch: pays exact saldo, then SAF or Vuelto |

#### Evidence per spec scenario

**S1 — Loan overpayment — manual SAF section offered**: ✅ (confirmed pass 2, still intact)
- SAF section renders for PRESTAMO (`tieneSaf &&` gate — no longer restricts to `destino === 'FACTURA'`)

**S2 — Cashier declines SAF — excess credited**: ✅ RESOLVED
- User enters more than loan balance → `estaOverpagoPrestamo = true` → panel renders (no longer blocks submit)
- Panel offers "Saldo a favor" and "Dar vuelto" (SAF + Vuelto — per approved deviation)
- Cashier picks "Saldo a favor" → submit handler calls `registrarSafExcedente` → `saldo_actual` decremented by `excedentePrestamo`
- `registrarAbonoPrestamo` receives exact saldo (not the full overpaid amount) → loan fully settled
- `canSubmit` no longer has `!excedeSaldoPrestamo` anywhere — overpay is routed, not blocked

---

### Spot Checks (pass 1 & 2 fixes — all intact)

#### C-1 — SAF origin refs history display ✅ Intact

**File**: `src/features/cxc/components/factura-detalle-cxc.tsx` (L627-659)

- SAF rows render "Saldo a favor" badge + `"Originado por: PAG-001, PAG-003"` from `JSON.parse(mov.saf_origen_refs)` with defensive `try/catch`
- No changes since pass 2

---

#### W-1 — `registrarSafExcedente` with `saf_origen_refs` ✅ Intact

**File**: `src/features/cxc/hooks/use-cxc.ts` (L1707-1763)

- `RegistrarSafExcedenteParams` includes `safOrigenRefs?: string[]`
- INSERT always populates `saf_origen_refs`: caller refs or fallback `JSON.stringify([nro_factura])`
- No changes since pass 2

---

#### W-2 — `registrarAbonoGlobal` uses real FIFO refs ✅ Intact

**File**: `src/features/cxc/components/abono-global-modal.tsx` (L155-160)

- `safFifoRefs = fifoPreview.filter(...).map(f => f.nro_factura)` — real invoice numbers, not literal `['ABONO-GLOBAL']`
- No changes since pass 2

---

### Spec Compliance Matrix

| CAP | Scenario | Static Evidence | Pass 1 | Pass 2 | Pass 3 |
|-----|----------|-----------------|--------|--------|--------|
| CAP-1 | SAF section absent — client without credit | `tieneSaf` gate (PFM L641, AGM L378) | ✅ | ✅ | ✅ |
| CAP-1 | SAF section visible — client has credit | `useSaldoAFavor` + section renders with `disponible` | ✅ | ✅ | ✅ |
| CAP-1 | SAF applied reduces required payment | `saldoRequeridoConSaf = max(0, saldo - montoSaf)` + SAF INSERT | ✅ | ✅ | ✅ |
| CAP-1 | SAF exceeds debt — full coverage, excess preserved | `maxSaf = min(safDisponible, saldoEfectivo)` caps application | ✅ | ✅ | ✅ |
| CAP-1 | SAF partial — remainder via payment method | SAF pre-step + `aplicarPagoFacturaEnTx` in same `writeTransaction` | ✅ | ✅ | ✅ |
| CAP-1 | Payment history shows SAF origin refs | `factura-detalle-cxc.tsx` L627-659: "Saldo a favor" + "Originado por: ..." | ❌ | ✅ | ✅ |
| CAP-2 | No client — SAF option absent | `tieneSaf && clienteId &&` gate (cobro-modal) | ✅ | ✅ | ✅ |
| CAP-2 | Client without SAF — option absent | `tieneSaf = disponible > 0`, only when `saldo_actual < -0.001` | ✅ | ✅ | ✅ |
| CAP-2 | Client with SAF — option visible | `useSaldoAFavor(clienteId)` returns `tieneSaf=true` | ✅ | ✅ | ✅ |
| CAP-2 | SAF selected — amount pre-loaded | `setSafMonto(min(safDisponible, totalEfectivoUsd))` | ✅ | ✅ | ✅ |
| CAP-2 | SAF combined with another method | `safMontoBsEquiv` included in balance formula | ✅ | ✅ | ✅ |
| CAP-2 | SAF exact — movement recorded | `crearVenta` safEntry path INSERTs `movimiento_cuenta tipo='SAF'` | ✅ | ✅ | ✅ |
| CAP-2 | Overpayment without SAF preserves behavior | Discrepancy mode untouched; credit creation via PAG still works | ✅ | ✅ | ✅ |
| CAP-3 | USD method — amounts in USD | Inline ternary `moneda === 'BS' ? formatBs(...) : formatUsd(...)` | ✅ | ✅ | ✅ |
| CAP-3 | Bs method — amounts converted | `formatBs(p.aplicar * tasaEfectiva)` (AGM L516) | ✅ | ✅ | ✅ |
| CAP-3 | No method selected — default USD | `moneda = metodoSeleccionado?.moneda ?? 'USD'` | ✅ | ✅ | ✅ |
| CAP-3 | Method change — table recalculates in real time | `fifoPreview` computed inline every render; `metodoSeleccionado` reactive | ✅ | ✅ | ✅ |
| CAP-3 | Footer total matches selected currency | `formatBs(sum * tasaEfectiva)` or `formatUsd(sum)` in `<tfoot>` | ✅ | ✅ | ✅ |
| CAP-3 | Stored values remain in USD | FIFO uses `montoUsd`; tasa conversion is display-only | ✅ | ✅ | ✅ |
| CAP-4 | Exact payment — no breakdown shown | Panel conditional: `estaOverpago && discrepancyMode === 'VUELTO'` | ✅ | ✅ | ✅ |
| CAP-4 | Vuelto in single currency | `tieneUsd`/`tieneBs` flags; single-method paths show `$X.XX` or `BsX.XX` | ✅ | ✅ | ✅ |
| CAP-4 | Vuelto across mixed currencies | `tieneUsd && tieneBs` branch shows two-row breakdown | ✅ | ✅ | ✅ |
| CAP-4 | EGRESO record preserved after UX change | switch case 'VUELTO' inserts `movimientos_metodo_cobro tipo='EGRESO'` | ✅ | ✅ | ✅ |
| CAP-5 | Existing rows unaffected | `ALTER TABLE ADD COLUMN saf_origen_refs TEXT` — nullable, no backfill | ✅ | ✅ | ✅ |
| CAP-5 | New SAF movement includes refs | All 4 SAF paths populate `saf_origen_refs` (non-null) | ⚠️ | ✅ | ✅ |
| CAP-5 | Multiple origin payments | `JSON.stringify(safOrigenRefs)` serializes full array | ✅ | ✅ | ✅ |
| CAP-5 | History displays parsed origins | `factura-detalle-cxc.tsx` L636-645: parses JSON + shows "Originado por:" | ❌ | ✅ | ✅ |
| CAP-5 | Column included in PowerSync sync | `saf_origen_refs: column.text` in schema.ts; sync-rules `SELECT *` | ✅ | ✅ | ✅ |
| **PRESTAMOS** | **Loan overpayment — manual SAF section offered (S1)** | SAF section renders for PRESTAMO (gate no longer restricts to FACTURA) | ❌ | ✅ | ✅ |
| **PRESTAMOS** | **Cashier declines SAF — excess credited (S2)** | PRESTAMO overpay panel (SAF+Vuelto); `registrarSafExcedente` on SAF pick | ❌ | ⚠️ | ✅ |

**Compliance summary**: 30/30 scenarios compliant (100%)  
Pass 1: 24/30 → Pass 2: 29/30 → Pass 3: 30/30

---

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| TypeScript strict (no `any`, no `as`) | ✅ Implemented | Zero new type errors in all changed files |
| Multi-tenant `empresa_id` in all queries | ✅ Implemented | All new INSERTs pass `empresa_id`; `useSaldoAFavor` filters by it |
| Atomicity via `db.writeTransaction` | ✅ Implemented | SAF logic in `registrarAbonoPrestamo`, `registrarPagoFactura`, `registrarAbonoGlobal` — all in same tx |
| UI only in Spanish | ✅ Implemented | "Saldo a favor", "Originado por:", "Dar vuelto", "Monto SAF a aplicar" |
| Currency storage in USD | ✅ Implemented | `monto_usd` stored in USD; Bs display is presentation-only |
| Migration additive (no backfill, nullable) | ✅ Implemented | `ALTER TABLE movimientos_cuenta ADD COLUMN saf_origen_refs TEXT` — no DEFAULT, no UPDATE |
| SAF gate `saldo_actual < -0.001` | ✅ Implemented | `useSaldoAFavor`: `saldo_actual < -0.001 ? Math.abs(saldo_actual) : 0` |

---

### Coherence (Design Decisions)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Hook location `src/core/hooks/use-saldo-a-favor.ts` | ✅ Yes | File exists at exact path |
| SAF inline in existing `writeTransaction` | ✅ Yes | All SAF pre-steps are inline inside the same tx |
| SAF origin refs provided by caller | ✅ Yes | `safOrigenRefs` param on all functions; `registrarSafExcedente` has fallback to `[nro_factura]` |
| `SafEntry` separate from `PagoEntry[]` in POS | ✅ Yes | `safEntry?: SafEntry` distinct from `pagos: PagoEntry[]` |
| FIFO display inline ternary | ✅ Yes | No helper function; inline in `<td>` and `<tfoot>` |
| `saf_origen_refs` as JSON array of human-readable refs | ✅ Yes | `JSON.stringify(['0001234', ...])` |
| **Approved deviation**: `registrarPagoFactura` accepts `monto >= 0` | ✅ Yes | `monto === 0` allowed when SAF covers all |
| **Approved deviation**: SAF in `registrarAbonoGlobal` distributes FIFO in same tx | ✅ Yes | SAF pre-step reduces invoice balances before regular FIFO loop |
| **Approved deviation**: SAF in cobro-modal as checkbox with editable monto | ✅ Yes | Checkbox + Input pattern at cobro-modal |
| **Approved deviation**: INSERT of `pagos` inside `if (montoUsd > 0)` | ✅ Yes | `registrarAbonoPrestamo` L1109 and `registrarPagoFactura` L580 |
| **Approved deviation**: Panel PRESTAMO sin opción "Propina" (solo SAF + Vuelto) | ✅ Yes | PFM L749-785: options array has only SAF + VUELTO |

---

### Issues Found

#### CRITICAL

None.

---

#### WARNING

None.

---

#### SUGGESTION

**[S-1] Legacy `aplicarSaldoFavor` missing `saf_origen_refs` in INSERT**  
**File**: `src/features/cxc/hooks/use-cxc.ts` L1484-1503  
Pre-existing gap. `aplicarSaldoFavor` (used by `AplicarSafModal`) inserts `movimiento_cuenta tipo='SAF'` without `saf_origen_refs`. Out of scope for this change; all new paths now populate it.

**[S-2] `fifoPreview` in `abono-global-modal` recalculates on every render without `useMemo`**  
**File**: `src/features/cxc/components/abono-global-modal.tsx` L121  
Pre-existing gap. Low impact in practice.

---

### Approved Deviations (final confirmation)

| Deviation | Status |
|-----------|--------|
| `registrarPagoFactura` accepts `monto >= 0` | ✅ Verified in code |
| SAF in `registrarAbonoGlobal` does FIFO distribution in same tx | ✅ Verified in code |
| SAF in `cobro-modal` as checkbox with editable monto (not dropdown) | ✅ Verified in code |
| INSERT of `pagos` inside `if (montoUsd > 0)` | ✅ Verified in code |
| Panel PRESTAMO sin opción "Propina" (solo SAF + Vuelto) | ✅ Verified in code |

---

### Pass Delta Summary

| Issue | Pass 1 | Pass 2 | Pass 3 |
|-------|--------|--------|--------|
| C-1 (SAF history display) | ❌ CRITICAL | ✅ RESOLVED | ✅ |
| C-2 S1 (SAF section for PRESTAMO) | ❌ CRITICAL | ✅ RESOLVED | ✅ |
| C-2 S2 (loan overpay without SAF) | ❌ CRITICAL | ⚠️ WARNING | ✅ **RESOLVED** |
| W-1 (`registrarSafExcedente` refs) | ⚠️ WARNING | ✅ RESOLVED | ✅ |
| W-2 (real FIFO refs in abono-global) | ⚠️ WARNING | ✅ RESOLVED | ✅ |
| S-1 (legacy `aplicarSaldoFavor`) | 💡 SUGGESTION | 💡 SUGGESTION | 💡 SUGGESTION (out of scope) |
| S-2 (`useMemo` for fifoPreview) | 💡 SUGGESTION | 💡 SUGGESTION | 💡 SUGGESTION (out of scope) |

---

### Verdict

**PASS**

All 30/30 spec scenarios are compliant. The implementation correctly:

1. ✅ Displays SAF origin refs in CxC payment history ("Originado por: PAG-001") with defensive `JSON.parse`
2. ✅ Shows SAF section for loan payments (`destino === 'PRESTAMO'`) — BRECHA-002 primary resolution
3. ✅ PRESTAMO overpayment no longer blocks submit — panel offers SAF + Vuelto routing
4. ✅ `registrarAbonoPrestamo` executes SAF pre-step atomically inside `writeTransaction`
5. ✅ `registrarSafExcedente` always populates `saf_origen_refs` (caller refs or `[nro_factura]` fallback)
6. ✅ `registrarAbonoGlobal` uses real FIFO invoice refs as origin traceability
7. ✅ `canSubmit` contains no `excedeSaldoPrestamo` blocker; `overpayResuelto` covers both FACTURA and PRESTAMO

Two open suggestions remain (legacy `aplicarSaldoFavor` and `useMemo`) — both pre-existing gaps, out of scope for this change.
