# Proposal: Limpiar debug temporal del trigger actualizar_saldo_cliente()

## Intent

El trigger `actualizar_saldo_cliente()` (BEFORE INSERT en `movimientos_cuenta`) quedó con una línea de `RAISE WARNING '[TRIGGER-FIRE]...'` instrumentada en vivo (fuera de `migrations/`) para cazar un bug de doble-disparo. Ese bug ya está confirmado resuelto esta sesión (INSERT único dispara una sola vez, delta correcto). La línea de debug es ruido operativo permanente en los logs de Postgres y nunca se registró como migración — el historial de `migrations/` no refleja el estado real de la función en la DB. Dos clientes de prueba quedaron con saldos inflados (orphan `REV:1`) del bug ya resuelto.

## Scope

### In Scope
- `migrations/0120_limpiar_debug_trigger_saldo_cliente.sql`: `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()` con el cuerpo EXACTO de `0119` (byte-idéntico), sin la línea `RAISE WARNING '[TRIGGER-FIRE]...'` ni su comentario `-- [TEMPORAL...]`. Ninguna fórmula ni asserción cambia.
- Script separado, NO numerado, de limpieza puntual para `CLIENTE TEST 9` (`c5bad9f2-...`) y `CLIENTE TEST 11` (`b32a93e6-...`): reset a `saldo_pendiente_usd=0`, `saldo_actual=0` vía el canal autorizado `set_config('clarapos.trigger_context','mov_cuenta',TRUE)`. Nunca toca `movimientos_cuenta`.
- Actualizar `migrations/README.md` con la fila de `0120`.

### Out of Scope
- Defensa de raíz contra la recurrencia del doble-disparo (idempotencia por `mov_id`, constraint único, dedup en capa de sync) — follow-up futuro, no se diseña aquí.
- Cambios en `src/` (app code).
- Re-tocar la fórmula de `saldo_actual` o las asserciones SAF/REV (ya correctas desde 0119).

## Capabilities

### New Capabilities
None

### Modified Capabilities
None — es limpieza de instrumentación interna + corrección de datos de prueba. No hay comportamiento de negocio ni requirement de spec que cambie; no existe capability de OpenSpec para "trigger-maintenance" en `openspec/specs/`.

## Approach

**0120 (migración numerada, permanente):** redefinición pura de función, mecánica, sin lógica nueva — solo elimina una línea de logging. Se mantiene en la secuencia numerada porque es un cambio de schema (función) reproducible en cualquier entorno (nuevo o existente), igual que 0001-0119.

**Cleanup de clientes de prueba (script aparte, NO numerado):** se recomienda NO incluirlo en 0120 ni en ninguna migración numerada. Motivo: las migraciones numeradas son append-only, reproducibles en cualquier entorno y para siempre (ver `migrations/README.md`); hardcodear dos UUIDs de clientes de staging ahí los dejaría como "basura histórica obligatoria" en instalaciones nuevas o en producción, donde esos IDs no existen o no aplican. El repo ya tiene precedente de scripts de limpieza no numerados (`cleanup_all_data.sql`, `cleanup_operacional.sql`, `cleanup_transaccional.sql`) — este cambio sigue ese mismo patrón: `migrations/cleanup_test_clientes_saldo_doble_fire.sql`, ejecución manual una sola vez en staging, nunca parte del historial obligatorio.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `migrations/0120_limpiar_debug_trigger_saldo_cliente.sql` | New | Redefine función sin RAISE WARNING, cuerpo byte-idéntico a 0119 |
| `migrations/cleanup_test_clientes_saldo_doble_fire.sql` | New (no numerado) | Reset puntual de 2 clientes de prueba a 0/0 |
| `migrations/README.md` | Modified | Fila nueva para 0120 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| 0120 introduce drift respecto al cuerpo real post-0119 | Low | Verificado byte-por-byte contra la definición en vivo; `CREATE OR REPLACE` sin tocar ninguna rama de cálculo |
| Script de cleanup corre en el entorno equivocado (prod) | Low | No numerado, IDs hardcodeados de staging explícitos, requiere ejecución manual revisada, documentado como staging-only |
| Confundir el cleanup con "corrección contable" | Low | Owner confirmó explícitamente que son datos de prueba sin valor contable — reset a 0 es seguro |

## Rollback Plan

- **0120**: re-aplicar `CREATE OR REPLACE FUNCTION` con el cuerpo de `0119` (restaura el estado anterior; funcionalmente idéntico, solo cambia si se necesita reinsertar el `RAISE WARNING` para depurar de nuevo — pegar la línea manualmente en SQL Editor, no amerita nueva migración).
- **Cleanup**: sin rollback de datos con significado contable (owner confirmó que no hay nada que preservar). Si se necesitara, `UPDATE clientes SET saldo_pendiente_usd=2, saldo_actual=2 WHERE id IN (...)` restaura el estado previo exacto.

## Dependencies

- Follow-up futuro (fuera de este cambio): defensa de raíz contra el doble-disparo del trigger (idempotencia por `mov_id`, unique constraint, o dedup en la capa de sync) — el bug ya no se reproduce, pero no hay protección estructural que impida que vuelva.

## Success Criteria

- [ ] `pg_get_functiondef('actualizar_saldo_cliente'::regproc)` no contiene `[TRIGGER-FIRE]` ni `RAISE WARNING`
- [ ] El cuerpo en vivo de la función coincide byte-a-byte con `migrations/0120_limpiar_debug_trigger_saldo_cliente.sql`
- [ ] `CLIENTE TEST 9` y `CLIENTE TEST 11` quedan en `saldo_pendiente_usd=0`, `saldo_actual=0`
- [ ] `migrations/README.md` documenta `0120`
- [ ] Ningún archivo bajo `src/` fue modificado
