# Tasks: POS Mejoras de Cobro

_Date: 2026-06-01 | Change: pos-mejoras-cobro | Model: anthropic/claude-sonnet-4-6_

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~348 (333 frontend + 15 SQL migration file) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (3 ordered batches) |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 — Batch 1 | Isolated UI + permission slug (~46 lines) | PR 1 | No dependencies; safe to merge first |
| 2 — Batch 2 | CobroModal state machine + discrepancy UI (~200 lines) | PR 1 | Needs PERMISSIONS slug from Batch 1 |
| 3 — Batch 3 | Data layer: use-ventas extensions + SQL file (~120 lines) | PR 1 | Needs DiscrepancyOptions types from Batch 2 |

---

## TASK-001: ClienteSelector — fixed dropdown positioning

**Batch**: 1
**Files**: `src/features/ventas/components/cliente-selector.tsx`
**REQs covered**: REQ-001
**Depends on**: none
**Description**: Add `useLayoutEffect` to React import. Add `dropdownStyle` state (`useState<React.CSSProperties>({})`). Copy the position-update pattern from `producto-buscador.tsx` lines 101–115: `useLayoutEffect` computing `{top, left, width}` via `inputRef.current.getBoundingClientRect()`, registering `scroll` (capture) + `resize` listeners, cleaning up on unmount. Activate when `dropdownVisible = open && query.trim().length >= 2`. Replace dropdown container class `absolute z-50 mt-1 w-full` with `fixed z-[9999]`; add `style={dropdownStyle}` inline.
**Acceptance check**: DevTools mobile 320px emulator → tap ClienteSelector inside CobroModal → dropdown fully visible, not clipped by any modal or stacking context. Scroll parent while open → dropdown stays aligned to input.
**Est. lines**: 15

---

## TASK-002: LineaItems — +/− buttons and keyboard +/− capture

**Batch**: 1
**Files**: `src/features/ventas/components/linea-items.tsx`
**REQs covered**: REQ-003
**Depends on**: none
**Description**: Add `increment(index)` and `decrement(index)` helpers inside the component. `decrement` clamps: no-op when `cantidad <= 1` (integer) or `cantidad <= 0.001` (decimal). Wrap quantity `<input>` in a flex div `[−] [input] [+]` in BOTH render paths (compact: ~lines 84–111; full: ~lines 200–228). Update `onKeyDown` on the input: key `+` → `increment`, key `−` → `decrement` (replaces existing block that only prevented the key), `Enter` → `onCantidadEnter?.()`, decimal/comma blocked for non-decimal products. `−` button: disabled when already at minimum quantity.
**Acceptance check**: Click `−` at qty=1 → stays 1. Press `+` key with focus on qty input at qty=3 → qty becomes 4. Press `−` key at qty=1 → stays 1. Both compact and full row layouts updated identically.
**Est. lines**: 30

---

## TASK-003: Add SALES_ABSORB_DIFFERENTIAL permission slug

**Batch**: 1
**Files**: `src/core/hooks/use-permissions.ts`
**REQs covered**: REQ-008
**Depends on**: none
**Description**: Inside the `PERMISSIONS` `as const` object, add `SALES_ABSORB_DIFFERENTIAL: 'ventas.absorber_diferencial'` after the existing `SALES_VOID` entry (after line 8). No other changes to the file.
**Acceptance check**: `PERMISSIONS.SALES_ABSORB_DIFFERENTIAL === 'ventas.absorber_diferencial'` — TypeScript compiles without error. No existing permission keys are displaced or overwritten.
**Est. lines**: 1

---

## TASK-004: CobroModal — state variables, derived logic, keyboard handler

**Batch**: 2
**Files**: `src/features/ventas/components/cobro-modal.tsx`
**REQs covered**: REQ-002, REQ-004
**Depends on**: TASK-003
**Description**:
1. Add local types near top of file: `OverpaymentMode = 'VUELTO' | 'SAF' | 'PROPINA' | 'DIFERENCIAL_SOBRANTE'`, `UnderpaymentMode = 'CREDITO' | 'ABSORBER' | 'DIFERENCIAL_FALTANTE'`, `DiscrepancyMode = OverpaymentMode | UnderpaymentMode | null`, and `SplitVueltoEntry { metodo_cobro_id, metodo_nombre, moneda, monto }`.
2. Add 5 state/ref vars after existing state block: `umbralRef = useRef<number>(0)`, `discrepancyMode`, `splitVuelto: SplitVueltoEntry[]`, `supervisorPinOpen`, `supervisorId: string | null`.
3. Extend `isOpen` useEffect (lines 71–82): compute `umbralRef.current = Math.min(0.50, totalEfectivoUsd * 0.01)` on open; reset all 4 new state vars.
4. After line 131, add computed values: `vueltoUsd` (overpayment in USD), `isAutoResolvable` (boolean for below-threshold), `effectiveMode` (derived `DiscrepancyMode` per design §State Design — auto-routes below threshold, user-selected above).
5. Replace `puedeProcesar` (lines 147–153) with enhanced version: VUELTO checks splitSum ±$0.01; SAF requires `clienteId`; ABSORBER requires `supervisorId`; DIFERENCIAL/PROPINA always true.
6. Add `handleProcesarRef = useRef(handleProcesar)` pattern. Add `useEffect` keyboard handler on `document` (capture phase): fires only when `isOpen && !supervisorPinOpen && !submitting && puedeProcesar`; key is `F12` or `Enter`; focus tag is NOT `INPUT/TEXTAREA/SELECT`; calls `handleProcesarRef.current()`.
**Acceptance check**: TypeScript compiles. F12 on modal backdrop with `puedeProcesar=true` → calls `handleProcesar` once. F12 blocked when `supervisorPinOpen=true`. F12 blocked when focus is inside an amount input. `effectiveMode === 'DIFERENCIAL_SOBRANTE'` for $0.10 overpay on $50 sale (umbral=$0.50).
**Est. lines**: 80

---

## TASK-005: CobroModal — discrepancy resolution panel UI + handleProcesar wiring

**Batch**: 2
**Files**: `src/features/ventas/components/cobro-modal.tsx`
**REQs covered**: REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010
**Depends on**: TASK-004
**Description**:
1. Add imports: `SupervisorPinDialog` from `@/components/ui/supervisor-pin-dialog`; `PERMISSIONS` from `@/core/hooks/use-permissions`.
2. Replace existing vuelto section (lines 484–516) with DiscrepancyPanel JSX block: (a) header showing sobrante/faltante amount; (b) auto-resolved info label when `isAutoResolvable`; (c) overpayment radio group (VUELTO / SAF only when `clienteId` present / PROPINA) visible when `estaOverpago && !isAutoResolvable`; (d) split vuelto table when `effectiveMode === 'VUELTO'` — one editable row per cash-method entry in `pagos`, auto-initialized, sum mismatch shows error indicator; (e) underpayment radio group (CREDITO always / ABSORBER when `pendienteUsd <= 2.0`) visible when `!estaOverpago && pendienteUsd > umbralRef.current`; ABSORBER option calls `setSupervisorPinOpen(true)` on click; shows green "Autorizado" badge when `supervisorId` is set.
3. Add `<SupervisorPinDialog>` before `</DialogContent>`: `isOpen={supervisorPinOpen}`, `onAuthorized={(id) => { setSupervisorId(id); setSupervisorPinOpen(false) }}`, `requiredPermission={PERMISSIONS.SALES_ABSORB_DIFFERENTIAL}`.
4. Modify `handleProcesar` to build `discrepancy: DiscrepancyOptions` from `effectiveMode` + relevant state, and `vuelto: VueltoParam[]` from `splitVuelto` (empty array when mode is not VUELTO), then pass both to `crearVenta()`.
**Acceptance check**: $0.10 overpay/$50 sale → auto label only (no radios). $1.00 overpay/$50 sale → VUELTO/SAF/PROPINA radios. $1.50 underpay → CREDITO+ABSORBER. $3.00 underpay → CREDITO only. Split sum mismatch → `puedeProcesar = false`. SupervisorPinDialog opens when ABSORBER clicked.
**Est. lines**: 120

---

## TASK-006: use-ventas.ts — DiscrepancyOptions, VueltoParam[] loop, discrepancy inserts

**Batch**: 3
**Files**: `src/features/ventas/hooks/use-ventas.ts`
**REQs covered**: REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010
**Depends on**: TASK-005
**Description**:
1. Export `DiscrepancyOptions` interface (after `VueltoParam`, ~line 82): `mode: DiscrepancyMode`, `montoUsd: number`, `metodo_cobro_id?: string` (for PROPINA/DIFERENCIAL_SOBRANTE), `safClienteId?: string`, `cajeroId: string`, `supervisorId?: string`.
2. Change `CrearVentaParams.vuelto` from `VueltoParam` to `VueltoParam[]`; add `discrepancy?: DiscrepancyOptions`.
3. Replace single vuelto insert with `for...of` loop over `vuelto` array (skip entries with `monto <= 0.005`).
4. Add discrepancy switch block as step 5c (after vuelto loop, inside `db.writeTransaction()`): SAF → `INSERT movimientos_cuenta tipo='SAF'` + `UPDATE clientes.saldo_actual`; ABSORBER → `INSERT gastos descripcion='ABSORCION_DIFERENCIAL_POS'` (with `observaciones` carrying supervisor/cajero/venta IDs); DIFERENCIAL_FALTANTE → `INSERT gastos descripcion='DIFERENCIAL_CAMBIARIO_FALTANTE'`; PROPINA → `INSERT movimientos_metodo_cobro INGRESO PROPINA` on `metodo_cobro_id`; DIFERENCIAL_SOBRANTE → `INSERT movimientos_metodo_cobro INGRESO DIFERENCIAL_CAMBIARIO` on `metodo_cobro_id`.
5. After existing `saldoPend` computation, add: `if (discrepancy?.mode === 'ABSORBER' || discrepancy?.mode === 'DIFERENCIAL_FALTANTE') saldoPend = 0` — before the `UPDATE ventas SET saldo_pend_usd` call.
**Acceptance check**: TypeScript compiles; no type errors at `crearVenta()` call site in `cobro-modal.tsx`. `vuelto: [e1, e2]` inserts 2 EGRESO VUELTO rows. `discrepancy: { mode: 'SAF', ... }` inserts 1 `movimientos_cuenta` row with `tipo='SAF'`. `discrepancy: { mode: 'ABSORBER', ... }` inserts `gastos` with `descripcion='ABSORCION_DIFERENCIAL_POS'` and `venta.saldo_pend_usd=0`.
**Est. lines**: 120

---

## TASK-007: SQL migration — ventas.absorber_diferencial permission

**Batch**: 3
**Files**: `migrations/XXXX_add_absorber_diferencial_permission.sql` _(new file — backend coordination, NOT part of the frontend PR)_
**REQs covered**: REQ-008
**Depends on**: none _(apply in Supabase SQL Editor **before** deploying TASK-005 to production)_
**Description**: Create SQL migration file with: (1) `INSERT INTO permisos` for `slug='ventas.absorber_diferencial'`, `nombre='Absorber diferencial POS'`, `modulo='ventas'`; (2) `INSERT INTO rol_permisos` joining all supervisor roles (`is_system=0 AND nombre ILIKE '%supervisor%'`) to the new permiso via `CROSS JOIN`. Add comment: Propietario roles bypass via `is_system=1` — no explicit `rol_permisos` row needed. Document that `SupervisorPinDialog` performs the runtime check against `rol_permisos`.
**Acceptance check**: SQL executes without error. `SELECT * FROM permisos WHERE slug = 'ventas.absorber_diferencial'` returns 1 row. Each supervisor role has a matching row in `rol_permisos`. Propietario users unaffected.
**Est. lines**: 15

---

## Implementation Order

```
TASK-001  ──┐
TASK-002  ──┤── Batch 1 (no deps, ~46 lines)
TASK-003  ──┘
              ↓
TASK-004  ──┐── Batch 2 (depends on TASK-003, ~80 lines)
TASK-005  ──┘── Batch 2 (depends on TASK-004, ~120 lines)
              ↓
TASK-006  ──── Batch 3 (depends on TASK-005, ~120 lines)
TASK-007  ──── Batch 3 (independent SQL, ~15 lines)
```

Batches 1–3 are ordered by dependency. Within Batch 1, tasks are independent and can be applied in any order (or in a single focused pass). SQL migration (TASK-007) must reach the database before TASK-005 is deployed to production — it does not block the frontend PR itself.
