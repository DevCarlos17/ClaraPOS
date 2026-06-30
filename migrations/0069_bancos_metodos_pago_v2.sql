-- =============================================
-- CLARAPOS: 0069 - Bancos y Métodos de Pago v2
-- Agrega saldo_inicial a bancos_empresa y nuevos atributos
-- operativos a metodos_cobro (deposito_directo, comision_pct,
-- usa_pos, usa_cxc, usa_cxp, caja_fuerte_id).
-- Todas las columnas son nullable/con DEFAULT — migración zero-downtime.
-- Registros existentes quedan con los valores DEFAULT.
-- =============================================

-- Agrega saldo inicial a cuentas bancarias (para tesorería y conciliación)
ALTER TABLE bancos_empresa
  ADD COLUMN IF NOT EXISTS saldo_inicial NUMERIC(18,4) DEFAULT 0;

-- Nuevos atributos operativos de métodos de cobro
ALTER TABLE metodos_cobro
  ADD COLUMN IF NOT EXISTS deposito_directo BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS comision_pct     NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usa_pos          BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS usa_cxc          BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS usa_cxp          BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS caja_fuerte_id   UUID REFERENCES caja_fuerte(id) ON DELETE SET NULL;
