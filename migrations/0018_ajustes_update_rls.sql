-- Migracion 0018: Politica RLS UPDATE para tabla ajustes
-- Sin esta politica, PowerSync descarta el UPDATE con error 42501 (insufficient privilege)
-- y en el proximo sync el servidor sobreescribe el estado local, revirtiendo a BORRADOR.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ajustes' AND policyname = 'update_own_empresa'
  ) THEN
    CREATE POLICY "update_own_empresa" ON ajustes
      FOR UPDATE TO authenticated
      USING (empresa_id = public.current_empresa_id());
  END IF;
END $$;
