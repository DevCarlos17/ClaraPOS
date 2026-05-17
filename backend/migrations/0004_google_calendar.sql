-- =============================================
-- MIGRACION 0004: Integracion Google Calendar
-- Aplicar desde Supabase Dashboard > SQL Editor
-- =============================================

-- =============================================
-- TABLA: google_calendar_tokens
-- Tokens OAuth por usuario (NO sincronizada a PowerSync)
-- =============================================
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_tokens_usuario ON google_calendar_tokens(usuario_id);
CREATE INDEX IF NOT EXISTS idx_google_tokens_empresa ON google_calendar_tokens(empresa_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_google_tokens_updated ON google_calendar_tokens;
CREATE TRIGGER trg_google_tokens_updated
  BEFORE UPDATE ON google_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- RLS: Solo el propio usuario puede ver/modificar sus tokens
-- Las Edge Functions usan service_role, que bypasea RLS
-- =============================================
ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_tokens_select_own" ON google_calendar_tokens
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

CREATE POLICY "google_tokens_insert_service" ON google_calendar_tokens
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "google_tokens_update_service" ON google_calendar_tokens
  FOR UPDATE TO service_role USING (true);

CREATE POLICY "google_tokens_delete_service" ON google_calendar_tokens
  FOR DELETE TO service_role USING (true);
