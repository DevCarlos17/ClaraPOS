# Proposal: POS Mejoras de Cobro

_Date: 2026-06-01 | Model: anthropic/claude-sonnet-4-6_

---

## Intent

Improve the POS checkout experience with six targeted enhancements: a mobile dropdown z-index fix, keyboard confirmation shortcut inside the payment modal, split-change distribution for overpayments, a credit-to-account (SAF) option when a client pays too much, a supervisor-authorized loss absorption flow when a client pays too little, and quantity ± buttons for touch UX. All items reuse existing infrastructure; no schema migrations are required.

---

## Scope

### In Scope
- Fix `ClienteSelector` dropdown clipped on mobile (`absolute z-50` → `fixed + useLayoutEffect + z-[9999]`)
- ENTER/F12 inside `CobroModal` to confirm payment when `puedeProcesar === true`
- Split vuelto (overpayment change) across multiple payment method entries
- Saldo a favor (SAF): credit overpayment to client CxC as `movimiento_cuenta` tipo `'SAF'`
- Absorber diferencial: business absorbs shortfall with supervisor PIN authorization; logged as auditable `gastos` entry
- `+`/`−` buttons flanking the quantity input; `+`/`−` key capture redirected to increment/decrement

### Out of Scope
- Propinas (tips)
- Diferencial cambiario en cobro POS
- Autoconsumo

---

## Capabilities

> This section is the contract between proposal and specs phases.

### New Capabilities
- `pos-saldo-a-favor`: Client overpayment credited to CxC as `movimiento_cuenta tipo='SAF'` instead of physical change
- `pos-absorber-diferencial`: Supervisor-authorized shortfall absorption with auditable `gastos` record and dual ID tracking (cajero + supervisor)

### Modified Capabilities
- None — no existing specs in `openspec/specs/`

---

## Approach

### 1. Fix z-index ClienteSelector (mobile)

**What changes**: Replace `absolute z-50` dropdown with `fixed z-[9999]` positioned via `useLayoutEffect`.

**Files**:
- `src/features/ventas/components/cliente-selector.tsx` — copy the `useLayoutEffect` + `getBoundingClientRect()` pattern from `producto-buscador.tsx` (lines 101–115). Add a `dropdownStyle` state holding `{ top, left, width }`. Replace `absolute z-50 mt-1 w-full` with `fixed z-[9999]` + inline style from state. Add `resize`/`scroll` cleanup in the effect.

---

### 2. ENTER/F12 confirm cobro inside CobroModal

**What changes**: Add a `keydown` listener scoped to the modal that calls `handleProcesar()` when conditions are met.

**Files**:
- `src/features/ventas/components/cobro-modal.tsx` — add `useEffect` that attaches `keydown` on `document` while the modal is mounted. On `F12` or `Enter`: if `puedeProcesar === true` AND focused element is NOT inside the add-payment form fields (amount/reference inputs), call `handleProcesar()`. Guard against `SupervisorPinDialog` being open.

---

### 3. Split vuelto (overpayment combinado)

**What changes**: Replace the single-method vuelto UI with a multi-row distribution table; pass array to `crearVenta()`.

**Files**:
- `src/features/ventas/components/cobro-modal.tsx` — when `estaOverpago`, show a vuelto distribution section: one row per cash-capable method selected, each with an editable amount. Validate that `Σ splits === totalVuelto` before enabling Procesar. Pass `vueltoEntries: { metodoCobro_id, monto, moneda_id }[]` to `crearVenta()`.
- `src/features/ventas/hooks/use-ventas.ts` — loop `vueltoEntries` and insert one `movimientos_metodo_cobro` row per entry (`tipo=EGRESO`, `origen=VUELTO`).

---

### 4. Saldo a favor (SAF)

**What changes**: Add a two-option UI in the overpayment section; on SAF selection, insert `movimiento_cuenta tipo='SAF'`.

**Files**:
- `src/features/ventas/components/cobro-modal.tsx` — when overpayment detected AND a client is selected, show radio/toggle: "Dar vuelto" (default) vs "Acreditar en cuenta". If SAF chosen, hide physical vuelto UI. Pass `{ safEnabled: true, montoSafUsd: diff }` to `crearVenta()`.
- `src/features/ventas/hooks/use-ventas.ts` — when `safEnabled`: insert `movimientos_cuenta` with `tipo='SAF'`, `monto=montoSafUsd`, `saldo_anterior`, `saldo_nuevo`, `venta_id`, `tasa_pago`. Skip `movimientos_metodo_cobro EGRESO VUELTO` for this amount.

> Note: `saldo_actual` on the client is updated by the existing PostgreSQL trigger on `movimientos_cuenta` insert. No direct field mutation.

---

### 5. Absorber diferencial + PIN supervisor

**What changes**: Add "El negocio asume la diferencia" option when `pendienteUsd > 0` and client has no eligible credit; gate behind `SupervisorPinDialog`.

**Files**:
- `src/features/ventas/components/cobro-modal.tsx` — show the button when `pendienteUsd > 0.01` and credit payment is not selected. On click: open `SupervisorPinDialog` with `requiredPermission='ventas.absorber_diferencial'`. On `onAuthorized(supervisorId)`: set `absorberDiferencial = true`, store `supervisorId`. Pass `{ absorberDiferencial: true, cajeroId, supervisorId, montoAbsorbidoUsd }` to `crearVenta()`.
- `src/features/ventas/hooks/use-ventas.ts` — when `absorberDiferencial`: insert `gastos` row with `concepto='ABSORCION_DIFERENCIAL_POS'`, `monto_usd=montoAbsorbidoUsd`, `venta_id`, `cajero_id`, `supervisor_id` (in a notes/ref field or as separate columns if available). Mark venta as `tipo=CONTADO`, `saldo_pend_usd=0`.
- `src/lib/permissions.ts` — add constant `VENTAS_ABSORBER_DIFERENCIAL = 'ventas.absorber_diferencial'`.

---

### 6. Botones +/− cantidad en LineaItems

**What changes**: Add ± buttons flanking the quantity `<input>`; redirect `+`/`−` key to increment/decrement.

**Files**:
- `src/features/ventas/components/linea-items.tsx` — wrap each quantity input in a flex row: `[−] [input] [+]`. `+` button: increment qty by 1 (or minimum step if `es_decimal`). `−` button: decrement qty by 1, min = 1 (or 0.001 for decimal). Intercept `keydown` on input: `+` key → increment; `−` key → decrement (replace the current `preventDefault` block for `−` with a decrement call). ENTER behavior unchanged (focus `ProductoBuscador`).

---

## Dependencies

| Existing asset | Reuse for |
|----------------|-----------|
| `producto-buscador.tsx` `useLayoutEffect` fixed pattern | ClienteSelector dropdown fix (copy verbatim) |
| `supervisor-pin-dialog.tsx` (182 lines) | Absorber diferencial — full reuse, no changes needed |
| `movimientos_cuenta.tipo` field (no DB constraint) | Accepts `'SAF'` value without schema migration |
| `gastos` table | Records absorbed differential as auditable expense |
| `use-ventas.ts crearVenta()` write-transaction | Extended with `safOptions` and `absorberOptions` params |
| `PERMISSIONS` constants in `src/lib/permissions.ts` | New slug `ventas.absorber_diferencial` added |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| SAF balance not reflected in UI until PowerSync sync completes | Medium | Show confirmed SAF amount in `venta-exitosa-modal`; CxC live-updates after sync |
| `gastos` table used for differential absorption — may be confused with purchase expenses | Medium | Use distinguishing `concepto = 'ABSORCION_DIFERENCIAL_POS'`; filter by this string in reports |
| F12/ENTER listener fires while `SupervisorPinDialog` is open | Low | Guard with `supervisorDialogOpen` ref; dialog already captures its own keys |
| Split vuelto sum drifts from exact change (floating point) | Low | Use `text`-based NUMERIC arithmetic (same as rest of POS); validate with tolerance ≤ $0.01 |
| SAF + absorber offered simultaneously (UI conflict) | Low | Mutual exclusion: SAF only when `estaOverpago`, absorber only when `pendiente > 0` |

---

## Rollback Plan

All changes are confined to four frontend files (`cobro-modal.tsx`, `use-ventas.ts`, `cliente-selector.tsx`, `linea-items.tsx`) plus a permissions constant. No schema migrations. `movimientos_cuenta tipo='SAF'` rows and `gastos ABSORCION_DIFERENCIAL_POS` rows are append-only auditable records — they do not break existing queries. Rollback = `git revert` on the four files; no data cleanup required.

---

## Open Questions

None — scope is fully defined for this batch.

---

## Success Criteria

- [ ] `ClienteSelector` dropdown fully visible and usable on 320 px mobile viewport
- [ ] F12 inside `CobroModal` triggers `handleProcesar()` when `puedeProcesar === true`
- [ ] Overpayment split UI distributes change across ≥ 2 methods; sum === exact vuelto
- [ ] SAF selection creates `movimiento_cuenta tipo='SAF'`; client balance updates via existing DB trigger
- [ ] Absorbed differential creates `gastos` row with `supervisor_id` and `cajero_id`
- [ ] `+`/`−` buttons and key shortcuts work on desktop (keyboard) and touch (mobile)
