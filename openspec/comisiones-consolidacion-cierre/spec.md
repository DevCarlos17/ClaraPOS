# Delta Spec: tesoreria-consolidacion-cierre

_Change: `comisiones-consolidacion-cierre` (Cambio B, Pieza 1 ONLY) | Date: 2026-08-03_

> Modifies `openspec/specs/tesoreria-consolidacion-cierre/spec.md`. Scope: migrate cierre commission computation from single `comision_pct` to N-`metodo_cobro_deducciones` + fix `nro_gasto`. Sale-time "deposito directo" path is Cambio C.

## Correction to Proposal (verified against code)

Proposal D4 assumes `insertarGastoComisionEnTx` posts no `libro_contable` entry. **False**: it calls `generarAsientosGasto` (`use-gastos.ts` L626-642), which inserts real double-entry rows (`generar-asientos.ts` L98, L675) today. Removing that posting is Out of Scope here, so this spec **preserves it unchanged** — once per active deducción instead of once per método.

## MODIFIED Requirements

### Requirement: Commission booked as a real gasto (Option A2)

For a method toward `destino.tipo === 'BANCO'`, the system MUST read all active `metodo_cobro_deducciones` rows (`WHERE is_active = 1 ORDER BY orden`) and, for EACH, create its OWN `gastos` row for `montoBase * porcentaje / 100` against that row's `cuenta_gasto_id` — not via `cuentas_config['COMISION_BANCARIA']`. `montoBase` MUST be the native-currency amount already being consolidated (plain `totalSistemaD`, per-lote, or lote-sum); no USD conversion of the base. `tipo` (`COMISION`/`ISLR`/`OTRO`) MUST NOT change routing. `nro_gasto` MUST use a UUID-slice pattern (e.g. `POS-COM-${sesionCajaId.slice(0,8)}-${orden}`), never `COUNT(*)`. An EFECTIVO/caja-fuerte método with an active deducción stays not commission-eligible — skipped with `console.warn` (W5 preserved). A deducción with empty/null `cuenta_gasto_id` MUST hard-fail the cierre naming método and concepto, never posting an orphan gasto.
(Previously: single `comision_pct` on `metodos_cobro`, one gasto per método via `cuentas_config['COMISION_BANCARIA']`, `nro_gasto` via `COUNT(*)`.)

#### Scenario: N active deducciones produce N gastos with own cuentas

- GIVEN a PUNTO método toward BANCO with 2 active deducciones (COMISION 3%, ISLR 2%), gross 1000 VES, `tasaDelDia=40`
- WHEN cerrarSesionCaja consolidates (plain, per-lote, or lote-sum path alike)
- THEN 2 `gastos` rows post — 30 VES and 20 VES — each against its own `cuenta_gasto_id`, own `nro_gasto`, own `libro_contable` pair, base always native-currency

#### Scenario: Inactive deducción skipped

- GIVEN a método with one deducción row `is_active=0`
- WHEN consolidation runs
- THEN no gasto posts for that row

#### Scenario: nro_gasto is UUID-slice based, collision-free

- GIVEN two devices closing sessions concurrently, each posting deducción gastos
- WHEN both cierres run
- THEN each `nro_gasto` derives from `sesionCajaId`+`orden`, never a shared `COUNT(*)` — no collision

#### Scenario: EFECTIVO método with a deducción is warned and skipped

- GIVEN an EFECTIVO método (destino CAJA_FUERTE) with an active deducción configured
- WHEN consolidation runs
- THEN a `console.warn` fires naming the método; no gasto posts

#### Scenario: VES-native método requires tasaDelDia, base stays native

- GIVEN a VES-native método with active deducciones and no `tasaDelDia`
- WHEN consolidation attempts the deducción step
- THEN it hard-fails as today; once `tasaDelDia` is present, the percentage applies to the native VES base — `tasaDelDia` only converts the gasto's USD-equivalent bookkeeping

#### Scenario: Missing cuenta_gasto_id hard-fails defensively

- GIVEN an active deducción with empty/null `cuenta_gasto_id` (defensive case; should not occur per PR-3)
- WHEN consolidation reaches it
- THEN the cierre throws naming método and concepto; session stays `ABIERTA`; no row persists

#### Scenario: Zero active deducciones — no regression

- GIVEN a método with zero active deducciones
- WHEN consolidation runs
- THEN zero commission gastos post; ingreso consolidation is unchanged from today

#### Scenario: No double-posting under the existing single-cierre guarantee

- GIVEN a session already `CERRADA` (deducción gastos posted)
- WHEN any path attempts to re-run consolidation for it
- THEN the existing status guard blocks it — no new idempotency mechanism added

#### Scenario: Reversing a cierre's commissions requires N anularGasto calls

- GIVEN a cierre posted 2 deducción gastos for one método
- WHEN a user reverses that cierre's commissions
- THEN each gasto is anulled individually via existing `anularGasto` — no bulk-reversal function added

## Out of Scope (reaffirmed)

- Sale-time `deposito_directo` egreso and cierre-loop double-booking exclusion — Cambio C.
- Removing/altering the existing `libro_contable` posting in gasto creation — flagged above, not resolved here.
- Cross-método grouping of gastos sharing a `cuenta_gasto_id` — unconfirmed, not committed.
