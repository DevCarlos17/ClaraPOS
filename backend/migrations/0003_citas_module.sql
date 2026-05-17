-- =============================================
-- MIGRACION 0003: Modulo Agenda y Citas
-- Aplicar desde Supabase Dashboard > SQL Editor
-- =============================================

-- =============================================
-- TABLA: citas
-- Cabecera de cada cita/agendamiento
-- =============================================
CREATE TABLE IF NOT EXISTS citas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  profesional_id UUID NOT NULL REFERENCES usuarios(id),
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ NOT NULL,
  duracion_min INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (status IN ('PENDIENTE','CONFIRMADA','EN_PROGRESO','COMPLETADA','CANCELADA','NO_SHOW')),
  checkout_tipo TEXT NOT NULL DEFAULT 'RESERVA'
    CHECK (checkout_tipo IN ('RESERVA','POS','CREDITO')),
  total_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  tasa NUMERIC(12,4) NOT NULL DEFAULT 1,
  total_bs NUMERIC(16,2) NOT NULL DEFAULT 0,
  venta_id UUID REFERENCES ventas(id),
  notas TEXT,
  color TEXT,
  google_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id)
);

-- Indices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_citas_empresa_fecha ON citas(empresa_id, fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_citas_profesional ON citas(empresa_id, profesional_id, fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_citas_cliente ON citas(empresa_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_citas_status ON citas(empresa_id, status);

-- =============================================
-- TABLA: citas_servicios
-- Servicios incluidos en cada cita
-- =============================================
CREATE TABLE IF NOT EXISTS citas_servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  cita_id UUID NOT NULL REFERENCES citas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  precio_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  cantidad NUMERIC(10,3) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citas_servicios_cita ON citas_servicios(cita_id);
CREATE INDEX IF NOT EXISTS idx_citas_servicios_empresa ON citas_servicios(empresa_id);

-- =============================================
-- TABLA: horarios_staff
-- Disponibilidad semanal por profesional
-- =============================================
CREATE TABLE IF NOT EXISTS horarios_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=Dom, 1=Lun ... 6=Sab
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, usuario_id, dia_semana)
);

CREATE INDEX IF NOT EXISTS idx_horarios_staff_usuario ON horarios_staff(empresa_id, usuario_id);

-- =============================================
-- TRIGGERS: auto-actualizar updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_citas_updated ON citas;
CREATE TRIGGER trg_citas_updated
  BEFORE UPDATE ON citas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_horarios_staff_updated ON horarios_staff;
CREATE TRIGGER trg_horarios_staff_updated
  BEFORE UPDATE ON horarios_staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- RLS: Row Level Security
-- =============================================
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE horarios_staff ENABLE ROW LEVEL SECURITY;

-- Politicas para citas
CREATE POLICY "citas_select" ON citas FOR SELECT TO authenticated USING (true);
CREATE POLICY "citas_insert" ON citas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "citas_update" ON citas FOR UPDATE TO authenticated USING (true);

-- Politicas para citas_servicios
CREATE POLICY "citas_servicios_select" ON citas_servicios FOR SELECT TO authenticated USING (true);
CREATE POLICY "citas_servicios_insert" ON citas_servicios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "citas_servicios_delete" ON citas_servicios FOR DELETE TO authenticated USING (true);

-- Politicas para horarios_staff
CREATE POLICY "horarios_staff_select" ON horarios_staff FOR SELECT TO authenticated USING (true);
CREATE POLICY "horarios_staff_insert" ON horarios_staff FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "horarios_staff_update" ON horarios_staff FOR UPDATE TO authenticated USING (true);
CREATE POLICY "horarios_staff_delete" ON horarios_staff FOR DELETE TO authenticated USING (true);

-- =============================================
-- PERMISOS: Agregar slugs al catalogo
-- =============================================
INSERT INTO permisos (id, modulo, slug, nombre, descripcion, is_active, created_at)
VALUES
  (gen_random_uuid(), 'citas', 'citas.ver',       'Ver Agenda',             'Visualizar el calendario y citas', TRUE, NOW()),
  (gen_random_uuid(), 'citas', 'citas.crear',     'Agendar Cita',           'Crear nuevas citas',               TRUE, NOW()),
  (gen_random_uuid(), 'citas', 'citas.gestionar', 'Gestionar Citas',        'Cambiar status, cancelar citas',   TRUE, NOW()),
  (gen_random_uuid(), 'citas', 'citas.horarios',  'Gestionar Horarios',     'Configurar horarios del staff',    TRUE, NOW())
ON CONFLICT DO NOTHING;
