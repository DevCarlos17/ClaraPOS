# Design: Wizard mobile para Compras y Gastos

> Nota de tamaño: este documento excede la guía general de 800 palabras del skill `sdd-design` porque el change involucra 2 wizards completos + extracción 1:1 de lógica fiscal crítica (bimonetaria, PVP). El nivel de detalle es requerido para que `sdd-tasks` pueda planificar sin ambigüedad, según lo pedido explícitamente por el orquestador.

## Technical Approach

Clonar el patrón `nueva-cita-wizard.tsx` + `cita-wizard-store.ts` para dos wizards nuevos (`GastoWizardSheet`, `CompraWizardSheet`), cada uno con su propio store Zustand (estado por paso, sin `persist` middleware — draft manual vía `localStorage.setItem`, igual que `cita-wizard-store.ts`). La lógica fiscal se extrae de `compra-form.tsx`/`gasto-form.tsx` a módulos puros consumidos por AMBOS (desktop refactorizado + wizard), nunca duplicada. El gating de PVP usa un segundo `Sheet` apilado sobre el `BottomSheet`, requiriendo extender `sheet.tsx` para soportar `portalContainer` (hoy solo `DialogContent` lo soporta).

## Architecture Decisions

| Decisión | Elegido | Alternativas | Razón |
|---|---|---|---|
| Persistencia draft compra | Store propio (`compra_wizard_draft`, clave nueva) | Reusar patrón de `gasto-borrador-store` | `compra-form.tsx` NO tiene store de borrador hoy (verificado: 0 matches) — greenfield, sin riesgo de migración |
| Persistencia draft gasto | `GastoWizardStore` DELEGA a `useGastoBorradorStore` existente (mismo `guardar()`/`limpiar()`, misma clave `clarapos-gasto-borrador`) | Segunda clave localStorage paralela | Único origen de verdad: un borrador iniciado en mobile es resumible en desktop y viceversa — mitiga el riesgo "pérdida de datos" del proposal sin duplicar storage |
| Naming `usePvpDecision` | Módulo de **funciones puras** `compra-pvp-decision.ts` (no un React hook) | Hook real con `useState` interno | Debe ser invocable desde acciones de Zustand (`compra-wizard-store.ts`), que no pueden llamar hooks de React. El prefijo `use*` del proposal se mantiene como nombre de archivo/export por continuidad, pero la implementación es funciones puras testeables sin renderer |
| Consolidación de hooks de totales de compra | UN hook `useCompraDesgloseUsd` (no 3 como sugiere el proposal: `useCompraHeaderTotales`/`useCargosTotal`/`useCompraLineasTotales`) | 3 hooks separados | Los 3 cálculos propuestos comparten dependencias en cascada (cargos dependen de tasa+moneda, que dependen de cabecera); 3 hooks separados introducen orden de composición fragile. Un hook único con `useMemo` interno es más testeable como unidad y evita bugs de ordering entre hooks |
| Stacking del mini-modal PVP | Extender `sheet.tsx` (`SheetContent`) para aceptar `container` (mismo patrón que `dialog.tsx` ya tiene) | Portal manual custom | Reutiliza el patrón ya probado (`portalContainer` en `nota-credito-pos-modal.tsx`); Radix `Portal.container` acepta cualquier `Element`, no solo `<dialog>` nativo — el `SheetContent` del wizard exterior sirve como container |

## Data Flow

```
[compra-list.tsx] ──useMobile(1024)──┬─→ CompraForm (desktop, sin cambios de comportamiento)
                                       └─→ CompraWizardSheet
                                             └─ BottomSheet
                                                 ├─ WizardStepIndicator
                                                 ├─ WizardAcumulador (sticky)
                                                 └─ [PasoCabecera | PasoProductos | PasoCargosPagos]
                                                        │              │
                                                        │        PvpConfirmSheet (Sheet apilado,
                                                        │        portalContainer = SheetContent ref)
                                                        ▼
                                             compra-wizard-store.ts (Zustand)
                                                        │
                                        ┌───────────────┼────────────────────┐
                                        ▼                                    ▼
                          useCompraDesgloseUsd (useMemo puro)   compra-pvp-decision.ts (funciones puras)
                                        ▲                                    ▲
                                        └──────── compra-form.tsx (refactor, mismo consumo) ───┘

[gastos-dashboard.tsx] ──useMobile(1024)──┬─→ GastoForm (desktop)
                                            └─→ GastoWizardSheet → gasto-wizard-store.ts (Zustand)
                                                                          │
                                                          ┌───────────────┴───────────┐
                                                          ▼                            ▼
                                              useGastoTotales (useMemo puro)   useGastoBorradorStore
                                                          ▲                     (draft compartido)
                                                          └── gasto-form.tsx (refactor) ──┘
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/components/shared/wizard-step-indicator.tsx` | Create | Extraído del bloque de indicador de `nueva-cita-wizard.tsx` (líneas 210-257), generalizado con props `{steps, currentStep, onStepClick}` |
| `src/components/shared/wizard-acumulador.tsx` | Create | Resumen colapsable sticky (ver Sección 6) |
| `src/features/citas/components/wizard/nueva-cita-wizard.tsx` | Modify | Consume `WizardStepIndicator` (sin cambio de comportamiento) |
| `src/components/ui/sheet.tsx` | Modify | `SheetContent` acepta `container` y lo reenvía a `SheetPortal` (mismo patrón que `dialog.tsx` línea 51/67) |
| `src/components/shared/bottom-sheet.tsx` | Modify | Reenvía `portalContainer` opcional a `SheetContent`; expone el nodo `SheetContent` vía `contentRef` prop para que un Sheet hijo pueda apilarse |
| `src/stores/gasto-wizard-store.ts` | Create | Store del wizard de gasto (ver contrato abajo) |
| `src/stores/compra-wizard-store.ts` | Create | Store del wizard de compra (ver contrato abajo) |
| `src/features/contabilidad/lib/use-gasto-totales.ts` | Create | Hook fiscal extraído 1:1 de `gasto-form.tsx` L470-552 |
| `src/features/inventario/lib/use-compra-desglose-usd.ts` | Create | Hook fiscal extraído 1:1 de `compra-form.tsx` L443-568 |
| `src/features/inventario/lib/compra-pvp-decision.ts` | Create | Funciones puras extraídas de `compra-form.tsx` L713-956 (`getCostoNuevoUsdForLinea`, `construirPvpNiveles`, `aplicarDecisionNivel`, `actualizarPvpInput`, `actualizarMargenInput`) |
| `src/features/contabilidad/components/gasto-form.tsx` | Modify | Reemplaza bloque L470-552 por `useGastoTotales(...)`; sin cambio de comportamiento observable |
| `src/features/inventario/components/compras/compra-form.tsx` | Modify | Reemplaza L443-568 por `useCompraDesgloseUsd(...)` y L713-956 por llamadas a `compra-pvp-decision.ts`; sin cambio de comportamiento observable |
| `src/features/contabilidad/components/wizard/paso-identificacion.tsx` | Create | Paso 1 gasto |
| `src/features/contabilidad/components/wizard/paso-monto.tsx` | Create | Paso 2 gasto |
| `src/features/contabilidad/components/wizard/paso-pagos.tsx` | Create | Paso 3 gasto |
| `src/features/contabilidad/components/wizard/gasto-wizard.tsx` | Create | Orquestador |
| `src/features/contabilidad/components/wizard/gasto-wizard-sheet.tsx` | Create | Wrapper `BottomSheet` |
| `src/features/inventario/components/compras/wizard/paso-cabecera.tsx` | Create | Paso 1 compra |
| `src/features/inventario/components/compras/wizard/paso-productos.tsx` | Create | Paso 2 compra |
| `src/features/inventario/components/compras/wizard/pvp-confirm-sheet.tsx` | Create | Mini-modal PVP apilado |
| `src/features/inventario/components/compras/wizard/paso-cargos-pagos.tsx` | Create | Paso 3 compra |
| `src/features/inventario/components/compras/wizard/compra-wizard.tsx` | Create | Orquestador |
| `src/features/inventario/components/compras/wizard/compra-wizard-sheet.tsx` | Create | Wrapper `BottomSheet` |
| `src/features/contabilidad/components/gastos-dashboard.tsx` | Modify | Bifurcación `useMobile(1024)` en botón "+ Agregar gasto" |
| `src/features/inventario/components/compras/compra-list.tsx` | Modify | Bifurcación `useMobile(1024)` en botón "Registrar compra" |

## Interfaces / Contracts

### `GastoWizardState` (Zustand, `src/stores/gasto-wizard-store.ts`)

```typescript
interface PagoWizardGasto {
  id: string
  metodo_cobro_id: string
  banco_empresa_id: string
  moneda: 'USD' | 'BS'
  monto: string            // string input, igual a PagoRow de gasto-form.tsx
  referencia: string
}

interface GastoWizardState {
  step: 1 | 2 | 3
  // Paso 1 — Identificación
  nroFactura: string; nroControl: string; cuentaId: string; proveedorId: string
  descripcion: string; fecha: string; observaciones: string
  // Paso 2 — Monto
  monedaFactura: 'USD' | 'BS'; usaTasaParalela: boolean
  tasaInterna: string; tasaInternaManual: boolean; tasaProveedor: string
  montoFactura: string
  tipoImpuesto: 'Gravable' | 'Exento' | 'Exonerado'; porcentajeIva: string
  // Paso 3 — Pagos
  pagos: PagoWizardGasto[]
  destinoCobro: 'CAJA' | 'TESORERIA'; sesionActivaId: string | null
  // Sheet + navegación
  sheetOpen: boolean
  openSheet(): void
  closeSheet(): void
  setStep(step: 1 | 2 | 3): void
  setIdentificacion(patch: Partial<Pick<GastoWizardState,
    'nroFactura'|'nroControl'|'cuentaId'|'proveedorId'|'descripcion'|'fecha'|'observaciones'>>): void
  setMonto(patch: Partial<Pick<GastoWizardState,
    'monedaFactura'|'usaTasaParalela'|'tasaInterna'|'tasaProveedor'|'montoFactura'|'tipoImpuesto'|'porcentajeIva'>>): void
  agregarPago(): void
  actualizarPago(id: string, campo: keyof Omit<PagoWizardGasto,'id'>, valor: string): void
  eliminarPago(id: string): void
  // Validez por paso — usados por el indicador y por canGoNext
  isStep1Valid(): boolean   // !!cuentaId && descripcion.trim() !== '' && !!fecha
  isStep2Valid(): boolean   // montoFactura>0 && tasaInterna>0 && (!usaTasaParalela || tasaProveedor>0) && (tipoImpuesto!=='Gravable' || porcentajeIva>0)
  isStep3Valid(): boolean   // siempre true — pagos son opcionales (saldo va a CxP)
  // Draft — delega en useGastoBorradorStore (misma clave que desktop)
  hidratarDesdeBorrador(): boolean
  guardarDraft(): void
  reset(): void
}
```

### `CompraWizardState` (Zustand, `src/stores/compra-wizard-store.ts`)

```typescript
// PvpNivelUI reusa el tipo movido a compra-pvp-decision.ts (mismo shape que hoy en compra-form.tsx)
interface LineaWizardCompra {
  producto_id: string; codigo: string; nombre: string
  unidad_seleccionada_id: string | null; factor: number; cantidad_input: number
  costo_actual: number; nuevo_costo_raw: string; costo_input: number
  tipo_impuesto: 'Gravable'|'Exento'|'Exonerado'; impuesto_pct: number
  maneja_lotes: number; lote_nro: string; lote_fecha_fab: string; lote_fecha_venc: string
  costo_usd_actual: string; precio_venta_usd: string; precio_mayor_usd: string; precio_especial_usd: string
  pvp_niveles: PvpNivelUI[]
}
interface CargoWizard { id: string; concepto: 'EMPAQUE'|'FLETE'; monto_input: string; porcentaje_iva: 0|16 }
interface PagoWizardCompra {
  metodo_cobro_id: string; metodo_nombre: string; moneda: 'USD'|'BS'
  monto: number; banco_empresa_id: string | null; referencia?: string
}

interface CompraWizardState {
  step: 1 | 2 | 3
  // Paso 1 — Cabecera
  fechaFactura: string; nroFactura: string; nroControl: string; proveedorId: string
  moneda: 'USD'|'BS'; usaTasaParalela: boolean; tasaInterna: number; tasaProveedor: number
  // Paso 2 — Productos
  lineas: LineaWizardCompra[]
  pvpPendienteLineaIdx: number | null
  // Paso 3 — Cargos + Pagos
  lineasCargo: CargoWizard[]
  pagos: PagoWizardCompra[]
  destinoCobro: 'CAJA'|'TESORERIA'; sesionActivaId: string | null
  // Sheet + navegación
  sheetOpen: boolean
  openSheet(): void
  closeSheet(): void
  setStep(step: 1 | 2 | 3): void
  setCabecera(patch: Partial<...>): void
  agregarLinea(producto: Producto): void
  actualizarLinea(idx: number, patch: Partial<LineaWizardCompra>): void
  quitarLinea(idx: number): void
  abrirPvpDecision(idx: number): void        // set pvpPendienteLineaIdx = idx
  confirmarPvpDecision(idx: number, niveles: PvpNivelUI[]): void  // escribe lineas[idx].pvp_niveles, clear pending
  cancelarPvpDecision(idx: number): void     // revierte nuevo_costo_raw/costo_input/pvp_niveles, clear pending
  agregarCargo(): void; actualizarCargo(id: string, patch): void; quitarCargo(id: string): void
  agregarPago(): void; actualizarPago(idx, patch): void; quitarPago(idx): void
  isStep1Valid(): boolean   // compraHeaderSchema campos presentes (proveedorId, fecha, nroFactura, tasa>0)
  isStep2Valid(): boolean   // lineas.length>0 && !lineas.some(l => lineaTieneDecisionBloqueante(costoCambio(l), l.pvp_niveles))
  isStep3Valid(): boolean   // siempre true — CREDITO es válido
  guardarDraft(): void      // clave propia 'compra_wizard_draft', expira 24h (igual a cita-wizard-store)
  restaurarDraft(): boolean
  reset(): void
}
```

### `useGastoTotales` (`src/features/contabilidad/lib/use-gasto-totales.ts`)

Extracción 1:1 de `gasto-form.tsx` L470-552. Consumido por `gasto-form.tsx` (refactor) y `paso-monto.tsx`/`paso-pagos.tsx`.

```typescript
interface UseGastoTotalesParams {
  monedaFactura: 'USD'|'BS'; usaTasaParalela: boolean
  tasaInterna: string; tasaProveedor: string; montoFactura: string
  tipoImpuesto: 'Gravable'|'Exento'|'Exonerado'; porcentajeIva: string
  pagos: { moneda: 'USD'|'BS'; monto: string }[]
}
interface UseGastoTotalesResult {
  ivaFactura: number; totalFacturaNum: number
  montoContableUsd: number | null; montoProveedorUsd: number | null
  abonoPagoProveedorUsd(pago: { moneda: 'USD'|'BS'; monto: string }): number
  abonoPagoInternoUsd(pago: { moneda: 'USD'|'BS'; monto: string }): number
  totalAbonadoProveedorUsd: number; totalAbonadoInternoUsd: number
  saldoPendienteProveedor: number; saldoPendienteInterno: number
  pagosSuperanTotal: boolean
}
```

### `useCompraDesgloseUsd` (`src/features/inventario/lib/use-compra-desglose-usd.ts`)

Extracción 1:1 de `compra-form.tsx` L443-568 (incluye `desgloseUsd`, cargos, `totalUsd`/`totalUsdSistema`).

```typescript
interface UseCompraDesgloseUsdParams {
  lineas: { cantidad_input: number; costo_input: number; tipo_impuesto: 'Gravable'|'Exento'|'Exonerado'; impuesto_pct: number }[]
  lineasCargo: { monto_input: string; porcentaje_iva: 0|16 }[]
  moneda: 'USD'|'BS'; tasaFacturaNum: number; tasaInternaNum: number; usaTasaParalela: boolean
}
interface UseCompraDesgloseUsdResult {
  desgloseUsd: DesgloseFiscalUsd            // de compra-lineas-cargo.ts, ya existente
  totalDisplay: number; totalIvaDisplay: number; totalConIvaDisplay: number
  cargoTotales: TotalLineasCargo; totalCargoUsd: number; desgloseConCargo: DesgloseFiscalUsd
  totalUsd: number; totalBs: number; totalUsdSistema: number
  getLineSubtotal(l): number
  getCostoSistema(l): number | null
  getSubtotalSistema(l): number | null
}
```

### `compra-pvp-decision.ts` (funciones puras, NO hook — ver Architecture Decisions)

Extracción 1:1 de `compra-form.tsx` L713-956, parametrizada (sin depender de `setLineas` de React):

```typescript
function getCostoNuevoUsdForLinea(p: {
  costoInput: number; factor: number; moneda: 'USD'|'BS'
  usaTasaParalela: boolean; tasaFacturaNum: number; tasaInternaNum: number
}): number

function construirPvpNiveles(p: {
  costoNuevoUsd: number; nivelesEfectivos: NivelPrecio[]
  getPvpActual: (orden: number) => number; moneda: 'USD'|'BS'; tasaFacturaNum: number
}): PvpNivelUI[]

function aplicarDecisionNivel(
  niveles: PvpNivelUI[], orden: number, decision: DecisionPvp,
  ctx: { costoNuevoUsd: number; costoUsdActualPorNivel: (orden: number) => number; moneda: 'USD'|'BS'; tasaFacturaNum: number }
): PvpNivelUI[]

function actualizarPvpInput(niveles: PvpNivelUI[], orden: number, value: string, ctx: { costoNuevoUsd: number; moneda: 'USD'|'BS'; tasaFacturaNum: number }): PvpNivelUI[]
function actualizarMargenInput(niveles: PvpNivelUI[], orden: number, value: string, ctx: { costoNuevoUsd: number; moneda: 'USD'|'BS'; tasaFacturaNum: number }): PvpNivelUI[]
```

`compra-form.tsx` mantiene sus handlers (`handleNuevoCostoChange`, etc.) pero delega el cálculo interno a estas funciones. `compra-wizard-store.ts` y `pvp-confirm-sheet.tsx` llaman las MISMAS funciones sobre `lineas[idx]` del store.

## Per-Step Component Contracts

Todos los pasos siguen el patrón de `step-servicios.tsx` (citas): **sin props**, leen/escriben el store directamente vía el hook `use{X}WizardStore()`.

| Componente | Renderiza | Validación (indicador) |
|---|---|---|
| `paso-identificacion.tsx` | cuentaId, proveedorId (+crear), nroFactura, nroControl, descripcion, fecha | `isStep1Valid()` |
| `paso-monto.tsx` | monedaFactura, usaTasaParalela, tasaInterna (auto/manual), tasaProveedor (condicional), montoFactura, tipoImpuesto, porcentajeIva, totales en vivo (`useGastoTotales`) | `isStep2Valid()` |
| `paso-pagos.tsx` | filas de pago (metodo, banco, moneda, monto, referencia), banners de saldo pendiente (`useGastoTotales`) | `isStep3Valid()` (siempre true) |
| `paso-cabecera.tsx` | fechaFactura, nroFactura, nroControl, proveedorId (+crear), moneda, usaTasaParalela, tasaInterna, tasaProveedor | `isStep1Valid()` |
| `paso-productos.tsx` | búsqueda de producto, lista de líneas agregadas (cantidad/unidad/costo editable/lote), dispara `abrirPvpDecision` al detectar cambio de costo real o click en "Editar precios" | `isStep2Valid()` |
| `pvp-confirm-sheet.tsx` | Sin props — lee `pvpPendienteLineaIdx`; `null` ⇒ no renderiza. Header producto + costo nuevo vs actual; filas por nivel con 3 botones de decisión + input manual | Gate: `lineaTieneDecisionBloqueante` antes de confirmar |
| `paso-cargos-pagos.tsx` | líneas de cargo (concepto, monto, %iva), filas de pago, totales (`useCompraDesgloseUsd`) | `isStep3Valid()` (siempre true) |

## WizardAcumulador (`src/components/shared/wizard-acumulador.tsx`)

```typescript
interface WizardAcumuladorProps {
  itemCount: number
  totalLabel: string                                        // ya formateado, ej. "$45.20"
  lines: { label: string; detail?: string; amountLabel: string }[]
  paymentSummary?: { label: string; amountLabel: string }[]
  defaultExpanded?: boolean
}
```

- **Colapsado**: una fila `"{itemCount} artículos · {totalLabel}"` con chevron — tap alterna `useState` local.
- **Expandido**: `lines` (productos/cargos) + `paymentSummary` (pagos) + total corriendo.
- **Sticky**: `sticky top-0 z-10 bg-card border-b` dentro del body scrolleable de `BottomSheet`, ENCIMA del contenido del paso.
- **Uso**: Paso 1 y Paso 3 ⇒ `defaultExpanded=true` (pocas líneas). Paso 2 (productos) ⇒ `defaultExpanded=false` (la lista de productos ya es el contenido principal; evita duplicación).

## PVP Gating Mini-Modal — Flujo Completo

1. **Abre** cuando `pvpPendienteLineaIdx !== null` — seteado por `store.abrirPvpDecision(idx)`, llamado desde `paso-productos.tsx` cuando `handleNuevoCostoChange` detecta costo real distinto (auto-apertura, igual que desktop) o el usuario toca "Editar precios ✎" en una línea sin cambio de costo.
2. **Muestra**: nombre/código de producto, costo nuevo vs costo actual, y por cada nivel de precio: nombre, PVP actual, margen actual, 3 botones (`Mantener PVP` / `Mantener margen %` / `Manual` con input numérico), fila resaltada en rojo si `violado`.
3. **Confirmar**: valida con `lineaTieneDecisionBloqueante(true, niveles)`; si `false`, llama `store.confirmarPvpDecision(idx, niveles)` (escribe `lineas[idx].pvp_niveles`, limpia `pvpPendienteLineaIdx`).
4. **Cancelar**: `store.cancelarPvpDecision(idx)` revierte `nuevo_costo_raw=''`, `costo_input=costo_actual`, `pvp_niveles=[]`, limpia `pvpPendienteLineaIdx`.
5. **Stacking Radix**: `pvp-confirm-sheet.tsx` es un `<Sheet>` (`side="bottom"`) con `portalContainer` = el nodo `SheetContent` del `CompraWizardSheet` exterior (obtenido vía el `contentRef` nuevo de `BottomSheet`, mismo principio que `dialogRef.current` en `nota-credito-pos-modal.tsx` — Radix `Portal.container` acepta cualquier `Element`, no exclusivamente `<dialog>` nativo). Requiere el cambio a `sheet.tsx`/`bottom-sheet.tsx` de la tabla de File Changes.

## Review Workload Forecast

Mapeo de slices confirmado contra el Rollback Plan del proposal (W5 = integración de rutas, revertible instantáneamente).

| Slice | Contenido | Est. líneas | Riesgo 400 | Chained PRs |
|---|---|---|---|---|
| W1 | `WizardStepIndicator` + `WizardAcumulador` + refactor `nueva-cita-wizard.tsx` | ~300 | Low | No |
| W2 | Gasto wizard completo: store, `useGastoTotales`, 3 pasos, orquestador, sheet, refactor `gasto-form.tsx` | ~1150 | High | **Sí** — 2 hijos: W2a (store+hook+refactor desktop, ~400) → W2b (3 pasos+orquestador+sheet, ~750, sub-divisible si un reviewer lo pide) |
| W3 | Compra wizard cabecera+cargos/pagos: store, `useCompraDesgloseUsd`, `paso-cabecera`, `paso-cargos-pagos`, orquestador (placeholder paso 2), sheet, refactor parcial `compra-form.tsx` | ~1010 | High | **Sí** — 2 hijos: W3a (store+hook+refactor desktop, ~450) → W3b (2 pasos+orquestador+sheet, ~560) |
| W4 | Compra wizard productos + PVP gating (ver sub-split abajo) | ~930 | High | **Sí** — 3 hijos |
| W5 | Bifurcación `useMobile(1024)` en `compra-list.tsx` + `gastos-dashboard.tsx`, wiring final de ambos Sheets | ~90 | Low | No |

**W4 — sub-split obligatorio (slice de mayor riesgo):**

| Sub-slice | Contenido | Est. líneas |
|---|---|---|
| W4a | `compra-pvp-decision.ts` (extracción pura) + refactor `compra-form.tsx` para consumirlo + extensión `sheet.tsx`/`bottom-sheet.tsx` (`container`/`contentRef`) — **sin UI mobile nueva**, verificable contra regresión desktop antes de tocar el wizard | ~310 |
| W4b-i | `paso-productos.tsx` + acciones de línea/producto en `compra-wizard-store.ts` | ~360 |
| W4b-ii | `pvp-confirm-sheet.tsx` + wiring en `compra-wizard.tsx` (paso 2 real reemplaza el placeholder de W3) | ~260 |

Cadena: W4a → W4b-i → W4b-ii (Feature Branch Chain: cada hijo apunta a la rama del anterior).

**Guard lines (Sección E del protocolo):**
- `Decision needed before apply: Yes`
- `Chained PRs recommended: Yes` (W2, W3, W4)
- `400-line budget risk: High` (W2, W3, W4) / `Low` (W1, W5)

## Testing Strategy

| Layer | Qué testear | Approach |
|---|---|---|
| Unit | `useGastoTotales`, `useCompraDesgloseUsd`, `compra-pvp-decision.ts` | Vitest — mismos casos que hoy validan manualmente en `compra-form.tsx`/`gasto-form.tsx` (tasa paralela, IVA, margen negativo Caso A/B). Usar `compra-precio-gating.test.ts` como plantilla de estilo |
| Unit | Selectores de validez de cada store (`isStepNValid`) | Vitest — casos borde (campos vacíos, tasa 0, decisión pendiente bloqueante) |
| Regresión | `compra-form.tsx`/`gasto-form.tsx` tras refactor a hooks | Ejecutar los mismos flujos manuales que hoy usa el equipo (tasa paralela ON/OFF, USD/BS, Gravable/Exento) — comparar output antes/después byte-a-byte en consola de desarrollo antes de mergear W2a/W3a/W4a |
| Visual/DOM | Wizards completos (navegación, `WizardAcumulador`, `PvpConfirmSheet` apilado, recuperación de borrador) | **Manual-QA gate** (sin infraestructura de testing de componentes en el repo) — checklist en cada PR de W2b/W3b/W4b |

## Migration / Rollout

Sin migración de datos. Los wizards viven detrás de `useMobile(1024)` desde W5; hasta entonces son código muerto sin impacto. El borrador de gasto (`useGastoBorradorStore`) se comparte tal cual — cero migración de esquema, el wizard escribe el mismo shape `GastoBorradorData`. El borrador de compra es nuevo (`compra_wizard_draft`), sin datos previos que migrar.

## Open Questions

- [ ] `paso-productos.tsx` reusa el buscador de producto de `compra-form.tsx` (componente inline, no extraído) — ¿extraerlo a componente compartido en W4b-i o duplicar el markup de búsqueda? Recomendación: duplicar en W4b-i (bajo riesgo, evita acoplar el refactor de búsqueda al slice de mayor riesgo) y evaluar extracción en un change futuro si se repite un tercer wizard.
- [ ] `sesionActivaId`/`destinoCobro` (CAJA vs TESORERÍA) en `paso-pagos.tsx`/`paso-cargos-pagos.tsx`: el efecto que detecta sesión de caja abierta (`gasto-form.tsx` L368-391) ¿vive en el store (side-effect en `openSheet()`) o en el componente del paso? Recomendación: componente del paso (mismo patrón que `useEffect` en `nueva-cita-wizard.tsx` para tasa), el store se mantiene sin I/O a PowerSync.
