-- =============================================================================
-- Migration: 0108_ventas_estado_tolerancia_cero.sql
-- Created:   2026-10-14
-- Depends:   0106_ventas_estado_column.sql (columna `ventas.estado` + indice
--            `idx_mov_cuenta_venta` + triggers `prevent_venta_mutation()`
--            [UPDATE/DELETE] y `derive_venta_estado_insert()` [INSERT] YA
--            APLICADOS en staging — este archivo NO modifica 0106, solo
--            reemplaza el CUERPO de sus dos funciones via CREATE OR REPLACE)
--
-- CONTEXTO (decision del owner, ver sesion de apply de
-- openspec/changes/cxc-sync-snapshot-redesign): ClaraPOS es USD-anchored
-- pero la cobranza real ocurre en Bolivares con una tasa de cambio VARIABLE.
-- La tolerancia de 0.005 USD que trae 0106 podia dejar deuda real en Bs sin
-- cobrar: $0.005 a tasa 500 = Bs 2.5 que el sistema daba por "pagados" sin
-- que el cliente los haya entregado nunca. El owner identifico esto en un
-- ambiente de PRUEBA donde puede pagar facturas de forma completa para
-- verificar limpiamente la transicion de `estado` — la correccion es: una
-- factura es 'pago' SOLO cuando `saldo_pend_usd` es EXACTAMENTE 0.
--
-- INTERINO, NO LA RESPUESTA FINAL DE PRODUCCION (leer antes de asumir que
-- 0 es "seguro" para siempre): las columnas financieras son
-- `NUMERIC(20,8)` (CLAUDE.md regla #10) y cascadas de pago complejas (SAF +
-- FIFO + reversos combinados) pueden dejar residuos de redondeo de
-- fracciones de centavo que con tolerancia 0 NUNCA califican como 'pago'.
-- El plan es rutear esos residuos por el flujo YA EXISTENTE de
-- diferencial-cambiario-a-gasto en un cambio FUTURO y SEPARADO (no incluido
-- aqui). Hasta que ese cambio exista, un residuo de polvo de redondeo deja
-- una factura indefinidamente en 'parcial'/'pendiente' en vez de 'pago' —
-- comportamiento aceptado deliberadamente para el ambiente de prueba actual,
-- NO extrapolar como design final sin revisar ese futuro cambio.
--
-- QUE HACE ESTA MIGRACION (correctiva, NO re-crea columna/indice/triggers —
-- esos ya existen por 0106 y los triggers ya apuntan a estas funciones por
-- nombre, `CREATE OR REPLACE FUNCTION` es suficiente):
--   1. `CREATE OR REPLACE FUNCTION prevent_venta_mutation()`: TODOS los
--      guards (DELETE, columnas congeladas, transicion de `status`, techo de
--      `saldo_pend_usd`) quedan BYTE-IDENTICOS a 0106 (que a su vez los
--      hereda byte-identicos de 0097) — UNICO cambio es la tolerancia del
--      CASE de `estado`, de 0.005 a 0 exacto.
--   2. `CREATE OR REPLACE FUNCTION derive_venta_estado_insert()`: mismo
--      cambio de tolerancia (0.005 -> 0) en su CASE magnitud-only.
--
-- MATRIZ DE PARIDAD (espejo exacto en
-- src/features/cxc/lib/estado-venta.ts — si se edita un lado, editar el
-- otro y correr estado-venta.test.ts; reemplaza la matriz de 0106, que
-- usaba tolerancia 0.005):
--
--   | saldo_pend_usd | total_usd | ultimo_mov.tipo | estado resultante |
--   |----------------|-----------|-----------------|--------------------|
--   | 0              | 100       | null (FAC)      | pago               |
--   | 100            | 100       | null (FAC)      | pendiente          |
--   | 60             | 100       | PAG             | parcial            |
--   | 0              | 100       | NCR             | pago               |
--   | 50             | 100       | REV             | reversado          |
--   | 0.003          | 100       | REV             | reversado (!)      | <- bajo 0.005 esto daba 'pago'
--   | 0              | 100       | PAG (post-REV)  | pago               |
--   | 25             | 100       | SAF             | parcial            |
--   | 0.00000001     | 100       | PAG             | parcial            | <- residuo infinitesimal, NO es pago
--
-- MATRIZ DE PARIDAD — TRIGGER DE INSERT (derive_venta_estado_insert(),
-- magnitud solamente, `ultimo_mov.tipo` siempre NULL porque no existe fila
-- en `movimientos_cuenta` todavia — ver 0106 punto 4):
--
--   | saldo_pend_usd | total_usd | estado resultante |
--   |----------------|-----------|--------------------|
--   | 0              | 100       | pago (CONTADO)     |
--   | 100            | 100       | pendiente (CREDITO)|
--
-- Es IDEMPOTENTE: solo `CREATE OR REPLACE FUNCTION` sobre dos funciones ya
-- existentes — correrlo N veces produce el mismo resultado. No crea ni
-- recrea tabla, columna, indice ni trigger (los triggers de 0106 siguen
-- apuntando a estos mismos nombres de funcion sin cambios).
--
-- OWNER: validar con BEGIN/ROLLBACK primero si se desea confirmar el nuevo
-- CASE antes de comprometer — basta con correr el bloque CREATE OR REPLACE
-- dentro de BEGIN/ROLLBACK y describir las funciones (`\sf
-- prevent_venta_mutation`) para inspeccionar el cuerpo resultante; al ser
-- DDL puro (sin UPDATE de filas), un ROLLBACK aqui es 100% seguro y no dejes
-- rastro — no hay backfill de datos en este archivo (ventas existentes NO
-- se re-derivan; solo cambia el comportamiento de los triggers hacia
-- adelante, a diferencia de 0107 que si reproceso filas existentes).
--
-- ROLLBACK (solo si algo sale mal en produccion, no crear el archivo hasta
-- entonces): nueva migracion correctiva que haga `CREATE OR REPLACE
-- FUNCTION` de ambas funciones pegando de vuelta EXACTAMENTE el cuerpo de
-- 0106 (tolerancia 0.005, no el de 0097 que no tiene `estado` en absoluto):
--
--   CREATE OR REPLACE FUNCTION prevent_venta_mutation()
--   RETURNS TRIGGER AS $$
--   DECLARE
--     last_mov_tipo TEXT;
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
--       RAISE EXCEPTION 'Solo se puede actualizar saldo_pend_usd, status y estado de una venta';
--     END IF;
--     IF NEW.status IS DISTINCT FROM OLD.status THEN
--       IF OLD.status != 'ACTIVA' OR NEW.status != 'ANULADA' THEN
--         RAISE EXCEPTION 'El status solo puede cambiar de ACTIVA a ANULADA';
--       END IF;
--     END IF;
--     IF NEW.saldo_pend_usd > OLD.saldo_pend_usd AND NEW.saldo_pend_usd > NEW.total_usd THEN
--       RAISE EXCEPTION 'El saldo pendiente no puede exceder el total de la factura';
--     END IF;
--     IF NEW.saldo_pend_usd IS DISTINCT FROM OLD.saldo_pend_usd THEN
--       SELECT tipo INTO last_mov_tipo FROM movimientos_cuenta
--       WHERE venta_id = NEW.id
--       ORDER BY fecha DESC, created_at DESC, id DESC LIMIT 1;
--       NEW.estado := CASE
--         WHEN last_mov_tipo = 'REV' AND NEW.saldo_pend_usd > 0.005 THEN 'reversado'
--         WHEN NEW.saldo_pend_usd <= 0.005 THEN 'pago'
--         WHEN NEW.saldo_pend_usd >= NEW.total_usd - 0.005 THEN 'pendiente'
--         ELSE 'parcial'
--       END;
--     END IF;
--     RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;
--
--   CREATE OR REPLACE FUNCTION derive_venta_estado_insert()
--   RETURNS TRIGGER AS $$
--   BEGIN
--     NEW.estado := CASE
--       WHEN NEW.saldo_pend_usd <= 0.005 THEN 'pago'
--       ELSE 'pendiente'
--     END;
--     RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION prevent_venta_mutation()
RETURNS TRIGGER AS $$
DECLARE
  last_mov_tipo TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las ventas no se pueden eliminar';
  END IF;
  -- Frozen-columns guard — byte-identical to 0106/0097, UNCHANGED. `estado`
  -- no esta en esta lista a proposito: es mutable por exclusion.
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
  -- status transition guard — byte-identical to 0106/0097, UNCHANGED.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status != 'ACTIVA' OR NEW.status != 'ANULADA' THEN
      RAISE EXCEPTION 'El status solo puede cambiar de ACTIVA a ANULADA';
    END IF;
  END IF;
  -- saldo_pend_usd ceiling guard — byte-identical to 0106/0097, UNCHANGED.
  IF NEW.saldo_pend_usd > OLD.saldo_pend_usd AND NEW.saldo_pend_usd > NEW.total_usd THEN
    RAISE EXCEPTION 'El saldo pendiente no puede exceder el total de la factura';
  END IF;

  -- CHANGED (esta migracion, 0108): tolerancia 0.005 -> 0 exacto. Ver
  -- cabecera del archivo para el razonamiento completo (nota interina).
  IF NEW.saldo_pend_usd IS DISTINCT FROM OLD.saldo_pend_usd THEN
    SELECT tipo INTO last_mov_tipo FROM movimientos_cuenta
    WHERE venta_id = NEW.id
    ORDER BY fecha DESC, created_at DESC, id DESC LIMIT 1;

    NEW.estado := CASE
      WHEN last_mov_tipo = 'REV' AND NEW.saldo_pend_usd > 0 THEN 'reversado'
      WHEN NEW.saldo_pend_usd <= 0 THEN 'pago'
      WHEN NEW.saldo_pend_usd >= NEW.total_usd THEN 'pendiente'
      ELSE 'parcial'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CHANGED (esta migracion, 0108): tolerancia 0.005 -> 0 exacto, mismo
-- razonamiento. Funcion SEPARADA e INDEPENDIENTE de
-- `prevent_venta_mutation()` — hard constraint heredado de 0106, no fusionar.
CREATE OR REPLACE FUNCTION derive_venta_estado_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.estado := CASE
    WHEN NEW.saldo_pend_usd <= 0 THEN 'pago'
    ELSE 'pendiente'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
