# Design: pos-tesoreria-integration

_Date: 2026-07-05 | Change: pos-tesoreria-integration_

---

## 1. Architecture Overview

```
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│   POS Session (Cajero)          │     │   Tesorería (Operador)           │
│                                 │     │                                  │
│  IngresoRetiroModal             │     │  EnviarEfectivoACajaModal        │
│  [Traspaso a Tesorería] ────────┼──┐  │  [Enviar a Sesión] ──────────┐   │
│                                 │  │  │                              │   │
│  sesion-caja-form.tsx           │  │  │                              │   │
│  [Mensaje post-cierre]          │  │  │                              │   │
└─────────────────────────────────┘  │  └──────────────────────────────┘   │
                                     │                                     │
  ┌──────────────────────────────────┼─────────────────────────────────────┼──┐
  │  db.writeTransaction()           ▼                                     ▼  │
  │                                                                           │
  │  ┌──────────────────────────┐  ┌───────────────────┐  ┌────────────────┐  │
  │  │ movimientos_metodo_cobro │  │ mov_caja_fuerte   │  │ traspasos_     │  │
  │  │                          │  │                   │  │ tesoreria      │  │
  │  │ EGRESO / EGRESO_TESORERIA│  │ INGRESO / TRASPASO│  │ SESION_CAJA ↔  │  │
  │  │ INGRESO/ INGRESO_TESORERÍ│  │ validado=0        │  │ CAJA_FUERTE    │  │
  │  │ + UPDATE metodos_cobro   │  │ + UPDATE caja_    │  │ sesion_caja_id │  │
  │  │   .saldo_actual          │  │   fuerte.saldo    │  │                │  │
  │  └──────────────────────────┘  └───────────────────┘  └────────────────┘  │
  │                                                                           │
  │  Sentido escritura:                                                       │
  │  Sesión→Tesorería: EGRESO en mmc + INGRESO en mcf + traspaso             │
  │  Tesorería→Sesión: EGRESO en mcf + INGRESO en mmc + traspaso             │
  └───────────────────────────────────────────────────────────────────────────┘
```

**Tabla de flujos:**

| Flujo | movimientos_metodo_cobro | mov_caja_fuerte | traspasos_tesoreria |
|-------|--------------------------|-----------------|---------------------|
| Sesión → Caja Fuerte | EGRESO, origen=`EGRESO_TESORERIA` | INGRESO, origen=`TRASPASO`, validado=0 | cuenta_origen_tipo=`SESION_CAJA`, cuenta_destino_tipo=`CAJA_FUERTE` |
| Caja Fuerte → Sesión | INGRESO, origen=`INGRESO_TESORERIA` | EGRESO, origen=`TRASPASO` | cuenta_origen_tipo=`CAJA_FUERTE`, cuenta_destino_tipo=`SESION_CAJA` |

---

## 2. Database Migration

### PostgreSQL migration (`migrations/NNNN_traspasos_sesion_caja.sql`)

```sql
-- Add sesion_caja_id to traspasos_tesoreria
ALTER TABLE traspasos_tesoreria
  ADD COLUMN IF NOT EXISTS sesion_caja_id TEXT REFERENCES sesiones_caja(id);

-- No check constraint exists on cuenta_origen_tipo/cuenta_destino_tipo.
-- Verified: the column is TEXT without CHECK — values 'SESION_CAJA' work without migration.
```

### PowerSync Sync Rules

The `powersync-sync-rules.yaml` already uses `SELECT * FROM traspasos_tesoreria WHERE empresa_id = bucket.empresa_id`. The new column `sesion_caja_id` will be included automatically. **No sync rule change needed.**

---

## 3. New Hook: `crearTraspasoSesionATesoreria()`

**File:** `src/features/tesoreria/hooks/use-traspasos.ts`

```typescript
export async function crearTraspasoSesionATesoreria(params: {
  sesion_caja_id: string
  caja_fuerte_id: string
  metodo_cobro_id: string      // EFECTIVO method matching caja fuerte currency
  moneda_id: string
  monto: number
  observacion?: string
  empresa_id: string
  usuario_id: string
}): Promise<void>
```

**Pseudocode (inside `db.writeTransaction`):**

```
1. READ sesiones_caja WHERE id = params.sesion_caja_id
   → ASSERT status = 'ABIERTA', else throw "Sesión no activa"

2. VALIDATE session balance:
   Same logic as createMovimientoManual (EGRESO path):
   - Read monto_apertura from sesion
   - SUM ingresos/egresos from movimientos_metodo_cobro for this session + currency
   - SUM pagos efectivo for this session + currency  
   - disponible = apertura + ingresos - egresos + pagos
   → ASSERT disponible >= monto, else throw "Saldo insuficiente"

3. READ saldo_actual FROM metodos_cobro WHERE id = params.metodo_cobro_id
   saldoNuevoMc = saldoActual - monto

4. INSERT INTO movimientos_metodo_cobro:
   - id: uuid, empresa_id, metodo_cobro_id
   - tipo: 'EGRESO', origen: 'EGRESO_TESORERIA'
   - monto, saldo_anterior, saldo_nuevo: saldoNuevoMc
   - sesion_caja_id: params.sesion_caja_id
   - concepto: params.observacion ?? 'Traspaso a Tesorería'
   - fecha: todayStr(), created_at: localNow(), created_by: usuario_id
   → save movOrigenId

5. UPDATE metodos_cobro SET saldo_actual = saldoNuevoMc

6. READ saldo_actual FROM caja_fuerte WHERE id = params.caja_fuerte_id
   saldoNuevoCf = saldoActual + monto

7. INSERT INTO mov_caja_fuerte:
   - id: uuid, empresa_id, caja_fuerte_id
   - tipo: 'INGRESO', origen: 'TRASPASO'
   - monto, saldo_anterior, saldo_nuevo: saldoNuevoCf
   - doc_origen_tipo: 'SESION_CAJA', doc_origen_id: params.sesion_caja_id
   - descripcion: 'Traspaso desde sesión de caja'
   - validado: 0, reversado: 0
   - fecha, created_at, created_by
   → save movDestinoId

8. UPDATE caja_fuerte SET saldo_actual = saldoNuevoCf

9. INSERT INTO traspasos_tesoreria:
   - id: uuid, empresa_id
   - cuenta_origen_tipo: 'SESION_CAJA'
   - cuenta_origen_id: params.sesion_caja_id  (the session IS the "account")
   - mov_origen_id: movOrigenId
   - cuenta_destino_tipo: 'CAJA_FUERTE'
   - cuenta_destino_id: params.caja_fuerte_id
   - mov_destino_id: movDestinoId
   - monto_origen/monto_destino: monto (same currency, no conversion)
   - moneda_origen_id/moneda_destino_id: params.moneda_id
   - tasa_cambio: null (same currency)
   - sesion_caja_id: params.sesion_caja_id
   - reversado: 0, observacion, fecha, created_at, created_by
```

---

## 4. New Hook: `crearTraspasoTesoreriaASesion()`

**File:** `src/features/tesoreria/hooks/use-traspasos.ts`

```typescript
export async function crearTraspasoTesoreriaASesion(params: {
  caja_fuerte_id: string
  sesion_caja_id: string
  metodo_cobro_id: string      // EFECTIVO method matching caja fuerte currency
  moneda_id: string
  monto: number
  observacion?: string
  empresa_id: string
  usuario_id: string
}): Promise<void>
```

**Pseudocode (inside `db.writeTransaction`):**

```
1. READ sesiones_caja WHERE id = params.sesion_caja_id
   → ASSERT status = 'ABIERTA', else throw "Sesión destino no activa"

2. READ saldo_actual FROM caja_fuerte WHERE id = params.caja_fuerte_id
   → ASSERT saldoActual >= monto, else throw "Saldo insuficiente en caja fuerte"
   saldoNuevoCf = saldoActual - monto

3. INSERT INTO mov_caja_fuerte:
   - tipo: 'EGRESO', origen: 'TRASPASO'
   - doc_origen_tipo: 'SESION_CAJA', doc_origen_id: params.sesion_caja_id
   - descripcion: 'Traspaso a sesión de caja'
   - validado: 0, reversado: 0
   → save movOrigenId

4. UPDATE caja_fuerte SET saldo_actual = saldoNuevoCf

5. READ saldo_actual FROM metodos_cobro WHERE id = params.metodo_cobro_id
   saldoNuevoMc = saldoActual + monto

6. INSERT INTO movimientos_metodo_cobro:
   - tipo: 'INGRESO', origen: 'INGRESO_TESORERIA'
   - sesion_caja_id: params.sesion_caja_id
   - concepto: params.observacion ?? 'Ingreso desde Tesorería'
   → save movDestinoId

7. UPDATE metodos_cobro SET saldo_actual = saldoNuevoMc

8. INSERT INTO traspasos_tesoreria:
   - cuenta_origen_tipo: 'CAJA_FUERTE'
   - cuenta_origen_id: params.caja_fuerte_id
   - mov_origen_id: movOrigenId
   - cuenta_destino_tipo: 'SESION_CAJA'
   - cuenta_destino_id: params.sesion_caja_id
   - mov_destino_id: movDestinoId
   - sesion_caja_id: params.sesion_caja_id
   - Same currency fields, reversado: 0, etc.
```

---

## 5. Hook Updates

### `use-traspasos.ts` — `reversarTraspaso()`

**Current assumption:** `cuenta_*_tipo` is either `'BANCO'` or `'CAJA_FUERTE'`. Tables for reversal are `movimientos_bancarios`/`bancos_empresa` or `mov_caja_fuerte`/`caja_fuerte`.

**New branch needed for `SESION_CAJA`:**

```
// In reverso origen (line ~340):
if (traspaso.cuenta_origen_tipo === 'SESION_CAJA') {
  // Session was the ORIGIN → money left the session → reversal = INGRESO back to session
  1. READ sesiones_caja WHERE id = traspaso.sesion_caja_id
     → ASSERT status = 'ABIERTA', else throw "No se puede reversar: sesión cerrada"
  2. GET metodo_cobro_id from original mov_origen (movimientos_metodo_cobro)
  3. READ saldo_actual FROM metodos_cobro
  4. INSERT INTO movimientos_metodo_cobro:
     tipo='INGRESO', origen='REVERSO_TESORERIA', sesion_caja_id
  5. UPDATE metodos_cobro saldo_actual
}

// In reverso destino (line ~397):
if (traspaso.cuenta_destino_tipo === 'SESION_CAJA') {
  // Session was the DESTINATION → money entered the session → reversal = EGRESO from session
  1. Same session-active check
  2. GET metodo_cobro_id from original mov_destino
  3. READ saldo_actual FROM metodos_cobro
  4. Validate session balance (can't go negative)
  5. INSERT INTO movimientos_metodo_cobro:
     tipo='EGRESO', origen='REVERSO_TESORERIA', sesion_caja_id
  6. UPDATE metodos_cobro saldo_actual
}
```

**Critical constraint:** Reversal of traspasos involving `SESION_CAJA` is ONLY allowed while the session is `ABIERTA`. Once closed, reversal is blocked.

### `useTraspasos()` — enrichment (read hook)

Line ~108-120: add `SESION_CAJA` to name resolution. Query `sesiones_caja` + `cajas` + `usuarios` to build a sesionMap:

```typescript
// New query alongside bancosData and cajasData:
const { data: sesionesData } = useQuery(
  `SELECT sc.id, c.nombre as caja_nombre, u.nombre as usuario_nombre, sc.fecha_apertura
   FROM sesiones_caja sc
   LEFT JOIN cajas c ON sc.caja_id = c.id
   LEFT JOIN usuarios u ON sc.usuario_apertura_id = u.id
   WHERE sc.empresa_id = ?`,
  [empresaId]
)

// In the enrichment map:
nombre_origen:
  t.cuenta_origen_tipo === 'BANCO'    ? bancoMap.get(...)
  : t.cuenta_origen_tipo === 'SESION_CAJA' ? sesionMap.get(...)
  : cajaMap.get(...)
```

### `Traspaso` interface

Add `sesion_caja_id: string | null` to the interface (line ~10).

### `useSaldoSesionCaja` (use-sesiones-caja.ts)

**Line 220:** Change the IN clause:

```sql
-- BEFORE:
AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO')

-- AFTER:
AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO',
                    'EGRESO_TESORERIA', 'INGRESO_TESORERIA', 'REVERSO_TESORERIA')
```

Then in the sum computation (lines 244-251), add:

```typescript
const egrTesoUsd  = movsMap.get('EGRESO_TESORERIA')?.usd  ?? new Decimal(0)
const egrTesoBs   = movsMap.get('EGRESO_TESORERIA')?.bs   ?? new Decimal(0)
const ingTesoUsd  = movsMap.get('INGRESO_TESORERIA')?.usd ?? new Decimal(0)
const ingTesoBs   = movsMap.get('INGRESO_TESORERIA')?.bs  ?? new Decimal(0)
const revTesoUsd  = movsMap.get('REVERSO_TESORERIA')?.usd ?? new Decimal(0)
const revTesoBs   = movsMap.get('REVERSO_TESORERIA')?.bs  ?? new Decimal(0)
```

Formula update (lines 253-261):
```
saldoUsd = apertura + ventas + ingManual + ingTeso + revTeso(INGRESO type)
           - egrManual - avances - prestamos - egrTeso - revTeso(EGRESO type)
```

**Simplification:** Since the query already groups by `origen` and `REVERSO_TESORERIA` can be either INGRESO or EGRESO, better to split into `REVERSO_TESORERIA_IN` / `REVERSO_TESORERIA_EG` — OR simply use a single `REVERSO_TESORERIA` origin where the `tipo` column (`INGRESO`/`EGRESO`) already distinguishes direction.

**Decision:** Use `REVERSO_TESORERIA` as a single origin. The existing query groups by `origen` but the `tipo` (INGRESO/EGRESO) is what actually determines the sign in the formula. Looking at the current code more carefully: `movsMap` aggregates by `origen`, but all entries for the SAME origen have the SAME tipo. For `REVERSO_TESORERIA`, the tipo could vary. **Better: rename to two distinct orígenes:**

- When reversing a traspaso where session was ORIGIN: reversal creates `INGRESO` with origen `INGRESO_TESORERIA` (it's effectively the same as receiving from tesorería)
- When reversing a traspaso where session was DESTINATION: reversal creates `EGRESO` with origen `EGRESO_TESORERIA` (it's effectively the same as sending to tesorería)

**Final decision:** No `REVERSO_TESORERIA` origin. Reversal reuses `INGRESO_TESORERIA`/`EGRESO_TESORERIA` with concepto explaining it's a reversal. This keeps the saldo calculation simple — same 3 new orígenes (`EGRESO_TESORERIA`, `INGRESO_TESORERIA`) map cleanly to EGRESO/INGRESO.

Updated formula:
```
saldoUsd = apertura + ventas + ingManual + ingTeso
           - egrManual - avances - prestamos - egrTeso
```

---

## 6. UI Changes

### `avance-modal.tsx` — Remove BANCO tab

**Lines 299-303:** Remove the `{ key: 'BANCO', label: 'Banco', Icon: Bank }` entry from the array. Only keep `CAJA` and `EFECTIVO_EMPRESA`.

**Line 3:** Remove `Bank` from the Phosphor import.

**Line 17:** Remove `'BANCO'` from the `OrigenFondos` type: `type OrigenFondos = 'CAJA' | 'EFECTIVO_EMPRESA'`

**Lines 328-358 (selector `origenFondos !== 'CAJA'`):** The conditional filter `origenFondos === 'EFECTIVO_EMPRESA' ? c.tipo === 'CAJA_FUERTE' : c.tipo === 'BANCO'` simplifies — the `BANCO` branch is dead code. Remove it. Filter always shows `CAJA_FUERTE`.

### `ingreso-retiro-modal.tsx` — Add "Traspaso a Tesorería"

**Props change:**

```typescript
interface IngresoRetiroModalProps {
  isOpen: boolean
  onClose: () => void
  sesionCajaId: string
  modo: 'INGRESO' | 'RETIRO'
  pendingCajaUsd?: number
  pendingCajaBs?: number
  cuentas?: CuentaTesoreria[]   // NEW — cajas fuerte activas from pos-terminal
}
```

**FormIngresoRetiro internal state:**

```typescript
const [traspasoMode, setTraspasoMode] = useState(false)
const [selectedCajaFuerteId, setSelectedCajaFuerteId] = useState('')
```

**UI additions (only when `modo === 'RETIRO'`):**

After the "Concepto" textarea, render a toggle/section:

```
┌─────────────────────────────────────────┐
│ ☐ Traspaso a Tesorería                 │  ← checkbox, only in RETIRO mode
│   [Selector de caja fuerte destino]     │  ← shows when checked
│   [USD] Caja Fuerte Dólares — $500.00   │
│   [BS]  Caja Fuerte Bolívares — Bs 1200 │
└─────────────────────────────────────────┘
```

**Submit logic change:** When `traspasoMode === true`:
- Instead of calling `createMovimientoManualMulti`, call `crearTraspasoSesionATesoreria()`
- Pass: `sesion_caja_id`, `caja_fuerte_id` from selected, `metodo_cobro_id` matching the caja fuerte's currency, `moneda_id`, `monto`, `observacion: concepto`

**Constraint:** When `traspasoMode === true`, only ONE currency can be submitted (the one matching the selected caja fuerte). The other currency input is disabled with message: "Solo {USD|Bs} — moneda de la caja fuerte seleccionada".

### New component: `EnviarEfectivoACajaModal`

**File:** `src/features/tesoreria/components/enviar-efectivo-a-caja-modal.tsx`

**Props:**

```typescript
interface EnviarEfectivoACajaModalProps {
  isOpen: boolean
  onClose: () => void
  cuentas: CuentaTesoreria[]     // cajas fuerte activas (filtered by tipo='CAJA_FUERTE')
}
```

**Internal hook: `useSesionesActivas()`**

Query:
```sql
SELECT sc.id, sc.fecha_apertura, sc.monto_apertura_usd, sc.monto_apertura_bs,
       c.nombre AS caja_nombre, u.nombre AS usuario_nombre
FROM sesiones_caja sc
LEFT JOIN cajas c ON sc.caja_id = c.id
LEFT JOIN usuarios u ON sc.usuario_apertura_id = u.id
WHERE sc.empresa_id = ? AND sc.status = 'ABIERTA'
ORDER BY sc.fecha_apertura DESC
```

This hook can live inline in the modal or as a separate export in `use-sesiones-caja.ts`.

**Form fields:**

1. Selector de caja fuerte origen (dropdown filtering `cuentas` by `tipo === 'CAJA_FUERTE'`)
   - Shows: `[{moneda_codigo}] {nombre} — Saldo: {saldo_actual}`
2. Selector de sesión destino (dropdown from `useSesionesActivas`)
   - Shows: `{usuario_nombre} · {caja_nombre} · {formatDateTime(fecha_apertura)}`
   - Empty state: "No hay sesiones activas" + button disabled
3. Monto input (single currency, determined by selected caja fuerte)
4. Observación (textarea, optional)

**Submit:** Calls `crearTraspasoTesoreriaASesion()` with:
- `caja_fuerte_id`, `sesion_caja_id`, `metodo_cobro_id` (EFECTIVO matching caja fuerte currency — looked up from `useMetodosPagoActivos()`), `moneda_id`, `monto`, `observacion`, `empresa_id`, `usuario_id`

**Placement:** Button "Enviar efectivo a caja" in the Tesorería view, alongside existing "Traspaso" and "Movimiento Manual" buttons.

### Cuadre — `cuadre-saldo-caja.tsx`

**New rows for Tesorería movements:**

After the "Ingresos manuales" expandable row (line ~117), add:

```typescript
// Ingresos de Tesorería
const ingTesoUsd = sumMovs(['INGRESO_TESORERIA'], 'USD')
const ingTesoBs  = sumMovs(['INGRESO_TESORERIA'], 'BS')
// Render ExpandableRow sign="+" label="Ingresos de Tesorería" with badge
```

After "Retiros manuales" expandable row (line ~152), add:

```typescript
// Egresos a Tesorería
const egrTesoUsd = sumMovs(['EGRESO_TESORERIA'], 'USD')
const egrTesoBs  = sumMovs(['EGRESO_TESORERIA'], 'BS')
// Render ExpandableRow sign="-" label="Traspasos a Tesorería"
```

Detail rows use existing `movsDetalle.filter(m => m.origen === 'INGRESO_TESORERIA')` pattern — this works because `useMovimientosEfectivoCaja` queries ALL movimientos without filtering by origen.

**`ExpandedRow` type:** Add `'ing-teso' | 'egr-teso'` to the union.

### Cuadre — `cuadre-page.tsx`

**Line 172:** `ingresosEfectivoUsd` must include `INGRESO_TESORERIA`:

```typescript
// BEFORE:
.filter((m) => m.metodo_tipo === 'EFECTIVO' && m.metodo_moneda !== 'BS' && m.origen === 'INGRESO_MANUAL')

// AFTER:
.filter((m) => m.metodo_tipo === 'EFECTIVO' && m.metodo_moneda !== 'BS'
  && (m.origen === 'INGRESO_MANUAL' || m.origen === 'INGRESO_TESORERIA'))
```

This ensures the "Arqueo Teórico" calculation includes tesorería ingresos.

### `sesion-caja-form.tsx` — Post-close message

**Line 475:** After `toast.success('Sesion de caja cerrada exitosamente')`, add:

```typescript
toast.info('Recuerda depositar el efectivo a la cuenta de Tesorería correspondiente', {
  duration: 8000,
})
```

This uses Sonner's `info` variant (non-blocking, auto-dismiss). No dialog, no confirmation required. Follows spec-caja-delta REQ: "MUST NOT block flujo de cierre".

---

## 7. PowerSync Schema Update

**File:** `src/core/db/powersync/schema.ts`, line ~881

Add `sesion_caja_id` to `traspasos_tesoreria`:

```typescript
const traspasos_tesoreria = new Table(
  {
    empresa_id: column.text,
    cuenta_origen_tipo: column.text,
    cuenta_origen_id: column.text,
    mov_origen_id: column.text,
    cuenta_destino_tipo: column.text,
    cuenta_destino_id: column.text,
    mov_destino_id: column.text,
    monto_origen: column.text,
    moneda_origen_id: column.text,
    monto_destino: column.text,
    moneda_destino_id: column.text,
    tasa_cambio: column.text,
    reversado: column.integer,
    reversado_at: column.text,
    reversado_por: column.text,
    observacion: column.text,
    sesion_caja_id: column.text,     // ← NEW
    fecha: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { indexes: {} }
)
```

---

## 8. Kysely Types Update

**File:** `src/core/db/kysely/types.ts`

### `TraspasoTesoreria` interface (line ~748)

Add:

```typescript
sesion_caja_id: string | null     // NEW — FK to sesiones_caja
```

### `MovCajaFuerte` comment (line ~730)

Update the `origen` comment to include the new doc_origen_tipo value:

```typescript
origen: string  // DEPOSITO_CIERRE | GASTO | TRASPASO | MANUAL | REVERSO
// doc_origen_tipo now also accepts: 'SESION_CAJA'
```

### `MovimientosMetodoCobro` — no type change needed

The `origen: string` field is already untyped (plain `string`). New values `EGRESO_TESORERIA` and `INGRESO_TESORERIA` are valid without type changes. The Zod schema `movimientoManualSchema` is only used for manual ingreso/retiro forms, not for traspaso operations — no change needed there either.

---

## 9. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `reversarTraspaso()` crashes on `SESION_CAJA` | **High** | Add `SESION_CAJA` branch BEFORE any traspaso can be created. Deploy reversal support first |
| Race condition: session closed between selection and confirm | Medium | Verify `status='ABIERTA'` inside `db.writeTransaction` before first INSERT |
| `useSaldoSesionCaja` misses new orígenes → wrong balance | High | Extend IN clause to include `EGRESO_TESORERIA`, `INGRESO_TESORERIA`. Deploy with hook |
| Cuadre arqueo teórico excludes `INGRESO_TESORERIA` | Medium | Update filter in `cuadre-page.tsx` line 172. Without this, theoretical cash won't match physical |
| `useTraspasos()` enrichment shows "Caja Fuerte" for session-origin traspasos | Low | Add `SESION_CAJA` branch to name resolution. Visual only, not data-affecting |
| PowerSync sync delay on `sesion_caja_id` | Low | `SELECT *` in sync rules already covers it. No action needed |
| `caja-saldo-caja.tsx` doesn't show Tesorería rows | Medium | Add `INGRESO_TESORERIA`/`EGRESO_TESORERIA` expandable rows. Without this, movements are "invisible" in cuadre |

---

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|----------|---------|----------|--------|
| New orígenes naming | `TRASPASO_TESORERIA` (single) vs `EGRESO_TESORERIA` + `INGRESO_TESORERIA` (pair) | Single = simpler but ambiguous direction. Pair = explicit tipo mapping | **Pair**: `EGRESO_TESORERIA` (EGRESO) + `INGRESO_TESORERIA` (INGRESO) — each maps 1:1 to a tipo, simplifying saldo calculations |
| Reversal origin | Dedicated `REVERSO_TESORERIA` vs reuse `EGRESO_TESORERIA`/`INGRESO_TESORERIA` | Dedicated = clearer audit trail but complicates saldo formula (needs special handling). Reuse = saldo formula stays simple | **Reuse** existing orígenes. The `concepto` field carries "Reversión de traspaso" for audit |
| Reversal when session closed | Allow (orphan movement) vs Block | Allow = more flexible but breaks cuadre integrity. Block = limits reversal window | **Block** — throw error "No se puede reversar: sesión cerrada". Cuadre integrity > flexibility |
| Traspaso function location | New file vs extend `use-traspasos.ts` | New file = separation. Same file = co-located with existing traspaso logic | **Extend** `use-traspasos.ts` — all traspaso operations in one place |
| `metodo_cobro_id` determination | Lookup inside tx vs receive as param | Inside tx = self-contained but 1 more query. Param = caller decides, fewer tx queries | **Param** — modal already knows the efectivo method from `useMetodosPagoActivos()` |

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `migrations/NNNN_traspasos_sesion_caja.sql` | Create | `ALTER TABLE traspasos_tesoreria ADD COLUMN sesion_caja_id TEXT` |
| `src/core/db/powersync/schema.ts` | Modify | Add `sesion_caja_id: column.text` to `traspasos_tesoreria` |
| `src/core/db/kysely/types.ts` | Modify | Add `sesion_caja_id` to `TraspasoTesoreria` interface |
| `src/features/tesoreria/hooks/use-traspasos.ts` | Modify | Add `crearTraspasoSesionATesoreria()`, `crearTraspasoTesoreriaASesion()`, extend `reversarTraspaso()` for `SESION_CAJA`, extend `Traspaso` interface, extend `useTraspasos()` enrichment |
| `src/features/caja/hooks/use-sesiones-caja.ts` | Modify | Extend `useSaldoSesionCaja` IN clause with `EGRESO_TESORERIA`, `INGRESO_TESORERIA` |
| `src/features/caja/components/avance-modal.tsx` | Modify | Remove `BANCO` tab and `Bank` import |
| `src/features/caja/components/ingreso-retiro-modal.tsx` | Modify | Add `cuentas` prop, `traspasoMode` state, caja fuerte selector, call `crearTraspasoSesionATesoreria()` |
| `src/features/caja/components/sesion-caja-form.tsx` | Modify | Add `toast.info()` after successful close |
| `src/features/tesoreria/components/enviar-efectivo-a-caja-modal.tsx` | Create | Modal: select caja fuerte + active session + monto → `crearTraspasoTesoreriaASesion()` |
| `src/features/reportes/components/cuadre-saldo-caja.tsx` | Modify | Add expandable rows for `INGRESO_TESORERIA` and `EGRESO_TESORERIA` |
| `src/features/reportes/components/cuadre-page.tsx` | Modify | Include `INGRESO_TESORERIA` in `ingresosEfectivoUsd` filter (line 172) |
| `src/routes/_app/ventas/` (pos-terminal) | Modify | Pass `cuentas` prop to `IngresoRetiroModal` |

---

## Testing Strategy

No test infrastructure exists in the project. Validation will be manual:

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Transaction | Atomicity of 3-INSERT operations | Force failure at each INSERT step, verify no partial writes |
| Balance | `useSaldoSesionCaja` with mixed orígenes | Create INGRESO_TESORERIA + EGRESO_TESORERIA, verify saldo matches |
| Cuadre | Arqueo teórico includes tesorería flows | Compare theoretical vs physical after traspaso operations |
| Reversal | Block reversal on closed session | Close session, attempt reversal, verify error |
| UI | BANCO tab removed from AvanceModal | Open modal, verify only CAJA + EFECTIVO_EMPRESA |
| UI | Traspaso mode in RETIRO only | Open IngresoRetiroModal in INGRESO mode, verify no traspaso option |

---

## Migration / Rollout

1. Apply PostgreSQL migration (`ALTER TABLE` — additive, zero-downtime)
2. Deploy frontend with all changes simultaneously (schema, hooks, UI are tightly coupled)
3. No feature flag needed — changes are additive and backward-compatible with existing data
4. Rollback: `ALTER TABLE traspasos_tesoreria DROP COLUMN sesion_caja_id` + git revert frontend
