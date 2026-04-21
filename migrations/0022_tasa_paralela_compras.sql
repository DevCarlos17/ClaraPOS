-- =============================================
-- CLARAPOS: 0022 - TASA PARALELA EN COMPRAS
-- Guarda la tasa BCV/interna en facturas_compra y el costo recalculado
-- por el sistema en facturas_compra_det.
-- Cuando el proveedor usa tasa paralela:
--   tasa         = tasa del proveedor (para CxP, importes originales)
--   tasa_costo   = tasa BCV/interna    (para inventario, costo ajustado)
--   costo_unitario_usd (det) = costo original del documento
--   costo_usd_sistema  (det) = costo recalculado al BCV (va al inventario)
-- =============================================

-- 1. Agregar tasa_costo a facturas_compra
ALTER TABLE facturas_compra
  ADD COLUMN IF NOT EXISTS tasa_costo NUMERIC(14,4);

-- Poblar para filas existentes (igual a tasa)
UPDATE facturas_compra
SET tasa_costo = CAST(tasa AS NUMERIC)
WHERE tasa_costo IS NULL;

-- 2. Agregar costo_usd_sistema a facturas_compra_det
ALTER TABLE facturas_compra_det
  ADD COLUMN IF NOT EXISTS costo_usd_sistema NUMERIC(10,4);

-- Poblar para filas existentes: deshabilitar trigger de inmutabilidad temporalmente
ALTER TABLE facturas_compra_det DISABLE TRIGGER trg_fact_compra_det_no_update;

UPDATE facturas_compra_det
SET costo_usd_sistema = CAST(costo_unitario_usd AS NUMERIC)
WHERE costo_usd_sistema IS NULL;

ALTER TABLE facturas_compra_det ENABLE TRIGGER trg_fact_compra_det_no_update;

-- 3. RLS: mismo acceso que la tabla padre (INSERT permitido)
-- Las politicas heredan de la tabla, no se requieren cambios adicionales.
