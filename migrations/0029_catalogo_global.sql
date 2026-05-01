-- =============================================
-- CLARAPOS: 0029 - CATALOGO GLOBAL DE PRODUCTOS
-- Depende de: 0004_inventario.sql
-- Agrega: campo presentacion en productos,
--         catalogo_global con busqueda difusa,
--         RPC buscar_catalogo_global,
--         trigger de sincronizacion automatica
-- =============================================

-- =============================================
-- 1. Campo presentacion en productos
-- =============================================

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS presentacion TEXT;

-- =============================================
-- 2. Extensiones para busqueda difusa
-- =============================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- =============================================
-- 3. Funcion de normalizacion de texto
-- Minusculas + sin acentos + whitespace colapsado
-- IMMUTABLE para que pueda usarse en indices
-- =============================================

CREATE OR REPLACE FUNCTION normalizar_texto(p_texto TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
RETURNS NULL ON NULL INPUT
SET search_path = extensions, public
AS $$
  SELECT TRIM(REGEXP_REPLACE(LOWER(unaccent(p_texto)), '\s+', ' ', 'g'))
$$;

-- =============================================
-- 4. Tabla catalogo_global
-- Agrega nombres de productos de todas las empresas
-- Solo tipo P (productos fisicos)
-- NO contiene precios ni costos (solo metadata)
-- =============================================

CREATE TABLE IF NOT EXISTS catalogo_global (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre             TEXT        NOT NULL,
  nombre_normalizado TEXT        NOT NULL,
  presentacion       TEXT,
  maneja_lotes       BOOLEAN     NOT NULL DEFAULT FALSE,
  tipo_impuesto      TEXT        NOT NULL DEFAULT 'Exento'
                                 CHECK (tipo_impuesto IN ('Gravable', 'Exento', 'Exonerado')),
  uso_count          INT         NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice unico: previene duplicados post-normalizacion
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalogo_global_nombre_norm
  ON catalogo_global(nombre_normalizado);

-- Indice GIN trigram: busqueda difusa rapida
CREATE INDEX IF NOT EXISTS idx_catalogo_global_trgm
  ON catalogo_global USING GIN (nombre_normalizado gin_trgm_ops);

-- =============================================
-- 5. Triggers para catalogo_global
-- =============================================

-- Auto-calcular nombre_normalizado antes de insert/update
CREATE OR REPLACE FUNCTION trg_fn_catalogo_normalizar()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.nombre_normalizado := normalizar_texto(NEW.nombre);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_catalogo_global_normalizar
  BEFORE INSERT OR UPDATE ON catalogo_global
  FOR EACH ROW EXECUTE FUNCTION trg_fn_catalogo_normalizar();

-- Auto-actualizar updated_at
CREATE TRIGGER trg_catalogo_global_updated
  BEFORE UPDATE ON catalogo_global
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 6. RPC: buscar_catalogo_global
-- Busqueda difusa con pg_trgm
-- Requiere autenticacion (SECURITY DEFINER bypasea RLS)
-- Retorna vacio si query < 2 caracteres
-- =============================================

CREATE OR REPLACE FUNCTION buscar_catalogo_global(
  p_query     TEXT,
  p_limit     INT   DEFAULT 8,
  p_threshold FLOAT DEFAULT 0.15
)
RETURNS TABLE (
  id            UUID,
  nombre        TEXT,
  presentacion  TEXT,
  maneja_lotes  BOOLEAN,
  tipo_impuesto TEXT,
  uso_count     INT,
  similitud     FLOAT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    cg.id,
    cg.nombre,
    cg.presentacion,
    cg.maneja_lotes,
    cg.tipo_impuesto,
    cg.uso_count,
    similarity(cg.nombre_normalizado, normalizar_texto(p_query))::FLOAT AS similitud
  FROM catalogo_global cg
  WHERE
    char_length(TRIM(p_query)) >= 2
    AND similarity(cg.nombre_normalizado, normalizar_texto(p_query)) >= p_threshold
  ORDER BY similitud DESC, uso_count DESC
  LIMIT p_limit;
$$;

-- =============================================
-- 7. Trigger en productos: sincronizar al catalogo
-- Dispara AFTER INSERT en productos (solo tipo 'P')
-- Incrementa uso_count si el nombre ya existe
-- =============================================

CREATE OR REPLACE FUNCTION trg_fn_sync_catalogo_global()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Solo productos fisicos
  IF NEW.tipo != 'P' THEN
    RETURN NEW;
  END IF;

  INSERT INTO catalogo_global (nombre, presentacion, maneja_lotes, tipo_impuesto, uso_count)
  VALUES (
    NEW.nombre,
    NEW.presentacion,
    COALESCE(NEW.maneja_lotes, FALSE),
    COALESCE(NEW.tipo_impuesto, 'Exento'),
    1
  )
  ON CONFLICT (nombre_normalizado) DO UPDATE SET
    uso_count  = catalogo_global.uso_count + 1,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_productos_sync_catalogo
  AFTER INSERT ON productos
  FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_catalogo_global();

-- =============================================
-- 8. Backfill: productos existentes tipo P
-- Cada fila de productos se inserta; el trigger
-- calcula nombre_normalizado y ON CONFLICT
-- incrementa uso_count para nombres repetidos
-- =============================================

INSERT INTO catalogo_global (nombre, presentacion, maneja_lotes, tipo_impuesto, uso_count)
SELECT
  nombre,
  presentacion,
  COALESCE(maneja_lotes, FALSE),
  COALESCE(tipo_impuesto, 'Exento'),
  1
FROM productos
WHERE tipo = 'P'
ORDER BY created_at ASC
ON CONFLICT (nombre_normalizado) DO UPDATE SET
  uso_count  = catalogo_global.uso_count + 1,
  updated_at = NOW();

-- =============================================
-- 9. RLS para catalogo_global
-- Solo SELECT permitido a usuarios autenticados
-- INSERT/UPDATE solo via triggers SECURITY DEFINER
-- =============================================

ALTER TABLE catalogo_global ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all" ON catalogo_global
  FOR SELECT TO authenticated USING (true);
