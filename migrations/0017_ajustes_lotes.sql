-- Migracion 0017: Soporte de lotes en ajustes de inventario
-- Agrega columnas a ajustes_det para vincular lotes existentes (RESTA)
-- y capturar datos de nuevos lotes a crear al aplicar (SUMA)

-- Lote existente a descontar (operacion RESTA)
ALTER TABLE ajustes_det ADD COLUMN IF NOT EXISTS lote_id UUID REFERENCES lotes(id);

-- Datos del nuevo lote a crear al aplicar (operacion SUMA)
ALTER TABLE ajustes_det ADD COLUMN IF NOT EXISTS lote_nro      TEXT;
ALTER TABLE ajustes_det ADD COLUMN IF NOT EXISTS lote_fecha_fab  DATE;
ALTER TABLE ajustes_det ADD COLUMN IF NOT EXISTS lote_fecha_venc DATE;

-- Permitir UPDATE en ajustes_det (necesario para RLS al sincronizar aplicacion de ajustes)
-- Los ajustes_det no son inmutables: pueden actualizarse al aplicar/anular
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ajustes_det' AND policyname = 'ajustes_det_update'
  ) THEN
    CREATE POLICY ajustes_det_update ON ajustes_det
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
