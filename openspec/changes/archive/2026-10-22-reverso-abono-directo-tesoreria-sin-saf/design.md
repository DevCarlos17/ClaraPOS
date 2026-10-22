# Design: Reverso Real de Abono Directo desde Tesorería (sin SAF)

## Technical Approach

Dos slices. **2a** extrae el cuerpo de `registrarReversoAbono` (`use-cxc.ts` L1905-2098) a `reversarPagoEnTx(tx, params)`, mismo patrón que `reversarPagoSafEnTx` (`reversa-pago-saf.ts`): acepta la `tx` del llamador, nunca abre la suya. `registrarReversoAbono` queda como wrapper delgado. **2b** crea el orquestador `reversarAbonoDirectoDesdeTesoreria`: detección SAF pre-tx (anti-deadlock), UNA `db.writeTransaction` con el egreso bancario (mecánica de `reversarMovBancario` inline) + loop `reversarPagoEnTx(tx,...)`, y el wiring condicional en `reverso-modal.tsx`.

## Architecture Decisions

| Decisión | Elegido | Alternativa rechazada | Razón |
|---|---|---|---|
| Firma `reversarPagoEnTx` | Recibe `generatedLote: boolean` ya resuelto por el llamador (no re-detecta SAF) | Re-llamar `detectarLoteSafDePago` dentro de la función | `detectarLoteSafDePago` usa `db.getAll` (conexión de lectura separada); llamarla dentro de una función invocada DESDE una `tx` abierta reproduce el deadlock que motivó `fix/cxc-reverso-deadlock-getall` |
| Orden en la tx del orquestador | (i) re-leer `movimientos_bancarios` + revalidar `reversado`, (ii) crear egreso + decrementar banco + marcar `reversado=1`, (iii) loop `reversarPagoEnTx` | Loop de pagos primero, egreso al final | Mismo rollback atómico en cualquier orden (una sola tx local); se elige egreso-primero porque es el efecto "propio" del orquestador (tesorería) antes de delegar en CxC — orden de lectura, no de corrección |
| Monto del egreso | 1 egreso = `mov.monto` (total del ingreso), no suma de `montoAplicadoUsd` por pago | Sumar montos del puente | `deposito_directo` garantiza `ingreso.monto = Σ pagos`; usar el campo directo evita un cálculo redundante y coincide con el escenario de spec (`38201beb`, 1 egreso de $2) |
| Gate de permiso/PIN | Vive en `reverso-modal.tsx` (UI), igual que `factura-detalle-cxc.tsx`; el orquestador NO valida permiso, confía en `userId`/`reversedByNombre` ya resueltos | Flag `authorized: boolean` en el orquestador | Convención existente: `registrarReversoAbono` tampoco valida permiso internamente — el chequeo vive donde vive `hasPermission`/`SupervisorPinDialog` |
| TOCTOU pago | Re-chequeo DENTRO de la tx (Step 1 preservado de `reversarPagoEnTx`: `SELECT ... is_reversed` fresco) | Confiar solo en el filtro pre-tx del puente | El filtro pre-tx (`is_reversed IS NULL OR =0`) es una optimización de descubrimiento, no una garantía; la re-lectura dentro de la tx es la guardia real |
| TOCTOU ingreso | Re-`SELECT movimientos_bancarios` + chequeo `reversado` como PRIMERA statement de la tx | Confiar en el chequeo pre-tx | `movimientos_bancarios.reversado` no tiene trigger Postgres (a diferencia de `pagos`); la única guardia posible es app-level, y debe ser lo más fresca posible |

## Data Flow

```
PRE-TX (lecturas puras, db.getAll):
  SELECT movimientos_bancarios WHERE id=ingresoId         ─→ reversado? abort
  SELECT bridge (movimientos_bancarios_pagos ⋈ pagos)      ─→ [pago_id...] (mismo query de previewFacturasAfectadas)
  for each pago_id: detectarLoteSafDePago(empresaId, id)   ─→ si algún facturasAfectadas≠[] → abort (CERO mutación)

db.writeTransaction(tx):
  (i)   re-SELECT movimientos_bancarios ─→ reversado? abort (TOCTOU)
  (ii)  INSERT egreso (origen='REVERSO', reverso_de=ingresoId) + UPDATE bancos_empresa.saldo_actual + UPDATE mov SET reversado=1
  (iii) for each pago_id: reversarPagoEnTx(tx, {pagoId, generatedLote, ...})
          └─ re-SELECT pago (is_reversed? abort) → UPDATE pagos.is_reversed=1 → reabre venta → REV en movimientos_cuenta → contra-asientos
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/features/cxc/hooks/use-cxc.ts` | Modify | Extraer `reversarPagoEnTx(tx, params)`; `registrarReversoAbono` pasa a wrapper (abre tx, detecta SAF, delega) |
| `src/features/tesoreria/hooks/use-reverso-abono-directo.ts` | Create | `reversarAbonoDirectoDesdeTesoreria`: resolución de puente, SAF-block, tx única |
| `src/features/tesoreria/components/reverso-modal.tsx` | Modify | Rama por `origen==='TRANSFERENCIA_CLIENTE'`; PIN gate (`SupervisorPinDialog`); deshabilitar "Confirmar" si `facturasSaf.length>0` |
| `src/features/cxc/hooks/__tests__/reversar-pago-en-tx.test.ts` | Create | Regresión byte-idéntica (2a) |
| `src/features/tesoreria/hooks/__tests__/use-reverso-abono-directo.test.ts` | Create | Simple, multi-factura, SAF-block, doble-reverso, rollback, multi-tenant (2b) |

## Interfaces / Contracts

```ts
// use-cxc.ts — slice 2a
export interface ReversarPagoEnTxParams {
  pagoId: string; empresaId: string
  reversedBy: string; reversedByNombre: string
  reason: string; now: string
  generatedLote: boolean // de detectarLoteSafDePago, resuelto pre-tx por el llamador
}
export async function reversarPagoEnTx(tx: Transaction, params: ReversarPagoEnTxParams): Promise<void>

// use-reverso-abono-directo.ts — slice 2b
export interface ReversarAbonoDirectoParams {
  ingresoId: string; motivo: string
  userId: string; reversedByNombre: string; empresaId: string
}
export async function reversarAbonoDirectoDesdeTesoreria(params: ReversarAbonoDirectoParams): Promise<void>
```

Egreso insert (columnas exactas de `movimientos_bancarios`, mecánica de `reversarMovBancario` inline): `tipo='EGRESO'`, `origen='REVERSO'`, `monto=mov.monto`, `saldo_anterior/nuevo` desde `bancos_empresa.saldo_actual`, `doc_origen_id/tipo` heredados del ingreso, `reverso_de=ingresoId`, `validado=0`, `reversado=0`, `fecha=todayStr()`, `created_by=userId`, `empresa_id`.

## Idempotencia — límite conocido (no nuevo)

El trigger Postgres `trg_pagos_allow_reversal` corre en SYNC (Supabase), no en el commit local. Si una réplica offline duplicada llega después de que la tx local ya commiteó, el trigger puede rechazar el UPDATE en servidor sin revertir la tx local ya aplicada — mismo comportamiento que hoy tiene `registrarReversoAbono` standalone; no es un riesgo nuevo de este diseño.

## Testing Strategy

| Caso | Qué prueba | Capa |
|---|---|---|
| Regresión 2a | `registrarReversoAbono` idéntico pre/post refactor | Unit (vitest, mock tx) |
| Simple ($100, 1 factura) | Egreso + reapertura + `is_reversed` | Integration |
| Multi-factura (`38201beb`) | 1 egreso, N reversos, misma tx | Integration |
| SAF-block | Cero mutación, mensaje exacto, abort pre-tx | Integration |
| Doble-reverso | Pago ya reversado / ingreso ya reversado → abort sin duplicar | Integration |
| Rollback | Falla en pago 3 de 3 → cero egreso, cero reaperturas | Integration |
| Multi-tenant | Empresa A no muta filas de empresa B | Integration |

## Migration / Rollout

No migration required. 2a es reversible sin riesgo (comportamiento idéntico). 2b solo se activa vía el wiring condicional en el modal; revertir ese `if` restaura el bug original sin corromper datos nuevos.

## Slice Boundaries

2a (refactor, ~100-150 líneas, PR aislado) → 2b, que si supera ~400 líneas se divide en **2b-i** (orquestador + tests, sin UI) y **2b-ii** (wiring + PIN gate + tests de componente), stacked `2b-ii → 2b-i → 2a → develop`.

## Open Questions

- [ ] UI para el caso `estado==='LEGACY'` (sin filas de puente): el botón queda habilitado (spec solo gatea por `facturasSaf`), pero el orquestador abortará con "sin trazabilidad" — confirmar que ese mensaje de error es suficiente UX o si el botón debe deshabilitarse también en LEGACY (fuera del scope literal de la spec actual).
