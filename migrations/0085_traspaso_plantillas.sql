-- ============================================================
-- 0085_traspaso_plantillas.sql
-- Plantillas de Traslado: sets reutilizables de productos (sin
-- cantidades) para pre-llenar el formulario de traspasos entre
-- depositos, evitando re-elegir productos en traslados recurrentes.
--
-- Header/detalle modelado sobre dos precedentes vivos:
--   - `marcas` para `traspaso_plantillas` (catalogo editable, RLS
--     SELECT+INSERT+UPDATE completo). El UPDATE es obligatorio: sin
--     ella PowerSync descarta el UPDATE (soft-delete via is_active)
--     con 42501 y el proximo sync revierte el estado local — mismo
--     bug que 0018_ajustes_update_rls.sql corrigio para `ajustes`.
--   - `recetas` para `traspaso_plantillas_det` (membresia pura,
--     SELECT+INSERT+DELETE, sin UPDATE — cambios de membresia son
--     delete+reinsert, no hay columna mutable como `cantidad`).
--
-- Forma estructural (indices, FKs, bloque de publicacion DO $$
-- idempotente) tomada de migrations/0084_traspasos_inventario.sql.
-- ============================================================

-- 1. Cabecera
CREATE TABLE IF NOT EXISTS traspaso_plantillas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_by UUID REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_traspaso_plantillas_empresa ON traspaso_plantillas(empresa_id);

-- 2. Detalle — solo membresia de producto, sin cantidad (se ingresa
--    siempre al momento del traspaso).
CREATE TABLE IF NOT EXISTS traspaso_plantillas_det (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  plantilla_id UUID NOT NULL REFERENCES traspaso_plantillas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_traspaso_plantillas_det_empresa ON traspaso_plantillas_det(empresa_id);
CREATE INDEX IF NOT EXISTS idx_traspaso_plantillas_det_plantilla ON traspaso_plantillas_det(plantilla_id);
CREATE INDEX IF NOT EXISTS idx_traspaso_plantillas_det_producto ON traspaso_plantillas_det(producto_id);

-- 3. RLS cabecera: SELECT + INSERT + UPDATE (catalogo editable, patron
--    `marcas`). Sin policy de DELETE — el borrado es siempre soft-delete
--    via UPDATE is_active=0.
ALTER TABLE traspaso_plantillas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_empresa" ON traspaso_plantillas;
CREATE POLICY "select_own_empresa" ON traspaso_plantillas FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "insert_own_empresa" ON traspaso_plantillas;
CREATE POLICY "insert_own_empresa" ON traspaso_plantillas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "update_own_empresa" ON traspaso_plantillas;
CREATE POLICY "update_own_empresa" ON traspaso_plantillas FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- 4. RLS detalle: SELECT + INSERT + DELETE (sin UPDATE — patron `recetas`,
--    los cambios de membresia son delete+reinsert del set completo).
ALTER TABLE traspaso_plantillas_det ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_empresa" ON traspaso_plantillas_det;
CREATE POLICY "select_own_empresa" ON traspaso_plantillas_det FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "insert_own_empresa" ON traspaso_plantillas_det;
CREATE POLICY "insert_own_empresa" ON traspaso_plantillas_det FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "delete_own_empresa" ON traspaso_plantillas_det;
CREATE POLICY "delete_own_empresa" ON traspaso_plantillas_det FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- 5. Agregar a la publicacion de PowerSync (patron 0084 — idempotente,
--    ALTER PUBLICATION no soporta IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'traspaso_plantillas'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE traspaso_plantillas;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'traspaso_plantillas_det'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE traspaso_plantillas_det;
  END IF;
END $$;
