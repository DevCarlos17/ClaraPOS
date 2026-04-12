-- =============================================
-- CLARAPOS: 0007 - COMPRAS, PROVEEDORES, CXP
-- Depende de: 0002 (usuarios), 0003 (monedas, tipos_persona_ve, impuestos_ve, islr_conceptos_ve),
--             0004 (productos, depositos, lotes), 0005 (metodos_cobro, bancos_empresa)
-- =============================================

-- ============================================
-- PROVEEDORES (ficha maestra mejorada)
-- ============================================

CREATE TABLE proveedores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  -- Identificacion
  tipo_persona_id UUID REFERENCES tipos_persona_ve(id),
  rif TEXT NOT NULL,
  razon_social TEXT NOT NULL CHECK (char_length(razon_social) >= 3),
  nombre_comercial TEXT,
  -- Contacto
  direccion_fiscal TEXT,
  ciudad TEXT,
  telefono TEXT,
  email TEXT,
  -- Fiscal
  tipo_contribuyente TEXT CHECK (tipo_contribuyente IN ('Ordinario','Especial','Formal')),
  retiene_iva BOOLEAN NOT NULL DEFAULT FALSE,
  retiene_islr BOOLEAN NOT NULL DEFAULT FALSE,
  concepto_islr_id UUID REFERENCES islr_conceptos_ve(id),
  retencion_iva_pct NUMERIC(5,2) DEFAULT 0,
  -- Credito
  dias_credito INT NOT NULL DEFAULT 0 CHECK (dias_credito >= 0),
  limite_credito_usd NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (limite_credito_usd >= 0),
  saldo_actual NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Estado
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_proveedores_empresa_rif UNIQUE(empresa_id, rif)
);

CREATE INDEX idx_proveedores_empresa ON proveedores(empresa_id);
CREATE INDEX idx_proveedores_rif ON proveedores(empresa_id, rif);

CREATE TRIGGER trg_proveedores_updated BEFORE UPDATE ON proveedores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Validar: RIF inmutable despues de crearse
CREATE OR REPLACE FUNCTION validate_proveedor_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rif IS DISTINCT FROM OLD.rif THEN
    RAISE EXCEPTION 'El RIF del proveedor no se puede modificar';
  END IF;
  -- saldo_actual solo se modifica via trigger de movimientos_cuenta_proveedor
  IF NEW.saldo_actual IS DISTINCT FROM OLD.saldo_actual
     AND current_setting('clarapos.trigger_context', TRUE) IS DISTINCT FROM 'mov_cuenta_prov' THEN
    RAISE EXCEPTION 'El saldo del proveedor solo se actualiza via movimientos de cuenta';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_proveedor_update
  BEFORE UPDATE ON proveedores
  FOR EACH ROW EXECUTE FUNCTION validate_proveedor_update();

-- ============================================
-- PROVEEDORES BANCOS (cuentas bancarias del proveedor)
-- ============================================

CREATE TABLE proveedores_bancos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  nombre_banco TEXT NOT NULL,
  nro_cuenta TEXT NOT NULL,
  tipo_cuenta TEXT CHECK (tipo_cuenta IN ('CORRIENTE','AHORRO','DIGITAL')),
  titular TEXT,
  titular_documento TEXT,
  moneda_id UUID REFERENCES monedas(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_prov_bancos_cuenta UNIQUE(proveedor_id, nro_cuenta)
);

CREATE INDEX idx_prov_bancos_proveedor ON proveedores_bancos(proveedor_id);

-- ============================================
-- FACTURAS DE COMPRA (cabecera)
-- ============================================

CREATE TABLE facturas_compra (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  nro_factura TEXT NOT NULL,
  nro_control TEXT,
  -- Ubicacion destino
  deposito_id UUID NOT NULL REFERENCES depositos(id) ON DELETE RESTRICT,
  -- Moneda y tasa
  moneda_id UUID REFERENCES monedas(id),
  tasa NUMERIC(12,4) NOT NULL CHECK (tasa > 0),
  -- Desglose fiscal
  total_exento_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_base_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_iva_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_igtf_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_usd NUMERIC(12,2) NOT NULL CHECK (total_usd >= 0),
  total_bs NUMERIC(12,2) NOT NULL CHECK (total_bs >= 0),
  -- Control de saldo
  saldo_pend_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Tipo y estado
  tipo TEXT NOT NULL DEFAULT 'CONTADO' CHECK (tipo IN ('CONTADO','CREDITO')),
  status TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (status IN ('BORRADOR','PROCESADA','ANULADA')),
  fecha_factura DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_recepcion DATE,
  -- Auditoria
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_facturas_compra_empresa_nro UNIQUE(empresa_id, proveedor_id, nro_factura)
);

CREATE INDEX idx_fact_compra_empresa ON facturas_compra(empresa_id);
CREATE INDEX idx_fact_compra_proveedor ON facturas_compra(proveedor_id);
CREATE INDEX idx_fact_compra_fecha ON facturas_compra(empresa_id, fecha_factura DESC);
CREATE INDEX idx_fact_compra_status ON facturas_compra(empresa_id, status);

CREATE TRIGGER trg_facturas_compra_updated BEFORE UPDATE ON facturas_compra
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Inmutabilidad parcial: solo permitir cambios en status y saldo_pend_usd
CREATE OR REPLACE FUNCTION prevent_factura_compra_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las facturas de compra no se pueden eliminar';
  END IF;
  -- Solo permitir cambios de status y saldo
  IF OLD.status = 'PROCESADA' THEN
    -- Una vez procesada, solo se puede anular
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status != 'ANULADA' THEN
        RAISE EXCEPTION 'Una factura procesada solo puede cambiar a ANULADA';
      END IF;
    END IF;
    IF NEW.total_usd IS DISTINCT FROM OLD.total_usd
       OR NEW.total_bs IS DISTINCT FROM OLD.total_bs
       OR NEW.proveedor_id IS DISTINCT FROM OLD.proveedor_id
       OR NEW.nro_factura IS DISTINCT FROM OLD.nro_factura THEN
      RAISE EXCEPTION 'No se pueden modificar los datos de una factura procesada';
    END IF;
  END IF;
  IF OLD.status = 'ANULADA' THEN
    RAISE EXCEPTION 'No se puede modificar una factura anulada';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fact_compra_protect BEFORE UPDATE OR DELETE ON facturas_compra
  FOR EACH ROW EXECUTE FUNCTION prevent_factura_compra_mutation();

-- ============================================
-- FACTURAS DE COMPRA DETALLE
-- ============================================

CREATE TABLE facturas_compra_det (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  factura_compra_id UUID NOT NULL REFERENCES facturas_compra(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  deposito_id UUID NOT NULL REFERENCES depositos(id),
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  costo_unitario_usd NUMERIC(12,2) NOT NULL CHECK (costo_unitario_usd >= 0),
  -- Impuestos por linea
  tipo_impuesto TEXT NOT NULL DEFAULT 'Gravable' CHECK (tipo_impuesto IN ('Gravable','Exento','Exonerado')),
  impuesto_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  -- Subtotales
  subtotal_usd NUMERIC(12,2) NOT NULL,
  subtotal_bs NUMERIC(12,2) NOT NULL,
  -- Lote (si aplica)
  lote_id UUID REFERENCES lotes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fact_compra_det_empresa ON facturas_compra_det(empresa_id);
CREATE INDEX idx_fact_compra_det_factura ON facturas_compra_det(factura_compra_id);
CREATE INDEX idx_fact_compra_det_producto ON facturas_compra_det(producto_id);

-- Inmutabilidad
CREATE TRIGGER trg_fact_compra_det_no_update BEFORE UPDATE ON facturas_compra_det
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_fact_compra_det_no_delete BEFORE DELETE ON facturas_compra_det
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- RETENCIONES IVA (compras - nosotros retenemos al proveedor)
-- ============================================

CREATE TABLE retenciones_iva (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  factura_compra_id UUID NOT NULL REFERENCES facturas_compra(id) ON DELETE RESTRICT,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  nro_comprobante TEXT NOT NULL,
  fecha_comprobante DATE NOT NULL,
  periodo_fiscal TEXT,
  -- Montos
  base_imponible NUMERIC(12,2) NOT NULL,
  porcentaje_iva NUMERIC(5,2) NOT NULL,
  monto_iva NUMERIC(12,2) NOT NULL,
  porcentaje_retencion NUMERIC(5,2) NOT NULL,
  monto_retenido NUMERIC(12,2) NOT NULL,
  -- Status
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','DECLARADO','ANULADO')),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_ret_iva_compra UNIQUE(empresa_id, nro_comprobante)
);

CREATE INDEX idx_ret_iva_empresa ON retenciones_iva(empresa_id);
CREATE INDEX idx_ret_iva_factura ON retenciones_iva(factura_compra_id);
CREATE INDEX idx_ret_iva_periodo ON retenciones_iva(empresa_id, periodo_fiscal);

-- Inmutabilidad parcial
CREATE OR REPLACE FUNCTION prevent_retencion_iva_compra_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las retenciones de IVA compras son inmutables';
  END IF;
  IF OLD.status = 'DECLARADO' THEN
    RAISE EXCEPTION 'No se puede modificar una retencion ya declarada';
  END IF;
  IF NEW.base_imponible IS DISTINCT FROM OLD.base_imponible
     OR NEW.monto_iva IS DISTINCT FROM OLD.monto_iva
     OR NEW.monto_retenido IS DISTINCT FROM OLD.monto_retenido
     OR NEW.factura_compra_id IS DISTINCT FROM OLD.factura_compra_id THEN
    RAISE EXCEPTION 'Solo se puede actualizar el status de una retencion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ret_iva_compra_protect BEFORE UPDATE OR DELETE ON retenciones_iva
  FOR EACH ROW EXECUTE FUNCTION prevent_retencion_iva_compra_mutation();

-- ============================================
-- RETENCIONES ISLR (compras - nosotros retenemos al proveedor)
-- ============================================

CREATE TABLE retenciones_islr (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  factura_compra_id UUID NOT NULL REFERENCES facturas_compra(id) ON DELETE RESTRICT,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  concepto_islr_id UUID REFERENCES islr_conceptos_ve(id),
  nro_comprobante TEXT NOT NULL,
  fecha_comprobante DATE NOT NULL,
  periodo_fiscal TEXT,
  -- Montos (ISLR se calcula en Bs)
  base_imponible_bs NUMERIC(12,2) NOT NULL,
  porcentaje_retencion NUMERIC(5,2) NOT NULL,
  monto_retenido_bs NUMERIC(12,2) NOT NULL,
  sustraendo_bs NUMERIC(12,2) DEFAULT 0,
  -- Status
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','DECLARADO','ANULADO')),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_ret_islr_compra UNIQUE(empresa_id, nro_comprobante)
);

CREATE INDEX idx_ret_islr_empresa ON retenciones_islr(empresa_id);
CREATE INDEX idx_ret_islr_factura ON retenciones_islr(factura_compra_id);
CREATE INDEX idx_ret_islr_periodo ON retenciones_islr(empresa_id, periodo_fiscal);

-- Inmutabilidad parcial
CREATE OR REPLACE FUNCTION prevent_retencion_islr_compra_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las retenciones de ISLR compras son inmutables';
  END IF;
  IF OLD.status = 'DECLARADO' THEN
    RAISE EXCEPTION 'No se puede modificar una retencion ya declarada';
  END IF;
  IF NEW.base_imponible_bs IS DISTINCT FROM OLD.base_imponible_bs
     OR NEW.monto_retenido_bs IS DISTINCT FROM OLD.monto_retenido_bs
     OR NEW.factura_compra_id IS DISTINCT FROM OLD.factura_compra_id THEN
    RAISE EXCEPTION 'Solo se puede actualizar el status de una retencion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ret_islr_compra_protect BEFORE UPDATE OR DELETE ON retenciones_islr
  FOR EACH ROW EXECUTE FUNCTION prevent_retencion_islr_compra_mutation();

-- ============================================
-- NOTAS FISCALES COMPRA (NC/ND del proveedor)
-- ============================================

CREATE TABLE notas_fiscales_compra (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  factura_compra_id UUID REFERENCES facturas_compra(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('NC','ND')),
  nro_documento TEXT NOT NULL,
  motivo TEXT NOT NULL,
  -- Moneda y tasa
  moneda_id UUID REFERENCES monedas(id),
  tasa NUMERIC(12,4) NOT NULL,
  -- Desglose fiscal
  total_exento_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_base_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_iva_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_usd NUMERIC(12,2) NOT NULL,
  total_bs NUMERIC(12,2) NOT NULL,
  -- Control
  afecta_inventario BOOLEAN NOT NULL DEFAULT FALSE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_notas_fiscales_compra UNIQUE(empresa_id, proveedor_id, tipo, nro_documento)
);

CREATE INDEX idx_nf_compra_empresa ON notas_fiscales_compra(empresa_id);
CREATE INDEX idx_nf_compra_proveedor ON notas_fiscales_compra(proveedor_id);
CREATE INDEX idx_nf_compra_factura ON notas_fiscales_compra(factura_compra_id);

-- Inmutabilidad
CREATE TRIGGER trg_nf_compra_no_update BEFORE UPDATE ON notas_fiscales_compra
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_nf_compra_no_delete BEFORE DELETE ON notas_fiscales_compra
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- NOTAS FISCALES COMPRA DETALLE
-- ============================================

CREATE TABLE notas_fiscales_compra_det (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  nota_fiscal_compra_id UUID NOT NULL REFERENCES notas_fiscales_compra(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES productos(id) ON DELETE RESTRICT,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(12,3) NOT NULL DEFAULT 1,
  precio_unitario_usd NUMERIC(12,2) NOT NULL,
  tipo_impuesto TEXT DEFAULT 'Gravable' CHECK (tipo_impuesto IN ('Gravable','Exento','Exonerado')),
  impuesto_pct NUMERIC(5,2) DEFAULT 0,
  subtotal_usd NUMERIC(12,2) NOT NULL,
  afecta_inventario BOOLEAN NOT NULL DEFAULT FALSE,
  lote_id UUID REFERENCES lotes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nf_compra_det_empresa ON notas_fiscales_compra_det(empresa_id);
CREATE INDEX idx_nf_compra_det_nota ON notas_fiscales_compra_det(nota_fiscal_compra_id);

-- Inmutabilidad
CREATE TRIGGER trg_nf_compra_det_no_update BEFORE UPDATE ON notas_fiscales_compra_det
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_nf_compra_det_no_delete BEFORE DELETE ON notas_fiscales_compra_det
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- MOVIMIENTOS CUENTA PROVEEDOR (libro auxiliar CxP)
-- ============================================

CREATE TABLE movimientos_cuenta_proveedor (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('FAC','PAG','NC','ND')),
  referencia TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  saldo_anterior NUMERIC(12,2) NOT NULL,
  saldo_nuevo NUMERIC(12,2) NOT NULL,
  observacion TEXT,
  -- Documento origen
  factura_compra_id UUID REFERENCES facturas_compra(id),
  doc_origen_id UUID,
  doc_origen_tipo TEXT CHECK (doc_origen_tipo IN ('FACTURA_COMPRA','PAGO','NC_COMPRA','ND_COMPRA')),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_mov_cuenta_prov_empresa ON movimientos_cuenta_proveedor(empresa_id);
CREATE INDEX idx_mov_cuenta_prov_proveedor ON movimientos_cuenta_proveedor(proveedor_id);
CREATE INDEX idx_mov_cuenta_prov_fecha ON movimientos_cuenta_proveedor(fecha);

-- Trigger: actualizar saldo del proveedor
CREATE OR REPLACE FUNCTION actualizar_saldo_proveedor()
RETURNS TRIGGER AS $$
BEGIN
  -- Capturar saldo anterior
  SELECT saldo_actual INTO NEW.saldo_anterior
  FROM proveedores WHERE id = NEW.proveedor_id;

  -- Logica contable: FAC/ND suman deuda, PAG/NC restan deuda
  IF NEW.tipo IN ('FAC', 'ND') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo IN ('PAG', 'NC') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  END IF;

  -- Actualizar saldo del proveedor via setting de contexto
  PERFORM set_config('clarapos.trigger_context', 'mov_cuenta_prov', TRUE);
  UPDATE proveedores SET saldo_actual = NEW.saldo_nuevo, updated_at = NOW()
  WHERE id = NEW.proveedor_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_saldo_proveedor
  BEFORE INSERT ON movimientos_cuenta_proveedor
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_proveedor();

-- Inmutabilidad
CREATE TRIGGER trg_mov_cuenta_prov_no_update BEFORE UPDATE ON movimientos_cuenta_proveedor
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_mov_cuenta_prov_no_delete BEFORE DELETE ON movimientos_cuenta_proveedor
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- VENCIMIENTOS POR PAGAR (calendario CxP)
-- ============================================

CREATE TABLE vencimientos_pagar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  factura_compra_id UUID NOT NULL REFERENCES facturas_compra(id) ON DELETE RESTRICT,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  -- Vencimiento
  nro_cuota INT NOT NULL DEFAULT 1,
  fecha_vencimiento DATE NOT NULL,
  monto_original_usd NUMERIC(12,2) NOT NULL,
  monto_pagado_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_pendiente_usd NUMERIC(12,2) NOT NULL,
  -- Status
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','PARCIAL','PAGADO','VENCIDO')),
  -- Control
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vencimientos_pagar UNIQUE(empresa_id, factura_compra_id, nro_cuota)
);

CREATE INDEX idx_venc_pagar_empresa ON vencimientos_pagar(empresa_id);
CREATE INDEX idx_venc_pagar_proveedor ON vencimientos_pagar(proveedor_id);
CREATE INDEX idx_venc_pagar_fecha ON vencimientos_pagar(fecha_vencimiento);
CREATE INDEX idx_venc_pagar_status ON vencimientos_pagar(empresa_id, status) WHERE status IN ('PENDIENTE','PARCIAL');

CREATE TRIGGER trg_vencimientos_pagar_updated BEFORE UPDATE ON vencimientos_pagar
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS
-- ============================================

ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores_bancos ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas_compra_det ENABLE ROW LEVEL SECURITY;
ALTER TABLE retenciones_iva ENABLE ROW LEVEL SECURITY;
ALTER TABLE retenciones_islr ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_fiscales_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_fiscales_compra_det ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_cuenta_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE vencimientos_pagar ENABLE ROW LEVEL SECURITY;

-- proveedores
CREATE POLICY "select_own_empresa" ON proveedores FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON proveedores FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON proveedores FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- proveedores_bancos
CREATE POLICY "select_own_empresa" ON proveedores_bancos FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON proveedores_bancos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- facturas_compra
CREATE POLICY "select_own_empresa" ON facturas_compra FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON facturas_compra FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON facturas_compra FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- facturas_compra_det (inmutable)
CREATE POLICY "select_own_empresa" ON facturas_compra_det FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON facturas_compra_det FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- retenciones_iva (compras)
CREATE POLICY "select_own_empresa" ON retenciones_iva FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON retenciones_iva FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON retenciones_iva FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- retenciones_islr (compras)
CREATE POLICY "select_own_empresa" ON retenciones_islr FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON retenciones_islr FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON retenciones_islr FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- notas_fiscales_compra (inmutable)
CREATE POLICY "select_own_empresa" ON notas_fiscales_compra FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON notas_fiscales_compra FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- notas_fiscales_compra_det (inmutable)
CREATE POLICY "select_own_empresa" ON notas_fiscales_compra_det FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON notas_fiscales_compra_det FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- movimientos_cuenta_proveedor (inmutable)
CREATE POLICY "select_own_empresa" ON movimientos_cuenta_proveedor FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON movimientos_cuenta_proveedor FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- vencimientos_pagar
CREATE POLICY "select_own_empresa" ON vencimientos_pagar FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON vencimientos_pagar FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON vencimientos_pagar FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());
