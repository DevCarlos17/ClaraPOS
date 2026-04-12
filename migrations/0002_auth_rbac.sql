-- =============================================
-- CLARAPOS: 0002 - AUTH + RBAC
-- Depende de: 0001 (empresas)
-- =============================================

-- ============================================
-- PERMISOS (catalogo global maestro)
-- ============================================

CREATE TABLE permisos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  modulo TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permisos_modulo ON permisos(modulo);

-- ============================================
-- TENANT_PERMISOS (personalizacion por tenant)
-- ============================================

CREATE TABLE tenant_permisos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  permiso_id UUID NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_permiso UNIQUE(tenant_id, permiso_id)
);

CREATE TRIGGER trg_tenant_permisos_updated BEFORE UPDATE ON tenant_permisos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROLES (por empresa)
-- ============================================

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  CONSTRAINT uq_roles_empresa_nombre UNIQUE(empresa_id, nombre)
);

CREATE INDEX idx_roles_empresa ON roles(empresa_id);

CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- USUARIOS (enlaza con auth.users de Supabase)
-- ============================================

CREATE TABLE usuarios (
  id UUID PRIMARY KEY,  -- = auth.users.id
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

CREATE INDEX idx_usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX idx_usuarios_rol ON usuarios(rol_id);

CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Ahora podemos agregar FKs de auditoria
ALTER TABLE roles ADD CONSTRAINT fk_roles_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id);
ALTER TABLE roles ADD CONSTRAINT fk_roles_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios(id);
ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id);
ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios(id);
ALTER TABLE empresas_fiscal_ve ADD CONSTRAINT fk_fiscal_ve_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios(id);

-- ============================================
-- ROL_PERMISOS (asignacion permisos a roles)
-- ============================================

CREATE TABLE rol_permisos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rol_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id UUID NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES usuarios(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rol_permiso UNIQUE(rol_id, permiso_id)
);

CREATE INDEX idx_rol_permisos_rol ON rol_permisos(rol_id);

-- ============================================
-- FUNCIONES SECURITY DEFINER
-- ============================================

-- Obtener empresa_id del usuario autenticado
CREATE OR REPLACE FUNCTION public.current_empresa_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_empresa_id() TO authenticated;

-- Obtener tenant_id del usuario autenticado (derivado de empresa)
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT e.tenant_id FROM public.empresas e
  INNER JOIN public.usuarios u ON u.empresa_id = e.id
  WHERE u.id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;

-- Verificar si el usuario tiene un permiso especifico
CREATE OR REPLACE FUNCTION public.user_has_permission(p_slug TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rol_permisos rp
    INNER JOIN public.permisos p ON p.id = rp.permiso_id
    INNER JOIN public.usuarios u ON u.rol_id = rp.rol_id
    INNER JOIN public.empresas e ON e.id = u.empresa_id
    INNER JOIN public.tenant_permisos tp ON tp.tenant_id = e.tenant_id
                                        AND tp.permiso_id = p.id
    WHERE u.id = auth.uid()
      AND p.slug = p_slug
      AND tp.habilitado = TRUE
      AND p.is_active = TRUE
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_has_permission(TEXT) TO authenticated;

-- ============================================
-- TRIGGER: Crear usuario al registrarse en Supabase Auth
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nombre, empresa_id, rol_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
    (NEW.raw_user_meta_data->>'empresa_id')::UUID,
    (NEW.raw_user_meta_data->>'rol_id')::UUID
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- RLS POLICIES
-- ============================================

-- Empresas
CREATE POLICY "select_own_empresa" ON empresas FOR SELECT TO authenticated
  USING (id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON empresas FOR UPDATE TO authenticated
  USING (id = public.current_empresa_id());

-- Empresas fiscal VE
CREATE POLICY "select_own_empresa" ON empresas_fiscal_ve FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON empresas_fiscal_ve FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON empresas_fiscal_ve FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- Usuarios
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_empresa" ON usuarios FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON usuarios FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- Roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_empresa" ON roles FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON roles FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON roles FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- Permisos (catalogo global, lectura para todos)
ALTER TABLE permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_all" ON permisos FOR SELECT TO authenticated
  USING (true);

-- Tenant permisos (lectura por tenant)
ALTER TABLE tenant_permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_tenant" ON tenant_permisos FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- Rol permisos
ALTER TABLE rol_permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_empresa" ON rol_permisos FOR SELECT TO authenticated
  USING (rol_id IN (SELECT id FROM roles WHERE empresa_id = public.current_empresa_id()));
CREATE POLICY "insert_own_empresa" ON rol_permisos FOR INSERT TO authenticated
  WITH CHECK (rol_id IN (SELECT id FROM roles WHERE empresa_id = public.current_empresa_id()));
CREATE POLICY "delete_own_empresa" ON rol_permisos FOR DELETE TO authenticated
  USING (rol_id IN (SELECT id FROM roles WHERE empresa_id = public.current_empresa_id()));

-- ============================================
-- SEED: PERMISOS
-- ============================================

INSERT INTO permisos (modulo, slug, nombre, descripcion) VALUES
  -- Inventario
  ('inventario', 'inventario.ver', 'Ver inventario', 'Ver productos, stock, kardex'),
  ('inventario', 'inventario.crear', 'Crear productos', 'Crear productos y departamentos'),
  ('inventario', 'inventario.editar', 'Editar productos', 'Editar productos y departamentos'),
  ('inventario', 'inventario.ajustar', 'Ajustar inventario', 'Realizar ajustes de inventario'),
  ('inventario', 'inventario.editar_precios', 'Editar precios', 'Modificar precios de venta'),
  -- Ventas
  ('ventas', 'ventas.crear', 'Crear ventas', 'Facturar ventas'),
  ('ventas', 'ventas.anular', 'Anular ventas', 'Emitir notas de credito'),
  ('ventas', 'ventas.notas_debito', 'Notas de debito', 'Emitir notas de debito'),
  ('ventas', 'ventas.retenciones', 'Retenciones ventas', 'Gestionar retenciones sobre ventas'),
  -- Clientes
  ('clientes', 'clientes.gestionar', 'Gestionar clientes', 'CRUD de clientes'),
  ('clientes', 'clientes.credito', 'Aprobar credito', 'Aprobar ventas a credito'),
  -- Compras
  ('compras', 'compras.crear', 'Crear compras', 'Registrar facturas de compra'),
  ('compras', 'compras.retenciones', 'Retenciones compras', 'Gestionar retenciones fiscales'),
  ('compras', 'compras.notas_fiscales', 'Notas fiscales compra', 'NC/ND de compras'),
  -- Caja
  ('caja', 'caja.abrir', 'Abrir caja', 'Abrir sesion de caja'),
  ('caja', 'caja.cerrar', 'Cerrar caja', 'Cerrar y cuadrar caja'),
  ('caja', 'caja.movimientos', 'Movimientos bancarios', 'Registrar movimientos bancarios'),
  -- Reportes
  ('reportes', 'reportes.ver', 'Ver reportes', 'Ver reportes basicos'),
  ('reportes', 'reportes.cuadre_caja', 'Cuadre de caja', 'Ver cuadre de caja'),
  -- Configuracion
  ('configuracion', 'config.empresa', 'Config empresa', 'Editar datos de empresa'),
  ('configuracion', 'config.usuarios', 'Config usuarios', 'Gestionar empleados y roles'),
  ('configuracion', 'config.tasas', 'Config tasas', 'Registrar tasas de cambio'),
  ('configuracion', 'config.metodos_cobro', 'Config metodos cobro', 'Gestionar metodos de cobro'),
  ('configuracion', 'config.bancos', 'Config bancos', 'Gestionar cuentas bancarias'),
  -- Contabilidad
  ('contabilidad', 'contabilidad.gastos', 'Registrar gastos', 'Registrar gastos operativos'),
  ('contabilidad', 'contabilidad.plan_cuentas', 'Plan de cuentas', 'Gestionar plan de cuentas'),
  -- CxC / CxP
  ('cxc', 'cxc.ver', 'Ver CxC', 'Ver cuentas por cobrar'),
  ('cxp', 'cxp.ver', 'Ver CxP', 'Ver cuentas por pagar'),
  ('cxp', 'cxp.pagar', 'Registrar pagos', 'Registrar pagos a proveedores'),
  -- Clinica
  ('clinica', 'clinica.acceso', 'Acceso clinica', 'Acceso al modulo clinico');
