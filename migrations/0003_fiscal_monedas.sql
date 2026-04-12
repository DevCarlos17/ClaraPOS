-- =============================================
-- CLARAPOS: 0003 - FISCAL + MONEDAS
-- Depende de: 0001 (empresas), 0002 (usuarios)
-- =============================================

-- ============================================
-- MONEDAS (catalogo global predefinido ISO 4217)
-- ============================================

CREATE TABLE monedas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_iso VARCHAR(3) UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  simbolo TEXT,
  decimales INT NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_monedas_updated BEFORE UPDATE ON monedas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE monedas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_all" ON monedas FOR SELECT TO authenticated USING (true);

-- ============================================
-- TIPOS DE PERSONA VE (catalogo global)
-- ============================================

CREATE TABLE tipos_persona_ve (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo VARCHAR(1) UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  es_entidad_legal BOOLEAN NOT NULL DEFAULT FALSE,
  aplica_sustraendo BOOLEAN NOT NULL DEFAULT FALSE,
  formato_regexp TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE tipos_persona_ve ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_all" ON tipos_persona_ve FOR SELECT TO authenticated USING (true);

-- ============================================
-- IMPUESTOS VE (por empresa)
-- ============================================

CREATE TABLE impuestos_ve (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo_tributo TEXT NOT NULL CHECK (tipo_tributo IN ('IVA','IGTF','INCO')),
  porcentaje NUMERIC(5,2) NOT NULL CHECK (porcentaje >= 0),
  codigo_seniat TEXT,
  descripcion TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_impuestos_ve_empresa ON impuestos_ve(empresa_id);

CREATE TRIGGER trg_impuestos_ve_updated BEFORE UPDATE ON impuestos_ve
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE impuestos_ve ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_empresa" ON impuestos_ve FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON impuestos_ve FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON impuestos_ve FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- ============================================
-- ISLR CONCEPTOS VE (catalogo global)
-- ============================================

CREATE TABLE islr_conceptos_ve (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_seniat TEXT UNIQUE NOT NULL,
  descripcion TEXT NOT NULL,
  porcentaje_pj NUMERIC(5,2) NOT NULL DEFAULT 0,
  porcentaje_pn NUMERIC(5,2) NOT NULL DEFAULT 0,
  sustraendo_ut NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_minimo_base NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE islr_conceptos_ve ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_all" ON islr_conceptos_ve FOR SELECT TO authenticated USING (true);

-- ============================================
-- SEED: MONEDAS
-- ============================================

INSERT INTO monedas (codigo_iso, nombre, simbolo, decimales) VALUES
  ('USD', 'Dolar estadounidense', '$', 2),
  ('VES', 'Bolivar digital', 'Bs', 2),
  ('EUR', 'Euro', 'EUR', 2),
  ('COP', 'Peso colombiano', 'COP', 0)
ON CONFLICT (codigo_iso) DO NOTHING;

-- ============================================
-- SEED: TIPOS PERSONA VE
-- ============================================

INSERT INTO tipos_persona_ve (codigo, nombre, es_entidad_legal, aplica_sustraendo, formato_regexp) VALUES
  ('V', 'Venezolano', FALSE, FALSE, '^\d{6,8}$'),
  ('E', 'Extranjero', FALSE, FALSE, '^\d{6,10}$'),
  ('J', 'Juridico', TRUE, FALSE, '^\d{8,9}$'),
  ('G', 'Gobierno', TRUE, FALSE, '^\d{8,10}$'),
  ('P', 'Pasaporte', FALSE, FALSE, '^[A-Z0-9]{5,15}$'),
  ('C', 'Comunal', TRUE, FALSE, '^\d{8,10}$')
ON CONFLICT (codigo) DO NOTHING;

-- ============================================
-- SEED: CONCEPTOS ISLR (principales)
-- ============================================

INSERT INTO islr_conceptos_ve (codigo_seniat, descripcion, porcentaje_pj, porcentaje_pn, sustraendo_ut) VALUES
  ('S/OA-066', 'Honorarios profesionales no mercantiles PJ', 5.00, 0, 0),
  ('S/OA-067', 'Honorarios profesionales no mercantiles PN', 0, 3.00, 0),
  ('S/OA-068', 'Comisiones mercantiles PJ', 5.00, 0, 0),
  ('S/OA-069', 'Servicios tecnologia PJ', 5.00, 0, 0),
  ('S/OA-072', 'Fletes nacionales PJ', 3.00, 0, 0),
  ('S/OA-074', 'Publicidad y propaganda PJ', 5.00, 0, 0),
  ('S/OA-083', 'Arrendamiento inmuebles PJ', 5.00, 0, 0)
ON CONFLICT (codigo_seniat) DO NOTHING;
