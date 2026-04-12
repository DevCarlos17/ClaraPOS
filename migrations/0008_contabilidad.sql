-- =============================================
-- CLARAPOS: 0008 - CONTABILIDAD BASICA (GASTOS)
-- Depende de: 0003 (monedas), 0005 (metodos_cobro, bancos_empresa),
--             0007 (proveedores)
-- =============================================

-- ============================================
-- PLAN DE CUENTAS (clasificador jerarquico)
-- ============================================

CREATE TABLE plan_cuentas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('GASTO','INGRESO_OTRO')),
  parent_id UUID REFERENCES plan_cuentas(id) ON DELETE RESTRICT,
  nivel INT NOT NULL DEFAULT 1,
  es_cuenta_detalle BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_plan_cuentas_empresa_codigo UNIQUE(empresa_id, codigo)
);

CREATE INDEX idx_plan_cuentas_empresa ON plan_cuentas(empresa_id);
CREATE INDEX idx_plan_cuentas_parent ON plan_cuentas(parent_id);

CREATE TRIGGER trg_plan_cuentas_updated BEFORE UPDATE ON plan_cuentas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Validar: codigo inmutable, solo cuentas detalle aceptan registros
CREATE OR REPLACE FUNCTION validate_plan_cuentas_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS DISTINCT FROM OLD.codigo THEN
    RAISE EXCEPTION 'El codigo de cuenta contable no se puede modificar';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_plan_cuentas_update
  BEFORE UPDATE ON plan_cuentas
  FOR EACH ROW EXECUTE FUNCTION validate_plan_cuentas_update();

-- ============================================
-- GASTOS (registro de egresos operativos)
-- ============================================

CREATE TABLE gastos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nro_gasto TEXT NOT NULL,
  cuenta_id UUID NOT NULL REFERENCES plan_cuentas(id) ON DELETE RESTRICT,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  -- Detalle
  descripcion TEXT NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Moneda
  moneda_id UUID NOT NULL REFERENCES monedas(id),
  tasa NUMERIC(12,4) NOT NULL CHECK (tasa > 0),
  monto_usd NUMERIC(12,2) NOT NULL CHECK (monto_usd > 0),
  monto_bs NUMERIC(12,2) NOT NULL,
  -- Forma de pago
  metodo_cobro_id UUID REFERENCES metodos_cobro(id),
  banco_empresa_id UUID REFERENCES bancos_empresa(id),
  referencia TEXT,
  -- Control
  observaciones TEXT,
  status TEXT NOT NULL DEFAULT 'REGISTRADO' CHECK (status IN ('REGISTRADO','ANULADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_gastos_empresa_nro UNIQUE(empresa_id, nro_gasto)
);

CREATE INDEX idx_gastos_empresa ON gastos(empresa_id);
CREATE INDEX idx_gastos_cuenta ON gastos(cuenta_id);
CREATE INDEX idx_gastos_proveedor ON gastos(proveedor_id) WHERE proveedor_id IS NOT NULL;
CREATE INDEX idx_gastos_fecha ON gastos(empresa_id, fecha DESC);

CREATE TRIGGER trg_gastos_updated BEFORE UPDATE ON gastos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Validar: solo cuentas detalle aceptan gastos
CREATE OR REPLACE FUNCTION validate_gasto_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_es_detalle BOOLEAN;
BEGIN
  SELECT es_cuenta_detalle INTO v_es_detalle
  FROM plan_cuentas WHERE id = NEW.cuenta_id;

  IF v_es_detalle IS NOT TRUE THEN
    RAISE EXCEPTION 'Solo se pueden registrar gastos en cuentas de detalle';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_gasto_insert
  BEFORE INSERT ON gastos
  FOR EACH ROW EXECUTE FUNCTION validate_gasto_insert();

-- Inmutabilidad parcial: solo permitir cambio de status REGISTRADO->ANULADO
CREATE OR REPLACE FUNCTION prevent_gasto_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los gastos no se pueden eliminar';
  END IF;
  IF OLD.status = 'ANULADO' THEN
    RAISE EXCEPTION 'No se puede modificar un gasto anulado';
  END IF;
  -- Solo permitir cambio de status
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status != 'ANULADO' THEN
      RAISE EXCEPTION 'El status de un gasto solo puede cambiar a ANULADO';
    END IF;
  END IF;
  IF NEW.monto_usd IS DISTINCT FROM OLD.monto_usd
     OR NEW.cuenta_id IS DISTINCT FROM OLD.cuenta_id
     OR NEW.nro_gasto IS DISTINCT FROM OLD.nro_gasto THEN
    RAISE EXCEPTION 'Solo se puede anular un gasto, no modificar sus datos';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gasto_protect BEFORE UPDATE OR DELETE ON gastos
  FOR EACH ROW EXECUTE FUNCTION prevent_gasto_mutation();

-- ============================================
-- RLS
-- ============================================

ALTER TABLE plan_cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

-- plan_cuentas
CREATE POLICY "select_own_empresa" ON plan_cuentas FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON plan_cuentas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON plan_cuentas FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- gastos
CREATE POLICY "select_own_empresa" ON gastos FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON gastos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON gastos FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());
