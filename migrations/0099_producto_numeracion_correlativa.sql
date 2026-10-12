-- ============================================================
-- 0099_producto_numeracion_correlativa.sql
-- Numeracion configurable de codigo de producto (libre vs correlativo)
--
-- Agrega codigo_status a productos ('pendiente' | 'asignado').
-- En modo 'libre' el cliente sigue enviando codigo (codigo_status
-- queda 'asignado' por default). En modo 'correlativo' el cliente
-- envia codigo='' y codigo_status='pendiente'; el trigger
-- BEFORE INSERT calcula el primer entero >=1 libre por empresa_id
-- (gap-fill, no MAX+1) bajo un advisory lock por empresa y
-- reescribe NEW.codigo/NEW.codigo_status antes de que Postgres
-- valide el NOT NULL de codigo (mismo orden de evaluacion que
-- assign_nro_caja, migracion 0040).
--
-- codigo permanece NOT NULL: nunca se persiste '' en Postgres.
-- ============================================================

-- 1. Columna de estado (metadata-only; filas existentes quedan 'asignado')
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS codigo_status TEXT NOT NULL DEFAULT 'asignado'
  CHECK (codigo_status IN ('pendiente', 'asignado'));

-- 2. Trigger de asignacion server-side (gap-fill atomico por empresa)
CREATE OR REPLACE FUNCTION assign_codigo_producto()
RETURNS TRIGGER AS $$
DECLARE v_gap INTEGER;
BEGIN
  IF NEW.codigo IS NOT NULL AND NEW.codigo <> '' THEN
    RETURN NEW; -- modo libre: el cliente ya definio el codigo
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.empresa_id::text));

  SELECT gs.n INTO v_gap
  FROM generate_series(1, COALESCE((
    SELECT MAX(codigo::INTEGER) FROM productos
    WHERE empresa_id = NEW.empresa_id AND codigo ~ '^\d+$'
  ), 0) + 1) AS gs(n)
  LEFT JOIN productos p ON p.empresa_id = NEW.empresa_id AND p.codigo = gs.n::TEXT
  WHERE p.codigo IS NULL
  ORDER BY gs.n LIMIT 1;

  NEW.codigo := v_gap::TEXT;
  NEW.codigo_status := 'asignado';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_codigo_producto
  BEFORE INSERT ON productos
  FOR EACH ROW EXECUTE FUNCTION assign_codigo_producto();
