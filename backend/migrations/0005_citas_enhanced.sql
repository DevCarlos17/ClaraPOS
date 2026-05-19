-- =============================================
-- MIGRACION 0005: Agenda v2 - Schema Mejorado
-- Aplicar desde Supabase Dashboard > SQL Editor
-- =============================================
-- Prerequisito: 0003_citas_module.sql y 0004_google_calendar.sql ya aplicados

-- =============================================
-- PASO 1: Agregar columnas a citas
-- =============================================

-- Status dual: operativo y financiero
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS cita_status TEXT NOT NULL DEFAULT 'RESERVADA'
    CHECK (cita_status IN ('RESERVADA','EN_PROCESO','REALIZADA','CANCELADA'));

ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS finance_status TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (finance_status IN ('PENDIENTE','ABONADO','PAGADO','NULO'));

-- Timestamps de ejecucion real
ALTER TABLE citas ADD COLUMN IF NOT EXISTS timestamp_inicio TIMESTAMPTZ;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS timestamp_fin TIMESTAMPTZ;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS duracion_real_min INTEGER;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS desviacion_min INTEGER;

-- Control de ejecucion
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS ejecucion_paralela BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS prioridad_filtro TEXT
    CHECK (prioridad_filtro IN ('EMPLEADO','HORA'));

-- Snapshot para rehidratacion offline
ALTER TABLE citas ADD COLUMN IF NOT EXISTS snapshot_en_progreso JSONB;

-- Observaciones libres
ALTER TABLE citas ADD COLUMN IF NOT EXISTS observaciones TEXT;

-- =============================================
-- PASO 2: Migrar datos de status viejo a dual
-- (idempotente: solo corre si la columna status aun existe)
-- =============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citas' AND column_name = 'status'
  ) THEN
    UPDATE citas SET
      cita_status = CASE status
        WHEN 'PENDIENTE'   THEN 'RESERVADA'
        WHEN 'CONFIRMADA'  THEN 'RESERVADA'
        WHEN 'EN_PROGRESO' THEN 'EN_PROCESO'
        WHEN 'COMPLETADA'  THEN 'REALIZADA'
        WHEN 'CANCELADA'   THEN 'CANCELADA'
        WHEN 'NO_SHOW'     THEN 'CANCELADA'
        ELSE 'RESERVADA'
      END,
      finance_status = CASE status
        WHEN 'COMPLETADA'  THEN 'PAGADO'
        WHEN 'CANCELADA'   THEN 'NULO'
        WHEN 'NO_SHOW'     THEN 'NULO'
        WHEN 'EN_PROGRESO' THEN CASE checkout_tipo
          WHEN 'POS'     THEN 'PAGADO'
          WHEN 'CREDITO' THEN 'PENDIENTE'
          ELSE 'PENDIENTE'
        END
        ELSE 'PENDIENTE'
      END
    WHERE cita_status = 'RESERVADA' AND finance_status = 'PENDIENTE';
  END IF;
END $$;

-- =============================================
-- PASO 3: Eliminar columna status vieja
-- =============================================
ALTER TABLE citas DROP COLUMN IF EXISTS status;

-- Nuevos indices para status dual
CREATE INDEX IF NOT EXISTS idx_citas_cita_status ON citas(empresa_id, cita_status);
CREATE INDEX IF NOT EXISTS idx_citas_finance_status ON citas(empresa_id, finance_status);

-- =============================================
-- PASO 4: Agregar columnas a citas_servicios
-- =============================================
ALTER TABLE citas_servicios ADD COLUMN IF NOT EXISTS duracion_min INTEGER;
ALTER TABLE citas_servicios ADD COLUMN IF NOT EXISTS trabajador_id UUID REFERENCES usuarios(id);

-- =============================================
-- PASO 5: Agregar columnas a horarios_staff
-- =============================================
ALTER TABLE horarios_staff
  ADD COLUMN IF NOT EXISTS tiempo_preparacion_min INTEGER NOT NULL DEFAULT 0;
ALTER TABLE horarios_staff
  ADD COLUMN IF NOT EXISTS cruza_medianoche BOOLEAN NOT NULL DEFAULT FALSE;

-- =============================================
-- PASO 6: Tabla cita_trabajadores (many-to-many)
-- =============================================
CREATE TABLE IF NOT EXISTS cita_trabajadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  cita_id UUID NOT NULL REFERENCES citas(id) ON DELETE CASCADE,
  cita_servicio_id UUID REFERENCES citas_servicios(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  rol_en_cita TEXT NOT NULL DEFAULT 'EJECUTOR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cita_trabajadores_cita ON cita_trabajadores(cita_id);
CREATE INDEX IF NOT EXISTS idx_cita_trabajadores_empresa ON cita_trabajadores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cita_trabajadores_usuario ON cita_trabajadores(empresa_id, usuario_id);

ALTER TABLE cita_trabajadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cita_trabajadores_select" ON cita_trabajadores;
DROP POLICY IF EXISTS "cita_trabajadores_insert" ON cita_trabajadores;
DROP POLICY IF EXISTS "cita_trabajadores_delete" ON cita_trabajadores;
CREATE POLICY "cita_trabajadores_select" ON cita_trabajadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "cita_trabajadores_insert" ON cita_trabajadores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cita_trabajadores_delete" ON cita_trabajadores FOR DELETE TO authenticated USING (true);

-- =============================================
-- PASO 7: Tabla cita_log (audit trail)
-- =============================================
CREATE TABLE IF NOT EXISTS cita_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  cita_id UUID NOT NULL REFERENCES citas(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  accion TEXT NOT NULL,
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cita_log_cita ON cita_log(cita_id);
CREATE INDEX IF NOT EXISTS idx_cita_log_empresa ON cita_log(empresa_id);

ALTER TABLE cita_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cita_log_select" ON cita_log;
DROP POLICY IF EXISTS "cita_log_insert" ON cita_log;
CREATE POLICY "cita_log_select" ON cita_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "cita_log_insert" ON cita_log FOR INSERT TO authenticated WITH CHECK (true);

-- =============================================
-- PASO 8: Tabla cita_items_extras (mini-POS)
-- =============================================
CREATE TABLE IF NOT EXISTS cita_items_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  cita_id UUID NOT NULL REFERENCES citas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad NUMERIC(10,3) NOT NULL DEFAULT 1,
  precio_usd NUMERIC(12,2) NOT NULL,
  status_cobro TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (status_cobro IN ('PENDIENTE','COBRADO')),
  venta_id UUID REFERENCES ventas(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_cita_items_extras_cita ON cita_items_extras(cita_id);
CREATE INDEX IF NOT EXISTS idx_cita_items_extras_empresa ON cita_items_extras(empresa_id);

ALTER TABLE cita_items_extras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cita_items_extras_select" ON cita_items_extras;
DROP POLICY IF EXISTS "cita_items_extras_insert" ON cita_items_extras;
DROP POLICY IF EXISTS "cita_items_extras_update" ON cita_items_extras;
DROP POLICY IF EXISTS "cita_items_extras_delete" ON cita_items_extras;
CREATE POLICY "cita_items_extras_select" ON cita_items_extras FOR SELECT TO authenticated USING (true);
CREATE POLICY "cita_items_extras_insert" ON cita_items_extras FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cita_items_extras_update" ON cita_items_extras FOR UPDATE TO authenticated USING (true);
CREATE POLICY "cita_items_extras_delete" ON cita_items_extras FOR DELETE TO authenticated USING (true);

-- =============================================
-- PASO 9: Tabla horarios_descansos (breaks por dia)
-- =============================================
CREATE TABLE IF NOT EXISTS horarios_descansos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  horario_staff_id UUID NOT NULL REFERENCES horarios_staff(id) ON DELETE CASCADE,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'ALMUERZO'
    CHECK (tipo IN ('ALMUERZO','DESCANSO','OTRO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_horarios_descansos_horario ON horarios_descansos(horario_staff_id);
CREATE INDEX IF NOT EXISTS idx_horarios_descansos_empresa ON horarios_descansos(empresa_id);

ALTER TABLE horarios_descansos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "horarios_descansos_select" ON horarios_descansos;
DROP POLICY IF EXISTS "horarios_descansos_insert" ON horarios_descansos;
DROP POLICY IF EXISTS "horarios_descansos_update" ON horarios_descansos;
DROP POLICY IF EXISTS "horarios_descansos_delete" ON horarios_descansos;
CREATE POLICY "horarios_descansos_select" ON horarios_descansos FOR SELECT TO authenticated USING (true);
CREATE POLICY "horarios_descansos_insert" ON horarios_descansos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "horarios_descansos_update" ON horarios_descansos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "horarios_descansos_delete" ON horarios_descansos FOR DELETE TO authenticated USING (true);

-- =============================================
-- PASO 10: Tabla horarios_excepciones (dias libres/modificados/bloqueos)
-- =============================================
CREATE TABLE IF NOT EXISTS horarios_excepciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  fecha DATE NOT NULL,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('DIA_LIBRE','HORARIO_MODIFICADO','BLOQUEO_EMERGENCIA')),
  hora_inicio TIME,
  hora_fin TIME,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES usuarios(id),
  UNIQUE (empresa_id, usuario_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_horarios_excepciones_usuario ON horarios_excepciones(empresa_id, usuario_id);
CREATE INDEX IF NOT EXISTS idx_horarios_excepciones_fecha ON horarios_excepciones(empresa_id, fecha);

ALTER TABLE horarios_excepciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "horarios_excepciones_select" ON horarios_excepciones;
DROP POLICY IF EXISTS "horarios_excepciones_insert" ON horarios_excepciones;
DROP POLICY IF EXISTS "horarios_excepciones_update" ON horarios_excepciones;
DROP POLICY IF EXISTS "horarios_excepciones_delete" ON horarios_excepciones;
CREATE POLICY "horarios_excepciones_select" ON horarios_excepciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "horarios_excepciones_insert" ON horarios_excepciones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "horarios_excepciones_update" ON horarios_excepciones FOR UPDATE TO authenticated USING (true);
CREATE POLICY "horarios_excepciones_delete" ON horarios_excepciones FOR DELETE TO authenticated USING (true);

-- =============================================
-- PASO 11: Nuevos permisos
-- =============================================
INSERT INTO permisos (id, modulo, slug, nombre, descripcion, is_active, created_at)
VALUES
  (gen_random_uuid(), 'citas', 'citas.manage', 'Gestionar Citas Avanzado', 'Reprogramar, drag-and-drop, mini-POS', TRUE, NOW())
ON CONFLICT DO NOTHING;

-- =============================================
-- PASO 12: Agregar tablas a la publicacion PowerSync
-- Necesario para que PowerSync replique estas tablas a los clientes
-- =============================================
ALTER PUBLICATION powersync ADD TABLE "public"."citas";
ALTER PUBLICATION powersync ADD TABLE "public"."citas_servicios";
ALTER PUBLICATION powersync ADD TABLE "public"."horarios_staff";
ALTER PUBLICATION powersync ADD TABLE "public"."cita_trabajadores";
ALTER PUBLICATION powersync ADD TABLE "public"."cita_log";
ALTER PUBLICATION powersync ADD TABLE "public"."cita_items_extras";
ALTER PUBLICATION powersync ADD TABLE "public"."horarios_descansos";
ALTER PUBLICATION powersync ADD TABLE "public"."horarios_excepciones";
