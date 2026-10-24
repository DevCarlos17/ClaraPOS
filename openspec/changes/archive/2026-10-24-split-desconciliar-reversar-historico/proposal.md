# Proposal: Separar "Desconciliar" (estado) de "Reversar" (reverso real) en Histórico de Tesorería

> Change: `split-desconciliar-reversar-historico` | Phase: propose | Project: clarapos

## Intent

PR #262 (merge `975dc0e`) mezcló dos acciones distintas bajo un solo botón: "Desconciliar" en Histórico hoy llama a `handleDesconciliarMov`, que es BYTE-IDÉNTICO a `handleReversarMov` — abre `ReversoModal` y ejecuta el reverso real (egreso + reapertura de factura + CxC). Eso NO es desconciliar, es reversar mal etiquetado. El modelo correcto tiene 4 acciones independientes: Pendientes (Conciliar + Rechazar) e Histórico (Desconciliar + Reversar). Desconciliar debe ser un flip de estado puro (`validado` 1→0, sin tocar saldo ni factura); Reversar es la mutación real que PR #262 ya implementó pero etiquetó mal. Esta propuesta corrige el error mergeado.

## Scope

### In Scope
- Nuevas funciones `desconciliarMovBancario(movId)` / `desconciliarMovCajaFuerte(movId)` en `use-conciliacion-tesoreria.ts` — espejo inverso de `validarMovBancario`/`validarMovCajaFuerte`: `UPDATE ... SET validado=0, validado_por=NULL, validado_at=NULL`, sin tocar saldo, con guard `reversado=1 → throw`.
- Nueva función `desvalidarTraspaso(movId)` — espejo inverso de `validarTraspaso`: desconcilia AMBOS lados (origen + destino) del par de traspaso de forma atómica en la misma `tx`.
- Rewiring del botón "Desconciliar" existente en `HistoricoRow`: deja de abrir el modal; según `origen` llama a `desvalidarTraspaso` (si `TRASPASO`) o a `desconciliarMovBancario`/`CajaFuerte` (resto). Sin confirmación por PIN (no es mutación financiera).
- Nuevo botón "Reversar" en Histórico (solo `TRANSFERENCIA_CLIENTE`): toma el handler actual (`handleDesconciliarMov`, hoy mal llamado) y lo re-etiqueta/re-expone como "Reversar" — abre `ReversoModal` → orquestador `reversarAbonoDirectoDesdeTesoreria`, sin cambios funcionales.
- Matriz de visibilidad ajustada por fila (ver tabla abajo).

### Out of Scope
- Epic saldo-en-tránsito vs. disponible (#5686) — el saldo no se toca en ninguna de las dos acciones, igual que hoy.
- Pulido cosmético Bs-$/preview (change futuro separado).
- Reutilización de Consulta-de-Factura (idea para change separado).
- Caso SAF en reverso (ya bloqueado por `tesoreria-reverso-abono-directo`).
- Bridge SAF-overflow (diferido).

### Matriz de botones (fila Histórico, `validado=1 && !reversado`)

| Origen | Desconciliar | Reversar |
|---|---|---|
| `TRANSFERENCIA_CLIENTE` | Sí | Sí |
| Otro (CIERRE_CONSOLIDACION, DEPOSITO, etc.) | Sí | No |
| `TRASPASO` | Sí (ambos lados) | No |
| — `reversado=1` (cualquier origen) | No | No |

## Capabilities

### New Capabilities
- `tesoreria-historico-reversar`: botón "Reversar" en Histórico (gate `validado=1 && !reversado && origen==='TRANSFERENCIA_CLIENTE'`), abre `ReversoModal` → `reversarAbonoDirectoDesdeTesoreria`. Mismo comportamiento ya especificado por `tesoreria-reverso-abono-directo`, solo re-etiquetado desde el entry point correcto.

### Modified Capabilities
- `tesoreria-historico-desconciliar`: su spec actual describe (incorrectamente) que "Desconciliar" abre `ReversoModal` y ejecuta el reverso completo. Se reemplaza por: acción de estado puro (`validado` 1→0, limpia `validado_por`/`validado_at`, sin saldo, sin modal), con rama propia para `TRASPASO` (ambos lados). Gate deja de estar limitado a `TRANSFERENCIA_CLIENTE` — pasa a ser agnóstico de origen (espejo de "Conciliar").

## Approach

Mirror directo del patrón `validarMovBancario`/`validarMovCajaFuerte`/`validarTraspaso` ya existente, en sentido inverso. Cero cambios en `ReversoModal` ni en el orquestador — el único movimiento es RE-ETIQUETAR el handler/botón que ya hacía el reverso real como "Reversar", y AGREGAR el flip de estado real como el nuevo "Desconciliar".

## Affected Areas

| Area | Impacto | Descripción |
|---|---|---|
| `use-conciliacion-tesoreria.ts` | Modified | + `desconciliarMovBancario`, `desconciliarMovCajaFuerte` |
| `use-traspasos.ts` | Modified | + `desvalidarTraspaso` (espejo de `validarTraspaso`, ambos lados) |
| `conciliacion-tesoreria.tsx` | Modified | Renombrar `handleDesconciliarMov`→`handleReversarHistorico` (sin cambio de cuerpo); nuevo `handleDesconciliarHistorico` sin modal |
| `movimientos-table.tsx` | Modified | `HistoricoRow`: 2 botones (Desconciliar agnóstico de origen / Reversar solo `TRANSFERENCIA_CLIENTE`), nuevo campo `onDesconciliar` en `MovimientoTableRow` |
| `reverso-modal.tsx`, orquestador | Reference | Reutilizados sin cambios |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Desync de `TRASPASO` si solo se desconcilia un lado | Medium | `desvalidarTraspaso` dedicado, atómico en una `tx`, mismo patrón que `validarTraspaso` |
| Confundir el botón nuevo "Reversar" con el reverso de "Rechazar" en Pendientes (gates distintos: Reversar en Histórico solo abono directo; Rechazar en Pendientes agnóstico de origen) | Low | Documentado explícitamente en la spec modificada; tests de matriz de visibilidad |
| Regresión en tests existentes que ya asumen "Desconciliar"=reverso (post PR #262) | Medium | Reescribir esos tests como "Reversar"; agregar tests nuevos para el Desconciliar real |

## Rollback Plan

Revertir el PR regresa al estado actual (mal etiquetado pero funcional) — cero riesgo de datos, ya que el cambio es solo wiring de UI + 3 funciones SQL de un solo UPDATE cada una, sin migraciones de esquema.

## Dependencies

- `tesoreria-reverso-abono-directo` (merged, sin cambios).
- `tesoreria-historico-desconciliar` (merged vía PR #262, a corregir).
- Exploración `sdd/reverso-abono-tesoreria/explore-desconciliar-reversar-split` (engram #5749).

## Effort Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~150-250 (incl. tests) |
| Chained PRs recommended | No — 1 PR, stacked a main |
| 400-line budget risk | Low-Medium |
| Decision needed before apply | No — patrón ya probado (`validarMovBancario`/`validarTraspaso`); la lógica de ambos-lados en `desvalidarTraspaso` amerita una nota breve de diseño, no un design doc completo |

## Verification Plan

- `yarn test:run` (Vitest, TDD estricto): Desconciliar estado-puro (validado→0, audit limpio, sin modal, sin saldo); `desvalidarTraspaso` ambos lados; nuevo Reversar abre el modal; matriz completa de visibilidad (ambos botones para transferencia, solo Desconciliar para otros orígenes, ninguno para `reversado=1`); regresión Pendientes (Conciliar/Rechazar sin cambios).
- QA manual: desconciliar un ingreso conciliado → vuelve a Pendientes; reversar un abono conciliado → modal + reverso completo; desconciliar un traspaso → ambos lados vuelven a pendiente.

## Success Criteria

- [ ] "Desconciliar" es estado-puro: `validado` 1→0, sin modal, sin saldo, sin tocar factura
- [ ] "Reversar" (nuevo botón) reproduce exactamente el comportamiento hoy mal etiquetado como "Desconciliar"
- [ ] `desvalidarTraspaso` desconcilia ambos lados de un traspaso de forma atómica
- [ ] Matriz de visibilidad completa cubierta por tests
- [ ] Tests y type-check pasan; QA manual confirma los 3 flujos (desconciliar simple, reversar, desconciliar traspaso)
