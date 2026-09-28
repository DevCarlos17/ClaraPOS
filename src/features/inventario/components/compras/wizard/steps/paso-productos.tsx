import { useMemo, useState } from 'react'
import type React from 'react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { MagnifyingGlass, Plus, Trash, Package, ArrowRight } from '@phosphor-icons/react'
import { useCompraWizardStore, type LineaWizardCompra } from '@/stores/compra-wizard-store'
import { useProductosTipo, type Producto } from '@/features/inventario/hooks/use-productos'
import { useConversiones } from '@/features/inventario/hooks/use-unidades-conversion'
import { useUnidadesActivas } from '@/features/inventario/hooks/use-unidades'
import { useNivelesPrecioActivos, type NivelPrecio } from '@/features/configuracion/hooks/use-niveles-precio'
import { useImpuestosActivos } from '@/features/configuracion/hooks/use-impuestos'
import {
  construirPvpNiveles,
  costoTieneCambioSignificativo,
  type TasaContext,
} from '@/features/inventario/lib/compra-pvp-decision'
import { getLineSubtotal } from '@/features/inventario/lib/compra-desglose'
import { formatUsd, formatBs } from '@/lib/currency'

interface UnidadOption {
  id: string | null
  nombre: string
  abreviatura: string
  factor: number
}

/** NUMERIC(12,3)/NUMERIC(20,8) en DB — 1:1 de compra-form.tsx `NUMERIC_LIMITS`. */
const NUMERIC_LIMITS = {
  cantidad: { max: 999_999_999, decimals: 3 },
  costo: { max: 9_999_999_999, decimals: 8 },
} as const

function clampNumeric(value: string, max: number, decimals: number): string {
  if (value === '' || value === '-') return value
  const num = parseFloat(value)
  if (isNaN(num)) return value
  if (num > max) return max.toFixed(decimals)
  const parts = value.split('.')
  if (parts[1] && parts[1].length > decimals) {
    return parts[0] + '.' + parts[1].slice(0, decimals)
  }
  return value
}

function handleNumericKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  const allowed = [
    'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End',
  ]
  if (allowed.includes(e.key)) return
  if (e.key === '.' && !e.currentTarget.value.includes('.')) return
  if (!/^\d$/.test(e.key)) e.preventDefault()
}

function handleNumericPaste(e: React.ClipboardEvent<HTMLInputElement>) {
  const text = e.clipboardData.getData('text')
  const cleaned = text.replace(/[^0-9.]/g, '')
  if (cleaned !== text) {
    e.preventDefault()
    toast.error('Pegado bloqueado: ingresá el valor manualmente para evitar errores.')
  }
}

const SAFE_TEXT_RE = /^[A-Za-z0-9\-]$/

function handleSafeTextKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  const control = [
    'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End',
  ]
  if (control.includes(e.key)) return
  if (e.ctrlKey || e.metaKey) return
  if (e.altKey) { e.preventDefault(); return }
  if (!SAFE_TEXT_RE.test(e.key)) e.preventDefault()
}

function handleSafeTextPaste(e: React.ClipboardEvent<HTMLInputElement>) {
  const text = e.clipboardData.getData('text')
  const cleaned = text.replace(/[^A-Za-z0-9\-]/g, '')
  if (cleaned !== text) e.preventDefault()
}

/**
 * Paso 2 del wizard de compra — Productos. Sin props: lee/escribe
 * `useCompraWizardStore()` directamente (mismo patron que `paso-cabecera.tsx`/
 * `paso-cargos-pagos.tsx`). Mirror mobile de `compra-form.tsx`'s bloque de
 * productos (busqueda + `handleAddProducto`/`handleUnidadChange`/
 * `handleNuevoCostoChange`, L411-701), adaptado a cards en vez de tabla.
 *
 * A diferencia de `compra-form.tsx`, el flujo de decision de PVP (Caso A/B,
 * 3 botones por nivel) NO se resuelve en esta pantalla — este componente
 * solo detecta el cambio de costo significativo
 * (`costoTieneCambioSignificativo`), computa la vista base de `pvp_niveles`
 * (`construirPvpNiveles`, igual que desktop) y marca `pvpPendienteLineaIdx`
 * (`abrirPvpDecision`) para que `PvpConfirmSheet` (W4b-ii, montado como sheet
 * stackeado en `compra-wizard-sheet.tsx`) abra la decision real de esa
 * linea. El banner inline de abajo (`pvpSinResolver`) es solo el trigger +
 * indicador de estado — la UI de decision en si vive en el sheet.
 */
export function PasoProductos() {
  const {
    lineas,
    moneda,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    agregarLinea,
    actualizarLinea,
    quitarLinea,
    abrirPvpDecision,
    limpiarPvpPendienteSiCoincide,
  } = useCompraWizardStore()

  const { productos, isLoading: loadingProductos } = useProductosTipo('P')
  const { conversiones } = useConversiones()
  const { unidades } = useUnidadesActivas()
  const { niveles: nivelesActivos } = useNivelesPrecioActivos()
  const { impuestos } = useImpuestosActivos()

  const [busqueda, setBusqueda] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const impuestoMap = useMemo(
    () => new Map(impuestos.map((imp) => [imp.id, parseFloat(imp.porcentaje) || 0])),
    [impuestos]
  )
  const unidadMap = useMemo(() => new Map(unidades.map((u) => [u.id, u])), [unidades])
  const productoMap = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos])

  const monedaLabel = moneda === 'USD' ? '$' : 'Bs'
  const tasaFacturaNum = usaTasaParalela ? tasaProveedor : tasaInterna

  function pvpTasaCtx(): TasaContext {
    return { moneda, usaTasaParalela, tasaInternaNum: tasaInterna, tasaFacturaNum }
  }

  /** Niveles de precio efectivos: los configurados por la empresa, o un nivel
   * virtual "PVP" (orden 1) si la empresa no configuro niveles — 1:1 de
   * `getNivelesEfectivos` en compra-form.tsx. */
  function getNivelesEfectivos(): NivelPrecio[] {
    return nivelesActivos.length > 0
      ? nivelesActivos
      : [{ id: 'virtual', empresa_id: '', nombre: 'PVP', orden: 1, porcentaje_defecto: '0.00', is_active: 1, created_at: '', updated_at: '', created_by: null, updated_by: null }]
  }

  const productosFiltrados = productos.filter(
    (p) =>
      !lineas.some((l) => l.producto_id === p.id) &&
      (p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.codigo.toLowerCase().includes(busqueda.toLowerCase()))
  )

  /** 1:1 de `getUnidadOptions` en compra-form.tsx. */
  function getUnidadOptions(producto: Producto): UnidadOption[] {
    const baseUnit = producto.unidad_base_id ? unidadMap.get(producto.unidad_base_id) : null
    const baseName = baseUnit?.nombre ?? 'UNIDAD'
    const baseAbrev = baseUnit?.abreviatura ?? 'UND'

    const options: UnidadOption[] = [
      { id: null, nombre: baseName, abreviatura: baseAbrev, factor: 1 },
    ]

    if (producto.unidad_base_id) {
      for (const conv of conversiones) {
        if (conv.unidad_menor_id === producto.unidad_base_id && Number(conv.is_active) === 1) {
          const mayorUnit = unidadMap.get(conv.unidad_mayor_id)
          if (mayorUnit) {
            options.push({
              id: conv.unidad_mayor_id,
              nombre: mayorUnit.nombre,
              abreviatura: mayorUnit.abreviatura,
              factor: parseFloat(conv.factor) || 1,
            })
          }
        }
      }
    }

    return options
  }

  /** 1:1 de `handleAddProducto` en compra-form.tsx (precarga costo segun
   * factura, no el contable — ver comentario original sobre recursividad). */
  function handleAddProducto(producto: Producto) {
    const costoBase = parseFloat(producto.costo_factura_usd ?? producto.costo_usd) || 0
    const costoDisplay = moneda === 'USD' ? costoBase : new Decimal(costoBase).times(tasaFacturaNum).toNumber()

    const tipoImp = (producto.tipo_impuesto as 'Gravable' | 'Exento' | 'Exonerado') ?? 'Exento'
    const pctIva = producto.impuesto_iva_id ? (impuestoMap.get(producto.impuesto_iva_id) ?? 0) : 0

    const linea: LineaWizardCompra = {
      producto_id: producto.id,
      codigo: producto.codigo,
      nombre: producto.nombre,
      unidad_seleccionada_id: null,
      factor: 1,
      cantidad_input: 1,
      costo_actual: costoDisplay,
      nuevo_costo_raw: '',
      costo_input: costoDisplay,
      tipo_impuesto: tipoImp,
      impuesto_pct: pctIva,
      maneja_lotes: Number(producto.maneja_lotes) || 0,
      lote_nro: '',
      lote_fecha_fab: '',
      lote_fecha_venc: '',
      costo_usd_actual: producto.costo_usd,
      precio_venta_usd: producto.precio_venta_usd,
      precio_mayor_usd: producto.precio_mayor_usd ?? '0',
      precio_especial_usd: producto.precio_especial_usd ?? '0',
      pvp_niveles: [],
    }
    agregarLinea(linea)
    setBusqueda('')
    setDropdownOpen(false)
  }

  function handleCantidadChange(idx: number, value: string) {
    const clamped = clampNumeric(value, NUMERIC_LIMITS.cantidad.max, NUMERIC_LIMITS.cantidad.decimals)
    const num = parseFloat(clamped)
    actualizarLinea(idx, { cantidad_input: isNaN(num) || num < 0 ? 0 : num })
  }

  /** 1:1 de `handleUnidadChange` en compra-form.tsx — reconvierte costo_actual/
   * costo_input al cambiar de unidad via Decimal (evita drift de punto flotante). */
  function handleUnidadChange(idx: number, unidadId: string) {
    const l = lineas[idx]
    const producto = productoMap.get(l.producto_id)
    if (!producto) return
    const options = getUnidadOptions(producto)
    const option = options.find((o) => (unidadId === '__base__' ? o.id === null : o.id === unidadId))
    if (!option) return

    const oldActualPerBase = l.factor > 0 ? new Decimal(l.costo_actual).dividedBy(l.factor).toNumber() : l.costo_actual
    const newCostoActual = new Decimal(oldActualPerBase).times(option.factor).toNumber()

    let newNuevoCostoRaw = l.nuevo_costo_raw
    let newCostoInput = newCostoActual
    if (l.nuevo_costo_raw !== '') {
      const oldNuevoCostoPerBase = l.factor > 0
        ? new Decimal(parseFloat(l.nuevo_costo_raw)).dividedBy(l.factor).toNumber()
        : parseFloat(l.nuevo_costo_raw)
      const newNuevoCosto = new Decimal(oldNuevoCostoPerBase).times(option.factor).toNumber()
      newNuevoCostoRaw = String(newNuevoCosto)
      newCostoInput = newNuevoCosto
    }

    actualizarLinea(idx, {
      unidad_seleccionada_id: option.id,
      factor: option.factor,
      costo_actual: newCostoActual,
      nuevo_costo_raw: newNuevoCostoRaw,
      costo_input: newCostoInput,
    })
  }

  function handleLoteChange(idx: number, field: 'lote_nro' | 'lote_fecha_fab' | 'lote_fecha_venc', value: string) {
    actualizarLinea(idx, { [field]: value })
  }

  /** 1:1 de `handleNuevoCostoChange` en compra-form.tsx, salvo que en vez de
   * dejar la decision de PVP inline (tabla desktop), marca
   * `pvpPendienteLineaIdx` (`store.abrirPvpDecision`) para que el sheet de
   * confirmacion (W4b-ii) sepa que linea abrir. Costo SIN cambio
   * significativo -> la linea queda agregada directamente, sin prompt. */
  function handleNuevoCostoChange(idx: number, value: string) {
    const l = lineas[idx]

    if (value === '') {
      // Mismo efecto que `cancelarPvpDecision`: revierte costo/niveles y
      // limpia cualquier decision pendiente para esta linea (si la habia).
      actualizarLinea(idx, { nuevo_costo_raw: '', costo_input: l.costo_actual, pvp_niveles: [] })
      limpiarPvpPendienteSiCoincide(idx)
      return
    }

    if (/^\d+\.$/.test(value)) {
      actualizarLinea(idx, { nuevo_costo_raw: value })
      return
    }

    const clamped = clampNumeric(value, NUMERIC_LIMITS.costo.max, NUMERIC_LIMITS.costo.decimals)
    const numericalValue = parseFloat(clamped)
    if (isNaN(numericalValue) || numericalValue < 0) return

    if (!costoTieneCambioSignificativo(numericalValue, l.costo_actual, pvpTasaCtx())) {
      // El costo volvio a un valor sin diferencia significativa: ya no hay
      // decision de PVP que tomar para esta linea — si estaba pendiente,
      // limpiar el indice para que el banner inline deje de mostrarse.
      actualizarLinea(idx, { nuevo_costo_raw: clamped, costo_input: numericalValue, pvp_niveles: [] })
      limpiarPvpPendienteSiCoincide(idx)
      return
    }

    const updated: LineaWizardCompra = { ...l, nuevo_costo_raw: clamped, costo_input: numericalValue }
    const niveles = construirPvpNiveles(updated, { ...pvpTasaCtx(), niveles: getNivelesEfectivos() })
    actualizarLinea(idx, { nuevo_costo_raw: clamped, costo_input: numericalValue, pvp_niveles: niveles })
    abrirPvpDecision(idx)
  }

  return (
    <div className="space-y-4">
      {/* ── Buscador de productos ── */}
      <div className="relative">
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setDropdownOpen(true)
            }}
            onFocus={() => busqueda && setDropdownOpen(true)}
            placeholder={loadingProductos ? 'Cargando productos...' : 'Buscar producto por nombre o código...'}
            disabled={loadingProductos}
            autoComplete="off"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {dropdownOpen && busqueda && productosFiltrados.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-background shadow-lg">
            {productosFiltrados.slice(0, 10).map((p) => {
              const costo = parseFloat(p.costo_factura_usd ?? p.costo_usd) || 0
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handleAddProducto(p)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <Plus className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-foreground truncate">{p.nombre}</span>
                      <span className="block text-xs font-mono text-muted-foreground">{p.codigo}</span>
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">{formatUsd(costo)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {dropdownOpen && busqueda && productosFiltrados.length === 0 && !loadingProductos && (
          <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-background shadow-lg p-3 text-sm text-muted-foreground">
            No se encontraron productos
          </div>
        )}
      </div>

      {/* ── Lineas agregadas ── */}
      {lineas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center rounded-xl border border-dashed border-border bg-muted/20">
          <Package className="h-9 w-9 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground max-w-xs">
            Buscá un producto arriba para agregarlo a la factura
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {lineas.map((l, idx) => {
            const producto = productoMap.get(l.producto_id)
            const options = producto ? getUnidadOptions(producto) : []
            const subtotal = getLineSubtotal(l)
            const costoCambio = l.nuevo_costo_raw !== '' && costoTieneCambioSignificativo(l.costo_input, l.costo_actual, pvpTasaCtx())
            // Cualquier linea con al menos un nivel `decision === 'pendiente'`
            // bloquea el submit (`isStep2Valid`/`lineaTieneDecisionBloqueante`),
            // sin importar si su sheet esta ABIERTO ahora mismo — solo puede
            // haber un `pvpPendienteLineaIdx` a la vez, asi que este banner
            // (con boton para RE-abrir el sheet de ESTA linea) es la unica
            // senal visible cuando el usuario paso a editar otra linea antes
            // de resolver esta.
            const pvpSinResolver = l.pvp_niveles.some((n) => n.decision === 'pendiente')

            return (
              <li key={l.producto_id} className="rounded-2xl border border-border bg-card shadow-md p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{l.nombre}</p>
                    <p className="text-xs font-mono text-muted-foreground">{l.codigo}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => quitarLinea(idx)}
                    aria-label="Eliminar producto"
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Cantidad</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={l.cantidad_input || ''}
                      onChange={(e) => handleCantidadChange(idx, e.target.value)}
                      onKeyDown={handleNumericKeyDown}
                      onPaste={handleNumericPaste}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Unidad</label>
                    <select
                      value={l.unidad_seleccionada_id ?? '__base__'}
                      onChange={(e) => handleUnidadChange(idx, e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {options.map((opt) => (
                        <option key={opt.id ?? '__base__'} value={opt.id ?? '__base__'}>
                          {opt.abreviatura}{opt.factor > 1 && ` ×${opt.factor}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Costo actual ({monedaLabel})</label>
                    <p className="text-sm font-semibold text-foreground tabular-nums px-3 py-2">
                      {moneda === 'USD' ? formatUsd(l.costo_actual) : formatBs(l.costo_actual)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Nuevo costo ({monedaLabel})</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={l.nuevo_costo_raw}
                      onChange={(e) => handleNuevoCostoChange(idx, e.target.value)}
                      onKeyDown={handleNumericKeyDown}
                      onPaste={handleNumericPaste}
                      placeholder="Sin cambio"
                      className={`w-full rounded-xl border px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring ${
                        costoCambio ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : 'border-input bg-background'
                      }`}
                    />
                  </div>
                </div>

                {l.maneja_lotes === 1 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 p-2.5 space-y-2">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Lote</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Nro.</label>
                        <input
                          type="text"
                          value={l.lote_nro}
                          onChange={(e) => handleLoteChange(idx, 'lote_nro', e.target.value.toUpperCase())}
                          onKeyDown={handleSafeTextKeyDown}
                          onPaste={handleSafeTextPaste}
                          placeholder="LOT-001"
                          autoComplete="off"
                          maxLength={30}
                          className="w-full rounded-lg border border-amber-200 bg-white dark:bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Fab.</label>
                        <input
                          type="date"
                          value={l.lote_fecha_fab}
                          onChange={(e) => handleLoteChange(idx, 'lote_fecha_fab', e.target.value)}
                          className="w-full rounded-lg border border-amber-200 bg-white dark:bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Venc.</label>
                        <input
                          type="date"
                          value={l.lote_fecha_venc}
                          onChange={(e) => handleLoteChange(idx, 'lote_fecha_venc', e.target.value)}
                          className="w-full rounded-lg border border-amber-200 bg-white dark:bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {pvpSinResolver && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-amber-800 dark:text-amber-400">
                      ⏳ Precio pendiente de confirmar
                    </span>
                    <button
                      type="button"
                      onClick={() => abrirPvpDecision(idx)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 transition-colors shrink-0"
                    >
                      Confirmar precios
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                )}

                <p className="text-right text-sm font-semibold text-foreground tabular-nums">
                  Subtotal: {moneda === 'USD' ? formatUsd(subtotal) : formatBs(subtotal)}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
