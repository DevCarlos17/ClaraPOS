-- =============================================================================
-- Migration: 0059_decimal_precision_fix.sql
-- Purpose:   Fix two financial columns omitted from 0058_decimal_precision.sql
-- Created:   2026-06-18
-- =============================================================================

-- ---------------------------------------------------------------------------
-- gastos.monto_bs — financial column missed in 0058
-- ---------------------------------------------------------------------------
ALTER TABLE gastos
  ALTER COLUMN monto_bs TYPE NUMERIC(20,8) USING monto_bs::NUMERIC(20,8);

-- ---------------------------------------------------------------------------
-- empresas_fiscal_ve.porcentaje_retencion_iva — percentage used in financial
-- calculations (IVA retention), widened for calculation precision parity
-- ---------------------------------------------------------------------------
ALTER TABLE empresas_fiscal_ve
  ALTER COLUMN porcentaje_retencion_iva TYPE NUMERIC(20,8)
  USING porcentaje_retencion_iva::NUMERIC(20,8);

-- =============================================================================
-- DOWN
-- =============================================================================
-- ALTER TABLE gastos ALTER COLUMN monto_bs TYPE NUMERIC(12,2) USING monto_bs::NUMERIC(12,2);
-- ALTER TABLE empresas_fiscal_ve ALTER COLUMN porcentaje_retencion_iva TYPE NUMERIC(5,2) USING porcentaje_retencion_iva::NUMERIC(5,2);
