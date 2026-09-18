# Archive Report: nc-refund-tesoreria

**Archived**: 2026-09-18
**Branch**: `feat/nc-refund-tesoreria` (local, not pushed, not merged)
**Verdict de verify**: PASS WITH WARNINGS (ver `verify-report.md` en esta misma carpeta)
**Commits en la rama**: 14 (`a890ba0`..`ce39d2e`)

## Qué se envió (shipped)

`REFUND_TESORERIA` — última de las 5 modalidades de liquidación de Notas de Crédito, hasta ahora bloqueada con un `throw` explícito en `crearNotaCredito` — quedó completamente implementada end-to-end en la ruta administrativa (`crear-ncr-modal.tsx`, entry point `TRADICIONAL`):

- **Multi-fuente**: un mismo reembolso puede repartirse en N líneas entre banco(s) y/o caja fuerte, `egresoParams` como array desde el día 1 (`EgresoTesoreriaLinea[]`).
- **Tasa histórica**: cada línea se ingresa en la moneda nativa de la cuenta y se convierte a USD con `notas_credito.tasa_historica`, nunca la tasa vigente.
- **Tope + SAFC**: la suma de egresos no puede exceder el monto de la NC (guard a nivel de función, antes de cualquier escritura); el remanente no reembolsado se registra como SAFC reusando literal el bloque existente de `SALDO_FAVOR`.
- **Guard de caja fuerte** reutilizado (mismo patrón que traspasos); bancos sin guard de sobregiro, de forma consistente con el resto del sistema (no-goal explícito).
- **Gate anti-fraude** corregido: `egresoParams` pasó de objeto único a array, y se cerró el gotcha de `[]` truthy (`Array.isArray(...) && .length > 0` explícito).
- **Referencia por línea**: cada egreso admite una referencia libre opcional, visible luego en la evolución de la factura ("Ref: X").
- **UI**: sub-selector de dos etapas dentro de "Devolver dinero" → "Tesorería" (activa) / "Sesión de caja activa" (deshabilitada, "Próximamente"); selector de cuenta con saldo visible en moneda nativa; cálculo en vivo de pendiente por reembolsar; confirmación de saldo a favor cuando aplica.
- **Evolución de factura**: la sección de evolución de `ConsultaFacturaModal` ahora muestra, anidado bajo cada NC, qué cuenta(s) de tesorería pagaron el reembolso (Enhancement B, commit `ce39d2e`) — lectura/render puro, sin tocar el motor de escritura.
- **Migraciones**: `0093_nc_refund_tesoreria_origen.sql` agrega `'REEMBOLSO_NCR'` al CHECK de `origen` en `movimientos_bancarios` y `mov_caja_fuerte` (idempotente, patrón `0035`/`0077`/`0091`). `0094_fix_nota_credito_sum_self_count.sql` corrige un bug de doble conteo en el trigger `validate_nota_credito_insert()` (excluye `id <> NEW.id` del `SUM`) — bug genérico a las 5 modalidades, pero solo disparado en la práctica por `REFUND_TESORERIA` al agregar escrituras extra dentro del mismo batch de PowerSync que aumentan la superficie de reintentos. **Ambas migraciones ya fueron aplicadas por el usuario en Supabase.**
- Fixes de QA adicionales: tipo `Decimal.Value`→`DecimalInput` en `refund-tesoreria-form.tsx`; Bs=0 en la línea SAFC de evolución corregido con fallback a tasa histórica + persistencia de `tasa_pago` en la NC.

**Tests**: 1534 passed / 3 failed (1537 total) — las 3 fallas son el flake pre-existente de PowerSync (`Worker is not defined` en jsdom, `cliente-detalle.test.tsx`/`cxc-cliente-detalle.test.tsx`), confirmado idéntico a la baseline de `develop`, cero fallas nuevas atribuibles a este change.

## Desviación preservada (documentada, no un defecto)

El selector "Crédito a favor" del modal admin sigue mapeando a `SALDO_FAVOR`, **no** a `AJUSTE_CXC` como pedía el delta spec original. El código y los ~48 tests pre-existentes (no tocados por este change) siempre mapearon así; el propio texto del escenario del spec decía "sin cambios respecto al comportamiento existente", contradiciendo la modalidad `AJUSTE_CXC` que el mismo requisito nombraba. Se juzgó que era un slip de autoría del spec, no una instrucción real de cambiar un mapeo financiero vivo, ortogonal al alcance de `REFUND_TESORERIA`. Se preservó `SALDO_FAVOR` y se flageó — ver nota de desviación en `openspec/specs/notas-credito-admin/spec.md` (Requirement "Selector...con sub-opciones de tesorería"). Si `AJUSTE_CXC` era la intención real, requiere su propio change dedicado con sus propios tests.

## Diferido explícitamente (fuera de alcance de este change)

- **Sub-opción "Sesión de caja activa"** para "Devolver dinero" — permanece deshabilitada; la forma de datos (`egresoParams` array, `destino` union type) quedó preparada para extenderse sin romper compatibilidad.
- **Regla de sobregiro bancario** (por usuario o por cuenta) — política futura de tesorería; los bancos no tienen guard de sobregiro en ningún flujo del sistema hoy (CxP, Gastos, y ahora NC), no es una regresión de este change.
- **"Excedente como nueva CxC"** (reembolso > monto de la NC registrado como deuda nueva en vez de rechazarse) — futuro.
- **`nota-credito-pos-modal.tsx` (POS-express)** — `REFUND_TESORERIA` sigue excluida deliberadamente de ese flujo; confirmado 0 líneas de diff en ese archivo.
- **Bug de préstamos/`vencimientos_cobrar` huérfanos** — reportado por el usuario durante QA de este change, pero causalmente no relacionado a `REFUND_TESORERIA`; diferido a un change futuro dedicado, sin fix aplicado aquí.

## Specs sincronizados

| Capability | Acción | Detalle |
|---|---|---|
| `notas-credito-liquidacion` | **Creado** (`openspec/specs/notas-credito-liquidacion/spec.md`) | No existía base spec — el delta llegó marcado "MODIFIED" porque documenta comportamiento de producción pre-SDD, nunca antes especificado. Se copió como spec inicial (7 requisitos: 2 sobre REFUND_TESORERIA/gate + 5 nuevos sobre conversión/multi-fuente/tope/SAFC/guard caja fuerte), quitando las anotaciones "(Previously: ...)" propias del delta. La Purpose documenta explícitamente que las otras 4 modalidades (EFECTIVO_REAL, SALDO_FAVOR, COMPENSACION_VENTA, AJUSTE_CXC) siguen sin spec formal — gap pre-existente, no de este change. |
| `notas-credito-admin` | **Actualizado** (`openspec/specs/notas-credito-admin/spec.md`) | Reemplazado el requisito "Selector...como placeholder" por su versión habilitada con sub-opciones de tesorería (título, cuerpo y 6 escenarios); agregado el nuevo requisito "Saldo disponible visible en el selector de cuenta de tesorería" (1 escenario). Actualizada la lista "Diferido a un change futuro" del Purpose: se removió `REFUND_TESORERIA`/tesorería (ya resuelto) y se agregaron los 3 items diferidos de este change (sesión de caja activa, excedente-como-CxC, sobregiro bancario); se agregó una línea "Resuelto por nc-refund-tesoreria" para trazabilidad. |

No hubo conflictos ni ambigüedad de merge — ningún requisito modificado por este delta fue tocado concurrentemente por otro change activo.

## Archivado

`openspec/changes/nc-refund-tesoreria/` → `openspec/changes/archive/2026-09-18-nc-refund-tesoreria/`, siguiendo el mismo patrón `YYYY-MM-DD-{change-name}` usado por los 20 changes ya archivados (ver `2026-09-05-notas-credito-ruta-administrativa` como referencia directa — misma pareja de capabilities). Contiene: `proposal.md`, `specs/` (2 dominios), `design.md`, `tasks.md`, `verify-report.md`, `archive-report.md` (este archivo), más 3 documentos de exploración (`exploration.md`, `delta-refund-vs-saf.md`, `nc-full-map-A-emision-liquidacion.md`, `nc-full-map-B-efectos-integraciones.md`).

## Carpetas NO tocadas (confirmado)

- `openspec/changes/nc-cuadre-sesion/` — exploración Fase 1 de un change futuro separado (cuadre de sesión), untracked, dejada exactamente como estaba.
- `openspec/changes/notas-credito-admin/` — exploración de scope distinto/anterior, untracked, dejada exactamente como estaba.

## Lineage (Engram)

Observaciones completas bajo `sdd/nc-refund-tesoreria/*`: `#3647` explore, `#3677` delta-vs-saf, `#3686` decision (scope), `#3688` proposal, `#3689` spec, `#3691` design, `#3697` tasks, `#3700` bugfix (Decimal.Value), `#3702` session_summary (apply), `#3705` impacto migración 0093, `#3709` verify-report, `#3710` session_summary (verify), `#3711` saf-model-verification, `#3713` mejora futura (SAF como lotes), `#3752` bugfix migración 0094, `#3760` diagnóstico Bs=0 evolución, `#3761` fix Bs=0 + tasa_pago, `#3776` enhancement B (métodos de reembolso en evolución).
</content>
