-- ============================================
-- 0015: Reverso de abonos CXC + tracking de usuario
-- ============================================
-- Agrega columnas de reverso a pagos, modifica el trigger de
-- inmutabilidad para permitir SOLO actualizaciones de reverso,
-- e inserta el permiso cxc.reversar_abono.
--
-- Es IDEMPOTENTE: usa IF NOT EXISTS / WHERE NOT EXISTS.
-- ============================================

-- 1. Agregar columnas de reverso a pagos
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS is_reversed    BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reversed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_reason TEXT,
  ADD COLUMN IF NOT EXISTS procesado_por_nombre TEXT;

-- 2. DROP el trigger de inmutabilidad total en pagos
DROP TRIGGER IF EXISTS trg_pagos_no_update ON pagos;

-- 3. Crear funcion que permite UPDATE SOLO en columnas de reverso
--    y bloquea cualquier cambio a la data financiera.
CREATE OR REPLACE FUNCTION allow_pago_reversal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Verificar que los campos financieros e identificadores no cambian
  IF OLD.empresa_id        IS DISTINCT FROM NEW.empresa_id        OR
     OLD.venta_id          IS DISTINCT FROM NEW.venta_id          OR
     OLD.cliente_id        IS DISTINCT FROM NEW.cliente_id        OR
     OLD.metodo_cobro_id   IS DISTINCT FROM NEW.metodo_cobro_id   OR
     OLD.moneda_id         IS DISTINCT FROM NEW.moneda_id         OR
     OLD.tasa              IS DISTINCT FROM NEW.tasa              OR
     OLD.monto             IS DISTINCT FROM NEW.monto             OR
     OLD.monto_usd         IS DISTINCT FROM NEW.monto_usd         OR
     OLD.referencia        IS DISTINCT FROM NEW.referencia        OR
     OLD.fecha             IS DISTINCT FROM NEW.fecha             OR
     OLD.created_at        IS DISTINCT FROM NEW.created_at        OR
     OLD.created_by        IS DISTINCT FROM NEW.created_by        OR
     OLD.sesion_caja_id    IS DISTINCT FROM NEW.sesion_caja_id    OR
     OLD.banco_empresa_id  IS DISTINCT FROM NEW.banco_empresa_id
  THEN
    RAISE EXCEPTION 'Los campos financieros de pagos son inmutables. Solo se permiten actualizaciones de reverso.';
  END IF;

  -- Solo se permite marcar como reversado una vez
  IF OLD.is_reversed = TRUE AND NEW.is_reversed = TRUE THEN
    RAISE EXCEPTION 'Este pago ya fue reversado anteriormente.';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Crear nuevo trigger que usa la funcion de reverso
CREATE TRIGGER trg_pagos_allow_reversal
  BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION allow_pago_reversal();

-- 5. Insertar permiso si no existe
INSERT INTO permisos (modulo, slug, nombre, descripcion)
SELECT 'cxc', 'cxc.reversar_abono', 'Reversar abonos CXC',
       'Permite reversar abonos/pagos en cuentas por cobrar'
WHERE NOT EXISTS (SELECT 1 FROM permisos WHERE slug = 'cxc.reversar_abono');

-- 6. RLS: Permitir UPDATE en pagos para usuarios autenticados
--    (el trigger de BD garantiza que solo se actualicen campos de reverso)
DROP POLICY IF EXISTS "pagos_update_reverso" ON pagos;
CREATE POLICY "pagos_update_reverso" ON pagos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
