# Archive Report: preview-facturas-afectadas-reverso-tesoreria

**Archived**: 2026-10-20
**Verdict de verify**: PASS WITH WARNINGS, ambos slices (ver `verify-report.md` en esta misma carpeta)
**PRs**: #256 (1a-hook, merge commit `6a9501b`) + #257 (1b-panel, merge commit `6dfe417`), stacked a `develop`

## Qué se envió (shipped)

Un panel **read-only** de "facturas afectadas" en el modal de reverso de tesorería (`reverso-modal.tsx`), que resuelve y muestra — antes de que el usuario reverse un INGRESO bancario — qué facturas de cliente ese ingreso pagó directamente y cuáles afectó vía saldo a favor (SAF). Slice 1 del epic `reverso-abono-tesoreria` (el Slice 0a, `trazabilidad-ingreso-pagos-directo`, ya había construido el puente de datos que esto consume).

| Pieza | Dónde |
|---|---|
| Hook de lectura `previewFacturasAfectadas` | `src/features/tesoreria/hooks/use-preview-facturas-afectadas.ts` (PR #256) — función pura, no `useQuery` reactivo: `(empresaId, ingresoId) => Promise<{ estado: 'OK'\|'LEGACY', facturasDirectas, facturasSaf, totalUsd }>` |
| Fix del gate muerto | `src/features/tesoreria/utils/es-transferencia-cliente.ts` (PR #257) — reemplaza `doc_origen_tipo === 'PAGO'` (nunca verdadero en datos reales) por `origen === 'TRANSFERENCIA_CLIENTE'` |
| Panel UI | `src/features/tesoreria/components/reverso-modal.tsx` (PR #257) — consume el hook on-demand vía `useEffect` con deps primitivos, renderiza grupos "Pago directo"/"SAF" + total, estados LEGACY/OK-0/OK-N/loading, sin botones de acción |

## Decisiones de diseño clave

| Decisión | Alternativa rechazada | Por qué |
|---|---|---|
| Reusar `detectarLoteSafDePago` sin modificarlo | Reimplementar el join SAF en el nuevo hook | Evita duplicar lógica de negocio ya probada (`reversa-pago-saf.ts`); llamarlo para cada fila del puente (incluidas las directas) es un no-op barato |
| Hook retorna `'OK'\|'LEGACY'`, SIN gate por `origen` | Que el hook valide `origen` internamente | El Purpose del spec define el gate como responsabilidad de la UI, no del cómputo — el hook resuelve "qué facturas afecta este ingreso_id", punto; "si corresponde preguntarlo" es decisión de presentación |
| Gate por `origen` vive en el panel (1b), no en el hook (1a) | Gate defensivo duplicado en ambas capas | Deliberado y documentado desde la proposal; 1a's verify (#5592) flaggeó esto como WARNING a resolver explícitamente en 1b, y 1b lo resolvió con un test de regresión dedicado (ver verify-report) |
| Snapshot on-demand (`useEffect` con deps primitivos), no `useQuery` reactivo | Suscripción PowerSync reactiva al abrir el modal | Evita re-fetch en loop si `movimiento` cambia de referencia en cada re-render del padre (anti-patrón ya documentado por `vercel-react-best-practices`) |
| Panel ausente (no "no aplica") para `origen` no-TRANSFERENCIA_CLIENTE | Mostrar un banner "no aplica" (texto literal original del spec) | Mejor UX (sin ruido para el caso común batch/lote) y cumple la intención del requirement (no sugiere reversabilidad) — el spec fue corregido en este archive para reflejar esto (ver **Spec fix post-implementación** abajo) |
| 2 slices stacked (1a-hook → 1b-panel), 2 PRs | 1 PR monolítico | Cada slice queda bajo 400 líneas (200-250 y 100-150 respectivamente), sin necesitar `size:exception` |

## Verify: resultado

**PASS WITH WARNINGS en ambos slices**, revisión adversarial independiente (no se confió en el self-report de apply):

- **Slice 1a-hook** (#5592): diff scope confirmado (solo hook + test nuevos), read-chain trazado línea a línea contra `schema.ts`, `detectarLoteSafDePago` confirmado reusado sin modificar, filtro `is_reversed` y `empresa_id` confirmados en el SQL real ejecutado, distinción LEGACY/0-facturas confirmada, read-only confirmado por lectura completa de fuente (cero write calls), 6/6 tests RED→GREEN reproducidos independientemente, `yarn type-check:test` limpio (0 errores nuevos). Único WARNING: el gate por `origen` queda deliberadamente fuera de este slice — trackeado explícitamente como obligación del verify de 1b.
- **Slice 1b-panel** (#5597): diff scope confirmado (solo el modal + 3 archivos nuevos), gate por `origen` re-confirmado como única condición de gating (tanto del `useEffect` como del render), con test de regresión directo usando el valor real `doc_origen_tipo: 'PAGO_CXC'` que prueba el bug viejo corregido. `handleSubmit` (la mutación real) confirmado byte-idéntico, fuera de todo hunk del diff. 4 estados + gate cubiertos por 7/7 tests, 26/26 verde en la suite completa de tesorería, 0 regresiones. **W1 (único WARNING funcional)**: el spec decía literalmente "el panel muestra 'no aplica'" pero la implementación no renderiza nada — ver corrección abajo.

Ver `verify-report.md` en esta carpeta para el detalle completo por slice (diff scopes, read-chains, matrices de compliance).

## Spec fix post-implementación (W1)

El verify de 1b (#5597) flaggeó W1: el Requirement "Aplicabilidad del preview basada en el origen real" y su Scenario "Ingreso de lote o consolidación de cierre" decían literalmente que el panel **muestra "no aplica"**, pero la implementación shipped (confirmada por lectura de fuente y por test — `{aplicaPreview && (...)}` sin rama de fallback) **no renderiza ningún panel** cuando `origen !== 'TRANSFERENCIA_CLIENTE'`. Funcionalmente ambas cumplen la intención del requirement (no sugerir reversabilidad), pero el texto Given/When/Then no reflejaba el comportamiento real.

**Corregido en este archive**, antes de promover el spec a `openspec/specs/`:
- Requirement: `"Para otro origen, el sistema MUST NOT renderizar el panel de facturas afectadas ni invocar el cómputo del preview..."` (antes: `"...el panel MUST mostrar 'no aplica'..."`)
- Scenario: `"THEN no se renderiza el panel de facturas afectadas (ausencia total, sin texto 'no aplica')"` (antes: `"THEN el panel muestra 'no aplica' sin facturas"`)

Edición aplicada tanto en la copia archivada (`specs/tesoreria-preview-facturas-afectadas/spec.md` en esta carpeta) como en la copia promovida (`openspec/specs/tesoreria-preview-facturas-afectadas/spec.md`), que ahora reflejan el comportamiento shipped con exactitud.

## Fallas pre-existentes confirmadas como no relacionadas (correctamente no tocadas)

- `cxc-list.test.tsx` — 2 fallos pre-existentes, no forman parte del diff de este change (confirmado en ambos verify reports).
- 3 errores de `yarn type-check:test`: 2x `producto-form` (mismatch de tipo `costo_factura_usd`), 1x `swUrl` sin usar en `use-pwa-update.ts` — idénticos a los documentados en el change previo (`trazabilidad-ingreso-pagos-directo`).

## Capabilities / specs

**New**: `tesoreria-preview-facturas-afectadas` — copiada completa (full spec, sin delta, con el fix de W1 aplicado) a `openspec/specs/tesoreria-preview-facturas-afectadas/spec.md`. 7 requirements, 9 scenarios.
**Modified**: Ninguna — `tesoreria-trazabilidad-ingreso-pagos` se documentó como dependencia en la proposal, sin delta de contrato (confirmado, no se tocó su spec).

## Carried Forward (el epic `reverso-abono-tesoreria` continúa — esto fue Slice 1, preview read-only)

### 1. Slice 0b — Read-helper para el camino lote/batch
`resolverDestinoTesoreriaDePago`: no requiere schema nuevo. El chain existente (`pago.sesion_caja_id` + `metodo_cobro_id` → `movimientos_metodo_cobro` origen=`EGRESO_TESORERIA` → `traspasos_tesoreria` → cuenta destino) ya cierra determinísticamente.

### 2. Slices de reversal flow (la MUTACIÓN real — este change fue solo preview)
- Egreso espejo en tesorería (contra-asiento, nunca borrar) + reapertura de facturas afectadas — reusando el machinery existente de `registrarReversoAbono`/`reversarPagoSafEnTx`.
- Unwind de SAF cuando el abono promovió excedente a crédito.
- Historial de abono reversado, visible en UI.
- **Bug de negocio a corregir en el camino**: hoy, reversar desde CxC (`registrarReversoAbono`/`reversarPagoSafEnTx`) NUNCA crea un egreso de tesorería — si el pago original fue por un método directo, el saldo del banco queda sobreestimado tras el reverso. Confirmado en la exploración de slice 0a y aún no corregido.

### 3. Superficie de consulta de factura en emisión (deferida)
El modal de consulta de factura (pantalla de emisión, distinta del modal de reverso de tesorería) es candidato a reusar el mismo hook `previewFacturasAfectadas` — deferido explícitamente, fuera de alcance de este change.

### 4. Deuda técnica pre-existente (flaggeada, fuera de alcance — solo documentar)
- El hook `previewFacturasAfectadas` no tiene chequeo defensivo propio de `origen` — seguro hoy porque el único call-site (el panel) gatea antes de llamarlo, pero un futuro segundo consumidor (p.ej. el modal de consulta de factura del punto 3) deberá replicar el mismo gate o el hook deberá ganar una defensa interna.
- `movId-fantasma`: en `registrarAbonoGlobal`, cuando el abono es 100% excedente, el `movId` se genera pero el INSERT a `movimientos_cuenta` se salta — documentado en el change previo (`trazabilidad-ingreso-pagos-directo`), ortogonal a este change.
- `try/catch` silencioso preexistente en los bloques de banco directo — no introducido por este change.
- Ruido de `yarn type-check` a nivel de proyecto (`vitest-globals` no declarados, ~9974 errores) — no relacionado a ningún change puntual; `yarn type-check:test` (el gate real de verify) está limpio salvo los 3 errores baseline ya documentados.

## Archivado

`openspec/changes/preview-facturas-afectadas-reverso-tesoreria/` → `openspec/changes/archive/2026-10-20-preview-facturas-afectadas-reverso-tesoreria/`, mismo patrón `YYYY-MM-DD-{change-name}` que `2026-10-20-trazabilidad-ingreso-pagos-directo` y `2026-10-20-fix-reverso-doble-conteo-saldo-pendiente` (referencia directa de formato). Contiene: `proposal.md`, `tasks.md`, `specs/tesoreria-preview-facturas-afectadas/spec.md` (con el fix de W1), `verify-report.md` (combinando ambos slices, no existía previamente en filesystem — los verify reports de este change vivían solo en Engram), `archive-report.md` (este archivo). No hay `design.md` — la proposal documentó explícitamente que el design formal era opcional (read-chain 100% fijado por la exploración previa, sin gaps de schema).

## Lineage (Engram)

Observaciones completas bajo `sdd/reverso-abono-tesoreria/*`: `#5587` proposal, `#5588` spec, `#5590` tasks, `#5591` apply-progress (merged 1a+1b), `#5592` verify-report 1a-hook (PASS WITH WARNINGS), `#5597` verify-report 1b-panel (PASS WITH WARNINGS, flaggea W1 resuelto en este archive). Este reporte de archive persiste en `sdd/reverso-abono-tesoreria/archive-report-preview-facturas-afectadas`.
