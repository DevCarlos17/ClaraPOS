-- ============================================================
-- 0065_protect_plan_cuentas.sql
-- Protege el plan de cuentas inicial contra modificaciones no permitidas:
--
-- Regla 1: Las cuentas del seed (created_by IS NULL) no pueden eliminarse.
-- Regla 2: Las cuentas vinculadas al sistema (en cuentas_config) no pueden
--          desactivarse (is_active TRUE → FALSE).
--
-- Las demás cuentas del seed SÍ pueden desactivarse (ej: viáticos).
-- Todas las cuentas creadas por usuarios pueden eliminarse (con las
-- restricciones de gastos registrados que ya existían).
-- ============================================================

CREATE OR REPLACE FUNCTION protect_plan_cuentas()
RETURNS TRIGGER AS $$
BEGIN

  -- ── Regla 1: no eliminar cuentas del seed ─────────────────
  IF TG_OP = 'DELETE' THEN
    IF OLD.created_by IS NULL THEN
      RAISE EXCEPTION
        'No se puede eliminar esta cuenta: es parte del plan contable inicial del sistema. Podés desactivarla si no la usás.';
    END IF;
    RETURN OLD;
  END IF;

  -- ── Regla 2: no desactivar cuentas del sistema ────────────
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
      IF EXISTS (
        SELECT 1 FROM cuentas_config
        WHERE cuenta_contable_id = OLD.id
        LIMIT 1
      ) THEN
        RAISE EXCEPTION
          'No se puede desactivar esta cuenta: está vinculada a una operación automática del sistema (diferencial cambiario, mermas, comisiones, etc.).';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_plan_cuentas ON plan_cuentas;

CREATE TRIGGER trg_protect_plan_cuentas
  BEFORE DELETE OR UPDATE ON plan_cuentas
  FOR EACH ROW
  EXECUTE FUNCTION protect_plan_cuentas();
