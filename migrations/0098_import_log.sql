-- =============================================================================
-- Migration: 0098_import_log.sql
-- Created:   2026-09-30
-- Depends:   0097_permitir_reverso_saldo_venta.sql
--
-- PURPOSE:
--   Tablas de auditoria para el modulo de importacion masiva de productos.
--   import_log (cabecera por operacion de import) + import_log_det (detalle
--   por fila procesada). La escritura ocurre via PowerSync (offline-first,
--   igual que el resto del sistema). La lectura del historial va directo a
--   Supabase (reporteria — no necesita disponibilidad offline).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS import_log_det;
--   DROP TABLE IF EXISTS import_log;
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.import_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES public.empresas(id),
  usuario_id          UUID NOT NULL REFERENCES public.usuarios(id),
  fecha               TIMESTAMPTZ NOT NULL DEFAULT now(),
  modo                TEXT NOT NULL CHECK (modo IN ('crear','actualizar','upsert')),
  archivo_nombre      TEXT,
  total_filas         INT NOT NULL DEFAULT 0,
  filas_creadas       INT NOT NULL DEFAULT 0,
  filas_actualizadas  INT NOT NULL DEFAULT 0,
  filas_omitidas      INT NOT NULL DEFAULT 0,
  filas_error         INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.import_log_det (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_log_id       UUID NOT NULL REFERENCES public.import_log(id) ON DELETE CASCADE,
  empresa_id          UUID NOT NULL,
  fila_num            INT NOT NULL,
  codigo              TEXT,
  nombre              TEXT,
  tipo                TEXT,
  accion              TEXT NOT NULL CHECK (accion IN ('CREAR','ACTUALIZAR','OMITIR','ERROR')),
  valores_anteriores  JSONB,
  valores_nuevos      JSONB,
  errores             JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS (patron identico a traspasos_inventario)
ALTER TABLE public.import_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_empresa" ON public.import_log;
CREATE POLICY "select_own_empresa" ON public.import_log FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
DROP POLICY IF EXISTS "insert_own_empresa" ON public.import_log;
CREATE POLICY "insert_own_empresa" ON public.import_log FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

ALTER TABLE public.import_log_det ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_empresa" ON public.import_log_det;
CREATE POLICY "select_own_empresa" ON public.import_log_det FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
DROP POLICY IF EXISTS "insert_own_empresa" ON public.import_log_det;
CREATE POLICY "insert_own_empresa" ON public.import_log_det FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- PowerSync publication (patron idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'import_log'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE public.import_log;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'import_log_det'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE public.import_log_det;
  END IF;
END $$;
