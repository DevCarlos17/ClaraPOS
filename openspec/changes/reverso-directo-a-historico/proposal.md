# Proposal: Reverso de abono directo aterriza en Histórico, no en Pendientes

## Intent

Al reversar un abono directo desde Tesorería, el egreso-contraparte se inserta hoy con `validado=0`, cayendo en "Pendientes" con "Conciliar / Rechazar". Incorrecto: un reverso es un acto deliberado, no requiere conciliación manual, y nunca debe poder "rechazarse". Debe nacer ya Validado, directo en "Histórico".

## Scope

### In Scope
- Insert del egreso-contraparte en `reversarAbonoDirectoDesdeTesoreria` nace con `validado=1` (no `0`).
- Mismo insert setea `validado_por` = usuario que confirma el reverso, y `validado_at` = ahora (trazabilidad completa, consistente con la auditoría inmutable del sistema).
- Tests: `use-reverso-abono-directo.test.ts` (asserts `validado=1`, `validado_por`, `validado_at`) y `conciliacion-tesoreria.test.tsx` (escenario: reverso en Histórico, solo "Desconciliar").

### Out of Scope
- Caso SAF, cuadre de caja, entry point desde consulta-de-factura — changes separados.
- Gates de UI (`movimientos-table.tsx`) — ya origin-agnostic desde PR #265, satisfacen las 3 reglas sin tocarlos.
- Migraciones/triggers — `prevent_mov_bancario_mutation` no restringe `validado` ni dispara en INSERT.

## Capabilities

### New Capabilities
- Ninguna.

### Modified Capabilities
- `tesoreria-reverso-abono-directo`: el reverso se inserta como `validado=1` con `validado_por`/`validado_at` poblados, en vez de `validado=0`. (Spec vive en `origin/develop`, no sincronizada al checkout local — rama hermana anterior a este épico.)

## Approach

~1-3 líneas en el `INSERT INTO movimientos_bancarios` dentro de `reversarAbonoDirectoDesdeTesoreria` (`src/features/tesoreria/hooks/use-reverso-abono-directo.ts`): flip `validado` 0→1 + agregar `validado_por`/`validado_at`. Ningún gate de UI, migración ni trigger se toca — ya satisfacen lo deseado, origin-agnostic (`tesoreria-historico-desconciliar/spec.md` en `origin/develop`). "Desconciliar" sigue disponible; "Reversar" nunca aparece porque exige `origen==='TRANSFERENCIA_CLIENTE'` y este movimiento tiene `origen='REVERSO'`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/tesoreria/hooks/use-reverso-abono-directo.ts` | Modified | Insert egreso-contraparte: `validado=1`, `validado_por`, `validado_at` |
| `.../use-reverso-abono-directo.test.ts` | Modified | Assertions sobre `validado`/`validado_por`/`validado_at` |
| `.../conciliacion-tesoreria.test.tsx` | Modified | Escenario: reverso en Histórico, solo Desconciliar |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Asumir gates origin-agnostic sin verificar | Low | Confirmado por exploración (file:line) + spec de PR #265; se agrega test explícito |
| Rama local (`port/producto-precio-bs-main-pr-b2`) no tiene el código del épico | Med | Apply debe branchear desde `origin/develop`, no desde la rama local actual |

## Rollback Plan

Revertir el commit. Sin migración ni trigger — puro revert de código, sin impacto en datos ya escritos (movimientos financieros son inmutables).

## Dependencies

- Épico `reverso-abono-tesoreria` y PR #265, ya mergeados en `origin/develop`.

## Success Criteria

- [ ] El reverso aparece inmediatamente en "Histórico" con badge "Validado", nunca en "Pendientes".
- [ ] La fila solo muestra "Desconciliar"; nunca "Reversar", "Conciliar" ni "Rechazar".
- [ ] `validado_por` y `validado_at` quedan poblados (no NULL).
- [ ] PR (prod + 2 archivos de test) muy por debajo del budget de 400 líneas.
