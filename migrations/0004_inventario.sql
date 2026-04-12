-- =============================================
-- CLARAPOS: 0004 - INVENTARIO COMPLETO
-- Depende de: 0001, 0002, 0003
-- =============================================

-- ============================================
-- DEPARTAMENTOS (jerarquico)
-- ============================================

CREATE TABLE departamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL CHECK (codigo ~ '^[A-Z0-9-]+$'),
  nombre TEXT NOT NULL CHECK (char_length(nombre) >= 3),
  parent_id UUID REFERENCES departamentos(id) ON DELETE SET NULL,
  slug TEXT,
  descripcion TEXT,
  imagen_url TEXT,
  prioridad_visual INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_departamentos_empresa_codigo UNIQUE(empresa_id, codigo)
);

CREATE INDEX idx_departamentos_empresa ON departamentos(empresa_id);
CREATE INDEX idx_departamentos_parent ON departamentos(parent_id);

CREATE TRIGGER trg_departamentos_updated BEFORE UPDATE ON departamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Codigo inmutable
CREATE OR REPLACE FUNCTION validate_departamento_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.codigo IS DISTINCT FROM NEW.codigo THEN
    RAISE EXCEPTION 'El codigo de departamento no se puede cambiar';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_departamento_update
  BEFORE UPDATE ON departamentos
  FOR EACH ROW EXECUTE FUNCTION validate_departamento_update();

-- ============================================
-- MARCAS
-- ============================================

CREATE TABLE marcas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_marcas_empresa_nombre UNIQUE(empresa_id, nombre)
);

CREATE INDEX idx_marcas_empresa ON marcas(empresa_id);

CREATE TRIGGER trg_marcas_updated BEFORE UPDATE ON marcas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- UNIDADES DE MEDIDA
-- ============================================

CREATE TABLE unidades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  abreviatura VARCHAR(10) NOT NULL,
  es_decimal BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_unidades_empresa_abreviatura UNIQUE(empresa_id, abreviatura)
);

CREATE INDEX idx_unidades_empresa ON unidades(empresa_id);

CREATE TRIGGER trg_unidades_updated BEFORE UPDATE ON unidades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- UNIDADES CONVERSION
-- ============================================

CREATE TABLE unidades_conversion (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidad_mayor_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  unidad_menor_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  factor NUMERIC(12,4) NOT NULL CHECK (factor > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_unidades_conversion UNIQUE(empresa_id, unidad_mayor_id, unidad_menor_id)
);

CREATE TRIGGER trg_unidades_conversion_updated BEFORE UPDATE ON unidades_conversion
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- DEPOSITOS (almacenes)
-- ============================================

CREATE TABLE depositos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  direccion TEXT,
  es_principal BOOLEAN NOT NULL DEFAULT FALSE,
  permite_venta BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_depositos_empresa ON depositos(empresa_id);

CREATE TRIGGER trg_depositos_updated BEFORE UPDATE ON depositos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- PRODUCTOS
-- ============================================

CREATE TABLE productos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('P', 'S')),
  nombre TEXT NOT NULL CHECK (char_length(nombre) >= 3),
  departamento_id UUID NOT NULL REFERENCES departamentos(id) ON DELETE RESTRICT,
  marca_id UUID REFERENCES marcas(id) ON DELETE SET NULL,
  unidad_base_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
  -- Precios
  costo_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_venta_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_mayor_usd NUMERIC(12,2),
  costo_promedio NUMERIC(12,4) NOT NULL DEFAULT 0,
  costo_ultimo NUMERIC(12,4) NOT NULL DEFAULT 0,
  -- Stock (campo legacy, actualizado via trigger desde inventario_stock)
  stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0,
  -- Impuestos
  tipo_impuesto TEXT NOT NULL DEFAULT 'Gravable' CHECK (tipo_impuesto IN ('Gravable','Exento','Exonerado')),
  impuesto_iva_id UUID REFERENCES impuestos_ve(id),
  impuesto_igtf_id UUID REFERENCES impuestos_ve(id),
  -- Lotes
  maneja_lotes BOOLEAN NOT NULL DEFAULT FALSE,
  -- Estado
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_productos_empresa_codigo UNIQUE(empresa_id, codigo),
  CONSTRAINT chk_precio_costo CHECK (precio_venta_usd >= costo_usd),
  CONSTRAINT chk_precio_mayor CHECK (precio_mayor_usd IS NULL OR precio_mayor_usd <= precio_venta_usd),
  CONSTRAINT chk_servicio_stock CHECK (tipo != 'S' OR (stock = 0 AND stock_minimo = 0))
);

CREATE INDEX idx_productos_empresa ON productos(empresa_id);
CREATE INDEX idx_productos_empresa_activo ON productos(empresa_id, is_active, departamento_id);
CREATE INDEX idx_productos_depto ON productos(departamento_id);
CREATE INDEX idx_productos_tipo ON productos(tipo);

CREATE TRIGGER trg_productos_updated BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Codigo y tipo inmutables
CREATE OR REPLACE FUNCTION validate_producto_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.codigo IS DISTINCT FROM NEW.codigo THEN
    RAISE EXCEPTION 'El codigo de producto no se puede cambiar';
  END IF;
  IF OLD.tipo IS DISTINCT FROM NEW.tipo THEN
    RAISE EXCEPTION 'El tipo de producto no se puede cambiar';
  END IF;
  IF NEW.stock < 0 THEN
    RAISE EXCEPTION 'El stock no puede ser negativo para "%"', NEW.nombre;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_producto_update
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION validate_producto_update();

-- ============================================
-- INVENTARIO STOCK (stock por producto/deposito)
-- ============================================

CREATE TABLE inventario_stock (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  deposito_id UUID NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
  cantidad_actual NUMERIC(12,3) NOT NULL DEFAULT 0,
  stock_reservado NUMERIC(12,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_stock_empresa_producto_deposito UNIQUE(empresa_id, producto_id, deposito_id)
);

CREATE INDEX idx_inventario_stock_lookup ON inventario_stock(empresa_id, producto_id, deposito_id);

-- ============================================
-- TIPOS DE MOVIMIENTO (catalogo global)
-- ============================================

CREATE TABLE tipos_movimiento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  slug VARCHAR(20) UNIQUE NOT NULL,
  operacion TEXT NOT NULL CHECK (operacion IN ('ENTRADA','SALIDA')),
  requiere_doc BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tipos_movimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_all" ON tipos_movimiento FOR SELECT TO authenticated USING (true);

-- ============================================
-- MOVIMIENTOS INVENTARIO (KARDEX) - INMUTABLE
-- ============================================

CREATE TABLE movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  producto_id UUID NOT NULL REFERENCES productos(id),
  deposito_id UUID NOT NULL REFERENCES depositos(id),
  tipo_movimiento_id UUID REFERENCES tipos_movimiento(id),
  -- Tipo basico (mantiene compatibilidad)
  tipo TEXT NOT NULL CHECK (tipo IN ('E', 'S')),
  origen TEXT NOT NULL CHECK (origen IN ('MAN','FAC','VEN','AJU','NCR','COM','NDB')),
  -- Cantidades
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  stock_anterior NUMERIC(12,3) NOT NULL,
  stock_nuevo NUMERIC(12,3) NOT NULL,
  -- Costos
  costo_unitario NUMERIC(12,4),
  moneda_id UUID REFERENCES monedas(id),
  tasa_cambio NUMERIC(12,4),
  -- Referencias
  doc_origen_id UUID,
  doc_origen_ref TEXT,
  lote_id UUID,  -- FK se agrega despues de crear tabla lotes
  motivo TEXT,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mov_inv_empresa ON movimientos_inventario(empresa_id);
CREATE INDEX idx_mov_inv_producto ON movimientos_inventario(producto_id);
CREATE INDEX idx_mov_inv_fecha ON movimientos_inventario(fecha);
CREATE INDEX idx_kardex_producto_fecha ON movimientos_inventario(empresa_id, producto_id, created_at DESC);
CREATE INDEX idx_kardex_doc_origen ON movimientos_inventario(doc_origen_id) WHERE doc_origen_id IS NOT NULL;

-- Inmutabilidad
CREATE TRIGGER trg_kardex_no_update BEFORE UPDATE ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_kardex_no_delete BEFORE DELETE ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- Validar consistencia matematica
CREATE OR REPLACE FUNCTION validate_movimiento_inventario_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'E' THEN
    IF ABS(NEW.stock_nuevo - (NEW.stock_anterior + NEW.cantidad)) > 0.001 THEN
      RAISE EXCEPTION 'Inconsistencia en kardex entrada: % + % != %',
        NEW.stock_anterior, NEW.cantidad, NEW.stock_nuevo;
    END IF;
  ELSIF NEW.tipo = 'S' THEN
    IF ABS(NEW.stock_nuevo - (NEW.stock_anterior - NEW.cantidad)) > 0.001 THEN
      RAISE EXCEPTION 'Inconsistencia en kardex salida: % - % != %',
        NEW.stock_anterior, NEW.cantidad, NEW.stock_nuevo;
    END IF;
    IF NEW.stock_nuevo < -0.001 THEN
      RAISE EXCEPTION 'Stock no puede quedar negativo: %', NEW.stock_nuevo;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_movimiento_inventario_insert
  BEFORE INSERT ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION validate_movimiento_inventario_insert();

-- Trigger: actualizar inventario_stock y productos.stock desde kardex
CREATE OR REPLACE FUNCTION actualizar_inventario_stock()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventario_stock (empresa_id, producto_id, deposito_id, cantidad_actual)
  VALUES (NEW.empresa_id, NEW.producto_id, NEW.deposito_id,
    CASE WHEN NEW.tipo = 'E' THEN NEW.cantidad ELSE -NEW.cantidad END)
  ON CONFLICT (empresa_id, producto_id, deposito_id)
  DO UPDATE SET
    cantidad_actual = inventario_stock.cantidad_actual +
      CASE WHEN NEW.tipo = 'E' THEN NEW.cantidad ELSE -NEW.cantidad END,
    updated_at = NOW();

  UPDATE productos SET stock = (
    SELECT COALESCE(SUM(cantidad_actual), 0)
    FROM inventario_stock
    WHERE producto_id = NEW.producto_id AND empresa_id = NEW.empresa_id
  ) WHERE id = NEW.producto_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kardex_update_stock
  AFTER INSERT ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION actualizar_inventario_stock();

-- ============================================
-- AJUSTE MOTIVOS
-- ============================================

CREATE TABLE ajuste_motivos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  es_sistema BOOLEAN NOT NULL DEFAULT FALSE,
  operacion_base TEXT NOT NULL CHECK (operacion_base IN ('SUMA','RESTA','NEUTRO')),
  afecta_costo BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_ajuste_motivos_empresa ON ajuste_motivos(empresa_id);

CREATE TRIGGER trg_ajuste_motivos_updated BEFORE UPDATE ON ajuste_motivos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- AJUSTES
-- ============================================

CREATE TABLE ajustes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  num_ajuste TEXT NOT NULL,
  motivo_id UUID NOT NULL REFERENCES ajuste_motivos(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  observaciones TEXT,
  status TEXT NOT NULL DEFAULT 'PROCESADO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_ajustes_empresa_num UNIQUE(empresa_id, num_ajuste)
);

CREATE INDEX idx_ajustes_empresa ON ajustes(empresa_id);

CREATE TRIGGER trg_ajustes_updated BEFORE UPDATE ON ajustes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- AJUSTES DETALLE
-- ============================================

CREATE TABLE ajustes_det (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ajuste_id UUID NOT NULL REFERENCES ajustes(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  deposito_id UUID NOT NULL REFERENCES depositos(id) ON DELETE RESTRICT,
  cantidad NUMERIC(12,3) NOT NULL,
  costo_unitario NUMERIC(12,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_ajustes_det_ajuste ON ajustes_det(ajuste_id);

-- ============================================
-- LOTES
-- ============================================

CREATE TABLE lotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  deposito_id UUID NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
  nro_lote TEXT NOT NULL,
  fecha_fabricacion DATE,
  fecha_vencimiento DATE,
  cantidad_inicial NUMERIC(12,3) NOT NULL CHECK (cantidad_inicial > 0),
  cantidad_actual NUMERIC(12,3) NOT NULL DEFAULT 0,
  costo_unitario NUMERIC(12,4),
  factura_compra_id UUID,  -- FK se agrega en 0007_compras.sql
  status TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO','AGOTADO','VENCIDO','BLOQUEADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_lotes_empresa_producto_nro UNIQUE(empresa_id, producto_id, nro_lote)
);

CREATE INDEX idx_lotes_empresa ON lotes(empresa_id);
CREATE INDEX idx_lotes_producto ON lotes(producto_id);
CREATE INDEX idx_lotes_vencimiento ON lotes(fecha_vencimiento) WHERE status = 'ACTIVO';

CREATE TRIGGER trg_lotes_updated BEFORE UPDATE ON lotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- FK de lote en kardex
ALTER TABLE movimientos_inventario ADD CONSTRAINT fk_kardex_lote
  FOREIGN KEY (lote_id) REFERENCES lotes(id);

-- ============================================
-- RECETAS (BOM para servicios)
-- ============================================

CREATE TABLE recetas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  servicio_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_recetas_empresa_servicio_producto UNIQUE(empresa_id, servicio_id, producto_id)
);

CREATE INDEX idx_recetas_servicio ON recetas(servicio_id);
CREATE INDEX idx_recetas_empresa ON recetas(empresa_id);

-- ============================================
-- RLS PARA TODAS LAS TABLAS DE INVENTARIO
-- ============================================

ALTER TABLE departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades_conversion ENABLE ROW LEVEL SECURITY;
ALTER TABLE depositos ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE ajuste_motivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ajustes_det ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetas ENABLE ROW LEVEL SECURITY;

-- Macro: SELECT/INSERT/UPDATE por empresa
-- departamentos
CREATE POLICY "select_own_empresa" ON departamentos FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON departamentos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON departamentos FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- marcas
CREATE POLICY "select_own_empresa" ON marcas FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON marcas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON marcas FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- unidades
CREATE POLICY "select_own_empresa" ON unidades FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON unidades FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON unidades FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- unidades_conversion
CREATE POLICY "select_own_empresa" ON unidades_conversion FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON unidades_conversion FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON unidades_conversion FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- depositos
CREATE POLICY "select_own_empresa" ON depositos FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON depositos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON depositos FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- productos
CREATE POLICY "select_own_empresa" ON productos FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON productos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON productos FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- inventario_stock
CREATE POLICY "select_own_empresa" ON inventario_stock FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- movimientos_inventario (solo SELECT + INSERT, inmutable)
CREATE POLICY "select_own_empresa" ON movimientos_inventario FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON movimientos_inventario FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- ajuste_motivos
CREATE POLICY "select_own_empresa" ON ajuste_motivos FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON ajuste_motivos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON ajuste_motivos FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- ajustes
CREATE POLICY "select_own_empresa" ON ajustes FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON ajustes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

-- ajustes_det (hereda via ajuste)
CREATE POLICY "select_all" ON ajustes_det FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_all" ON ajustes_det FOR INSERT TO authenticated WITH CHECK (true);

-- lotes
CREATE POLICY "select_own_empresa" ON lotes FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON lotes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON lotes FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- recetas
CREATE POLICY "select_own_empresa" ON recetas FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON recetas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "delete_own_empresa" ON recetas FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- ============================================
-- SEED: TIPOS DE MOVIMIENTO
-- ============================================

INSERT INTO tipos_movimiento (nombre, slug, operacion, requiere_doc) VALUES
  ('Entrada manual', 'MANUAL_E', 'ENTRADA', FALSE),
  ('Salida manual', 'MANUAL_S', 'SALIDA', FALSE),
  ('Venta', 'VENTA', 'SALIDA', TRUE),
  ('Compra', 'COMPRA', 'ENTRADA', TRUE),
  ('Ajuste entrada', 'AJUSTE_E', 'ENTRADA', TRUE),
  ('Ajuste salida', 'AJUSTE_S', 'SALIDA', TRUE),
  ('Nota de credito', 'NCR', 'ENTRADA', TRUE),
  ('Nota de debito', 'NDB', 'SALIDA', FALSE);
