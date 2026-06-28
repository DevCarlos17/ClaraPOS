-- Migration 0067: Permitir DELETE en proveedores_bancos
-- Los bancos de proveedores pueden ser eliminados por usuarios autenticados.
-- PowerSync sube los DELETEs locales; sin esta política se bloqueaban con RLS.

CREATE POLICY "proveedores_bancos_delete"
  ON proveedores_bancos
  FOR DELETE
  TO authenticated
  USING (true);
