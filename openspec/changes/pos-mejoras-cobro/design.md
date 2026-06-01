# Design: POS Mejoras de Cobro

_Date: 2026-06-01 | Change: pos-mejoras-cobro | Model: anthropic/claude-opus-4-6_

---

## Technical Approach

Six frontend-only changes within `src/features/ventas/`. The central piece is a discrepancy resolution state machine inside `CobroModal` that routes overpayment/underpayment through a threshold-based decision tree. All new DB writes execute within the existing `db.writeTransaction()` in `crearVenta()`. No schema migrations — new `gastos` and `movimientos_cuenta` rows use existing columns with new value conventions.

Maps to proposal approach items 1–6. Implements REQ-001 through REQ-010 from spec.

---

## Architecture Decisions

### Decision: State machine approach

**Choice**: Derived state from `pendienteBs4` + `umbralRef` + user-selected `discrepancyMode`, computed inline — not `useReducer`.
**Alternatives**: `useReducer` with explicit state transitions; external state machine lib (XState).
**Rationale**: CobroModal already uses ~6 `useState` calls with derived computations. Adding a reducer would be an architectural departure from the file's existing pattern. The discrepancy mode is a single radio selection with one auto-override path — not complex enough to justify a state machine library.

### Decision: Split vuelto as VueltoParam array

**Choice**: Change `crearVenta` param `vuelto` from `VueltoParam | undefined` to `VueltoParam[] | undefined`.
**Alternatives**: Keep single vuelto + add separate `splitVuelto` param; create new `VueltoSplit` type.
**Rationale**: The single-entry case is just an array of length 1. The write loop in `crearVenta` already inserts one row — it naturally extends to a `for` loop. Minimal interface change, zero semantic confusion.

### Decision: Gastos table for absorption records

**Choice**: Insert into `gastos` with `descripcion` as concept discriminator ('ABSORCION_DIFERENCIAL_POS' / 'DIFERENCIAL_CAMBIARIO_FALTANTE'). Store `supervisor_id` in `observaciones` as structured text (e.g. `supervisor:{id}`). Use `created_by` for cajero_id.
**Alternatives**: New dedicated table; JSON column; separate `concepto` column.
**Rationale**: The `gastos` table has `descripcion` (text), `observaciones` (text), and `created_by` (text) — sufficient for audit trail without migration. Reports can filter by `descripcion LIKE 'ABSORCION_%'` or `descripcion LIKE 'DIFERENCIAL_%'` to separate POS absorptions from regular expenses. Adding columns would require a migration, explicitly out of scope.

### Decision: Discrepancy panel replaces existing vuelto section

**Choice**: Replace the existing vuelto UI block (cobro-modal.tsx lines 484–516) with the new discrepancy resolution panel that includes vuelto-split as one option.
**Alternatives**: Add a separate panel below existing vuelto section.
**Rationale**: The existing vuelto section becomes one of several overpayment options (VUELTO / SAF / PROPINA / DIFERENCIAL). Keeping both would create duplicate UI for the VUELTO path. Replacing the section consolidates all discrepancy handling into one location.

### Decision: F12/Enter handler via document keydown + ref

**Choice**: `useEffect` with `document.addEventListener('keydown', handler)` guarded by `isOpen`, `puedeProcesar`, `supervisorPinOpen`, and `activeElement` tag check. Use `useRef` for `handleProcesar` to avoid stale closure.
**Alternatives**: onKeyDown on DialogContent; global keyboard shortcut hook.
**Rationale**: `Dialog` (Radix) traps focus but doesn't expose a global keydown prop. The `document` listener with guards matches how `pos-terminal.tsx` handles F-key shortcuts at the page level. The ref pattern avoids re-registering the listener on every render while keeping the handler current.

---

## Data Flow

```
CobroModal (pagos state)
    │
    ├── computes: pendienteBs4, estaOverpago, vueltoUsd
    │
    ├── computes: umbral = min(0.50, totalEfectivoUsd × 0.01) [ref, set once on open]
    │
    ├── derives: effectiveMode
    │     ├── pendienteUsd ≤ umbral → DIFERENCIAL_FALTANTE (auto)
    │     ├── vueltoUsd ≤ umbral   → DIFERENCIAL_SOBRANTE (auto)
    │     └── above threshold       → user-selected discrepancyMode
    │
    ├── UI: DiscrepancyPanel (radio options based on effectiveMode routing)
    │     ├── VUELTO → SplitVueltoTable (one row per cash method)
    │     ├── SAF → info label (requires clienteId)
    │     ├── PROPINA → info label
    │     ├── ABSORBER → SupervisorPinDialog trigger
    │     └── CREDITO → default (existing behavior)
    │
    └── on Procesar ──→ crearVenta(params + discrepancy + vuelto[])
                            │
                            ├── [existing] venta + detalles + kardex + pagos
                            │
                            ├── [modified] vuelto loop (VueltoParam[])
                            │   └── N × INSERT movimientos_metodo_cobro (EGRESO, VUELTO)
                            │
                            ├── [new] discrepancy switch:
                            │   ├── SAF → INSERT movimientos_cuenta (tipo='SAF', monto, saldo snapshots)
                            │   │       → UPDATE clientes.saldo_actual (decrease)
                            │   │
                            │   ├── ABSORBER → INSERT gastos (ABSORCION_DIFERENCIAL_POS)
                            │   │            → force saldo_pend_usd = 0
                            │   │
                            │   ├── DIFERENCIAL_FALTANTE → INSERT gastos (DIFERENCIAL_CAMBIARIO_FALTANTE)
                            │   │                        → force saldo_pend_usd = 0
                            │   │
                            │   ├── PROPINA → INSERT movimientos_metodo_cobro (INGRESO, PROPINA)
                            │   │
                            │   └── DIFERENCIAL_SOBRANTE → INSERT movimientos_metodo_cobro (INGRESO, DIFERENCIAL_CAMBIARIO)
                            │
                            └── [modified] saldo_pend_usd: forced to 0 for ABSORBER/DIFERENCIAL_FALTANTE
```

---

## State Design

### New types (cobro-modal.tsx)

```typescript
type OverpaymentMode = 'VUELTO' | 'SAF' | 'PROPINA' | 'DIFERENCIAL_SOBRANTE'
type UnderpaymentMode = 'CREDITO' | 'ABSORBER' | 'DIFERENCIAL_FALTANTE'
type DiscrepancyMode = OverpaymentMode | UnderpaymentMode | null

interface SplitVueltoEntry {
  metodo_cobro_id: string
  metodo_nombre: string
  moneda: 'USD' | 'BS'
  monto: number
}
```

### New state variables (inside CobroModal component)

```typescript
const umbralRef = useRef<number>(0)
const [discrepancyMode, setDiscrepancyMode] = useState<DiscrepancyMode>(null)
const [splitVuelto, setSplitVuelto] = useState<SplitVueltoEntry[]>([])
const [supervisorPinOpen, setSupervisorPinOpen] = useState(false)
const [supervisorId, setSupervisorId] = useState<string | null>(null)
```

### Threshold computation (inside existing isOpen useEffect)

```typescript
useEffect(() => {
  if (!isOpen) return
  // ... existing freeze logic (lines 73–79) ...
  umbralRef.current = Math.min(0.50, totalEfectivoUsd * 0.01)
  setDiscrepancyMode(null)
  setSplitVuelto([])
  setSupervisorId(null)
  setSupervisorPinOpen(false)
}, [isOpen])
```

Note: `totalEfectivoUsd` depends on `totalBrutoUsd`, `descuentoBs`, and `tasaUsada` — all available at open time. The threshold MUST NOT be recomputed as payments are added (per REQ-004 AC1).

### Effective mode derivation (computed, not state)

```typescript
const umbral = umbralRef.current
const vueltoUsd = estaOverpago ? Number((vueltoMontoBs / tasaUsada).toFixed(2)) : 0

// Below-threshold auto-resolution
const isAutoResolvable =
  (estaOverpago && vueltoUsd > 0.001 && vueltoUsd <= umbral) ||
  (!estaOverpago && pendienteUsd > 0.001 && pendienteUsd <= umbral)

const effectiveMode: DiscrepancyMode = (() => {
  // Balanced: no discrepancy panel
  if (!estaOverpago && pendienteUsd <= 0.001) return null
  if (estaOverpago && vueltoUsd <= 0.001) return null

  // Below threshold: auto-resolve (user cannot override)
  if (estaOverpago && vueltoUsd <= umbral) return 'DIFERENCIAL_SOBRANTE'
  if (!estaOverpago && pendienteUsd <= umbral) return 'DIFERENCIAL_FALTANTE'

  // Above threshold: user-selected (with default)
  if (estaOverpago && !discrepancyMode) return 'VUELTO'  // default for overpay
  if (!estaOverpago && !discrepancyMode) return 'CREDITO' // default for underpay
  return discrepancyMode
})()
```

### Enhanced puedeProcesar

```typescript
const puedeProcesar = (() => {
  const hasPagos = pagos.length > 0

  // Balanced or overpaid: need discrepancy resolved
  if (estaOverpago && hasPagos) {
    switch (effectiveMode) {
      case 'VUELTO': {
        // Split sum must match vueltoUsd within tolerance
        const splitSumUsd = splitVuelto.reduce((s, e) =>
          s + (e.moneda === 'BS' ? e.monto / tasaUsada : e.monto), 0)
        if (Math.abs(splitSumUsd - vueltoUsd) > 0.01) return false
        return true
      }
      case 'SAF':
        return !!clienteId // SAF requires client
      case 'PROPINA':
      case 'DIFERENCIAL_SOBRANTE':
        return true
      default:
        return false
    }
  }

  // Underpaid with absorption authorized
  if (effectiveMode === 'ABSORBER') {
    return hasPagos && !!supervisorId
  }

  // Auto-resolved shortfall
  if (effectiveMode === 'DIFERENCIAL_FALTANTE') {
    return hasPagos
  }

  // Existing logic for CREDITO and CONTADO
  return (
    (hasPagos && esPagado) ||
    (tipoDetectado === 'CREDITO' && hasPagos) ||
    (tipoDetectado === 'CREDITO' && pagos.length === 0 && !!clienteId)
  )
})()
```

### Keyboard handler (F12/Enter)

```typescript
const handleProcesarRef = useRef(handleProcesar)
handleProcesarRef.current = handleProcesar

useEffect(() => {
  if (!isOpen) return
  const handler = (e: KeyboardEvent) => {
    if (supervisorPinOpen) return
    if (submitting) return
    if (e.key !== 'F12' && e.key !== 'Enter') return

    // Don't fire when focus is in an interactive input
    const tag = (document.activeElement as HTMLElement)?.tagName?.toUpperCase()
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    if (!puedeProcesar) return

    e.preventDefault()
    e.stopPropagation()
    void handleProcesarRef.current()
  }
  document.addEventListener('keydown', handler, true) // capture phase
  return () => document.removeEventListener('keydown', handler, true)
}, [isOpen, puedeProcesar, supervisorPinOpen, submitting])
```

---

## Component Changes

### 1. `src/features/ventas/components/cobro-modal.tsx` — Major

**New imports:**
- `SupervisorPinDialog` from `@/components/ui/supervisor-pin-dialog`
- `PERMISSIONS` from `@/core/hooks/use-permissions`
- `useMemo` (if not already imported — currently not)

**State additions (after line 68):**
- `umbralRef`, `discrepancyMode`, `splitVuelto`, `supervisorPinOpen`, `supervisorId` as designed above.

**isOpen useEffect (line 71–82) — extend:**
- Add threshold computation and reset for new state variables.

**Derived computations (after line 131):**
- `vueltoUsd`: overpayment in USD equivalent
- `isAutoResolvable`: boolean for below-threshold routing
- `effectiveMode`: the resolved DiscrepancyMode
- Replace existing `puedeProcesar` (line 147–153) with enhanced version

**Replace vuelto section (lines 484–516) with Discrepancy Resolution Panel:**

Structure:
```
{effectiveMode && pagos.length > 0 && (
  <div className="px-5 py-3 border-b shrink-0">
    {/* Header: shows discrepancy amount */}
    <p>Sobrante/Faltante: {amount}</p>

    {/* Auto-resolved (below threshold) — informational label only */}
    {isAutoResolvable && (
      <p className="text-xs text-muted-foreground">
        Diferencial cambiario — se registra automáticamente
      </p>
    )}

    {/* Overpayment options (above threshold) */}
    {estaOverpago && !isAutoResolvable && (
      <div className="space-y-1.5 mt-2">
        <label><input type="radio" ... /> Dar vuelto</label>
        {clienteId && <label><input type="radio" ... /> Acreditar en cuenta (SAF)</label>}
        <label><input type="radio" ... /> Propina</label>
      </div>
    )}

    {/* Split vuelto table (when VUELTO selected) */}
    {effectiveMode === 'VUELTO' && (
      /* One row per cash-capable method in pagos, editable amount input */
      /* Auto-initialized: all methods that received cash payments */
      /* Validation: sum indicator, error if |sum - vueltoUsd| > 0.01 */
    )}

    {/* Underpayment options (above threshold) */}
    {!estaOverpago && pendienteUsd > umbral && (
      <div className="space-y-1.5 mt-2">
        <label><input type="radio" ... /> Dejar a crédito</label>
        {pendienteUsd <= 2.0 && (
          <label><input type="radio" ... /> El negocio asume (PIN supervisor)</label>
        )}
      </div>
    )}

    {/* Supervisor authorization status */}
    {effectiveMode === 'ABSORBER' && supervisorId && (
      <p className="text-xs text-green-600 mt-1">✓ Autorizado por supervisor</p>
    )}
  </div>
)}
```

**handleProcesar (line 193–300) — modify:**
- Build `discrepancy` param from `effectiveMode`, `vueltoUsd`/`pendienteUsd`, `supervisorId`, `usuarioId`.
- Build `vuelto` as `VueltoParam[]` from `splitVuelto` (when VUELTO) or empty array (when SAF/PROPINA/DIFERENCIAL_SOBRANTE).
- Skip vuelto entirely when mode is not VUELTO.

**Add SupervisorPinDialog render (before closing `</DialogContent>`):**
```tsx
<SupervisorPinDialog
  isOpen={supervisorPinOpen}
  onClose={() => setSupervisorPinOpen(false)}
  onAuthorized={(id) => {
    setSupervisorId(id)
    setSupervisorPinOpen(false)
  }}
  titulo="Autorizar absorción"
  mensaje="Un supervisor debe autorizar la absorción de esta diferencia."
  requiredPermission={PERMISSIONS.SALES_ABSORB_DIFFERENTIAL}
/>
```

**Add keydown useEffect** (as designed above).

**Estimated size impact:** ~553 → ~720 lines (+167). The discrepancy panel adds ~100 lines of JSX, the state/derived logic ~40 lines, the keyboard handler ~20 lines.

---

### 2. `src/features/ventas/components/cliente-selector.tsx` — Minor

**New imports (line 1):**
- Add `useLayoutEffect` to the React import.

**New state (after line 24):**
```typescript
const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
```

**New useLayoutEffect (after line 52):**
Copy the exact pattern from `producto-buscador.tsx` lines 101–115:
```typescript
const dropdownVisible = open && query.trim().length >= 2

useLayoutEffect(() => {
  if (!dropdownVisible || !inputRef.current) return
  const updatePos = () => {
    if (!inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    setDropdownStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }
  updatePos()
  window.addEventListener('scroll', updatePos, true)
  window.addEventListener('resize', updatePos)
  return () => {
    window.removeEventListener('scroll', updatePos, true)
    window.removeEventListener('resize', updatePos)
  }
}, [dropdownVisible])
```

**Replace dropdown container (line 153):**
- From: `<div className="absolute z-50 mt-1 w-full rounded-lg border bg-white shadow-md max-h-60 overflow-y-auto">`
- To: `<div style={dropdownStyle} className="fixed z-[9999] rounded-lg border bg-white shadow-lg max-h-60 overflow-y-auto">`

**Also add `ref={wrapperRef}` to outer div** — already present (line 134). No change needed.

**Estimated size impact:** +15 lines.

---

### 3. `src/features/ventas/components/linea-items.tsx` — Moderate

**New imports:**
- `Minus, Plus` from `@phosphor-icons/react` (or use text `−`/`+` like simple buttons).

**Helper functions (inside component, before render):**

```typescript
const increment = (index: number) => {
  const linea = lineas[index]
  const step = linea.es_decimal ? 0.001 : 1
  onUpdateCantidad(index, Number((linea.cantidad + step).toFixed(3)))
}

const decrement = (index: number) => {
  const linea = lineas[index]
  const step = linea.es_decimal ? 0.001 : 1
  const minQty = linea.es_decimal ? 0.001 : 1
  const newVal = Number((linea.cantidad - step).toFixed(3))
  if (newVal >= minQty) onUpdateCantidad(index, newVal)
}
```

**Modify quantity cell in BOTH render paths** (compact: line 84–111, full: line 200–228):

Wrap the `<input>` in a flex row with −/+ buttons:

```tsx
<td className="px-1.5 py-1.5">
  <div className="flex items-center gap-0.5">
    <button
      type="button"
      onClick={() => decrement(index)}
      disabled={linea.cantidad <= (linea.es_decimal ? 0.001 : 1)}
      className="shrink-0 rounded border bg-muted/50 px-1 py-0.5 text-xs
                 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
    >
      −
    </button>
    <input
      ref={(el) => { inputRefs.current[index] = el }}
      type="number"
      ...existing props...
      onKeyDown={(e) => {
        if (e.key === '+') { e.preventDefault(); increment(index) }
        if (e.key === '-') { e.preventDefault(); decrement(index) }
        if (!linea.es_decimal && (e.key === '.' || e.key === ',')) e.preventDefault()
        if (e.key === 'Enter') { e.preventDefault(); onCantidadEnter?.() }
      }}
      className="..."
    />
    <button
      type="button"
      onClick={() => increment(index)}
      className="shrink-0 rounded border bg-muted/50 px-1 py-0.5 text-xs hover:bg-muted"
    >
      +
    </button>
  </div>
</td>
```

Note: The existing `onKeyDown` (lines 100–106 compact, 216–222 full) already blocks `-` key via `e.preventDefault()`. The new handler intercepts BOTH `+` and `-` BEFORE the decimal/negative checks — the `+` key was not previously handled at all, and `-` now redirects to decrement instead of just being blocked.

**Estimated size impact:** +30 lines (both render paths modified identically).

---

### 4. `src/features/ventas/hooks/use-ventas.ts` — Moderate

**New interface (after VueltoParam, ~line 82):**

```typescript
export interface DiscrepancyOptions {
  mode: 'VUELTO' | 'SAF' | 'PROPINA' | 'DIFERENCIAL_SOBRANTE'
       | 'CREDITO' | 'ABSORBER' | 'DIFERENCIAL_FALTANTE'
  montoUsd: number
  safClienteId?: string
  cajeroId: string
  supervisorId?: string
}
```

**Modify CrearVentaParams (line 100–118):**
- Change `vuelto?: VueltoParam` to `vuelto?: VueltoParam[]`
- Add `discrepancy?: DiscrepancyOptions`

**Modify vuelto insertion (lines 647–668):**

From:
```typescript
if (vuelto && vuelto.monto > 0.005) { /* single insert */ }
```
To:
```typescript
if (vuelto && vuelto.length > 0) {
  for (const entry of vuelto) {
    if (entry.monto <= 0.005) continue
    const vueltoId = uuidv4()
    await tx.execute(
      `INSERT INTO movimientos_metodo_cobro ...`,
      [vueltoId, empresa_id, entry.metodo_cobro_id, entry.monto.toFixed(2),
       ventaId, `VEN-${nroFactura}`, `Vuelto Venta ${nroFactura}`,
       sesion_caja_id ?? null, now, now, usuario_id]
    )
  }
}
```

**Add discrepancy resolution block (new step 5c, after vuelto):**

```typescript
// 5c. DISCREPANCY RESOLUTION
if (discrepancy && discrepancy.mode) {
  const discMonto = discrepancy.montoUsd

  switch (discrepancy.mode) {
    case 'SAF': {
      // Credit overpayment to client's account
      const cliResult = await tx.execute(
        'SELECT saldo_actual FROM clientes WHERE id = ?',
        [discrepancy.safClienteId ?? cliente_id]
      )
      if (!cliResult.rows?.length) throw new Error('Cliente no encontrado para SAF')
      const saldoAnt = parseFloat((cliResult.rows.item(0) as { saldo_actual: string }).saldo_actual)
      const saldoNuevo = Number((saldoAnt - discMonto).toFixed(2)) // decrease = credit to client

      const safId = uuidv4()
      await tx.execute(
        `INSERT INTO movimientos_cuenta
           (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
            observacion, venta_id, fecha, empresa_id, created_at, tasa_pago)
         VALUES (?, ?, 'SAF', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [safId, discrepancy.safClienteId ?? cliente_id,
         `SAF-${nroFactura}`, discMonto.toFixed(2),
         saldoAnt.toFixed(2), saldoNuevo.toFixed(2),
         `Saldo a favor - Venta ${nroFactura}`,
         ventaId, now, empresa_id, now, tasa.toFixed(4)]
      )
      await tx.execute(
        'UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [saldoNuevo.toFixed(2), now, discrepancy.safClienteId ?? cliente_id]
      )
      break
    }

    case 'ABSORBER': {
      // Business absorbs shortfall — auditable gastos record
      const gastoCountResult = await tx.execute(
        'SELECT COUNT(*) as cnt FROM gastos WHERE empresa_id = ?', [empresa_id]
      )
      const gastoCount = Number((gastoCountResult.rows?.item(0) as { cnt: number })?.cnt ?? 0)
      const nroGasto = `ABS-${String(gastoCount + 1).padStart(4, '0')}`

      const gastoId = uuidv4()
      await tx.execute(
        `INSERT INTO gastos
           (id, empresa_id, nro_gasto, nro_factura, descripcion, fecha,
            monto_usd, saldo_pendiente_usd, tipo_impuesto, porcentaje_iva,
            base_imponible_usd, monto_iva_usd, monto_factura, tasa,
            observaciones, status, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, 'ABSORCION_DIFERENCIAL_POS', ?,
                 ?, '0.00', 'Exento', '0.00',
                 ?, '0.00', ?, ?,
                 ?, 'REGISTRADO', ?, ?, ?)`,
        [gastoId, empresa_id, nroGasto, `VEN-${nroFactura}`, now,
         discMonto.toFixed(2),
         discMonto.toFixed(2), discMonto.toFixed(2), tasa.toFixed(4),
         `supervisor:${discrepancy.supervisorId ?? ''}|cajero:${discrepancy.cajeroId}|venta:${ventaId}`,
         now, now, discrepancy.cajeroId]
      )
      break
    }

    case 'DIFERENCIAL_FALTANTE': {
      // Auto-resolved small shortfall — gastos record (no supervisor)
      const gastoCountResult2 = await tx.execute(
        'SELECT COUNT(*) as cnt FROM gastos WHERE empresa_id = ?', [empresa_id]
      )
      const gastoCount2 = Number((gastoCountResult2.rows?.item(0) as { cnt: number })?.cnt ?? 0)
      const nroGasto2 = `DIF-${String(gastoCount2 + 1).padStart(4, '0')}`

      const gastoId2 = uuidv4()
      await tx.execute(
        `INSERT INTO gastos
           (id, empresa_id, nro_gasto, nro_factura, descripcion, fecha,
            monto_usd, saldo_pendiente_usd, tipo_impuesto, porcentaje_iva,
            base_imponible_usd, monto_iva_usd, monto_factura, tasa,
            observaciones, status, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, 'DIFERENCIAL_CAMBIARIO_FALTANTE', ?,
                 ?, '0.00', 'Exento', '0.00',
                 ?, '0.00', ?, ?,
                 ?, 'REGISTRADO', ?, ?, ?)`,
        [gastoId2, empresa_id, nroGasto2, `VEN-${nroFactura}`, now,
         discMonto.toFixed(2),
         discMonto.toFixed(2), discMonto.toFixed(2), tasa.toFixed(4),
         `cajero:${discrepancy.cajeroId}|venta:${ventaId}`,
         now, now, discrepancy.cajeroId]
      )
      break
    }

    case 'PROPINA': {
      // Voluntary surplus stays in register
      const propinaId = uuidv4()
      // Use the last cash payment method as the target
      const lastCashPago = [...pagos].reverse().find(p => {
        const m = metodos?.find(mm => mm.id === p.metodo_cobro_id)
        return m?.tipo === 'EFECTIVO'
      })
      if (lastCashPago) {
        await tx.execute(
          `INSERT INTO movimientos_metodo_cobro
             (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
              doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
           VALUES (?, ?, ?, 'INGRESO', 'PROPINA', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
          [propinaId, empresa_id, lastCashPago.metodo_cobro_id,
           discMonto.toFixed(2),
           ventaId, `VEN-${nroFactura}`, `Propina Venta ${nroFactura}`,
           sesion_caja_id ?? null, now, now, usuario_id]
        )
      }
      break
    }

    case 'DIFERENCIAL_SOBRANTE': {
      // Small overpayment recorded as exchange-rate differential
      const difId = uuidv4()
      const lastCashPago2 = [...pagos].reverse().find(p => {
        const m = metodos?.find(mm => mm.id === p.metodo_cobro_id)
        return m?.tipo === 'EFECTIVO'
      })
      if (lastCashPago2) {
        await tx.execute(
          `INSERT INTO movimientos_metodo_cobro
             (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
              doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
           VALUES (?, ?, ?, 'INGRESO', 'DIFERENCIAL_CAMBIARIO', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
          [difId, empresa_id, lastCashPago2.metodo_cobro_id,
           discMonto.toFixed(2),
           ventaId, `VEN-${nroFactura}`, `Diferencial cambiario Venta ${nroFactura}`,
           sesion_caja_id ?? null, now, now, usuario_id]
        )
      }
      break
    }

    // VUELTO and CREDITO handled by existing code paths
  }
}
```

**Modify saldo_pend_usd computation (lines 670–679):**

After the existing computation, add override for absorption modes:

```typescript
// Force saldo = 0 when business absorbs the difference
if (discrepancy?.mode === 'ABSORBER' || discrepancy?.mode === 'DIFERENCIAL_FALTANTE') {
  saldoPend = 0
}
```

This goes right before the `UPDATE ventas SET saldo_pend_usd` call.

**Note on PROPINA/DIFERENCIAL_SOBRANTE:** For these modes, `crearVenta` must NOT create the EGRESO VUELTO rows. The `vuelto` array will be empty when these modes are selected — the CobroModal passes `vuelto: []` instead of the split entries.

**Function signature change:** `crearVenta` currently doesn't receive `metodos` (the PaymentMethod array). For the PROPINA and DIFERENCIAL_SOBRANTE cases, we need to identify the last cash method. Two options:
1. Pass `metodos` to `crearVenta` — adds a param but is explicit.
2. Have the CobroModal resolve the `metodo_cobro_id` for propina/diferencial before calling `crearVenta` and include it in `DiscrepancyOptions`.

**Choice: Option 2** — cleaner interface. Add `metodo_cobro_id?: string` to `DiscrepancyOptions` for PROPINA and DIFERENCIAL_SOBRANTE. The CobroModal resolves this from the last cash payment in `pagos`.

Updated DiscrepancyOptions:
```typescript
export interface DiscrepancyOptions {
  mode: DiscrepancyMode
  montoUsd: number
  metodo_cobro_id?: string  // for PROPINA/DIFERENCIAL_SOBRANTE: cash method to record on
  safClienteId?: string     // for SAF
  cajeroId: string
  supervisorId?: string     // for ABSORBER
}
```

**Estimated size impact:** ~930 → ~1050 lines (+120).

---

### 5. `src/core/hooks/use-permissions.ts` — Trivial

**Add one line inside PERMISSIONS object (after line 26):**

```typescript
SALES_ABSORB_DIFFERENTIAL: 'ventas.absorber_diferencial',
```

---

## SQL Note (Migration)

This is a backend-side migration, not part of the frontend PR. Documented here for coordination.

```sql
-- Migration: Add permission for POS differential absorption
-- File: migrations/XXXX_add_absorber_diferencial_permission.sql

-- 1. Insert the permission
INSERT INTO permisos (id, slug, nombre, descripcion, modulo, created_at)
VALUES (
  gen_random_uuid(),
  'ventas.absorber_diferencial',
  'Absorber diferencial POS',
  'Autorizar absorción de diferencia de cobro en punto de venta',
  'ventas',
  now()
);

-- 2. Assign to all system roles (Propietario gets it via is_system bypass,
--    but Supervisor roles need explicit assignment)
INSERT INTO rol_permisos (id, rol_id, permiso_id, created_at)
SELECT gen_random_uuid(), r.id, p.id, now()
FROM roles r
CROSS JOIN permisos p
WHERE p.slug = 'ventas.absorber_diferencial'
  AND r.is_system = 0
  AND r.nombre ILIKE '%supervisor%';
```

Note: The frontend permission check happens in `SupervisorPinDialog` which queries `rol_permisos` at runtime. The slug must exist in `permisos` table and be assigned to the appropriate roles. Owner/system roles bypass this check via `is_system = 1`.

---

## File Change Summary

| File | Action | Lines Δ | Description |
|------|--------|---------|-------------|
| `src/features/ventas/components/cobro-modal.tsx` | Modify | +167 | Discrepancy resolution panel, split vuelto UI, keyboard F12/Enter, SupervisorPinDialog integration |
| `src/features/ventas/components/cliente-selector.tsx` | Modify | +15 | Fixed dropdown positioning (`z-[9999]` + `useLayoutEffect` + `getBoundingClientRect`) |
| `src/features/ventas/components/linea-items.tsx` | Modify | +30 | `[−] [input] [+]` flex layout, keyboard +/− capture, min quantity enforcement |
| `src/features/ventas/hooks/use-ventas.ts` | Modify | +120 | `VueltoParam[]`, `DiscrepancyOptions` interface, SAF/ABSORBER/PROPINA/DIFERENCIAL inserts, saldo override |
| `src/core/hooks/use-permissions.ts` | Modify | +1 | Add `SALES_ABSORB_DIFFERENTIAL` permission slug |

**Total estimated: ~333 lines added.** Within 400-line PR review budget.

---

## Testing Strategy

No test infrastructure exists (zero `*.test.ts` files). Manual verification plan:

| Area | What to Test | Approach |
|------|-------------|----------|
| ClienteSelector | Dropdown visible on 320px viewport inside CobroModal | Open DevTools mobile emulator, tap input, verify no clipping |
| F12/Enter | Fires `handleProcesar` only when guards pass | Test: F12 with focus on amount input (should NOT fire), F12 on modal body (should fire), F12 with PIN dialog open (should NOT fire) |
| Split vuelto | Multi-method change distribution | Pay $20 via USD+Bs cash for $17 sale, split $3 vuelto across both, verify two EGRESO VUELTO rows |
| SAF | Client account credit | Overpay with client selected, choose SAF, verify `movimientos_cuenta tipo='SAF'` and `clientes.saldo_actual` decreased |
| PROPINA | Surplus stays in register | Overpay, select Propina, verify `movimientos_metodo_cobro INGRESO PROPINA` and no EGRESO VUELTO |
| ABSORBER | Supervisor PIN flow | Underpay by $1.50, click Absorber, enter wrong PIN (blocked), enter correct PIN (gastos row created, venta saldo=0) |
| DIFERENCIAL auto | Threshold routing | Overpay by $0.10 on $50 sale (umbral=$0.50), verify auto-routes to DIFERENCIAL_SOBRANTE with no user selection |
| +/− buttons | Min quantity, keyboard | Click − at qty=1 (stays 1), press + key on qty input (increments), press − key on qty=1 (stays 1) |

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| cobro-modal.tsx complexity (~720 lines) | Medium | Consider extracting `DiscrepancyPanel` as a child component in a follow-up. For this PR, keep inline to minimize prop-drilling overhead |
| gastos table reuse for POS absorptions mixed with real expenses | Low | `descripcion` prefix ('ABSORCION_' / 'DIFERENCIAL_') clearly distinguishes. Reports already filter by descripcion |
| Split vuelto floating-point drift | Low | All amounts use `.toFixed(2)` before comparison; tolerance ≤$0.01 |
| SAF saldo sync lag (PowerSync eventual consistency) | Medium | Show SAF amount in `VentaExitosaModal` confirmation so cashier sees immediate feedback. Client saldo updates locally in same transaction |
| F12 firing during SupervisorPinDialog | Low | `supervisorPinOpen` guard + capture-phase listener. SupervisorPinDialog uses native `<dialog>` which traps focus but doesn't block document keydown |
| +/− button touch target too small on mobile | Low | Minimum 32px touch target via `px-2 py-1` + use text `−`/`+` not tiny icons |
| Permission slug not yet in DB | Low | Frontend gracefully denies — SupervisorPinDialog returns "no authorization" when slug not found. SQL migration is a coordination item, not a blocker |

---

## Open Questions

None — all blocking questions resolved during exploration and spec phases.
