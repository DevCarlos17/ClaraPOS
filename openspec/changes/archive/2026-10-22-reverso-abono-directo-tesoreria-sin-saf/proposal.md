# Proposal: Reverso Real de Abono Directo desde Tesorería (caso sin SAF)

> Change: `reverso-abono-directo-tesoreria-sin-saf` | Phase: propose | Project: clarapos

## Intent

Hoy, reversar un pago directo (`TRANSFERENCIA_CLIENTE`) desde CxC (`registrarReversoAbono`) **nunca crea el egreso de tesorería correspondiente** — el banco queda con el ingreso original intacto mientras la factura se reabre y el saldo del cliente sube. Resultado: el saldo bancario queda **sobreestimado** frente a la realidad (bug de negocio confirmado, no hipotético). Simétricamente, reversar el mismo ingreso desde tesorería (`reversarMovBancario`) crea el egreso pero **nunca toca CxC** — la factura queda pagada en el sistema mientras el banco ya no tiene el dinero.

Este change cierra el primer slice REAL (mutante) del epic: reversar un abono directo **desde tesorería** generando AMBOS efectos — egreso bancario + reapertura de factura(s) + saldo de cliente — en una sola operación atómica, **solo para el caso sin SAF** (el abono no generó saldo a favor consumido en otras facturas). El caso SAF se **bloquea explícitamente** con un error claro; su desenredo (reabrir facturas vía lotes SAF, con el riesgo de resucitar deuda sobre facturas `ANULADA`) es slice (b), un change futuro separado — ver `sdd/reverso-abono-tesoreria/explore-reverso-real` (#5602, hallazgo 4 y 9).

## Scope

### In Scope
- Extraer el cuerpo de `registrarReversoAbono` (`use-cxc.ts` L1905-2098) a un helper `reversarPagoEnTx(tx, params)` que acepta la `tx` del llamador (mismo patrón ya usado por `reversarPagoSafEnTx`) — refactor preservando comportamiento byte-idéntico; `registrarReversoAbono` pasa a ser un wrapper delgado (`db.writeTransaction(tx => reversarPagoEnTx(tx, ...))`) para el entry point de CxC (`factura-detalle-cxc.tsx`).
- Nuevo orquestador `reversarAbonoDirectoDesdeTesoreria(...)`: para un ingreso `TRANSFERENCIA_CLIENTE`, valida método directo + guard de doble-reverso (`pago.is_reversed` / `movimientos_bancarios.reversado`) + ausencia de cadena SAF (bloquea si `facturasSaf` no está vacío) + permiso `CXC_REVERSE` + PIN de supervisor (patrón de `factura-detalle-cxc.tsx` L351-390).
- Detección SAF (`detectarLoteSafDePago` por cada `pago_id` del puente `movimientos_bancarios_pagos`) ejecutada **antes** de abrir la transacción (regla anti-deadlock confirmada en la exploración, mismo motivo que el fix `fix/cxc-reverso-deadlock-getall`).
- UNA sola `db.writeTransaction`: crea el egreso bancario (misma mecánica exacta de `reversarMovBancario` — contra-movimiento invertido, `origen='REVERSO'`, `reverso_de`, ajuste simétrico de `bancos_empresa.saldo_actual`, `reversado=1` en el original — reutilizada inline, NO vía la función standalone) y, en loop, llama `reversarPagoEnTx(tx, ...)` por cada `pago_id` del puente.
- Wiring en `reverso-modal.tsx` (L113-126): para `movimiento.origen === 'TRANSFERENCIA_CLIENTE'`, llamar al nuevo orquestador en vez de `reversarMovBancario`. Otros orígenes (`DEPOSITO_CAJA`, `GASTO`, etc.) no cambian.
- Mensaje de bloqueo SAF explícito: "Este abono generó saldo a favor consumido en otras facturas; reversar desde tesorería no está disponible todavía".
- Cobertura Vitest exhaustiva (ver Verification Plan).

### Out of Scope
- **Desenredo SAF (slice b)**: reabrir facturas D,E vía `saf_creditos_aplicaciones` — bloqueado aquí con error, no implementado. Incluye el riesgo documentado de resucitar deuda sobre facturas `status='ANULADA'` (hallazgo 4 de la exploración), que exige diseño y tests propios.
- **Reverso batch/lote desde tesorería**: el camino consolidado al cierre permanece exclusivamente reversable desde CxC, sin cambios.
- El modal de consulta de factura en la pantalla de emisión — superficie distinta.
- `TESORERIA_REVERSE` como permiso nuevo — se reutiliza `CXC_REVERSE`; la redefinición de permisos de tesorería queda para el rediseño post-core de permisos.
- El helper de lectura para el camino batch/lote (slice 0b) — ya diferido en changes previos.

## Capabilities

### New Capabilities
- `tesoreria-reverso-abono-directo`: dado un ingreso `TRANSFERENCIA_CLIENTE` sin cadena SAF, reversa atómicamente el egreso bancario y el efecto CxC completo (reapertura de factura(s), saldo de cliente, `pago.is_reversed`), gateado por `CXC_REVERSE` + PIN; bloquea explícitamente el caso con cadena SAF.

### Modified Capabilities
- `tesoreria-preview-facturas-afectadas`: el panel deja de ser puramente informativo — gana el requisito de exponer una acción de reverso habilitada SOLO cuando `facturasSaf` esté vacío, y deshabilitada con el mensaje de bloqueo cuando no lo esté. Delta spec a escribir en la siguiente fase.
- Ninguna otra: el refactor de `registrarReversoAbono` → `reversarPagoEnTx` preserva su contrato y comportamiento exacto (no es un cambio de requisito, es implementación interna) y no se documenta como delta.

## Approach

**Slice 2a — refactor `reversarPagoEnTx`** (behavior-preserving, aislado y revisable solo):
- Extraer el cuerpo de `registrarReversoAbono` tal cual a `reversarPagoEnTx(tx, params)`; `registrarReversoAbono` queda como wrapper que abre su propia tx y delega.
- Tests de regresión: mismo resultado exacto que antes del refactor para el entry point de CxC (reapertura de factura, saldo cliente, `is_reversed`, libro contable).

**Slice 2b — orquestador + wiring** (la mutación nueva real, depende de 2a):
- Lectura previa a la tx: resolver `pago_id` vía el puente, correr `detectarLoteSafDePago` por cada uno, abortar con el mensaje de bloqueo si algún `facturasSaf` no está vacío.
- `db.writeTransaction` única: egreso bancario (mecánica de `reversarMovBancario` inline) + loop `reversarPagoEnTx(tx, ...)`.
- Gate de permiso `CXC_REVERSE` + PIN de supervisor antes de ejecutar.
- Wiring en `reverso-modal.tsx`: condicional por `origen` para invocar el nuevo orquestador.
- Tests: pago único, abono global multi-factura (N pagos), bloqueo SAF, idempotencia (doble-reverso), aislamiento `empresa_id`.

## Affected Areas

| Area | Impacto | Descripción |
|---|---|---|
| `src/features/cxc/hooks/use-cxc.ts` | Modified | Extraer `reversarPagoEnTx(tx, params)` de `registrarReversoAbono` (L1905-2098); wrapper delgado preservado |
| `src/features/tesoreria/hooks/use-reverso-abono-directo.ts` (nuevo) | New | Orquestador `reversarAbonoDirectoDesdeTesoreria`: detección SAF pre-tx, egreso + loop de reversos en una tx |
| `src/features/tesoreria/components/reverso-modal.tsx` | Modified | L113-126: condicional por `origen` para invocar el nuevo orquestador en vez de `reversarMovBancario` |
| `src/features/tesoreria/hooks/use-conciliacion-tesoreria.ts` | Reference-only | Mecánica de egreso de `reversarMovBancario` (L71-166) reutilizada inline, función standalone sin cambios |
| `src/features/cxc/hooks/reversa-pago-saf.ts` | Reference-only | `detectarLoteSafDePago` reusado sin modificar, llamado pre-tx |
| `src/features/cxc/hooks/__tests__/*.test.ts`, `src/features/tesoreria/hooks/__tests__/*.test.ts` | New | Cobertura de ambos slices |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Esta es la mutación financiera de mayor riesgo del epic hasta ahora (egreso bancario + CxC en una sola tx) | High (inherente) | Separar 2a (refactor, sin mutación nueva) de 2b (mutación real) en PRs distintos; TDD estricto obligatorio antes de abrir 2b |
| Anidar `db.writeTransaction` si se reusa `registrarReversoAbono` standalone en el loop en vez de `reversarPagoEnTx` | Medium | El diseño EXIGE `reversarPagoEnTx(tx,...)`; test explícito que falla si se detecta apertura de tx anidada |
| Detectar SAF dentro de la tx en vez de antes (deadlock, mismo patrón que el fix `cxc-reverso-deadlock-getall`) | Medium | Detección SAF 100% antes de abrir la única tx, cero `db.getAll` dentro de la `writeTransaction` |
| Guard de doble-reverso de `movimientos_bancarios.reversado` es solo app-level (sin trigger Postgres, a diferencia de `pagos.is_reversed`) | Medium | Reafirmar el guard app-level dentro de la misma tx; test de reintento offline/duplicado |
| Bloqueo SAF insuficientemente claro deja al usuario sin camino de reverso real para ese caso | Low | Mensaje de error explícito y específico; slice (b) ya identificado como próximo change |

## Rollback Plan

Slice 2a: revertir el refactor restaura `registrarReversoAbono` a su forma original — cero riesgo porque el comportamiento es idéntico antes/después (si los tests de regresión pasan, revertir es seguro en cualquier momento). Slice 2b: revertir el wiring en `reverso-modal.tsx` (condicional por `origen`) regresa el modal a llamar siempre `reversarMovBancario` — el bug original (banco sobreestimado) reaparece pero no hay riesgo de datos corruptos nuevos, porque el nuevo orquestador solo corre cuando el wiring lo invoca explícitamente. El refactor 2a puede quedar en main sin 2b sin efecto observable.

## Dependencies

- Requiere `movimientos_bancarios_pagos` (`trazabilidad-ingreso-pagos-directo`, merged) y el preview (`preview-facturas-afectadas-reverso-tesoreria`, merged) para resolver `pago_id` y `facturasSaf` antes de la tx.
- Construye sobre `sdd/reverso-abono-tesoreria/explore-reverso-real` (#5602) — veredicto de reuso, mecánica de egreso, gap SAF, punto de integración, slicing — y `explore-preview-facturas-afectadas` (#5585) para el contrato del hook de preview.
- Precede al desenredo SAF (slice b, change futuro separado).

## Effort Forecast

### Review Workload Forecast
| Field | Value |
|---|---|
| Estimated changed lines | 2a: ~100-150 (extracción + tests de regresión, sin lógica nueva). 2b: ~250-350 (orquestador + wiring + tests de SAF-block/idempotencia/multi-factura) |
| Chained PRs recommended | Sí — PR1 = 2a (refactor puro, revisable aislado de la mutación nueva), PR2 = 2b (depende de PR1), stacked PR2→PR1→develop |
| 400-line budget risk | Low en 2a. Medium en 2b por el volumen de tests de integración exigido (es la mutación más riesgosa del epic) — si crece, dividir 2b en 2b-orquestador y 2b-wiring |
| Decision needed before apply | Sí, recomendado fuerte: dado que es mutación financiera cruzando 2 módulos (tesorería + CxC) en una sola tx, este change debería pasar por **spec Y design** antes de tasks — a diferencia de `trazabilidad-ingreso-pagos-directo` y el preview, que solo necesitaron spec liviana. El design debe fijar la forma exacta de `reversarPagoEnTx(tx, params)` y el orden de operaciones dentro de la tx única |

## Verification Plan

- `yarn test:run` (Vitest 3.2, TDD estricto activo) — casos obligatorios: reverso de 1 pago, abono global multi-factura (N pagos en la misma tx), bloqueo SAF (mensaje exacto, cero mutación), doble-reverso (idempotencia vía `is_reversed` y `reversado`), aislamiento `empresa_id`, regresión byte-idéntica de `registrarReversoAbono` tras el refactor de 2a.
- `yarn type-check:test` — no `yarn lint` (ESLint ausente del proyecto).
- QA manual en staging: reversar el abono directo `38201beb` desde tesorería → confirmar que las facturas `8954d635`/`ab7d1bab` se reabren, el saldo del cliente sube correctamente, el egreso bancario se crea, y `bancos_empresa.saldo_actual` deja de estar sobreestimado.

## Success Criteria

- [ ] `reversarPagoEnTx(tx, params)` existe y `registrarReversoAbono` delega en ella sin cambiar su comportamiento observable (tests de regresión en verde)
- [ ] `reversarAbonoDirectoDesdeTesoreria` reversa, en una sola `db.writeTransaction`, el egreso bancario Y el efecto CxC completo para el caso sin SAF
- [ ] El caso con cadena SAF se bloquea con el mensaje exacto, sin mutar ningún registro
- [ ] Doble-reverso (CxC ya reversado, o tesorería ya reversado) se bloquea sin crear efectos duplicados
- [ ] `reverso-modal.tsx` invoca el nuevo orquestador solo para `origen === 'TRANSFERENCIA_CLIENTE'`; otros orígenes no cambian su comportamiento
- [ ] `yarn test:run` y `yarn type-check:test` pasan sin errores
- [ ] QA manual en staging confirma que el saldo bancario deja de quedar sobreestimado tras el reverso
