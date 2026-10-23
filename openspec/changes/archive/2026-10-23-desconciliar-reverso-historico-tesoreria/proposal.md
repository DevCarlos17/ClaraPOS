# Proposal: Desconciliar — Reverso de Abono Directo desde Histórico de Tesorería

> Change: `desconciliar-reverso-historico-tesoreria` | Phase: propose | Project: clarapos

## Intent

`reversarAbonoDirectoDesdeTesoreria` + `ReversoModal` (merged) solo se alcanzan desde "Rechazar" en Pendientes. Un ingreso conciliado por error en Histórico no se puede reversar: esa pestaña no tiene acciones. El orquestador solo chequea `reversado`, agnóstico a `validado` — falta solo el entry point.

## Scope

### In Scope
- Botón "Desconciliar" en `HistoricoRow`, visible SOLO si `validado=1 && !reversado`.
- Handler espejo de `handleReversarMov` (lee result-sets de histórico, incl. `findTraspasoByMovId`) que setea `movParaReversar`, abriendo el `ReversoModal` existente.
- Pasar el handler a `toMovRow()` para `historicoMovRows` (hoy sin handlers).

### Out of Scope
- Orquestador, `reversarPagoEnTx`, hook de preview, `reverso-modal.tsx` — sin cambios.
- Epic saldo-disponible-vs-en-tránsito (change futuro); `window.prompt` de Traspasos; caso SAF (ya bloqueado); strikethrough literal (se mantiene `opacity-50`).

## Capabilities

### New Capabilities
- `tesoreria-historico-desconciliar`: acción "Desconciliar" en Histórico, gateada por `validado=1 && !reversado`, reutiliza `tesoreria-reverso-abono-directo`.

### Modified Capabilities
Ninguna.

## Approach

Wiring puro de UI, cero mutación nueva: botón en `HistoricoRow` (espejo del guard `!isReversado`) + handler espejo + pass-through a `historicoMovRows`. `ReversoModal` es origen-driven, no tab-driven.

## Affected Areas

| Area | Impacto | Descripción |
|---|---|---|
| `movimientos-table.tsx` | Modified | Botón "Desconciliar" en `HistoricoRow`, gate `validado=1 && !reversado` |
| `conciliacion-tesoreria.tsx` | Modified | Handler espejo de `handleReversarMov` + wiring en `historicoMovRows` |
| `reverso-modal.tsx` | Reference | Reutilizado sin cambios |
| `use-reverso-abono-directo.ts` | Reference | Orquestador reutilizado sin cambios |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Reverso-de-reverso (Histórico muestra todos los estados) | Medium | Guard `validado=1 && !reversado` en el botón |

## Rollback Plan

Revertir el wiring regresa Histórico a su estado actual — cero riesgo de datos; el orquestador sigue operando desde Pendientes.

## Dependencies

- `tesoreria-reverso-abono-directo` (merged); Exploración #5683.

## Effort Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~60-100 |
| Chained PRs recommended | No |
| 400-line budget risk | Low |
| Decision needed before apply | No — mutación ya verificada; spec liviana de visibilidad, sin design, directo a tasks |

## Verification Plan

- `yarn test:run` + `yarn type-check:test` — visibilidad del botón, handler abre el modal correcto.
- QA staging: conciliar abono → Histórico → Desconciliar → trazabilidad → confirmar → factura reabierta + egreso + fila atenuada; sin botón en fila ya reversada.

## Success Criteria

- [ ] "Desconciliar" solo visible para `validado=1 && !reversado`
- [ ] Handler abre `ReversoModal` con el movimiento correcto
- [ ] Cero cambios en orquestador, `reversarPagoEnTx`, preview o `reverso-modal.tsx`
- [ ] Tests y type-check pasan; QA manual confirma el reverso completo
