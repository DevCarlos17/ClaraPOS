# Tasks: pos-tesoreria-integration

_Date: 2026-07-05 | Change: pos-tesoreria-integration | Model: anthropic/claude-sonnet-4-6_

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~538 (adds + deletes) |
| 400-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Suggested split | PR 1 (Foundation + Hooks) → PR 2 (UI layer) |
| Delivery strategy | ask-always |
| Chain strategy | pending (user decision required) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Est. lines | Notes |
|------|------|-----------|------------|-------|
| 1 | Migration + schema + types + all hook logic | PR 1 | ~266 | No UI impact; safe foundation slice |
| 2 | All UI changes + new EnviarEfectivoACajaModal | PR 2 | ~272 | Depends on PR 1 merged |

**Chain strategy options to decide before apply:**
- `stacked-to-main` — PR 1 merges to main, PR 2 targets main. Simple, fast.
- `feature-branch-chain` — PR 1 and PR 2 target a `feature/pos-tesoreria-integration` tracker branch; only tracker merges to main.
- `size-exception` — single PR with maintainer approval.

---

## Phase 1 — Infrastructure

### TASK-001
- **title**: Create migration SQL for `sesion_caja_id` on `traspasos_tesoreria`
- **type**: migration
- **files**: `migrations/NNNN_traspasos_sesion_caja.sql`
- **depends_on**: —
- **estimated_lines**: 5
- **description**: Create SQL file with `ALTER TABLE traspasos_tesoreria ADD COLUMN IF NOT EXISTS sesion_caja_id TEXT REFERENCES sesiones_caja(id)`. No CHECK constraint needed on `cuenta_*_tipo` (column is plain TEXT — verified in design). Additive migration, zero-downtime.
- **verification**:
  - [ ] File created at `migrations/NNNN_traspasos_sesion_caja.sql`
  - [ ] SQL uses `ADD COLUMN IF NOT EXISTS` (idempotent)
  - [ ] Column is nullable (no DEFAULT, no NOT NULL)
  - [ ] References `sesiones_caja(id)` FK

---

### TASK-002
- **title**: Add `sesion_caja_id` to PowerSync schema `traspasos_tesoreria`
- **type**: schema
- **files**: `src/core/db/powersync/schema.ts`
- **depends_on**: TASK-001
- **estimated_lines**: 3
- **description**: In the `traspasos_tesoreria` Table definition (~line 881), add `sesion_caja_id: column.text` before `fecha`. Sync rules use `SELECT *` — no `powersync-sync-rules.yaml` change needed.
- **verification**:
  - [ ] `yarn type-check` passes
  - [ ] `sesion_caja_id` field is present in the `traspasos_tesoreria` Table definition

---

### TASK-003
- **title**: Add `sesion_caja_id` to Kysely `TraspasoTesoreria` interface
- **type**: types
- **files**: `src/core/db/kysely/types.ts`
- **depends_on**: —
- **estimated_lines**: 3
- **description**: In `TraspasoTesoreria` interface (~line 748), add `sesion_caja_id: string | null`. Update `origen` comment in `MovCajaFuerte` to note `doc_origen_tipo` now also accepts `'SESION_CAJA'`. No change to `MovimientosMetodoCobro` — `origen: string` already accepts new values.
- **verification**:
  - [ ] `yarn type-check` passes
  - [ ] `TraspasoTesoreria.sesion_caja_id` typed as `string | null`

---

## Phase 2 — Core Hooks (HIGH-RISK — deploy blocker)

> ⚠️ TASK-004 and TASK-008 are the two high-risk tasks identified in the design. They must be completed before any UI task can be deployed.

### TASK-004
- **title**: Extend `reversarTraspaso()` to support `SESION_CAJA` origin/destination
- **type**: hook
- **files**: `src/features/tesoreria/hooks/use-traspasos.ts`
- **depends_on**: TASK-002, TASK-003
- **estimated_lines**: 55
- **description**: In the reversal origin branch (~line 340), add `if (traspaso.cuenta_origen_tipo === 'SESION_CAJA')`: (1) READ `sesiones_caja` by `traspaso.sesion_caja_id` — ASSERT `status='ABIERTA'`, else throw `"No se puede reversar: sesión cerrada"`; (2) GET `metodo_cobro_id` from original `mov_origen`; (3) READ `saldo_actual` from `metodos_cobro`; (4) INSERT `movimientos_metodo_cobro` with `tipo='INGRESO'`, `origen='INGRESO_TESORERIA'` (no `REVERSO_TESORERIA` — design decision); (5) UPDATE `metodos_cobro.saldo_actual`. In the reversal destination branch (~line 397), add `if (traspaso.cuenta_destino_tipo === 'SESION_CAJA')`: same session-active check, validate session balance (no negative), INSERT `movimientos_metodo_cobro` with `tipo='EGRESO'`, `origen='EGRESO_TESORERIA'`.
- **verification**:
  - [ ] Reversal on traspaso with `SESION_CAJA` and session `CERRADA` throws error (no records written)
  - [ ] Reversal on traspaso with `SESION_CAJA` and session `ABIERTA` creates correct `movimientos_metodo_cobro` record
  - [ ] Existing `BANCO` and `CAJA_FUERTE` reversal paths untouched (`yarn type-check` passes)

---

### TASK-005
- **title**: Add `crearTraspasoSesionATesoreria()` to `use-traspasos.ts`
- **type**: hook
- **files**: `src/features/tesoreria/hooks/use-traspasos.ts`
- **depends_on**: TASK-004
- **estimated_lines**: 80
- **description**: Export function per design §3 signature. Inside `db.writeTransaction()`: (1) READ + ASSERT session `ABIERTA`; (2) validate session balance (EGRESO path — same logic as `createMovimientoManualMulti`); (3) READ `metodos_cobro.saldo_actual`, compute `saldoNuevoMc = saldo - monto`; (4) INSERT `movimientos_metodo_cobro` (`tipo=EGRESO`, `origen=EGRESO_TESORERIA`, `sesion_caja_id`); (5) UPDATE `metodos_cobro`; (6) READ `caja_fuerte.saldo_actual`, compute `saldoNuevoCf = saldo + monto`; (7) INSERT `mov_caja_fuerte` (`tipo=INGRESO`, `origen=TRASPASO`, `doc_origen_tipo=SESION_CAJA`, `validado=0`); (8) UPDATE `caja_fuerte`; (9) INSERT `traspasos_tesoreria` (`cuenta_origen_tipo=SESION_CAJA`, `sesion_caja_id`, `cuenta_destino_tipo=CAJA_FUERTE`). All records include `empresa_id` from params.
- **verification**:
  - [ ] 3 records created on success: `movimientos_metodo_cobro`, `mov_caja_fuerte`, `traspasos_tesoreria`
  - [ ] `mov_caja_fuerte.validado = 0` (pending — not auto-validated)
  - [ ] Session with balance < monto rejects before writing
  - [ ] Closed session rejects with error
  - [ ] All 3 records have `empresa_id` matching caller

---

### TASK-006
- **title**: Add `crearTraspasoTesoreriaASesion()` to `use-traspasos.ts`
- **type**: hook
- **files**: `src/features/tesoreria/hooks/use-traspasos.ts`
- **depends_on**: TASK-005
- **estimated_lines**: 70
- **description**: Export function per design §4 signature. Inside `db.writeTransaction()`: (1) READ + ASSERT session `ABIERTA`; (2) READ `caja_fuerte.saldo_actual` + ASSERT `saldo >= monto`; (3) compute `saldoNuevoCf = saldo - monto`; (4) INSERT `mov_caja_fuerte` (`tipo=EGRESO`, `origen=TRASPASO`, `doc_origen_tipo=SESION_CAJA`, `validado=0`); (5) UPDATE `caja_fuerte`; (6) READ `metodos_cobro.saldo_actual`, compute `saldoNuevoMc = saldo + monto`; (7) INSERT `movimientos_metodo_cobro` (`tipo=INGRESO`, `origen=INGRESO_TESORERIA`, `sesion_caja_id`); (8) UPDATE `metodos_cobro`; (9) INSERT `traspasos_tesoreria` (`cuenta_origen_tipo=CAJA_FUERTE`, `cuenta_destino_tipo=SESION_CAJA`, `sesion_caja_id`).
- **verification**:
  - [ ] 3 records created: `mov_caja_fuerte`, `movimientos_metodo_cobro`, `traspasos_tesoreria`
  - [ ] `movimientos_metodo_cobro.origen = 'INGRESO_TESORERIA'`
  - [ ] Caja fuerte saldo < monto rejects before writing
  - [ ] Closed session rejects

---

### TASK-007
- **title**: Extend `useTraspasos()` enrichment and `Traspaso` interface for `SESION_CAJA`
- **type**: hook
- **files**: `src/features/tesoreria/hooks/use-traspasos.ts`
- **depends_on**: TASK-006
- **estimated_lines**: 25
- **description**: Add `sesion_caja_id: string | null` to `Traspaso` interface (~line 10). In `useTraspasos()` enrichment, add query: `SELECT sc.id, c.nombre AS caja_nombre, u.nombre AS usuario_nombre FROM sesiones_caja sc LEFT JOIN cajas c ON sc.caja_id = c.id LEFT JOIN usuarios u ON sc.usuario_apertura_id = u.id WHERE sc.empresa_id = ?`. Build `sesionMap`. In `nombre_origen`/`nombre_destino` resolution, add `SESION_CAJA` branch returning `'{usuario_nombre} · {caja_nombre}'`.
- **verification**:
  - [ ] Traspasos with `SESION_CAJA` show readable name in Tesorería list
  - [ ] `Traspaso` interface includes `sesion_caja_id`
  - [ ] `yarn type-check` passes

---

### TASK-008
- **title**: Extend `useSaldoSesionCaja` to include `EGRESO_TESORERIA` and `INGRESO_TESORERIA`
- **type**: hook
- **files**: `src/features/caja/hooks/use-sesiones-caja.ts`
- **depends_on**: TASK-002, TASK-003
- **estimated_lines**: 25
- **description**: Line ~220 — extend the IN clause from `('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO')` to also include `'EGRESO_TESORERIA'`, `'INGRESO_TESORERIA'`. Lines ~244-261 — add `egrTesoUsd/Bs` and `ingTesoUsd/Bs` Decimal variables. Update saldo formula: `saldoUsd = apertura + ventas + ingManual + ingTeso - egrManual - avances - prestamos - egrTeso`. No `REVERSO_TESORERIA` origin — reversals reuse `INGRESO_TESORERIA`/`EGRESO_TESORERIA` per architecture decision.
- **verification**:
  - [ ] Session with `apertura=$100 + INGRESO_TESORERIA=$50` → `useSaldoSesionCaja` returns saldo=$150
  - [ ] Session with `EGRESO_TESORERIA=$30` → saldo decreases by $30
  - [ ] Sessions with no tesorería movimientos unaffected (backward-compatible)

---

## Phase 3 — UI Changes

### TASK-009
- **title**: Remove `BANCO` tab from `avance-modal.tsx`
- **type**: ui-change
- **files**: `src/features/caja/components/avance-modal.tsx`
- **depends_on**: —
- **estimated_lines**: 12
- **description**: (1) Remove `Bank` from Phosphor import (line 3). (2) Update `OrigenFondos` type to `'CAJA' | 'EFECTIVO_EMPRESA'` (line 17). (3) Remove `{ key: 'BANCO', label: 'Banco', Icon: Bank }` from orígenes array (lines 299-303). (4) Simplify conditional filter (lines 328-358): remove BANCO branch — filter always uses `tipo === 'CAJA_FUERTE'` since only EFECTIVO_EMPRESA remains.
- **verification**:
  - [ ] AvanceModal renders with only CAJA and EFECTIVO_EMPRESA tabs
  - [ ] No "Banco" option visible in any form
  - [ ] Existing CAJA and EFECTIVO_EMPRESA behavior unchanged
  - [ ] `yarn type-check` passes (no `Bank` or `BANCO` references remain)

---

### TASK-010
- **title**: Add `cuentas` prop and traspaso mode to `ingreso-retiro-modal.tsx`
- **type**: ui-change
- **files**: `src/features/caja/components/ingreso-retiro-modal.tsx`
- **depends_on**: TASK-005
- **estimated_lines**: 65
- **description**: Add `cuentas?: CuentaTesoreria[]` to `IngresoRetiroModalProps`. Add `traspasoMode: boolean` + `selectedCajaFuerteId: string` state. In RETIRO mode only, after "Concepto" textarea: render checkbox "Traspaso a Tesorería"; when checked, render caja fuerte selector from `cuentas` filtered to matching currency. When `traspasoMode=true`: disable the non-matching currency input with label "Solo {USD|Bs} — moneda de la caja fuerte seleccionada". On submit with `traspasoMode`: call `crearTraspasoSesionATesoreria()` instead of `createMovimientoManualMulti`. On success, close modal + toast.success.
- **verification**:
  - [ ] INGRESO mode: no traspaso checkbox visible
  - [ ] RETIRO mode: checkbox "Traspaso a Tesorería" visible
  - [ ] Checking traspaso shows caja fuerte selector and disables non-matching currency
  - [ ] Submitting traspaso calls `crearTraspasoSesionATesoreria` and creates 3 records
  - [ ] Modal without `cuentas` prop (undefined) still works (traspaso section hidden)

---

### TASK-011
- **title**: Add post-close toast in `sesion-caja-form.tsx`
- **type**: ui-change
- **files**: `src/features/caja/components/sesion-caja-form.tsx`
- **depends_on**: —
- **estimated_lines**: 5
- **description**: Line 475 — after `toast.success('Sesion de caja cerrada exitosamente')`, add: `toast.info('Recuerda depositar el efectivo a la cuenta de Tesorería correspondiente', { duration: 8000 })`. Non-blocking, auto-dismiss 8s. Uses Sonner `info` variant.
- **verification**:
  - [ ] Successful close shows info toast after success toast
  - [ ] Failed close shows no info toast
  - [ ] Info toast auto-dismisses (does not require user interaction)

---

### TASK-012
- **title**: Create `enviar-efectivo-a-caja-modal.tsx` (Tesorería → Sesión)
- **type**: component
- **files**: `src/features/tesoreria/components/enviar-efectivo-a-caja-modal.tsx`
- **depends_on**: TASK-006
- **estimated_lines**: 150
- **description**: New exported component `EnviarEfectivoACajaModal`. Props: `isOpen`, `onClose`, `cuentas: CuentaTesoreria[]`. Internal: inline hook querying `sesiones_caja JOIN cajas JOIN usuarios WHERE empresa_id=? AND status='ABIERTA' ORDER BY fecha_apertura DESC` (or export from `use-sesiones-caja.ts`). Form: (1) caja fuerte origen selector — shows `[{moneda}] {nombre} — Saldo: {saldo_actual}`; (2) sesión destino selector — shows `{usuario_nombre} · {caja_nombre} · {formatDateTime(fecha_apertura)}`; (3) monto input (currency from selected caja fuerte); (4) observación textarea (optional). Empty state when no sessions with button disabled. Submit calls `crearTraspasoTesoreriaASesion()` with `metodo_cobro_id` from `useMetodosPagoActivos()` matching currency. Add trigger button "Enviar efectivo a caja" in Tesorería view alongside existing action buttons. All queries filter by `empresa_id`.
- **verification**:
  - [ ] Modal renders with caja fuerte selector and session selector
  - [ ] Empty state when no `status='ABIERTA'` sessions: confirm button disabled
  - [ ] Submit creates 3 records: `mov_caja_fuerte`, `movimientos_metodo_cobro`, `traspasos_tesoreria`
  - [ ] `movimientos_metodo_cobro.origen = 'INGRESO_TESORERIA'`
  - [ ] Only sessions from same `empresa_id` appear in selector
  - [ ] Session closed between selection and confirm → error, no records written

---

### TASK-013
- **title**: Add `INGRESO_TESORERIA` / `EGRESO_TESORERIA` expandable rows to `cuadre-saldo-caja.tsx`
- **type**: ui-change
- **files**: `src/features/reportes/components/cuadre-saldo-caja.tsx`
- **depends_on**: TASK-008
- **estimated_lines**: 30
- **description**: Add `'ing-teso' | 'egr-teso'` to `ExpandedRow` union type. After "Ingresos manuales" expandable row (~line 117): compute `ingTesoUsd/Bs` via `sumMovs(['INGRESO_TESORERIA'], ...)` and render `ExpandableRow sign="+" label="Ingresos de Tesorería"` with badge distinguishing it from manual ingresos. After "Retiros manuales" row (~line 152): compute `egrTesoUsd/Bs` and render `ExpandableRow sign="-" label="Traspasos a Tesorería"`. Detail rows use `.filter(m => m.origen === 'INGRESO_TESORERIA')` / `'EGRESO_TESORERIA'` — works because `useMovimientosEfectivoCaja` returns all movimientos without filtering.
- **verification**:
  - [ ] Session with `INGRESO_TESORERIA` shows "Ingresos de Tesorería" row with correct amount
  - [ ] Session with `EGRESO_TESORERIA` shows "Traspasos a Tesorería" row with correct amount
  - [ ] Session without tesorería movimientos shows no new rows (backward-compatible)
  - [ ] Badge visually distinguishes INGRESO_TESORERIA from INGRESO_MANUAL

---

### TASK-014
- **title**: Include `INGRESO_TESORERIA` in arqueo teórico filter in `cuadre-page.tsx`
- **type**: ui-change
- **files**: `src/features/reportes/components/cuadre-page.tsx`
- **depends_on**: TASK-008
- **estimated_lines**: 5
- **description**: Line 172 — extend `ingresosEfectivoUsd` filter from `m.origen === 'INGRESO_MANUAL'` to `(m.origen === 'INGRESO_MANUAL' || m.origen === 'INGRESO_TESORERIA')`. This ensures the Arqueo Teórico section accounts for tesorería inflows in the theoretical cash calculation.
- **verification**:
  - [ ] After INGRESO_TESORERIA traspaso, "Arqueo Teórico" includes that amount in efectivo USD
  - [ ] Sessions with only INGRESO_MANUAL unaffected

---

### TASK-015
- **title**: Pass `cuentas` prop to `IngresoRetiroModal` in pos-terminal route
- **type**: integration
- **files**: `src/routes/_app/ventas/` (pos-terminal route file)
- **depends_on**: TASK-010
- **estimated_lines**: 5
- **description**: Find `<IngresoRetiroModal>` render in the pos-terminal route. The proposal confirms `useCuentasTesoreria()` is already called in `pos-terminal.tsx`. Pass the result as `cuentas={cuentas}` prop. No new hook calls needed — just thread the existing value through.
- **verification**:
  - [ ] `IngresoRetiroModal` in POS receives `cuentas` prop (no TypeScript error)
  - [ ] RETIRO mode in POS shows "Traspaso a Tesorería" checkbox
  - [ ] `yarn type-check` passes

---

## Task Dependency Graph

```
TASK-001 (migration)
  └─ TASK-002 (schema) ──────────────────────────────────────────┐
                                                                  ├─ TASK-008 (saldo hook) → TASK-013, TASK-014
TASK-003 (types) ─────────────────────────────────────────────────┘

TASK-002 + TASK-003
  └─ TASK-004 (reversarTraspaso) [HIGH RISK — deploy blocker]
       └─ TASK-005 (crearSesionATesoreria)
            └─ TASK-006 (crearTesoreriaASesion)
                 └─ TASK-007 (useTraspasos enrichment)
                      └─ TASK-012 (EnviarEfectivoACajaModal)

TASK-005 → TASK-010 (IngresoRetiroModal) → TASK-015 (pos-terminal)
TASK-009 (avance-modal) — independent
TASK-011 (sesion-caja-form toast) — independent
```

---

## Review Workload Forecast

Total estimated lines: ~538
400-line budget risk: High
Chained PRs recommended: Yes
Natural PR boundary (if chained): PR 1 = TASK-001→008 (foundation + hooks, ~266 lines); PR 2 = TASK-009→015 (UI layer, ~272 lines)
Decision needed before apply: Yes
