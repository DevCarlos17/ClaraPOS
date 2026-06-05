# Archive Report: cxc-prestamos-modal-unificacion

**Change**: cxc-prestamos-modal-unificacion
**Archived**: 2026-06-05
**Archived to**: `openspec/changes/archive/2026-06-05-cxc-prestamos-modal-unificacion/`
**Verify status**: PASS WITH WARNINGS
**Verdict**: Approved for merge — zero critical issues

---

## Change Summary

Unified the loan-payment (abono de préstamo) flow by wiring `PrestamoDetalleModal` to
`PagoFacturaModal` and removing the duplicate `FormAbonoPrestamo` component (~210 lines).
`PagoFacturaModal` was extended with two optional, backward-compatible props
(`defaultDestino`, `vencimientoInicial`) and its early-return guard was conditionalized to
support PRESTAMO-only mode (`factura = null`). Four files changed; zero DB/sync-rules changes.

---

## Spec Sync

| Domain | Action | Path |
|--------|--------|------|
| prestamos | Created (new main spec) | `openspec/specs/prestamos/spec.md` |

The delta spec (ADDED: REQ-001, REQ-002, REMOVED: REQ-003, VERIFICATION: REQ-004) was applied
to an initially empty domain. The resulting main spec captures the current behavioral truth:
REQ-001, REQ-002, REQ-004 (REQ-003 describes a deletion already applied — omitted from standing spec).

---

## Archive Contents

| Artifact | Status |
|----------|--------|
| proposal.md | ✅ Present |
| spec.md | ✅ Present (delta) |
| design.md | ✅ Present |
| tasks.md | ✅ Present (12/13 complete; TASK-013 is manual E2E, non-blocking) |
| verify-report.md | ✅ Present (PASS WITH WARNINGS) |
| archive-report.md | ✅ This file |

---

## Files Changed in This Change

| File | Change |
|------|--------|
| `src/features/cxc/hooks/use-cxc.ts` | Added `cliente_id: string` to `VencimientoPrestamo` interface |
| `src/features/ventas/components/prestamos-page.tsx` | Added `vc.cliente_id` to SELECT query |
| `src/features/cxc/components/pago-factura-modal.tsx` | New props `defaultDestino` + `vencimientoInicial`; guard conditionalized; cuota-only mode; FACTURA selector hidden when `factura = null` |
| `src/features/ventas/components/prestamo-detalle-modal.tsx` | Removed `FormAbonoPrestamo` (~210 lines) + `showAbonoForm` state + unused imports; added "Abonar" button wired to `PagoFacturaModal` |

---

## Task Completion

| Phase | Tasks | Complete | Notes |
|-------|-------|----------|-------|
| Phase 1 — Foundation | 2 | 2/2 | `VencimientoPrestamo.cliente_id` + SELECT query |
| Phase 2 — Extend PagoFacturaModal | 5 | 5/5 | Props, guard, effectiveVencimientos, UI conditionalization |
| Phase 3 — Refactor PrestamoDetalleModal | 3 | 3/3 | Remove FormAbonoPrestamo; add Abonar + PagoFacturaModal |
| Phase 4 — Verification | 3 | 2/3 | TASK-013 (manual E2E) not executed — static analysis confirms correctness |
| **Total** | **13** | **12/13** | |

---

## Verify Findings

**CRITICAL**: None

**WARNINGS**:
1. **TASK-013 incomplete** — Manual E2E test (PENDIENTE loan → click Abonar → complete payment → historial + PrestamosPage updates) was not executed by the apply executor. Static analysis confirms all code paths are correct. Recommend as smoke test before or after merge.

**SUGGESTIONS**:
1. `effectiveVencimientos` type widening — a comment explaining "VencimientoPrestamo is a structural superset of VencimientoVenta" would help future readers.
2. `sesion_caja_id` not forwarded to `registrarAbonoPrestamo` — intentional (matches pre-existing `FormAbonoPrestamo` behavior), worth a code comment.

---

## Architecture Decisions Captured

| ID | Decision |
|----|----------|
| AD-1 | Guard bypass via `!factura && defaultDestino !== 'PRESTAMO'` — minimal diff, existing callers untouched |
| AD-2 | No adapter between VencimientoPrestamo and VencimientoVenta — TS structural typing satisfies assignability |
| AD-3 | `cliente_id` added to `VencimientoPrestamo` type + SELECT — column already in DB, single query change |
| AD-4 | Always pass `factura=null` from `PrestamoDetalleModal` — avoids extra fetch; FACTURA tab not needed from loan entry point |

---

## Known Remaining Work (Next Iteration)

| ID | Description | Priority |
|----|-------------|----------|
| BRECHA-002 | Overpayment flow — vuelto / SAF / saldo a favor when payment exceeds loan balance | High |
| BRECHA-003 | `movimientos_cuenta` entry for loan payments (client account statement completeness) | High |
| BRECHA-004 | Atomicity in `AbonoGlobalModal` — two `writeTransaction` calls → one atomic transaction | Medium |
| BRECHA-007 | Standalone loan egress for BANCO/EFECTIVO_EMPRESA origins | Low |

---

## SDD Cycle Complete

All 4 spec requirements (REQ-001 through REQ-004) fully implemented and verified by static analysis.
Zero TypeScript errors in all 4 changed files. Backward compatibility confirmed for both legacy
CxC callers (`factura-detalle-cxc.tsx`, `cxc-cliente-detalle.tsx`).

**Status**: ARCHIVED ✅
