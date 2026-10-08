-- =============================================================================
-- Migration: 0104_saf_creditos_lotes.sql
-- Created:   2026-10-07
-- Depends:   0090_add_safc_tipo_movimientos_cuenta.sql (tipo 'SAFC' en movimientos_cuenta)
--            0102_extender_trigger_saf_disponible.sql (Slice 1, sin tocar:
--              clientes.saf_disponible sigue siendo el snapshot O(1)
--              independiente de esta tabla — ver design-v2.md Pregunta 2)
--
-- PURPOSE:
--   Slice 2 de saf-snapshot-y-trazabilidad (PR1 de 5, design-v2.md §3).
--   Capa 1 del modelo de 2 capas "Lotes de Credito + Asignaciones" (open-item
--   accounting): cada lote es un credito SAF individual con su propio saldo
--   remanente, pareado 1:1 con la fila SAFC ya existente en
--   movimientos_cuenta (anclaje de coexistencia, movimiento_cuenta_id UNIQUE).
--
--   Mental model (mirror exacto de lotes/movimientos_inventario del kardex
--   de inventario FIFO, ver design-v2.md §1): esta tabla es el "lotes" del
--   credito SAF; 0105_saf_creditos_aplicaciones.sql (mismo PR) es su
--   "movimientos_inventario".
--
--   saldo_disponible_usd/status son las UNICAS columnas mutables de esta
--   tabla, y SOLO vía trigger: el BEFORE UPDATE trigger de abajo
--   (validate_saf_lote_update) rechaza cualquier intento de la app de
--   tocarlas directamente, exactamente el mismo mecanismo que ya protege
--   clientes.saldo_actual/saf_disponible desde 2024 (0006, reforzado en
--   0061/0102). El unico camino autorizado para mutarlas es el trigger
--   consumir_saf_lote() de 0105 (via
--   set_config('clarapos.trigger_context','saf_aplicacion',TRUE)).
--
--   NO BACKFILL (confirmado explicito por el owner, design-v2.md Pregunta 7):
--   el libro de lotes arranca vacio. Ningun lote historico se reconstruye a
--   partir de movimientos_cuenta SAFC/SAF pre-existentes.
--
-- DEVIATION FROM design-v2.md (documentar, no silenciar):
--   design-v2.md §3 especifica las policies de SELECT/INSERT/UPDATE con
--   `USING (true)` / `WITH CHECK (true)`, citando CLAUDE.md regla #11 y el
--   patron HISTORICO de `clientes`/`movimientos_cuenta` en
--   0001_initial_schema.sql (lineas 245-262). Verificado por grep: esas
--   mismas 2 tablas fueron MIGRADAS en el mismo 0001_initial_schema.sql
--   (lineas 920-935) a policies filtradas por `current_empresa_id()`, y
--   TODA tabla nueva desde entonces (0084 traspasos_inventario, 0085
--   traspaso_plantillas, 0098 import_log/import_log_det, mas los ~40 usos
--   de current_empresa_id() en el resto de 0001) sigue ese patron, no el de
--   `true`. El skill de Supabase cargado para esta sesion confirma que
--   "TO authenticated alone is authentication without authorization —
--   BOLA/IDOR": `true` es inseguro para una tabla financiera multi-tenant.
--   Esta migracion usa `current_empresa_id()` en las 3 policies
--   (SELECT/INSERT/UPDATE) en vez del `true` literal de design-v2.md —
--   mismo efecto practico para el owner (nadie ve datos de otra empresa),
--   consistente con TODO el resto del esquema actual. El trigger BEFORE
--   UPDATE (control de columna, sin relacion con RLS) se implementa
--   exactamente como lo especifica design-v2.md, sin cambios.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_validate_saf_lote_update ON saf_creditos_lotes;
--   DROP FUNCTION IF EXISTS validate_saf_lote_update();
--   DROP TABLE IF EXISTS saf_creditos_lotes CASCADE;
--   -- CASCADE es seguro: tabla net-new, nada depende de ella fuera de
--   -- 0105_saf_creditos_aplicaciones.sql (que debe revertirse PRIMERO si
--   -- ambas se revierten, por el FK lote_id -> saf_creditos_lotes.id).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.saf_creditos_lotes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES public.empresas(id),
  cliente_id           UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,

  -- Anclaje de coexistencia: la fila SAFC ya existente que generó este lote.
  movimiento_cuenta_id UUID NOT NULL UNIQUE REFERENCES public.movimientos_cuenta(id),

  -- Origen polimórfico. Reusa el vocabulario ya validado por
  -- movimientos_cuenta_doc_origen_tipo_check (0006/0043) — subset, solo los
  -- 3 tipos que hoy generan SAFC.
  origen_tipo          TEXT NOT NULL CHECK (origen_tipo IN ('VENTA','PAGO','NOTA_CREDITO')),
  origen_id            UUID NOT NULL,  -- ventas.id | pagos.id | notas_credito.id (sin FK físico: polimórfico, mismo trade-off que doc_origen_id en el resto del codebase)

  monto_original_usd   NUMERIC(20,8) NOT NULL CHECK (monto_original_usd > 0),   -- INMUTABLE
  saldo_disponible_usd NUMERIC(20,8) NOT NULL CHECK (saldo_disponible_usd >= 0), -- SOLO trigger (0105)
  status               TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO','AGOTADO')), -- SOLO trigger, cache de saldo_disponible_usd = 0

  moneda_origen        TEXT NOT NULL DEFAULT 'USD',
  tasa_origen          NUMERIC(20,8) NOT NULL,  -- fotografia de la tasa al momento de crear el credito (regla de negocio #1)
  fecha                TIMESTAMPTZ NOT NULL,    -- fecha de negocio (puede diferir de created_at, igual que movimientos_cuenta.fecha)

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- solo lo toca el trigger de consumo (0105)
  created_by           UUID REFERENCES public.usuarios(id)
);

-- Partial index: FIFO "lotes activos de este cliente, mas viejo primero".
-- La mayoria de los lotes terminan AGOTADO (saldo_disponible_usd = 0) una
-- vez consumidos; indexar solo los activos evita indexar el caso comun,
-- mismo patron que idx_clientes_saf_disponible (0101).
CREATE INDEX IF NOT EXISTS idx_saf_lotes_cliente_disponible
  ON public.saf_creditos_lotes (cliente_id, fecha)
  WHERE saldo_disponible_usd > 0;

CREATE INDEX IF NOT EXISTS idx_saf_lotes_empresa
  ON public.saf_creditos_lotes (empresa_id);

CREATE INDEX IF NOT EXISTS idx_saf_lotes_origen
  ON public.saf_creditos_lotes (origen_tipo, origen_id);

-- RLS -------------------------------------------------------------------
ALTER TABLE public.saf_creditos_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_empresa" ON public.saf_creditos_lotes;
CREATE POLICY "select_own_empresa" ON public.saf_creditos_lotes FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "insert_own_empresa" ON public.saf_creditos_lotes;
CREATE POLICY "insert_own_empresa" ON public.saf_creditos_lotes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "update_own_empresa" ON public.saf_creditos_lotes;
CREATE POLICY "update_own_empresa" ON public.saf_creditos_lotes FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());
-- Sin policy DELETE -> ningun rol autenticado puede borrar.

-- Trigger de control de columna (BEFORE UPDATE) --------------------------
-- RLS controla la FILA (que empresa puede tocar que lote); este trigger
-- controla la COLUMNA (que campos de esa fila pueden cambiar y quien).
-- Mismo mecanismo que ya protege clientes.saldo_actual/saf_disponible
-- desde 2024 (0006, reforzado en 0061/0102).
CREATE OR REPLACE FUNCTION public.validate_saf_lote_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.monto_original_usd      IS DISTINCT FROM OLD.monto_original_usd
     OR NEW.origen_tipo          IS DISTINCT FROM OLD.origen_tipo
     OR NEW.origen_id            IS DISTINCT FROM OLD.origen_id
     OR NEW.cliente_id           IS DISTINCT FROM OLD.cliente_id
     OR NEW.movimiento_cuenta_id IS DISTINCT FROM OLD.movimiento_cuenta_id THEN
    RAISE EXCEPTION 'Los campos de origen de un lote SAF son inmutables' USING ERRCODE = 'P0001';
  END IF;

  IF (NEW.saldo_disponible_usd IS DISTINCT FROM OLD.saldo_disponible_usd
      OR NEW.status IS DISTINCT FROM OLD.status)
     AND current_setting('clarapos.trigger_context', TRUE) IS DISTINCT FROM 'saf_aplicacion' THEN
    RAISE EXCEPTION 'saldo_disponible_usd/status solo se actualiza via saf_creditos_aplicaciones' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_saf_lote_update ON public.saf_creditos_lotes;
CREATE TRIGGER trg_validate_saf_lote_update BEFORE UPDATE ON public.saf_creditos_lotes
  FOR EACH ROW EXECUTE FUNCTION public.validate_saf_lote_update();

-- PowerSync publication (patron idempotente, ver 0098) -------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'saf_creditos_lotes'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE public.saf_creditos_lotes;
  END IF;
END $$;

-- =============================================================================
-- VERIFICACION MANUAL (owner, ClaraPos-Staging) — task 1.1 de tasks-v2.md
-- Esta sesion no tiene credenciales de Postgres (igual que 0101-0103): no se
-- puede ejecutar aqui. Reemplazar los placeholders <...> con IDs reales de
-- una empresa/cliente/usuario de prueba Y una fila movimientos_cuenta tipo
-- SAFC ya existente (o crear una antes, respetando su propio CHECK de
-- saldo_nuevo — ver 0102) antes de correr este bloque.
--
-- Paso 1 — INSERT valido:
--   BEGIN;
--     INSERT INTO saf_creditos_lotes
--       (id, empresa_id, cliente_id, movimiento_cuenta_id, origen_tipo,
--        origen_id, monto_original_usd, saldo_disponible_usd, status,
--        moneda_origen, tasa_origen, fecha, created_by)
--     VALUES
--       (gen_random_uuid(), '<empresa-test>', '<cliente-test>',
--        '<movimiento-cuenta-safc-test>', 'VENTA', '<venta-test>',
--        100, 100, 'ACTIVO', 'USD', 36.50, now(), '<usuario-test>');
--     -- Debe insertar 1 fila sin error.
--     SELECT saldo_disponible_usd, status FROM saf_creditos_lotes
--       WHERE movimiento_cuenta_id = '<movimiento-cuenta-safc-test>';
--     -- Esperado: 100 | ACTIVO
--
-- Paso 2 — UPDATE directo de saldo_disponible_usd BLOQUEADO (sin contexto
-- de trigger 'saf_aplicacion'):
--     UPDATE saf_creditos_lotes SET saldo_disponible_usd = 50
--       WHERE movimiento_cuenta_id = '<movimiento-cuenta-safc-test>';
--     -- Esperado: ERROR P0001 'saldo_disponible_usd/status solo se
--     -- actualiza via saf_creditos_aplicaciones'. El error aborta la
--     -- transaccion automaticamente (Postgres deja la sesion en estado
--     -- "current transaction is aborted"); el ROLLBACK de abajo es el
--     -- cierre explicito y deja cero efecto persistente.
--   ROLLBACK;
-- =============================================================================
