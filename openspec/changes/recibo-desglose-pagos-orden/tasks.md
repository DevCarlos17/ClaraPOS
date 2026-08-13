# Tasks: Reordenar Secciones y Desglose de Pagos en Recibo de Venta

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 550-750 (recibo-pagos.ts ~130, recibo-pagos.test.ts ~220-300, factura-export.ts ~130, cobro-modal.tsx ~10, venta-exitosa-modal.tsx ~20) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (pure module + tests) -> PR2 (types + threading + both render paths) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — user must confirm feature-branch-chain (both PRs into `feat/recibo-desglose-pagos-orden`, tracker merges to `develop`) vs stacked-to-main |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `recibo-pagos.ts` pure module + full TDD test suite | PR 1 | Base: `feat/recibo-desglose-pagos-orden` (from `develop`). Zero behavior change to app; verified via `yarn test:run` alone. ~350-430 lines. |
| 2 | Type extension + threading (`cobro-modal.tsx`, `venta-exitosa-modal.tsx`) + both render paths (PDF, PNG) + wrap | PR 2 | Base: PR 1's branch (or tracker after PR1 merges). Depends on Unit 1 exports. ~160-200 lines. |

**Staging**: use `git add <file>` per file only. Working tree has untracked noise (`image*.png`, `coverage/`, other `openspec/changes/*` dirs, `.atl/skill-registry.*`) — NEVER `git add -A` / `git add .`.

## Phase 1: Pure Module (Unit 1 / PR 1)

- [x] 1.1 RED: `src/features/ventas/utils/__tests__/recibo-pagos.test.ts` — `agruparPagosPorMetodo`: 2 pagos mismo método suman, método USD muestra $+Bs equiv, método BS solo Bs, ejemplo 3-métodos reconciliando a Bs 1000.
- [x] 1.2 RED: tests `construirCierreRecibo` — VUELTO, SAF, PROPINA, DIFERENCIAL_SOBRANTE, CREDITO (saldoPendUsd>0), null (sin discrepancy ni crédito).
- [x] 1.3 RED: tests `reconciliarTotalBs` — exacto, dentro de tolerancia 0.01, fuera de tolerancia.
- [x] 1.4 RED: tests `wrapCanvasText` — texto corto (1 línea), largo (multi-línea), vacío.
- [x] 1.5 GREEN: implementar `src/features/ventas/utils/recibo-pagos.ts` — tipos `ReciboPagoInput/Linea`, `ReciboCierreTipo/Cierre`, `ReciboDiscrepancyInput` + las 4 funciones (Decimal.js, sin deps DOM/jsPDF).
- [x] 1.6 Verify: `yarn test:run` (recibo-pagos.test.ts) + `yarn type-check:test` limpio.

## Phase 2: Types + Threading (Unit 2 / PR 2)

- [ ] 2.1 `factura-export.ts`: extender `ReciboData`/`BuildReciboDataInput` con `pagos: ReciboPagoLinea[]`, `cierre: ReciboCierre | null` (import de `recibo-pagos.ts`); `buildReciboData` invoca `agruparPagosPorMetodo`/`construirCierreRecibo`.
- [ ] 2.2 `cobro-modal.tsx` (~L501 `onSuccess({...})`): agregar `discrepancy: discrepancy ? { mode, montoUsd, montoBs } : null`.
- [ ] 2.3 `venta-exitosa-modal.tsx`: `VentaExitosaData` (~L19) += `discrepancy: ReciboDiscrepancyInput | null`; `construirRecibo` (~L75) pasa `pagos: ventaData.pagos`, `discrepancy`, `saldoPendUsd` (local ~L73) a `buildReciboData`.

## Phase 3: Render — PNG/Texto (comparte `construirLineasRecibo`)

- [ ] 3.1 Reordenar `construirLineasRecibo` (~L202): bloque emisor ANTES del bloque Nro/Fecha (orden actual es Nro/Fecha -> emisor; objetivo emisor -> Nro/Fecha -> cliente -> artículos -> totales).
- [ ] 3.2 Agregar sección "Métodos de pago" + línea de cierre después de totales, usando `recibo.pagos`/`recibo.cierre`.
- [ ] 3.3 Aplicar `wrapCanvasText` a cada `LineaRecibo.text` en `buildReciboImagenBlob` (~L390); recalcular `alto` desde el conteo de líneas YA envueltas (no `lineas.length`).

## Phase 4: Render — PDF (independiente, NO usa `construirLineasRecibo`)

- [ ] 4.1 `buildReciboPdfBlob` (~L266): orden emisor->nro/fecha->cliente->artículos->totales ya es correcto (solo adición) — agregar `autoTable` (Método | Monto) tras la tabla de totales, luego línea de cierre en negrita si `recibo.cierre !== null`.
- [ ] 4.2 Aplicar `doc.splitTextToSize(text, maxWidth)` a `emisor.nombre/.direccion` y `cliente.nombre/.direccion` en `buildReciboPdfBlob`.

## Phase 5: Verification

- [ ] 5.1 `yarn test:run` suite completa verde (incl. `recibo-pagos.test.ts`).
- [ ] 5.2 `yarn type-check:test` limpio.
- [ ] 5.3 Manual: generar PDF y PNG de una venta con 3 métodos de pago + VUELTO, y otra con remanente a CREDITO — verificar orden, reconciliación y ausencia de desborde de texto.
