-- =============================================================================
-- CLARAPOS: Limpieza puntual de saldos de clientes de prueba (STAGING ONLY)
-- =============================================================================
-- ADVERTENCIA: Este script es NO NUMERADO y de un solo uso. Contiene UUIDs
-- de clientes y empresa HARDCODEADOS que SOLO existen en el entorno de
-- STAGING de pruebas. NO ejecutar en produccion — los IDs aqui abajo no
-- existen (o pertenecen a otra cosa) en cualquier otro entorno. Precedente
-- de scripts de limpieza no numerados en este repo: cleanup_all_data.sql,
-- cleanup_operacional.sql, cleanup_transaccional.sql.
--
-- PROPOSITO: CLIENTE TEST 9 (c5bad9f2-a1ff-4cfb-af72-b83e3b37243e) y
-- CLIENTE TEST 11 (b32a93e6-449d-43cf-8da1-3eda9b77a94e), ambos de la empresa
-- 54a918bd-2f11-442b-b6aa-47f0b4a96048, quedaron con saldos inflados
-- (orphan REV) por el bug de doble-disparo del trigger ya corregido esta
-- sesion (ver migrations/0120_limpiar_trigger_debug_saldo_cliente.sql). Son
-- datos de prueba sin valor contable — owner confirmo que un reset directo a
-- 0/0 es seguro.
--
-- CANAL AUTORIZADO: usa el mismo `set_config('clarapos.trigger_context',
-- 'mov_cuenta', TRUE)` que usa el propio trigger `actualizar_saldo_cliente()`
-- (y las reconciliaciones de 0061/0062/0089/0118/0119) para que
-- `validate_cliente_update()` permita el UPDATE directo sobre `clientes`.
--
-- NUNCA toca `movimientos_cuenta` (tabla inmutable) — ni INSERT, ni UPDATE,
-- ni DELETE. Este script solo escribe sobre `clientes`.
-- =============================================================================

BEGIN;

SELECT set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);

UPDATE clientes
SET
    saldo_actual         = 0,
    saldo_pendiente_usd  = 0,
    updated_at           = NOW()
WHERE id IN (
    'c5bad9f2-a1ff-4cfb-af72-b83e3b37243e',  -- CLIENTE TEST 9
    'b32a93e6-449d-43cf-8da1-3eda9b77a94e'   -- CLIENTE TEST 11
)
AND empresa_id = '54a918bd-2f11-442b-b6aa-47f0b4a96048';

COMMIT;

-- =============================================================================
-- VERIFICACION (ejecutar despues del COMMIT) — ambas filas deben mostrar
-- saldo_actual=0 y saldo_pendiente_usd=0.
-- =============================================================================

-- SELECT id, saldo_actual, saldo_pendiente_usd
-- FROM clientes
-- WHERE id IN (
--     'c5bad9f2-a1ff-4cfb-af72-b83e3b37243e',
--     'b32a93e6-449d-43cf-8da1-3eda9b77a94e'
-- )
-- AND empresa_id = '54a918bd-2f11-442b-b6aa-47f0b4a96048';
-- -- Esperado: 2 filas, saldo_actual=0 y saldo_pendiente_usd=0 en ambas.
