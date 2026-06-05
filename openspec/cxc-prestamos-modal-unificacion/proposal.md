# Proposal: CxC–Préstamos Modal Unificación

## Intent

The Préstamos module contains a duplicate `FormAbonoPrestamo` that bypasses the CxC `PagoFacturaModal`. This creates divergent UX and maintenance debt. We unify all loan-payment flows through the existing CxC modal without changing any business logic.

## Scope

### In Scope
- Add "Abonar" button to `PrestamoDetalleModal` (visible only when `status = 'PENDIENTE'`)
- Wire that button to open `PagoFacturaModal` pre-loaded on the "Cuota" tab with the loan's `vencimiento`
- Remove `FormAbonoPrestamo` from `PrestamoDetalleModal` after wiring is verified
- Confirm `PrestamosPage` query subscription reacts to `vencimientos_cobrar` changes (PowerSync)

### Out of Scope
- Overpayment flow (BRECHA-002)
- `movimientos_cuenta` for loan payments (BRECHA-003)
- Atomicity in `AbonoGlobalModal` (BRECHA-004)
- Standalone loan egress for BANCO/EFECTIVO (BRECHA-007)
- No DB schema or sync-rules changes

## Capabilities

### New Capabilities
- `prestamo-abono-flow`: end-to-end UX path for paying a loan cuota from `PrestamosPage` through the unified `PagoFacturaModal`

### Modified Capabilities
- None — `PagoFacturaModal` internal behavior unchanged; only new entry point added

## Approach

1. **Lift modal state** in `PrestamoDetalleModal`: add `pagoModalOpen` flag + hold the current `vencimiento` ref.
2. **Add "Abonar" button** — conditional on `vencimiento.status === 'PENDIENTE'`.
3. **Render `PagoFacturaModal`** inside `PrestamoDetalleModal` passing `ventaId`, `clienteId`, and the `vencimiento` object (mirrors the pattern in `factura-detalle-cxc.tsx`).
4. **Remove `FormAbonoPrestamo`** — no logic lives there; safe deletion after step 3 works.
5. **Verify reactivity**: confirm the `usePrestamos` / `PrestamosPage` query uses `usePowerSyncQuery` (auto-reactive) — no manual refetch needed.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/ventas/components/prestamo-detalle-modal.tsx` | Modified | Add Abonar button + PagoFacturaModal; remove FormAbonoPrestamo |
| `src/features/cxc/components/pago-factura-modal.tsx` | Read-only verify | Ensure props accept null `ventaId` (standalone loans) — backward-compatible |
| `src/features/ventas/components/prestamos-page.tsx` | Read-only verify | Confirm PowerSync query subscription is active |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `ventaId` is null for standalone loans; modal crashes | Med | Check PagoFacturaModal already handles null ventaId in Cuota tab path |
| `PagoFacturaModal` prop types don't accept vencimiento directly | Low | Inspect current props; may need a small type extension |
| PowerSync query not reactive after remote payment | Low | Verify query uses `usePowerSyncQuery`; add watchable table if missing |

## Rollback Plan

All changes are confined to `prestamo-detalle-modal.tsx`. If rollback is needed: revert that file to the previous version (FormAbonoPrestamo is restored). No DB changes, no sync-rules changes, no other files are destructively altered.

## Dependencies

- `PagoFacturaModal` must accept an optional `vencimientos` prop (already confirmed — it does via `factura-detalle-cxc.tsx` usage)
- No new packages required

## Success Criteria

- [ ] Clicking a PENDIENTE loan in PrestamosPage → PrestamoDetalleModal opens
- [ ] "Abonar" button visible only when `status = 'PENDIENTE'`; hidden otherwise
- [ ] Clicking "Abonar" opens PagoFacturaModal directly on "Cuota" tab with the correct cuota pre-selected
- [ ] Payment recorded via `registrarAbonoPrestamo` (unchanged logic path)
- [ ] After payment: PrestamoDetalleModal history updates; PrestamosPage table row reflects new status
- [ ] `FormAbonoPrestamo` no longer exists in the codebase
- [ ] No TypeScript errors (`yarn type-check` passes)
- [ ] All existing CxC callers of PagoFacturaModal unaffected
