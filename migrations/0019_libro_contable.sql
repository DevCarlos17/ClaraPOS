-- =============================================
-- CLARAPOS: 0019 - LIBRO CONTABLE (PARTIDA DOBLE)
-- Expande el modulo contable con:
--   - plan_cuentas: 6 tipos NIIF + naturaleza DEUDORA/ACREEDORA
--   - cuentas_config: mapeo modulo->cuenta contable
--   - libro_contable: asientos contables unificados (partida doble)
--   - bancos_empresa: vinculacion a cuenta contable
-- Depende de: 0008 (plan_cuentas, gastos), 0005 (bancos_empresa)
-- =============================================

-- ============================================
-- 1. ALTER plan_cuentas - expandir tipo y agregar naturaleza
-- ============================================

-- Eliminar constraint de tipo antiguo
ALTER TABLE plan_cuentas DROP CONSTRAINT IF EXISTS plan_cuentas_tipo_check;

-- Agregar nuevo constraint expandido (6 tipos NIIF)
ALTER TABLE plan_cuentas
  ADD CONSTRAINT plan_cuentas_tipo_check
  CHECK (tipo IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','COSTO','GASTO'));

-- Agregar columna naturaleza
ALTER TABLE plan_cuentas
  ADD COLUMN IF NOT EXISTS naturaleza TEXT;

-- Migrar datos existentes:
--   INGRESO_OTRO -> tipo INGRESO, naturaleza ACREEDORA
--   GASTO        -> tipo GASTO (sin cambio), naturaleza DEUDORA
UPDATE plan_cuentas SET
  tipo = 'INGRESO',
  naturaleza = 'ACREEDORA'
WHERE tipo = 'INGRESO_OTRO';

UPDATE plan_cuentas SET
  naturaleza = 'DEUDORA'
WHERE tipo = 'GASTO' AND naturaleza IS NULL;

-- Ahora hacer naturaleza NOT NULL con constraint
ALTER TABLE plan_cuentas
  ALTER COLUMN naturaleza SET NOT NULL;

ALTER TABLE plan_cuentas
  ADD CONSTRAINT plan_cuentas_naturaleza_check
  CHECK (naturaleza IN ('DEUDORA','ACREEDORA'));

-- ============================================
-- 2. CREATE cuentas_config - mapeo modulo->cuenta contable
-- ============================================

CREATE TABLE IF NOT EXISTS cuentas_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  clave TEXT NOT NULL,
  cuenta_contable_id UUID NOT NULL REFERENCES plan_cuentas(id) ON DELETE RESTRICT,
  descripcion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id),
  CONSTRAINT uq_cuentas_config_empresa_clave UNIQUE(empresa_id, clave)
);

CREATE INDEX IF NOT EXISTS idx_cuentas_config_empresa ON cuentas_config(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_config_clave ON cuentas_config(empresa_id, clave);

CREATE TRIGGER trg_cuentas_config_updated BEFORE UPDATE ON cuentas_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 3. ALTER bancos_empresa - vincular a cuenta contable
-- ============================================

ALTER TABLE bancos_empresa
  ADD COLUMN IF NOT EXISTS cuenta_contable_id UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL;

-- ============================================
-- 4. CREATE libro_contable - libro contable unificado (partida doble)
-- ============================================

CREATE TABLE IF NOT EXISTS libro_contable (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nro_asiento TEXT NOT NULL,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Origen
  modulo_origen TEXT NOT NULL CHECK (modulo_origen IN (
    'VENTA','PAGO_CXC','COMPRA','PAGO_CXP','GASTO',
    'NCR_VENTA','NCR_COMPRA','NDB','MANUAL','REVERSO'
  )),
  doc_origen_id UUID,
  doc_origen_ref TEXT,
  -- Contabilidad (monto: positivo=DEBE, negativo=HABER)
  cuenta_contable_id UUID NOT NULL REFERENCES plan_cuentas(id) ON DELETE RESTRICT,
  banco_empresa_id UUID REFERENCES bancos_empresa(id) ON DELETE SET NULL,
  monto NUMERIC(12,2) NOT NULL,
  detalle TEXT NOT NULL,
  -- Control
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','CONCILIADO','ANULADO')),
  parent_id UUID REFERENCES libro_contable(id) ON DELETE RESTRICT,
  -- Auditoria
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_libro_contable_empresa_nro UNIQUE(empresa_id, nro_asiento)
);

CREATE INDEX IF NOT EXISTS idx_libro_contable_empresa ON libro_contable(empresa_id);
CREATE INDEX IF NOT EXISTS idx_libro_contable_fecha ON libro_contable(empresa_id, fecha_registro DESC);
CREATE INDEX IF NOT EXISTS idx_libro_contable_cuenta ON libro_contable(cuenta_contable_id);
CREATE INDEX IF NOT EXISTS idx_libro_contable_banco ON libro_contable(banco_empresa_id) WHERE banco_empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_libro_contable_modulo ON libro_contable(empresa_id, modulo_origen);
CREATE INDEX IF NOT EXISTS idx_libro_contable_doc ON libro_contable(empresa_id, doc_origen_id) WHERE doc_origen_id IS NOT NULL;

-- Inmutabilidad: solo se puede cambiar estado PENDIENTE->CONCILIADO o PENDIENTE->ANULADO
CREATE OR REPLACE FUNCTION prevent_libro_contable_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los asientos contables no se pueden eliminar';
  END IF;
  -- Una vez CONCILIADO o ANULADO, no se puede modificar
  IF OLD.estado IN ('CONCILIADO','ANULADO') THEN
    RAISE EXCEPTION 'No se puede modificar un asiento % - ya fue %', OLD.nro_asiento, OLD.estado;
  END IF;
  -- Solo permitir cambio de estado
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado NOT IN ('CONCILIADO','ANULADO') THEN
      RAISE EXCEPTION 'El estado de un asiento solo puede cambiar a CONCILIADO o ANULADO';
    END IF;
  END IF;
  -- Campos inmutables
  IF NEW.monto IS DISTINCT FROM OLD.monto
     OR NEW.cuenta_contable_id IS DISTINCT FROM OLD.cuenta_contable_id
     OR NEW.nro_asiento IS DISTINCT FROM OLD.nro_asiento
     OR NEW.modulo_origen IS DISTINCT FROM OLD.modulo_origen
     OR NEW.doc_origen_id IS DISTINCT FROM OLD.doc_origen_id THEN
    RAISE EXCEPTION 'Los datos financieros de un asiento no se pueden modificar';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_libro_contable_protect BEFORE UPDATE OR DELETE ON libro_contable
  FOR EACH ROW EXECUTE FUNCTION prevent_libro_contable_mutation();

-- ============================================
-- 5. RLS
-- ============================================

ALTER TABLE cuentas_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE libro_contable ENABLE ROW LEVEL SECURITY;

-- cuentas_config
CREATE POLICY "select_own_empresa" ON cuentas_config FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON cuentas_config FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON cuentas_config FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- libro_contable
CREATE POLICY "select_own_empresa" ON libro_contable FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON libro_contable FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_estado_own_empresa" ON libro_contable FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

-- ============================================
-- 6. FUNCION: seed_plan_cuentas
-- Inserta el plan de cuentas base NIIF/Ba VEN-NIIF
-- Se puede llamar para empresas existentes sin cuentas
-- ============================================

CREATE OR REPLACE FUNCTION seed_plan_cuentas(
  p_empresa_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF (SELECT COUNT(*) FROM plan_cuentas WHERE empresa_id = p_empresa_id) > 0 THEN
    RETURN 0;
  END IF;

  -- ═══ 1 ACTIVO ═══
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1','ACTIVO','ACTIVO','DEUDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1','ACTIVO CORRIENTE','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.01','EFECTIVO Y EQUIVALENTES','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.01.01','CAJA GENERAL','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.01'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.01.02','CAJA CHICA','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.01'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.01.03','BANCOS','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.01'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.02','CUENTAS POR COBRAR COMERCIALES','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.02.01','CLIENTES','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.02'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.03','INVENTARIOS','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.03.01','INVENTARIO DE MERCANCIA','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.03'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.04','IMPUESTOS POR RECUPERAR','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.04.01','IVA CREDITO FISCAL','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.04'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.04.02','RETENCIONES IVA SOPORTADAS','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.04'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.1.04.03','RETENCIONES ISLR SOPORTADAS','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.04'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'1.2','ACTIVO NO CORRIENTE','ACTIVO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ═══ 2 PASIVO ═══
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2','PASIVO','PASIVO','ACREEDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1','PASIVO CORRIENTE','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.01','CUENTAS POR PAGAR COMERCIALES','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.01.01','PROVEEDORES','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.01'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.02','IMPUESTOS POR PAGAR','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.02.01','IVA DEBITO FISCAL','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.02.02','RETENCIONES IVA POR ENTERAR','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.02.03','RETENCIONES ISLR POR ENTERAR','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.02.04','IGTF POR PAGAR','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02'),4,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.1.03','OBLIGACIONES LABORALES','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1'),3,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'2.2','PASIVO NO CORRIENTE','PASIVO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ═══ 3 PATRIMONIO ═══
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'3','PATRIMONIO','PATRIMONIO','ACREEDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'3.1','CAPITAL SOCIAL','PATRIMONIO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='3'),2,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'3.2','RESERVA LEGAL','PATRIMONIO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='3'),2,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'3.3','RESULTADOS ACUMULADOS','PATRIMONIO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='3'),2,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'3.4','RESULTADO DEL EJERCICIO','PATRIMONIO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='3'),2,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ═══ 4 INGRESOS ═══
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4','INGRESOS','INGRESO','ACREEDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.1','INGRESOS OPERACIONALES','INGRESO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.1.01','VENTAS DE PRODUCTOS','INGRESO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.1.02','PRESTACION DE SERVICIOS','INGRESO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.1.03','DESCUENTOS EN VENTAS','INGRESO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.1.04','DEVOLUCIONES EN VENTAS','INGRESO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'4.2','OTROS INGRESOS','INGRESO','ACREEDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ═══ 5 COSTOS ═══
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'5','COSTOS','COSTO','DEUDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'5.1','COSTO DE VENTAS','COSTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='5'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'5.1.01','COSTO DE MERCANCIA VENDIDA','COSTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='5.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'5.1.02','COSTO DE SERVICIOS PRESTADOS','COSTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='5.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  -- ═══ 6 GASTOS ═══
  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6','GASTOS','GASTO','DEUDORA',NULL,1,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1','GASTOS OPERACIONALES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.01','GASTOS DE PERSONAL','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.02','SERVICIOS BASICOS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.03','ALQUILER','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.04','MANTENIMIENTO Y REPARACIONES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.05','DEPRECIACION','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.06','SEGUROS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.07','PAPELERIA Y UTILES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.1.08','OTROS GASTOS OPERACIONALES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.1'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2','GASTOS NO OPERACIONALES','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6'),2,FALSE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  INSERT INTO plan_cuentas (id,empresa_id,codigo,nombre,tipo,naturaleza,parent_id,nivel,es_cuenta_detalle,is_active,created_at,updated_at,created_by)
  VALUES (uuid_generate_v4(),p_empresa_id,'6.2.01','GASTOS FINANCIEROS','GASTO','DEUDORA',(SELECT id FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='6.2'),3,TRUE,TRUE,v_now,v_now,p_created_by)
  ON CONFLICT (empresa_id,codigo) DO NOTHING;

  RETURN (SELECT COUNT(*) FROM plan_cuentas WHERE empresa_id = p_empresa_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. FUNCION: seed_cuentas_config
-- Inserta el mapeo de claves para la empresa
-- Se llama despues de seed_plan_cuentas
-- ============================================

CREATE OR REPLACE FUNCTION seed_cuentas_config(
  p_empresa_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF (SELECT COUNT(*) FROM cuentas_config WHERE empresa_id = p_empresa_id) > 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'CAJA_EFECTIVO',id,'Efectivo en caja',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.01.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'CAJA_CHICA',id,'Caja chica',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.01.02'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'BANCO_DEFAULT',id,'Bancos (cuenta generica)',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.01.03'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'CXC_CLIENTES',id,'Cuentas por cobrar clientes',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.02.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'INVENTARIO',id,'Inventario de mercancia',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.03.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'IVA_CREDITO',id,'IVA credito fiscal',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.04.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'RET_IVA_SOPORTADA',id,'Retenciones IVA soportadas',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.04.02'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'RET_ISLR_SOPORTADA',id,'Retenciones ISLR soportadas',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='1.1.04.03'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'CXP_PROVEEDORES',id,'Cuentas por pagar proveedores',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.01.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'IVA_DEBITO',id,'IVA debito fiscal',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'RET_IVA_POR_ENTERAR',id,'Retenciones IVA por enterar',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02.02'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'RET_ISLR_POR_ENTERAR',id,'Retenciones ISLR por enterar',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02.03'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'IGTF_POR_PAGAR',id,'IGTF por pagar',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='2.1.02.04'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'INGRESO_VENTA_PRODUCTO',id,'Ventas de productos',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'INGRESO_VENTA_SERVICIO',id,'Servicios prestados',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1.02'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'DESCUENTO_VENTAS',id,'Descuentos en ventas',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1.03'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'DEVOLUCION_VENTAS',id,'Devoluciones en ventas',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='4.1.04'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  INSERT INTO cuentas_config (id,empresa_id,clave,cuenta_contable_id,descripcion,created_at,updated_at,created_by)
  SELECT uuid_generate_v4(),p_empresa_id,'COSTO_VENTA',id,'Costo de mercancia vendida',v_now,v_now,p_created_by
  FROM plan_cuentas WHERE empresa_id=p_empresa_id AND codigo='5.1.01'
  ON CONFLICT (empresa_id,clave) DO NOTHING;

  RETURN (SELECT COUNT(*) FROM cuentas_config WHERE empresa_id = p_empresa_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. SEED PARA EMPRESAS EXISTENTES
-- Llama ambas funciones para todas las empresas activas
-- ============================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM empresas WHERE is_active = TRUE LOOP
    PERFORM seed_plan_cuentas(rec.id, NULL);
    PERFORM seed_cuentas_config(rec.id, NULL);
  END LOOP;
END;
$$;
