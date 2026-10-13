-- =============================================================================
-- Migration: 0107_backfill_ventas_estado.sql
-- Created:   2026-10-13
-- Depends:   0106_ventas_estado_column.sql (columna `ventas.estado` +
--            indice `idx_mov_cuenta_venta` + triggers prevent_venta_mutation()
--            [UPDATE/DELETE] y derive_venta_estado_insert() [INSERT])
--
-- CONTEXTO (ver openspec/changes/cxc-sync-snapshot-redesign/design.md §7):
--   0106 agrego `ventas.estado` con `DEFAULT 'pendiente'`. Un `ALTER TABLE
--   ... ADD COLUMN ... DEFAULT` en Postgres NO dispara triggers de fila por
--   cada registro existente — simplemente escribe el default en el catalogo
--   y, para filas preexistentes, lo materializa sin pasar por
--   `prevent_venta_mutation()` ni por `derive_venta_estado_insert()`. Efecto:
--   TODA venta creada antes de 0106 quedo en `estado='pendiente'` sin
--   importar su estado real de cobranza (pagada, parcial, reversada).
--
--   Validacion manual en staging (Engram #5420, owner, BEGIN/ROLLBACK)
--   confirmo el sintoma exacto esperado: la query de §6 encontro 48 filas
--   FAIL de 51 totales — las 48 son facturas ya pagadas/parciales/reversadas
--   que la migracion 0106 dejo encasilladas en el default; las 3 PASS son
--   las que de verdad estan pendientes. Esas 48 filas son precisamente las
--   que este backfill corrige. El numero exacto de filas afectadas es
--   especifico de cada ambiente (staging/produccion tendran distinto
--   historico) — lo relevante es el patron, no el conteo literal.
--
-- QUE HACE ESTA MIGRACION:
--   Re-deriva `ventas.estado` para TODA fila existente a partir de su
--   ultimo movimiento en `movimientos_cuenta` (misma formula que el trigger
--   `prevent_venta_mutation()` de 0106 y que `calcularEstadoVenta()` en
--   `src/features/cxc/lib/estado-venta.ts` — las tres implementaciones
--   deben permanecer en paridad, ver design.md §9):
--
--     CASE
--       WHEN last.tipo = 'REV' AND saldo_pend_usd > 0.005 THEN 'reversado'
--       WHEN saldo_pend_usd <= 0.005                      THEN 'pago'
--       WHEN saldo_pend_usd >= total_usd - 0.005           THEN 'pendiente'
--       ELSE                                                    'parcial'
--     END
--
--   `last` = el movimiento mas reciente de `movimientos_cuenta` para esa
--   `venta_id` (`ORDER BY fecha DESC, created_at DESC, id DESC LIMIT 1`,
--   mismo orden que el indice `idx_mov_cuenta_venta` de 0106).
--
--   Es de SOLO LECTURA sobre `movimientos_cuenta` (unicamente SELECT/JOIN
--   dentro de la subquery `sub`) — nunca se inserta, actualiza ni borra una
--   fila de esa tabla (ademas esta protegida por
--   `trg_kardex_no_update`/`trg_kardex_no_delete`, asi que ni podria). La
--   UNICA tabla mutada es `ventas`, y unicamente su columna `estado`.
--
--   IDEMPOTENTE: el `WHERE v.estado IS DISTINCT FROM sub.estado_calc` hace
--   que re-ejecutar este archivo despues de haber hecho COMMIT sea un
--   no-op (0 filas actualizadas) — confirmable repitiendo el script
--   completo una segunda vez (ver tambien tarea 2.4 de tasks.md).
--
-- ANALISIS DE INTERFERENCIA CON prevent_venta_mutation() (CRITICO — leer
-- antes de ejecutar; verificado contra el cuerpo real del trigger en
-- migrations/0106_ventas_estado_column.sql lineas 134-184, no supuesto):
--
--   `prevent_venta_mutation()` es `BEFORE UPDATE OR DELETE ON ventas`. El
--   UPDATE de este backfill solo escribe `estado` — nunca toca
--   `saldo_pend_usd`, `status`, ni ninguna de las columnas congeladas
--   (`nro_factura`, `cliente_id`, `total_usd`, `total_bs`, `tasa`, `tipo`,
--   `deposito_id`, `total_exento_usd`, `total_base_usd`, `total_iva_usd`,
--   `total_igtf_usd`). Recorrido guard-por-guard del trigger para esta
--   UPDATE especifica:
--     1. Guard de columnas congeladas: todas evaluan `NEW.x IS DISTINCT
--        FROM OLD.x` → FALSE (ninguna cambia) → no dispara excepcion.
--     2. Guard de transicion de `status`: `NEW.status IS DISTINCT FROM
--        OLD.status` → FALSE (no se toca `status`) → bloque completo
--        saltado.
--     3. Guard de techo de `saldo_pend_usd`: `NEW.saldo_pend_usd >
--        OLD.saldo_pend_usd` → FALSE (`NEW.saldo_pend_usd = OLD.saldo_pend_usd`,
--        no se toca esa columna) → no dispara excepcion.
--     4. Bloque de derivacion de `estado` (el que podria pisar el valor de
--        este backfill): esta GATEADO por `IF NEW.saldo_pend_usd IS
--        DISTINCT FROM OLD.saldo_pend_usd THEN ...`. Como este backfill NO
--        modifica `saldo_pend_usd`, esa condicion es FALSE y el bloque
--        completo (incluido el `NEW.estado := CASE ...`) se SALTA. El
--        trigger llega directo a `RETURN NEW;` con el `NEW.estado` que este
--        backfill asigno, intacto.
--   CONCLUSION: el backfill SOBREVIVE al trigger — `prevent_venta_mutation()`
--   no revierte ni recalcula el valor que este UPDATE escribe, porque su
--   unico punto de recalculo de `estado` esta condicionado a un cambio en
--   `saldo_pend_usd` que este backfill nunca produce. No se requiere
--   `DISABLE TRIGGER` ni ningun bypass.
--
-- COMO EJECUTAR (owner, manual, Supabase SQL editor — tasks.md 2.2-2.4,
-- NO ejecutado por el apply de este cambio, sin acceso a DB real):
--   1. Correr el bloque completo tal cual esta abajo (BEGIN; UPDATE; SELECT
--      de validacion; ROLLBACK;) en una sola pasada.
--   2. Inspeccionar la columna `resultado` de la query de validacion: debe
--      ser 100% 'PASS'. Si hay algun 'FAIL', NO continuar — investigar antes
--      de reintentar (puede indicar datos no contemplados por la formula,
--      p.ej. una `venta_id` sin ninguna fila en `movimientos_cuenta`, caso
--      cubierto por el LEFT JOIN LATERAL pero que vale inspeccionar).
--   3. Chequeo adicional recomendado (tasks.md 2.2): confirmar que
--      `SELECT COUNT(*) FROM movimientos_cuenta` antes y despues del bloque
--      es IDENTICO — este backfill nunca deberia alterar esa tabla (ver
--      "QUE HACE ESTA MIGRACION" arriba); un cambio en ese conteo indicaria
--      un problema ajeno a este script.
--   4. Si 100% PASS y el conteo de `movimientos_cuenta` no cambio: reemplazar
--      el `ROLLBACK;` final por `COMMIT;` y volver a correr el archivo
--      completo (esta vez aplica de verdad).
--   5. Re-correr el archivo completo una vez mas post-COMMIT (tasks.md 2.4):
--      debe reportar 0 filas afectadas por el UPDATE (idempotencia) y la
--      query de validacion debe seguir en 100% PASS.
--
-- ROLLBACK:
--   Este backfill NO es reversible de forma limpia al estado previo exacto
--   ('pendiente' por DEFAULT para las filas afectadas) — una vez hecho
--   COMMIT, el valor pre-backfill de cada fila se pierde (no se guarda un
--   snapshot "antes"). Esto es aceptable porque `estado` es una columna
--   puramente DERIVADA (no es la fuente de verdad — `movimientos_cuenta` lo
--   es): si en el futuro se necesita "revertir", la operacion correcta no es
--   deshacer este backfill sino volver a CORRERLO (es idempotente, ver
--   arriba) — eso siempre re-sincroniza `estado` con el ledger real, nunca
--   lo desincroniza mas. No existe un escenario donde reemplazar el valor
--   derivado con el `DEFAULT 'pendiente'` original sea la respuesta correcta
--   a un problema, por lo que no se provee un script de rollback que
--   restaure ese default.
-- =============================================================================

BEGIN;

UPDATE ventas v SET estado = sub.estado_calc
FROM (
  SELECT v2.id,
    CASE WHEN last.tipo = 'REV' AND v2.saldo_pend_usd > 0.005 THEN 'reversado'
         WHEN v2.saldo_pend_usd <= 0.005 THEN 'pago'
         WHEN v2.saldo_pend_usd >= v2.total_usd - 0.005 THEN 'pendiente'
         ELSE 'parcial' END AS estado_calc
  FROM ventas v2
  LEFT JOIN LATERAL (
    SELECT tipo FROM movimientos_cuenta mc WHERE mc.venta_id = v2.id
    ORDER BY mc.fecha DESC, mc.created_at DESC, mc.id DESC LIMIT 1
  ) last ON true
) sub
WHERE v.id = sub.id AND v.estado IS DISTINCT FROM sub.estado_calc;

-- VALIDACION (design.md §6) — correr ANTES de decidir ROLLBACK vs COMMIT.
-- Re-deriva `estado` de forma independiente y lo compara contra la columna
-- recien actualizada, fila por fila. Esperado: 100% 'PASS'.
SELECT v.id, v.empresa_id, v.estado AS estado_actual,
  CASE
    WHEN last.tipo = 'REV' AND v.saldo_pend_usd > 0.005 THEN 'reversado'
    WHEN v.saldo_pend_usd <= 0.005 THEN 'pago'
    WHEN v.saldo_pend_usd >= v.total_usd - 0.005 THEN 'pendiente'
    ELSE 'parcial'
  END AS estado_calculado,
  CASE WHEN v.estado = (CASE
    WHEN last.tipo = 'REV' AND v.saldo_pend_usd > 0.005 THEN 'reversado'
    WHEN v.saldo_pend_usd <= 0.005 THEN 'pago'
    WHEN v.saldo_pend_usd >= v.total_usd - 0.005 THEN 'pendiente'
    ELSE 'parcial'
  END) THEN 'PASS' ELSE 'FAIL' END AS resultado
FROM ventas v
LEFT JOIN LATERAL (
  SELECT tipo FROM movimientos_cuenta mc WHERE mc.venta_id = v.id
  ORDER BY mc.fecha DESC, mc.created_at DESC, mc.id DESC LIMIT 1
) last ON true
ORDER BY resultado DESC;

-- Si la query anterior es 100% 'PASS' Y el COUNT(*) de `movimientos_cuenta`
-- no cambio (ver "COMO EJECUTAR" paso 3 arriba): reemplazar este ROLLBACK
-- por COMMIT y volver a correr el archivo completo.
-- Si hay algun 'FAIL': dejar este ROLLBACK, NO aplicar, investigar primero.
ROLLBACK;
