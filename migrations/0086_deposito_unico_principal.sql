-- ============================================================
-- 0086_deposito_unico_principal.sql
-- Deposito Principal Unico: invariante forzada por trigger (DB
-- es la fuente de verdad, "ni via consola")
--
-- PROBLEMA:
-- `resolveDepositoIngreso`/`resolveDepositoEgresoVenta` resuelven el
-- deposito de kardex con `SELECT id FROM depositos WHERE empresa_id=?
-- AND es_principal=1 AND is_active=1 LIMIT 1` (sin ORDER BY). Si una
-- empresa tiene exactamente 1 deposito activo y ese deposito NO es
-- es_principal=1, la resolucion no tiene fallback determinista.
--
-- INVARIANTE:
-- Cuando una empresa tiene EXACTAMENTE 1 deposito con is_active=TRUE,
-- ese deposito DEBE tener es_principal=TRUE.
--
-- 3 CAPAS (este archivo es la 3ra, la fuente de verdad):
--   1. UI (deposito-form.tsx): checkbox disabled+checked, UX only.
--   2. Hook (use-depositos.ts): debeForzarPrincipalUnico(), fail-fast
--      antes de writeTransaction.
--   3. DB (este trigger): reject-only, RAISE EXCEPTION, NUNCA hace
--      auto-correccion de NEW. Es la unica capa inevitable — cubre
--      escrituras crudas via SQL Editor / API que bypasean UI y hook
--      (spec scenario "Escritura cruda ni via consola").
--
-- CONVENCION: mirrors validate_venta_insert/validate_venta_update
-- (migrations/0001_initial_schema.sql:438-503) — misma funcion
-- CREATE OR REPLACE FUNCTION ... RETURNS TRIGGER, mismo estilo de
-- RAISE EXCEPTION en espanol, mismo RETURN NEW. Idempotente
-- (CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE
-- TRIGGER), mismo patron que 0060_fix_saldo_trigger_idempotency.sql.
--
-- LOGICA DEL COUNT (INSERT vs UPDATE) — critico, documentado aqui:
-- La misma query `COUNT(*) WHERE empresa_id = NEW.empresa_id AND
-- is_active = TRUE AND id != NEW.id` sirve para AMBOS eventos:
--   - INSERT: Postgres asigna el DEFAULT de `id` (uuid_generate_v4())
--     ANTES de que corra el trigger BEFORE INSERT, asi que NEW.id ya
--     tiene el UUID final. La fila nueva TODAVIA NO existe en la
--     tabla (es un INSERT), por lo que `id != NEW.id` no excluye
--     ninguna fila real — el COUNT es simplemente "cuantos depositos
--     activos YA existen en la empresa" (los "otros").
--   - UPDATE: la fila SI existe en la tabla con su id original (el
--     UPDATE nunca cambia `id`), asi que `id != NEW.id` excluye
--     correctamente ESTA fila (su version OLD) del conteo, dejando
--     solo los "otros" depositos activos de la empresa — el mismo
--     criterio que usa `existeOtroPrincipalActivo` en el hook
--     (`debeBloquearQuitarUltimoPrincipal`) y `otrosActivosCount` en
--     `debeForzarPrincipalUnico`.
-- En ambos casos, `otros_activos = 0` significa "sin este trigger,
-- la fila que se esta escribiendo seria efectivamente el UNICO
-- deposito activo de la empresa". Si ademas esa fila queda
-- is_active=TRUE (NEW.is_active) y es_principal=FALSE (NEW.es_principal),
-- se viola la invariante y se rechaza.
--
-- CASOS QUE NO DEBEN RECHAZARSE (false-reject seria un bug):
--   - Crear el 2do deposito de la empresa: otros_activos=1 (no 0) ->
--     no entra al IF, permitido sin importar es_principal.
--   - Tener 2+ depositos activos simultaneos: siempre otros_activos>=1
--     para cualquiera de ellos -> nunca bloquea.
--   - Desactivar un deposito (NEW.is_active=FALSE): el IF exige
--     NEW.is_active = TRUE, asi que desactivar nunca dispara este
--     trigger (esa transicion la gobierna el guard at-least-one del
--     hook, dominio distinto: "al menos un principal activo").
--   - Marcar es_principal=TRUE (NEW.es_principal=TRUE): el IF exige
--     NEW.es_principal = FALSE, nunca dispara.
-- ============================================================

CREATE OR REPLACE FUNCTION validate_deposito_principal_unico()
RETURNS TRIGGER AS $$
DECLARE
  otros_activos INT;
BEGIN
  IF NEW.is_active = TRUE AND NEW.es_principal = FALSE THEN
    SELECT COUNT(*) INTO otros_activos
    FROM depositos
    WHERE empresa_id = NEW.empresa_id
      AND is_active = TRUE
      AND id != NEW.id;

    IF otros_activos = 0 THEN
      RAISE EXCEPTION 'El unico deposito activo de la empresa debe ser principal';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deposito_principal_unico_insert ON depositos;
CREATE TRIGGER trg_deposito_principal_unico_insert
  BEFORE INSERT ON depositos
  FOR EACH ROW EXECUTE FUNCTION validate_deposito_principal_unico();

DROP TRIGGER IF EXISTS trg_deposito_principal_unico_update ON depositos;
CREATE TRIGGER trg_deposito_principal_unico_update
  BEFORE UPDATE ON depositos
  FOR EACH ROW EXECUTE FUNCTION validate_deposito_principal_unico();

-- ============================================================
-- VERIFICACION MANUAL (NO ejecutar como parte de esta migracion —
-- correr a mano en un branch de desarrollo de Supabase despues de
-- aplicar el bloque de arriba). Ver detalle completo con casos
-- positivos y negativos en el reporte de apply de esta fase
-- (change `deposito-unico-principal`, Phase 4).
--
-- Resumen rapido:
--   1. INSERT primer deposito con es_principal=FALSE  -> debe RECHAZAR
--   2. INSERT segundo deposito con es_principal=FALSE -> debe PERMITIR
--   3. UPDATE que deja el unico activo con es_principal=FALSE -> RECHAZAR
--   4. UPDATE que desactiva un deposito (habiendo otro principal activo)
--      -> debe PERMITIR
-- ============================================================
