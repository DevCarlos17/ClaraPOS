# Proposal: Lista de Facturas Afectadas Scrolleable (Panel de Reverso)

> Change: `reverso-modal-facturas-scrolleable` | Phase: propose | Project: clarapos

## Intent

El panel "Facturas afectadas por este reverso" en `reverso-modal.tsx` crece sin límite: con abonos globales (ej. Bs 5.240 → 9 facturas, caso QA confirmado) el modal se alarga indefinidamente porque las filas (`facturasDirectas` + `facturasSaf`) y el footer "Total afectado" son hoy siblings planos dentro de un mismo `div space-y-3`, sin ningún límite de alto. Se requiere acotar visualmente la lista a ~5 facturas visibles y permitir scroll para el resto, manteniendo header y "Total afectado" siempre visibles.

## Scope

### In Scope
- Envolver los dos `<ul>` de filas (`facturasDirectas` + `facturasSaf`, hoy L348-378) en un nuevo wrapper con `max-h-* overflow-y-auto` (convención Tailwind del proyecto, precedente `abono-global-modal.tsx` L584).
- Mover el bloque "Total afectado" (hoy L380-388) para que sea sibling DESPUÉS del wrapper de scroll, no dentro de él — sigue dentro del panel `aplicaPreview && (...)`.
- Header ("Facturas afectadas por este reverso", L318) y warning SAF (L396-401) quedan sin tocar, fuera del área scrolleable.
- Agregar `data-testid` al nuevo wrapper y actualizar `reverso-modal.test.tsx`: assert `className` contiene `overflow-y-auto` + `max-h-*`, y test de regresión con >5 facturas donde "Total afectado" sigue presente/fuera del wrapper.

### Out of Scope
- `DialogContent` de este modal (hoy solo `max-w-md`, sin `max-h-[90vh] overflow-y-auto` como otros dialogs del proyecto). Queda como preocupación futura señalada, no se toca en este change.
- Hook `use-preview-facturas-afectadas.ts`, orquestador y mutación de reverso — ningún cambio de datos/lógica.
- Abrir "Consulta de Factura" al tocar una fila (change separado, ver Engram `sdd/reverso-abono-tesoreria/proximo-scroll-consulta-factura`).

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
Ninguna — es un cambio de presentación pura (JSX/CSS), no modifica el contrato de `tesoreria-preview-facturas-afectadas` ni ningún requirement de spec existente.

## Approach

- Nuevo `<div data-testid="preview-facturas-lista-scroll" className="max-h-48 overflow-y-auto space-y-3">` envolviendo únicamente los bloques `facturasDirectas` y `facturasSaf` (L348-378 actuales).
- El bloque "Total afectado" (L380-388) pasa a ser sibling después de ese wrapper, dentro del mismo `div` contenedor externo (`space-y-3` original, L347), para que quede siempre visible.
- Valor `max-h-48` como punto de partida (mismo orden de magnitud que precedente `abono-global-modal.tsx max-h-40`); validar visualmente en apply que ~5 facturas quedan visibles antes de que aparezca el scroll (dos `<ul>` con labels propios pueden reducir el conteo efectivo de filas visibles — ajustar si hace falta).
- Sin cambios a props, hooks, tipos ni lógica de negocio.

## Affected Areas

| Area | Impacto |
|---|---|
| `src/features/tesoreria/components/reverso-modal.tsx` | Modified: restructura JSX L344-390 (wrapper scroll + footer como sibling) |
| `src/features/tesoreria/components/__tests__/reverso-modal.test.tsx` | Modified: nuevos asserts de scroll wrapper + regresión >5 facturas |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `max-h-48` deja menos/más de 5 filas visibles por los dos labels de grupo (directas/SAF) | Low | Validación visual manual en apply; ajustable sin tocar lógica |
| Mover "Total afectado" fuera del wrapper rompe un test existente que asume el footer dentro del mismo div `space-y-3` | Low | Revisar asserts actuales de `reverso-modal.test.tsx` antes de aplicar; actualizar selectors si es necesario |

## Rollback Plan

Revertir el commit: vuelve al `div space-y-3` plano sin límite de alto. Sin impacto en datos ni en el hook/mutación de reverso.

## Dependencies

- Ninguna externa. Depende del estado actual de `reverso-modal.tsx` (post PR #268, `rediseno-layout-panel-reverso`, ya mergeado).

## Effort Forecast

| Field | Value |
|---|---|
| Changed lines | ~15-25 modal (restructura JSX) + ~20-30 tests |
| Chained PRs | No, 1 PR |
| 400-line risk | Low |
| Decisión previa a apply | No; spec ligera, sin design phase |

## Verification Plan

- `yarn test:run src/features/tesoreria/components/__tests__/reverso-modal.test.tsx`: wrapper tiene `overflow-y-auto` + `max-h-*`; con >5 facturas "Total afectado" sigue presente y fuera del wrapper; casos LEGACY/empty sin regresión.
- QA manual: abono global con 9 facturas (caso real) → header y footer siempre visibles, lista interna scrollea.

## Success Criteria

- [ ] Lista de filas (`facturasDirectas` + `facturasSaf`) scrollea con `max-h-* overflow-y-auto` cuando excede ~5 facturas
- [ ] Header "Facturas afectadas por este reverso" siempre visible, fuera del scroll
- [ ] "Total afectado" siempre visible, fuera del scroll
- [ ] `yarn test:run` pasa con los nuevos asserts
- [ ] Ningún cambio a hook/orquestador/mutación de reverso
