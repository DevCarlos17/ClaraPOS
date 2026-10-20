# Tasks: Trazabilidad Ingreso de Tesoreria <-> Pagos (Camino Directo)

## Review Workload Forecast

| Slice | Content | Est. lines | Budget risk | Chained | Decision-needed |
|---|---|---|---|---|---|
| 0a-schema | Migracion 0117 + `schema.ts` + `connector.ts` + `powersync-sync-rules.yaml` (2 lineas) | 100-150 | Low | Y | N |
| 0a-wiring | 2 sitios de INSERT aditivos en `use-cxc.ts` + tests RED/GREEN | 100-150 | Low | Y | N |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low
```

Delivery strategy ya resuelta: 2 PRs por diseno (`design.md` Slice Boundaries),
cada una stacked-to-main e independientemente bajo 400 lineas. No se requiere
`size:exception`.

## Do NOT Touch

- Quirk `movId`-fantasma en `registrarAbonoGlobal` (documentado en design.md,
  deuda tecnica preexistente, fuera de alcance).
- Cualquier UI (sin pantalla de reverso que consuma esta trazabilidad; change
  futuro).
- `saf_creditos_lotes`/`saf_creditos_aplicaciones`/`pagos_aplicaciones` —
  solo se corrige 1 linea de gap en sync-rules.yaml, sin tocar su DDL/wiring.
- Reordenar statements existentes en `aplicarPagoFacturaEnTx`/
  `registrarAbonoGlobal` — todo cambio de wiring es ADITIVO.

---

## Slice 0a-schema — tabla puente + PowerSync (PR #1)

- [x] 0a-schema.1 `migrations/0117_movimientos_bancarios_pagos.sql`: `CREATE TABLE IF NOT EXISTS movimientos_bancarios_pagos` (id, empresa_id FK empresas, ingreso_id FK movimientos_bancarios(id), pago_id FK pagos(id), monto_aplicado_usd NUMERIC(20,8) CHECK>0, created_at, created_by FK usuarios) — mirror exacto de `migrations/0112_pagos_aplicaciones.sql` (sin trigger, sin `cliente_id` denormalizado, sin BEGIN/COMMIT por ser DDL pura).
- [x] 0a-schema.2 Mismo archivo: indices `idx_mov_banc_pagos_ingreso` (ingreso_id), `idx_mov_banc_pagos_pago` (pago_id), `idx_mov_banc_pagos_empresa` (empresa_id).
- [x] 0a-schema.3 Mismo archivo: `ENABLE ROW LEVEL SECURITY` + policies `select_own_empresa`/`insert_own_empresa` via `current_empresa_id()` (sin policy UPDATE/DELETE, append-only) + bloque `DO $$` idempotente para `ALTER PUBLICATION powersync ADD TABLE` — mismo patron 0098/0112.
- [x] 0a-schema.4 Mismo archivo: agregar trailer de VERIFICACION MANUAL (owner, sin credenciales Postgres en esta sesion) con pasos INSERT de prueba dentro de `BEGIN/ROLLBACK` + intento UPDATE/DELETE esperando 0 filas afectadas — mismo formato que el trailer de 0112.
- [x] 0a-schema.5 `src/core/db/powersync/schema.ts`: nueva `Table` `movimientos_bancarios_pagos` (columnas `column.text`: empresa_id, ingreso_id, pago_id, monto_aplicado_usd, created_at, created_by; `insertOnly: true`; mismos 3 indices) ubicada junto a `pagos_aplicaciones` (~L832); registrar en el mapa de tablas (~L1846). No tocar ningun literal de tabla existente.
- [x] 0a-schema.6 `src/core/db/powersync/connector.ts`: agregar `'movimientos_bancarios_pagos'` a `IMMUTABLE_TABLES` (~L177), mismo comentario-patron que `pagos_aplicaciones`/`saf_creditos_aplicaciones` (append-only, sin policy UPDATE/DELETE, converge via `ON CONFLICT DO NOTHING`).
- [x] 0a-schema.7 `backend/powersync-sync-rules.yaml`: bajo `# --- CAJA / TESORERIA ---` (~L129, junto a `movimientos_bancarios`), agregar `- SELECT * FROM movimientos_bancarios_pagos WHERE empresa_id = bucket.empresa_id`.
- [x] 0a-schema.8 Mismo archivo: FIX del gap preexistente — bajo `# --- CLIENTES / CXC ---` (~L113, junto a `saf_creditos_aplicaciones`), agregar la linea faltante `- SELECT * FROM pagos_aplicaciones WHERE empresa_id = bucket.empresa_id` (1 linea, cero riesgo, confirmado por grep que falta).
- [x] 0a-schema.9 Verify: `yarn type-check` limpio (schema.ts/connector.ts no agregan errores nuevos). Correr cualquier Vitest existente que cubra `IMMUTABLE_TABLES`/tablas espejo (`connector.test.ts` si existe cobertura de `pagos_aplicaciones`/`saf_creditos_aplicaciones`) y confirmar que sigue en verde. **Manual owner-run**: ejecutar `0117_movimientos_bancarios_pagos.sql` completo en Supabase SQL Editor, seguir el trailer de verificacion (INSERT dentro de BEGIN/ROLLBACK + intento UPDATE/DELETE esperando 0 filas).

## Slice 0a-wiring — INSERTs aditivos (PR #2, depende de PR #1)

- [x] 0a-wiring.1 [RED] `use-cxc.test.ts`, describe nuevo `aplicarPagoFacturaEnTx — movimientos_bancarios_pagos (bridge, 0a-wiring)`: caso simple (deposito directo, 1 factura, monto=$100) — assert exactamente 1 `INSERT INTO movimientos_bancarios_pagos` con `ingreso_id` === el id real insertado en `movimientos_bancarios` en la MISMA tx (no un uuid distinto) y `monto_aplicado_usd` === monto del pago. RED confirmado antes de tocar produccion (ejecutado, 3 tests fallando por ausencia de INSERT puente).
- [x] 0a-wiring.2 [GREEN] `aplicarPagoFacturaEnTx` (L732): hoisteado el `uuidv4()` inline del INSERT a `movimientos_bancarios` a `const ingresoBancarioId = uuidv4()` (sin reordenar nada); usado en el VALUES existente; inmediatamente despues del `UPDATE bancos_empresa` (L741-744, aditivo puro) se inserta 1 fila: `INSERT INTO movimientos_bancarios_pagos (id, empresa_id, ingreso_id, pago_id, monto_aplicado_usd, created_at, created_by) VALUES (...)` usando `pagoId` (ya en scope, L563) y `montoUsd`.
- [x] 0a-wiring.3 [RED] `use-cxc.test.ts`, describe `registrarAbonoGlobal — movimientos_bancarios_pagos (bridge, 0a-wiring)`: abono FIFO de $100 sobre 2 facturas ($30+$70), deposito directo — assert 2 filas `movimientos_bancarios_pagos`, `SUM(monto_aplicado_usd)` = 100, `ingreso_id` de ambas === el id real de `movimientos_bancarios` (no `movBancoAbonoId` reconstruido a mano). RED confirmado.
- [x] 0a-wiring.4 [RED] `use-cxc.test.ts`, mismo describe: abono de $50 sobre 1 factura con saldo $20 (FIFO $20 + $30 excedente/anticipo promovido a SAFC), deposito directo — assert 2 filas `movimientos_bancarios_pagos` (1 FIFO + 1 anticipo, patron N+1), `SUM(monto_aplicado_usd)` = 50 = monto del ingreso bancario. RED confirmado. (Nota: fixture con 1 factura en vez de las 2 ilustrativas del enunciado original — mismo contrato N+1/sum-parity, numeros exactos distintos pero semanticamente equivalentes.)
- [x] 0a-wiring.5 [RED] `use-cxc.test.ts`, 2 describes (aplicarPagoFacturaEnTx + registrarAbonoGlobal): metodo de cobro batch/lote (`deposito_directo=0`) — assert 0 filas `movimientos_bancarios_pagos` Y 0 filas `movimientos_bancarios` (el `if` de banco directo nunca se ejecuta). Pasaron trivialmente desde el primer RED run (guard ya correcto por construccion, sin logica nueva que los rompa) — declarado explicito por contrato, confirmado tambien post-GREEN sin regresion.
- [x] 0a-wiring.6 [GREEN] `registrarAbonoGlobal`: declarado `const bridgeEntries: Array<{ pagoId: string; montoAplicadoUsd: Decimal }> = []` antes del loop FIFO (L1096, justo tras `montoRestante`); dentro del loop, tras el INSERT a `pagos_aplicaciones` (L1166), `bridgeEntries.push({ pagoId, montoAplicadoUsd: montoAplicar })`; tras el INSERT del anticipo (dentro del `if (montoRestante.gt(0.01))`, L1205-1229), `bridgeEntries.push({ pagoId: pagoAnticipoId, montoAplicadoUsd: montoRestante })`.
- [x] 0a-wiring.7 [GREEN] Dentro del `if` existente de banco directo (L1413-1459), tras el `UPDATE bancos_empresa` (L1455-1458, aditivo puro): loop `for (const entry of bridgeEntries)` insertando 1 fila `movimientos_bancarios_pagos` por entry, `ingreso_id = movBancoAbonoId` (ya en scope desde L1414, sin hoisting). `bridgeEntries` se construye siempre pero solo se flushea dentro de este `if` — metodos batch nunca entran, 0 filas. Mismo patron aplicado en `aplicarPagoFacturaEnTx` para el caso simple (1 sola fila, sin loop).
- [x] 0a-wiring.8 Verify: `yarn vitest run src/features/cxc/hooks/__tests__/use-cxc.test.ts` → 81/81 verde (5 nuevos + 76 preexistentes, 0 regresiones). `yarn vitest run src/features/cxc` → 220/222 verde; los 2 fallos restantes (`cxc-list.test.tsx`, `getByRole('dialog')` no encontrado) son **pre-existentes en `develop`** — confirmado reproduciendo el mismo fallo con `git stash` (codigo sin esta feature) antes de aplicar el wiring; no relacionados a `use-cxc.ts`/`movimientos_bancarios_pagos`. `yarn type-check:test` limpio — mismos 3 errores baseline documentados en 0a-schema (producto-form-aviso-borrador.test.tsx, producto-form-edit-open-mask.test.tsx, use-pwa-update.ts), cero errores nuevos.

---

## Cross-slice final task

- [x] F.1 Actualizar `migrations/README.md`: agregar fila `0117` con la misma densidad/voz que las filas 0104-0114 — rol en `trazabilidad-ingreso-pagos-directo`, mirror de 0112 sin trigger, arranca vacia (sin backfill), fix del gap `pagos_aplicaciones` en `powersync-sync-rules.yaml` mencionado como nota lateral del mismo PR. Hecho durante el archive: tambien se agregaron las filas 0115/0116 faltantes (gap preexistente, documentado en apply-progress obs #5568), completando la tabla de 0104 a 0117 sin huecos.
