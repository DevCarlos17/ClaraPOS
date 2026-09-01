-- ============================================================
-- 0087_deposito_inactivo_guard.sql
-- Guarda de Deposito Inactivo en movimientos_inventario (Kardex):
-- defensa en profundidad, DB como 3ra capa (mismo estilo que 0086)
--
-- PROBLEMA (QA post-merge PR#57, change `guarda-deposito-inactivo`):
-- `depositos.is_active=0` era decorativo — nada en la DB impedia insertar
-- un movimiento de kardex (entrada o salida) hacia un deposito inactivo via
-- escritura cruda (SQL Editor / API directa), bypaseando la UI y los hooks
-- de la app (`crearVenta`, `crearNotaCredito`).
--
-- INVARIANTE:
-- Ningun `movimientos_inventario` puede insertarse con `deposito_id` que
-- apunte a un deposito con `is_active=FALSE`.
--
-- 3 CAPAS (este archivo es la 3ra, defensa en profundidad — la fuente de
-- verdad real es la app):
--   1. UI (deposito-list.tsx): transparencia de uso + reasignacion
--      proactiva de cajas antes de desactivar un deposito (Slice A).
--   2. Hook (capa app, fuente de verdad):
--        - `crearVenta` (use-ventas.ts): hard-throw si el deposito
--          resuelto de la caja activa esta `is_active=0` — bloquea la
--          venta ANTES de tocar stock (decision de producto #2).
--        - `crearNotaCredito` (use-notas-credito.ts, flujo POS-express):
--          resuelve el reingreso via `resolveDepositoReingresoNcr` —
--          origen si sigue activo, si no el principal actual — SIEMPRE
--          ANTES de construir el INSERT de kardex (decision de producto #3).
--   3. DB (este trigger, `validate_movimiento_inventario_insert` — MISMA
--      funcion que ya validaba consistencia matematica del kardex desde
--      0004_inventario.sql): reject-only, RAISE EXCEPTION, NUNCA hace
--      auto-correccion de NEW. Es la unica capa inevitable — cubre
--      escrituras crudas via SQL Editor / API que bypasean UI y hooks
--      (spec scenario "Escritura cruda rechazada").
--
-- CONVENCION: mismo patron idempotente que 0086_deposito_unico_principal.sql
-- (CREATE OR REPLACE FUNCTION ... RETURNS TRIGGER + DROP TRIGGER IF EXISTS +
-- CREATE TRIGGER), RAISE EXCEPTION en espanol, RETURN NEW al final. Se
-- EXTIENDE la funcion existente (no se crea una nueva) para no duplicar
-- triggers BEFORE INSERT sobre la misma tabla — las validaciones de
-- consistencia matematica (entrada/salida, stock no negativo) de 0004 se
-- PRESERVAN sin cambios; el chequeo de `is_active` se agrega al final,
-- antes del `RETURN NEW`.
--
-- ORDEN TRIGGER VS FALLBACK DE NCR — CRITICO, documentado aqui (Decision de
-- diseno #5 de `guarda-deposito-inactivo`, ver design.md):
-- La app SIEMPRE resuelve el deposito ACTIVO (origen si sigue activo, si no
-- el principal) ANTES de construir el INSERT de `movimientos_inventario`
-- (ver `resolveDepositoReingresoNcr` en
-- src/features/inventario/lib/deposito-inactivo.ts, usado por
-- `crearNotaCredito`; y el guard de `crearVenta` que bloquea ANTES de
-- resolver cualquier INSERT). Por lo tanto, el `NEW.deposito_id` que este
-- trigger evalua NUNCA es un deposito inactivo en el camino normal de
-- fallback de NCR ni en ninguna venta exitosa — el trigger jamas rechaza un
-- fallback legitimo ni una venta normal. Este trigger SOLO dispara ante
-- escrituras crudas que bypasean los hooks (ej. INSERT manual via SQL
-- Editor apuntando directamente a un deposito inactivo). NO intentar
-- "detectar la intencion" de un fallback en este trigger — no hay forma de
-- distinguirlo desde la DB; la garantia viene del ORDEN de resolucion en la
-- app (resolver -> luego escribir), no de logica adicional aqui.
-- ============================================================

CREATE OR REPLACE FUNCTION validate_movimiento_inventario_insert()
RETURNS TRIGGER AS $$
DECLARE
  deposito_activo BOOLEAN;
BEGIN
  IF NEW.tipo = 'E' THEN
    IF ABS(NEW.stock_nuevo - (NEW.stock_anterior + NEW.cantidad)) > 0.001 THEN
      RAISE EXCEPTION 'Inconsistencia en kardex entrada: % + % != %',
        NEW.stock_anterior, NEW.cantidad, NEW.stock_nuevo;
    END IF;
  ELSIF NEW.tipo = 'S' THEN
    IF ABS(NEW.stock_nuevo - (NEW.stock_anterior - NEW.cantidad)) > 0.001 THEN
      RAISE EXCEPTION 'Inconsistencia en kardex salida: % - % != %',
        NEW.stock_anterior, NEW.cantidad, NEW.stock_nuevo;
    END IF;
    IF NEW.stock_nuevo < -0.001 THEN
      RAISE EXCEPTION 'Stock no puede quedar negativo: %', NEW.stock_nuevo;
    END IF;
  END IF;

  -- Guarda de deposito inactivo (change `guarda-deposito-inactivo`,
  -- requirement "Guardia DB — Rechazo de Movimiento Hacia Deposito
  -- Inactivo"): ningun movimiento de kardex, entrada o salida, puede
  -- apuntar a un deposito con is_active=FALSE.
  SELECT is_active INTO deposito_activo FROM depositos WHERE id = NEW.deposito_id;

  IF deposito_activo IS FALSE THEN
    RAISE EXCEPTION 'No se puede registrar un movimiento de inventario hacia un deposito inactivo';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_movimiento_inventario_insert ON movimientos_inventario;
CREATE TRIGGER trg_validate_movimiento_inventario_insert
  BEFORE INSERT ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION validate_movimiento_inventario_insert();

-- ============================================================
-- VERIFICACION MANUAL (NO ejecutar como parte de esta migracion — correr a
-- mano en un branch de desarrollo de Supabase despues de aplicar el bloque
-- de arriba). Ver detalle completo con casos positivos y negativos en el
-- reporte de apply de esta fase (change `guarda-deposito-inactivo`, Slice B).
--
-- Resumen rapido:
--   1. INSERT movimientos_inventario hacia deposito con is_active=FALSE
--      -> debe RECHAZAR ("No se puede registrar un movimiento...")
--   2. INSERT movimientos_inventario hacia deposito con is_active=TRUE
--      -> debe PERMITIR (comportamiento normal, sin cambios)
--   3. Fallback NCR ya resuelto (INSERT hacia el deposito PRINCIPAL activo,
--      simulando que el origen estaba inactivo) -> debe PERMITIR (el
--      trigger nunca ve el deposito de origen inactivo en este camino)
--   4. Las validaciones pre-existentes (inconsistencia matematica de
--      kardex, stock negativo) -> deben seguir RECHAZANDO exactamente
--      igual que antes de esta migracion (no regresion)
-- ============================================================
