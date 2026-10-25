# Proposal: Panel de facturas afectadas — moneda nativa (Bs) + método de pago

## Intent

El panel de facturas afectadas del reverso de tesorería (`reverso-modal.tsx`) solo muestra `montoAplicadoUsd` ("$1.00"). El usuario no ve el monto en la moneda original de cobro (Bs) ni el método de pago usado, a diferencia de "Consulta de Factura" que ya muestra ambos ("$1.00 (Bs. 500,00)" + nombre del método). Antes de reversar un abono, el usuario necesita ese contexto para confirmar que está reversando lo correcto.

## Scope

### In Scope
- Extender la query puente de `use-preview-facturas-afectadas.ts`: agregar `pagos.tasa`, `pagos.metodo_cobro_id`, `pagos.moneda_id` + JOIN `metodos_cobro`/`monedas` (mismo patrón que `usePagosFactura` en `use-cxc.ts`).
- Extender `FacturaAfectadaPreview`: `montoAplicadoNativo` (= `montoAplicadoUsd * tasa`), `monedaCodigo`, `metodoNombre`, `tasa`.
- Enriquecer `facturasSaf` en el sitio del spread del loop (no dentro de `detectarLoteSafDePago`).
- Renderizar en `reverso-modal.tsx` el monto dual-moneda vía `formatMontoPago` (reutilizado de `factura-export.ts`) + el nombre del método.
- Tests: `use-preview-facturas-afectadas.test.ts` (fixtures + asserts de los nuevos campos) y `reverso-modal.test.tsx` (panel renderiza Bs + método).

### Out of Scope
- La mutación del reverso y el orquestador (`use-reverso-abono-directo.ts`) — sin cambios.
- El fix del bug "Bs $500.00" en el header del modal (PR #266, ya mergeado) — no se reabre.
- Reutilizar `ConsultaFacturaModal` desde este panel ("Ver factura") — change futura, tracked en topic #5746.
- El épico de saldo-en-tránsito.

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `tesoreria-preview-facturas-afectadas`: el preview ahora MUST incluir, por cada factura afectada (directa o SAF), el monto en moneda nativa, el código de moneda y el nombre del método de cobro usado en el pago originante; el panel MUST renderizarlos junto al monto USD.

## Approach

1. **Hook** (`use-preview-facturas-afectadas.ts`): extender el SELECT puente con columnas de `pagos` + 2 JOINs nuevos (`metodos_cobro`, `monedas`), mismo patrón ya probado en `usePagosFactura`. Derivar `montoAplicadoNativo` como `montoAplicadoUsd * tasa` (granularidad de la fila puente, NUNCA `pagos.monto` directo — un pago puede repartirse en N filas puente). Aplicar el mismo enriquecimiento a `facturasDirectas` y a cada entrada de `facturasSaf` en el loop (merge con los campos de la fila puente actual).
2. **Panel** (`reverso-modal.tsx`): importar `formatMontoPago` de `factura-export.ts`, mapear cada entrada a un objeto compatible con `ReciboPagoLinea` y renderizar `formatMontoPago(...)` + `metodoNombre`.
3. **Tests primero** (TDD por convención del repo): extender fixtures existentes con las nuevas columnas/campos antes de tocar implementación.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/tesoreria/hooks/use-preview-facturas-afectadas.ts` | Modified | +2 JOINs, +5 columnas SELECT, extender `FacturaAfectadaPreview`, enriquecer `facturasDirectas`/`facturasSaf` |
| `src/features/tesoreria/components/reverso-modal.tsx` | Modified | Renderizar monto dual-moneda (`formatMontoPago`) + nombre de método en el panel de facturas afectadas (L308-333) |
| `src/features/tesoreria/hooks/__tests__/use-preview-facturas-afectadas.test.ts` | Modified | Extender fixtures + asserts de `montoAplicadoNativo`/`monedaCodigo`/`metodoNombre`/`tasa` |
| `src/features/tesoreria/components/__tests__/reverso-modal.test.tsx` | Modified | Extender fixtures del panel + asserts de render (Bs + método) |
| `src/features/ventas/utils/factura-export.ts` | Reference only | `formatMontoPago` se importa, no se modifica |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Nuevos JOINs rompen aislamiento `empresa_id` | Low | `metodos_cobro`/`monedas` se unen por FK de `pagos`, no por empresa; el filtro existente `mbp.empresa_id = ?` sigue siendo la frontera — verificar explícitamente en sdd-verify |
| `detectarLoteSafDePago` se modifica por error (comparte contrato con `use-reverso-abono-directo.ts`) | Low | Enriquecer SOLO en el sitio del spread del loop, no dentro de la función pura |
| Derivar monto nativo con `pagos.monto` en vez de `montoAplicadoUsd * tasa` (muestra monto completo del pago, no el aplicado a esta fila puente) | Medium si no se revisa | Fijado explícitamente en el approach y en specs; cubierto por test con fixture de reparto parcial |

## Rollback Plan

Cambio de solo lectura (sin mutaciones, sin migraciones de esquema). Revertir el commit restaura el hook y el panel a su estado anterior (solo `montoAplicadoUsd`); no hay estado persistido que limpiar.

## Dependencies

- Ninguna externa. Reutiliza catálogos ya sincronizados (`metodos_cobro`, `monedas`) y el formateador `formatMontoPago` ya existente.

## Success Criteria

- [ ] El hook retorna `montoAplicadoNativo`, `monedaCodigo`, `metodoNombre`, `tasa` por cada factura (directa y SAF)
- [ ] El panel muestra `"$1.00 (Bs. 500,00)"` + nombre del método (ej. "BANESCO PAGO MOVIL")
- [ ] `empresa_id` sigue filtrando correctamente tras los nuevos JOINs
- [ ] `detectarLoteSafDePago` queda sin cambios (diff vacío en ese archivo)
- [ ] `yarn test:run` pasa, incluyendo las nuevas aserciones en ambos archivos de test
