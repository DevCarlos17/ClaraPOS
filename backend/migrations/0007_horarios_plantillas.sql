-- Migration: 0007_horarios_plantillas
-- Tabla de plantillas de horarios semanales (max 5 por empresa)
-- Ejecutar en Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS horarios_plantillas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre      TEXT        NOT NULL DEFAULT 'Nueva Plantilla',
  data        JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plantillas_empresa ON horarios_plantillas(empresa_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_plantillas_updated ON horarios_plantillas;
CREATE TRIGGER trg_plantillas_updated
  BEFORE UPDATE ON horarios_plantillas
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- RLS
ALTER TABLE horarios_plantillas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_plantillas" ON horarios_plantillas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_plantillas" ON horarios_plantillas
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "update_plantillas" ON horarios_plantillas
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "delete_plantillas" ON horarios_plantillas
  FOR DELETE TO authenticated USING (true);

-- Agregar a publicacion de replicacion logica (ejecutar si no esta ya)
-- ALTER PUBLICATION powersync ADD TABLE "public"."horarios_plantillas";
