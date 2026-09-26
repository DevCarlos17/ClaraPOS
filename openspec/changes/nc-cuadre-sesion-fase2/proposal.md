# Propuesta: NC en Cuadre — Fase 2 (egreso real de NC admin a sesión activa)

## Intent

Una NC ADMINISTRATIVA/TRADICIONAL que devuelve efectivo hoy **no escribe egreso** en ninguna
sesión de caja, a diferencia de una NC POS ("Regla de Oro", `use-notas-credito.ts` L641-645). El
pago se reversa sin contrapartida y el cuadre queda desbalanceado. La UI ya tiene un seam
deshabilitado para esto (`refund-tesoreria-form.tsx` L214-220), dejado a propósito por
`nc-refund-tesoreria`. Fase 2 implementa ese seam.

## Scope

### In Scope
- Habilitar "Sesión de caja activa" en "Devolver dinero" (admin/TRADICIONAL).
- Egreso real en `movimientos_metodo_cobro` contra **cualquier sesión ACTIVA de la empresa**
  (`useSesionesActivas()`), no solo la de la venta original (más permisivo que la Regla de Oro
  POS; confirmado por el usuario).
- Unificar `origen` en las 3 estrategias de cálculo de efectivo del cuadre.
- Guard cliente "sesión destino ABIERTA" (espejo del trigger Postgres, ausente en SQLite local).

### Out of Scope (Fase 3)
- Paridad completa POS/admin cruzando sesiones en el cuadre.
- Nivelar mejoras admin hacia POS.
- Trazabilidad fina 1:1 pago-egreso (monto libre, como `REFUND_TESORERIA`).

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `notas-credito-admin`: resuelve el diferido de su spec sobre "Sesión de caja activa".
- `caja`: las estrategias de saldo/cuadre deben reconocer el nuevo egreso.
- `tesoreria-consolidacion-cierre`: `EgresoTesoreriaLinea` gana un tercer destino.

## Approach

Extender el mecanismo ya construido para `REFUND_TESORERIA` (Opción B) en vez de relajar la Regla
de Oro rígida de POS: nuevo `destino: 'SESION_CAJA'` en `EgresoTesoreriaLinea` y una función
paralela que escriba en `movimientos_metodo_cobro` (no bancos/caja fuerte), en la misma
transacción, reusando tope y remanente-a-SAFC existentes.

## Affected Areas

| Área | Descripción |
|------|-------------|
| `refund-tesoreria-form.tsx` | Habilitar opción de UI |
| `use-notas-credito.ts` | Nuevo destino, escritura, guard |
| `notas-credito-refund.ts` | Extender tipo y remanente |
| `use-sesiones-caja.ts` | Unificar `origen` |
| `use-cuadre.ts` | Unificar `origen` |

## Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Sin `metodo_cobro_id` 1:1 | Alta | Decidir en diseño (ej. EFECTIVO por defecto) |
| Divergencia de `origen` entre estrategias | Alta | Regla única + test de regresión |
| Guard "ABIERTA" solo en Postgres, no SQLite | Media | Guard cliente espejo |
| Tasa bimonetaria incorrecta | Media | Usar tasa histórica de la NC |
| Tamaño de cambio | Media-Alta | Riesgo budget 400 líneas; evaluar PRs encadenados |

## Rollback Plan

Revertir: (1) volver a `disabled` la opción de UI, (2) revertir el commit de escritura nueva. Sin
migración destructiva; egresos POS existentes no se tocan.

## Dependencies

`nc-refund-tesoreria` (archivado) y Fase 1 `nc-cuadre-sesion`.

## Success Criteria

- [ ] NC admin → "Sesión de caja activa" escribe egreso real.
- [ ] Egreso reflejado consistentemente en las 3 estrategias del cuadre.
- [ ] Intento contra sesión cerrada se bloquea en cliente.
- [ ] El cuadre de la sesión destino refleja el egreso al cierre.
