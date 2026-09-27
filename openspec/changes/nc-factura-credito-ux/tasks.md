# Tasks: UX inteligente de Nota de Crédito sobre facturas con saldo a crédito

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 295-320 |
| Suggested split | PR único (fallback: cortar en Slice A si supera ~350) |
| Delivery strategy | single-pr-default |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low-Medium

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | `resolverVistaReversoNc` + selector condicional, con tests | ~150-165 líneas, aislable (Slice A) |
| 2 | Wiring ambos modales + tests de integración | ~140-155 líneas, depende de Unit 1 |

## Phase 1: Función pura `resolverVistaReversoNc` (RED → GREEN)

- [x] 1.1 **RED** — `notas-credito-ui.test.ts`: `describe('resolverVistaReversoNc (umbral 0.01)')` con 100% contado (`80/0`→desglose), 100% crédito (`80/80`→solo-confirmación), mixta (`100/40`→desglose), PARCIAL≤saldo (`30/50`→solo-confirmación), PARCIAL>saldo (`50/30`→desglose, `montoDisponible=20`), boundary `0.01`→`true` y `0.02`→`false`.
  Verify: `yarn test:run` ese archivo (falla, no existe aún).
- [x] 1.2 **GREEN** — `notas-credito-ui.ts`: `VistaReversoNc` + `resolverVistaReversoNc(totalUsdNc, saldoPendVenta)` (Design §Interfaces), reusa `calcularMontoDisponibleRefund`, `Decimal` en los 3 campos, `soloCancelaDeuda: montoDisponible.lte('0.01')`.
  Verify: mismo archivo, verde.

## Phase 2: `OrigenReversoSelector` condicional (RED → GREEN)

- [x] 2.1 **RED** — `origen-reverso-selector.test.tsx`: actualizar 4 tests con prop `vista`; +3 nuevos: `soloCancelaDeuda=true`→solo copy `Esta nota de crédito cancela {formatUsd(montoAplicadoADeuda)} de la deuda pendiente de la factura.`, sin botones; `false`→desglose `De {formatUsd(totalUsdNc)}: {formatUsd(montoAplicadoADeuda)} cancela deuda pendiente, {formatUsd(montoDisponible)} disponible` + 2 botones; boundary `0.01` = vista de `0`.
  Verify: falla.
- [x] 2.2 **GREEN** — `origen-reverso-selector.tsx`: prop `vista: VistaReversoNc`; render condicional (copy vs desglose+botones, markup sin cambios).
  Verify: verde.

## Phase 3: Wiring admin — `crear-ncr-modal.tsx`

- [x] 3.1 Reemplazar `useMemo montoDisponibleParaRefund` (L187-191) por `vistaReversoNc` (llama `resolverVistaReversoNc`); `RefundTesoreriaForm` (L420) → `.montoDisponible.toNumber()`; `vista={vistaReversoNc}` en `<OrigenReversoSelector>` (L377); `origenPendiente` (L362) → `origenReverso === null && !vistaReversoNc.soloCancelaDeuda`; relajar AMBOS gates TOTAL — advertencia (L444) y botón footer (L471) — a `origenReverso === 'CREDITO_A_FAVOR' || vistaReversoNc.soloCancelaDeuda`; `resolverModalidadDesdeOrigen(origenReverso!)` (L254) → fallback `?? 'CREDITO_A_FAVOR'`.
  Verify: `yarn type-check`. **DEVIATION**: agregado guard `totalUsdNc <= 0 → soloCancelaDeuda forzado a false` — bug real del pseudocódigo del design: PARCIAL sin líneas elegidas (`estadoParcialConfirm.totalUsdPreview=0` desde el mount de `SeleccionLineasNc`) + factura CONTADO (`saldo_pend_usd=0`) colapsaba a `soloCancelaDeuda=true` ("$0.00 cancela deuda"), rompiendo 2 tests PR3 pre-existentes. Ver apply-progress.
- [x] 3.2 `crear-ncr-modal.test.tsx`: +2 escenarios — factura 100% crédito (`saldo_pend_usd === total_usd`) → confirmar sin elegir origen invoca `crearNotaCredito` con `modalidad: 'SALDO_FAVOR'`; factura mixta → Confirmar deshabilitado hasta elegir origen (regresión).
  Verify: `yarn test:run` ese archivo.

## Phase 4: Wiring POS — `nota-credito-pos-modal.tsx`

- [x] 4.1 Mismo patrón que 3.1: `montoDisponibleParaRefund` (L334-337) → `vistaReversoNc`; `RefundTesoreriaForm` (L830) → `.montoDisponible.toNumber()`; `vista={vistaReversoNc}` en selector (L759); `origenPendiente` (L746) relajado igual; único gate TOTAL (L772) → `origenReverso === 'CREDITO_A_FAVOR' || vistaReversoNc.soloCancelaDeuda`; `resolverModalidadDesdeOrigen` (L391) con fallback `?? 'CREDITO_A_FAVOR'`.
  Verify: `yarn type-check`. MISMO guard de deviation que 3.1 (`totalUsdNc<=0 → soloCancelaDeuda=false`) aplicado idéntico (invariante #4, POS=admin).
- [x] 4.2 `nota-credito-pos-modal.test.tsx`: mismos 2 escenarios que 3.2.
  Verify: `yarn test:run` ese archivo.

## Phase 5: Invariantes duras (una guarda por invariante)

- [x] 5.1 **#3 motor intacto** — `git diff` confirma cero cambios en `use-notas-credito.ts` y su test.
- [x] 5.2 **#1 vínculo NC↔cuadre** — `git diff --stat`: ningún archivo de cuadre; `entryPoint`/`sesion_caja_id` solo aparecen en un `toMatchObject` de test nuevo (valor pre-existente, sin tocar producción).
- [x] 5.3 **#2 mismos movimientos** — 3.2/4.2 assertan `modalidad` idéntica (`SALDO_FAVOR`); ningún expect de `use-notas-credito.test.ts` cambia (archivo con 0 diff).
- [x] 5.4 **#4 POS=admin** — Phase 3 y 4 aplicaron el mismo patrón (incluido el guard `totalUsdNc<=0`), sin lógica propia divergente.
- [x] 5.5 Suite completa: `yarn test:run` (1709 passed / 3 failed baseline preexistente, cero nuevas fallas) + `yarn type-check` (solo ruido conocido vitest-globals, cero errores en mis archivos) + `yarn type-check:test` (limpio en mis archivos; 3 errores preexistentes no relacionados en producto-form/use-pwa-update.ts).
