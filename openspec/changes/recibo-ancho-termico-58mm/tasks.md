# Tasks: Ancho unificado de recibo (58mm térmico, 32 caracteres)

> **Scope correction (orchestrator)**: PDF path (`buildReciboPdfBlob`) is OUT of scope.
> Only PNG/texto (`construirLineasRecibo`, `buildReciboTextoPlano`, `buildReciboImagenBlob`)
> changes. The reported misalignment bug lives only in the monospace PNG/texto path, which
> is also the future ESC/POS thermal base. PDF uses autoTable + helvetica, is internally
> coherent, and stays untouched.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~60-80 (single file + its test) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `RECIBO_ANCHO_CHARS` + `generarSeparador()` + PNG width derivation, all with tests | PR 1 | Single self-contained commit/PR. Tests ship with the behavior. |

## Phase 1: Foundation — canonical width constant

- [x] 1.1 RED: In `src/features/ventas/utils/__tests__/factura-export.test.ts`, add `describe('generarSeparador', ...)` with 2 tests: default call returns exactly 32 dashes (`'-'.repeat(32)`); `generarSeparador(10)` returns exactly 10 dashes. Import `generarSeparador` from `'../factura-export'` (will fail: not exported yet).
- [x] 1.2 GREEN: In `src/features/ventas/utils/factura-export.ts` replace line 219 (`const SEPARADOR = '-'.repeat(40)`) with: `export const RECIBO_ANCHO_CHARS = 32`, an exported pure `generarSeparador(chars: number = RECIBO_ANCHO_CHARS): string { return '-'.repeat(chars) }`, and `const SEPARADOR = generarSeparador()`.
- [x] 1.3 Run `yarn test:run` — confirm the 2 new tests pass and no other test broke (no existing test asserts a 40-char separator).

## Phase 2: PNG width derivation (measured, not hardcoded)

- [x] 2.1 RED: Add `describe('medirAnchoPngDesdeSeparador', ...)` test reusing the existing `mockCtx()` pattern from `recibo-pagos.test.ts` (10px/char, deterministic): `medirAnchoPngDesdeSeparador(mockCtx(), '-'.repeat(32), 24)` must equal `32 * 10 + 24 * 2` (344). Import will fail: not exported yet.
- [x] 2.2 GREEN: In `factura-export.ts`, remove the module-level `const PNG_ANCHO = 480` (line 480). Add exported pure helper `medirAnchoPngDesdeSeparador(ctx: CanvasRenderingContext2D, separador: string, padding: number): number { return ctx.measureText(separador).width + padding * 2 }` near the PNG constants block.
- [x] 2.3 GREEN: In `buildReciboImagenBlob`, right after the `if (!ctx) {...}` guard, set `ctx.font = '13px monospace'` and compute `const pngAncho = medirAnchoPngDesdeSeparador(ctx, SEPARADOR, PNG_PADDING)`. Replace `const maxWidthPx = PNG_ANCHO - PNG_PADDING * 2` with `const maxWidthPx = pngAncho - PNG_PADDING * 2`. Replace the two remaining `PNG_ANCHO` usages (`canvas.width = PNG_ANCHO * PNG_ESCALA` and `ctx.fillRect(0, 0, PNG_ANCHO, alto)`) with `pngAncho`.
- [x] 2.4 Run `yarn test:run` — confirm new test passes. The existing `buildReciboImagenBlob` "no 2D context" test must still pass unchanged (happy-dom returns `null` from `getContext('2d')` before this code path runs).

## Phase 3: Verification

- [x] 3.1 Run `yarn test:run` (full suite green) and `yarn type-check:test` (no type errors).
- [x] 3.2 Manual reasoning check (no automated byte-level PDF/PNG assertions — consistent with documented DEUDA-3): with `SEPARADOR` now 32 dashes and `maxWidthPx` derived from measuring that same 32-char string in `13px monospace`, wrapped article names / addresses / payment refs and the dash separators share identical width — nothing can render past the separator boundary in PNG or plain text.
- [x] 3.3 Confirm `buildReciboPdfBlob` (lines ~330-474) and its `wrapPdfText`/autoTable call-sites were NOT touched — `git diff` must show changes only in `factura-export.ts` (PNG/texto sections) and its test file.

## Phase 4: Hygiene

- [x] 4.1 Stage selectively (`git add src/features/ventas/utils/factura-export.ts src/features/ventas/utils/__tests__/factura-export.test.ts`) — never `git add -A`. Working tree noise (`coverage/`, `image*.png`, `.atl/*`, other `openspec/changes/*`) must NOT be included.
- [x] 4.2 Single commit: `fix(ventas): unificar ancho de recibo PNG/texto a 32 caracteres (58mm)`.
