# Design: Trazabilidad Pago en Venta — Capa Simple (`crearVenta`)

## Technical Approach

Cablear `movimientos_bancarios_pagos` para legs directos de `crearVenta` sumando un
array de correlación (`pagoIdsPorPago[]`) entre Paso 5 (crea `pagos`) y Paso 8 (crea
`movimientos_bancarios`). Confirmado por lectura del código real (no supuesto): ambos
pasos iteran **el mismo parámetro `pagos: PagoEntry[]`** (línea 177), nunca
reasignado, ordenado ni filtrado entre pasos (único uso intermedio es `.filter()`
inmutable en L440-441, que no toca el array original). Paso 5 (`for (const pago of
pagos)`, L840) hace `continue` en L861 para legs capeados a cero (modo SAF), pero
**el loop avanza por los N elementos de `pagos` igual** — el `continue` solo omite el
INSERT, no la iteración. Paso 8 (`for (const pago of pagos)`, L1718) también recorre
los N elementos sin filtrar. Esto significa que la posición `i` en ambos loops ya
referencia el mismo leg — la correlación por índice es válida sin cambios
estructurales, solo hace falta exponer el índice en Paso 8.

## Architecture Decisions

### Decision: Forma de `pagoIdsPorPago[]` y mecanismo de correlación

| Opción | Descripción | Veredicto |
|---|---|---|
| **A (elegida)** | `Array<{ pagoId: string; montoUsd: Decimal } \| null>`, un push por iteración de Paso 5 (incl. el branch con `continue`), leído por índice `i` en Paso 8 | Elegida |
| B | `Map` keyed por referencia al objeto `pago` o por `metodo_cobro_id + posición` | Descartada |

**Rationale**: Paso 5 y Paso 8 ya garantizan alineación 1:1 por posición (mismo
array fuente, mismo orden, cero filtrado de `pagos` — solo de efectos DB). Un `Map`
por referencia de objeto sería redundante (misma garantía, más código) y un `Map` por
`metodo_cobro_id` sería **incorrecto** si una venta mixta usa el mismo método dos
veces (ej. 2 transferencias a bancos distintos con igual `metodo_cobro_id`) — la
posición no tiene esa ambigüedad. `null` en el slot representa "Paso 5 no insertó
`pagos` para este leg" (cap SAF a cero) — el bridge NUNCA debe referenciar un
`pago_id` que no existe en la tabla `pagos`.

### Decision: Monto a persistir en el bridge

**Choice**: `correlacion.montoUsd` = `pagoMontoUsd` capeado de Paso 5 (el que se
INSERTÓ en `pagos.monto_usd`), nunca el `montoUsd` recalculado de Paso 8 (L1719).
**Alternativa descartada**: usar el `montoUsd` de Paso 8 directamente (ya está en
scope ahí). **Rationale**: en modo `isSafWithAssignments` difieren — Paso 8 recalcula
desde el pago completo sin capear; el spec (#5734) exige el monto real de `pagos`.

## Data Flow

    Paso 5 (L838-911, for pago of pagos)
      pagoId = uuidv4()
      pagoMontoUsd = capeo SAF (si aplica)
      ├─ capeo ≤ 0.001 → pagoIdsPorPago.push(null); continue
      └─ INSERT INTO pagos(...)
         pagoIdsPorPago.push({ pagoId, montoUsd: pagoMontoUsd })   ← NUEVO
                                     │
                                     │  (array indexado, 1:1 con pagos.length)
                                     ▼
    Paso 8 (L1709-1835, for (i, pago) of pagos.entries())          ← índice NUEVO
      if (bancoId && depositoDirecto && montoUsd > 0) {
        INSERT INTO movimientos_bancarios (...) → movBancoId
        UPDATE bancos_empresa SET saldo_actual = ...
        correlacion = pagoIdsPorPago[i]                            ← NUEVO
        if (correlacion)
          INSERT INTO movimientos_bancarios_pagos                  ← NUEVO
            (ingreso_id=movBancoId, pago_id=correlacion.pagoId,
             monto_aplicado_usd=correlacion.montoUsd)
      }

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/features/ventas/hooks/use-ventas.ts` | Modify | Paso 5: declarar `pagoIdsPorPago` antes del loop (tras L839), push `null` en el branch de `continue` (L861), push `{pagoId, montoUsd: pagoMontoUsd}` tras el INSERT de `pagos` (tras L883). Paso 8: cambiar `for (const pago of pagos)` (L1718) a `for (const [i, pago] of pagos.entries())`; agregar el bloque `correlacion`/INSERT puente inmediatamente después del `UPDATE bancos_empresa` (tras L1789), dentro del mismo `if` de L1735 |
| `src/features/ventas/hooks/__tests__/use-ventas.test.ts` | Modify | Nuevos casos (ver Testing Strategy) |

Cero reorder de statements existentes — todo lo nuevo son líneas insertadas antes/después de código intacto, dentro de la misma `db.writeTransaction`.

## Interfaces / Contracts

```ts
// Paso 5, antes del loop (tras L839)
const pagoIdsPorPago: Array<{ pagoId: string; montoUsd: Decimal } | null> = []

// INSERT puente (Paso 8, mismo shape que use-cxc.ts L752-756)
await tx.execute(
  `INSERT INTO movimientos_bancarios_pagos
     (id, empresa_id, ingreso_id, pago_id, monto_aplicado_usd, created_at, created_by)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [uuidv4(), empresa_id, movBancoId, correlacion.pagoId, toStorageString(correlacion.montoUsd), now, usuario_id]
)
```

## Exclusión del camino SAF-overflow (sin guard nuevo)

Emergente de la estructura existente, sin código adicional:
- **Cap total a cero**: Paso 5 hace `continue` → `pagoIdsPorPago[i] = null` → Paso 8
  encuentra `correlacion === null` → no inserta puente. El INGRESO (creado con el
  monto completo sin capear, L1719) queda LEGACY — correcto, diferido.
- **Cap parcial**: `correlacion.montoUsd` es el monto capeado (solo la porción
  aplicada a ESTA factura), no el total transferido — el bridge refleja solo lo
  aplicado, tal como exige el spec.
- **Excedente aplicado a otras facturas** (vía `aplicarPagoFacturaEnTx(skipBankAndAccounting:true)`): esa función **salta por completo** el bloque que contiene su propio INSERT puente (`if (!skipBankAndAccounting)`, use-cxc.ts L691) — cero riesgo de fila puente duplicada o cruzada.

## Testing Strategy

| Caso | Mock / Assert |
|---|---|
| Pago directo simple (100% transferencia) | 1 fila puente, `pago_id` = el de `pagos`, `monto_aplicado_usd` = monto exacto |
| Mixto (transferencia + efectivo) | 1 fila para el leg directo, 0 para el leg efectivo |
| 100% efectivo / batch | 0 filas puente |
| Monto capeado vs recalculado (SAF) | `monto_aplicado_usd` == `pagoMontoUsd` de Paso 5, NO el `montoUsd` de Paso 8 |
| Cap SAF a cero | `pagoIdsPorPago[i] === null` → sin fila puente, ingreso queda sin bridge |
| Regresión | Diff del resto de inserts (`ventas`, `pagos`, `movimientos_metodo_cobro`, `movimientos_bancarios`, kardex, asientos) sin cambios respecto a baseline actual de `use-ventas.test.ts` |

Mocks: reutilizar el patrón `mockTx`/`beforeEach` ya existente en
`use-ventas.test.ts`; agregar `movimientos_bancarios_pagos` al stub de `tx.execute`.

## Migration / Rollout

No requiere migración SQL — `migrations/0117_movimientos_bancarios_pagos.sql` ya
está mergeada. Un solo PR, stacked a main (~40-70 líneas wiring + ~80-120 tests,
bien por debajo del budget de 400 líneas — confirmado en proposal). Rollback:
revertir el commit; los INSERTs existentes de `pagos`/`movimientos_bancarios` quedan
intactos, la tabla puente simplemente deja de poblarse para este camino.

## Open Questions

- [ ] Ninguna — correlación por índice validada contra el código real (parámetro `pagos` inmutable y sin filtrar entre Paso 5 y Paso 8); SAF-overflow y bug `ventas.tipo` quedan diferidos por decisión ya bloqueada en proposal/spec.
