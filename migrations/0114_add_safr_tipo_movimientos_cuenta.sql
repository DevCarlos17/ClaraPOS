-- =============================================================================
-- Migration: 0114_add_safr_tipo_movimientos_cuenta.sql
-- Created:   2026-10-19
-- Depends:   0110_extender_trigger_saldo_pendiente.sql (cuerpo base vigente
--              de actualizar_saldo_cliente() — es la MAS RECIENTE CREATE OR
--              REPLACE de esta funcion, confirmado por grep sobre
--              migrations/: ningun archivo entre 0110 y este la redefine.
--              Extender el cuerpo de 0102 en vez de este seria una
--              REGRESION CATASTROFICA: borraria silenciosamente el
--              mantenimiento de saldo_pendiente_usd agregado en 0110.)
--            0090_add_safc_tipo_movimientos_cuenta.sql (precedente exacto de
--              CHECK-widening para un tipo SAF-adyacente)
--            0113_saf_creditos_reversas.sql (mismo PR — tabla que esta
--              migracion habilita via el nuevo tipo 'SAFR')
--
-- CONTEXT (design.md Q4):
--   'SAFR' ("SAF Reverso") es el tipo que ancla la fila `movimientos_cuenta`
--   emparejada con cada INSERT en `saf_creditos_reversas` (0113) — anula el
--   remanente de `saf_disponible` de un lote reversado. Misma formula de
--   consumo que 'SAF' (`GREATEST(0, saf_disponible - monto)`); la UNICA
--   diferencia es el ORIGEN semantico (anulacion de credito NUNCA consumido
--   vs. consumo real como metodo de pago), nunca la matematica — ver
--   design.md linea 113 ("SAFR = same consumption formula as SAF;
--   difference is ORIGIN, not math").
--
-- WHY saldo_pendiente_usd NO CAMBIA:
--   SAFR nunca toca una factura/venta directamente — anular credito SAF
--   nunca-consumido no reabre ni cierra ninguna deuda. SAFR cae en el ELSE
--   del CASE de `saldo_pendiente_usd` (0110), exactamente igual que
--   SAFC/SAL hoy. El reabrir facturas durante un reverso de pago usa el
--   tipo 'REV' YA EXISTENTE (una fila REV por venta afectada) — mecanismo
--   de venta intacto, ver design.md linea 60 y Slice 3b-ii (fuera de
--   alcance de este archivo).
--
-- WHY saldo_nuevo (IF/ELSIF superior) NO CAMBIA:
--   SAFR no se agrega al IF/ELSIF de computo de `saldo_nuevo`
--   (FAC/NDB/PAG/NCR/SAF) — cae en el ELSE implicito igual que SAFC/REV/SAL,
--   confiando en el `NEW.saldo_nuevo` provisto por la app (escrito por
--   Slice 3b-ii, fuera de alcance de este slice — esta migracion es SOLO
--   infraestructura de CHECK/trigger de `saf_disponible`).
--
-- NO TRIGGER LOGIC NUEVA PARA saf_creditos_reversas AQUI: esa vive en 0113
-- (mismo PR). Esta migracion solo (a) amplia el CHECK de
-- `movimientos_cuenta.tipo` y (b) reemplaza `actualizar_saldo_cliente()`
-- para que el tipo 'SAFR' participe en el CASE de `saf_disponible`.
--
-- VERIFICACION MANUAL RECOMENDADA ANTES DE PRODUCCION (owner, esta sesion no
-- tiene credenciales de DB para ejecutarlo):
--
--   BEGIN;
--     UPDATE clientes SET saf_disponible = 40, saldo_pendiente_usd = 15
--       WHERE id = '<cliente-test>';
--     INSERT INTO movimientos_cuenta
--       (id, empresa_id, cliente_id, tipo, referencia, monto,
--        saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'SAFR',
--        'TEST-0114', 40, 100, 100, now(), now(), '<usuario-test>');
--     -- saldo_nuevo (100) se confia sin asercion (mismo tratamiento que
--     -- SAFC/REV/SAL) — lo que importa verificar aqui es saf_disponible y
--     -- saldo_pendiente_usd.
--     SELECT saf_disponible, saldo_pendiente_usd FROM clientes WHERE id = '<cliente-test>';
--     -- Esperado: saf_disponible=0 (40 - 40, NUNCA negativo),
--     -- saldo_pendiente_usd=15 SIN CAMBIOS (SAFR no toca deuda pendiente).
--   ROLLBACK;
--
-- ROLLBACK:
--   Re-aplicar 0110_extender_trigger_saldo_pendiente.sql (CREATE OR REPLACE
--   FUNCTION) verbatim — restaura el CASE de saf_disponible sin 'SAFR'.
--   ALTER TABLE movimientos_cuenta DROP CONSTRAINT IF EXISTS movimientos_cuenta_tipo_check;
--   ALTER TABLE movimientos_cuenta ADD CONSTRAINT movimientos_cuenta_tipo_check
--     CHECK (tipo IN ('FAC', 'PAG', 'NCR', 'NDB', 'REV', 'SAL', 'SAF', 'SAFC'));
-- =============================================================================

BEGIN;

ALTER TABLE movimientos_cuenta DROP CONSTRAINT IF EXISTS movimientos_cuenta_tipo_check;
ALTER TABLE movimientos_cuenta
  ADD CONSTRAINT movimientos_cuenta_tipo_check
  CHECK (tipo IN ('FAC', 'PAG', 'NCR', 'NDB', 'REV', 'SAL', 'SAF', 'SAFC', 'SAFR'));

CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
RETURNS TRIGGER AS $$
BEGIN
  -- Compute saldo_nuevo from the saldo_anterior provided in the INSERT.
  -- DO NOT read saldo_actual live from clientes — that created the race
  -- condition fixed in migration 0060. Keep that fix.
  IF NEW.tipo IN ('FAC', 'NDB') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo IN ('PAG', 'NCR') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  ELSIF NEW.tipo = 'SAF' THEN
    -- SAF covers two directions the trigger cannot distinguish from monto
    -- alone (monto is always positive, CHECK constraint): debt-reduction
    -- (saldo_anterior - monto) or credit-consumption (saldo_anterior + monto).
    -- Trust the app-computed value (same treatment as REV/SAL below), but
    -- assert internal consistency so a caller bug (e.g. omitted saldo_nuevo)
    -- fails loudly instead of silently corrupting the ledger a third time.
    IF NEW.saldo_nuevo IS NULL
       OR ABS(ABS(NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
      RAISE EXCEPTION 'SAF saldo_nuevo (%) inconsistent with saldo_anterior (%) +/- monto (%)',
        NEW.saldo_nuevo, NEW.saldo_anterior, NEW.monto USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- REV, SAL, SAFC, SAFR: saldo_nuevo stays as provided in the INSERT (no
  -- recalculation, no consistency assertion — SAFR joins SAFC/REV/SAL in
  -- this implicit ELSE per design.md Q4; unchanged from 0110 for the other
  -- three).

  -- CRITICAL: set context so validate_cliente_update allows this UPDATE.
  IF NEW.saldo_nuevo IS NOT NULL THEN
    PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
    UPDATE clientes
    SET saldo_actual = NEW.saldo_nuevo,
        -- saf_disponible: delta atomico dentro del mismo UPDATE, SIN leer
        -- primero. 'SAFC' crea credito; 'SAF'/'SAFR' lo consumen/anulan con
        -- la MISMA formula (piso en 0) — 'SAFR' difiere de 'SAF' solo en el
        -- ORIGEN (anulacion de remanente nunca-consumido vs. consumo real
        -- como metodo de pago), nunca en la matematica (design.md Q4).
        -- Cualquier otro tipo (FAC/NDB/PAG/NCR/REV/SAL) no toca el credito
        -- standing.
        saf_disponible = CASE
          WHEN NEW.tipo = 'SAFC' THEN saf_disponible + NEW.monto
          WHEN NEW.tipo IN ('SAF', 'SAFR') THEN GREATEST(0, saf_disponible - NEW.monto)
          ELSE saf_disponible
        END,
        -- saldo_pendiente_usd: CASE SIN CAMBIOS respecto a 0110 — 'SAFR'
        -- cae al ELSE junto con 'SAFC'/'SAL', porque anular credito SAF
        -- nunca-consumido no reabre ni cierra ninguna factura (el reabrir
        -- usa el tipo 'REV' existente, una fila por venta afectada, fuera
        -- de este trigger — ver design.md linea 60 y Slice 3b-ii).
        saldo_pendiente_usd = CASE
          WHEN NEW.tipo IN ('FAC', 'NDB', 'REV') THEN saldo_pendiente_usd + NEW.monto
          WHEN NEW.tipo IN ('PAG', 'NCR', 'SAF') THEN GREATEST(0, saldo_pendiente_usd - NEW.monto)
          ELSE saldo_pendiente_usd
        END,
        updated_at   = NOW()
    WHERE id = NEW.cliente_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
