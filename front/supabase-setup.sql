-- =============================================
-- NEXO21: ESQUEMA COMPLETO DE BASE DE DATOS
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---- USUARIOS (enlaza con auth.users) ----
CREATE TABLE usuarios (
  id UUID PRIMARY KEY,  -- = auth.users.id
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'cajero' CHECK (rol IN ('admin', 'cajero', 'gerente')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- TASAS DE CAMBIO ----
CREATE TABLE tasas_cambio (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valor NUMERIC(12,4) NOT NULL CHECK (valor > 0),
  moneda_destino TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- DEPARTAMENTOS ----
CREATE TABLE departamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo TEXT UNIQUE NOT NULL CHECK (codigo ~ '^[A-Z0-9-]+$'),
  nombre TEXT NOT NULL CHECK (char_length(nombre) >= 3),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- PRODUCTOS/SERVICIOS ----
CREATE TABLE productos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('P', 'S')),
  nombre TEXT NOT NULL CHECK (char_length(nombre) >= 3),
  departamento_id UUID NOT NULL REFERENCES departamentos(id) ON DELETE RESTRICT,
  costo_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_venta_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_mayor_usd NUMERIC(12,2),
  stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0,
  medida TEXT NOT NULL DEFAULT 'UND' CHECK (medida IN ('UND', 'GRA')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_precio_costo CHECK (precio_venta_usd >= costo_usd),
  CONSTRAINT chk_precio_mayor CHECK (precio_mayor_usd IS NULL OR precio_mayor_usd <= precio_venta_usd),
  CONSTRAINT chk_servicio_stock CHECK (tipo != 'S' OR (stock = 0 AND stock_minimo = 0))
);

CREATE INDEX idx_productos_depto ON productos(departamento_id);
CREATE INDEX idx_productos_tipo ON productos(tipo);
CREATE INDEX idx_productos_activo ON productos(activo);

-- ---- RECETAS (BOM para Servicios) ----
CREATE TABLE recetas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  servicio_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(servicio_id, producto_id)
);

-- ---- MOVIMIENTOS DE INVENTARIO (KARDEX) ----
CREATE TABLE movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id UUID NOT NULL REFERENCES productos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('E', 'S')),
  origen TEXT NOT NULL CHECK (origen IN ('MAN', 'FAC', 'VEN', 'AJU')),
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  stock_anterior NUMERIC(12,3) NOT NULL,
  stock_nuevo NUMERIC(12,3) NOT NULL,
  motivo TEXT,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  venta_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mov_inv_producto ON movimientos_inventario(producto_id);
CREATE INDEX idx_mov_inv_fecha ON movimientos_inventario(fecha);

-- ---- METODOS DE PAGO (referencia para fase POS) ----
CREATE TABLE metodos_pago (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- CLIENTES ----
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identificacion TEXT UNIQUE NOT NULL,
  nombre_social TEXT NOT NULL CHECK (char_length(nombre_social) >= 3),
  direccion TEXT,
  telefono TEXT,
  limite_credito NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (limite_credito >= 0),
  saldo_actual NUMERIC(12,2) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clientes_identificacion ON clientes(identificacion);
CREATE INDEX idx_clientes_activo ON clientes(activo);

-- ---- MOVIMIENTOS DE CUENTA (Libro Auxiliar del Cliente) ----
CREATE TABLE movimientos_cuenta (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('FAC','PAG','NCR','NDB')),
  referencia TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  saldo_anterior NUMERIC(12,2) NOT NULL,
  saldo_nuevo NUMERIC(12,2) NOT NULL,
  observacion TEXT,
  venta_id UUID,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mov_cuenta_cliente ON movimientos_cuenta(cliente_id);
CREATE INDEX idx_mov_cuenta_fecha ON movimientos_cuenta(fecha);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_departamentos_updated BEFORE UPDATE ON departamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_productos_updated BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger: Auto-actualizar saldo del cliente (replica SIG_CLI_01)
CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
RETURNS TRIGGER AS $$
BEGIN
  -- Capturar saldo anterior
  SELECT saldo_actual INTO NEW.saldo_anterior
  FROM clientes WHERE id = NEW.cliente_id;

  -- Logica contable: FAC/NDB suman, PAG/NCR restan
  IF NEW.tipo IN ('FAC', 'NDB') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo IN ('PAG', 'NCR') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  END IF;

  -- Actualizar saldo del cliente
  UPDATE clientes SET saldo_actual = NEW.saldo_nuevo, updated_at = NOW()
  WHERE id = NEW.cliente_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_saldo
  BEFORE INSERT ON movimientos_cuenta
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_cliente();

-- Inmutabilidad de movimientos_cuenta
CREATE OR REPLACE FUNCTION prevent_movimiento_cuenta_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos de cuenta son inmutables';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mov_cuenta_no_update BEFORE UPDATE ON movimientos_cuenta
  FOR EACH ROW EXECUTE FUNCTION prevent_movimiento_cuenta_mutation();
CREATE TRIGGER trg_mov_cuenta_no_delete BEFORE DELETE ON movimientos_cuenta
  FOR EACH ROW EXECUTE FUNCTION prevent_movimiento_cuenta_mutation();

-- Inmutabilidad de movimientos_inventario
CREATE OR REPLACE FUNCTION prevent_kardex_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos de inventario son inmutables';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kardex_no_update BEFORE UPDATE ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION prevent_kardex_mutation();
CREATE TRIGGER trg_kardex_no_delete BEFORE DELETE ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION prevent_kardex_mutation();

-- Inmutabilidad de tasas_cambio
CREATE TRIGGER trg_tasa_no_update BEFORE UPDATE ON tasas_cambio
  FOR EACH ROW EXECUTE FUNCTION prevent_kardex_mutation();
CREATE TRIGGER trg_tasa_no_delete BEFORE DELETE ON tasas_cambio
  FOR EACH ROW EXECUTE FUNCTION prevent_kardex_mutation();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasas_cambio ENABLE ROW LEVEL SECURITY;
ALTER TABLE departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE metodos_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_cuenta ENABLE ROW LEVEL SECURITY;

-- Lectura: usuarios autenticados pueden leer todo
CREATE POLICY "Authenticated read all" ON usuarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read all" ON tasas_cambio FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read all" ON departamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read all" ON productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read all" ON recetas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read all" ON movimientos_inventario FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read all" ON metodos_pago FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read all" ON clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read all" ON movimientos_cuenta FOR SELECT TO authenticated USING (true);

-- Insercion
CREATE POLICY "Authenticated insert" ON tasas_cambio FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert" ON departamentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert" ON productos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert" ON recetas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert" ON movimientos_inventario FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert" ON metodos_pago FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert" ON clientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert" ON movimientos_cuenta FOR INSERT TO authenticated WITH CHECK (true);

-- Actualizacion (solo tablas mutables)
CREATE POLICY "Authenticated update" ON departamentos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated update" ON productos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated update" ON metodos_pago FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated update" ON clientes FOR UPDATE TO authenticated USING (true);

-- Eliminacion (solo recetas)
CREATE POLICY "Authenticated delete" ON recetas FOR DELETE TO authenticated USING (true);

-- ============================================
-- FUNCION: Crear usuario al registrarse
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nombre)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- DATOS INICIALES
-- ============================================

-- ---- VENTAS (Cabecera de factura) ----
CREATE TABLE ventas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  nro_factura TEXT UNIQUE,
  tasa NUMERIC(12,4) NOT NULL CHECK (tasa > 0),
  total_usd NUMERIC(12,2) NOT NULL CHECK (total_usd >= 0),
  total_bs NUMERIC(12,2) NOT NULL CHECK (total_bs >= 0),
  saldo_pend_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL CHECK (tipo IN ('CONTADO', 'CREDITO')),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX idx_ventas_fecha ON ventas(fecha);

-- ---- DETALLE DE VENTA (Lineas de factura - inmutable) ----
CREATE TABLE detalle_venta (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  precio_unitario_usd NUMERIC(12,2) NOT NULL CHECK (precio_unitario_usd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_detalle_venta_venta ON detalle_venta(venta_id);

-- ---- PAGOS (Pagos bimonetarios - inmutable) ----
CREATE TABLE pagos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  metodo_pago_id UUID NOT NULL REFERENCES metodos_pago(id),
  moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS')),
  tasa NUMERIC(12,4) NOT NULL CHECK (tasa > 0),
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  monto_usd NUMERIC(12,2) NOT NULL CHECK (monto_usd > 0),
  referencia TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pagos_venta ON pagos(venta_id);
CREATE INDEX idx_pagos_cliente ON pagos(cliente_id);

-- Inmutabilidad de detalle_venta
CREATE TRIGGER trg_detalle_venta_no_update BEFORE UPDATE ON detalle_venta
  FOR EACH ROW EXECUTE FUNCTION prevent_kardex_mutation();
CREATE TRIGGER trg_detalle_venta_no_delete BEFORE DELETE ON detalle_venta
  FOR EACH ROW EXECUTE FUNCTION prevent_kardex_mutation();

-- Inmutabilidad de pagos
CREATE TRIGGER trg_pagos_no_update BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION prevent_kardex_mutation();
CREATE TRIGGER trg_pagos_no_delete BEFORE DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION prevent_kardex_mutation();

-- Ventas: permitir UPDATE (para saldo_pend_usd) pero no DELETE
CREATE OR REPLACE FUNCTION prevent_venta_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Las ventas no se pueden eliminar';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_venta_no_delete BEFORE DELETE ON ventas
  FOR EACH ROW EXECUTE FUNCTION prevent_venta_delete();

-- RLS para ventas
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read all" ON ventas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read all" ON detalle_venta FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read all" ON pagos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert" ON ventas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert" ON detalle_venta FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert" ON pagos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update" ON ventas FOR UPDATE TO authenticated USING (true);

-- ============================================
-- DATOS INICIALES
-- ============================================

INSERT INTO metodos_pago (nombre, moneda) VALUES
  ('Efectivo USD', 'USD'),
  ('Efectivo Bs', 'BS'),
  ('Zelle', 'USD'),
  ('Transferencia Bs', 'BS'),
  ('Punto de Venta', 'BS'),
  ('Pago Movil', 'BS');

-- ============================================
-- FASE 6: NOTAS DE CREDITO
-- ============================================

-- Columna anulada en ventas
ALTER TABLE ventas ADD COLUMN anulada BOOLEAN NOT NULL DEFAULT FALSE;

-- Ampliar CHECK de origen en movimientos_inventario para incluir NCR
ALTER TABLE movimientos_inventario DROP CONSTRAINT movimientos_inventario_origen_check;
ALTER TABLE movimientos_inventario ADD CONSTRAINT movimientos_inventario_origen_check
  CHECK (origen IN ('MAN', 'FAC', 'VEN', 'AJU', 'NCR'));

-- Tabla notas_credito
CREATE TABLE notas_credito (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nro_ncr TEXT UNIQUE NOT NULL,
  venta_id UUID UNIQUE NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  motivo TEXT NOT NULL DEFAULT 'Anulacion total de factura',
  tasa_historica NUMERIC(12,4) NOT NULL,
  monto_total_usd NUMERIC(12,2) NOT NULL,
  monto_total_bs NUMERIC(12,2) NOT NULL,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inmutabilidad de notas_credito
CREATE TRIGGER trg_ncr_no_update BEFORE UPDATE ON notas_credito
  FOR EACH ROW EXECUTE FUNCTION prevent_kardex_mutation();
CREATE TRIGGER trg_ncr_no_delete BEFORE DELETE ON notas_credito
  FOR EACH ROW EXECUTE FUNCTION prevent_kardex_mutation();

-- RLS para notas_credito
ALTER TABLE notas_credito ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read all" ON notas_credito FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON notas_credito FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- VALIDACIONES SERVER-SIDE
-- Triggers BEFORE INSERT/UPDATE que validan
-- integridad de datos al llegar via PowerSync.
-- Si la validacion falla, PostgreSQL lanza error
-- 23xxx que PowerSync descarta (no reintenta).
-- ============================================

-- 1. Validar INSERT en ventas: sanidad basica
CREATE OR REPLACE FUNCTION validate_venta_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- saldo_pend_usd no puede exceder total_usd
  IF NEW.saldo_pend_usd > NEW.total_usd THEN
    RAISE EXCEPTION 'saldo_pend_usd (%) no puede exceder total_usd (%)',
      NEW.saldo_pend_usd, NEW.total_usd;
  END IF;

  -- saldo_pend_usd no puede ser negativo
  IF NEW.saldo_pend_usd < 0 THEN
    RAISE EXCEPTION 'saldo_pend_usd no puede ser negativo';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_venta_insert
  BEFORE INSERT ON ventas
  FOR EACH ROW EXECUTE FUNCTION validate_venta_insert();

-- 2. Validar UPDATE en ventas: campos inmutables, anulada solo 0->1, saldo solo baja
CREATE OR REPLACE FUNCTION validate_venta_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Campos inmutables: no pueden cambiar despues de la creacion
  IF OLD.cliente_id IS DISTINCT FROM NEW.cliente_id THEN
    RAISE EXCEPTION 'No se puede cambiar el cliente de una venta';
  END IF;
  IF OLD.nro_factura IS DISTINCT FROM NEW.nro_factura THEN
    RAISE EXCEPTION 'No se puede cambiar el numero de factura';
  END IF;
  IF OLD.tasa IS DISTINCT FROM NEW.tasa THEN
    RAISE EXCEPTION 'No se puede cambiar la tasa de una venta';
  END IF;
  IF OLD.total_usd IS DISTINCT FROM NEW.total_usd THEN
    RAISE EXCEPTION 'No se puede cambiar el total USD de una venta';
  END IF;
  IF OLD.total_bs IS DISTINCT FROM NEW.total_bs THEN
    RAISE EXCEPTION 'No se puede cambiar el total Bs de una venta';
  END IF;
  IF OLD.tipo IS DISTINCT FROM NEW.tipo THEN
    RAISE EXCEPTION 'No se puede cambiar el tipo de una venta';
  END IF;
  IF OLD.usuario_id IS DISTINCT FROM NEW.usuario_id THEN
    RAISE EXCEPTION 'No se puede cambiar el usuario de una venta';
  END IF;

  -- anulada: solo puede ir de FALSE a TRUE, nunca al reves
  IF OLD.anulada = TRUE AND NEW.anulada = FALSE THEN
    RAISE EXCEPTION 'No se puede revertir la anulacion de una venta';
  END IF;

  -- saldo_pend_usd: no puede aumentar (solo disminuir via pagos o NCR)
  IF NEW.saldo_pend_usd > OLD.saldo_pend_usd THEN
    RAISE EXCEPTION 'El saldo pendiente no puede aumentar';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_venta_update
  BEFORE UPDATE ON ventas
  FOR EACH ROW EXECUTE FUNCTION validate_venta_update();

-- 3. Validar UPDATE en productos: codigo/tipo inmutables, stock >= 0
CREATE OR REPLACE FUNCTION validate_producto_update()
RETURNS TRIGGER AS $$
BEGIN
  -- codigo es inmutable
  IF OLD.codigo IS DISTINCT FROM NEW.codigo THEN
    RAISE EXCEPTION 'El codigo de producto no se puede cambiar';
  END IF;

  -- tipo es inmutable (no se puede convertir Producto en Servicio ni viceversa)
  IF OLD.tipo IS DISTINCT FROM NEW.tipo THEN
    RAISE EXCEPTION 'El tipo de producto no se puede cambiar';
  END IF;

  -- Stock no puede ser negativo
  IF NEW.stock < 0 THEN
    RAISE EXCEPTION 'El stock no puede ser negativo para "%"', NEW.nombre;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_producto_update
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION validate_producto_update();

-- 4. Validar UPDATE en departamentos: codigo inmutable
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

-- 5. Validar UPDATE en clientes: identificacion inmutable
CREATE OR REPLACE FUNCTION validate_cliente_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.identificacion IS DISTINCT FROM NEW.identificacion THEN
    RAISE EXCEPTION 'La identificacion del cliente no se puede cambiar';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_cliente_update
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION validate_cliente_update();

-- 6. Validar INSERT en notas_credito: snapshot coincide con factura
CREATE OR REPLACE FUNCTION validate_nota_credito_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_total_usd NUMERIC(12,2);
  v_tasa NUMERIC(12,4);
  v_total_bs NUMERIC(12,2);
BEGIN
  -- Leer factura original
  SELECT total_usd, tasa, total_bs INTO v_total_usd, v_tasa, v_total_bs
  FROM ventas WHERE id = NEW.venta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura % no encontrada', NEW.venta_id;
  END IF;

  -- Validar que el snapshot coincida con la factura
  IF NEW.monto_total_usd != v_total_usd THEN
    RAISE EXCEPTION 'monto_total_usd (%) no coincide con factura (%)', NEW.monto_total_usd, v_total_usd;
  END IF;

  IF NEW.tasa_historica != v_tasa THEN
    RAISE EXCEPTION 'tasa_historica (%) no coincide con factura (%)', NEW.tasa_historica, v_tasa;
  END IF;

  IF NEW.monto_total_bs != v_total_bs THEN
    RAISE EXCEPTION 'monto_total_bs (%) no coincide con factura (%)', NEW.monto_total_bs, v_total_bs;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_nota_credito_insert
  BEFORE INSERT ON notas_credito
  FOR EACH ROW EXECUTE FUNCTION validate_nota_credito_insert();

-- 7. Validar INSERT en movimientos_inventario: consistencia matematica del kardex
CREATE OR REPLACE FUNCTION validate_movimiento_inventario_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Validar consistencia: stock_nuevo debe ser correcto segun tipo
  IF NEW.tipo = 'E' THEN
    -- Entrada: stock_nuevo = stock_anterior + cantidad
    IF ABS(NEW.stock_nuevo - (NEW.stock_anterior + NEW.cantidad)) > 0.001 THEN
      RAISE EXCEPTION 'Inconsistencia en kardex entrada: % + % != %',
        NEW.stock_anterior, NEW.cantidad, NEW.stock_nuevo;
    END IF;
  ELSIF NEW.tipo = 'S' THEN
    -- Salida: stock_nuevo = stock_anterior - cantidad
    IF ABS(NEW.stock_nuevo - (NEW.stock_anterior - NEW.cantidad)) > 0.001 THEN
      RAISE EXCEPTION 'Inconsistencia en kardex salida: % - % != %',
        NEW.stock_anterior, NEW.cantidad, NEW.stock_nuevo;
    END IF;
    -- Stock no puede quedar negativo
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
