# Tasks: Fix doble conteo de `clientes.saldo_pendiente_usd` en reverso de abono (REV)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~105-125 (connector.ts ~3-4 líneas + test nuevo ~100-120 líneas, espejo de `connector-saf-disponible-patch-strip.test.ts`) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR |
|------|------|-----------|
| 1 | Test RED + fix GREEN (`connector.ts` + nuevo test) en un solo commit | PR 1 |

## Phase 1: RED — Test que reproduce el hueco de stripping

- [x] 1.1 Leer `src/core/db/__tests__/connector-saf-disponible-patch-strip.test.ts` como plantilla exacta (mock de `@supabase/supabase-js`, `makeFakeDb`, `clientesPatchOp`).
- [x] 1.2 Crear `src/core/db/__tests__/connector-saldo-pendiente-patch-strip.test.ts`: mismo `describe`/mocks, pero el PATCH de `clientes` incluye `saldo_pendiente_usd` (además de `saldo_actual`/`saf_disponible`). Caso 1: `payload` subido NO debe tener `saldo_pendiente_usd` (ni `saldo_actual`/`saf_disponible`); `updated_at` sí sube. Caso 2: PATCH que solo toca columnas gestionadas por trigger (incluyendo `saldo_pendiente_usd`) se omite por completo — `updateSpy` nunca llamado.
- [x] 1.3 Correr `yarn test:run` — confirmar que el nuevo test FALLA (RED) porque `saldo_pendiente_usd` todavía viaja en el PATCH. (Confirmado: 2/2 tests nuevos fallaron con `AssertionError: expected ... to not have property "saldo_pendiente_usd"` y `Cannot read properties of undefined (reading 'eq')`.)

## Phase 2: GREEN — Fix en el connector

- [x] 2.1 En `src/core/db/powersync/connector.ts` (~L128), cambiar `clientes: ['saldo_actual', 'saf_disponible']` a `clientes: ['saldo_actual', 'saf_disponible', 'saldo_pendiente_usd']` dentro de `TRIGGER_MANAGED_PATCH_COLUMNS`.
- [x] 2.2 Extender el comentario existente (L125-127) para mencionar que `saldo_pendiente_usd` también lo actualiza `actualizar_saldo_cliente()` (migration 0110) y que antes de este fix no estaba protegido — root cause del doble conteo en reverso de abono.

## Phase 3: Verificación Automatizada

- [x] 3.1 Correr `yarn test:run` — el test de 1.2 pasa en GREEN; cero regresiones en el resto de la suite (en particular `connector-saf-disponible-patch-strip.test.ts`, `use-cxc.test.ts`, `reversa-pago-saf.test.ts`, que mockean `tx.execute()` local y son insensibles a este cambio). Confirmado: `connector-saldo-pendiente-patch-strip.test.ts` 2/2 GREEN; `src/core/db/__tests__/` completo 8 archivos/126 tests passed; `use-cxc.test.ts` 76/76 passed; `reversa-pago-saf.test.ts` 14/14 passed. Full-suite run (`yarn test:run` sin filtro) muestra una falla pre-existente no relacionada en `cliente-detalle.test.tsx` ("Found multiple elements with the text: /facturas/i") — no toca `connector.ts` ni `TRIGGER_MANAGED_PATCH_COLUMNS`, reportada como pre-existente, no corregida en este batch.
- [x] 3.2 Correr `yarn type-check` y `yarn type-check:test` — sin errores nuevos. `yarn type-check:test` muestra 3 errores pre-existentes no relacionados (`producto-form-aviso-borrador.test.tsx`, `producto-form-edit-open-mask.test.tsx` — tipo `Producto.costo_factura_usd`; `use-pwa-update.ts` — variable `swUrl` sin usar). Ninguno toca `connector.ts` ni el nuevo archivo de test.

## Phase 4: Manual Gate (NOT agent-executed)

- [x] 4.1 **MANUAL — owner/QA en staging**: reversar abono de CLIENTE TEST 2 (factura C01-000024) y CLIENTE TEST 3 (C01-000022); confirmar que `clientes.saldo_pendiente_usd` vuelve a $30/$50 respectivamente (no $52). Sin credenciales Postgres en esta sesión — este paso no lo ejecutó el agente. **Resultado: PASS.** Usuario confirmó en staging que ambos clientes recuperaron su deuda correcta ($30 y $50) — "funcionó".

## Rules

- Testing commands únicamente: `yarn test:run`, `yarn type-check`, `yarn type-check:test`. `yarn lint` no está disponible en este repo — no usarlo como gate.
- No tocar `use-cxc.ts` ni ningún write-site (los 15 sitios auditados en la exploración quedan intactos).
- No crear migraciones SQL — el trigger `actualizar_saldo_cliente()` (0110) ya es correcto.
