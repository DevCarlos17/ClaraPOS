# Senior Frontend Specialist - Project Memory

## Project: ClaraPOS

### Key Stack
- React 19 + TypeScript + Vite
- TanStack Router (file-based)
- PowerSync (SQLite offline) + Kysely query builder
- Supabase (auth/backend)
- Tailwind CSS 4 + shadcn/ui
- Sonner for toasts
- Zod for validation

### DB Field Conventions (Phase 1 Migration Applied)
- Boolean active flag: `is_active` (integer 0/1 in SQLite/PowerSync)
- Clientes table: `nombre` (not `nombre_social`), `limite_credito_usd` (not `limite_credito`)
- Proveedores table: `email` (not `correo`), `is_active`
- Tasas cambio: `moneda_id` (not `moneda_destino`)
- All business tables: `is_active` (not `activo`) - EXCEPT `usuarios` table which still uses `activo`

### File Structure
- Hooks: `src/features/<module>/hooks/use-<entity>.ts`
- Schemas: `src/features/<module>/schemas/<entity>-schema.ts`
- Components: `src/features/<module>/components/<entity>-*.tsx`
- Utility files: `src/features/<module>/utils/`

### Pattern: Hook Parameter Naming
When hooks use `activo?: boolean` in function params, rename to `is_active?: boolean`.
The Kysely `.where('activo', '=', 1)` must become `.where('is_active', '=', 1)`.

### Pattern: Component State Variables
When component local state mirrors a renamed DB field (e.g. `const [activo, setActivo]`),
rename the state variable too (e.g. `const [isActive, setIsActive]`).

### Multi-tenant Pattern
Every query MUST filter by `empresa_id`:
```typescript
const { user } = useCurrentUser()
const empresaId = user?.empresa_id ?? ''
// then: WHERE empresa_id = ? with [empresaId]
```

### Linter Behavior
Files are auto-formatted by linter after saves. Always re-read before editing
if multiple edits are needed on the same file in quick succession.

### Table Names (as of Phase 1)
- `metodos_cobro` (was `metodos_pago` in older code)
- `bancos_empresa` (was `bancos` in older code)
- `ventas_det` (detail lines for ventas)

### PowerSync Boolean Mapping
SQLite has no native boolean. PowerSync maps booleans as `column.integer` (0/1).
Decimals are mapped as `column.text` (strings) for precision preservation.

### Hook Import Set
```ts
import { useQuery } from '@powersync/react'          // reactive queries
import { kysely } from '@/core/db/kysely/kysely'      // insert/update (Kysely builder)
import { db } from '@/core/db/powersync/db'           // writeTransaction (atomic)
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
```
- READ-ONLY hooks (e.g. inventario_stock): only import `useQuery` + `useCurrentUser`
- CRUD hooks: import all four + uuid

### Sequential Numbering Per Empresa
```ts
const result = await kysely.selectFrom('table')
  .select(kysely.fn.count('id').as('total'))
  .where('empresa_id', '=', empresaId)
  .executeTakeFirst()
const num = String(Number(result?.total ?? 0) + 1).padStart(6, '0')
```

### Atomic Multi-Insert Pattern (header + lines)
Use `db.writeTransaction(async (tx) => { await tx.execute(...) })`.
Example: `crearAjuste` in `use-ajustes.ts`.

### Completed 7.1 Configuracion Hooks+Schemas
- `use-cajas.ts` + `caja-schema.ts`
- `use-impuestos.ts` + `impuesto-schema.ts`

### Completed 7.2 Inventario Hooks+Schemas
- `use-marcas.ts` + `marca-schema.ts`
- `use-unidades.ts` + `unidad-schema.ts`
- `use-unidades-conversion.ts` + `conversion-schema.ts`
- `use-depositos.ts` + `deposito-schema.ts`
- `use-inventario-stock.ts` (READ-ONLY, no mutations)
- `use-ajuste-motivos.ts` + `ajuste-motivo-schema.ts`
- `use-ajustes.ts` (atomic writeTransaction) + `ajuste-schema.ts`
- `use-lotes.ts` + `lote-schema.ts`

### Completed 7.5 Compras/CxP Hooks+Schemas (src/features/compras/)
- `use-proveedores-bancos.ts` — useBancosProveedor(proveedorId), crearBancoProveedor, actualizarBancoProveedor
- `proveedor-banco-schema.ts` — tipo_cuenta enum: CORRIENTE/AHORRO/DIGITAL
- `use-ret-iva-compras.ts` — useRetencionesIvaCompras(fechaDesde?, fechaHasta?), crearRetencionIva
- `ret-iva-compra-schema.ts`
- `use-ret-islr-compras.ts` — useRetencionesIslrCompras(fechaDesde?, fechaHasta?), crearRetencionIslr
- `ret-islr-compra-schema.ts`
- `use-notas-fiscales-compra.ts` — useNotasFiscalesCompra() LIMIT 50, crearNotaFiscalCompra
- `nota-fiscal-compra-schema.ts` — tipo enum: NC/ND
- `use-mov-cuenta-proveedor.ts` — READ-ONLY, useMovCuentaProveedor(proveedorId) LIMIT 100
- `use-vencimientos-pagar.ts` — READ-ONLY, useVencimientosPagar(proveedorId?), useVencimientosProximosPagar(dias)

### Completed 7.6 Contabilidad Hooks+Schemas (src/features/contabilidad/)
- `use-plan-cuentas.ts` — usePlanCuentas(), useCuentasDetalle(), crearCuenta, actualizarCuenta (codigo immutable)
- `cuenta-schema.ts` — codigo regex: /^[A-Za-z0-9]+(\.[A-Za-z0-9]+)*$/ (e.g. "6.1.01")
- `use-gastos.ts` — useGastos(fechaDesde?, fechaHasta?), crearGasto (GTO-XXXX), anularGasto (status-only)
- `gasto-schema.ts`

### Date Range Pattern for Optional Filters
```ts
const hasDateFilter = Boolean(fechaDesde && fechaHasta)
const params = hasDateFilter
  ? (() => { const { start, end } = buildDateRange(...); return [empresaId, start, end] })()
  : [empresaId]
```
Two separate query strings passed to useQuery based on hasDateFilter.

### Proximos Vencimientos Pattern (SQLite DATE functions)
```sql
WHERE DATE(fecha_vencimiento) <= DATE('now', ? || ' days')
```
Pass days as string param: `[String(dias)]`

### Completed 7.3 Caja/Tesoreria Hooks+Schemas (src/features/caja/)
- `use-sesiones-caja.ts` — useSesionesCaja() LIMIT 20, useSesionActiva() (status='ABIERTA' LIMIT 1), abrirSesionCaja, cerrarSesionCaja (UPDATE, calculates diferencia_usd)
- `sesion-caja-schema.ts` — split into apertura (caja_id, monto_apertura_usd) and cierre (monto_fisico_usd, observaciones_cierre) schemas
- `use-mov-metodo-cobro.ts` — READ-ONLY, useMovMetodoCobro(metodoCobroId, fechaDesde?, fechaHasta?) LIMIT 100
- `use-mov-bancarios.ts` — READ-ONLY, useMovBancarios(bancoEmpresaId, fechaDesde?, fechaHasta?) LIMIT 100; validado field = 0/1

### Completed 7.4 Ventas Extras Hooks+Schemas (src/features/ventas/)
- `use-notas-debito.ts` — useNotasDebito() LIMIT 50, useDetalleNotaDebito(notaDebitoId?), crearNotaDebito (NDB-XXXX 4-digit, calculates totals by tipo_impuesto: GRAVABLE/EXENTO/EXONERADO)
- `nota-debito-schema.ts` — nested lineas[] with tipo_impuesto optional enum
- `use-ret-iva-ventas.ts` — useRetencionesIvaVentas(fechaDesde?, fechaHasta?), crearRetencionIvaVenta (status='REGISTRADA')
- `ret-iva-venta-schema.ts`
- `use-ret-islr-ventas.ts` — useRetencionesIslrVentas(fechaDesde?, fechaHasta?), crearRetencionIslrVenta; montos in BS
- `ret-islr-venta-schema.ts`

### Completed 7.4 CxC Extras Hooks (src/features/cxc/)
- `use-vencimientos-cobrar.ts` — READ-ONLY, useVencimientosCobrar(clienteId?) ORDER BY fecha_vencimiento ASC, useVencimientosProximos(dias) uses JS Date calculation (NOT SQLite DATE function — compute fechaLimite in JS as .toISOString().slice(0, 10))

### vencimientosProximos: JS vs SQLite date approach
Use JS `new Date()` + `setDate(d.getDate() + dias)` + `.toISOString().slice(0, 10)` for date limit.
Pass as bound param. This is more reliable than SQLite DATE() string concatenation.

## Completed Phase 8: Routes and Navigation

### New Permissions Added (use-permissions.ts)
- `CAJA_ACCESS: 'caja.access'`
- `PURCHASES_VIEW: 'purchases.view'`
- `ACCOUNTING_VIEW: 'accounting.view'`

### Sidebar Section Order (after Phase 8)
Dashboard → Ventas → Caja → Inventario → Proveedores → Compras → Contabilidad → Clientes → Configuracion → Informacion Bancaria → Clinica

### Compras: Moved from Inventario to its own section
- Old: `{ title: 'Compras', url: '/inventario/compras' }` inside Inventario group
- New: Top-level "Compras" group with children: Facturas (/compras/facturas), Retenciones, Notas Fiscales
- Old route `src/routes/_app/inventario/compras.tsx` PRESERVED (not deleted)

### New Route Directories Created
- `src/routes/_app/caja/` — sesiones.tsx, movimientos.tsx
- `src/routes/_app/compras/` — facturas.tsx, retenciones.tsx, notas-fiscales.tsx
- `src/routes/_app/contabilidad/` — plan-cuentas.tsx, gastos.tsx

### New Configuracion Routes
- `src/routes/_app/configuracion/cajas.tsx` — now uses CajaList component
- `src/routes/_app/configuracion/impuestos.tsx` — now uses ImpuestoList component

### Configuracion CRUD Components (Phase 9)
- `src/features/configuracion/components/cajas/caja-list.tsx` + `caja-form.tsx`
- `src/features/configuracion/components/impuestos/impuesto-list.tsx` + `impuesto-form.tsx`

### Impuesto porcentaje handling
- Stored as text in SQLite ("16.00"), displayed as `{imp.porcentaje}%` directly
- Form state is a string; `parseFloat(porcentaje)` before Zod `.safeParse()` since schema expects `number`

### Caja deposito select
- Import `useDepositosActivos` from `@/features/inventario/hooks/use-depositos`
- Always include "Sin deposito" as default empty-value `<option value="">`
- `deposito_id` passed as `undefined` when empty string (via `|| undefined` in safeParse input)

### New Inventario Routes
- `src/routes/_app/inventario/marcas.tsx`
- `src/routes/_app/inventario/unidades.tsx`
- `src/routes/_app/inventario/depositos.tsx`
- `src/routes/_app/inventario/ajustes.tsx`
- `src/routes/_app/inventario/lotes.tsx`

### New Lucide Icons Added to Sidebar
Calculator, Tag, Ruler, Warehouse, ClipboardCheck, Layers, Monitor, ArrowDownUp, FileSpreadsheet, FileCheck, FileMinus, BookOpenCheck, HandCoins

### Windows mkdir Note
`mkdir -p` bash syntax fails on Windows MINGW. Use Write tool directly — directories are created automatically. If explicit dir creation needed: `cmd /c "mkdir <path>"`

## Completed: Inventario CRUD Components (Marcas, Unidades, Depositos, Ajuste Motivos)

### Components Created
- `src/features/inventario/components/marcas/marca-list.tsx` + `marca-form.tsx`
- `src/features/inventario/components/unidades/unidad-list.tsx` + `unidad-form.tsx`
- `src/features/inventario/components/depositos/deposito-list.tsx` + `deposito-form.tsx`
- `src/features/inventario/components/ajuste-motivos/ajuste-motivo-list.tsx` + `ajuste-motivo-form.tsx`

### Routes Updated
- `marcas.tsx`, `unidades.tsx`, `depositos.tsx` — replaced placeholder with list component
- `ajustes.tsx` — two-tab layout: "Ajustes" (placeholder) + "Motivos" (AjusteMotivoList)

### AjusteMotivo Special Rule
Items with `es_sistema === 1` must NOT show edit button or toggle. Render a static green "Activo" badge instead of the interactive toggle button.

### Unidad Decimal Column
Badge "Si" green / "No" gray based on `es_decimal === 1`. Gray badge uses: `bg-gray-100 text-gray-600 ring-gray-500/20`

### Deposito Optional Badges
`es_principal` and `permite_venta` columns show badge only when `=== 1`, otherwise render `<span className="text-gray-400 text-xs">—</span>`
- Principal: `bg-blue-50 text-blue-700 ring-blue-600/20`
- Permite Venta: `bg-green-50 text-green-700 ring-green-600/20`

## Completed: Compras Module UI Components (2026-04-12)

### Components Created
- `src/features/compras/components/ret-iva-compra-list.tsx` + `ret-iva-compra-form.tsx`
- `src/features/compras/components/ret-islr-compra-list.tsx` + `ret-islr-compra-form.tsx`
- `src/features/compras/components/nota-fiscal-compra-list.tsx` + `nota-fiscal-compra-form.tsx`

### Routes Updated
- `src/routes/_app/compras/facturas.tsx` — now renders `<CompraList />` from `@/features/inventario/components/compras/compra-list`
- `src/routes/_app/compras/retenciones.tsx` — two-tab layout: IVA / ISLR using `useState<'iva' | 'islr'>('iva')`
- `src/routes/_app/compras/notas-fiscales.tsx` — renders `<NotaFiscalCompraList />`

### Ret IVA Auto-calc
- monto_iva = base_imponible * porcentaje_iva / 100 (useEffect on base + pctIva change)
- monto_retenido = monto_iva * porcentaje_retencion / 100 (useEffect on montoIva + pctRet change)

### Ret ISLR Auto-calc
- monto_retenido_bs = base_imponible_bs * porcentaje_retencion / 100

### Pre-fill Proveedor on Factura Select
- Both ret forms pre-fill `proveedor_id` from `compras.find(c => c.id === facturaId)?.proveedor_id`
- useCompras() returns items with `proveedor_id` field alongside `proveedor_nombre`

### Nota Fiscal Tasa Pre-fill
- Load `useTasaActual()` from `@/features/configuracion/hooks/use-tasas`
- `tasaValor > 0 ? tasaValor.toFixed(4) : ''` as initial tasa state

### nota_fiscal_compra afecta_inventario
- Stored as integer (0/1) in SQLite
- Display: compare with `=== 1` not `=== true`
- Form: `<input type="checkbox">` maps to boolean; `crearNotaFiscalCompra` accepts `afecta_inventario: boolean`

### crearNotaFiscalCompra totals
- Simplified: pass `total_exento_usd: 0, total_base_usd: 0, total_iva_usd: 0, total_usd: 0, total_bs: 0` for now

## Completed: Caja Movimientos List Component

### MovimientosList (src/features/caja/components/movimientos-list.tsx)
- Tabbed read-only, 2 tabs: "Por Metodo de Cobro" / "Bancarios"
- Each tab is its own internal component (TabMetodoCobro, TabBancarios) managing its own filter state
- Tab state at root: `useState<'metodo' | 'bancario'>('metodo')`
- Tab bar: `flex gap-4 border-b border-gray-200 mb-4`
- Active: `pb-3 text-sm border-b-2 border-blue-600 text-blue-600 font-medium`
- Inactive: `pb-3 text-sm text-gray-500 hover:text-gray-700 transition-colors`
- usePaymentMethods() -> methods[].{id, nombre} | useBancos() -> bancos[].{id, banco}
- Referencia for metodo: `mov.doc_origen_ref ?? '-'` | Referencia for bancario: `mov.referencia ?? '-'`
- Validado badge: `validado === 1` green "Si", else gray "No"
- Skeleton tables match real column count (7 metodo, 8 bancario)
- Route: src/routes/_app/caja/movimientos.tsx replaced placeholder with `<MovimientosList />`

## Completed: Caja + Contabilidad UI Components (2026-04-12)

### Components Created
- `src/features/caja/components/sesion-caja-list.tsx` — active session banner + history table
- `src/features/caja/components/sesion-caja-form.tsx` — dual-mode dialog (apertura/cierre)
- `src/features/contabilidad/components/plan-cuentas-list.tsx` — hierarchical account tree with toggle
- `src/features/contabilidad/components/cuenta-form.tsx` — create/edit dialog, codigo immutable on edit
- `src/features/contabilidad/components/gasto-list.tsx` — date-filtered list with anular action
- `src/features/contabilidad/components/gasto-form.tsx` — create-only dialog, tasa pre-filled

### Routes Updated
- `src/routes/_app/caja/sesiones.tsx` -> `<SesionCajaList />`
- `src/routes/_app/contabilidad/plan-cuentas.tsx` -> `<PlanCuentasList />`
- `src/routes/_app/contabilidad/gastos.tsx` -> `<GastoList />`

### SesionCajaForm Dual-Mode Pattern
- `mode: 'apertura' | 'cierre'` prop drives which sub-form renders
- Sub-forms `FormApertura` and `FormCierre` are internal components, not exported
- The outer `SesionCajaForm` manages only the `<dialog>` ref and open/close effect
- `sesionId?: string` required only in cierre mode; comes from `sesionActiva?.id`

### PlanCuentas Indentation
- `paddingLeft: ${16 + (cuenta.nivel - 1) * 24}px` inline style on codigo cell
- Grupos (es_cuenta_detalle === 0) use `font-bold` on the codigo span
- Groups filtered via `cuentas.filter(c => c.es_cuenta_detalle === 0)` for parent select

### GastoForm Tasa Pre-fill
- `useTasaActual()` returns `{ tasa }` with `tasa.valor` as string
- Init: `parseFloat(tasaActual.valor).toFixed(4)` in the `isOpen` useEffect
- Monto Bs preview is purely visual: `(mUsd * t).toFixed(2)` computed inline, not stored
- Dialog uses `max-w-lg` (wider than standard `max-w-md`) due to many fields
- Scroll: `max-h-[90vh] overflow-y-auto` on inner content div

### GastoList Anular Confirmation
- `window.confirm(...)` before calling `anularGasto(id)` — no custom confirm dialog
- Anulado rows: `line-through` class on all text cells, `text-gray-400` for de-emphasis
- Anular button only shown when `status !== 'ANULADO'`

## Completed: Lotes, Ajustes, EmpresaFiscal UI Components (2026-04-12)

### Components Created
- `src/features/inventario/components/lotes/lote-form.tsx` — native dialog, deposito select + nro_lote + dates + cantidad + costo
- `src/features/inventario/components/lotes/lote-list.tsx` — product selector above table; `LotesTable` sub-component hides until product selected
- `src/features/inventario/components/ajustes/ajuste-detalle-modal.tsx` — read-only dialog (max-w-2xl), ajuste line items
- `src/features/inventario/components/ajustes/ajuste-form.tsx` — dialog (max-w-xl), header fields + editable lines table with inline selects/inputs, X button to remove lines
- `src/features/inventario/components/ajustes/ajuste-list.tsx` — click row to open detalle modal
- `src/features/configuracion/components/empresa-fiscal-form.tsx` — settings form (not dialog), 2-col grid pattern matching company-data-form.tsx

### Routes Updated
- `src/routes/_app/inventario/lotes.tsx` — replaced placeholder with `<LoteList />`
- `src/routes/_app/inventario/ajustes.tsx` — replaced "Modulo en desarrollo" placeholder in Ajustes tab with `<AjusteList />`; Motivos tab unchanged
- `src/routes/_app/configuracion/datos-empresa.tsx` — added `<EmpresaFiscalForm />` below `<CompanyDataForm />` with section heading

### AjusteForm Lines Pattern
- Lines state: `LineaInput[]` with string fields `{ producto_id, deposito_id, cantidad, costo_unitario }`
- Render table with inline `<select>` and `<input>` per line (not separate rows)
- Lineas parse error -> `setLineasError(...)` (string not per-field), shown below the table
- Inner div: `max-h-[90vh] overflow-y-auto` to handle many lines

### Lotes are Immutable
- `useLotesPorProducto` hook takes `productoId` and returns `{ lotes, isLoading }`
- No edit/delete UI for lotes — only create

### EmpresaFiscalForm Boolean Handling
- Read from DB: `fiscal.es_agente_retencion === 1` (integer comparison)
- Write to hook: `es_agente_retencion: esAgenteRetencion` (boolean — hook handles 0/1 conversion)
- Checkbox renders with native `<input type="checkbox">` inside a `CheckboxField` helper component

### Select Styling in Settings Forms (not dialog)
When using `<select>` outside native dialog (e.g. settings forms with shadcn Input/Label):
```
className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
```
This matches the shadcn Input visual style.

## Completed: Plan Cuentas Tree View + Context Menu + CSV Import/Export (2026-04-19)

### New Files Created
- `src/features/contabilidad/lib/plan-cuentas-csv.ts` — pure utility: exportPlanCuentasCsv, downloadCsv, generateTemplate, parseCsv, ParsedCuentaRow
- `src/features/contabilidad/components/cuenta-context-menu.tsx` — right-click menu with Copy/Edit/Subcuenta options
- `src/features/contabilidad/components/plan-cuentas-import.tsx` — CSV import dialog with preview table

### Modified Files
- `src/features/contabilidad/components/cuenta-form.tsx` — added `parentPreset?: CuentaContable` prop; third useEffect branch populates codigo=parent.codigo+'.', nivel=parent.nivel+1, copies tipo/naturaleza/parentId from preset; title shows "Nueva Subcuenta de [nombre]"
- `src/features/contabilidad/components/plan-cuentas-list.tsx` — full rewrite with tree view, expand/collapse all, context menu integration, CSV export/import buttons

### Tree View Pattern
- `childrenMap: Map<string | null, CuentaContable[]>` via useMemo — key is `parent_id ?? null`
- `visibleCuentas` via useMemo — recursive `walk(parentId)` starting from `walk(null)`, only recurses if `expandedIds.has(c.id) && es_cuenta_detalle === 0`
- Default state: collapsed (empty `Set`)
- Expand all: `new Set(allGroupIds)` where allGroupIds = group accounts' ids
- Indentation: `paddingLeft: ${8 + (nivel - 1) * 20}px` on `<td>` — 8px base + 20px per level

### Context Menu Pattern
- `data-context-menu` attribute on root div for click-outside detection
- `document.addEventListener('mousedown')` checks `!target.closest('[data-context-menu]')`
- `position: fixed` with `style={{ left: position.x, top: position.y }}`
- Cleanup: useEffect returns removal of both `keydown` and `mousedown` listeners
- "Agregar Subcuenta" only shown when `cuenta.es_cuenta_detalle === 0`

### CSV parseCsv Validation
- Each row validated with `cuentaSchema.safeParse({ nivel: 1, ... })`
- Duplicate check via `existingCodigos = new Set(existingCuentas.map(c => c.codigo))`
- First error message taken: `parsed.error.issues[0]?.message`

### Import Sequential Loop
- `for...of validRows` with `await crearCuenta(...)` — sequential, not Promise.all
- `resolveParentId`: find in existing cuentas by matching codigo field
- `resolveNivel`: parent.nivel + 1 or 1 if no parent
- Summary toast: "X creada(s) correctamente" or "X creada(s), Y con errores" (warning)

### Pre-existing TS Errors (not our code, ignore)
- `use-libro-contable.ts`: unused `localNow` and `empresaId` variables

## Completed: Gastos UI Phase 5 — Multi-Payment + KPIs + Reports (2026-04-19)

### Modified Files
- `src/features/contabilidad/components/gasto-form.tsx` — full rewrite: multi-payment `PagoRow[]` state, `useCuentasDetallePorTipo('GASTO')`, `useMetodosPagoActivos()`, fechaWarning banner, auto-bank detection, auto-fill single pago monto, payment totalizator
- `src/features/contabilidad/components/gasto-list.tsx` — added GastosKpis, Reportes dropdown (BarChart3+ChevronDown icons), GastoReportes modal integration, click-outside close pattern

### New Files Created
- `src/features/contabilidad/components/gastos-kpis.tsx` — 4 KPI cards (Total USD, Total Bs, Cantidad, Top Cuenta), only counts REGISTRADO gastos
- `src/features/contabilidad/components/gasto-reportes.tsx` — native dialog, 3 report views: POR_CUENTA (grouped subtotals), DETALLADO (print-enabled), ESPECIFICO (client-side filter)
- `src/features/contabilidad/components/gastos-dashboard.tsx` — already existed, fixed Tooltip formatter types (recharts v3 Formatter needs `value: ValueType | undefined`)

### Recharts v3 Tooltip Formatter Fix
```tsx
formatter={(value) => {
  const num = typeof value === 'number' ? value : parseFloat(String(value ?? 0))
  return [`$${num.toFixed(2)}`, 'Label']
}}
```
Signature is `Formatter<ValueType, NameType>` where `ValueType` is `number | string | undefined`.

### Multi-Payment PagoRow Pattern
```tsx
interface PagoRow { id: string; metodo_cobro_id: string; banco_empresa_id: string; monto_usd: string; referencia: string }
// Auto-bank detection when metodo selected:
const metodo = metodos.find((m) => m.id === valor)
updated.banco_empresa_id = metodo?.banco_empresa_id ?? ''
// Auto-fill monto when single pago (useEffect on montoUsd, eslint-disable on deps array):
useEffect(() => {
  if (pagos.length === 1) setPagos(prev => prev.map((p, i) => i === 0 ? {...p, monto_usd: montoUsd} : p))
}, [montoUsd]) // eslint-disable-line react-hooks/exhaustive-deps
```

### TipoReporte Union Type (gasto-reportes.tsx)
`export type TipoReporte = 'POR_CUENTA' | 'DETALLADO' | 'ESPECIFICO'`
Imported in gasto-list.tsx: `import { GastoReportes, type TipoReporte } from './gasto-reportes'`

### useMetodosPagoActivos vs usePaymentMethods
- `useMetodosPagoActivos()` returns `{ metodos, isLoading }` — use this for active-only list
- `usePaymentMethods()` returns `{ methods, isLoading }` — use for full list in config screens
