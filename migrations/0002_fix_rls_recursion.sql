-- ============================================
-- FIX: Recursion infinita en RLS policies
-- ============================================
-- Problema: Las policies sobre `usuarios` consultan `usuarios` a si misma
-- (`SELECT empresa_id FROM usuarios WHERE id = auth.uid()`) lo que dispara
-- la misma policy en cada subquery -> error 42P17 "infinite recursion".
--
-- Como TODAS las demas tablas tambien usan ese mismo subquery, el RLS de
-- toda la base de datos esta roto.
--
-- Solucion: Crear una funcion SECURITY DEFINER que devuelve el empresa_id
-- del usuario actual. SECURITY DEFINER ignora RLS, rompiendo la recursion.
--
-- Este script es DEFENSIVO: cada bloque verifica si la tabla existe antes
-- de tocarla, asi puedes correrlo en cualquier estado de la base.
-- Tambien es IDEMPOTENTE: lo puedes correr varias veces sin danio.
-- ============================================

-- ============================================
-- 1. Funcion helper SECURITY DEFINER
-- ============================================
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

-- ============================================
-- 2. usuarios (la causa raiz de la recursion)
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.usuarios') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa_users" ON usuarios';
    EXECUTE 'DROP POLICY IF EXISTS "update_own_empresa_users" ON usuarios';
    EXECUTE 'CREATE POLICY "select_own_empresa_users" ON usuarios FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "update_own_empresa_users" ON usuarios FOR UPDATE TO authenticated USING (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 3. empresas
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.empresas') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON empresas';
    EXECUTE 'DROP POLICY IF EXISTS "update_own_empresa" ON empresas';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON empresas FOR SELECT TO authenticated USING (id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "update_own_empresa" ON empresas FOR UPDATE TO authenticated USING (id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 4. tasas_cambio
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.tasas_cambio') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON tasas_cambio';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON tasas_cambio';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON tasas_cambio FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON tasas_cambio FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 5. departamentos
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.departamentos') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON departamentos';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON departamentos';
    EXECUTE 'DROP POLICY IF EXISTS "update_own_empresa" ON departamentos';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON departamentos FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON departamentos FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "update_own_empresa" ON departamentos FOR UPDATE TO authenticated USING (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 6. productos
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.productos') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON productos';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON productos';
    EXECUTE 'DROP POLICY IF EXISTS "update_own_empresa" ON productos';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON productos FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON productos FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "update_own_empresa" ON productos FOR UPDATE TO authenticated USING (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 7. recetas
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.recetas') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON recetas';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON recetas';
    EXECUTE 'DROP POLICY IF EXISTS "delete_own_empresa" ON recetas';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON recetas FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON recetas FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "delete_own_empresa" ON recetas FOR DELETE TO authenticated USING (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 8. movimientos_inventario
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.movimientos_inventario') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON movimientos_inventario';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON movimientos_inventario';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON movimientos_inventario FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON movimientos_inventario FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 9. metodos_pago
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.metodos_pago') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON metodos_pago';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON metodos_pago';
    EXECUTE 'DROP POLICY IF EXISTS "update_own_empresa" ON metodos_pago';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON metodos_pago FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON metodos_pago FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "update_own_empresa" ON metodos_pago FOR UPDATE TO authenticated USING (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 10. clientes
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.clientes') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON clientes';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON clientes';
    EXECUTE 'DROP POLICY IF EXISTS "update_own_empresa" ON clientes';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON clientes FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON clientes FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "update_own_empresa" ON clientes FOR UPDATE TO authenticated USING (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 11. movimientos_cuenta
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.movimientos_cuenta') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON movimientos_cuenta';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON movimientos_cuenta';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON movimientos_cuenta FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON movimientos_cuenta FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 12. ventas
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.ventas') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON ventas';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON ventas';
    EXECUTE 'DROP POLICY IF EXISTS "update_own_empresa" ON ventas';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON ventas FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON ventas FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "update_own_empresa" ON ventas FOR UPDATE TO authenticated USING (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 13. detalle_venta
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.detalle_venta') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON detalle_venta';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON detalle_venta';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON detalle_venta FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON detalle_venta FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 14. pagos
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.pagos') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON pagos';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON pagos';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON pagos FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON pagos FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 15. notas_credito
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.notas_credito') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON notas_credito';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON notas_credito';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON notas_credito FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON notas_credito FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 16. proveedores
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.proveedores') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON proveedores';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON proveedores';
    EXECUTE 'DROP POLICY IF EXISTS "update_own_empresa" ON proveedores';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON proveedores FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON proveedores FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "update_own_empresa" ON proveedores FOR UPDATE TO authenticated USING (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 17. compras (puede no existir aun)
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.compras') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON compras';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON compras';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON compras FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON compras FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- 18. detalle_compra (puede no existir aun)
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.detalle_compra') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "select_own_empresa" ON detalle_compra';
    EXECUTE 'DROP POLICY IF EXISTS "insert_own_empresa" ON detalle_compra';
    EXECUTE 'CREATE POLICY "select_own_empresa" ON detalle_compra FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id())';
    EXECUTE 'CREATE POLICY "insert_own_empresa" ON detalle_compra FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id())';
  END IF;
END $$;

-- ============================================
-- VERIFICACION
-- ============================================
-- Despues de ejecutar, verifica con:
--
--   SELECT public.current_empresa_id();
--
-- Debe devolver el UUID de la empresa del usuario logueado.
-- Si devuelve NULL, significa que no estas logueado en el SQL Editor.
-- ============================================
