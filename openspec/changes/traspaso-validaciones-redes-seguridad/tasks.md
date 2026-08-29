# Tasks: Validaciones y Redes de Seguridad — Traspaso de Inventario

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~415 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (size:exception) |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

Maintainer already approved `size:exception` for this change — the ~15-line overage is spec-mandated (`empresa_id` propagation into `leerStockDeposito` + `is_active` guard mock ripple), not scope creep. Do not re-raise a split decision.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full change (pure fns + wiring + guards + tests) | PR 1 (single) | size:exception approved; no chaining |

## Phase 1: Pure Functions — RED (lib/traspasos.ts)

- [x] 1.1 Write failing tests in `lib/__tests__/traspasos.test.ts` for `filtrarDepositosDisponibles`: excludes given id; no-op when id is empty string.
- [x] 1.2 Write failing tests for `hayArticulosCargados`: false on empty/all-blank `producto_id`; true with 1+ line loaded; true after plantilla load; false again after clearing table.
- [x] 1.3 Write failing tests for `puedeProcesarTraspaso` full matrix: no lineas; missing origen; missing destino; origen===destino; linea with empty `producto_id`; `producto_id` absent from `productosValidosIds`; producto absent from `stockDisponiblePorProducto`; `cantidad` > disponible; all-valid → habilitado true.
- [x] 1.4 Write failing tests for `evaluarGuardiaDepositosActivos`: origen inactive → `{bloqueado:true, lado:'origen'}`; destino inactive → `lado:'destino'`; both active → `{bloqueado:false}`.
- [x] 1.5 Run `yarn test:run` — confirm all new tests fail (RED).

## Phase 2: Pure Functions — GREEN

- [x] 2.1 Implement `filtrarDepositosDisponibles<T extends {id:string}>` in `lib/traspasos.ts`.
- [x] 2.2 Implement `hayArticulosCargados(lineas)`.
- [x] 2.3 Implement `EstadoTraspasoForm`, `ResultadoPuedeProcesar`, `puedeProcesarTraspaso` per design order: empty lineas → falta origen/destino → origen===destino → producto ausente/invalido → sin stock en origen → cantidad excede disponible.
- [x] 2.4 Implement `GuardiaDepositoInactivoResultado`, `evaluarGuardiaDepositosActivos`.
- [x] 2.5 Run `yarn test:run` + `yarn type-check` + `yarn type-check:test` — all green.

## Phase 3: Safety-Net Guards (empresa_id + is_active)

- [x] 3.1 `lib/stock-deposito.ts`: add `empresa_id: string` as 4th param to `leerStockDeposito`; add `AND empresa_id = ?` to the WHERE.
- [x] 3.2 Update `lib/__tests__/stock-deposito.test.ts`: adjust 2 existing call assertions (+ trailing arg); add 1 new test — row from another `empresa_id` is not returned.
- [x] 3.3 `hooks/use-traspasos.ts`: update the 2 `leerStockDeposito` calls (lines ~149, ~158) to pass `empresa_id`.
- [x] 3.4 `hooks/use-traspasos.ts`: add pre-tx `is_active` guard in `crearTraspaso`, after the `origen===destino`/`lineas.length===0` early-throws and before `db.writeTransaction` — `db.getAll<{id,is_active}>('SELECT id, is_active FROM depositos WHERE empresa_id = ? AND id IN (?, ?)', [empresa_id, deposito_origen_id, deposito_destino_id])`, build a Map, call `evaluarGuardiaDepositosActivos`, throw Spanish error per `lado` if blocked.
- [x] 3.5 `hooks/__tests__/use-traspasos.test.ts`: extend the `db` mock with `getAll` (default: both depositos `is_active=1`); add 3 tests — reject origen inactive, reject destino inactive, allow both active (writeTransaction is called).
- [x] 3.6 `src/features/ventas/hooks/use-ventas.ts`: update the 2 `leerStockDeposito` call sites (~561, ~718) to pass `empresa_id` (already in scope as a param of `crearVenta`). DEVIATION: design predicted zero test changes, but 1 test (`re-chequeo local por deposito PARA INGREDIENTES DE RECETA`) asserts exact params array (not positional destructure) and needed a 1-line update.
- [x] 3.7 Run `yarn test:run` + `yarn type-check` + `yarn type-check:test`.

## Phase 4: UI Wiring (traspaso-form.tsx)

- [x] 4.1 Origen select (~l.355-357): wrap options in `useMemo` using `filtrarDepositosDisponibles(depositos, depositoDestinoId)`.
- [x] 4.2 Destino select (~l.375-377): wrap options in `useMemo` using `filtrarDepositosDisponibles(depositos, depositoOrigenId)`.
- [x] 4.3 Origen select (~l.348-358): add `disabled={hayArticulosCargados(lineas)}`. No changes to the plantilla `useEffect` (~l.212-250) — lock/unlock derives automatically from `lineas`.
- [x] 4.4 Compute `productosValidosIds = useMemo(() => new Set(productosActivos.map(p => p.id)), [productosActivos])`.
- [x] 4.5 Compute `resultado = useMemo(() => puedeProcesarTraspaso({ depositoOrigenId, depositoDestinoId, lineas, stockDisponiblePorProducto, productosValidosIds }), [...])`.
- [x] 4.6 Submit button (~l.519-525): change `disabled={submitting || mismoDeposito}` to `disabled={submitting || !resultado.habilitado}`; optionally add `title={resultado.motivo}`. Keep `mismoDeposito` for the existing banner (~l.382-386).
- [x] 4.7 Run `yarn type-check` on the component; smoke-run `yarn test:run` for `traspaso-form.test.tsx`. DEVIATION: one pre-existing test ("select same deposito in both selects") became literally unreachable via the UI once mutual exclusion was wired (dep-A is removed from destino's options after being chosen as origen) — rewrote it to assert the exclusion itself (both directions) and added a new test for button-disabled-without-valid-lineas.

## Phase 5: Verify-Only (no code change expected)

- [x] 5.1 Confirm REQ2 search filter already correct: `ProductoBuscador` `conStockEnOrigen` (~l.59-65) + `origenSeleccionado` gating (~l.42-43, 130-132). CONFIRMED — no change needed.
- [x] 5.2 Confirm REQ4 modal-stays-open already correct: `handleSubmit` catch block (~l.318-320) never calls `onClose()`. CONFIRMED — no change needed.

## Phase 6: Full Suite + Handoff

- [x] 6.1 Run `yarn test:run` (full suite), `yarn type-check`, `yarn type-check:test` — all green. Result: 761/761 tests passing (was 735/735 on develop, +26 new), 0 production type errors, type-check:test clean.
- [x] 6.2 Manual-QA handoff note (see below) for the tester.

### Manual QA Handoff

Verify by hand (component-level, not covered by unit tests):
1. Selecting origen removes it from destino options, and vice versa.
2. Origen select locks after adding an item or loading a plantilla; unlocks when table is cleared back to one empty line.
3. Product search only lists items with stock > 0 in the selected origen.
4. Cantidad > disponible → line turns red AND submit button disables.
5. Concurrent sale drops origin stock below the entered qty → line turns red reactively, button disables.
6. Missing origen or destino → button disabled.
7. Origen === destino → button disabled + red banner message.
8. Submit error (e.g. server-side rejection) → modal stays open, error toast shown, form data preserved.
9. Traspaso to/from an inactive deposito is rejected with a clear Spanish error before any write.
