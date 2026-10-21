# Tasks: Preview "Facturas Afectadas" en Reverso de Tesorería (read-only)

## Review Workload Forecast

| Slice | Content | Estimated changed lines | 400-line budget risk | Chained PRs recommended | Decision needed before apply |
|---|---|---|---|---|---|
| 1a-hook | `use-preview-facturas-afectadas.ts` (lectura, reusa `detectarLoteSafDePago`) + tests Vitest (5 escenarios) | 200-250 | Low | Yes | No |
| 1b-panel | Fix `esTransferenciaCliente` + panel read-only en `reverso-modal.tsx` | 100-150 | Low | Yes | No |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low
```

Delivery strategy ya resuelta por la proposal (#5587): 2 PRs, cada uno
stacked-to-main e independientemente bajo 400 líneas. 1b depende de 1a (PR #2
base = main con PR #1 ya mergeado). No se requiere `size:exception`.

## Do NOT Touch

- `detectarLoteSafDePago` (`reversa-pago-saf.ts`) — se importa y reusa as-is, cero modificaciones.
- `reversarMovBancario`/`reversarMovCajaFuerte` — la mutación real del reverso no se toca en ningún slice.
- `pagos_aplicaciones` — no autoritativa para facturas directas (`pagos.venta_id` basta), no se consulta.
- Cualquier permiso nuevo — panel read-only, sin gate adicional (ver proposal, Out of Scope).

---

## Slice 1a-hook — hook de lectura + tests (PR #1)

- [x] 1a.1 [RED] `src/features/tesoreria/hooks/__tests__/use-preview-facturas-afectadas.test.ts`: mockear `@/core/db/powersync/db` (`getAll`) y `@/features/cxc/hooks/reversa-pago-saf` (`detectarLoteSafDePago`), mismo patrón que `reversa-pago-saf.test.ts`. Escribir 5 tests FALLANDO (función aún no existe):
  - simple: 1 fila puente → 1 pago con `venta_id` → 1 factura directa.
  - abono-global: ingreso `38201beb`, 2 filas puente ($1 c/u) → facturas `8954d635`/`ab7d1bab`, total=$2.
  - SAF: 1 pago sin `venta_id` cuyo `detectarLoteSafDePago` devuelve `generatedLote=true` con `facturasAfectadas` → aparecen etiquetadas "SAF", distintas de las directas.
  - exclusión: fila puente con `pagos.is_reversed=1` → NO aparece en el resultado.
  - legacy: 0 filas puente para el `ingreso_id` → estado `LEGACY` (no `0 facturas afectadas`).
- [x] 1a.2 [GREEN] Crear `src/features/tesoreria/hooks/use-preview-facturas-afectadas.ts`: función pura `previewFacturasAfectadas(empresaId, ingresoId)` (no `useQuery` reactivo). Query 1: `movimientos_bancarios_pagos` JOIN `pagos` (`WHERE ingreso_id = ? AND empresa_id = ? AND (is_reversed IS NULL OR is_reversed = 0)`). Separar filas con `venta_id` no-NULL (directas, JOIN `ventas`) de las que no. Para CADA `pago_id` de la query (incluidas las directas, no-op barato), llamar `detectarLoteSafDePago(empresaId, pagoId)` y acumular `facturasAfectadas` si `generatedLote=true`. Retornar `{ estado: 'OK' | 'LEGACY', facturasDirectas, facturasSaf, totalUsd }`.
- [x] 1a.3 Verify: `yarn test:run src/features/tesoreria/hooks/__tests__/use-preview-facturas-afectadas.test.ts` (6/6 verde) + `yarn type-check:test` sin errores nuevos (baseline ya documentado en changes previos).

## Slice 1b-panel — panel UI (PR #2, depende de PR #1)

- [x] 1b.1 `src/features/tesoreria/components/reverso-modal.tsx`: fix del gate — extraído a `src/features/tesoreria/utils/es-transferencia-cliente.ts` (`esTransferenciaCliente(origen) => origen === 'TRANSFERENCIA_CLIENTE'`), quitando el check muerto `doc_origen_tipo === 'PAGO'`. El modal ahora computa `aplicaPreview = esTransferenciaCliente(movimiento?.origen)`.
- [x] 1b.2 [test] Condición extraída como predicado aislado puro — `src/features/tesoreria/utils/__tests__/es-transferencia-cliente.test.ts` (4 tests: TRANSFERENCIA_CLIENTE→true, otro origen→false, null→false, undefined→false). RED→GREEN confirmado por ejecución real.
- [x] 1b.3 Bloque de warning roto reemplazado por el panel real en `reverso-modal.tsx`: `useEffect` con deps primitivos (`isOpen, aplicaPreview, movimientoId, empresaId`), snapshot on-demand (no reactivo, con flag `cancelled` en el cleanup), llama a `previewFacturasAfectadas` (hook 1a) y renderiza: grupo "Pago directo", grupo "Afectada por saldo a favor (SAF)" (visualmente distinguidos con `data-testid="preview-facturas-afectadas"`), total con nota "equivale al monto del reverso", estado `LEGACY` con copy distinto ("Sin trazabilidad..."), estado `OK` con 0 facturas con copy distinto de LEGACY ("No se encontraron facturas..."), y gate `origen !== TRANSFERENCIA_CLIENTE` → el panel no se renderiza en absoluto (sin "no aplica" residual, sin llamar al hook). Sin botones de acción (confirmado por test).
- [x] 1b.4 Verify: `yarn test:run src/features/tesoreria` → 26/26 verde (incluye 1a-hook sin regresión). `yarn type-check:test` → 3 errores baseline preexistentes, 0 nuevos (mismos de 1a: `producto-form-aviso-borrador.test.tsx`, `producto-form-edit-open-mask.test.tsx`, `use-pwa-update.ts`). QA manual en staging PENDIENTE del usuario (ver `manual_qa_steps` en el reporte de apply).
