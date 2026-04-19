-- ============================================================
-- Migración 0020: Tabla gasto_pagos (pagos múltiples por gasto)
-- ============================================================

CREATE TABLE IF NOT EXISTS gasto_pagos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  gasto_id UUID NOT NULL REFERENCES gastos(id),
  metodo_cobro_id UUID REFERENCES metodos_cobro(id),
  banco_empresa_id UUID REFERENCES bancos_empresa(id),
  monto_usd NUMERIC(12,2) NOT NULL CHECK (monto_usd > 0),
  referencia TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gasto_pagos_gasto ON gasto_pagos(gasto_id);
CREATE INDEX IF NOT EXISTS idx_gasto_pagos_empresa ON gasto_pagos(empresa_id);

ALTER TABLE gasto_pagos ENABLE ROW LEVEL SECURITY;

-- Política: solo usuarios de la misma empresa pueden leer
CREATE POLICY gasto_pagos_select ON gasto_pagos
  FOR SELECT USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() LIMIT 1
    )
  );

-- Política: solo usuarios de la misma empresa pueden insertar
CREATE POLICY gasto_pagos_insert ON gasto_pagos
  FOR INSERT WITH CHECK (
    empresa_id = (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() LIMIT 1
    )
  );
