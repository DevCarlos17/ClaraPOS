# Proposal: Wizard mobile para Compras y Gastos

## Intent

`compra-form.tsx` (2,729 líneas) y `gasto-form.tsx` (1,482 líneas) son formularios largos de una sola pantalla, usables en desktop pero inviables en mobile (scroll extenso, campos fiscales densos, sin agrupación por pasos). Se necesita una experiencia mobile equivalente en wizard de pasos, sin tocar ni arriesgar los formularios desktop que ya están validados en producción con lógica fiscal crítica (tasa dual, kardex, gating de PVP).

## Scope

### In Scope
- `WizardStepIndicator` y `WizardAcumulador` como primitivas compartidas nuevas (`src/components/shared/`).
- `GastoWizardSheet` (3 pasos: identificación, monto, pagos) sobre `BottomSheet` + Zustand store con recuperación de borrador.
- `CompraWizardSheet` (3 pasos: cabecera, productos, cargos/pagos) sobre `BottomSheet` + Zustand store, incluyendo el mini-modal de gating de PVP apilado (`pvp-confirm-sheet.tsx`).
- Extracción de lógica fiscal a hooks compartidos (`useGastoTotales`, `useCompraHeaderTotales`, `useCargosTotal`, `useCompraLineasTotales`, `usePvpDecision`) consumidos por AMBOS: formularios desktop (refactorizados para usar el hook, mismo comportamiento) y los nuevos pasos del wizard.
- Integración de rutas: los botones "Registrar compra" (`compra-list.tsx`) y "+ Agregar gasto" (`gastos-dashboard.tsx`) bifurcan por `useMobile(1024)` entre form desktop existente y wizard mobile nuevo.

### Out of Scope
- Cambios estructurales a `compra-form.tsx` o `gasto-form.tsx` más allá de la extracción de hooks (su UI y flujo de confirmación por Dialog permanecen intactos).
- Retenciones IVA/ISLR (feature separada).
- Rediseño responsive de otros formularios del sistema.
- Wizard mobile para otros módulos (ventas, clientes, etc.).

## Capabilities

### New Capabilities
- `gasto-wizard-mobile`: flujo de 3 pasos (identificación, monto, pagos) en `BottomSheet` para registrar un gasto en mobile, con acumulador visible y recuperación de borrador.
- `compra-wizard-mobile`: flujo de 3 pasos (cabecera, productos, cargos/pagos) en `BottomSheet` para registrar una compra en mobile, incluyendo gating de PVP por nivel de precio vía mini-modal apilado.

### Modified Capabilities
- None — los formularios desktop de compras y gastos no cambian a nivel de requisitos observables; solo su implementación interna delega el cálculo fiscal a hooks compartidos (mismo resultado, mismo comportamiento).

## Approach

Seguir el patrón ya probado de `nueva-cita-wizard.tsx` + `cita-wizard-store.ts`: cada wizard es un store Zustand con estado por paso + navegación, un orquestador que renderiza el `WizardStepIndicator` y el paso activo, y un `BottomSheet` wrapper gateado por `useMobile(1024)`. La lógica fiscal (tasa dual, IVA, totales, derivación de PVP) se extrae a hooks puros reutilizados por desktop y mobile — nunca duplicada. El gating de PVP usa un `Sheet` secundario apilado (mismo patrón que `nota-credito-pos-modal.tsx`), preservando las reglas de negocio: no se puede avanzar sin una decisión de PVP por nivel de precio.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/shared/wizard-step-indicator.tsx` | New | Extraído de `nueva-cita-wizard.tsx` |
| `src/components/shared/wizard-acumulador.tsx` | New | Resumen colapsable de líneas + total acumulado |
| `src/stores/gasto-wizard-store.ts` | New | Estado Zustand del wizard de gasto + borrador |
| `src/stores/compra-wizard-store.ts` | New | Estado Zustand del wizard de compra + borrador |
| `src/features/contabilidad/components/wizard/**` | New | Pasos y orquestador de `GastoWizardSheet` |
| `src/features/compras/components/wizard/**` | New | Pasos, orquestador y `pvp-confirm-sheet.tsx` de `CompraWizardSheet` |
| `src/features/contabilidad/.../gasto-form.tsx` | Modified | Refactor interno: consume `useGastoTotales` (sin cambio de comportamiento) |
| `src/features/compras/.../compra-form.tsx` | Modified | Refactor interno: consume hooks fiscales extraídos (sin cambio de comportamiento) |
| `gastos-dashboard.tsx`, `compra-list.tsx` | Modified | Bifurcación `useMobile(1024)` en el botón de alta |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Extraer hooks fiscales rompe el comportamiento desktop (tasa dual, IVA, PVP) | Med | Extracción 1:1 sin cambio de fórmulas; verificar con los mismos casos manuales que hoy usa `compra-form.tsx`/`gasto-form.tsx` antes de mergear W2/W4 |
| PVP gating mal implementado en el mini-modal permite guardar sin decisión por nivel | High impacto si ocurre | Reusar `usePvpDecision` compartido con el desktop; mismo guard de "no avanzar sin decisión" |
| Migración de borrador (`useGastoBorradorStore` → wizard store) pierde datos de sesiones en curso | Low | Mantener misma clave de localStorage o migración explícita, documentada en W2 |
| Slice W4 (PVP + productos) es de alto riesgo y el más grande | Med | Diseñarlo como slice independiente al final, con su propio budget de PR |

## Rollback Plan

Cada slice (W1–W5) es un conjunto de archivos nuevos o cambios acotados detrás de `useMobile(1024)`. Revertir el commit/PR de un slice no afecta el flujo desktop porque los forms originales permanecen como fallback en la rama `else` del gate. En el peor caso, revertir W5 (integración de rutas) desactiva instantáneamente los wizards sin borrar el código nuevo.

## Dependencies

- Patrón de referencia: `src/features/citas/components/wizard/nueva-cita-wizard.tsx` + `cita-wizard-store.ts`.
- Patrón de sheet apilado: `nota-credito-pos-modal.tsx` (portalContainer).
- `useMobile` hook existente (`src/hooks/use-mobile.ts`).

## Success Criteria

- [ ] Un usuario en mobile (`<1024px`) puede completar un gasto y una compra end-to-end vía wizard, incluyendo gating de PVP, sin abrir el form desktop.
- [ ] `compra-form.tsx` y `gasto-form.tsx` en desktop no cambian su comportamiento observable (mismos resultados fiscales) tras la extracción de hooks.
- [ ] Ningún registro creado desde el wizard difiere en estructura de datos del creado desde el form desktop.
