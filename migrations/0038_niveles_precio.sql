-- =============================================
-- 0038_niveles_precio.sql
-- Tabla de niveles de precio configurables por empresa
-- Max 3 niveles mapeados a: precio_venta_usd (1), precio_mayor_usd (2), precio_especial_usd (3)
-- =============================================

CREATE TABLE IF NOT EXISTS niveles_precio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  nombre VARCHAR(50) NOT NULL,
  orden INTEGER NOT NULL CHECK (orden BETWEEN 1 AND 3),
  porcentaje_defecto NUMERIC(6,2) NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  UNIQUE (empresa_id, orden)
);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION update_niveles_precio_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_niveles_precio_updated
  BEFORE UPDATE ON niveles_precio
  FOR EACH ROW EXECUTE FUNCTION update_niveles_precio_updated_at();

-- RLS
ALTER TABLE niveles_precio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "niveles_precio_select" ON niveles_precio
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "niveles_precio_insert" ON niveles_precio
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "niveles_precio_update" ON niveles_precio
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Seed: insertar 3 niveles default para cada empresa existente
INSERT INTO niveles_precio (empresa_id, nombre, orden, porcentaje_defecto, is_active)
SELECT
  e.id,
  CASE
    WHEN ordenes.orden = 1 THEN 'Detal'
    WHEN ordenes.orden = 2 THEN 'Mayor'
    ELSE 'Especial'
  END,
  ordenes.orden,
  0,
  1
FROM empresas e
CROSS JOIN (VALUES (1), (2), (3)) AS ordenes(orden)
ON CONFLICT (empresa_id, orden) DO NOTHING;
