import { useMemo, useState } from 'react'
import type React from 'react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { MagnifyingGlass, Plus, Trash, Package, ArrowCounterClockwise, Check, X } from '@phosphor-icons/react'
import { useCompraWizardStore, type LineaWizardCompra } from '@/stores/compra-wizard-store'
import { useProductosTipo, type Producto } from '@/features/inventario/hooks/use-productos'
import { useConversiones } from '@/features/inventario/hooks/use-unidades-conversion'
import { useUnidadesActivas } from '@/features/inventario/hooks/use-unidades'
import { useNivelesPrecioActivos, type NivelPrecio } from '@/features/configuracion/hooks/use-niveles-precio'
import { useImpuestosActivos } from '@/features/configuracion/hooks/use-impuestos'
import { ProductoForm } from '@/features/inventario/components/productos/producto-form'
import { Button } from '@/components/ui/button'
import {
  construirPvpNiveles,
  costoTieneCambioSignificativo,
  getCostoNuevoUsdForLinea,
  aplicarDecisionNivel,
  actualizarPvpInput,
  actualizarMargenInput,
  type TasaContext,
} from '@/features/inventario/lib/compra-pvp-decision'
import {
  clasificarCasoLinea,
  lineaTieneDecisionBloqueante,
  type DecisionPvp,
} from '@/features/inventario/lib/compra-precio-gating'
import { getLineSubtotal } from '@/features/inventario/lib/compra-desglose'
import { formatUsd, formatBs } from '@/lib/currency'
import { cn } from '@/lib/utils'

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
  pvp: { max: 9_999_999_999, decimals: 8 },
  margen: { max: 9_999, decimals: 1 },
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
 * Paso 2 del wizard de compra — Productos (flujo mobile de confirmacion al
 * carrito).
 *
 * Flujo:
 *   1. Buscar producto (searchbar) o crear uno nuevo (ProductoForm).
 *   2. Al seleccionar, el producto pasa a `lineaEnProceso` (NO al carrito) y
 *      se muestra una card de configuracion debajo del buscador.
 *   3. Configurar cantidad/unidad/costo. Si el nuevo costo cambia
 *      significativamente, la decision de PVP por nivel se resuelve INLINE
 *      debajo de la card (antes era un sheet stackeado, ahora eliminado).
 *   4. "Confirmar producto" (exige PVP resuelto) lo mueve al carrito `lineas`
 *      y limpia la card. El carrito se ve en el panel deslizable del wizard.
 *
 * Toda la logica fiscal (PVP, costos) es 1:1 de compra-form.tsx via los
 * modulos puros compra-pvp-decision.ts / compra-desglose.ts — CERO formulas
 * nuevas, solo se movio la UI de decision de un sheet a inline.
 */
export function PasoProductos() {
  const {
    lineas,
    lineaEnProceso,
    moneda,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    setCabecera,
    iniciarLineaEnProceso,
    actualizarLineaEnProceso,
    confirmarLineaEnProceso,
    cancelarLineaEnProceso,
  } = useCompraWizardStore()

  const { productos, isLoading: loadingProductos } = useProductosTipo('P')
  const { conversiones } = useConversiones()
  const { unidades } = useUnidadesActivas()
  const { niveles: nivelesActivos } = useNivelesPrecioActivos()
  const { impuestos } = useImpuestosActivos()

  const [busqueda, setBusqueda] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [crearProductoOpen, setCrearProductoOpen] = useState(false)

  const impuestoMap = useMemo(
    () => new Map(impuestos.map((imp) => [imp.id, parseFloat(imp.porcentaje) || 0])),
    [impuestos]
  )
  const unidadMap = useMemo(() => new Map(unidades.map((u) => [u.id, u])), [unidades])
  const productoMap = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos])

  const monedaLabel = moneda === 'USD' ? '$' : 'Bs'
  const tasaFacturaNum = usaTasaParalela ? tasaProveedor : tasaInterna
  const tasaCtx: TasaContext = { moneda, usaTasaParalela, tasaInternaNum: tasaInterna, tasaFacturaNum }

  /** Niveles de precio efectivos: los configurados por la empresa, o un nivel
   * virtual "PVP" (orden 1) si la empresa no configuro niveles — 1:1 de
   * `getNivelesEfectivos` en compra-form.tsx. */
  function getNivelesEfectivos(): NivelPrecio[] {
    return nivelesActivos.length > 0
      ? nivelesActivos
      : [{ id: 'virtual', empresa_id: '', nombre: 'PVP', orden: 1, porcentaje_defecto: '0.00', is_active: 1, created_at: '', updated_at: '', created_by: null, updated_by: null }]
  }

  // Productos ya en el carrito O en proceso quedan excluidos del buscador.
  const idsUsados = new Set([...lineas.map((l) => l.producto_id), ...(lineaEnProceso ? [lineaEnProceso.producto_id] : [])])
  const productosFiltrados = productos.filter(
    (p) =>
      !idsUsados.has(p.id) &&
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
   * factura, no el contable). Ahora setea `lineaEnProceso` en vez de agregar
   * directo al carrito. */
  function handleSeleccionarProducto(producto: Producto) {
    if (lineaEnProceso) {
      toast.error('Confirmá o descartá el producto en proceso antes de agregar otro')
      return
    }
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
    iniciarLineaEnProceso(linea)
    setBusqueda('')
    setDropdownOpen(false)
  }

  function handleCantidadChange(value: string) {
    const clamped = clampNumeric(value, NUMERIC_LIMITS.cantidad.max, NUMERIC_LIMITS.cantidad.decimals)
    const num = parseFloat(clamped)
    actualizarLineaEnProceso({ cantidad_input: isNaN(num) || num < 0 ? 0 : num })
  }

  /** 1:1 de `handleUnidadChange` en compra-form.tsx. */
  function handleUnidadChange(unidadId: string) {
    const l = lineaEnProceso
    if (!l) return
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

    actualizarLineaEnProceso({
      unidad_seleccionada_id: option.id,
      factor: option.factor,
      costo_actual: newCostoActual,
      nuevo_costo_raw: newNuevoCostoRaw,
      costo_input: newCostoInput,
    })
  }

  function handleLoteChange(field: 'lote_nro' | 'lote_fecha_fab' | 'lote_fecha_venc', value: string) {
    actualizarLineaEnProceso({ [field]: value })
  }

  /** 1:1 de `handleNuevoCostoChange` en compra-form.tsx, pero sobre
   * `lineaEnProceso` y con PVP inline (sin abrir sheet). */
  function handleNuevoCostoChange(value: string) {
    const l = lineaEnProceso
    if (!l) return

    if (value === '') {
      actualizarLineaEnProceso({ nuevo_costo_raw: '', costo_input: l.costo_actual, pvp_niveles: [] })
      return
    }

    if (/^\d+\.$/.test(value)) {
      actualizarLineaEnProceso({ nuevo_costo_raw: value })
      return
    }

    const clamped = clampNumeric(value, NUMERIC_LIMITS.costo.max, NUMERIC_LIMITS.costo.decimals)
    const numericalValue = parseFloat(clamped)
    if (isNaN(numericalValue) || numericalValue < 0) return

    if (!costoTieneCambioSignificativo(numericalValue, l.costo_actual, tasaCtx)) {
      actualizarLineaEnProceso({ nuevo_costo_raw: clamped, costo_input: numericalValue, pvp_niveles: [] })
      return
    }

    const updated: LineaWizardCompra = { ...l, nuevo_costo_raw: clamped, costo_input: numericalValue }
    const niveles = construirPvpNiveles(updated, { ...tasaCtx, niveles: getNivelesEfectivos() })
    actualizarLineaEnProceso({ nuevo_costo_raw: clamped, costo_input: numericalValue, pvp_niveles: niveles })
  }

  // ── PVP inline: mismas funciones puras que usaba pvp-confirm-sheet.tsx ──
  function handleDecisionNivel(orden: number, decision: DecisionPvp) {
    const l = lineaEnProceso
    if (!l) return
    const costoNuevoUsd = getCostoNuevoUsdForLinea(l, tasaCtx)
    const costoUsdActual = parseFloat(l.costo_usd_actual) || 0
    const nuevosNiveles = l.pvp_niveles.map((n) =>
      n.orden !== orden ? n : aplicarDecisionNivel(n, decision, { costoNuevoUsd, costoUsdActual, moneda, tasaFacturaNum })
    )
    actualizarLineaEnProceso({ pvp_niveles: nuevosNiveles })
  }

  function handlePvpInputChange(orden: number, value: string) {
    const l = lineaEnProceso
    if (!l) return
    const clamped = clampNumeric(value, NUMERIC_LIMITS.pvp.max, NUMERIC_LIMITS.pvp.decimals)
    const costoNuevoUsd = getCostoNuevoUsdForLinea(l, tasaCtx)
    const nuevosNiveles = l.pvp_niveles.map((n) =>
      n.orden !== orden ? n : actualizarPvpInput(n, clamped, { costoNuevoUsd, moneda, tasaFacturaNum })
    )
    actualizarLineaEnProceso({ pvp_niveles: nuevosNiveles })
  }

  function handleMargenInputChange(orden: number, value: string) {
    const l = lineaEnProceso
    if (!l) return
    const clamped = clampNumeric(value, NUMERIC_LIMITS.margen.max, NUMERIC_LIMITS.margen.decimals)
    const costoNuevoUsd = getCostoNuevoUsdForLinea(l, tasaCtx)
    const nuevosNiveles = l.pvp_niveles.map((n) =>
      n.orden !== orden ? n : actualizarMargenInput(n, clamped, { costoNuevoUsd, moneda, tasaFacturaNum })
    )
    actualizarLineaEnProceso({ pvp_niveles: nuevosNiveles })
  }

  function handleConfirmarProducto() {
    const l = lineaEnProceso
    if (!l) return
    if (l.cantidad_input <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }
    if (l.costo_input <= 0) {
      toast.error('El costo debe ser mayor a 0')
      return
    }
    // Regla dura (igual que desktop): no confirmar con PVP pendiente.
    const costoCambio = l.nuevo_costo_raw !== '' && costoTieneCambioSignificativo(l.costo_input, l.costo_actual, tasaCtx)
    if (lineaTieneDecisionBloqueante(costoCambio, l.pvp_niveles)) {
      toast.error('Resolvé la decisión de precios antes de confirmar')
      return
    }
    confirmarLineaEnProceso()
    toast.success(`${l.nombre} agregado a la factura`)
  }

  const l = lineaEnProceso
  const producto = l ? productoMap.get(l.producto_id) : undefined
  const options = producto ? getUnidadOptions(producto) : []
  const subtotal = l ? getLineSubtotal(l) : 0
  const costoCambio = Boolean(l && l.nuevo_costo_raw !== '' && costoTieneCambioSignificativo(l.costo_input, l.costo_actual, tasaCtx))
  const pvpBloqueante = Boolean(l && lineaTieneDecisionBloqueante(costoCambio, l.pvp_niveles))
  const casoLinea = l ? clasificarCasoLinea(l.pvp_niveles) : 'A'

  // Moneda del documento: editable solo con carrito vacio + sin producto en
  // proceso. Cambiarla con productos cargados exigiria reconvertir todos los
  // costos (riesgo fiscal) — se bloquea con aviso (recomendacion de diseno).
  const monedaBloqueada = lineas.length > 0 || lineaEnProceso !== null

  return (
    <div className="space-y-4 pt-2">
      {/* ── Moneda del documento fisico ── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-muted-foreground">Moneda del documento</label>
          {monedaBloqueada && (
            <span className="text-[10px] text-muted-foreground/70">Vaciá el carrito para cambiarla</span>
          )}
        </div>
        <div className="inline-flex rounded-xl border border-input overflow-hidden">
          {(['USD', 'BS'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={monedaBloqueada && moneda !== m}
              onClick={() => setCabecera({ moneda: m })}
              className={`px-5 py-2 text-sm font-medium transition-colors ${
                moneda === m
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              {m === 'USD' ? 'USD' : 'Bs'}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          Solo afecta la visualización. El asiento contable siempre se genera en Bolívares.
        </p>
      </div>

      {/* ── Buscador de productos + boton crear ── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
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
            disabled={loadingProductos || !!lineaEnProceso}
            autoComplete="off"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />

          {dropdownOpen && busqueda && productosFiltrados.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-background shadow-lg">
              {productosFiltrados.slice(0, 10).map((p) => {
                const costo = parseFloat(p.costo_factura_usd ?? p.costo_usd) || 0
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleSeleccionarProducto(p)}
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

        <button
          type="button"
          onClick={() => setCrearProductoOpen(true)}
          title="Crear nuevo producto"
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-foreground bg-muted border border-border rounded-xl hover:bg-muted/80 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* ── Producto en proceso (card de configuracion) ── */}
      {l ? (
        <div className="rounded-2xl border border-primary/30 bg-card shadow-md p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{l.nombre}</p>
              <p className="text-xs font-mono text-muted-foreground">{l.codigo}</p>
            </div>
            <button
              type="button"
              onClick={cancelarLineaEnProceso}
              aria-label="Descartar producto"
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
                onChange={(e) => handleCantidadChange(e.target.value)}
                onKeyDown={handleNumericKeyDown}
                onPaste={handleNumericPaste}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Unidad</label>
              <select
                value={l.unidad_seleccionada_id ?? '__base__'}
                onChange={(e) => handleUnidadChange(e.target.value)}
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
                onChange={(e) => handleNuevoCostoChange(e.target.value)}
                onKeyDown={handleNumericKeyDown}
                onPaste={handleNumericPaste}
                placeholder="Sin cambio"
                className={`w-full rounded-xl border px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring ${
                  costoCambio ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : 'border-input bg-background'
                }`}
              />
            </div>
          </div>

          {/* ── PVP inline por nivel (antes: pvp-confirm-sheet) ── */}
          {costoCambio && l.pvp_niveles.length > 0 && (
            <div className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 dark:border-amber-800 p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wide">
                Ajuste de precios
              </p>
              {l.pvp_niveles.map((nivel) => (
                <div
                  key={nivel.orden}
                  className={cn(
                    'rounded-xl border p-3 space-y-2',
                    nivel.violado ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-card'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-sm font-semibold flex items-center gap-1', nivel.violado ? 'text-destructive' : 'text-foreground')}>
                      {nivel.violado && <span aria-hidden>⚠</span>}
                      {nivel.nombre}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      PVP actual: {formatUsd(nivel.pvp_actual_usd)}
                    </span>
                  </div>

                  {nivel.decision === 'pendiente' ? (
                    <div className="space-y-2">
                      <p className={cn('text-xs', parseFloat(nivel.margen_si_mantiene_pvp) < 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                        Si se mantiene el PVP: margen {nivel.margen_si_mantiene_pvp}%
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {casoLinea === 'A' && (
                          <button
                            type="button"
                            onClick={() => handleDecisionNivel(nivel.orden, 'mantener_pvp')}
                            className="h-10 rounded-xl px-3 text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950/40 dark:text-green-400 transition-colors"
                          >
                            Mantener PVP
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDecisionNivel(nivel.orden, 'mantener_margen')}
                          className="h-10 rounded-xl px-3 text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-400 transition-colors"
                        >
                          {casoLinea === 'A' ? 'Mantener margen' : 'Recalcular por %'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDecisionNivel(nivel.orden, 'manual')}
                          className="h-10 rounded-xl px-3 text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                        >
                          Editar manual
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {nivel.decision === 'manual' ? (
                        <>
                          <label className="text-xs text-muted-foreground">Margen %</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={nivel.margen_input}
                            onChange={(e) => handleMargenInputChange(nivel.orden, e.target.value)}
                            onKeyDown={handleNumericKeyDown}
                            onPaste={handleNumericPaste}
                            className="w-20 rounded-xl border border-input bg-background px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <label className="text-xs text-muted-foreground">PVP ({monedaLabel})</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={nivel.pvp_input}
                            onChange={(e) => handlePvpInputChange(nivel.orden, e.target.value)}
                            onKeyDown={handleNumericKeyDown}
                            onPaste={handleNumericPaste}
                            className={cn(
                              'w-24 rounded-xl border px-2 py-2 text-sm text-right focus:outline-none focus:ring-2',
                              nivel.violado ? 'border-destructive focus:ring-destructive' : 'border-input focus:ring-ring'
                            )}
                          />
                        </>
                      ) : (
                        <span className="text-sm font-semibold text-foreground tabular-nums">
                          Margen {nivel.margen_input}% · PVP{' '}
                          {moneda === 'USD' ? formatUsd(parseFloat(nivel.pvp_input) || 0) : formatBs(parseFloat(nivel.pvp_input) || 0)}
                        </span>
                      )}
                      <button
                        type="button"
                        title="Cambiar decisión"
                        onClick={() => handleDecisionNivel(nivel.orden, 'pendiente')}
                        className="ml-auto text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ArrowCounterClockwise className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Lote ── */}
          {l.maneja_lotes === 1 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 p-2.5 space-y-2">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Lote</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Nro.</label>
                  <input
                    type="text"
                    value={l.lote_nro}
                    onChange={(e) => handleLoteChange('lote_nro', e.target.value.toUpperCase())}
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
                    onChange={(e) => handleLoteChange('lote_fecha_fab', e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white dark:bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Venc.</label>
                  <input
                    type="date"
                    value={l.lote_fecha_venc}
                    onChange={(e) => handleLoteChange('lote_fecha_venc', e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white dark:bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-sm font-semibold text-foreground tabular-nums">
              Subtotal: {moneda === 'USD' ? formatUsd(subtotal) : formatBs(subtotal)}
            </p>
          </div>

          {/* ── Acciones: confirmar / descartar ── */}
          <div className="flex gap-2.5 pt-1">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 h-11 rounded-xl gap-2 text-muted-foreground"
              onClick={cancelarLineaEnProceso}
            >
              <X className="h-4 w-4" />
              Descartar
            </Button>
            <Button
              type="button"
              className="flex-1 h-11 rounded-xl gap-2 bg-green-600 hover:bg-green-700 text-base"
              onClick={handleConfirmarProducto}
              disabled={pvpBloqueante}
            >
              <Check className="h-4 w-4" />
              Confirmar
            </Button>
          </div>
        </div>
      ) : (
        // ── Empty state (sin producto en proceso) ──
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center rounded-xl border border-dashed border-border bg-muted/20">
          <Package className="h-9 w-9 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground max-w-xs">
            {lineas.length > 0
              ? 'Buscá otro producto para seguir agregando. Los confirmados están en el carrito.'
              : 'Buscá un producto arriba para agregarlo a la factura'}
          </p>
        </div>
      )}

      <ProductoForm isOpen={crearProductoOpen} onClose={() => setCrearProductoOpen(false)} />
    </div>
  )
}
