-- =============================================================================
-- Migration: 0097_permitir_reverso_saldo_venta.sql
-- Created:   2026-09-29
-- Depends:   0006_ventas.sql (define prevent_venta_mutation + trigger vivo)
--
-- BUG (P0001 "El saldo pendiente solo puede disminuir" descarta el reverso de
-- un abono de factura de venta, dejando CxC inconsistente):
--   `registrarReversoAbono` (src/features/cxc/hooks/use-cxc.ts:1504) hace
--   `UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?` con el valor ya
--   acotado en JS via `Decimal.min(total_usd, saldo_pend_usd + monto)` para
--   reabrir la deuda de la factura tras reversar un pago. El guard vigente
--   de `prevent_venta_mutation()` (0006_ventas.sql:221-224) solo permite que
--   `saldo_pend_usd` BAJE o quede igual:
--       IF NEW.saldo_pend_usd > OLD.saldo_pend_usd THEN
--         RAISE EXCEPTION 'El saldo pendiente solo puede disminuir';
--       END IF;
--
--   El UPDATE de `ventas` es la ULTIMA escritura de la transaccion de
--   reverso: `pagos.is_reversed=1`, `clientes.saldo_actual` y el
--   `movimientos_cuenta` tipo REV ya se sincronizan a Supabase antes de que
--   el connector descarte este batch por P0001 (tratado como FATAL en
--   connector.ts). Resultado: el pago queda marcado como reversado y el
--   saldo del cliente se restaura, pero la factura NUNCA vuelve a CxC —
--   estado financiero inconsistente y silencioso (ver proposal.md, hallazgo
--   P0001 en CxC).
--
-- FIX (relajar SOLO el guard de saldo_pend_usd, acotado a total_usd):
--   Se permite que `saldo_pend_usd` SUBA (reverso de pago reabre la deuda),
--   pero NUNCA mas alla de `total_usd` (la deuda original de la factura).
--   `total_usd` es en si mismo inmutable por el primer guard de esta misma
--   funcion (ningun UPDATE en el codigo lo modifica, confirmado por grep),
--   asi que es un techo estable para la defensa en profundidad en DB —
--   la logica JS (`Decimal.min`) ya acota el valor antes de enviarlo, este
--   CHECK es la segunda linea de defensa contra manipulacion o bugs futuros.
--
--   TODOS los demas guards de la funcion (DELETE, columnas inmutables,
--   transicion de status ACTIVA -> ANULADA) quedan BYTE-IDENTICOS a
--   0006_ventas.sql:195-227. Unico cambio: la condicion del guard de
--   saldo_pend_usd.
--
-- Es IDEMPOTENTE (CREATE OR REPLACE FUNCTION). No modifica el trigger ni el
-- schema; solo reemplaza el cuerpo de la funcion.
--
-- ROLLBACK (solo si algo sale mal en produccion, no crear el archivo hasta
-- entonces): nueva migracion correctiva `0098_revert_permitir_reverso_saldo_
-- venta.sql` con un paste-back exacto de la funcion original de
-- 0006_ventas.sql:195-227 (mismo CREATE OR REPLACE FUNCTION, restaurando el
-- guard `IF NEW.saldo_pend_usd > OLD.saldo_pend_usd THEN RAISE EXCEPTION
-- 'El saldo pendiente solo puede disminuir'; END IF;`). Sin cambio de datos,
-- reversible sin perdida:
--
--   CREATE OR REPLACE FUNCTION prevent_venta_mutation()
--   RETURNS TRIGGER AS $$
--   BEGIN
--     IF TG_OP = 'DELETE' THEN
--       RAISE EXCEPTION 'Las ventas no se pueden eliminar';
--     END IF;
--     IF NEW.nro_factura IS DISTINCT FROM OLD.nro_factura
--        OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
--        OR NEW.total_usd IS DISTINCT FROM OLD.total_usd
--        OR NEW.total_bs IS DISTINCT FROM OLD.total_bs
--        OR NEW.tasa IS DISTINCT FROM OLD.tasa
--        OR NEW.tipo IS DISTINCT FROM OLD.tipo
--        OR NEW.deposito_id IS DISTINCT FROM OLD.deposito_id
--        OR NEW.total_exento_usd IS DISTINCT FROM OLD.total_exento_usd
--        OR NEW.total_base_usd IS DISTINCT FROM OLD.total_base_usd
--        OR NEW.total_iva_usd IS DISTINCT FROM OLD.total_iva_usd
--        OR NEW.total_igtf_usd IS DISTINCT FROM OLD.total_igtf_usd THEN
--       RAISE EXCEPTION 'Solo se puede actualizar saldo_pend_usd y status de una venta';
--     END IF;
--     IF NEW.status IS DISTINCT FROM OLD.status THEN
--       IF OLD.status != 'ACTIVA' OR NEW.status != 'ANULADA' THEN
--         RAISE EXCEPTION 'El status solo puede cambiar de ACTIVA a ANULADA';
--       END IF;
--     END IF;
--     IF NEW.saldo_pend_usd > OLD.saldo_pend_usd THEN
--       RAISE EXCEPTION 'El saldo pendiente solo puede disminuir';
--     END IF;
--     RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_venta_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las ventas no se pueden eliminar';
  END IF;
  -- UPDATE: solo permitir cambios en saldo_pend_usd y status (ACTIVA->ANULADA)
  IF NEW.nro_factura IS DISTINCT FROM OLD.nro_factura
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     OR NEW.total_usd IS DISTINCT FROM OLD.total_usd
     OR NEW.total_bs IS DISTINCT FROM OLD.total_bs
     OR NEW.tasa IS DISTINCT FROM OLD.tasa
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.deposito_id IS DISTINCT FROM OLD.deposito_id
     OR NEW.total_exento_usd IS DISTINCT FROM OLD.total_exento_usd
     OR NEW.total_base_usd IS DISTINCT FROM OLD.total_base_usd
     OR NEW.total_iva_usd IS DISTINCT FROM OLD.total_iva_usd
     OR NEW.total_igtf_usd IS DISTINCT FROM OLD.total_igtf_usd THEN
    RAISE EXCEPTION 'Solo se puede actualizar saldo_pend_usd y status de una venta';
  END IF;
  -- status solo puede ir ACTIVA -> ANULADA
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status != 'ACTIVA' OR NEW.status != 'ANULADA' THEN
      RAISE EXCEPTION 'El status solo puede cambiar de ACTIVA a ANULADA';
    END IF;
  END IF;
  -- saldo_pend_usd puede bajar libremente; puede SUBIR (reverso de pago)
  -- solo hasta total_usd — nunca mas alla de la deuda original (fix 0097).
  IF NEW.saldo_pend_usd > OLD.saldo_pend_usd AND NEW.saldo_pend_usd > NEW.total_usd THEN
    RAISE EXCEPTION 'El saldo pendiente no puede exceder el total de la factura';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
