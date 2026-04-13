-- ============================================
-- 0012: Fix inventario_stock RLS + trigger SECURITY DEFINER
-- ============================================
-- Problema: el trigger trg_kardex_update_stock (AFTER INSERT en movimientos_inventario)
-- intenta INSERT/UPDATE en inventario_stock, pero esa tabla solo tiene policy de SELECT.
-- Esto causa error 42501 (insufficient privilege) que PowerSync trata como fatal,
-- descartando la operacion y haciendo que los registros "desaparezcan".
--
-- Solucion:
-- 1. Hacer la funcion del trigger SECURITY DEFINER (bypassa RLS)
-- 2. Agregar policies de INSERT/UPDATE como respaldo

-- 1. Recrear funcion con SECURITY DEFINER
CREATE OR REPLACE FUNCTION actualizar_inventario_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO inventario_stock (empresa_id, producto_id, deposito_id, cantidad_actual)
  VALUES (NEW.empresa_id, NEW.producto_id, NEW.deposito_id,
    CASE WHEN NEW.tipo = 'E' THEN NEW.cantidad ELSE -NEW.cantidad END)
  ON CONFLICT (empresa_id, producto_id, deposito_id)
  DO UPDATE SET
    cantidad_actual = inventario_stock.cantidad_actual +
      CASE WHEN NEW.tipo = 'E' THEN NEW.cantidad ELSE -NEW.cantidad END,
    updated_at = NOW();

  UPDATE productos SET stock = (
    SELECT COALESCE(SUM(cantidad_actual), 0)
    FROM inventario_stock
    WHERE producto_id = NEW.producto_id AND empresa_id = NEW.empresa_id
  ) WHERE id = NEW.producto_id;

  RETURN NEW;
END;
$$;

-- 2. Agregar policies faltantes en inventario_stock (INSERT + UPDATE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inventario_stock' AND policyname = 'insert_own_empresa'
  ) THEN
    CREATE POLICY "insert_own_empresa" ON inventario_stock FOR INSERT TO authenticated
      WITH CHECK (empresa_id = public.current_empresa_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inventario_stock' AND policyname = 'update_own_empresa'
  ) THEN
    CREATE POLICY "update_own_empresa" ON inventario_stock FOR UPDATE TO authenticated
      USING (empresa_id = public.current_empresa_id())
      WITH CHECK (empresa_id = public.current_empresa_id());
  END IF;
END;
$$;
