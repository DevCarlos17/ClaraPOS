-- ============================================================
-- 0100_departamento_codigo_server_side.sql
-- Asignacion server-side de departamentos.codigo (gap-fill + advisory lock)
--
-- Replica el patron de 0099 (productos) SIN columna codigo_status:
-- departamentos nunca tuvo modo "libre" configurable, por lo que
-- codigo = '' (o NULL) es sentinel suficiente de "pendiente de
-- asignacion". El trigger BEFORE INSERT calcula el primer entero
-- >=1 libre por empresa_id (gap-fill, no MAX+1) bajo un advisory
-- lock con namespace PROPIO (':departamento', separado del
-- namespace de productos para evitar contencion cruzada sin
-- motivo) y reescribe NEW.codigo antes de que Postgres valide
-- NOT NULL / CHECK '^[A-Z0-9-]+$' (mismo orden de evaluacion que
-- assign_codigo_producto, 0099, y assign_nro_caja, 0040: los
-- triggers BEFORE INSERT corren antes de que los constraints se
-- evaluen sobre la fila final).
--
-- codigo permanece NOT NULL + CHECK: nunca se persiste '' en
-- Postgres. Codigos legacy alfabeticos (FAC/COR/CAP) no participan
-- del gap-fill (filtro '^\d+$') y siguen existiendo sin conflicto.
-- ============================================================

CREATE OR REPLACE FUNCTION assign_codigo_departamento()
RETURNS TRIGGER AS $$
DECLARE v_gap INTEGER;
BEGIN
  IF NEW.codigo IS NOT NULL AND NEW.codigo <> '' THEN
    RETURN NEW; -- defensivo: la UI actual nunca envia codigo propio
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.empresa_id::text || ':departamento'));

  SELECT gs.n INTO v_gap
  FROM generate_series(1, COALESCE((
    SELECT MAX(codigo::INTEGER) FROM departamentos
    WHERE empresa_id = NEW.empresa_id AND codigo ~ '^\d+$'
  ), 0) + 1) AS gs(n)
  LEFT JOIN departamentos d ON d.empresa_id = NEW.empresa_id AND d.codigo = gs.n::TEXT
  WHERE d.codigo IS NULL
  ORDER BY gs.n LIMIT 1;

  IF v_gap IS NULL THEN
    RAISE EXCEPTION 'No se pudo calcular codigo de departamento para empresa %', NEW.empresa_id;
  END IF;

  NEW.codigo := v_gap::TEXT;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_codigo_departamento ON departamentos;

CREATE TRIGGER trg_assign_codigo_departamento
  BEFORE INSERT ON departamentos
  FOR EACH ROW EXECUTE FUNCTION assign_codigo_departamento();
