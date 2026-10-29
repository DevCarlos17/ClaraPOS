# Proposal: Reverso de Abono Terminal (sin acciones)

## Intent

Un reverso-de-abono (`origen='REVERSO'`, `validado=1`) aterriza en Histórico con un botón **Desconciliar**. Al usarlo, vuelve a Pendientes, donde aparece **Rechazar** — permitiendo RECHAZAR un reverso y convertirlo otra vez en abono pendiente. Ciclo circular y confuso. Decisión del owner: el reverso debe ser **TERMINAL** — entra a Histórico ya validado y queda de solo lectura, sin ninguna acción (ni Desconciliar, ni Rechazar, ni Conciliar aplica porque ya está validado). No existe "reverso del reverso".

**Callout — esto REVIERTE una decisión de ayer**: el commit `251a32a3` (2026-10-28) agregó intencionalmente el botón Desconciliar a filas de reverso. Este cambio la revierte explícitamente; no es una regresión accidental.

## Scope

### In Scope
- Excluir `origen='REVERSO'` del gate de **Desconciliar** en `HistoricoRow` (`movimientos-table.tsx` ~línea 394) — fix raíz.
- Excluir `origen='REVERSO'` del gate de **Rechazar** en `PendienteRow` (`movimientos-table.tsx` ~línea 261) — defensa en profundidad para filas huérfanas/legacy.
- Reescribir `conciliacion-tesoreria.test.tsx` (líneas 255-319, hoy aserta el comportamiento VIEJO) para afirmar cero acciones en la fila de reverso.
- Agregar casos negativos en `movimientos-table.test.tsx` (Desconciliar y Rechazar ocultos cuando `origen='REVERSO'`).

### Out of Scope
- El gate de **Conciliar** (línea 251) — permanece origin-agnostic; lo comparte el mecanismo viejo `reversarMovBancario` (GASTO/PAGO_PROVEEDOR/MANUAL/TRASPASO), no relacionado a este bug.
- Migraciones o triggers de DB — no hay columna `conciliado` separada de `validado`; no se toca schema.
- Guard de defensa adicional en la función `desconciliarMovBancario` (open question resuelta por el owner como innecesaria para este alcance).
- SAF, cuadre de caja, cualquier otro flujo de tesorería.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `tesoreria-conciliacion`: el estado "reverso de abono" pasa a ser terminal (sin Desconciliar/Rechazar); el Conciliar sigue sin cambios para el mecanismo viejo.

## Approach

Exclusión de 2 líneas por `&&` en los gates JSX de Desconciliar y Rechazar (`mov.origen !== 'REVERSO'`), sin tocar el gate de Conciliar ni el insert del reverso (ya aterriza `validado=1` correctamente). Pura UI, sin cambios de datos ni lógica de negocio.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/tesoreria/components/movimientos-table.tsx` | Modified | ~2 líneas: excluir `origen='REVERSO'` de Desconciliar (L394) y Rechazar (L261) |
| `src/features/tesoreria/components/__tests__/conciliacion-tesoreria.test.tsx` | Modified | Reescribir tests L255-319 (comportamiento opuesto al de ayer) |
| `src/features/tesoreria/components/__tests__/movimientos-table.test.tsx` | Modified | 2 casos negativos nuevos |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Filas huérfanas (reverso desconciliado durante ventana 23-28 oct) quedan en Pendientes sin botones | Low-Med | Self-healing: un supervisor puede Conciliar esa fila una vez más y vuelve a Histórico terminal. Verificación manual post-deploy recomendada (no bloqueante, no migración). |
| Lectores interpretan esto como regresión accidental de `251a32a3` | Low | PR description debe citar explícitamente el commit revertido y el motivo (simplificación del ciclo de vida). |

## Rollback Plan

Revertir el commit del PR; los gates vuelven a su estado origin-agnostic de `251a32a3`. Sin migraciones ni cambios de datos, el rollback es inmediato y sin riesgo.

## Dependencies

- Ninguna. Branch desde `origin/develop` @ `0795382b`.

## Success Criteria

- [ ] Una fila `origen='REVERSO', validado=1` en Histórico no muestra Desconciliar.
- [ ] Si esa fila existiera con `validado=0` en Pendientes (huérfana o del mecanismo viejo con otro origen), `origen='REVERSO'` no muestra Rechazar.
- [ ] El gate de Conciliar permanece sin cambios — reversos del mecanismo viejo (GASTO/PAGO_PROVEEDOR/MANUAL/TRASPASO) siguen conciliables.
- [ ] Tests de `conciliacion-tesoreria.test.tsx` y `movimientos-table.test.tsx` en verde, reflejando el comportamiento terminal.
