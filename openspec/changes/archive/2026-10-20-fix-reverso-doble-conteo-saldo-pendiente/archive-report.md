# Archive Report: fix-reverso-doble-conteo-saldo-pendiente

**Archived**: 2026-10-20
**Branch**: `fix/cxc-reverso-doble-conteo-saldo-pendiente` (merged)
**Verdict de verify**: PASS (ver `verify-report.md` en esta misma carpeta)
**Commit**: `5c2e0fc` — `fix(cxc): strip saldo_pendiente_usd del PATCH para evitar doble-conteo en reverso de abono`
**PR**: #253, merge commit `b5bf4a7` contra `develop`

## Qué se envió (shipped)

Fix de 1 línea + test espejo para el bug de doble-conteo de `clientes.saldo_pendiente_usd` al reversar un abono (REV):

- `src/core/db/powersync/connector.ts` — se agregó `'saldo_pendiente_usd'` a `TRIGGER_MANAGED_PATCH_COLUMNS.clientes`, pasando de `['saldo_actual', 'saf_disponible']` a `['saldo_actual', 'saf_disponible', 'saldo_pendiente_usd']`, extendiendo el comentario existente para documentar que `actualizar_saldo_cliente()` (migration 0110) también es dueña de esta columna.
- `src/core/db/__tests__/connector-saldo-pendiente-patch-strip.test.ts` (nuevo, 2 tests) — espejo exacto de `connector-saf-disponible-patch-strip.test.ts`: confirma que el PATCH subido a Supabase excluye `saldo_pendiente_usd` mientras la escritura local en SQLite lo conserva.

**Opción elegida**: B — hacer que el trigger Postgres sea la única autoridad server-side para `saldo_pendiente_usd`, igual que ya lo era para `saldo_actual`/`saf_disponible`. Ningún write-site de `use-cxc.ts` fue tocado.

## Causa raíz (refinada durante la exploración, no es la hipótesis original)

El bug **no** es "app+trigger siempre duplican". Depende del **orden de las sentencias dentro de la transacción** (PowerSync sube las operaciones CRUD en orden local estricto):

- **INSERT-antes-de-UPDATE** = seguro. El trigger suma, y el UPDATE literal subsiguiente escribe el mismo valor final que el trigger ya calculó — idempotente.
- **UPDATE-antes-de-INSERT** = buggy. El UPDATE literal escribe `anterior + monto`, y el trigger disparado por el INSERT suma `monto` otra vez encima — doble conteo.

De los 15 write-sites auditados en la exploración, **el único sitio buggy era `registrarReversoAbono`** (rama normal de reverso de abono, sin lote SAF): hace `UPDATE clientes` con valor literal antes del `INSERT INTO movimientos_cuenta` tipo REV.

### Correcciones a memoria previa

Dos sitios que la hipótesis inicial (memoria `#5548`, primera revisión) marcaba como sospechosos **fueron descartados explícitamente por la exploración**, con evidencia de código:

1. `reversarDiferencialEnTx` — **no** es buggy. Hace INSERT-antes-de-UPDATE.
2. `reversarPagoSafEnTx` — **confirmado seguro** por código + trigger: inserta REV×N + SAFR, acumula los deltas en memoria, y hace **un solo** UPDATE al final, después de todos los INSERTs.

El import de CxC (`use-importar-cxc.ts`, movimiento SAL) también se confirmó que **no** rompe con la Opción B — inserta un movimiento SAL debt-neutral, INSERT-antes-de-UPDATE.

## QA manual en staging — resultado

**PASS.** Reversar el abono de CLIENTE TEST 2 (factura C01-000024) y CLIENTE TEST 3 (C01-000022) restauró correctamente la deuda a $30 y $50 respectivamente (antes del fix, el reverso dejaba $52 en ambos casos por el doble conteo). Usuario confirmó en staging: "funcionó". Task 4.1 de `tasks.md` marcada `[x]` con este resultado.

## Fallas pre-existentes confirmadas como no relacionadas (correctamente no tocadas)

- `cliente-detalle.test.tsx` — match ambiguo de `/facturas/i` en el DOM (coincide con un label de tab y un `<h3>`). No forma parte del diff de este change.
- 3 type-errors pre-existentes en `yarn type-check:test`: 2x `producto-form` (mismatch de tipo en `Producto.costo_factura_usd`), 1x variable `swUrl` sin usar en `use-pwa-update.ts`.

Ninguna de estas fallas toca `connector.ts` ni el nuevo archivo de test — confirmado por `git diff --stat` antes y después del fix.

## Capabilities / specs

**New**: None. **Modified**: None. El proposal declara explícitamente que este es un fix interno de infraestructura de sync (connector) y no cambia ningún requisito de negocio ya especificado en `cxc-ledger-saldos-redesign`. No hay `specs/` delta en este change — no se requiere merge a `openspec/specs/`.

## Diferido explícitamente (fuera de alcance de este change)

- **Inconsistencia `ventas.saldo_pend_usd` vs. import de CxC (movimiento SAL)**: detectada durante la exploración previa — las filas importadas marcan la fila de `ventas` como pendiente (`saldo_pend_usd = monto`), pero por diseño del trigger son debt-neutral sobre `clientes.saldo_pendiente_usd`. Posible inconsistencia separada entre el saldo de la factura individual y el agregado del cliente. **No se investigó ni se corrigió en este change** — candidato a change futuro dedicado.

## Archivado

`openspec/changes/fix-reverso-doble-conteo-saldo-pendiente/` → `openspec/changes/archive/2026-10-20-fix-reverso-doble-conteo-saldo-pendiente/`, siguiendo el mismo patrón `YYYY-MM-DD-{change-name}` usado por los changes previamente archivados (ver `2026-09-18-nc-refund-tesoreria` como referencia directa de formato). Contiene: `proposal.md`, `tasks.md`, `verify-report.md`, `archive-report.md` (este archivo).

No hay `design.md` ni `specs/` — el change no los requirió (fix de infraestructura sin cambio de capability).

## Carpetas NO tocadas (confirmado)

El resto de `openspec/changes/` (varios changes activos/untracked de otras iniciativas) se dejó exactamente como estaba. Los archivos de `.atl/` (skill-registry cache, modificados por un refresh de background no relacionado) tampoco se incluyeron en el commit de este archivado.

## Lineage (Engram)

Observaciones completas bajo `sdd/cxc-ledger-saldos-redesign/*-fix-reverso-doble-conteo` y `sdd/fix-reverso-doble-conteo-saldo-pendiente/*`: `#5548` bug/decisión (Opción B elegida, memoria corregida en 2 revisiones), `#5550` exploración (causa raíz + auditoría de los 15 write-sites), `#5551` proposal, `#5552` tasks, `#5555` apply-progress, `#5556` verify-report (PASS), `#5557` session_summary (verify).
