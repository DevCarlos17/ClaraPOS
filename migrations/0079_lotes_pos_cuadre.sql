-- Migración 0079: Lotes de punto de venta (POS) + toggle de consolidación
--
-- Contexto:
--   Los métodos de cobro tipo 'PUNTO' (terminal POS) liquidan por lote/batch
--   del procesador (Banesco/Mercantil), no por el total registrado en `pagos`.
--   Esta migración crea la tabla de trabajo pre-cierre `lotes_pos_cuadre` donde
--   el cajero carga cada lote (nro_lote + monto) antes de cerrar la sesión, y
--   agrega `metodos_cobro.consolidar_lotes` para decidir en el cierre si esos
--   lotes se consolidan en UN traspaso a Tesorería o se envían UNO POR LOTE.
--
--   Esta tabla es dato de trabajo pre-cierre (editable/borrable por el cajero
--   mientras la sesión está ABIERTA), NO un libro inmutable como el Kardex o
--   las tasas de cambio — por eso no lleva trigger anti-UPDATE/DELETE y su RLS
--   sí permite las 4 operaciones (patrón 0035, `current_empresa_id()`).
--
--   Referencia de diseño: openspec/conciliacion-lotes-pos/design.md (PR-B).

CREATE TABLE IF NOT EXISTS lotes_pos_cuadre (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sesion_caja_id UUID NOT NULL REFERENCES sesiones_caja(id),
  metodo_cobro_id UUID NOT NULL REFERENCES metodos_cobro(id),
  moneda_id UUID NOT NULL REFERENCES monedas(id),
  nro_lote TEXT NOT NULL,
  monto NUMERIC(18,4) NOT NULL CHECK (monto > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_lote_pos_metodo_sesion UNIQUE (empresa_id, metodo_cobro_id, sesion_caja_id, nro_lote)
);

CREATE INDEX IF NOT EXISTS idx_lotes_pos_empresa ON lotes_pos_cuadre(empresa_id);
CREATE INDEX IF NOT EXISTS idx_lotes_pos_sesion ON lotes_pos_cuadre(sesion_caja_id);
CREATE INDEX IF NOT EXISTS idx_lotes_pos_metodo ON lotes_pos_cuadre(metodo_cobro_id);

DROP TRIGGER IF EXISTS trg_lotes_pos_cuadre_updated ON lotes_pos_cuadre;
CREATE TRIGGER trg_lotes_pos_cuadre_updated BEFORE UPDATE ON lotes_pos_cuadre
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Sin trigger anti-UPDATE/DELETE: dato de trabajo pre-cierre, no inmutable.

ALTER TABLE lotes_pos_cuadre ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_empresa" ON lotes_pos_cuadre;
CREATE POLICY "select_own_empresa" ON lotes_pos_cuadre FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "insert_own_empresa" ON lotes_pos_cuadre;
CREATE POLICY "insert_own_empresa" ON lotes_pos_cuadre FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "update_own_empresa" ON lotes_pos_cuadre;
CREATE POLICY "update_own_empresa" ON lotes_pos_cuadre FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "delete_own_empresa" ON lotes_pos_cuadre;
CREATE POLICY "delete_own_empresa" ON lotes_pos_cuadre FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- Agregar a publicacion de PowerSync (patrón 0035/0025 para tablas nuevas).
-- Envuelto en DO block para ser idempotente (ALTER PUBLICATION no soporta
-- IF NOT EXISTS): sin esto, re-ejecutar la migracion fallaria con
-- "relation is already member of publication".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'lotes_pos_cuadre'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE lotes_pos_cuadre;
  END IF;
END $$;

-- ============================================
-- consolidar_lotes en metodos_cobro
-- TRUE (default) = un solo traspaso consolidado por método al cerrar.
-- FALSE = un traspaso por cada lote (comisión calculada por lote).
-- ============================================

ALTER TABLE metodos_cobro ADD COLUMN IF NOT EXISTS consolidar_lotes BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE metodos_cobro SET consolidar_lotes = TRUE WHERE consolidar_lotes IS NULL;
