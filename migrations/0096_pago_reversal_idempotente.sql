-- =============================================================================
-- Migration: 0096_pago_reversal_idempotente.sql
-- Created:   2026-09-23
-- Depends:   0015_reverso_abonos.sql (define allow_pago_reversal + trigger)
--
-- BUG (P0001 "Este pago ya fue reversado anteriormente." descarta ops de sync):
--   `allow_pago_reversal()` (cuerpo vigente en 0015:24-53) rechaza con
--   RAISE EXCEPTION cualquier UPDATE donde OLD.is_reversed = TRUE y
--   NEW.is_reversed = TRUE:
--       IF OLD.is_reversed = TRUE AND NEW.is_reversed = TRUE THEN
--         RAISE EXCEPTION 'Este pago ya fue reversado anteriormente.';
--       END IF;
--
--   El problema: en la arquitectura offline-first (PowerSync -> Supabase), el
--   PATCH que marca `is_reversed = 1` puede REENVIARSE (reintento tras un
--   checkpoint no confirmado, reconexion, o disparo doble del flujo de
--   anulacion). En ese reenvio, el servidor YA tiene is_reversed = TRUE, asi
--   que el trigger dispara P0001 y el connector (connector.ts:661-678) trata
--   ese codigo como FATAL y DESCARTA la operacion — y con ella toda la
--   transaccion del batch (transaction.complete() en el catch de FATAL).
--
--   El segundo PATCH es una operacion IDEMPOTENTE: pide dejar el pago en un
--   estado (reversado) en el que YA esta. No es una doble-reversa real; es
--   ruido de red. Tratarlo como error fatal arriesga perder OTRAS ops
--   legitimas del mismo batch (mismo patron documentado en 0062 para
--   movimientos_cuenta).
--
-- FIX (idempotencia + preservacion de auditoria):
--   Cuando OLD.is_reversed = TRUE y NEW.is_reversed = TRUE, en vez de
--   RAISE EXCEPTION, retornar un no-op silencioso que NO altera la fila:
--   se devuelve la fila con los campos de auditoria de reverso ORIGINALES
--   (reversed_at, reversed_by, reversed_reason) — no los del PATCH reenviado.
--   Asi un reintento de red nunca pisa el timestamp/usuario del reverso real
--   (auditoria financiera intacta) y el UPDATE se acepta sin error, dejando
--   que PowerSync avance el checkpoint.
--
--   La validacion de inmutabilidad financiera (0015:28-44) se PRESERVA sin
--   cambios: cualquier intento de tocar monto/tasa/moneda/etc. sigue
--   rechazado. Des-reversar (TRUE -> FALSE) tampoco se habilita: ese caso no
--   entra en esta rama y sigue gobernado por la inmutabilidad.
--
-- Es IDEMPOTENTE (CREATE OR REPLACE FUNCTION). No modifica el trigger ni el
-- schema; solo reemplaza el cuerpo de la funcion.
-- =============================================================================

CREATE OR REPLACE FUNCTION allow_pago_reversal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Verificar que los campos financieros e identificadores no cambian
  -- (inmutabilidad financiera — preservado verbatim de 0015).
  IF OLD.empresa_id        IS DISTINCT FROM NEW.empresa_id        OR
     OLD.venta_id          IS DISTINCT FROM NEW.venta_id          OR
     OLD.cliente_id        IS DISTINCT FROM NEW.cliente_id        OR
     OLD.metodo_cobro_id   IS DISTINCT FROM NEW.metodo_cobro_id   OR
     OLD.moneda_id         IS DISTINCT FROM NEW.moneda_id         OR
     OLD.tasa              IS DISTINCT FROM NEW.tasa              OR
     OLD.monto             IS DISTINCT FROM NEW.monto             OR
     OLD.monto_usd         IS DISTINCT FROM NEW.monto_usd         OR
     OLD.referencia        IS DISTINCT FROM NEW.referencia        OR
     OLD.fecha             IS DISTINCT FROM NEW.fecha             OR
     OLD.created_at        IS DISTINCT FROM NEW.created_at        OR
     OLD.created_by        IS DISTINCT FROM NEW.created_by        OR
     OLD.sesion_caja_id    IS DISTINCT FROM NEW.sesion_caja_id    OR
     OLD.banco_empresa_id  IS DISTINCT FROM NEW.banco_empresa_id
  THEN
    RAISE EXCEPTION 'Los campos financieros de pagos son inmutables. Solo se permiten actualizaciones de reverso.';
  END IF;

  -- Reverso idempotente (fix 0096): si el pago YA estaba reversado y el
  -- UPDATE tambien pide reversado, es un PATCH reenviado por sync (no una
  -- doble-reversa real). En vez de RAISE EXCEPTION (que hacia que PowerSync
  -- descartara la operacion como FATAL), se acepta como NO-OP preservando
  -- los campos de auditoria ORIGINALES del primer reverso — un reintento de
  -- red nunca sobrescribe reversed_at/reversed_by/reversed_reason.
  IF OLD.is_reversed = TRUE AND NEW.is_reversed = TRUE THEN
    NEW.reversed_at         := OLD.reversed_at;
    NEW.reversed_by         := OLD.reversed_by;
    NEW.reversed_reason     := OLD.reversed_reason;
    NEW.procesado_por_nombre := OLD.procesado_por_nombre;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
