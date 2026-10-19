-- =============================================================================
-- Migration: 0116_backfill_saldo_pendiente_safv.sql
-- Created:   2026-10-19
-- Depends:   0115_add_safv_tipo_movimientos_cuenta.sql (DEBE aplicarse
--              PRIMERO — sin la correccion estructural de 0115, cualquier
--              venta CREDITO+SAF NUEVA que ocurra DESPUES de este backfill
--              volveria a corromperse exactamente igual, porque el bloque
--              SAF-VTA de use-ventas.ts seguiria emitiendo tipo='SAF' y el
--              trigger seguiria restando. Este archivo NO reemplaza 0115,
--              lo COMPLEMENTA: 0115 = prevencion hacia adelante (nuevas
--              filas 'SAFV' nunca corrompen); 0116 = correccion retroactiva
--              de clientes YA corrompidos por el bug historico.)
--            0111_backfill_saldo_pendiente.sql (precedente exacto — misma
--              formula, mismo patron de dos UPDATE + DO-block de
--              reconciliacion, misma tolerancia 0 exacta)
--
-- PURPOSE:
--   Backfill UNA SOLA VEZ de `clientes.saldo_pendiente_usd` para clientes
--   cuyo valor quedo corrompido por el bug de doble descuento confirmado en
--   datos reales de staging (CLIENTE TEST 2, CLIENTE TEST 3 / venta
--   C01-000021): el trigger servidor `actualizar_saldo_cliente()`
--   (0110/0114, ANTES de 0115) trataba toda fila `movimientos_cuenta`
--   tipo='SAF' insertada por el bloque SAF-VTA de `crearVenta`
--   (use-ventas.ts) como una reduccion de deuda, aunque la factura FAC
--   asociada YA habia nacido neta del SAF (invariante FAC-es-neto). El
--   resultado real en datos de staging: `saldo_pendiente_usd` quedaba en 0
--   en vez del remanente real (ej. $50 de una factura $100 con $50 de SAF
--   aplicado).
--
--   0115 (migracion anterior, mismo PR) corrige la causa raiz hacia
--   ADELANTE: nuevas filas 'SAFV' ya nunca tocan `saldo_pendiente_usd` en
--   el trigger. Este archivo corrige los DATOS YA CORROMPIDOS por el bug
--   historico, re-derivando `saldo_pendiente_usd` desde la fuente de
--   verdad por factura (`ventas.saldo_pend_usd`) — formula IDENTICA a
--   0111:
--
--     GREATEST(0, SUM(ventas.saldo_pend_usd)) WHERE estado != 'pago'
--     agrupado por cliente_id.
--
--   `ventas.saldo_pend_usd` NUNCA fue tocado por este bug — lo mantienen
--   `prevent_venta_mutation()`/`derive_venta_estado_insert()` (0106/0108)
--   de forma INDEPENDIENTE al ledger `movimientos_cuenta` que alimenta
--   `clientes.saldo_pendiente_usd`. Por eso es seguro usarlo como fuente de
--   verdad para re-derivar el agregado por cliente, exactamente igual que
--   hizo 0111 para el historial previo a la existencia del trigger.
--
--   IDEMPOTENTE: recomputacion determinista COMPLETA (dos UPDATE, no un
--   incremento) — ejecutarla N veces produce el mismo resultado que
--   ejecutarla 1 vez. Seguro re-ejecutar incluso si 0111 ya corrio antes
--   (vuelve a dejar el mismo valor correcto; no hay doble-conteo posible
--   porque cada ejecucion RECALCULA desde cero, no incrementa).
--
--   Aislamiento multi-tenant (igual razonamiento que 0111): el agregado
--   agrupa por `cliente_id`, que pertenece a una unica `empresa_id` por
--   construccion — el backfill no puede mezclar datos de dos empresas
--   distintas incluso sin filtrar explicitamente por empresa_id en el
--   WHERE.
--
-- VERIFICACION MANUAL RECOMENDADA ANTES DE PRODUCCION (owner — ejecutar EN
-- ESTE ORDEN):
--   1. Ejecutar 0115_add_safv_tipo_movimientos_cuenta.sql completo.
--   2. Ejecutar este archivo (0116) completo.
--   3. SELECT saldo_pendiente_usd FROM clientes WHERE id = '<CLIENTE-TEST-3>';
--      -- Esperado: 50.00000000 (factura C01-000021: $100 total, $50 SAF
--      -- aplicado, $50 de deuda real pendiente).
--   4. Re-verificar CLIENTE TEST 2 con el mismo patron.
--   5. Query de reconciliacion ad-hoc (identica a la de 0111), re-ejecutable
--      en cualquier momento desde el SQL Editor de Supabase:
--        SELECT c.id FROM clientes c
--        WHERE ABS(c.saldo_pendiente_usd - GREATEST(0, COALESCE((
--          SELECT SUM(v.saldo_pend_usd) FROM ventas v
--          WHERE v.cliente_id = c.id AND v.estado != 'pago'
--        ), 0))) > 0;
--        -- 0 filas = 100% consistente.
--
-- ROLLBACK:
--   No aplica un rollback de datos (este archivo es una CORRECCION de
--   datos, no una migracion de forma — no agrega columnas ni constraints).
--   Si se necesita revertir, restaurar `clientes.saldo_pendiente_usd` desde
--   un backup previo a esta ejecucion. No hay DDL en este archivo que
--   revertir.
-- =============================================================================

BEGIN;

-- Paso 1: clientes sin ninguna venta pendiente quedan en 0 explicitamente.
UPDATE clientes c
SET saldo_pendiente_usd = 0
WHERE c.saldo_pendiente_usd != 0
  AND NOT EXISTS (
    SELECT 1 FROM ventas v WHERE v.cliente_id = c.id AND v.estado != 'pago'
  );

-- Paso 2: clientes con al menos una venta pendiente reciben el agregado real.
UPDATE clientes c
SET saldo_pendiente_usd = sub.d
FROM (
  SELECT cliente_id, GREATEST(0, SUM(saldo_pend_usd)) AS d
  FROM ventas
  WHERE estado != 'pago'
  GROUP BY cliente_id
) sub
WHERE c.id = sub.cliente_id;

DO $$
DECLARE
  v_inconsistentes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_inconsistentes
  FROM clientes c
  WHERE ABS(c.saldo_pendiente_usd - GREATEST(0, COALESCE((
    SELECT SUM(v.saldo_pend_usd) FROM ventas v
    WHERE v.cliente_id = c.id AND v.estado != 'pago'
  ), 0))) > 0;

  IF v_inconsistentes > 0 THEN
    RAISE WARNING '0116_backfill_saldo_pendiente_safv: % cliente(s) con saldo_pendiente_usd fuera de tolerancia (0 exacta) tras el backfill — revisar manualmente.', v_inconsistentes;
  ELSE
    RAISE NOTICE '0116_backfill_saldo_pendiente_safv: reconciliacion OK, 0 clientes inconsistentes.';
  END IF;
END $$;

COMMIT;
