-- =============================================
-- CLARAPOS: 0005 - CAJA, TESORERIA Y BANCOS
-- Depende de: 0003 (monedas), 0004 (depositos)
-- =============================================

-- ============================================
-- BANCOS EMPRESA (cuentas bancarias)
-- ============================================

CREATE TABLE bancos_empresa (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre_banco TEXT NOT NULL,
  nro_cuenta TEXT NOT NULL,
  tipo_cuenta TEXT CHECK (tipo_cuenta IN ('CORRIENTE','AHORRO','DIGITAL')),
  titular TEXT NOT NULL,
  titular_documento TEXT,
  moneda_id UUID NOT NULL REFERENCES monedas(id),
  saldo_actual NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_bancos_empresa_cuenta UNIQUE(empresa_id, nro_cuenta)
);

CREATE INDEX idx_bancos_empresa_empresa ON bancos_empresa(empresa_id);

CREATE TRIGGER trg_bancos_empresa_updated BEFORE UPDATE ON bancos_empresa
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- METODOS DE COBRO (reemplaza metodos_pago)
-- ============================================

CREATE TABLE metodos_cobro (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('EFECTIVO','TRANSFERENCIA','PUNTO','PAGO_MOVIL','ZELLE','DIVISA_DIGITAL','OTRO')),
  moneda_id UUID NOT NULL REFERENCES monedas(id),
  banco_empresa_id UUID REFERENCES bancos_empresa(id) ON DELETE SET NULL,
  requiere_referencia BOOLEAN NOT NULL DEFAULT FALSE,
  saldo_actual NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_metodos_cobro_empresa_nombre UNIQUE(empresa_id, nombre)
);

CREATE INDEX idx_metodos_cobro_empresa ON metodos_cobro(empresa_id);

CREATE TRIGGER trg_metodos_cobro_updated BEFORE UPDATE ON metodos_cobro
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- CAJAS (puntos de venta fisicos)
-- ============================================

CREATE TABLE cajas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  ubicacion TEXT,
  deposito_id UUID REFERENCES depositos(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_cajas_empresa_nombre UNIQUE(empresa_id, nombre)
);

CREATE INDEX idx_cajas_empresa ON cajas(empresa_id);

CREATE TRIGGER trg_cajas_updated BEFORE UPDATE ON cajas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- SESIONES DE CAJA (apertura/cierre diario)
-- ============================================

CREATE TABLE sesiones_caja (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  caja_id UUID NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  -- Apertura
  usuario_apertura_id UUID NOT NULL REFERENCES usuarios(id),
  fecha_apertura TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  monto_apertura_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Cierre
  usuario_cierre_id UUID REFERENCES usuarios(id),
  fecha_cierre TIMESTAMPTZ,
  monto_sistema_usd NUMERIC(12,2),
  monto_fisico_usd NUMERIC(12,2),
  diferencia_usd NUMERIC(12,2),
  observaciones_cierre TEXT,
  -- Status
  status TEXT NOT NULL DEFAULT 'ABIERTA' CHECK (status IN ('ABIERTA','CERRADA','CUADRADA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sesiones_caja_empresa ON sesiones_caja(empresa_id);
CREATE INDEX idx_sesiones_caja_caja ON sesiones_caja(caja_id);
CREATE INDEX idx_sesiones_caja_status ON sesiones_caja(caja_id, status) WHERE status = 'ABIERTA';

CREATE TRIGGER trg_sesiones_caja_updated BEFORE UPDATE ON sesiones_caja
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Validar: solo una sesion ABIERTA por caja
CREATE OR REPLACE FUNCTION validate_sesion_caja_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sesiones_caja
    WHERE caja_id = NEW.caja_id AND status = 'ABIERTA'
  ) THEN
    RAISE EXCEPTION 'La caja ya tiene una sesion abierta';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_sesion_caja_insert
  BEFORE INSERT ON sesiones_caja
  FOR EACH ROW EXECUTE FUNCTION validate_sesion_caja_insert();

-- ============================================
-- SESIONES CAJA DETALLE (desglose por metodo)
-- ============================================

CREATE TABLE sesiones_caja_detalle (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sesion_caja_id UUID NOT NULL REFERENCES sesiones_caja(id) ON DELETE CASCADE,
  metodo_cobro_id UUID NOT NULL REFERENCES metodos_cobro(id),
  moneda_id UUID NOT NULL REFERENCES monedas(id),
  total_sistema NUMERIC(12,2) NOT NULL,
  total_fisico NUMERIC(12,2),
  diferencia NUMERIC(12,2),
  num_transacciones INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sesion_detalle_metodo UNIQUE(sesion_caja_id, metodo_cobro_id)
);

-- ============================================
-- MOVIMIENTOS BANCARIOS (libro de banco)
-- ============================================

CREATE TABLE movimientos_bancarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  banco_empresa_id UUID NOT NULL REFERENCES bancos_empresa(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO','EGRESO')),
  origen TEXT NOT NULL CHECK (origen IN ('DEPOSITO_CAJA','TRANSFERENCIA_CLIENTE','PAGO_PROVEEDOR','GASTO','MANUAL')),
  -- Montos con snapshot
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  saldo_anterior NUMERIC(12,2) NOT NULL,
  saldo_nuevo NUMERIC(12,2) NOT NULL,
  -- Referencia
  doc_origen_id UUID,
  doc_origen_tipo TEXT,
  referencia TEXT,
  -- Validacion
  validado BOOLEAN NOT NULL DEFAULT FALSE,
  validado_por UUID REFERENCES usuarios(id),
  validado_at TIMESTAMPTZ,
  -- Detalle
  observacion TEXT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_mov_bancarios_empresa ON movimientos_bancarios(empresa_id);
CREATE INDEX idx_mov_bancarios_banco ON movimientos_bancarios(banco_empresa_id);
CREATE INDEX idx_mov_bancarios_fecha ON movimientos_bancarios(fecha);

-- Trigger: actualizar saldo de banco
CREATE OR REPLACE FUNCTION actualizar_saldo_banco()
RETURNS TRIGGER AS $$
BEGIN
  SELECT saldo_actual INTO NEW.saldo_anterior
  FROM bancos_empresa WHERE id = NEW.banco_empresa_id;

  IF NEW.tipo = 'INGRESO' THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo = 'EGRESO' THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  END IF;

  UPDATE bancos_empresa SET saldo_actual = NEW.saldo_nuevo, updated_at = NOW()
  WHERE id = NEW.banco_empresa_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_saldo_banco
  BEFORE INSERT ON movimientos_bancarios
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_banco();

-- Inmutabilidad post-validacion
CREATE OR REPLACE FUNCTION prevent_mov_bancario_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los movimientos bancarios son inmutables';
  END IF;
  -- UPDATE: solo permitir cambiar validado FALSE->TRUE
  IF OLD.validado = TRUE THEN
    RAISE EXCEPTION 'No se puede modificar un movimiento bancario ya validado';
  END IF;
  IF NEW.monto IS DISTINCT FROM OLD.monto
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.banco_empresa_id IS DISTINCT FROM OLD.banco_empresa_id THEN
    RAISE EXCEPTION 'Solo se puede actualizar el estado de validacion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mov_bancario_protect BEFORE UPDATE OR DELETE ON movimientos_bancarios
  FOR EACH ROW EXECUTE FUNCTION prevent_mov_bancario_mutation();

-- ============================================
-- MOVIMIENTOS METODO COBRO (estado de cuenta por metodo)
-- ============================================

CREATE TABLE movimientos_metodo_cobro (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  metodo_cobro_id UUID NOT NULL REFERENCES metodos_cobro(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO','EGRESO')),
  origen TEXT NOT NULL CHECK (origen IN ('VENTA','PAGO_CXC','DEPOSITO_BANCO','RETIRO','AJUSTE','APERTURA_CAJA','CIERRE_CAJA')),
  -- Montos con snapshot
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  saldo_anterior NUMERIC(12,2) NOT NULL,
  saldo_nuevo NUMERIC(12,2) NOT NULL,
  -- Referencia
  doc_origen_id UUID,
  doc_origen_ref TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_mov_metodo_cobro_empresa ON movimientos_metodo_cobro(empresa_id);
CREATE INDEX idx_mov_metodo_cobro_metodo ON movimientos_metodo_cobro(metodo_cobro_id);
CREATE INDEX idx_mov_metodo_cobro_fecha ON movimientos_metodo_cobro(fecha);

-- Trigger: actualizar saldo del metodo de cobro
CREATE OR REPLACE FUNCTION actualizar_saldo_metodo_cobro()
RETURNS TRIGGER AS $$
BEGIN
  SELECT saldo_actual INTO NEW.saldo_anterior
  FROM metodos_cobro WHERE id = NEW.metodo_cobro_id;

  IF NEW.tipo = 'INGRESO' THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo = 'EGRESO' THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  END IF;

  UPDATE metodos_cobro SET saldo_actual = NEW.saldo_nuevo, updated_at = NOW()
  WHERE id = NEW.metodo_cobro_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_saldo_metodo_cobro
  BEFORE INSERT ON movimientos_metodo_cobro
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_metodo_cobro();

-- Inmutabilidad
CREATE TRIGGER trg_mov_metodo_cobro_no_update BEFORE UPDATE ON movimientos_metodo_cobro
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_mov_metodo_cobro_no_delete BEFORE DELETE ON movimientos_metodo_cobro
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- RLS
-- ============================================

ALTER TABLE bancos_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE metodos_cobro ENABLE ROW LEVEL SECURITY;
ALTER TABLE cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones_caja_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_bancarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_metodo_cobro ENABLE ROW LEVEL SECURITY;

-- bancos_empresa
CREATE POLICY "select_own_empresa" ON bancos_empresa FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON bancos_empresa FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON bancos_empresa FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- metodos_cobro
CREATE POLICY "select_own_empresa" ON metodos_cobro FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON metodos_cobro FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON metodos_cobro FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- cajas
CREATE POLICY "select_own_empresa" ON cajas FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON cajas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON cajas FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- sesiones_caja
CREATE POLICY "select_own_empresa" ON sesiones_caja FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON sesiones_caja FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON sesiones_caja FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- sesiones_caja_detalle (hereda via sesion)
CREATE POLICY "select_all" ON sesiones_caja_detalle FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_all" ON sesiones_caja_detalle FOR INSERT TO authenticated WITH CHECK (true);

-- movimientos_bancarios (SELECT + INSERT)
CREATE POLICY "select_own_empresa" ON movimientos_bancarios FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON movimientos_bancarios FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON movimientos_bancarios FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- movimientos_metodo_cobro (SELECT + INSERT, inmutable)
CREATE POLICY "select_own_empresa" ON movimientos_metodo_cobro FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON movimientos_metodo_cobro FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
