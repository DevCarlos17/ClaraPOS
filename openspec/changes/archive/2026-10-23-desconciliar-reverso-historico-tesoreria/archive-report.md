# Archive Report: desconciliar-reverso-historico-tesoreria

**Archivado**: 2026-10-23
**Verdict de verify**: PASS — ver `verify-report.md` en esta misma carpeta
**PR**: #262 (`feat/tesoreria-desconciliar-historico`), merge commit `975dc0e` a `develop`

## Qué se envió (shipped)

Botón **"Desconciliar"** en la pestaña Histórico de tesorería, visible SOLO cuando `validado=1 && !reversado && origen==='TRANSFERENCIA_CLIENTE'`, que reutiliza el `ReversoModal` + orquestador `reversarAbonoDirectoDesdeTesoreria` ya mergeados (capacidad `tesoreria-reverso-abono-directo`). Permite reversar un ingreso de abono directo que ya fue conciliado por error, sin que antes existiera ninguna acción disponible desde Histórico.

| Pieza | Dónde | Líneas |
|---|---|---|
| Gate de visibilidad "Desconciliar" | `src/features/tesoreria/components/movimientos-table.tsx` — nuevo `<th>` "Acciones" en `HistoricoTable` + `<td>` con botón en `HistoricoRow`, espejo de clases de "Rechazar" en `PendienteRow` | +17 |
| Handler espejo `handleDesconciliarMov` | `src/features/tesoreria/components/conciliacion-tesoreria.tsx` — mirror exacto de `handleReversarMov` leyendo `historico*Result` en vez de `pendiente*Result`; `historicoMovRows` ahora pasa `toMovRow(mov, undefined, handleDesconciliarMov)` | +28 |
| Cobertura nueva | `movimientos-table.test.tsx` (7 tests) + `conciliacion-tesoreria.test.tsx` (2 tests, primera cobertura de ese componente de 824 líneas) | +324 (test) |

Cero cambios en producción fuera de esos dos archivos: `git diff --stat -- src/features/tesoreria/hooks/ src/features/tesoreria/components/reverso-modal.tsx` → vacío.

## Decisiones clave

| Decisión | Alternativa rechazada | Por qué |
|---|---|---|
| Reutilizar el orquestador/modal sin tocarlos | Crear una variante del modal "desde histórico" | `ReversoModal` ya es origen-driven (`esTransferenciaCliente(movimiento?.origen)`), no tab-driven — cero necesidad de nueva rama de código |
| Gate de visibilidad con 3 condiciones (`validado=1 && !reversado && origen===TRANSFERENCIA_CLIENTE`) a nivel de botón, ADITIVO al gate interno del modal | Confiar solo en el gate interno del modal | Histórico no filtra por estado a nivel de query — el guard de UI es la ÚNICA protección contra reverso-de-reverso; ambos gates (botón + modal) coexisten como defensa en profundidad |
| `opacity-50` mantenido, sin tachado literal | Agregar `line-through` | Fuera de alcance explícito desde la proposal; consistente con `PendienteRow` |
| `validado=1` estricto (no `>=`) | Aceptar cualquier estado no-reversado | Pendientes ya cubre `validado=0`; Histórico solo necesita el caso conciliado-por-error |

## Verify: resultado

PASS, cero CRITICAL. Diff de mutación byte-preservado (orquestador, `reversarPagoEnTx`, preview hook, `reverso-modal.tsx` internals sin tocar). Guard crítico reverso-de-reverso probado explícitamente (caso MANDATORIO). 9 tests nuevos + suite completa de tesorería 51/51 verde, incluyendo los 13 tests propios de `reverso-modal.tsx` (prueba funcional, no solo por diff, de que la mutación sigue intacta). Ver `verify-report.md` para el detalle completo (RED/GREEN, evidencia de ejecución, QA manual).

Único hallazgo: WARNING de bookkeeping (checkboxes de `tasks.md` Fase 3-5 sin marcar en el momento del verify pese a trabajo completo) — resuelto antes de este archive.

## Capabilities / specs

**New**: `tesoreria-historico-desconciliar` — copiada completa (full spec, sin main spec previo) a `openspec/specs/tesoreria-historico-desconciliar/spec.md`. 4 requirements, 6 scenarios.

**Modified**: Ninguna. `tesoreria-reverso-abono-directo` se referencia pero no se modifica.

## Epic `reverso-abono-tesoreria` — estado tras este change

El epic de reverso de abono directo ahora tiene, para el caso **sin SAF**:

1. Trazabilidad del ingreso ↔ pago(s) (slice 0a).
2. Preview read-only de facturas afectadas (change `preview-facturas-afectadas-reverso-tesoreria`).
3. Reverso REAL (mutante) atómico: egreso + reapertura CxC en una sola tx (change `reverso-abono-directo-tesoreria-sin-saf`, PRs #258-261).
4. **AMBOS entry points de UI**: "Rechazar" en Pendientes (ya existía) + **"Desconciliar" en Histórico (este change)**.

Con esto, el flujo de reverso de abono directo (sin SAF) queda **completo end-to-end desde las dos pestañas de tesorería**. El epic continúa con el caso SAF (bloqueado, ver abajo) y el epic hermano de saldo disponible-vs-tránsito.

## Carried Forward (prioridad descendente)

1. **Epic: saldo banco disponible (conciliado) vs en tránsito (pendiente) vs total** — `tesoreria/saldo-disponible-vs-transito` (#5686). Próxima prioridad del usuario. Requiere su propia exploración mapeando todos los consumidores de `bancos_empresa.saldo_actual` (POS, NC, pagos, cuadre, reportes, selects) y decidiendo qué saldo usa cada uno. NO es un change liviano — toca un invariante financiero core.
2. **Caso SAF del reverso** (bloqueado) — ver archive de `reverso-abono-directo-tesoreria-sin-saf`. El riesgo de reabrir facturas `ANULADA` fiscalmente (vía NC total) debe bloquearse explícitamente antes de desenredar SAF.
3. **Slice 0b** — helper `resolverDestinoTesoreriaDePago` para el camino batch/lote.
4. **Superficie de consulta de factura** (modal de emisión) — candidato a reusar el orquestador/preview de reverso.
5. **Redondeo fiscal por línea** — `facturas/redondeo-fiscal-por-linea` (#5586).
6. **Rediseño granular de permisos** (post-core) — `permisos/rediseno-granular-post-core` (#5603).
7. **Deuda técnica pre-existente** (documentar, no tocar): `window.prompt` de reverso en Traspasos (inconsistente con el patrón de modal); `movId-fantasma` en `registrarAbonoGlobal`; crash cosmético del runner vitest al cerrar (`emitter.removeListener`, Node 24); ruido de `yarn type-check` a nivel de proyecto (`vitest-globals` no declarados); `try/catch` silencioso preexistente en el camino de egreso directo.

## Archivado

`openspec/changes/desconciliar-reverso-historico-tesoreria/` → `openspec/changes/archive/2026-10-23-desconciliar-reverso-historico-tesoreria/`, mismo patrón `YYYY-MM-DD-{change-name}` que los changes hermanos del epic. Contiene: `proposal.md`, `tasks.md`, `specs/tesoreria-historico-desconciliar/spec.md`, `verify-report.md` (no existía previamente en filesystem — vivía solo en Engram), `archive-report.md` (este archivo). Sin `design.md` — fase de diseño explícitamente saltada en la proposal (spec liviana de visibilidad, mutación ya verificada en el change previo).

## Lineage (Engram)

Observaciones completas bajo `sdd/reverso-abono-tesoreria/*`: `#5688` proposal, `#5689` spec, `#5690` tasks, `#5695` apply-progress, `#5696` verify-report (PASS). Este reporte de archive persiste en `sdd/reverso-abono-tesoreria/archive-report-desconciliar-historico`.
