-- ============================================
-- 0011: Agregar telefono a usuarios
-- ============================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono TEXT;

-- Actualizar handle_new_user() para leer telefono de user_metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nombre, empresa_id, rol_id, telefono)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
    (NEW.raw_user_meta_data->>'empresa_id')::UUID,
    (NEW.raw_user_meta_data->>'rol_id')::UUID,
    NEW.raw_user_meta_data->>'telefono'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
