-- =============================================
-- CLARAPOS: 0070 - Fix unicidad metodos_cobro
-- La restriccion original impide tener el mismo nombre de metodo en bancos distintos.
-- La reemplazamos por indices parciales que garantizan unicidad por banco o caja fuerte.
-- =============================================

ALTER TABLE metodos_cobro DROP CONSTRAINT IF EXISTS uq_metodos_cobro_empresa_nombre;

-- Unicidad por banco: el mismo nombre puede usarse en bancos distintos de la misma empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_metodos_cobro_banco_nombre
  ON metodos_cobro(empresa_id, banco_empresa_id, nombre)
  WHERE banco_empresa_id IS NOT NULL;

-- Unicidad por caja fuerte: evita duplicados de Efectivo dentro de la misma caja
CREATE UNIQUE INDEX IF NOT EXISTS uq_metodos_cobro_caja_nombre
  ON metodos_cobro(empresa_id, caja_fuerte_id, nombre)
  WHERE caja_fuerte_id IS NOT NULL;
