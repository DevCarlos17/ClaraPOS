# Delta for tesoreria-consolidacion-cierre

> Known dependency (out of scope): historical sessions with a caja diferencia may have posted `totalSistemaD` instead of the reported amount — reconciliation needs separate business authorization (obs #2554). Also out of scope: the "rechazar" action for tesorería pendientes.

## MODIFIED Requirements

### Requirement: Routing per payment method

The system MUST route each used method's consolidation amount to: EFECTIVO/USD → USD caja fuerte; EFECTIVO/VES → Bs caja fuerte; other tipo with `banco_empresa_id` → that bank. USD/Bs sums MUST NOT mix — each method keeps its own `moneda_id`, `tasa_cambio='1'`. Rows with `metodo_cobro_id IS NULL` (SAF) or `totalSistemaD <= 0` MUST be skipped. A method with `deposito_directo = 1` MUST be excluded entirely — its bank INGRESO already posted at sale time (`use-ventas.ts`), avoiding a duplicate. For a `deposito_directo = 0` (by-batch) method routed here — including EFECTIVO — the amount passed to `consolidarMetodoATesoreriaEnTx` MUST be the cashier's reported/counted amount (backing `sesiones_caja_detalle.total_fisico`), NOT `totalSistemaD`. A by-batch method absent from the reported counts MUST resolve to its explicit reported value, MUST NOT silently substitute `totalSistemaD`, and MUST carry `Decimal`/`NUMERIC` precision, no float loss. For a by-batch method with a bank commission configured, `aplicarComisionSiCorresponde` MUST compute that commission on the same reported/deposited amount, NOT on `totalSistemaD` — aligning the sin-lotes branch with the lotes-POS branch, which already bases both deposit and commission on the reported amount. The faltante/cuadre computation (`totalFisicoNativo` vs `totalSistemaD`) is unaffected.
(Previously: routed every by-batch method's `totalSistemaD` and computed its commission on that same system total, ignoring the reported count; the `deposito_directo=1` exclusion from `doble-consolidacion-directos-cierre` is unchanged.)

#### Scenario: Mixed cierre — efectivo USD + efectivo Bs + commission POS

- GIVEN a session with EFECTIVO USD, EFECTIVO VES, and a PUNTO method with `comision_pct=3`
- WHEN cerrarSesionCaja consolidates
- THEN a pending `mov_caja_fuerte` INGRESO (`origen='DEPOSITO_CIERRE'`, `validado=0`) lands per currency, and a pending `movimientos_bancarios` INGRESO (`origen='CIERRE_CONSOLIDACION'`, `validado=0`) lands in PUNTO's bank
- AND each has a `traspasos_tesoreria` row tagged `cuenta_origen_tipo='SESION_CAJA'`, `sesion_caja_id`

#### Scenario: SAF and zero-total methods skipped

- GIVEN the SAF virtual row and a configured method with `totalSistemaD = 0`
- WHEN consolidation runs
- THEN neither produces a transfer, movement, or traspaso row

#### Scenario: Reversed payments already excluded

- GIVEN a payment marked `is_reversed` during the session
- WHEN `totalSistemaD` is computed (existing upstream logic)
- THEN the reversed amount is already netted out; consolidation needs no separate handling

#### Scenario: Direct method consolidated once at sale, skipped at cierre

- GIVEN a `deposito_directo=1` bank method used in a sale, INGRESO already posted at sale time
- WHEN cerrarSesionCaja consolidates
- THEN it's excluded from `metodosParaConsolidar`'s write path — no extra `movimientos_bancarios` row (unaffected by the amount-source change)

#### Scenario: By-batch method still consolidates at cierre, reported equals system

- GIVEN a `deposito_directo=0` bank method whose cashier-reported count equals `totalSistemaD`
- WHEN cerrarSesionCaja consolidates
- THEN it routes through `consolidarMetodoATesoreriaEnTx` as before — one INGRESO, one saldo update, one traspaso row — for that reported amount (baseline case, matches system total)

#### Scenario: Reported amount below system amount (faltante)

- GIVEN a by-batch PUNTO method with `totalSistemaD = 1000` Bs where the batch failed and the cashier reports `0`
- WHEN cerrarSesionCaja consolidates
- THEN tesorería receives `0` Bs, not `1000`
- AND `sesiones_caja_detalle` still records the `1000` Bs faltante — that detection is unaffected

#### Scenario: Commission computed on reported amount, not system total

- GIVEN the same by-batch PUNTO method (`totalSistemaD = 1000` Bs, reported `0`) with `comision_pct` configured
- WHEN `aplicarComisionSiCorresponde` runs during consolidation
- THEN the commission base is `0` — no commission posts for money that never entered tesorería

#### Scenario: Commission unchanged when reported equals system total

- GIVEN a by-batch PUNTO method with `comision_pct` configured where the reported count equals `totalSistemaD`
- WHEN cerrarSesionCaja consolidates
- THEN the commission is computed on that shared amount, same as before — baseline, no regression

#### Scenario: Reported amount above system amount (sobrante), decimal precision preserved

- GIVEN a by-batch method where the cashier's reported count (e.g. `123.45`) exceeds `totalSistemaD`
- WHEN cerrarSesionCaja consolidates
- THEN tesorería receives the higher reported amount, carried as `Decimal`/`NUMERIC` with no rounding loss, not the lower system total

#### Scenario: Efectivo uses counted cash, not accumulated sales

- GIVEN an EFECTIVO method with sales accumulating `totalSistemaD` and a distinct cashier-counted `total_fisico`
- WHEN cerrarSesionCaja consolidates
- THEN the `mov_caja_fuerte` INGRESO amount equals the counted cash, not the accumulated sales total

#### Scenario: By-batch method used but never reported (no fallback)

- GIVEN a by-batch method with `totalSistemaD > 0` and no entry in the cashier's reported counts for it
- WHEN cerrarSesionCaja consolidates
- THEN the resolved amount is `0` — explicit "not reported", never a `totalSistemaD` substitution
- AND the faltante equals the full `totalSistemaD`, same as if the cashier counted zero

#### Scenario: Mixed cierre — direct and by-batch together

- GIVEN one `deposito_directo=1` and one `deposito_directo=0` method, both with activity
- WHEN cerrarSesionCaja consolidates
- THEN only the by-batch method writes, using its reported amount; the direct method produces none; `sesiones_caja_detalle`'s snapshot is unaffected for both

#### Scenario: Excluded direct method also skips its deducciones (accepted, pre-existing)

- GIVEN a `deposito_directo=1` method with an active `metodo_cobro_deducciones` row
- WHEN it is excluded from the loop
- THEN no commission/ISLR gasto posts — accepted pre-existing behavior, not a regression

#### Scenario: Manual POS→Tesorería traspaso is unaffected

- GIVEN a user creates a manual traspaso via `crearTraspasoSesionATesoreria`
- WHEN it calls the shared `consolidarMetodoATesoreriaEnTx`
- THEN behavior is unchanged — the reported-amount resolution lives in the automatic loop's call site, not in the shared function's signature
</content>
