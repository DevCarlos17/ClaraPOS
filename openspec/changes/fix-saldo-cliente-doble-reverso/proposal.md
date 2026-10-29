# Proposal: Fix doble-conteo de saldo_actual en reversos CxC repetidos

**Epic**: `reverso-abono-tesoreria`

## Intent

Tras abono→reverso→abono→reverso en una factura de $1, `clientes.saldo_actual` queda en $2 (la factura queda correcta). Dos defectos **pre-existentes** (PR #279-283 solo agregó un caller a una función ya frágil):

1. `reversarPagoEnTx` reabre la deuda del CLIENTE sin clamp — asimétrico con el clamp ya existente a nivel VENTA
2. `useClientesConDeuda` lee el cache `saldo_pendiente_usd`, no `SUM(ventas.saldo_pend_usd)` en vivo — perdió self-healing en migración 0110; nada reconcilia el cache

~10 migraciones ya repararon este ledger: fragilidad recurrente.

## Scope

### In Scope
- Clamp techo en reapertura de deuda del CLIENTE en `reversarPagoEnTx` (`use-cxc.ts:2013-2033`), simétrico al clamp venta-level (`L1978-1986`)
- Migración SQL: recalcula `clientes.saldo_actual`/`saldo_pendiente_usd` desde `SUM(ventas.saldo_pend_usd)`, sin mutar `movimientos_cuenta`
- Fase de diseño obligatoria (financiero sensible)

### Out of Scope
- Revertir arquitectura O(1) de cache (0110)
- Bug #5944 (trazabilidad POS-FIFO)
- Reverso SAF (ya bloqueado)
- Cuadre de caja / sesiones

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `tesoreria-reverso-abono-directo`: los requirements de reverso simple/global deben exigir clamp en la deuda del CLIENTE, igual que ya aplica a la factura

## Approach

Clamp simétrico al de venta-level, en la misma `db.writeTransaction` — afecta ambos entry points (tesorería + consulta-factura, mismo orquestador). Reconciliación idempotente vía migración SQL desde la suma real por cliente; nunca reescribe `movimientos_cuenta`. Diseño decide: (a) alcance de reconciliación (todos los clientes o solo drift), (b) assertion Postgres en `actualizar_saldo_cliente()` para `REV` (como `SAF`), (c) si la causa raíz es carrera de sync (migración 0096) con seguimiento aparte.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `use-cxc.ts` — `reversarPagoEnTx` (~L2013-2033) | Modified | Clamp techo en reapertura de deuda del cliente |
| `migrations/` (nueva) | New | Reconciliación de saldos de cliente corruptos |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `reversarPagoEnTx` compartido por TODO reverso | Med | Verify de los 4 escenarios existentes antes de merge |
| Reconciliación corrige síntoma, no causa (carrera sync, 0096) | Med | Open question en diseño; follow-up aparte |
| Clamp mal calibrado rompe reverso multi-factura legítimo | Low-Med | Tests sobre escenarios ya especificados |

## Rollback Plan

Clamp acotado a una función: revertir el commit restaura el comportamiento previo. Reconciliación solo escribe cache (nunca `movimientos_cuenta`); un error se corrige re-ejecutando el recálculo.

## Dependencies

- Rama desde `origin/develop`; diseño obligatorio antes de tasks/apply (riesgo MEDIO-ALTO)

## Success Criteria

- [ ] Secuencia abono→reverso→abono→reverso deja `saldo_actual` del cliente igual al saldo real
- [ ] Clientes con drift previo quedan reconciliados contra `SUM(ventas.saldo_pend_usd)`
- [ ] Los 4 escenarios de `tesoreria-reverso-abono-directo` siguen pasando sin regresión
- [ ] `movimientos_cuenta` sin ningún UPDATE/DELETE
