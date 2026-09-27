-- =============================================================================
-- Migration: 0095_fix_nota_credito_precision_compare.sql
-- Created:   2026-09-20
-- Depends:   0094_fix_nota_credito_sum_self_count.sql
--
-- BUG (fuga de precision decimal en el guard de notas_credito):
--   `validate_nota_credito_insert()` (cuerpo vigente en 0094:56-82) declara sus
--   variables locales como NUMERIC(12,2):
--       v_total_venta         NUMERIC(12,2);
--       v_total_nc_existentes NUMERIC(12,2);
--   El `SELECT total_usd INTO v_total_venta` REDONDEA implicitamente el total de
--   la venta a 2 decimales, pero `NEW.total_usd` entra en la comparacion con su
--   precision completa (8 decimales). Las columnas reales `ventas.total_usd` y
--   `notas_credito.total_usd` fueron ampliadas a NUMERIC(20,8) en
--   0058_decimal_precision.sql (:131, :163) — las variables del trigger nunca se
--   actualizaron para acompanar ese cambio.
--
--   Efecto: para cualquier venta cuyo total tenga digitos mas alla del 2do
--   decimal (legitimo por CLAUDE.md regla #10: precision_calc=8 en calculo/
--   almacenamiento, precision_view=2 solo para display, "redondear solo al final
--   de la cadena"), una NC de tipo TOTAL copia `venta.total_usd` verbatim
--   (use-notas-credito.ts:916-917, sin aritmetica) y el trigger compara ese
--   valor de 8 decimales contra una copia de SI MISMO redondeada a 2 decimales.
--   La comparacion `NEW.total_usd > v_total_venta` da verdadero por una fraccion
--   de centavo y lanza RAISE EXCEPTION para una NC 100% legitima:
--       'La suma de notas de credito ($2.69004000) excede el total de la
--        venta ($2.69)'
--
--   Es un bug GENERICO a las 5 modalidades y a AMBOS modales (POS + admin), no
--   introducido por ningun slice de UI: el motor `crearNotaCredito` y esta
--   migracion son anteriores. Se descubrio al conectar "Devolver dinero" en el
--   POS (change unificacion-modal-nc, Slice 4), pero afecta cualquier NC TOTAL
--   sobre una venta con total no-exacto a 2 decimales.
--
-- FIX:
--   Declarar las variables locales como NUMERIC(20,8) para que igualen la
--   precision de las columnas de origen (ventas.total_usd / notas_credito.
--   total_usd, ambas NUMERIC(20,8) desde 0058). Asi la comparacion se hace a la
--   MISMA escala, sin redondeo asimetrico. Se preserva el fix de 0094
--   (`AND id <> NEW.id`, exclusion de la propia fila en reintentos idempotentes
--   de PowerSync) — este cambio SOLO ajusta la precision de las variables, no la
--   logica del guard.
--
-- ALCANCE DELIBERADO: esta migracion corrige UNICAMENTE el trigger de
--   notas_credito. Existen otras variables NUMERIC(12,2) vivas en funciones de
--   trigger (0001_initial_schema.sql:566/568 v_total_usd/v_total_bs;
--   0089_repair_saldo_actual_saf.sql:66 running) con semantica distinta —
--   quedan como riesgo latente documentado para una barrida futura, NO se tocan
--   aqui para no cambiar comportamiento financiero fuera del bug reportado.
--
-- IDEMPOTENT: `CREATE OR REPLACE FUNCTION` — seguro de re-ejecutar. No se dropea
--   el trigger (`trg_validate_nota_credito_insert`, definido en 0006_ventas.sql),
--   solo se reemplaza el cuerpo de la funcion que ya usa.
--
-- DEPLOY ORDER (manual, Supabase SQL Editor): aplicar DESPUES de 0094.
--
-- ROLLBACK: re-aplicar el cuerpo de 0094 (variables NUMERIC(12,2)) — no
--   recomendado, reintroduce la fuga de precision.
--
-- VERIFICACION MANUAL (no hay pgTAP/testcontainers en el proyecto):
--   -- venta.total_usd = 2.69004000
--   INSERT INTO notas_credito (id, venta_id, total_usd, ...)
--     VALUES ('nc-p', 'venta-x', 2.69004000, ...);   -- ANTES: lanzaba. AHORA: OK.
--   -- guard contra sobre-acreditacion sigue intacto:
--   -- venta.total_usd = 10.00
--   INSERT ... ('nc-a', 'venta-y', 7.00, ...);        -- OK
--   INSERT ... ('nc-b', 'venta-y', 5.00, ...);        -- DEBE seguir lanzando
--                                                     -- (7 + 5 = 12 > 10)
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_nota_credito_insert()
RETURNS TRIGGER AS $$
DECLARE
  -- NUMERIC(20,8) para igualar la precision real de las columnas de origen
  -- (ventas.total_usd / notas_credito.total_usd, ampliadas en 0058). Antes eran
  -- NUMERIC(12,2), lo que redondeaba el total de la venta a 2 decimales y
  -- rompia la comparacion contra NEW.total_usd de 8 decimales.
  v_total_venta NUMERIC(20,8);
  v_total_nc_existentes NUMERIC(20,8);
BEGIN
  SELECT total_usd INTO v_total_venta
  FROM ventas WHERE id = NEW.venta_id;

  -- Excluye la propia fila (`id <> NEW.id`): en un INSERT normal es un no-op
  -- (la fila con NEW.id aun no existe); en un reintento de PowerSync
  -- (`INSERT ... ON CONFLICT (id) DO NOTHING`) evita contar la fila ya
  -- comprometida en el intento anterior como "existente" ademas de sumarla
  -- de nuevo via NEW.total_usd mas abajo. (Fix heredado de 0094, intacto.)
  SELECT COALESCE(SUM(total_usd), 0) INTO v_total_nc_existentes
  FROM notas_credito WHERE venta_id = NEW.venta_id AND id <> NEW.id;

  -- NEW.total_usd se suma UNA sola vez aqui — el guard contra dos NC DISTINTAS
  -- que en conjunto excedan el total de la venta sigue intacto. La comparacion
  -- ahora ocurre a NUMERIC(20,8) en ambos lados (sin redondeo asimetrico).
  IF (v_total_nc_existentes + NEW.total_usd) > v_total_venta THEN
    RAISE EXCEPTION 'La suma de notas de credito ($%) excede el total de la venta ($%)',
      (v_total_nc_existentes + NEW.total_usd), v_total_venta;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
