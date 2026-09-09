# pos-cobro-presentacion Specification

## Purpose

Lightweight UX requirements for the POS main screen and product search: total-amount readability and mobile dropdown usability. No business logic; acceptance criteria are observable/visual.

## Requirements

### Requirement: USD total is more readable on the desktop POS panel

On the desktop right panel of `pos-terminal.tsx` (`hidden md:flex`), the USD total font size MUST grow from the current `text-sm` to a size strictly between `text-sm` and the Bs total's `text-3xl` (e.g. `text-base` or `text-lg`). The USD total MUST remain visually muted (`text-muted-foreground` or equivalent) and MUST continue to render below the Bs total.

#### Scenario: Desktop panel renders both totals

- GIVEN the desktop POS panel (viewport ≥ 768px) with a non-zero cart total
- WHEN the totals block renders
- THEN the Bs total renders above the USD total
- AND the USD total's font-size is larger than `text-sm` but strictly smaller than the Bs total's `text-3xl`
- AND the USD total retains a muted text color distinct from the Bs total

### Requirement: Search results dropdown is fully usable on mobile

In `producto-buscador.tsx`, on viewports narrower than the project's unmodified Tailwind `md` breakpoint (768px), the search results dropdown MUST render at full viewport width (not clipped to the search input's width), so that long product names are not truncated more than necessary. On viewports ≥ 768px, the dropdown width MUST remain unchanged (tied to the search input width, as today).

#### Scenario: Mobile viewport — dropdown spans full width

- GIVEN a viewport narrower than 768px and the search input is focused with results
- WHEN the dropdown positions itself
- THEN its width uses the available viewport width (not the narrow input's width)
- AND long product names have materially more room before truncating

#### Scenario: Desktop viewport — unchanged behavior

- GIVEN a viewport ≥ 768px and the search input is focused with results
- WHEN the dropdown positions itself
- THEN its width matches the search input's width, unchanged from current behavior

#### Scenario: Dropdown repositions on resize/rotation

- GIVEN the dropdown is open and visible
- WHEN the viewport crosses the 768px boundary (resize or device rotation)
- THEN the dropdown width recalculates to match the new breakpoint's rule without requiring the dropdown to be closed and reopened
