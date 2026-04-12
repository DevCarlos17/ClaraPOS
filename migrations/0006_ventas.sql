-- =============================================
-- CLARAPOS: 0006 - VENTAS, CLIENTES, CXC
-- Depende de: 0002 (usuarios), 0003 (monedas, impuestos_ve, islr_conceptos_ve, tipos_persona_ve),
--             0004 (productos, depositos, lotes), 0005 (metodos_cobro, sesiones_caja, bancos_empresa)
-- =============================================

-- ============================================
-- TASAS DE CAMBIO (historial inmutable)
-- ============================================

CREATE TABLE tasas_cambio (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  moneda_id UUID NOT NULL REFERENCES monedas(id),
  valor NUMERIC(12,4) NOT NULL CHECK (valor > 0),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_tasas_cambio_empresa ON tasas_cambio(empresa_id);
CREATE INDEX idx_tasas_cambio_fecha ON tasas_cambio(empresa_id, moneda_id, fecha DESC);

-- Inmutabilidad
CREATE TRIGGER trg_tasas_cambio_no_update BEFORE UPDATE ON tasas_cambio
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_tasas_cambio_no_delete BEFORE DELETE ON tasas_cambio
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- CLIENTES (ficha maestra)
-- ============================================

CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  -- Identificacion
  tipo_persona_id UUID REFERENCES tipos_persona_ve(id),
  identificacion TEXT NOT NULL CHECK (char_length(identificacion) >= 1),
  nombre TEXT NOT NULL CHECK (char_length(nombre) >= 3),
  nombre_comercial TEXT,
  -- Contacto
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  -- Fiscal
  es_contribuyente_especial BOOLEAN NOT NULL DEFAULT FALSE,
  es_agente_retencion_iva BOOLEAN NOT NULL DEFAULT FALSE,
  es_agente_retencion_islr BOOLEAN NOT NULL DEFAULT FALSE,
  porcentaje_retencion_iva NUMERIC(5,2) DEFAULT 75,
  -- Credito
  limite_credito_usd NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (limite_credito_usd >= 0),
  saldo_actual NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Estado
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_clientes_empresa_identificacion UNIQUE(empresa_id, identificacion)
);

CREATE INDEX idx_clientes_empresa ON clientes(empresa_id);
CREATE INDEX idx_clientes_identificacion ON clientes(empresa_id, identificacion);
CREATE INDEX idx_clientes_nombre ON clientes(empresa_id, nombre);

CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Validar: identificacion inmutable despues de crearse
CREATE OR REPLACE FUNCTION validate_cliente_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.identificacion IS DISTINCT FROM OLD.identificacion THEN
    RAISE EXCEPTION 'La identificacion del cliente no se puede modificar';
  END IF;
  -- saldo_actual solo se modifica via trigger de movimientos_cuenta
  IF NEW.saldo_actual IS DISTINCT FROM OLD.saldo_actual
     AND current_setting('clarapos.trigger_context', TRUE) IS DISTINCT FROM 'mov_cuenta' THEN
    RAISE EXCEPTION 'El saldo del cliente solo se actualiza via movimientos de cuenta';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_cliente_update
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION validate_cliente_update();

-- ============================================
-- MOVIMIENTOS DE CUENTA (libro auxiliar del cliente - CxC)
-- ============================================

CREATE TABLE movimientos_cuenta (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('FAC','PAG','NCR','NDB')),
  referencia TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  saldo_anterior NUMERIC(12,2) NOT NULL,
  saldo_nuevo NUMERIC(12,2) NOT NULL,
  observacion TEXT,
  -- Documento origen
  doc_origen_id UUID,
  doc_origen_tipo TEXT CHECK (doc_origen_tipo IN ('VENTA','PAGO','NOTA_CREDITO','NOTA_DEBITO')),
  -- Legacy: mantener venta_id para compatibilidad
  venta_id UUID,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_mov_cuenta_empresa ON movimientos_cuenta(empresa_id);
CREATE INDEX idx_mov_cuenta_cliente ON movimientos_cuenta(cliente_id);
CREATE INDEX idx_mov_cuenta_fecha ON movimientos_cuenta(fecha);

-- Trigger: actualizar saldo del cliente
CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
RETURNS TRIGGER AS $$
BEGIN
  -- Capturar saldo anterior
  SELECT saldo_actual INTO NEW.saldo_anterior
  FROM clientes WHERE id = NEW.cliente_id;

  -- Logica contable: FAC/NDB suman deuda, PAG/NCR restan deuda
  IF NEW.tipo IN ('FAC', 'NDB') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo IN ('PAG', 'NCR') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  END IF;

  -- Actualizar saldo del cliente via setting de contexto
  PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
  UPDATE clientes SET saldo_actual = NEW.saldo_nuevo, updated_at = NOW()
  WHERE id = NEW.cliente_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_saldo_cliente
  BEFORE INSERT ON movimientos_cuenta
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_cliente();

-- Inmutabilidad
CREATE TRIGGER trg_mov_cuenta_no_update BEFORE UPDATE ON movimientos_cuenta
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_mov_cuenta_no_delete BEFORE DELETE ON movimientos_cuenta
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- VENTAS (cabecera de factura con desglose fiscal)
-- ============================================

CREATE TABLE ventas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  nro_factura TEXT NOT NULL,
  num_control TEXT,
  -- Ubicacion
  deposito_id UUID NOT NULL REFERENCES depositos(id) ON DELETE RESTRICT,
  sesion_caja_id UUID REFERENCES sesiones_caja(id) ON DELETE SET NULL,
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
  tipo TEXT NOT NULL CHECK (tipo IN ('CONTADO','CREDITO')),
  status TEXT NOT NULL DEFAULT 'ACTIVA' CHECK (status IN ('ACTIVA','ANULADA')),
  -- Auditoria
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_ventas_empresa_nro UNIQUE(empresa_id, nro_factura)
);

CREATE INDEX idx_ventas_empresa ON ventas(empresa_id);
CREATE INDEX idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX idx_ventas_fecha ON ventas(empresa_id, fecha DESC);
CREATE INDEX idx_ventas_status ON ventas(empresa_id, status);
CREATE INDEX idx_ventas_sesion ON ventas(sesion_caja_id) WHERE sesion_caja_id IS NOT NULL;

-- Inmutabilidad parcial: solo permitir cambios en saldo_pend_usd y status
CREATE OR REPLACE FUNCTION prevent_venta_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las ventas no se pueden eliminar';
  END IF;
  -- UPDATE: solo permitir cambios en saldo_pend_usd (baja) y status (ACTIVA->ANULADA)
  IF NEW.nro_factura IS DISTINCT FROM OLD.nro_factura
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     OR NEW.total_usd IS DISTINCT FROM OLD.total_usd
     OR NEW.total_bs IS DISTINCT FROM OLD.total_bs
     OR NEW.tasa IS DISTINCT FROM OLD.tasa
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.deposito_id IS DISTINCT FROM OLD.deposito_id
     OR NEW.total_exento_usd IS DISTINCT FROM OLD.total_exento_usd
     OR NEW.total_base_usd IS DISTINCT FROM OLD.total_base_usd
     OR NEW.total_iva_usd IS DISTINCT FROM OLD.total_iva_usd
     OR NEW.total_igtf_usd IS DISTINCT FROM OLD.total_igtf_usd THEN
    RAISE EXCEPTION 'Solo se puede actualizar saldo_pend_usd y status de una venta';
  END IF;
  -- status solo puede ir ACTIVA -> ANULADA
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status != 'ACTIVA' OR NEW.status != 'ANULADA' THEN
      RAISE EXCEPTION 'El status solo puede cambiar de ACTIVA a ANULADA';
    END IF;
  END IF;
  -- saldo_pend_usd solo puede bajar o quedar igual
  IF NEW.saldo_pend_usd > OLD.saldo_pend_usd THEN
    RAISE EXCEPTION 'El saldo pendiente solo puede disminuir';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_venta_protect BEFORE UPDATE OR DELETE ON ventas
  FOR EACH ROW EXECUTE FUNCTION prevent_venta_mutation();

-- ============================================
-- VENTAS DETALLE (lineas de factura)
-- ============================================

CREATE TABLE ventas_det (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  deposito_id UUID NOT NULL REFERENCES depositos(id),
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  precio_unitario_usd NUMERIC(12,2) NOT NULL CHECK (precio_unitario_usd >= 0),
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

CREATE INDEX idx_ventas_det_empresa ON ventas_det(empresa_id);
CREATE INDEX idx_ventas_det_venta ON ventas_det(venta_id);
CREATE INDEX idx_ventas_det_producto ON ventas_det(producto_id);

-- Inmutabilidad
CREATE TRIGGER trg_ventas_det_no_update BEFORE UPDATE ON ventas_det
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_ventas_det_no_delete BEFORE DELETE ON ventas_det
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- PAGOS (bimonetarios con vinculacion a caja)
-- ============================================

CREATE TABLE pagos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  venta_id UUID REFERENCES ventas(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  metodo_cobro_id UUID NOT NULL REFERENCES metodos_cobro(id),
  moneda_id UUID NOT NULL REFERENCES monedas(id),
  tasa NUMERIC(12,4) NOT NULL CHECK (tasa > 0),
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  monto_usd NUMERIC(12,2) NOT NULL CHECK (monto_usd > 0),
  referencia TEXT,
  -- Vinculacion a caja y banco
  sesion_caja_id UUID REFERENCES sesiones_caja(id) ON DELETE SET NULL,
  banco_empresa_id UUID REFERENCES bancos_empresa(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_pagos_empresa ON pagos(empresa_id);
CREATE INDEX idx_pagos_venta ON pagos(venta_id);
CREATE INDEX idx_pagos_cliente ON pagos(cliente_id);
CREATE INDEX idx_pagos_fecha ON pagos(empresa_id, fecha DESC);
CREATE INDEX idx_pagos_sesion ON pagos(sesion_caja_id) WHERE sesion_caja_id IS NOT NULL;

-- Inmutabilidad
CREATE TRIGGER trg_pagos_no_update BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_pagos_no_delete BEFORE DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- NOTAS DE CREDITO (anulacion total/parcial)
-- ============================================

CREATE TABLE notas_credito (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nro_ncr TEXT NOT NULL,
  venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL DEFAULT 'TOTAL' CHECK (tipo IN ('TOTAL','PARCIAL')),
  motivo TEXT NOT NULL,
  -- Moneda y tasa
  moneda_id UUID REFERENCES monedas(id),
  tasa_historica NUMERIC(12,4) NOT NULL,
  -- Desglose fiscal
  total_exento_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_base_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_iva_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_usd NUMERIC(12,2) NOT NULL,
  total_bs NUMERIC(12,2) NOT NULL,
  -- Control
  afecta_inventario BOOLEAN NOT NULL DEFAULT TRUE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_notas_credito_empresa_nro UNIQUE(empresa_id, nro_ncr)
);

CREATE INDEX idx_notas_credito_empresa ON notas_credito(empresa_id);
CREATE INDEX idx_notas_credito_venta ON notas_credito(venta_id);
CREATE INDEX idx_notas_credito_cliente ON notas_credito(cliente_id);

-- Inmutabilidad
CREATE TRIGGER trg_notas_credito_no_update BEFORE UPDATE ON notas_credito
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_notas_credito_no_delete BEFORE DELETE ON notas_credito
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- Validar: suma de NC no puede exceder total de la venta
CREATE OR REPLACE FUNCTION validate_nota_credito_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_total_venta NUMERIC(12,2);
  v_total_nc_existentes NUMERIC(12,2);
BEGIN
  SELECT total_usd INTO v_total_venta
  FROM ventas WHERE id = NEW.venta_id;

  SELECT COALESCE(SUM(total_usd), 0) INTO v_total_nc_existentes
  FROM notas_credito WHERE venta_id = NEW.venta_id;

  IF (v_total_nc_existentes + NEW.total_usd) > v_total_venta THEN
    RAISE EXCEPTION 'La suma de notas de credito ($%) excede el total de la venta ($%)',
      (v_total_nc_existentes + NEW.total_usd), v_total_venta;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_nota_credito_insert
  BEFORE INSERT ON notas_credito
  FOR EACH ROW EXECUTE FUNCTION validate_nota_credito_insert();

-- ============================================
-- NOTAS DE CREDITO DETALLE
-- ============================================

CREATE TABLE notas_credito_det (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  nota_credito_id UUID NOT NULL REFERENCES notas_credito(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES productos(id) ON DELETE RESTRICT,
  deposito_id UUID REFERENCES depositos(id),
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  precio_unitario_usd NUMERIC(12,2) NOT NULL,
  tipo_impuesto TEXT DEFAULT 'Gravable' CHECK (tipo_impuesto IN ('Gravable','Exento','Exonerado')),
  impuesto_pct NUMERIC(5,2) DEFAULT 0,
  subtotal_usd NUMERIC(12,2) NOT NULL,
  afecta_inventario BOOLEAN NOT NULL DEFAULT TRUE,
  descripcion TEXT,
  lote_id UUID REFERENCES lotes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nc_det_empresa ON notas_credito_det(empresa_id);
CREATE INDEX idx_nc_det_nota ON notas_credito_det(nota_credito_id);

-- Inmutabilidad
CREATE TRIGGER trg_nc_det_no_update BEFORE UPDATE ON notas_credito_det
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_nc_det_no_delete BEFORE DELETE ON notas_credito_det
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- NOTAS DE DEBITO
-- ============================================

CREATE TABLE notas_debito (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nro_ndb TEXT NOT NULL,
  venta_id UUID REFERENCES ventas(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
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
  -- Auditoria
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_notas_debito_empresa_nro UNIQUE(empresa_id, nro_ndb)
);

CREATE INDEX idx_notas_debito_empresa ON notas_debito(empresa_id);
CREATE INDEX idx_notas_debito_venta ON notas_debito(venta_id);
CREATE INDEX idx_notas_debito_cliente ON notas_debito(cliente_id);

-- Inmutabilidad
CREATE TRIGGER trg_notas_debito_no_update BEFORE UPDATE ON notas_debito
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_notas_debito_no_delete BEFORE DELETE ON notas_debito
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- NOTAS DE DEBITO DETALLE
-- ============================================

CREATE TABLE notas_debito_det (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  nota_debito_id UUID NOT NULL REFERENCES notas_debito(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(12,3) NOT NULL DEFAULT 1,
  precio_unitario_usd NUMERIC(12,2) NOT NULL,
  tipo_impuesto TEXT DEFAULT 'Gravable' CHECK (tipo_impuesto IN ('Gravable','Exento','Exonerado')),
  impuesto_pct NUMERIC(5,2) DEFAULT 0,
  subtotal_usd NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nd_det_empresa ON notas_debito_det(empresa_id);
CREATE INDEX idx_nd_det_nota ON notas_debito_det(nota_debito_id);

-- Inmutabilidad
CREATE TRIGGER trg_nd_det_no_update BEFORE UPDATE ON notas_debito_det
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_nd_det_no_delete BEFORE DELETE ON notas_debito_det
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- RETENCIONES IVA VENTAS
-- ============================================

CREATE TABLE retenciones_iva_ventas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
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
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_ret_iva_ventas_empresa ON retenciones_iva_ventas(empresa_id);
CREATE INDEX idx_ret_iva_ventas_venta ON retenciones_iva_ventas(venta_id);
CREATE INDEX idx_ret_iva_ventas_periodo ON retenciones_iva_ventas(empresa_id, periodo_fiscal);

-- Inmutabilidad parcial: solo permitir cambio de status PENDIENTE->DECLARADO
CREATE OR REPLACE FUNCTION prevent_retencion_iva_venta_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las retenciones de IVA ventas son inmutables';
  END IF;
  IF OLD.status = 'DECLARADO' THEN
    RAISE EXCEPTION 'No se puede modificar una retencion ya declarada';
  END IF;
  -- Solo permitir cambio de status
  IF NEW.base_imponible IS DISTINCT FROM OLD.base_imponible
     OR NEW.monto_iva IS DISTINCT FROM OLD.monto_iva
     OR NEW.monto_retenido IS DISTINCT FROM OLD.monto_retenido
     OR NEW.venta_id IS DISTINCT FROM OLD.venta_id THEN
    RAISE EXCEPTION 'Solo se puede actualizar el status de una retencion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ret_iva_venta_protect BEFORE UPDATE OR DELETE ON retenciones_iva_ventas
  FOR EACH ROW EXECUTE FUNCTION prevent_retencion_iva_venta_mutation();

-- ============================================
-- RETENCIONES ISLR VENTAS
-- ============================================

CREATE TABLE retenciones_islr_ventas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  concepto_islr_id UUID REFERENCES islr_conceptos_ve(id),
  nro_comprobante TEXT NOT NULL,
  fecha_comprobante DATE NOT NULL,
  periodo_fiscal TEXT,
  -- Montos (en Bs porque ISLR se calcula en Bs)
  base_imponible_bs NUMERIC(12,2) NOT NULL,
  porcentaje_retencion NUMERIC(5,2) NOT NULL,
  monto_retenido_bs NUMERIC(12,2) NOT NULL,
  sustraendo_bs NUMERIC(12,2) DEFAULT 0,
  -- Status
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','DECLARADO','ANULADO')),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_ret_islr_ventas_empresa ON retenciones_islr_ventas(empresa_id);
CREATE INDEX idx_ret_islr_ventas_venta ON retenciones_islr_ventas(venta_id);
CREATE INDEX idx_ret_islr_ventas_periodo ON retenciones_islr_ventas(empresa_id, periodo_fiscal);

-- Inmutabilidad parcial: solo permitir cambio de status PENDIENTE->DECLARADO
CREATE OR REPLACE FUNCTION prevent_retencion_islr_venta_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las retenciones de ISLR ventas son inmutables';
  END IF;
  IF OLD.status = 'DECLARADO' THEN
    RAISE EXCEPTION 'No se puede modificar una retencion ya declarada';
  END IF;
  IF NEW.base_imponible_bs IS DISTINCT FROM OLD.base_imponible_bs
     OR NEW.monto_retenido_bs IS DISTINCT FROM OLD.monto_retenido_bs
     OR NEW.venta_id IS DISTINCT FROM OLD.venta_id THEN
    RAISE EXCEPTION 'Solo se puede actualizar el status de una retencion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ret_islr_venta_protect BEFORE UPDATE OR DELETE ON retenciones_islr_ventas
  FOR EACH ROW EXECUTE FUNCTION prevent_retencion_islr_venta_mutation();

-- ============================================
-- VENCIMIENTOS POR COBRAR (calendario CxC)
-- ============================================

CREATE TABLE vencimientos_cobrar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
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
  CONSTRAINT uq_vencimientos_cobrar UNIQUE(empresa_id, venta_id, nro_cuota)
);

CREATE INDEX idx_venc_cobrar_empresa ON vencimientos_cobrar(empresa_id);
CREATE INDEX idx_venc_cobrar_cliente ON vencimientos_cobrar(cliente_id);
CREATE INDEX idx_venc_cobrar_fecha ON vencimientos_cobrar(fecha_vencimiento);
CREATE INDEX idx_venc_cobrar_status ON vencimientos_cobrar(empresa_id, status) WHERE status IN ('PENDIENTE','PARCIAL');

CREATE TRIGGER trg_vencimientos_cobrar_updated BEFORE UPDATE ON vencimientos_cobrar
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS
-- ============================================

ALTER TABLE tasas_cambio ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_cuenta ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_det ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_credito ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_credito_det ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_debito ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_debito_det ENABLE ROW LEVEL SECURITY;
ALTER TABLE retenciones_iva_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE retenciones_islr_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vencimientos_cobrar ENABLE ROW LEVEL SECURITY;

-- tasas_cambio
CREATE POLICY "select_own_empresa" ON tasas_cambio FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON tasas_cambio FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- clientes
CREATE POLICY "select_own_empresa" ON clientes FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON clientes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON clientes FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- movimientos_cuenta (SELECT + INSERT, inmutable)
CREATE POLICY "select_own_empresa" ON movimientos_cuenta FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON movimientos_cuenta FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- ventas
CREATE POLICY "select_own_empresa" ON ventas FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON ventas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON ventas FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- ventas_det (inmutable via CASCADE de ventas)
CREATE POLICY "select_own_empresa" ON ventas_det FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON ventas_det FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- pagos (inmutable)
CREATE POLICY "select_own_empresa" ON pagos FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON pagos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- notas_credito (inmutable)
CREATE POLICY "select_own_empresa" ON notas_credito FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON notas_credito FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- notas_credito_det (inmutable, hereda via nota)
CREATE POLICY "select_own_empresa" ON notas_credito_det FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON notas_credito_det FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- notas_debito (inmutable)
CREATE POLICY "select_own_empresa" ON notas_debito FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON notas_debito FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- notas_debito_det (inmutable, hereda via nota)
CREATE POLICY "select_own_empresa" ON notas_debito_det FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON notas_debito_det FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- retenciones_iva_ventas
CREATE POLICY "select_own_empresa" ON retenciones_iva_ventas FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON retenciones_iva_ventas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON retenciones_iva_ventas FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- retenciones_islr_ventas
CREATE POLICY "select_own_empresa" ON retenciones_islr_ventas FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON retenciones_islr_ventas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON retenciones_islr_ventas FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- vencimientos_cobrar
CREATE POLICY "select_own_empresa" ON vencimientos_cobrar FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON vencimientos_cobrar FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON vencimientos_cobrar FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());
