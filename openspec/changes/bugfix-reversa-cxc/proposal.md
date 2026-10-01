# Proposal: Permitir reverso de abono en ventas (fix P0001 silencioso en CxC)

## Intent

Reversar un pago de una factura de VENTA falla en produccion sin avisar al usuario. `registrarReversoAbono` (`src/features/cxc/hooks/use-cxc.ts:1504-1655`) hace `UPDATE ventas SET saldo_pend_usd = min(total_usd, saldo_pend_usd + monto)` para reabrir la deuda, pero el trigger `trg_venta_protect` (`prevent_venta_mutation()`, ver Resolucion Q1) rechaza CUALQUIER aumento de `saldo_pend_usd` con `RAISE EXCEPTION ... P0001`. El connector PowerSync trata P0001 como FATAL (`connector.ts:29-34`) y descarta la operacion sin reintentar ni avisar.

**Agravante detectado**: el UPDATE de `ventas` es la ULTIMA escritura fallida de la transaccion; `pagos.is_reversed=1`, `clientes.saldo_actual` y el `movimientos_cuenta` tipo `REV` YA se subieron a Supabase antes de que el connector descarte el batch. Resultado: el pago queda marcado como reversado y el saldo del cliente se restaura, pero la factura NUNCA vuelve a CxC — estado financiero inconsistente y silencioso.

## Resolucion Q1 — trigger vivo

`migrations/0006_ventas.sql:195-230` (`prevent_venta_mutation()`) es el trigger VIVO. Evidencia: es parte de la serie `0001_foundation_saas.sql`→`0009_seed_roles_permisos.sql` (commit `35fdded`, "migrate frontend to new SaaS database schema"), usa nombres de tabla vigentes (`ventas_det`, `metodos_cobro`) que coinciden con `src/core/db/powersync/schema.ts` y CLAUDE.md. `migrations/0001_initial_schema.sql` (con su propio check similar en L492-493) es un archivo HUERFANO del schema pre-SaaS: usa tablas inexistentes hoy (`detalle_venta`, `metodos_pago`, `compras`) y `migrations/README.md` nunca lo documenta junto a la serie 0001_foundation_saas→0096 (el README esta desactualizado, salta de 0002 a 0055). No se toca `0001_initial_schema.sql`.

Guard completo de `prevent_venta_mutation()` (no relajar nada mas): bloquea DELETE siempre; bloquea cambios a `nro_factura, cliente_id, total_usd, total_bs, tasa, tipo, deposito_id, total_exento_usd, total_base_usd, total_iva_usd, total_igtf_usd`; `status` solo ACTIVA→ANULADA; `saldo_pend_usd` solo puede bajar (el bug).

## Scope

**In**: nueva migracion `0097_permitir_reverso_saldo_venta.sql` que ajusta `prevent_venta_mutation()` para permitir que `saldo_pend_usd` SUBA solo hasta `total_usd` (nunca mas alla — no hay hoy CHECK de DB para ese tope, solo `Decimal.min` en JS; la migracion debe agregarlo como defensa en profundidad). Todo lo demas del guard queda igual.

**Out**: CxP (`prevent_factura_compra_mutation`, sin este check) y gastos — no tocar. Connector descartando P0001 silenciosamente (`connector.ts`) — riesgo latente separado, requiere superficie de error al usuario, fuera de alcance. `vencimientos_cobrar` no se actualiza en el reverso — hallazgo secundario, fuera de alcance. Related but distinct: `venta-saldo-pend-single-write-p0001` (mismo trigger, causa raiz de doble-write en `crearVenta`, no modifica el trigger) — sin dependencia bloqueante.

## Capabilities

New: None. Modified: None — fix interno de trigger, restaura el comportamiento ya documentado en `migrations/0015_reverso_abonos.sql`.

## Impact

| Area | Impact |
|------|--------|
| `migrations/0097_*.sql` (nueva) | Ajusta `prevent_venta_mutation()`, agrega bound `saldo_pend_usd <= total_usd` |
| `src/features/cxc/hooks/use-cxc.ts` | Sin cambio de codigo (la logica ya acota con `Decimal.min`) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Relajar de mas y permitir inflar saldo arbitrariamente | Low | Bound explicito `<= total_usd` en el trigger, no blanket removal |
| Elegir el trigger equivocado (archivo huerfano) | Resuelto | Ver Resolucion Q1 con evidencia de commit y schema.ts |
| Sin ambiente de staging para probar el trigger contra Postgres real | Medium | Validar con `EXPLAIN`/insert manual en el SQL Editor de Supabase antes de aplicar en prod; test unitario Vitest para la logica JS del bound |

## Rollback Plan

Nueva migracion correctiva `0098` que restaura el `CREATE OR REPLACE FUNCTION prevent_venta_mutation()` de `0006_ventas.sql` tal cual. Sin cambio de datos, reversible.

## Testing

`yarn test:run` — agregar caso en `src/features/cxc/hooks/__tests__/use-cxc.test.ts` (no existe cobertura de `registrarReversoAbono` hoy) verificando el UPDATE de `saldo_pend_usd` acotado a `total_usd`. El trigger en si (SQL) no es testeable por Vitest; se valida manualmente contra Postgres real (Supabase SQL Editor) dado que no hay staging — documentar el query de verificacion en el PR.

## Success Criteria

- [ ] Reverso de pago en factura de venta reabre `saldo_pend_usd` sin P0001
- [ ] `saldo_pend_usd` nunca excede `total_usd` (bound en DB, no solo en JS)
- [ ] Ningun otro campo del guard de `prevent_venta_mutation()` se relaja
- [ ] Test Vitest nuevo en GREEN para el calculo acotado del reverso
