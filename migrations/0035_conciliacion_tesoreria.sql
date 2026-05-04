-- =============================================
-- CLARAPOS: 0035 - CONCILIACION DE TESORERIA
-- Depende de: 0005 (caja_tesoreria), 0003 (monedas)
-- =============================================

-- ============================================
-- CAJA FUERTE (bóvedas de efectivo de la empresa)
-- ============================================

CREATE TABLE caja_fuerte (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  moneda_id UUID NOT NULL REFERENCES monedas(id),
  saldo_actual NUMERIC(18,4) NOT NULL DEFAULT 0,
  descripcion TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_caja_fuerte_empresa_nombre UNIQUE(empresa_id, nombre)
);

CREATE INDEX idx_caja_fuerte_empresa ON caja_fuerte(empresa_id);

CREATE TRIGGER trg_caja_fuerte_updated BEFORE UPDATE ON caja_fuerte
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- MOVIMIENTOS CAJA FUERTE
-- ============================================

CREATE TABLE mov_caja_fuerte (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  caja_fuerte_id UUID NOT NULL REFERENCES caja_fuerte(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO','EGRESO')),
  origen TEXT NOT NULL CHECK (origen IN ('DEPOSITO_CIERRE','GASTO','TRASPASO','MANUAL','REVERSO')),
  monto NUMERIC(18,4) NOT NULL CHECK (monto > 0),
  saldo_anterior NUMERIC(18,4) NOT NULL DEFAULT 0,
  saldo_nuevo NUMERIC(18,4) NOT NULL DEFAULT 0,
  doc_origen_id UUID,
  doc_origen_tipo TEXT,
  referencia TEXT,
  descripcion TEXT,
  validado BOOLEAN NOT NULL DEFAULT FALSE,
  validado_por UUID REFERENCES usuarios(id),
  validado_at TIMESTAMPTZ,
  reversado BOOLEAN NOT NULL DEFAULT FALSE,
  reverso_de UUID REFERENCES mov_caja_fuerte(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_mov_caja_fuerte_empresa ON mov_caja_fuerte(empresa_id);
CREATE INDEX idx_mov_caja_fuerte_caja ON mov_caja_fuerte(caja_fuerte_id);
CREATE INDEX idx_mov_caja_fuerte_fecha ON mov_caja_fuerte(fecha);

-- Trigger: calcula saldo_anterior/saldo_nuevo y actualiza caja_fuerte.saldo_actual
CREATE OR REPLACE FUNCTION actualizar_saldo_caja_fuerte()
RETURNS TRIGGER AS $$
BEGIN
  SELECT saldo_actual INTO NEW.saldo_anterior
  FROM caja_fuerte WHERE id = NEW.caja_fuerte_id;

  IF NEW.tipo = 'INGRESO' THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo = 'EGRESO' THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  END IF;

  UPDATE caja_fuerte SET saldo_actual = NEW.saldo_nuevo, updated_at = NOW()
  WHERE id = NEW.caja_fuerte_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_saldo_caja_fuerte
  BEFORE INSERT ON mov_caja_fuerte
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_caja_fuerte();

-- Trigger: inmutabilidad (solo permite cambiar validado y reversado)
CREATE OR REPLACE FUNCTION prevent_mov_caja_fuerte_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los movimientos de caja fuerte son inmutables';
  END IF;
  -- Solo bloquear cambios a campos financieros core
  IF NEW.monto IS DISTINCT FROM OLD.monto
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.caja_fuerte_id IS DISTINCT FROM OLD.caja_fuerte_id THEN
    RAISE EXCEPTION 'Solo se puede actualizar el estado de validacion o reversado';
  END IF;
  -- reversado solo puede ir FALSE -> TRUE
  IF OLD.reversado = TRUE AND NEW.reversado = FALSE THEN
    RAISE EXCEPTION 'No se puede quitar el estado de reversado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mov_caja_fuerte_protect
  BEFORE UPDATE OR DELETE ON mov_caja_fuerte
  FOR EACH ROW EXECUTE FUNCTION prevent_mov_caja_fuerte_mutation();

-- ============================================
-- TRASPASOS TESORERIA
-- ============================================

CREATE TABLE traspasos_tesoreria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  cuenta_origen_tipo TEXT NOT NULL CHECK (cuenta_origen_tipo IN ('BANCO','CAJA_FUERTE')),
  cuenta_origen_id UUID NOT NULL,
  mov_origen_id UUID,
  cuenta_destino_tipo TEXT NOT NULL CHECK (cuenta_destino_tipo IN ('BANCO','CAJA_FUERTE')),
  cuenta_destino_id UUID NOT NULL,
  mov_destino_id UUID,
  monto_origen NUMERIC(18,4) NOT NULL CHECK (monto_origen > 0),
  moneda_origen_id UUID NOT NULL REFERENCES monedas(id),
  monto_destino NUMERIC(18,4) NOT NULL CHECK (monto_destino > 0),
  moneda_destino_id UUID NOT NULL REFERENCES monedas(id),
  tasa_cambio NUMERIC(18,4),
  reversado BOOLEAN NOT NULL DEFAULT FALSE,
  reversado_at TIMESTAMPTZ,
  reversado_por UUID REFERENCES usuarios(id),
  observacion TEXT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_traspasos_tesoreria_empresa ON traspasos_tesoreria(empresa_id);
CREATE INDEX idx_traspasos_tesoreria_fecha ON traspasos_tesoreria(fecha);

-- ============================================
-- ALTERAR MOVIMIENTOS BANCARIOS
-- Agregar: reversado, reverso_de, descripcion
-- Expandir CHECK de origen
-- ============================================

ALTER TABLE movimientos_bancarios
  ADD COLUMN IF NOT EXISTS reversado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reverso_de UUID REFERENCES movimientos_bancarios(id),
  ADD COLUMN IF NOT EXISTS descripcion TEXT;

-- Ampliar CHECK de origen para incluir TRASPASO y REVERSO
ALTER TABLE movimientos_bancarios DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_check;
ALTER TABLE movimientos_bancarios ADD CONSTRAINT movimientos_bancarios_origen_check
  CHECK (origen IN ('DEPOSITO_CAJA','TRANSFERENCIA_CLIENTE','PAGO_PROVEEDOR','GASTO','MANUAL','TRASPASO','REVERSO'));

-- Actualizar trigger de inmutabilidad: permitir cambiar validado Y reversado
-- (la funcion anterior solo permitia cambiar validado, pero bloqueaba todo si ya estaba validado)
CREATE OR REPLACE FUNCTION prevent_mov_bancario_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los movimientos bancarios son inmutables';
  END IF;
  -- Solo bloquear cambios a campos financieros core
  IF NEW.monto IS DISTINCT FROM OLD.monto
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.banco_empresa_id IS DISTINCT FROM OLD.banco_empresa_id THEN
    RAISE EXCEPTION 'Solo se puede actualizar el estado de validacion o reversado';
  END IF;
  -- reversado solo puede ir FALSE -> TRUE
  IF OLD.reversado = TRUE AND NEW.reversado = FALSE THEN
    RAISE EXCEPTION 'No se puede quitar el estado de reversado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS
-- ============================================

ALTER TABLE caja_fuerte ENABLE ROW LEVEL SECURITY;
ALTER TABLE mov_caja_fuerte ENABLE ROW LEVEL SECURITY;
ALTER TABLE traspasos_tesoreria ENABLE ROW LEVEL SECURITY;

-- caja_fuerte
CREATE POLICY "select_own_empresa" ON caja_fuerte FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON caja_fuerte FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON caja_fuerte FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- mov_caja_fuerte
CREATE POLICY "select_own_empresa" ON mov_caja_fuerte FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON mov_caja_fuerte FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON mov_caja_fuerte FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- traspasos_tesoreria
CREATE POLICY "select_own_empresa" ON traspasos_tesoreria FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON traspasos_tesoreria FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON traspasos_tesoreria FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- ============================================
-- PUBLICATION (PowerSync)
-- ============================================

ALTER PUBLICATION powersync ADD TABLE caja_fuerte;
ALTER PUBLICATION powersync ADD TABLE mov_caja_fuerte;
ALTER PUBLICATION powersync ADD TABLE traspasos_tesoreria;
