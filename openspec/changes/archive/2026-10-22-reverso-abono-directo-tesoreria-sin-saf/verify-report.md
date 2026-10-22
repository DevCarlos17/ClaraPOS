# Verify Report (combinado): reverso-abono-directo-tesoreria-sin-saf

Verify reports vivían en Engram (`sdd/reverso-abono-tesoreria/verify-report-reverso-*`), no en filesystem previamente — igual que el change hermano `preview-facturas-afectadas-reverso-tesoreria`. Este archivo los consolida en un solo lugar para el audit trail.

## Slice 2a — Extracción `reversarPagoEnTx` (PR #258, merge `d2a4c74`)

**Verdict: PASS.** `pr_ready: YES`.

- Diff scope confirmado: solo `src/features/cxc/hooks/use-cxc.ts` (380 líneas, 214+/166-) + `reversar-pago-en-tx.test.ts` nuevo (200 líneas). Cero toque a `reverso-modal.tsx`, `use-conciliacion-tesoreria.ts`, `reversa-pago-saf.ts`.
- Byte-identical check: cada statement del cuerpo extraído (SQL, orden de params, `Decimal`/`toStorageString`, INSERT REV, cálculo de saldo/estado de venta, UPDATE `pagos.is_reversed`, contra-asientos en `libro_contable`) diffeado manualmente contra el bloque original L1932-2096 — solo renombre snake_case→camelCase, cero cambio de lógica/SQL/orden.
- No nested tx: grep de los 8 `db.writeTransaction(` en `use-cxc.ts` confirma ninguno dentro de `reversarPagoEnTx`. Test dedicado inyecta una `tx` fake y confirma `db.writeTransaction` nunca se invoca.
- Regresión: `git diff` en `use-cxc.test.ts` = 0 líneas. `yarn test:run use-cxc.test.ts reversar-pago-en-tx.test.ts reversa-pago-saf.test.ts` → **97/97 PASS** (81 originales + 2 nuevos + 14 SAF).
- `yarn type-check:test`: 3 errores pre-existentes, todos ajenos a este diff (producto-form, use-pwa-update). Cero errores nuevos.

**Aprendizaje clave**: el diff (~580 líneas) superó el forecast (220-320) porque un rename snake_case→camelCase sobre 193 líneas de cuerpo NO es copy-paste byte-idéntico — aceptado como `size:exception` justificado (partirlo habría dejado un refactor a medio terminar sin valor de verificación aislada).

## Slice 2b-i-a — Orquestador, caso simple (PR #259, merge `159a92e`)

**Verdict: PASS**, sin hallazgos CRITICAL.

- Diff scope: solo `src/features/tesoreria/hooks/use-reverso-abono-directo.ts` (210 líneas, nuevo) + test nuevo (319 líneas, 7 tests). `use-cxc.ts`, `use-conciliacion-tesoreria.ts`, `reversa-pago-saf.ts`, `reverso-modal.tsx` confirmados sin modificar (`git status --porcelain` vacío en los 4).
- **SAF-block zero-mutation: PROBADO.** `detectarLoteSafDePago` corre pre-tx (líneas 110-119), antes de `db.writeTransaction` (línea 123). Test confirma `db.writeTransaction` y `reversarPagoEnTx` nunca invocados cuando algún `facturasAfectadas` no está vacío.
- **Atomicidad: PROBADA.** UNA sola `db.writeTransaction` (grep-confirmado). TOCTOU re-SELECT es el primer statement. Cero `db.getAll` dentro de la tx (ambos están pre-tx). Egreso creado UNA vez, fuera del loop de pagos. Sin try/catch que absorba errores — el rollback test confirma propagación intacta.
- **Dinero del egreso: CORRECTO.** 18 columnas del INSERT trazadas 1:1 contra 16 params; `monto` es copia cruda de `mov.monto` (sin recomputar, cero drift de precisión); `saldo_nuevo = saldoAnterior.minus(montoEgreso)` (signo correcto, simétrico al ingreso original).
- Desviaciones revisadas y SEGURAS: guard defensivo extra de `origen==='TRANSFERENCIA_CLIENTE'` (no literal en el design, riesgo cero); uso de `Decimal`/`toStorageString` en vez de `parseFloat`/`.toFixed(4)` del legacy `reversarMovBancario` (MÁS preciso, cumple regla #10 de CLAUDE.md).
- Tests: 7/7 GREEN (RED reproducido independientemente, no solo confiado del self-report). Regresión 2a: 83/83 verde. `yarn type-check:test`: mismos 3 errores baseline, cero nuevos.

**Nota SUGGESTION (no bloqueante)**: algunas aserciones del egreso usan `.toContain` sobre el array plano de params en vez de `toEqual` posicional — mitigado porque el verificador trazó el SQL a mano.

## Slice 2b-i-b — Cobertura multi-factura (PR #260, merge `200c5ee`)

**Verdict: PASS.**

- **Production-unchanged: CONFIRMADO independientemente.** Único archivo tracked modificado: `use-reverso-abono-directo.test.ts` (+132/-2, 10 tests, de 7). `git diff` en los 4 archivos de producción guardados (`use-reverso-abono-directo.ts`, `use-cxc.ts`, `reverso-modal.tsx`, `reversa-pago-saf.ts`) = vacío.
- **Tests no vacíos: PROBADO vía mutación.** Mutación deliberada (`bridgeRows.slice(0, 1)` en el loop) → los 3 tests nuevos de multi-factura **FALLARON** exactamente como se esperaba; los 7 tests originales (N=1) permanecieron verdes (correctamente no afectados). Mutación revertida, diff en producción confirmado vacío de nuevo, 10/10 verde.
- **Invariante "1 solo egreso": CONFIRMADO.** Ambos tests nuevos aseveran `egresoInserts.toHaveLength(1)`, descartando explícitamente "1 egreso por pago".
- Tests: 93/93 (10 orquestador + 2 extracción 2a + 81 `use-cxc.test.ts`). `yarn type-check:test`: mismo baseline de 3 errores, cero nuevos.
- Scope creep check: `reverso-modal.tsx` y `reversarPagoEnTx` confirmados sin tocar; tasks 13-16 (slice 2b-ii) correctamente `[ ]` en ese momento.

**Issues**: 0 CRITICAL, 1 SUGGESTION (estilo heredado de 2b-i-a, no bloqueante) + nota sobre ruido `.atl/skill-registry.*` no relacionado a excluir del commit.

## Slice 2b-ii — Wiring del modal + PIN gate (PR #261, merge `adbb4b6`)

**Verdict: PASS WITH WARNINGS** (los 3 warnings funcionales/de proceso se resolvieron antes de este archive — ver abajo).

- **Diff scope: PASS.** Solo `reverso-modal.tsx` (+105/-3) + `reverso-modal.test.tsx` (+287). `use-reverso-abono-directo.ts`, `use-cxc.ts`, `use-conciliacion-tesoreria.ts`, `use-preview-facturas-afectadas.ts` confirmados byte-sin-cambios (`git diff --stat` vacío).
- **Routing: PASS.** `esReversoDirecto = !traspasoId && esTransferenciaCliente(movimiento.origen)`. Verdadero → orquestador (gateado por SAF + PIN); falso → cae intacto a las ramas preexistentes (`traspasoId`/`BANCO`/caja fuerte), confirmado byte-preservado por diff.
- **SAF-disable: PASS.** `bloqueadoPorSaf = aplicaPreview && preview?.estado==='OK' && preview.facturasSaf.length>0`. Botón deshabilitado + guard interno redundante en `handleSubmit` (bloquea también el submit por Enter).
- **PIN gate: PASS.** Espeja `factura-detalle-cxc.tsx` exactamente: `hasPermission(CXC_REVERSE)` → directo; sino `SupervisorPinDialog` (componente reusado, no creado) → tras autorización, invoca con `userId=supervisorId, reversedByNombre='Supervisor'`. Orquestador nunca se llama antes de autorización confirmada.
- **Regresión no-transferencia: PASS, byte-preservada.** Bloque `if(traspasoId)/else-if(BANCO)/else` con cero líneas cambiadas; 2 tests dedicados confirman que el orquestador NUNCA se invoca para esos orígenes.
- Tests: `reverso-modal.test.tsx` **13/13 PASS** (7 preexistentes + 6 nuevos). `use-reverso-abono-directo.test.ts` (regresión): **10/10 PASS**. `yarn type-check:test`: mismo baseline, cero nuevos.
- Assertion quality: sin tautologías ni ghost loops; cada test nuevo afirma params exactos Y aserción negativa en la rama alternativa.

**Warnings identificados en verify y su resolución**:
1. `tasks.md` mostraba checkboxes 13-17 sin marcar a pesar de que el código/tests ya estaban completos (defecto de bookkeeping post-crash del runner). **Resuelto**: `tasks.md` en disco confirma hoy (al momento de este archive) checkboxes 13.1-17 marcados `[x]`.
2. Ruido `.atl/skill-registry.*` ajeno a la rama — excluido del commit de este archive (housekeeping global, no parte de este change).
3. Working tree sobre `develop` directamente sin branch — resuelto al abrir PR #261 vía una rama feature estándar, ya mergeada.

**Issues**: 0 CRITICAL. SUGGESTION: warnings de React Testing Library "not wrapped in act(...)" en 3 tests async — cosmético, preexistente, no bloqueante.

## Resumen de ejecución agregada

| Slice | PR | Merge commit | Tests nuevos | Tests totales relevantes | Veredicto |
|---|---|---|---|---|---|
| 2a | #258 | `d2a4c74` | 2 | 97/97 | PASS |
| 2b-i-a | #259 | `159a92e` | 7 | 90/90 | PASS |
| 2b-i-b | #260 | `200c5ee` | 3 (+130 líneas de test) | 93/93 | PASS |
| 2b-ii | #261 | `adbb4b6` | 6 | 13/13 (modal) + 10/10 (orquestador) | PASS WITH WARNINGS (resuelto) |

**Fallas pre-existentes confirmadas como no relacionadas (correctamente no tocadas en ninguna slice)**: `cliente-detalle.test.tsx`, `cxc-list.test.tsx`, `abono-global-modal.test.tsx`, `nota-credito-pos-modal.test.tsx` — 4 archivos con fallas preexistentes ajenas a este change, confirmadas en la corrida de repo completo de 2b-i-b.
