# Proposal: CxC/CxP Mobile Responsive — Phase 2 (master-detail + row→card)

PHASE 2 of `cxc-cxp-rediseno-responsive`. Phase 1 (button color, top-5 lists, CxP search) shipped in PR #107, merged to `develop`. This change branches from `develop` on `feat/cxc-cxp-mobile-responsive`.

## Intent
CxC/CxP left-panel+detail layout is `grid-cols-1 md:grid-cols-3`: on phones both columns stack full-height, forcing the cajero to scroll past the debtor list to reach payment actions, and each debt row is a dense table row unreadable at phone width. This change makes both screens usable on phones via 2-step master-detail navigation and row→card conversion, reusing the proven `NotaCreditoPosModal` Tailwind `md:` pattern (pure conditional classes on existing selection state, no revived `use-mobile`). Desktop stays byte-identical.

## Scope
### In Scope
- CxC (`cxc-list.tsx` + `cxc-cliente-detalle.tsx`): mobile 2-step master-detail driven by existing `clienteSeleccionado` state; existing close "X" doubles as Volver; debts table → card list on `<md`.
- CxP (`cxp-page.tsx`): mobile 2-step master-detail driven by existing `proveedorSeleccionado` state; **new** Volver control (none exists today — `DetallePanel` has no close/back affordance); facturas table AND gastos table → card lists on `<md`.
- New shared presentational `src/components/shared/deuda-card.tsx` (normalized props, no CxC/CxP domain types) reused by CxC (1 table) and CxP (2 tables) — avoids 3x duplicated card markup.
- Toolbar reflow (`flex-wrap`/stacked) on both detail headers for phone width.

### Out of Scope
- Desktop layout/behavior (byte-identical, additive `md:`-scoped classes only).
- Pagar/Abono Global/Imprimir business logic, `empresa_id` filtering, bimonetario/decimal precision — unchanged.
- Merging CxC/CxP into one shared screen component (they share nothing structurally beyond the card; documented as future architecture debt in Phase 1 exploration).
- True mobile visual QA (jsdom cannot compute CSS visibility — requires a human on a real device).

## Capabilities
### New Capabilities
- `cxc-mobile-responsive`: 2-step master-detail + row→card for the CxC debts screen on `<768px`.
- `cxp-mobile-responsive`: 2-step master-detail + row→card (2 tables: facturas + gastos) for the CxP debts screen on `<768px`, including a new Volver control.

### Modified Capabilities
None — additive presentational capabilities layered on Phase 1's screens; no existing spec covers mobile layout for either screen.

## Approach
Pure Tailwind `md:` conditional classes driven by the EXISTING selection state var per screen — no new state: list panel `${selected ? 'hidden' : 'flex'} md:flex`, detail panel `${selected ? 'flex' : 'hidden'} md:flex`, full width on `<md`. Row→card: `<table>` gets `hidden md:block`; a sibling `<div className="md:hidden">` renders one `DeudaCard` per row via shared component, reusing the same row data and `onPagar`/`onVerDetalle` handlers. **Extract-vs-duplicate decision: extract.** `deuda-card.tsx` is built first (low risk, presentational, no business logic) because CxP needs the card shape twice and CxC once — duplicating the same markup 3x carries more long-term drift risk than one small shared component with normalized props.

## Affected Areas
| Area | Impact | Description |
|---|---|---|
| `src/components/shared/deuda-card.tsx` | New | Shared card: numero/fecha/tipo/total/pendiente/equivBs?/accion |
| `src/features/cxc/components/cxc-list.tsx` | Modified | Master-detail `md:` wrapper classes |
| `src/features/cxc/components/cxc-cliente-detalle.tsx` | Modified | Table `hidden md:block` + card list `md:hidden`; toolbar wrap |
| `src/features/compras/components/cxp-page.tsx` | Modified | Master-detail classes, new Volver button, 2 tables → cards, toolbar wrap |

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| CxP has no existing back affordance | Med | Add explicit Volver button (`md:hidden`), test class-presence + click resets selection |
| jsdom can't verify real CSS visibility | High (inherent) | Assert class-presence contract as the testable proxy; mandatory manual phone QA gate before merge |
| Shared card diverges from a screen's exact fields later | Low | Keep props generic/normalized; each screen maps its own domain shape at the call site |
| Combined diff exceeds 400-line review budget in one PR | High | See `tasks.md` forecast — commit-level slicing + explicit reviewer flag (session fixed single-PR strategy) |

## Rollback Plan
Each work unit is its own commit on `feat/cxc-cxp-mobile-responsive`; revert the specific commit(s). No schema/migration/persisted data involved — presentational only.

## Dependencies
Phase 1 (`feat/cxc-cxp-rediseno-responsive`, PR #107) merged to `develop`. This branch is created from `develop` after that merge.

## Success Criteria
- [ ] CxC and CxP each show only ONE panel at a time on `<768px`, driven by existing selection state, no new state added
- [ ] Both screens' debt tables render as cards on `<768px`, tables on `md:`+
- [ ] CxP has a working Volver control; CxC's existing close "X" doubles as Volver
- [ ] Desktop (`md:`+) classes/behavior byte-identical to pre-change
- [ ] All existing CxC/CxP tests stay green + new structural/behavioral tests pass
- [ ] Manual phone QA confirms real visual switching (tracked as pending, not automatable)
