-- =============================================
-- CLARAPOS: 0001 - FOUNDATION + SAAS PLATFORM
-- Ejecutar primero. Sin dependencias.
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- FUNCIONES UTILITARIAS
-- ============================================

-- Auto-actualizar updated_at en tablas mutables
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Inmutabilidad generica (usa TG_TABLE_NAME para mensaje contextual)
CREATE OR REPLACE FUNCTION prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de % son inmutables', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CAPA SAAS: TENANTS
-- ============================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  email_contacto TEXT NOT NULL,
  telefono TEXT,
  pais TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- CAPA SAAS: APPS (catalogo global puro)
-- ============================================

CREATE TABLE apps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(30) UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_apps_updated BEFORE UPDATE ON apps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- CAPA SAAS: PLANES
-- ============================================

CREATE TABLE planes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE RESTRICT,
  nombre TEXT NOT NULL,
  monto NUMERIC(10,2) NOT NULL CHECK (monto >= 0),
  moneda TEXT NOT NULL DEFAULT 'USD',
  intervalo TEXT NOT NULL CHECK (intervalo IN ('mensual','trimestral','semestral','anual')),
  duracion_dias INT NOT NULL CHECK (duracion_dias > 0),
  limites JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_planes_app ON planes(app_id);

CREATE TRIGGER trg_planes_updated BEFORE UPDATE ON planes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- CAPA SAAS: SUSCRIPCIONES
-- ============================================

CREATE TABLE suscripciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES planes(id) ON DELETE RESTRICT,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','suspendida','cancelada','vencida')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suscripciones_tenant ON suscripciones(tenant_id);
CREATE INDEX idx_suscripciones_status ON suscripciones(status);

CREATE TRIGGER trg_suscripciones_updated BEFORE UPDATE ON suscripciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- CAPA SAAS: PLATAFORMA METODOS DE PAGO
-- ============================================

CREATE TABLE plataforma_metodos_pago (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  banco TEXT,
  nro_cuenta TEXT,
  cedula_rif TEXT,
  moneda TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- CAPA SAAS: PAGOS DE SUSCRIPCION
-- ============================================

CREATE TABLE pagos_suscripcion (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suscripcion_id UUID NOT NULL REFERENCES suscripciones(id) ON DELETE RESTRICT,
  monto NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  metodo_pago_id UUID REFERENCES plataforma_metodos_pago(id),
  referencia TEXT UNIQUE NOT NULL,
  fecha DATE NOT NULL,
  periodo_desde DATE NOT NULL,
  periodo_hasta DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pagos_suscripcion_suscripcion ON pagos_suscripcion(suscripcion_id);

-- Inmutable
CREATE TRIGGER trg_pagos_suscripcion_no_update BEFORE UPDATE ON pagos_suscripcion
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_pagos_suscripcion_no_delete BEFORE DELETE ON pagos_suscripcion
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ============================================
-- CAPA SAAS: ACCESO TENANT-APP
-- ============================================

CREATE TABLE tenant_app_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE RESTRICT,
  fecha_vencimiento DATE,
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','suspendido','vencido')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_app UNIQUE(tenant_id, app_id)
);

CREATE TRIGGER trg_tenant_app_access_updated BEFORE UPDATE ON tenant_app_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- EMPRESAS (unidad de negocio bajo un tenant)
-- ============================================

CREATE TABLE empresas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  nombre TEXT NOT NULL,
  rif VARCHAR(15),
  direccion TEXT,
  telefono VARCHAR(20),
  email VARCHAR(150),
  logo_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Caracas',
  moneda_base TEXT NOT NULL DEFAULT 'USD',
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_empresas_tenant ON empresas(tenant_id);

CREATE TRIGGER trg_empresas_updated BEFORE UPDATE ON empresas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- EMPRESAS FISCAL VE (extension fiscal venezolana)
-- ============================================

CREATE TABLE empresas_fiscal_ve (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID UNIQUE NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo_contribuyente TEXT CHECK (tipo_contribuyente IN ('Ordinario','Especial','Formal')),
  es_agente_retencion BOOLEAN NOT NULL DEFAULT FALSE,
  documento_identidad TEXT,
  tipo_documento TEXT,
  nro_providencia TEXT,
  porcentaje_retencion_iva NUMERIC(5,2) DEFAULT 75,
  codigo_sucursal_seniat TEXT DEFAULT '0000',
  usa_maquina_fiscal BOOLEAN NOT NULL DEFAULT FALSE,
  aplica_igtf BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

CREATE TRIGGER trg_empresas_fiscal_ve_updated BEFORE UPDATE ON empresas_fiscal_ve
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS: SAAS PLATFORM (sin RLS por ahora, tablas admin)
-- EMPRESAS: RLS basado en current_empresa_id()
-- Nota: current_empresa_id() se crea en 0002 despues de
-- crear la tabla usuarios. Se aplican policies en 0002.
-- ============================================

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresas_fiscal_ve ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SEED: APPS
-- ============================================

INSERT INTO apps (slug, nombre, descripcion) VALUES
  ('clarapos', 'ClaraPOS', 'Sistema POS + Gestion de Negocio'),
  ('claraclinic', 'ClaraClinic', 'Gestion de Clinica Estetica');
