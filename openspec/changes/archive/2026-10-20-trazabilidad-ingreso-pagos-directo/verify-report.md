# Verify Report: trazabilidad-ingreso-pagos-directo

**Verdict**: PASS (ambos slices)

Este change se entregó como 2 slices stacked, cada uno verificado de forma independiente con revisión adversarial (no se confió ciegamente en el self-report de apply). Ver el detalle completo de cada slice en Engram (`sdd/reverso-abono-tesoreria/verify-report-0a-schema` #5569, `sdd/reverso-abono-tesoreria/verify-report-0a-wiring` #5572) — este archivo resume el resultado para el audit trail del repo.

## Slice 0a-schema (PR #254, merge commit `2816441`)

| Check | Resultado |
|---|---|
| Diff scope | Solo `migrations/0117_*.sql`, `schema.ts`, `connector.ts`, `powersync-sync-rules.yaml`, 1 test nuevo — cero toques a `use-cxc.ts` |
| Migración vs. template 0112 | Columnas/FKs/índices/RLS/publication idénticos en forma, sin trigger, sin `cliente_id` denormalizado (intencional) |
| RLS append-only | SELECT/INSERT via `current_empresa_id()`, sin policy UPDATE/DELETE |
| TDD RED→GREEN | Reproducido independientemente (`git stash` del connector.ts, re-run, falla; restaurado, pasa) |
| Suite `src/core/db` | 7 archivos / 37 tests, 0 regresiones |
| `yarn type-check:test` | Limpio (3 errores baseline preexistentes, no de este slice) |
| Hallazgo | Apply-progress conflató `yarn type-check` con `yarn type-check:test` — el primero tiene ~9974 errores preexistentes de proyecto (gap de tipos vitest en tsconfig.json), no relacionado a este slice. No bloqueante, documentado como WARNING. |

**Pendiente de owner**: correr `0117_movimientos_bancarios_pagos.sql` manualmente en el SQL Editor de Supabase antes de desplegar 0a-wiring — **ya ejecutado y confirmado por el owner** (append-only verificado en producción) antes de este archive.

## Slice 0a-wiring (PR #255, merge commit `6e03c78`, depende de 0a-schema ya mergeado)

| Check | Resultado |
|---|---|
| Diff scope | Solo `use-cxc.ts` (+46/-4) y su test (+292) — cero toques a migrations/schema/connector/sync-rules |
| Additive-only | Confirmado línea por línea: `aplicarPagoFacturaEnTx` hoistea `ingresoBancarioId`, 1 INSERT bridge tras el UPDATE existente; `registrarAbonoGlobal` acumula `bridgeEntries[]` y flushea dentro del `if` de banco directo ya existente. Ningún statement reordenado/removido. |
| ID-parity | `ingreso_id` de la fila puente == el id real insertado en `movimientos_bancarios` en la misma tx — guardado por test dedicado, confirmado por lectura directa del código |
| Invariante de suma (fan-in) | Probado matemáticamente por construcción: `Σ bridgeEntries = Σ(montoAplicar FIFO) + montoRestante final = montoTotalUsd` exacto, no aproximado |
| TDD RED→GREEN | Reproducido: `git stash` del wiring → 3/5 tests fallan (los de presencia de fila), 2/5 pasan trivialmente (guards batch/lote) |
| Suite targeted | 81/81 (5 nuevos + 76 preexistentes), 0 regresiones |
| Suite completa `src/features/cxc` | 220/222 — 2 fallos en `cxc-list.test.tsx` confirmados **pre-existentes en develop** (reproducidos con `git stash` del slice completo, mismo error byte-idéntico) |
| `yarn type-check:test` | Limpio, mismos 3 errores baseline |

### Issues no bloqueantes documentados

- `.atl/*` (skill-registry cache) modificado en el working tree — excluido del commit de ambos PRs, correctamente.
- Ambos bloques de banco directo siguen envueltos en un `try/catch` preexistente que silencia fallos de INSERT (incluyendo el nuevo INSERT bridge) sin reordenar ni exponer el error — deuda técnica preexistente, no introducida por este change (ver "Carried Forward" en `archive-report.md`).
- `empresa_id` del bridge no tiene test dedicado de escenario *mismatch* multi-tenant — bajo riesgo (una sola variable en scope por función), reforzaría REQ-05 en un hardening futuro.

## Conclusión

6/6 requirements de la spec cumplidos (REQ-01 a REQ-05 + exclusión batch), TDD completo con triangulación adecuada (2 casos sitio 1, 3 casos sitio 2), sin regresiones en ninguna de las dos suites. Ambos slices PR-ready confirmados y ya mergeados a `develop`.
