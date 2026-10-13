-- =============================================================================
-- Migration: 0106_ventas_estado_column.sql
-- Created:   2026-10-12
-- Depends:   0097_permitir_reverso_saldo_venta.sql (define prevent_venta_mutation
--            vigente, guard relajado de saldo_pend_usd)
--
-- CONTEXTO (ver openspec/changes/cxc-sync-snapshot-redesign/design.md):
--   `ventas.status` (ACTIVA/ANULADA) solo expresa validez FISCAL de la
--   factura. No existe hoy una columna que exprese el estado de COBRANZA
--   (pendiente/parcialmente pagada/pagada/reabierta por reverso) — el
--   codigo de `use-cxc.ts` infiere esto ad-hoc comparando
--   `saldo_pend_usd` contra `total_usd` en cada lugar que lo necesita, y
--   tiene un filtro muerto (`status NOT IN ('ANULADA', 'REVERSADA')`)
--   porque `'REVERSADA'` nunca fue un valor real de `status`.
--
-- QUE HACE ESTA MIGRACION (todo en una transaccion — ver design.md §8 para
-- por que columna+trigger van juntos y no en migraciones separadas):
--   1. Agrega `ventas.estado` (TEXT, NOT NULL, DEFAULT 'pendiente', CHECK
--      IN pendiente/parcial/pago/reversado).
--   2. Crea el indice `idx_mov_cuenta_venta` sobre
--      `movimientos_cuenta(venta_id, fecha DESC, created_at DESC)` —
--      soporta el lookup de "ultimo movimiento" que el trigger hace a
--      continuacion (sin este indice, cada UPDATE de `ventas` dispara un
--      seq scan sobre `movimientos_cuenta`).
--   3. Extiende `prevent_venta_mutation()`: TODOS los guards existentes
--      quedan BYTE-IDENTICOS a 0097 (verificado via grep — nadie los tocó
--      desde 0097). Se agrega SOLO la derivacion de `estado` cuando
--      `saldo_pend_usd` cambia. Este trigger es `BEFORE UPDATE OR DELETE`
--      — NUNCA fire en INSERT (ver punto 4).
--   4. AMENDMENT (CRITICAL-1, ver design.md Amendment Note 2 / §3b): agrega
--      una funcion/trigger NUEVA y SEPARADA, `derive_venta_estado_insert()`
--      + `trg_venta_estado_insert`, `BEFORE INSERT ON ventas`. Sin esto, toda
--      venta CONTADO (saldo_pend_usd=0 al nacer) quedaba STUCK para siempre
--      en el `DEFAULT 'pendiente'` porque `prevent_venta_mutation()` nunca
--      corre en INSERT (OLD es NULL). HARD CONSTRAINT: esta derivacion NO se
--      fusiona con `prevent_venta_mutation()` — ensanchar esa funcion a
--      INSERT rompe TODO `crearVenta()` (OLD NULL hace que cada guard de
--      columna congelada `NEW.x IS DISTINCT FROM OLD.x` evalue TRUE, abortando
--      con P0001). Derivacion por MAGNITUD SOLAMENTE (sin lookup de ultimo
--      movimiento: `movimientos_cuenta` no tiene fila `'FAC'` para esta venta
--      todavia, se inserta DESPUES en la misma transaccion) — `parcial` y
--      `reversado` son estructuralmente inalcanzables al nacer.
--
-- POR QUE EXTIENDE 0097 Y NO 0006 (critico — ver Engram #5398, verificacion
-- pre-apply de este change): 0097 relajo el guard de `saldo_pend_usd` para
-- permitir que SUBA (hasta `total_usd`) al reversar un pago — sin ese fix,
-- un reverso de pago (`registrarReversoAbono`) queda descartado por el
-- connector como FATAL (bug P0001 historico) y la factura nunca vuelve a
-- CxC. Restaurar el guard estricto de 0006 en esta migracion reintroduciria
-- ese bug. El cuerpo de partida es, por lo tanto, el de 0097, no el de 0006.
--
-- NO SE REQUIERE TOCAR EL WHITELIST DE COLUMNAS CONGELADAS: el guard de
-- columnas inmutables (el primer `IF ... RAISE EXCEPTION`) lista columnas
-- especificas por nombre; `estado` NO esta en esa lista, asi que queda
-- mutable por exclusion sin ningun cambio en ese bloque. Solo se actualiza
-- el texto del mensaje de error para mencionar `estado` (documental).
--
-- MATRIZ DE PARIDAD (design.md §4/§9 — espejo exacto en
-- src/features/cxc/lib/estado-venta.ts; si se edita un lado, editar el
-- otro y correr estado-venta.test.ts):
--
--   | saldo_pend_usd | total_usd | ultimo_mov.tipo | estado resultante |
--   |----------------|-----------|-----------------|--------------------|
--   | 0              | 100       | null (FAC)      | pago               |
--   | 100            | 100       | null (FAC)      | pendiente          |
--   | 60             | 100       | PAG             | parcial            |
--   | 0              | 100       | NCR             | pago               |
--   | 50             | 100       | REV             | reversado          |
--   | 0              | 100       | PAG (post-REV)  | pago               |
--   | 25             | 100       | SAF             | parcial            |
--
-- MATRIZ DE PARIDAD — TRIGGER DE INSERT (derive_venta_estado_insert(),
-- magnitud solamente, `ultimo_mov.tipo` siempre NULL porque no existe fila en
-- `movimientos_cuenta` todavia — ver punto 4 arriba):
--
--   | saldo_pend_usd | total_usd | estado resultante |
--   |----------------|-----------|--------------------|
--   | 0              | 100       | pago (CONTADO)     |
--   | 100            | 100       | pendiente (CREDITO)|
--
-- Es IDEMPOTENTE: `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
-- `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`.
--
-- ROLLBACK (solo si algo sale mal en produccion, no crear el archivo hasta
-- entonces): nueva migracion correctiva que:
--   1. `ALTER TABLE ventas DROP COLUMN IF EXISTS estado;`
--   2. `DROP INDEX IF EXISTS idx_mov_cuenta_venta;`
--   3. `DROP TRIGGER IF EXISTS trg_venta_estado_insert ON ventas;`
--   4. `DROP FUNCTION IF EXISTS derive_venta_estado_insert();`
--   5. Paste-back EXACTO del cuerpo de 0097 (NO el de 0006 — restaurar 0006
--      reintroduciria el bug P0001 de reversos descartados, ver arriba):
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
--     IF NEW.saldo_pend_usd > OLD.saldo_pend_usd AND NEW.saldo_pend_usd > NEW.total_usd THEN
--       RAISE EXCEPTION 'El saldo pendiente no puede exceder el total de la factura';
--     END IF;
--     RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;
-- =============================================================================

BEGIN;

ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'pendiente'
  CHECK (estado IN ('pendiente', 'parcial', 'pago', 'reversado'));

CREATE INDEX IF NOT EXISTS idx_mov_cuenta_venta
  ON movimientos_cuenta(venta_id, fecha DESC, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_venta_mutation()
RETURNS TRIGGER AS $$
DECLARE
  last_mov_tipo TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las ventas no se pueden eliminar';
  END IF;
  -- Frozen-columns guard — byte-identical to 0097, UNCHANGED. `estado` no
  -- esta en esta lista a proposito: es mutable por exclusion (ver nota
  -- arriba). No agregar `estado` aqui — romperia la derivacion del trigger.
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
    RAISE EXCEPTION 'Solo se puede actualizar saldo_pend_usd, status y estado de una venta';
  END IF;
  -- status transition guard — byte-identical to 0097, UNCHANGED.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status != 'ACTIVA' OR NEW.status != 'ANULADA' THEN
      RAISE EXCEPTION 'El status solo puede cambiar de ACTIVA a ANULADA';
    END IF;
  END IF;
  -- saldo_pend_usd ceiling guard — byte-identical to 0097, UNCHANGED.
  IF NEW.saldo_pend_usd > OLD.saldo_pend_usd AND NEW.saldo_pend_usd > NEW.total_usd THEN
    RAISE EXCEPTION 'El saldo pendiente no puede exceder el total de la factura';
  END IF;

  -- NEW (this migration): derive estado whenever saldo_pend_usd changes.
  IF NEW.saldo_pend_usd IS DISTINCT FROM OLD.saldo_pend_usd THEN
    SELECT tipo INTO last_mov_tipo FROM movimientos_cuenta
    WHERE venta_id = NEW.id
    ORDER BY fecha DESC, created_at DESC, id DESC LIMIT 1;

    NEW.estado := CASE
      WHEN last_mov_tipo = 'REV' AND NEW.saldo_pend_usd > 0.005 THEN 'reversado'
      WHEN NEW.saldo_pend_usd <= 0.005 THEN 'pago'
      WHEN NEW.saldo_pend_usd >= NEW.total_usd - 0.005 THEN 'pendiente'
      ELSE 'parcial'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- AMENDMENT (CRITICAL-1, design.md §3b): deriva `estado` SOLO al nacer la
-- fila, por magnitud. Funcion SEPARADA e INDEPENDIENTE de
-- `prevent_venta_mutation()` — hard constraint, ver nota al inicio de este
-- archivo. NO agregar logica de `last_mov_tipo` aqui: el movimiento 'FAC'
-- de esta venta se inserta DESPUES, en la misma transaccion
-- (use-ventas.ts:969-970), por lo que un lookup aqui encontraria 0 filas
-- siempre — `parcial`/`reversado` son inalcanzables al nacer de todos modos.
CREATE OR REPLACE FUNCTION derive_venta_estado_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.estado := CASE
    WHEN NEW.saldo_pend_usd <= 0.005 THEN 'pago'
    ELSE 'pendiente'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_venta_estado_insert ON ventas;
CREATE TRIGGER trg_venta_estado_insert
  BEFORE INSERT ON ventas
  FOR EACH ROW EXECUTE FUNCTION derive_venta_estado_insert();

COMMIT;
