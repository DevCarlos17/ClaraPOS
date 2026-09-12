# Proposal: NotaCreditoPosModal responsive (mobile master-detail)

## Intent

`NotaCreditoPosModal` (entrada POS de NC) uses a two-column grid (`grid-cols-1 md:grid-cols-2`) that on mobile stacks list + detail vertically instead of switching between them. On a phone this forces the cajero to scroll past the full invoice list to reach the fiscal detail panel and footer actions, which is unusable at typical phone heights. The modal must become a true single-column master-detail on phones while staying pixel-identical on desktop.

## Scope

### In Scope
- Mobile (`<768px`): show ONLY the invoice list first (full width); selecting a factura hides the list and shows ONLY the detail column (desglose + reveal-gate NC + footer) full width; "Volver" returns to the list.
- Mobile: dialog becomes full-screen (`w-screen h-dvh`, no rounded corners).
- Scope the QA `minHeight: 420px` inline style to `md:` only so it doesn't force scroll on short phones.
- Desktop (`md:`+): zero visual/behavioral change — same two-column layout, same dialog sizing.

### Out of Scope
- Any change to `emitirNc`/`crearNotaCredito` logic, reveal-gate NC flow, Reimprimir wiring, PIN gating.
- `factura-detalle-panel.tsx`, `components/ui/dialog.tsx`, or any other shared file.
- New state, new hooks, or the `useMobile` hook (confirmed dead code, rejected pattern per prior decision).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `notas-credito-pos`: add a new requirement for responsive mobile master-detail layout of the POS NC entry modal (ADDED requirement, no existing requirement text changes).

## Approach

Pure Tailwind conditional classes driven by the EXISTING `factura` state (derived from `facturaId`, null = no selection). No new state.

- Left column (list): `${factura ? 'hidden' : 'flex'} md:flex flex-col min-h-0`
- Right column (detail): `${factura ? 'flex' : 'hidden'} md:flex flex-col min-h-0 md:border-l md:pl-4 overflow-y-auto`, `minHeight: 420px` inline style scoped to `md:` only
- Dialog: mobile-first full-screen (`w-screen h-dvh max-w-none rounded-none`), overridden at `md:` back to today's `max-w-4xl max-h-[85vh] rounded-lg`
- Footer: unchanged — already a sibling gated by `{factura && ...}`, travels with detail view for free
- Volver handler: unchanged — already resets `facturaId` to `null`

Rationale (per modern-web-guidance consult): this is viewport-driven (dialog occupies the whole screen and the layout responds to available screen real estate), so Tailwind `md:` media-query breakpoints are correct — container queries are for size-aware components nested in variable-width containers, not applicable here. `h-dvh` (not `h-screen`) is used for correct behavior with mobile browser dynamic toolbars (Safari/Chrome); Baseline widely available.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/ventas/components/nota-credito-pos-modal.tsx` | Modified | Dialog classes (~429/431), grid container (~445), left column wrapper (~446), right column wrapper (~529-531) |
| `src/features/ventas/components/__tests__/nota-credito-pos-modal.test.tsx` | Modified | New assertions for conditional classes per `factura` state; existing 59 tests must stay green |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `minHeight: 420px` forces scroll on short mobile screens | Medium | Scope the inline style to apply only at `md:` (conditional style object or CSS class swap) |
| jsdom doesn't compute CSS visibility, limiting automated coverage | High (known) | Assert class-presence as the testable contract per `factura` state; final gate is manual QA on a real phone |
| `h-dvh` browser support edge cases | Low | `dvh` is Baseline widely available; documented as intentional choice over `vh` |

## Rollback Plan

Single-file, purely additive className/style changes with no new state or logic branches. Revert via `git revert` of the single commit; no data migrations, no shared-file blast radius.

## Dependencies

None — builds directly on the already-merged QA adjustments (`ajustes-qa-nota-credito-pos-modal`) on the same branch.

## Success Criteria

- [ ] On mobile, only one column (list OR detail) is visible at a time, full width, driven by `factura` state
- [ ] Dialog is full-screen on mobile (`w-screen h-dvh`), unchanged two-column card on desktop
- [ ] `minHeight: 420px` no longer applies below `md:`
- [ ] All 59 existing NC-POS tests remain green; new tests cover conditional classes and Volver-returns-to-list behavior
- [ ] Manual QA confirms real single-column switching on an actual phone viewport
