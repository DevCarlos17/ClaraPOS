# Tasks: CxC–Préstamos Modal Unificación

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~275 gross (additions + deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | N/A |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full unification — all 4 files | Single PR | Atomic, ~275 gross lines; all tasks cohesive |

---

## Phase 1: Foundation

- [x] **TASK-001** · `src/features/cxc/hooks/use-cxc.ts` · Add `cliente_id: string` to `VencimientoPrestamo` interface (after `origen_fondos_tipo`). Deps: none. ~1 line.
- [x] **TASK-002** · `src/features/ventas/components/prestamos-page.tsx` · Add `vc.cliente_id` to SELECT at line 183 (between `vc.origen_fondos_tipo` and `v.nro_factura`). Verify import `useQuery` is already from `@powersync/react` (REQ-004 satisfied — no further change). Deps: TASK-001. ~1 line.

---

## Phase 2: Extend PagoFacturaModal

- [x] **TASK-003** · `src/features/cxc/components/pago-factura-modal.tsx` · Add `type VencimientoPrestamo` to the existing import from `../hooks/use-cxc`. Deps: TASK-001. ~1 line.
- [x] **TASK-004** · `src/features/cxc/components/pago-factura-modal.tsx` · Add optional props `defaultDestino?: 'FACTURA' | 'PRESTAMO'` and `vencimientoInicial?: VencimientoPrestamo` to `PagoFacturaModalProps`; destructure in function signature with default `defaultDestino = 'FACTURA'`. Deps: TASK-003. ~4 lines.
- [x] **TASK-005** · `src/features/cxc/components/pago-factura-modal.tsx` · In the `isOpen` reset `useEffect`: replace `setDestino('FACTURA')` with `setDestino(defaultDestino ?? 'FACTURA')`; replace auto-select with `setVencimientoId(vencimientoInicial?.id ?? (prestamosActivos.length === 1 ? prestamosActivos[0].id : ''))`. Deps: TASK-004. ~3 lines.
- [x] **TASK-006** · `src/features/cxc/components/pago-factura-modal.tsx` · (a) Change guard line 119: `if (!factura) return null` → `if (!factura && defaultDestino !== 'PRESTAMO') return null`. (b) Make `saldoPend` and `totalFactura` safe: `const saldoPend = factura ? parseFloat(factura.saldo_pend_usd) : 0` and same for `totalFactura`. (c) Build `effectiveVencimientos`: merge `vencimientoInicial` into `vencimientos` if its `id` is absent; update `prestamosActivos` to filter from `effectiveVencimientos`. Deps: TASK-004. ~8 lines.
- [x] **TASK-007** · `src/features/cxc/components/pago-factura-modal.tsx` · Conditionalize UI for `!factura` mode: (a) wrap FACTURA/PRESTAMO tab toggle in `{factura && tienePrestamoActivo && ...}` so it only renders when a factura is present; (b) wrap FACTURA summary block in `{destino === 'FACTURA' && factura && ...}`; (c) in PRESTAMO section header, replace `factura.nro_factura` with: show `Préstamo vinculado a factura #${factura.nro_factura}` only when `factura !== null`, else show `Préstamo sin factura asociada`. Deps: TASK-006. ~5 lines.

---

## Phase 3: Refactor PrestamoDetalleModal

- [x] **TASK-008** · `src/features/ventas/components/prestamo-detalle-modal.tsx` · Remove `FormAbonoPrestamoProps` interface (lines 112–116) and `FormAbonoPrestamo` function (lines 118–315). Remove `showAbonoForm` state (line 329). Remove now-unused imports: `useEffect`, `toast`, `useCurrentUser`, `useMetodosPagoActivos`, `useTasaActual`, `db`, `localNow`, `registrarAbonoPrestamo`, `formatBs`, `usdToBs`, `bsToUsd`. Deps: none. ~−210 lines.
- [x] **TASK-009** · `src/features/ventas/components/prestamo-detalle-modal.tsx` · Add `import { PagoFacturaModal } from '@/features/cxc/components/pago-factura-modal'`. Add state `const [pagoModalOpen, setPagoModalOpen] = useState(false)`. Remove `setShowAbonoForm(false)` from the `onOpenChange` handler. Deps: TASK-008. ~3 lines.
- [x] **TASK-010** · `src/features/ventas/components/prestamo-detalle-modal.tsx` · Remove `showAbonoForm` conditional block (lines 502–514) and "Registrar Abono" button (lines 521–528). In footer: add "Abonar" button visible only when `prestamo.status === 'PENDIENTE' && saldoPend > 0.005` that sets `pagoModalOpen = true`. Render `<PagoFacturaModal factura={null} clienteId={prestamo.cliente_id} clienteNombre={prestamo.cliente_nombre} vencimientos={[prestamo]} defaultDestino="PRESTAMO" vencimientoInicial={prestamo} isOpen={pagoModalOpen} onClose={() => setPagoModalOpen(false)} onSuccess={() => setPagoModalOpen(false)} />`. Deps: TASK-009, TASK-004. ~+15, −20 lines.

---

## Phase 4: Verification

- [x] **TASK-011** · All files · Run `yarn type-check` — must pass with zero errors. Fix any residual TypeScript issues (e.g., non-null assertions on `factura` in `handleSubmit`). Deps: all above. ~0 lines. **Result: 0 errors in changed files; only pre-existing test infra errors in *.test.ts files unrelated to this change.**
- [x] **TASK-012** · Manual · Open existing CxC callers (`factura-detalle-cxc.tsx`, `cxc-cliente-detalle.tsx`) — verify rendering is identical to pre-change (REQ-002 backward compat). Deps: TASK-007. 0 lines. **Result: Both callers omit new props; defaults apply; guard unchanged for non-null factura paths.**
- [ ] **TASK-013** · Manual · PENDIENTE loan → click "Abonar" → `PagoFacturaModal` opens in PRESTAMO mode with cuota pre-selected, FACTURA selector hidden → complete payment → historial updates in place, `PrestamosPage` row reflects new `saldo_pendiente_usd` / `status` automatically without refresh (REQ-001, REQ-003, REQ-004). Deps: TASK-010. 0 lines.
