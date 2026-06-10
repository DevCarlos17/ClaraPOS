-- 0056: accounting observability — contabilidad_ok flag + errores_contabilidad log
-- Adds contabilidad_ok to ventas and facturas_compra.
-- Creates errores_contabilidad for logging silent accounting failures.

ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS contabilidad_ok INTEGER NOT NULL DEFAULT 0;

ALTER TABLE facturas_compra
  ADD COLUMN IF NOT EXISTS contabilidad_ok INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS errores_contabilidad (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id   UUID NOT NULL REFERENCES empresas(id),
  tabla_origen TEXT NOT NULL,   -- 'ventas' | 'facturas_compra' | 'notas_credito'
  doc_origen_id UUID NOT NULL,  -- ID of the venta / factura_compra / etc
  error_msg    TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_errores_contab_empresa ON errores_contabilidad(empresa_id, created_at DESC);
CREATE INDEX idx_errores_contab_doc ON errores_contabilidad(doc_origen_id);

ALTER TABLE errores_contabilidad ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_empresa" ON errores_contabilidad
  FOR SELECT TO authenticated USING (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid() LIMIT 1
  ));
CREATE POLICY "insert_own_empresa" ON errores_contabilidad
  FOR INSERT TO authenticated WITH CHECK (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid() LIMIT 1
  ));
