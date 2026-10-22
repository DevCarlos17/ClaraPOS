# Archive Report: reverso-abono-directo-tesoreria-sin-saf

**Archivado**: 2026-10-22
**Verdict de verify**: PASS en 2a/2b-i-a/2b-i-b, PASS WITH WARNINGS (resuelto) en 2b-ii — ver `verify-report.md` en esta misma carpeta
**PRs**: #258 (2a, merge `d2a4c74`) → #259 (2b-i-a, merge `159a92e`) → #260 (2b-i-b, merge `200c5ee`) → #261 (2b-ii, merge `adbb4b6`), stacked a `develop`

## Qué se envió (shipped)

El reverso REAL (mutante) de un abono directo `TRANSFERENCIA_CLIENTE` desde el modal de tesorería, para el caso **sin cadena SAF**: una sola operación atómica que crea el egreso bancario Y reabre la(s) factura(s) de CxC, en vez de solo uno de los dos efectos como pasaba antes.

| Pieza | Dónde | PR |
|---|---|---|
| `reversarPagoEnTx(tx, params)` | `src/features/cxc/hooks/use-cxc.ts` — extraído de `registrarReversoAbono`, mismo patrón que `reversarPagoSafEnTx` (acepta `tx` del llamador, nunca abre la suya) | #258 |
| `reversarAbonoDirectoDesdeTesoreria(...)` | `src/features/tesoreria/hooks/use-reverso-abono-directo.ts` (nuevo) — detección SAF pre-tx, UNA `db.writeTransaction` con egreso inline + loop genérico sobre N `pago_id` | #259 |
| Cobertura multi-factura | `use-reverso-abono-directo.test.ts` — triangula N=2/N=3/rollback multi-pago sobre el MISMO código de #259 (confirmado test-only, cero cambio de producción) | #260 |
| Wiring + PIN gate | `src/features/tesoreria/components/reverso-modal.tsx` — branch por `origen==='TRANSFERENCIA_CLIENTE'`, gate `CXC_REVERSE`+PIN (patrón `factura-detalle-cxc.tsx`), botón deshabilitado si `facturasSaf.length>0` | #261 |

## EL BUG DE NEGOCIO CORREGIDO

Antes de este change: reversar un abono de método **directo** (`TRANSFERENCIA_CLIENTE`) desde CxC (`registrarReversoAbono`) reabría la factura y subía el saldo del cliente, pero **nunca creaba el egreso de tesorería correspondiente** — el banco quedaba con el ingreso original intacto, es decir, el **saldo bancario quedaba sobreestimado** frente a la realidad. Era un bug confirmado (no hipotético), documentado desde la exploración `sdd/reverso-abono-tesoreria/explore-reverso-real` (#5602) y desde el change `preview-facturas-afectadas-reverso-tesoreria`.

Con este change, reversar el abono directo **desde tesorería** (el camino que este epic habilita) crea el egreso bancario correcto Y reabre la CxC en la MISMA transacción atómica — el banco deja de quedar sobreestimado para este caso (sin SAF).

## Decisiones de diseño clave

| Decisión | Alternativa rechazada | Por qué |
|---|---|---|
| `reversarPagoEnTx` recibe `generatedLote: boolean` ya resuelto (nunca re-detecta SAF dentro de la función) | Re-llamar `detectarLoteSafDePago` dentro de la tx | `detectarLoteSafDePago` usa `db.getAll` (conexión separada); llamarla desde dentro de una `tx` abierta reproduce el deadlock de `fix/cxc-reverso-deadlock-getall` |
| Detección SAF 100% pre-tx, bloqueo con cero mutación si algún `facturasAfectadas` no vacío | Detectar SAF dentro de la tx y hacer rollback si corresponde | Evita el deadlock anterior Y evita abrir una tx que probablemente se revierta — más barato y más seguro |
| UN solo egreso por el monto TOTAL del ingreso (`mov.monto`, no suma de montos por pago) | Un egreso por cada `pago_id` del puente | `deposito_directo` garantiza `ingreso.monto = Σ pagos`; coincide exactamente con el escenario de spec (`38201beb`: $2, 2 pagos, 1 egreso) |
| Egreso bancario decrementado simétricamente (`saldo_nuevo = saldoAnterior.minus(montoEgreso)`) usando `Decimal`/`toStorageString` | Reusar `parseFloat`/`.toFixed(4)` del legacy `reversarMovBancario` | Cumple la regla #10 de CLAUDE.md (precisión interna 8 decimales); MÁS preciso que el legacy, sin regresión observable porque `monto` en sí es copia cruda |
| TOCTOU en DOS capas: pago (re-SELECT dentro de `reversarPagoEnTx`, respaldado por trigger Postgres `trg_pagos_allow_reversal`) e ingreso (re-SELECT como primera statement de la tx, SOLO app-level, sin trigger) | Confiar solo en el filtro pre-tx | `movimientos_bancarios.reversado` no tiene backstop de Postgres — la re-lectura dentro de la tx es la única guardia real para ese campo |
| PIN/permiso vive en la UI (`reverso-modal.tsx`), no en el orquestador | Flag `authorized: boolean` como parámetro del orquestador | Misma convención que `registrarReversoAbono`/`factura-detalle-cxc.tsx`: el orquestador confía en `userId`/`reversedByNombre` ya resueltos, el chequeo de permiso vive donde vive `hasPermission`/`SupervisorPinDialog` |
| `CXC_REVERSE` reusado (sin crear `TESORERIA_REVERSE`) | Permiso nuevo de tesorería | Evita inflar el modelo de permisos antes del rediseño post-core; documentado como decisión explícita desde la proposal |
| 4 PRs stacked (2a→2b-i-a→2b-i-b→2b-ii) en vez de 2 slices como preveía el design original | 1-2 PRs monolíticos | El diseño preveía partir 2b si superaba ~400 líneas; 2b-i midió 658 líneas reales (vs. 550-750 forecasteado, patrón de subestimación confirmado contra `nc-reembolso-real-reverso-gasto`) — se partió en 2b-i-a (caso simple) + 2b-i-b (cobertura multi-factura, cero cambio de producción) para mantener cada PR revisable |

## Verify: resultado

Ver `verify-report.md` en esta carpeta para el detalle completo por slice. Resumen:

- **2a** (reversarPagoEnTx): PASS. Regresión byte-idéntica probada diffeando cada statement del cuerpo extraído contra el original; 97/97 tests verdes.
- **2b-i-a** (orquestador, caso simple): PASS. SAF-block zero-mutation PROBADO (pre-tx, cero `db.writeTransaction`); atomicidad PROBADA (una sola tx, TOCTOU primera statement, cero `db.getAll` dentro); dinero del egreso trazado 1:1 contra el schema real.
- **2b-i-b** (multi-factura): PASS. Production-unchanged CONFIRMADO (diff vacío en los 4 archivos de producción guardados); tests NO vacíos PROBADO vía mutación deliberada (`bridgeRows.slice(0,1)` rompió los 3 tests nuevos exactamente como se esperaba, revertida después).
- **2b-ii** (modal + PIN): PASS WITH WARNINGS en el momento del verify — los 3 warnings (checkboxes de `tasks.md` sin marcar, ruido `.atl/*` en el working tree, falta de branch feature) eran de proceso/bookkeeping, no funcionales; confirmados RESUELTOS al momento de este archive (tasks.md en disco muestra 13.1-17 `[x]`, PR #261 se abrió desde una rama feature estándar y ya mergeó).

Ningún hallazgo CRITICAL en ninguna slice.

## Capabilities / specs

**New**: `tesoreria-reverso-abono-directo` — copiada completa (full spec, sin delta) a `openspec/specs/tesoreria-reverso-abono-directo/spec.md`. 8 requirements, 15 scenarios.

**Modified**: `tesoreria-preview-facturas-afectadas` — delta ADDED (1 requirement, 2 scenarios: "Acción de reverso expuesta y gateada por presencia de SAF") aplicado a `openspec/specs/tesoreria-preview-facturas-afectadas/spec.md`, que ya existía promovida desde el change hermano `preview-facturas-afectadas-reverso-tesoreria`. El panel deja de ser puramente informativo — ahora expone/gatea la acción de reverso según `facturasSaf`.

**Sin delta** (refactor interno, no capability): la extracción de `reversarPagoEnTx` de `registrarReversoAbono` preserva el contrato y comportamiento exacto del entry point de CxC — documentado explícitamente en la proposal como implementación interna, no como requisito de negocio nuevo.

## Carried Forward (el epic `reverso-abono-tesoreria` continúa)

### 1. El caso SAF (bloqueado aquí — PRÓXIMO CHANGE, máxima prioridad del epic)

Este change bloquea explícitamente el reverso cuando el abono generó un lote SAF consumido por facturas downstream. El próximo slice del epic debe desenredar ese caso: reabrir las facturas D/E afectadas vía `saf_creditos_aplicaciones`.

**HALLAZGO DE RIESGO YA DOCUMENTADO (razón explícita del bloqueo de este change)**: al reabrir facturas vía SAF, el sistema **MUST BLOQUEAR** reabrir cualquier factura con `status='ANULADA'` (anulada fiscalmente vía nota de crédito total) — reabrirla resucitaría deuda sobre un documento fiscal ya invalidado. Este es el hallazgo 4/9 de `sdd/reverso-abono-tesoreria/explore-reverso-real` (#5602) y la razón explícita por la que el caso SAF se difirió a un change separado en vez de intentarse aquí.

### 2. Slice 0b — helper de lectura `resolverDestinoTesoreriaDePago`

Para el camino batch/lote (no requiere schema nuevo); ya diferido en los 2 changes previos del epic.

### 3. Superficie de consulta de factura en emisión

El modal de consulta de factura (pantalla de emisión, distinto del modal de reverso de tesorería) es candidato a reusar el orquestador/preview — deferido explícitamente.

### 4. Reverso CxC-side de método directo sin crear egreso

Confirmar si `registrarReversoAbono` standalone (invocado desde `factura-detalle-cxc.tsx`, fuera del flujo de tesorería) necesita también crear el egreso de tesorería cuando el método es directo — o si queda intencionalmente fuera de su contrato (el entry point de CxC existe para el caso donde tesorería NO es la fuente). Pendiente de decisión explícita en un change futuro; no cubierto por este change (que solo modifica el camino desde tesorería).

### 5. Deuda técnica pre-existente (documentar, fuera de alcance)

- `movId-fantasma` en `registrarAbonoGlobal` (abono 100% excedente) — documentado desde `trazabilidad-ingreso-pagos-directo`, ortogonal a este change.
- `try/catch` silencioso preexistente en los bloques de banco directo — no introducido por este change.
- Guard de doble-reverso bancario (`movimientos_bancarios.reversado`) sigue siendo SOLO app-level, sin trigger Postgres equivalente a `trg_pagos_allow_reversal` — límite conocido documentado en el design, no nuevo riesgo introducido.
- Crash cosmético del test runner al cerrar (`emitter.removeListener`, Node 24) — ocurrió durante el apply de 2b-ii DESPUÉS de que los tests reportaran verde; no es falla de test, solo ruido de salida del proceso.
- Ruido de `yarn type-check` a nivel de proyecto (`vitest-globals` no declarados globalmente) — no relacionado a este change puntual; `yarn type-check:test` (el gate real de verify) se mantuvo limpio salvo el baseline ya documentado (3 errores: `producto-form-aviso-borrador.test.tsx`, `producto-form-edit-open-mask.test.tsx`, `use-pwa-update.ts`).

### 6. Open Question del design (documentada, no bloqueante)

El design dejó abierta la pregunta de si el botón de reverso debía deshabilitarse también en estado `LEGACY` (sin filas de puente) además de con SAF. Se shippeó la interpretación literal de la spec (gate SOLO por `facturasSaf`, que es `[]` en LEGACY) — el backstop real en ese caso es el error claro del orquestador ("sin trazabilidad"), no un botón deshabilitado. Confirmado por verify como comportamiento intencional y documentado; queda abierto para confirmación de producto en un change futuro si se decide que la UX debe cambiar.

## Fallas pre-existentes confirmadas como no relacionadas (correctamente no tocadas)

- `cliente-detalle.test.tsx`, `cxc-list.test.tsx`, `abono-global-modal.test.tsx`, `nota-credito-pos-modal.test.tsx` — 4 archivos con fallas preexistentes, confirmadas ajenas al diff de este change en la corrida de repo completo de 2b-i-b.
- 3 errores de `yarn type-check:test` (`producto-form-aviso-borrador.test.tsx`, `producto-form-edit-open-mask.test.tsx`, `use-pwa-update.ts`) — idénticos en las 4 slices, mismo baseline documentado desde changes previos del epic.

## Archivado

`openspec/changes/reverso-abono-directo-tesoreria-sin-saf/` → `openspec/changes/archive/2026-10-22-reverso-abono-directo-tesoreria-sin-saf/`, mismo patrón `YYYY-MM-DD-{change-name}` que los archivos hermanos del epic (`2026-10-20-trazabilidad-ingreso-pagos-directo`, `2026-10-20-preview-facturas-afectadas-reverso-tesoreria`). Contiene: `proposal.md`, `design.md`, `tasks.md`, `specs/tesoreria-reverso-abono-directo/spec.md`, `specs/tesoreria-preview-facturas-afectadas/spec.md` (delta), `verify-report.md` (combinando las 4 slices, no existía previamente en filesystem — vivían solo en Engram), `archive-report.md` (este archivo).

## Lineage (Engram)

Observaciones completas bajo `sdd/reverso-abono-tesoreria/*`: `#5604` proposal, `#5605` spec, `#5641` design, `#5642` tasks, `#5643` apply-progress (merged las 4 slices), `#5644` verify-report 2a (PASS), `#5646` verify-report 2b-i-a (PASS), `#5649` verify-report 2b-i-b (PASS), `#5653` verify-report 2b-ii (PASS WITH WARNINGS, resuelto). Este reporte de archive persiste en `sdd/reverso-abono-tesoreria/archive-report-reverso-directo-sin-saf`.
