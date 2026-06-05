# Design: CxC-Prestamos Modal Unificacion

## Technical Approach

Extend `PagoFacturaModal` with two optional props (`defaultDestino`, `vencimientoInicial`) and conditionalize the `if (!factura) return null` guard so the modal renders in PRESTAMO-only mode. Replace `FormAbonoPrestamo` in `PrestamoDetalleModal` with a `PagoFacturaModal` mount. Add `cliente_id` to `VencimientoPrestamo` to satisfy the modal's required `clienteId` prop.

## Architecture Decisions

| # | Decision | Alternatives | Rationale |
|---|----------|-------------|-----------|
| AD-1 | Bypass guard via `if (!factura && defaultDestino !== 'PRESTAMO') return null` | Refactor guard to always render shell; split into two components | Minimal diff — existing callers untouched; one condition addition |
| AD-2 | `VencimientoPrestamo` is a structural superset of `VencimientoVenta` — no adapter | Create shared base type; map fields | TS structural typing already satisfies assignability; zero runtime cost |
| AD-3 | Add `cliente_id` to `VencimientoPrestamo` type + query | Look up `cliente_id` in `PrestamoDetalleModal` via separate query | Column already exists in `vencimientos_cobrar`; single query change, no extra round-trip |
| AD-4 | Always pass `factura=null` from `PrestamoDetalleModal` | Fetch factura when `venta_id` is present | User explicitly chose "Abonar prestamo" — factura tab is unnecessary from this entry point; avoids extra fetch |

## Data Flow

```
PrestamosPage (click row)
  └─► PrestamoDetalleModal (click "Abonar")
        └─► PagoFacturaModal
              ├─ defaultDestino='PRESTAMO'
              ├─ factura=null (FACTURA selector hidden)
              ├─ vencimientoInicial=prestamo (pre-selected)
              └─ vencimientos=[prestamo] (single-element list)
                    │
                    ▼
              registrarAbonoPrestamo() ──► SQLite ──► PowerSync sync
                    │
                    ▼
              useQuery auto-reactivity updates:
                ├─ useHistorialPrestamo (PrestamoDetalleModal)
                └─ useQuery in PrestamosPage
```

## Interfaces / Contracts

### New PagoFacturaModal props (additive, backward-compatible)

```typescript
interface PagoFacturaModalProps {
  // ... existing props unchanged ...
  /** Initial destino state. Default: 'FACTURA' */
  defaultDestino?: 'FACTURA' | 'PRESTAMO'
  /** Pre-selects a specific cuota when opening in PRESTAMO mode */
  vencimientoInicial?: VencimientoPrestamo
}
```

### Extended VencimientoPrestamo (additive)

```typescript
export interface VencimientoPrestamo {
  // ... existing fields ...
  cliente_id: string   // NEW — already in DB, just not selected
}
```

## Render Tree Changes (PRESTAMO-only mode, factura=null)

| Line(s) | Current | New behavior |
|---------|---------|-------------|
| 119 | `if (!factura) return null` | `if (!factura && defaultDestino !== 'PRESTAMO') return null` |
| 121-122 | `parseFloat(factura.saldo_pend_usd)` | Compute only when `factura` is truthy; default to `0` |
| 87-97 | Reset effect: `setDestino('FACTURA')` | `setDestino(defaultDestino ?? 'FACTURA')`; pre-set `vencimientoId` from `vencimientoInicial?.id` |
| 99-105 | Auto-select cuota on destino change | Keep; also handles initial mount |
| 207-232 | FACTURA/PRESTAMO selector | Hidden when `!factura` — force PRESTAMO mode |
| 235-257 | FACTURA summary section | Not rendered (destino locked to PRESTAMO) |
| 259-263 | "Prestamo vinculado a factura #..." | Conditionalize: show `nro_factura` only when available |

Merged vencimientos list for internal use:
```typescript
const effectiveVencimientos = vencimientoInicial
  && !vencimientos.some(v => v.id === vencimientoInicial.id)
  ? [...vencimientos, vencimientoInicial]
  : vencimientos
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/features/cxc/components/pago-factura-modal.tsx` | Modify | Add 2 optional props; fix guard; conditionalize factura sections; merge `vencimientoInicial` into internal list |
| `src/features/ventas/components/prestamo-detalle-modal.tsx` | Modify | Remove `FormAbonoPrestamo` (lines 110-315) + `showAbonoForm` state; add `pagoModalOpen` state + `PagoFacturaModal` render; clean unused imports (`useEffect`, `toast`, `useMetodosPagoActivos`, `useTasaActual`, `db`, `localNow`, `registrarAbonoPrestamo`, `formatBs`, `usdToBs`, `bsToUsd`, `useCurrentUser`, `Input`) |
| `src/features/cxc/hooks/use-cxc.ts` | Modify | Add `cliente_id: string` to `VencimientoPrestamo` interface |
| `src/features/ventas/components/prestamos-page.tsx` | Modify | Add `vc.cliente_id` to SELECT query (line 183) |

## Deletion Plan (FormAbonoPrestamo)

**Remove entirely** from `prestamo-detalle-modal.tsx`:
- `FormAbonoPrestamoProps` interface (lines 112-116)
- `FormAbonoPrestamo` function (lines 118-315)
- `showAbonoForm` state (line 329)
- Conditional render block (lines 502-514)
- "Registrar Abono" button (lines 521-528) — replaced by "Abonar" opening PagoFacturaModal

**Unused imports after deletion**: `useEffect`, `toast`, `useCurrentUser`, `useMetodosPagoActivos`, `useTasaActual`, `db`, `localNow`, `registrarAbonoPrestamo`, `formatBs`, `usdToBs`, `bsToUsd`. All safe to remove — verified no other usage in the file.

## Reactivity Verification (REQ-004)

`PrestamosPage` uses `useQuery` from `@powersync/react` (line 181) which provides automatic reactivity over SQLite tables. When `registrarAbonoPrestamo` updates `vencimientos_cobrar`, PowerSync detects the change and re-executes the query. No manual invalidation needed. Same for `useHistorialPrestamo` in the detail modal.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Manual | Backward compat: existing CxC callers | Open `factura-detalle-cxc` and `cxc-cliente-detalle` — verify unchanged behavior |
| Manual | PRESTAMO-only mode | Open standalone loan → Abonar → verify PagoFacturaModal renders, FACTURA selector hidden |
| Manual | Linked loan | Open linked loan → Abonar → verify payment completes, historial updates |
| Type | `yarn type-check` | Must pass with zero errors |

## Migration / Rollout

No migration required. No feature flags needed — changes are confined to UI wiring.

## Rollback Plan

4 files changed. Rollback: `git checkout HEAD -- src/features/cxc/components/pago-factura-modal.tsx src/features/ventas/components/prestamo-detalle-modal.tsx src/features/cxc/hooks/use-cxc.ts src/features/ventas/components/prestamos-page.tsx`

## Open Questions

None — all risks resolved.
