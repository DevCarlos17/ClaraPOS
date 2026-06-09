import React, { useState, useEffect, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash, MagnifyingGlass, Money, Package, UserPlus, X, CheckCircle, ArrowCounterClockwise } from '@phosphor-icons/react'
import { compraHeaderSchema, lineaCompraSchema, pagoCompraSchema } from '@/features/inventario/schemas/compra-schema'
import { crearCompra, type PagoCompraParam, type CrearCompraParams } from '@/features/inventario/hooks/use-compras'
import { useProveedoresActivos } from '@/features/proveedores/hooks/use-proveedores'
import { useProductosTipo, type Producto } from '@/features/inventario/hooks/use-productos'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useConversiones } from '@/features/inventario/hooks/use-unidades-conversion'
import { useUnidadesActivas } from '@/features/inventario/hooks/use-unidades'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useImpuestosActivos } from '@/features/configuracion/hooks/use-impuestos'
import { formatUsd, formatBs } from '@/lib/currency'
import { todayStr } from '@/lib/dates'
import { db } from '@/core/db/powersync/db'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ProductoForm } from '@/features/inventario/components/productos/producto-form'
import { ProveedorForm } from '@/features/proveedores/components/proveedor-form'

interface UnidadOption {
  id: string | null
  nombre: string
  abreviatura: string
  factor: number
}

interface LineaUI {
  producto_id: string
  codigo: string
  nombre: string
  unidad_base_id: string | null
  unidadOptions: UnidadOption[]
  unidad_seleccionada_id: string | null
  factor: number
  cantidad_input: number

  // Costo en dos partes:
  // • costo_actual   = costo vigente en sistema en la moneda display (read-only)
  // • nuevo_costo_raw = lo que escribe el usuario ('' = sin cambio)
  // • costo_input    = efectivo = nuevo_costo_raw si no vacío, si no costo_actual
  //   (mantenemos costo_input como campo derivado para que todos los cálculos existentes funcionen)
  costo_actual: number
  nuevo_costo_raw: string
  costo_input: number  // = getCostoEfectivo(l) — se mantiene sincronizado

  tipo_impuesto: 'Gravable' | 'Exento' | 'Exonerado'
  impuesto_pct: number
  maneja_lotes: number
  lote_nro: string
  lote_fecha_fab: string
  lote_fecha_venc: string

  // Datos del sistema para contexto de precios (read-only)
  costo_usd_actual: string      // costo en USD (para comparaciones y proyecciones)
  precio_venta_usd: string      // PVP actual en USD
  margen_actual: string         // margen % actual (derivado de costo/pvp vigentes)

  // Decisión del usuario sobre qué hacer con el PVP cuando el costo cambia
  // null = no decidió aún | 'mantener' = no tocar pvp | 'actualizar' = recalcular
  pvp_decision: null | 'mantener' | 'actualizar'
  nuevo_pvp_input: string       // PVP editable en moneda factura (solo activo cuando pvp_decision='actualizar')
  nuevo_margen_input: string    // Margen % editable (solo activo cuando pvp_decision='actualizar')
}

interface PagoUI {
  metodo_cobro_id: string
  metodo_nombre: string
  moneda: 'USD' | 'BS'
  monto: number
  banco_empresa_id: string | null
  referencia?: string
}

interface CompraFormProps {
  onClose: () => void
}

// ── Límites numéricos por contexto de negocio ─────────────────────────────────
// Derivados de la realidad del negocio, no de límites técnicos arbitrarios.
// El techo real es la columna NUMERIC(12,2) de PostgreSQL (~10 mil millones);
// estos límites son más conservadores y representan valores realistas para
// una clínica estética con operación bimonetaria venezolana.
const NUMERIC_LIMITS = {
  // NUMERIC(12,4) en DB → max teórico 99,999,999. Usamos 9,999,999 como techo práctico para tasas Bs/USD.
  tasa:     { max: 9_999_999,       decimals: 4 },
  // NUMERIC(12,3) en DB → max teórico 999,999,999.999.
  cantidad: { max: 999_999_999,     decimals: 3 },
  // NUMERIC(12,2) en DB → max exacto 9,999,999,999.99. Cubre USD y Bs sin problema.
  costo:    { max: 9_999_999_999,   decimals: 2 },
  pvp:      { max: 9_999_999_999,   decimals: 2 },
  margen:   { max: 9_999,           decimals: 1 },  // % — 10.000% de margen es irreal
  monto:    { max: 9_999_999_999,   decimals: 2 },
} as const

/**
 * Clamps un valor numérico al máximo permitido y lo devuelve como string
 * con la precisión decimal correcta. Retorna '' si el input está vacío.
 * Úsalo en onChange para evitar que el usuario acumule dígitos sin sentido.
 */
function clampNumeric(value: string, max: number, decimals: number): string {
  if (value === '' || value === '-') return value
  const num = parseFloat(value)
  if (isNaN(num)) return value
  if (num > max) return max.toFixed(decimals)
  // Truncar decimales excedentes sin redondear (para no alterar el valor intencionado)
  const parts = value.split('.')
  if (parts[1] && parts[1].length > decimals) {
    return parts[0] + '.' + parts[1].slice(0, decimals)
  }
  return value
}

// ── Handlers globales para inputs (sin estado, seguros fuera del componente) ───

/**
 * Campos de texto seguro: solo [A-Za-z0-9-].
 * Bloquea todo lo demás incluyendo Alt+numpad (Windows) que permite insertar
 * caracteres especiales aunque el key visible parezca inofensivo.
 * Se aplica a nro_factura, nro_control y referencia de pago.
 */
const SAFE_TEXT_RE = /^[A-Za-z0-9\-]$/

function handleSafeTextKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  const control = [
    'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End',
  ]
  if (control.includes(e.key)) return
  if (e.ctrlKey || e.metaKey) return  // Ctrl+C, Ctrl+V, Ctrl+A, etc.
  // Bloquear Alt+numpad (Windows): genera chars especiales aunque pasen el regex
  if (e.altKey) { e.preventDefault(); return }
  if (!SAFE_TEXT_RE.test(e.key)) e.preventDefault()
}

function handleSafeTextPaste(e: React.ClipboardEvent<HTMLInputElement>) {
  const text = e.clipboardData.getData('text')
  const cleaned = text.replace(/[^A-Za-z0-9\-]/g, '')
  if (cleaned !== text) {
    e.preventDefault()
    const sanitized = cleaned.toUpperCase()
    // Insertar solo la parte segura del clipboard en la posicion del cursor
    const input = e.currentTarget
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const newValue = input.value.slice(0, start) + sanitized + input.value.slice(end)
    // Disparar el cambio via el setter nativo para que React lo procese
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set
    nativeInputValueSetter?.call(input, newValue)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
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

export function CompraForm({ onClose }: CompraFormProps) {
  const { proveedores, isLoading: loadingProveedores } = useProveedoresActivos()
  const { productos, isLoading: loadingProductos } = useProductosTipo('P')
  const { tasaValor } = useTasaActual()
  const { user } = useCurrentUser()
  const { conversiones } = useConversiones()
  const { unidades } = useUnidadesActivas()
  const { metodos, isLoading: loadingMetodos } = useMetodosPagoActivos()
  const { impuestos } = useImpuestosActivos()

  // Mapa impuesto_iva_id → porcentaje para resolución rápida al agregar producto
  const impuestoMap = useMemo(
    () => new Map(impuestos.map((imp) => [imp.id, parseFloat(imp.porcentaje) || 0])),
    [impuestos]
  )

  // Header fields
  const [fechaFactura, setFechaFactura] = useState(todayStr())
  const [nroFactura, setNroFactura] = useState('')
  const [nroControl, setNroControl] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [moneda, setMoneda] = useState<'USD' | 'BS'>('USD')

  // Lines
  const [lineas, setLineas] = useState<LineaUI[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Tasa paralela
  const [usaTasaParalela, setUsaTasaParalela] = useState(false)
  const [tasaInterna, setTasaInterna] = useState(tasaValor > 0 ? tasaValor.toFixed(4) : '')
  const [tasaInternaFound, setTasaInternaFound] = useState(false)
  const [tasaProveedor, setTasaProveedor] = useState('')

  // Confirmar registro
  const [showConfirm, setShowConfirm] = useState(false)
  const pendingParamsRef = useRef<CrearCompraParams | null>(null)

  // Auto-lookup tasa interna para la fecha de factura
  useEffect(() => {
    if (!user?.empresa_id || !fechaFactura) return

    const hoyStr = todayStr()

    if (fechaFactura === hoyStr) {
      // Fecha es hoy: usar tasa vigente actual directamente
      if (tasaValor > 0) {
        setTasaInterna(tasaValor.toFixed(4))
        setTasaInternaFound(true)
      } else {
        setTasaInternaFound(false)
      }
      return
    }

    // Fecha pasada: buscar tasa historica para esa fecha.
    // substr(fecha, 1, 10) extrae YYYY-MM-DD del timestamp ISO almacenado como texto
    // ('2026-06-07T18:30:00.000-04:00' → '2026-06-07'), evitando que la comparacion
    // lexicografica falle porque el timestamp completo es mayor que la fecha plana.
    db.getAll<{ valor: string }>(
      `SELECT valor FROM tasas_cambio WHERE empresa_id = ? AND substr(fecha, 1, 10) <= ? ORDER BY fecha DESC LIMIT 1`,
      [user.empresa_id, fechaFactura]
    ).then((rows) => {
      if (rows.length > 0) {
        setTasaInterna(parseFloat(rows[0].valor).toFixed(4))
        setTasaInternaFound(true)
      } else {
        setTasaInterna('')
        setTasaInternaFound(false)
      }
    }).catch(() => setTasaInternaFound(false))
  }, [fechaFactura, user?.empresa_id, tasaValor])

  // Product search
  const [busqueda, setBusqueda] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Pagos
  const [pagos, setPagos] = useState<PagoUI[]>([])
  const [pagoMetodoId, setPagoMetodoId] = useState('')
  const [pagoMonto, setPagoMonto] = useState('')
  const [pagoReferencia, setPagoReferencia] = useState('')

  // Modals
  const [showCrearProducto, setShowCrearProducto] = useState(false)
  const [showCrearProveedor, setShowCrearProveedor] = useState(false)

  const tasaInternaNum = parseFloat(tasaInterna) || 0
  const tasaProveedorNum = parseFloat(tasaProveedor) || 0
  const tasaFacturaNum = usaTasaParalela ? tasaProveedorNum : tasaInternaNum

  // Validacion de fecha: advertencia si es futura
  const hoy = todayStr()
  const fechaEsFutura = fechaFactura > hoy

  const productosFiltrados = productos.filter(
    (p) =>
      !lineas.some((l) => l.producto_id === p.id) &&
      (p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.codigo.toLowerCase().includes(busqueda.toLowerCase()))
  )

  // Build unit map for quick lookup
  const unidadMap = new Map(unidades.map((u) => [u.id, u]))

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

  function getLineSubtotal(l: LineaUI): number {
    return l.cantidad_input * l.costo_input
  }

  // Costo sistema por unidad (a tasa interna) para mostrar en gris
  function getCostoSistema(l: LineaUI): number | null {
    if (!usaTasaParalela || tasaInternaNum <= 0) return null
    if (moneda === 'USD') {
      // costo_usd * tasa_proveedor / tasa_interna
      return tasaFacturaNum > 0 ? l.costo_input * tasaFacturaNum / tasaInternaNum : null
    } else {
      // costo_bs / tasa_interna
      return l.costo_input / tasaInternaNum
    }
  }

  function getSubtotalSistema(l: LineaUI): number | null {
    const cs = getCostoSistema(l)
    if (cs === null) return null
    return l.cantidad_input * cs
  }

  // Subtotal sin IVA (en moneda de visualizacion)
  const totalDisplay = lineas.reduce((sum, l) => sum + getLineSubtotal(l), 0)

  // Desglose fiscal en USD, agrupado por alicuota de IVA
  const desgloseUsd = useMemo(() => {
    let exento = 0
    const gravableMap = new Map<number, { base: number; iva: number }>()

    for (const l of lineas) {
      const subtotalUsd = moneda === 'USD'
        ? getLineSubtotal(l)
        : (tasaFacturaNum > 0 ? getLineSubtotal(l) / tasaFacturaNum : 0)

      if (l.tipo_impuesto !== 'Gravable') {
        exento += subtotalUsd
      } else {
        const existing = gravableMap.get(l.impuesto_pct) ?? { base: 0, iva: 0 }
        const ivaAmount = subtotalUsd * (l.impuesto_pct / 100)
        gravableMap.set(l.impuesto_pct, {
          base: existing.base + subtotalUsd,
          iva: existing.iva + ivaAmount,
        })
      }
    }

    const gravableGroups = Array.from(gravableMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([pct, { base, iva }]) => ({
        pct,
        base: Number(base.toFixed(2)),
        iva: Number(iva.toFixed(2)),
      }))

    const totalIvaUsd = Number(gravableGroups.reduce((sum, g) => sum + g.iva, 0).toFixed(2))

    return {
      exentoUsd: Number(exento.toFixed(2)),
      gravableGroups,
      totalIvaUsd,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, moneda, tasaFacturaNum])

  const { exentoUsd, gravableGroups, totalIvaUsd } = desgloseUsd

  // IVA en moneda de visualizacion: cuando moneda=BS se calcula directo en Bs para evitar
  // doble conversion (Bs->USD->redondeo->Bs) que genera perdida de precision
  const totalIvaBs = lineas.reduce((sum, l) => {
    if (l.tipo_impuesto !== 'Gravable') return sum
    return sum + getLineSubtotal(l) * (l.impuesto_pct / 100)
  }, 0)
  const totalIvaDisplay = moneda === 'USD' ? totalIvaUsd : totalIvaBs
  const totalConIvaDisplay = totalDisplay + totalIvaDisplay

  // totalUsd: siempre a tasa del proveedor (para CxP), incluye IVA
  const totalUsd = moneda === 'USD'
    ? totalConIvaDisplay
    : (tasaFacturaNum > 0 ? totalConIvaDisplay / tasaFacturaNum : 0)
  const totalBs = moneda === 'BS' ? totalConIvaDisplay : totalConIvaDisplay * tasaFacturaNum

  // totalUsdSistema: a tasa interna (para inventario y contabilidad, sin IVA)
  const totalUsdSistema = usaTasaParalela && tasaInternaNum > 0
    ? (moneda === 'USD'
        ? (tasaFacturaNum > 0 ? totalDisplay * tasaFacturaNum / tasaInternaNum : 0)
        : totalDisplay / tasaInternaNum)
    : totalUsd

  // Payment calculations always at proveedor rate (tasaFacturaNum)
  const totalAbonadoUsd = pagos.reduce((sum, p) => {
    const mUsd = p.moneda === 'BS' ? (tasaFacturaNum > 0 ? p.monto / tasaFacturaNum : 0) : p.monto
    return sum + mUsd
  }, 0)
  // totalAbonadoBs: suma directa en Bs sin pasar por USD para evitar perdida de precision
  const totalAbonadoBs = pagos.reduce((sum, p) => {
    const mBs = p.moneda === 'USD' ? p.monto * tasaFacturaNum : p.monto
    return sum + mBs
  }, 0)
  const pendienteUsd = Math.max(0, Number((totalUsd - totalAbonadoUsd).toFixed(2)))
  // pendienteBs: calculado directo desde totalBs, no desde pendienteUsd * tasa
  const pendienteBs = Math.max(0, Number((totalBs - totalAbonadoBs).toFixed(2)))
  const tipoDetectado: 'CONTADO' | 'CREDITO' = pendienteUsd <= 0.01 ? 'CONTADO' : 'CREDITO'

  const metodoSeleccionado = metodos.find((m) => m.id === pagoMetodoId)

  function handleAddProducto(producto: Producto) {
    const options = getUnidadOptions(producto)
    const costoBase = parseFloat(producto.costo_usd) || 0
    const costoDisplay = moneda === 'USD' ? costoBase : costoBase * tasaFacturaNum
    const pvpUsd = parseFloat(producto.precio_venta_usd) || 0

    // Margen actual del producto: (pvp - costo) / costo * 100
    const margenActual = costoBase > 0 && pvpUsd > 0
      ? ((pvpUsd - costoBase) / costoBase * 100).toFixed(1)
      : '0.0'

    // Resolver porcentaje IVA desde el catálogo de impuestos
    const tipoImp = (producto.tipo_impuesto as 'Gravable' | 'Exento' | 'Exonerado') ?? 'Exento'
    const pctIva = producto.impuesto_iva_id
      ? (impuestoMap.get(producto.impuesto_iva_id) ?? 0)
      : 0

    const costoDisplayRounded = Number(costoDisplay.toFixed(2))
    setLineas((prev) => [
      ...prev,
      {
        producto_id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        unidad_base_id: producto.unidad_base_id,
        unidadOptions: options,
        unidad_seleccionada_id: null,
        factor: 1,
        cantidad_input: 1,
        costo_actual: costoDisplayRounded,
        nuevo_costo_raw: '',
        costo_input: costoDisplayRounded,  // efectivo = costo_actual hasta que el usuario escriba
        tipo_impuesto: tipoImp,
        impuesto_pct: pctIva,
        maneja_lotes: Number(producto.maneja_lotes) || 0,
        lote_nro: '',
        lote_fecha_fab: '',
        lote_fecha_venc: '',
        costo_usd_actual: producto.costo_usd,
        precio_venta_usd: producto.precio_venta_usd,
        margen_actual: margenActual,
        pvp_decision: null,
        nuevo_pvp_input: '',
        nuevo_margen_input: margenActual,
      },
    ])
    setBusqueda('')
    setDropdownOpen(false)
  }

  function handleRemoveLinea(index: number) {
    setLineas((prev) => prev.filter((_, i) => i !== index))
    setErrors((prev) => {
      const next = { ...prev }
      delete next['lineas']
      return next
    })
  }

  function handleLineaChange(index: number, field: 'cantidad_input', value: string) {
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        const clamped = clampNumeric(value, NUMERIC_LIMITS.cantidad.max, NUMERIC_LIMITS.cantidad.decimals)
        const num = parseFloat(clamped)
        return { ...l, [field]: isNaN(num) || num < 0 ? 0 : num }
      })
    )
  }

  /** Maneja cambios en el campo "Nuevo Costo" de una línea. */
  function handleNuevoCostoChange(index: number, value: string) {
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l

        // Blank → sin cambio: restaurar costo_input al costo_actual
        if (value === '') {
          return { ...l, nuevo_costo_raw: '', costo_input: l.costo_actual, pvp_decision: null }
        }

        // Decimal incompleto ("1.", "12.", etc.) → guardar el raw sin recalcular todavía.
        // type="text" nos da el valor real; no recalculamos hasta tener un número completo.
        if (/^\d+\.$/.test(value)) {
          return { ...l, nuevo_costo_raw: value }
        }

        const clamped = clampNumeric(value, NUMERIC_LIMITS.costo.max, NUMERIC_LIMITS.costo.decimals)
        const numericalValue = parseFloat(clamped)
        if (isNaN(numericalValue) || numericalValue < 0) return l

        // costo_input = nuevo costo ingresado (ya clampeado)
        const updated = { ...l, nuevo_costo_raw: clamped, costo_input: numericalValue }

        // Calcular costo nuevo en USD por unidad base (para comparar con pvp)
        let costoNuevoUsd: number
        if (moneda === 'USD') {
          costoNuevoUsd = l.factor > 0 ? numericalValue / l.factor : numericalValue
        } else {
          const costoOrig = tasaFacturaNum > 0 ? numericalValue / tasaFacturaNum : 0
          costoNuevoUsd = l.factor > 0 ? costoOrig / l.factor : costoOrig
        }

        const costoUsdActual = parseFloat(l.costo_usd_actual) || 0
        const pvpActualUsd = parseFloat(l.precio_venta_usd) || 0

        console.log('[NuevoCosto]', {
          producto: l.nombre,
          costoNuevoUsd: costoNuevoUsd.toFixed(4),
          costoUsdActual: costoUsdActual.toFixed(4),
          pvpActualUsd: pvpActualUsd.toFixed(4),
          superaPvp: costoNuevoUsd > pvpActualUsd + 0.0001,
        })

        // Sin cambio real → no necesita decisión
        if (Math.abs(costoNuevoUsd - costoUsdActual) < 0.0001) {
          return { ...updated, pvp_decision: null }
        }

        // Nuevo costo SUPERA el PVP → forzar actualización obligatoria.
        // No se puede registrar una compra donde el costo sea mayor al precio de venta.
        if (costoNuevoUsd > pvpActualUsd + 0.0001) {
          const margenDecimal = costoUsdActual > 0 && pvpActualUsd > 0
            ? (pvpActualUsd - costoUsdActual) / costoUsdActual
            : 0
          const proyPvp = Math.max(costoNuevoUsd, Number((costoNuevoUsd * (1 + margenDecimal)).toFixed(2)))
          const proyMargen = costoNuevoUsd > 0
            ? ((proyPvp - costoNuevoUsd) / costoNuevoUsd * 100).toFixed(1)
            : '0.0'
          return {
            ...updated,
            pvp_decision: 'actualizar',
            nuevo_pvp_input: moneda === 'USD' ? proyPvp.toFixed(2) : (proyPvp * tasaFacturaNum).toFixed(2),
            nuevo_margen_input: proyMargen,
          }
        }

        // Costo cambió pero el PVP todavía cubre el nuevo costo → el usuario decide.
        // Resetear a null para que aparezcan los botones "Mantener PVP" / "Actualizar PVP".
        return { ...updated, pvp_decision: null }
      })
    )
  }

  /** Maneja la decisión del usuario: mantener o actualizar PVP. */
  function handlePvpDecision(index: number, decision: 'mantener' | 'actualizar') {
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        if (decision === 'mantener') {
          // Pre-calcular nuevo margen: (pvp_actual - nuevo_costo) / nuevo_costo
          let costoNuevoUsd: number
          if (moneda === 'USD') {
            costoNuevoUsd = l.factor > 0 ? l.costo_input / l.factor : l.costo_input
          } else {
            const costoOrig = tasaFacturaNum > 0 ? l.costo_input / tasaFacturaNum : 0
            costoNuevoUsd = l.factor > 0 ? costoOrig / l.factor : costoOrig
          }
          const pvpActualUsd = parseFloat(l.precio_venta_usd) || 0
          const nuevoMargen = costoNuevoUsd > 0
            ? ((pvpActualUsd - costoNuevoUsd) / costoNuevoUsd * 100).toFixed(1)
            : '0.0'
          return {
            ...l,
            pvp_decision: 'mantener',
            nuevo_pvp_input: moneda === 'USD' ? pvpActualUsd.toFixed(2) : (pvpActualUsd * tasaFacturaNum).toFixed(2),
            nuevo_margen_input: nuevoMargen,
          }
        }
        // Actualizar: pre-rellenar pvp/margen con los valores proyectados
        let costoNuevoUsd: number
        if (moneda === 'USD') {
          costoNuevoUsd = l.factor > 0 ? l.costo_input / l.factor : l.costo_input
        } else {
          const costoOrig = tasaFacturaNum > 0 ? l.costo_input / tasaFacturaNum : 0
          costoNuevoUsd = l.factor > 0 ? costoOrig / l.factor : costoOrig
        }
        const costoUsdActual = parseFloat(l.costo_usd_actual) || 0
        const pvpActualUsd = parseFloat(l.precio_venta_usd) || 0
        const margenDecimal = costoUsdActual > 0 && pvpActualUsd > 0
          ? (pvpActualUsd - costoUsdActual) / costoUsdActual
          : 0
        const proyPvp = Math.max(costoNuevoUsd, Number((costoNuevoUsd * (1 + margenDecimal)).toFixed(2)))
        const proyMargen = costoNuevoUsd > 0
          ? ((proyPvp - costoNuevoUsd) / costoNuevoUsd * 100).toFixed(1)
          : '0.0'
        return {
          ...l,
          pvp_decision: 'actualizar',
          nuevo_pvp_input: moneda === 'USD' ? proyPvp.toFixed(2) : (proyPvp * tasaFacturaNum).toFixed(2),
          nuevo_margen_input: proyMargen,
        }
      })
    )
  }

  /** Usuario edita el PVP directamente → recalcular margen. */
  function handleNuevoPvpChange(index: number, value: string) {
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        const clamped = clampNumeric(value, NUMERIC_LIMITS.pvp.max, NUMERIC_LIMITS.pvp.decimals)
        const pvpNum = parseFloat(clamped)
        if (isNaN(pvpNum) || pvpNum < 0) return { ...l, nuevo_pvp_input: clamped }
        // Convertir a USD para calcular el margen (que siempre es USD/USD)
        const pvpUsd = moneda === 'USD' ? pvpNum : (tasaFacturaNum > 0 ? pvpNum / tasaFacturaNum : pvpNum)
        let costoNuevoUsd: number
        if (moneda === 'USD') {
          costoNuevoUsd = l.factor > 0 ? l.costo_input / l.factor : l.costo_input
        } else {
          const c = tasaFacturaNum > 0 ? l.costo_input / tasaFacturaNum : 0
          costoNuevoUsd = l.factor > 0 ? c / l.factor : c
        }
        const nuevoMargen = costoNuevoUsd > 0
          ? ((pvpUsd - costoNuevoUsd) / costoNuevoUsd * 100).toFixed(1)
          : '0.0'
        return { ...l, nuevo_pvp_input: clamped, nuevo_margen_input: nuevoMargen }
      })
    )
  }

  /** Usuario edita el margen → recalcular PVP. */
  function handleNuevoMargenChange(index: number, value: string) {
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        const clamped = clampNumeric(value, NUMERIC_LIMITS.margen.max, NUMERIC_LIMITS.margen.decimals)
        const margenNum = parseFloat(clamped)
        if (isNaN(margenNum)) return { ...l, nuevo_margen_input: clamped }
        let costoNuevoUsd: number
        if (moneda === 'USD') {
          costoNuevoUsd = l.factor > 0 ? l.costo_input / l.factor : l.costo_input
        } else {
          const c = tasaFacturaNum > 0 ? l.costo_input / tasaFacturaNum : 0
          costoNuevoUsd = l.factor > 0 ? c / l.factor : c
        }
        const nuevoPvpUsd = Number((costoNuevoUsd * (1 + margenNum / 100)).toFixed(2))
        const nuevoPvpDisplay = moneda === 'USD' ? nuevoPvpUsd : nuevoPvpUsd * tasaFacturaNum
        return { ...l, nuevo_margen_input: clamped, nuevo_pvp_input: Math.max(0, nuevoPvpDisplay).toFixed(2) }
      })
    )
  }

  /** Revierte una línea al estado original: sin nuevo costo ni decisión de PVP. */
  function handleResetLinea(index: number) {
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        return {
          ...l,
          nuevo_costo_raw: '',
          costo_input: l.costo_actual,
          pvp_decision: null,
          nuevo_pvp_input: '',
          nuevo_margen_input: '',
        }
      })
    )
  }

  function handleLoteChange(index: number, field: 'lote_nro' | 'lote_fecha_fab' | 'lote_fecha_venc', value: string) {
    setLineas((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    )
  }

  function handleUnidadChange(index: number, unidadId: string) {
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        const option = l.unidadOptions.find((o) =>
          unidadId === '__base__' ? o.id === null : o.id === unidadId
        )
        if (!option) return l

        // Convertir costo_actual y costo_input a la nueva unidad
        const oldActualPerBase = l.factor > 0 ? l.costo_actual / l.factor : l.costo_actual
        const newCostoActual = Number((oldActualPerBase * option.factor).toFixed(2))

        let newNuevoCostoRaw = l.nuevo_costo_raw
        let newCostoInput = newCostoActual
        if (l.nuevo_costo_raw !== '') {
          const oldNuevoCostoPerBase = l.factor > 0
            ? parseFloat(l.nuevo_costo_raw) / l.factor
            : parseFloat(l.nuevo_costo_raw)
          newNuevoCostoRaw = (oldNuevoCostoPerBase * option.factor).toFixed(2)
          newCostoInput = Number(newNuevoCostoRaw)
        }

        return {
          ...l,
          unidad_seleccionada_id: option.id,
          factor: option.factor,
          costo_actual: newCostoActual,
          nuevo_costo_raw: newNuevoCostoRaw,
          costo_input: newCostoInput,
        }
      })
    )
  }

  function handleMonedaSwitch(newMoneda: 'USD' | 'BS') {
    if (newMoneda === moneda || tasaFacturaNum <= 0) return

    setLineas((prev) =>
      prev.map((l) => {
        const convert = (val: number) =>
          newMoneda === 'BS'
            ? Number((val * tasaFacturaNum).toFixed(2))
            : Number((val / tasaFacturaNum).toFixed(2))

        const newCostoActual = convert(l.costo_actual)
        let newNuevoCostoRaw = l.nuevo_costo_raw
        let newCostoInput = newCostoActual
        if (l.nuevo_costo_raw !== '') {
          newNuevoCostoRaw = convert(parseFloat(l.nuevo_costo_raw)).toString()
          newCostoInput = Number(newNuevoCostoRaw)
        }

        // Convertir también el PVP ingresado (nuevo_pvp_input está en moneda display)
        let newNuevoPvpInput = l.nuevo_pvp_input
        if (l.nuevo_pvp_input !== '') {
          newNuevoPvpInput = convert(parseFloat(l.nuevo_pvp_input)).toFixed(2)
        }

        return {
          ...l,
          costo_actual: newCostoActual,
          nuevo_costo_raw: newNuevoCostoRaw,
          costo_input: newCostoInput,
          nuevo_pvp_input: newNuevoPvpInput,
        }
      })
    )
    setMoneda(newMoneda)
  }

  function handleAddPago() {
    if (!metodoSeleccionado) return

    const montoNum = parseFloat(pagoMonto)

    const parsed = pagoCompraSchema.safeParse({
      metodo_cobro_id: pagoMetodoId,
      moneda: metodoSeleccionado.moneda,
      monto: isNaN(montoNum) ? 0 : montoNum,
      banco_empresa_id: metodoSeleccionado.banco_empresa_id ?? null,
      referencia: pagoReferencia.trim() || undefined,
    })

    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Datos de pago inválidos'
      toast.error(msg)
      return
    }

    setPagos((prev) => [
      ...prev,
      {
        metodo_cobro_id: parsed.data.metodo_cobro_id,
        metodo_nombre: metodoSeleccionado.nombre,
        moneda: parsed.data.moneda as 'USD' | 'BS',
        monto: parsed.data.monto,
        banco_empresa_id: metodoSeleccionado.banco_empresa_id,
        referencia: parsed.data.referencia,
      },
    ])
    setPagoMetodoId('')
    setPagoMonto('')
    setPagoReferencia('')
  }

  function handleRemovePago(index: number) {
    setPagos((prev) => prev.filter((_, i) => i !== index))
  }

  function handlePagoMax() {
    if (!metodoSeleccionado || totalUsd <= 0) return
    if (metodoSeleccionado.moneda === 'BS') {
      setPagoMonto(pendienteBs.toFixed(2))
    } else {
      setPagoMonto(pendienteUsd.toFixed(2))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    if (tasaInternaNum <= 0) {
      setErrors({ tasa_interna: 'Ingrese la tasa interna (Bs/USD)' })
      return
    }

    if (usaTasaParalela && tasaProveedorNum <= 0) {
      setErrors({ tasa_proveedor: 'Ingrese la tasa del proveedor para usar tasa paralela' })
      return
    }

    const headerParsed = compraHeaderSchema.safeParse({
      proveedor_id: proveedorId,
      tasa: tasaFacturaNum,
      fecha_factura: fechaFactura,
      nro_factura: nroFactura,
      nro_control: nroControl || undefined,
      moneda,
    })

    if (!headerParsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of headerParsed.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    if (lineas.length === 0) {
      setErrors({ lineas: 'Debe agregar al menos un producto' })
      return
    }

    // Validar que todos los productos con costo modificado tengan una decisión de PVP.
    // pvp_decision === null significa que el usuario aún no eligió entre mantener o actualizar.
    const lineasSinDecision = lineas.filter(
      (l) => lineaTieneCostoCambiado(l) && l.pvp_decision === null
    )
    if (lineasSinDecision.length > 0) {
      const nombres = lineasSinDecision.map((l) => l.nombre).join(', ')
      setErrors({ lineas: `Elegí qué hacer con el PVP de: ${nombres}` })
      return
    }

    // Convertir lineas a unidades base en USD para almacenamiento
    const lineasConvertidas = lineas.map((l, i) => {
      const cantidadBase = l.cantidad_input * l.factor
      let costoUnitarioUsd: number
      let costoUsdSistema: number

      if (moneda === 'USD') {
        costoUnitarioUsd = l.factor > 0 ? l.costo_input / l.factor : l.costo_input
        if (usaTasaParalela && tasaInternaNum > 0 && tasaFacturaNum > 0) {
          costoUsdSistema = costoUnitarioUsd * tasaFacturaNum / tasaInternaNum
        } else {
          costoUsdSistema = costoUnitarioUsd
        }
      } else {
        const costoOrigPerUnit = tasaFacturaNum > 0 ? l.costo_input / tasaFacturaNum : 0
        costoUnitarioUsd = l.factor > 0 ? costoOrigPerUnit / l.factor : costoOrigPerUnit
        if (usaTasaParalela && tasaInternaNum > 0) {
          const costoBcvPerUnit = l.costo_input / tasaInternaNum
          costoUsdSistema = l.factor > 0 ? costoBcvPerUnit / l.factor : costoBcvPerUnit
        } else {
          costoUsdSistema = costoUnitarioUsd
        }
      }

      const parsed = lineaCompraSchema.safeParse({
        producto_id: l.producto_id,
        cantidad: cantidadBase,
        costo_unitario_usd: Number(costoUnitarioUsd.toFixed(4)),
        tipo_impuesto: l.tipo_impuesto,
        impuesto_pct: l.impuesto_pct,
      })

      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? 'Error en linea'
        setErrors({ lineas: `Linea ${i + 1} (${l.nombre}): ${msg}` })
        return null
      }

      // Determinar si el costo realmente cambió respecto al sistema
      const costoUsdActual = parseFloat(l.costo_usd_actual) || 0
      const costoCambio = l.nuevo_costo_raw !== '' && Math.abs(costoUnitarioUsd - costoUsdActual) > 0.0001

      // Determinar decisión sobre el PVP.
      // Si llegamos acá con pvp_decision === null, la validación previa lo bloqueó,
      // pero el fallback seguro es no actualizar (nunca pisar un PVP sin decisión explícita).
      const noActualizarPvp = !costoCambio || l.pvp_decision === 'mantener' || l.pvp_decision === null
      const nuevoPvpUsd = l.pvp_decision === 'actualizar' && l.nuevo_pvp_input !== ''
        ? Number((moneda === 'USD'
            ? parseFloat(l.nuevo_pvp_input)
            : (tasaFacturaNum > 0 ? parseFloat(l.nuevo_pvp_input) / tasaFacturaNum : 0)
          ).toFixed(2))
        : undefined

      return {
        producto_id: l.producto_id,
        cantidad: cantidadBase,
        costo_unitario_usd: Number(costoUnitarioUsd.toFixed(4)),
        costo_usd_sistema: Number(costoUsdSistema.toFixed(4)),
        tipo_impuesto: l.tipo_impuesto,
        impuesto_pct: l.impuesto_pct,
        lote_nro: l.lote_nro.trim() || undefined,
        lote_fecha_fab: l.lote_fecha_fab || undefined,
        lote_fecha_venc: l.lote_fecha_venc || undefined,
        costo_cambio: costoCambio,
        no_actualizar_pvp: noActualizarPvp,
        nuevo_precio_venta_usd: nuevoPvpUsd,
      }
    })

    if (productosFiltrados && lineasConvertidas.some((l) => l === null)) return
    const lineasValidas = lineasConvertidas.filter((l): l is NonNullable<typeof l> => l !== null)

    const pagosParam: PagoCompraParam[] = pagos.map((p) => ({
      metodo_cobro_id: p.metodo_cobro_id,
      moneda: p.moneda,
      monto: p.monto,
      banco_empresa_id: p.banco_empresa_id,
      referencia: p.referencia,
    }))

    // Validar pagos con Zod (segunda barrera — la primera es en handleAddPago)
    for (let i = 0; i < pagos.length; i++) {
      const p = pagos[i]
      const parsedPago = pagoCompraSchema.safeParse({
        metodo_cobro_id: p.metodo_cobro_id,
        moneda: p.moneda,
        monto: p.monto,
        banco_empresa_id: p.banco_empresa_id ?? null,
        referencia: p.referencia,
      })
      if (!parsedPago.success) {
        const msg = parsedPago.error.issues[0]?.message ?? 'Error en pago'
        setErrors({ pagos: `Pago ${i + 1} (${p.metodo_nombre}): ${msg}` })
        return
      }
    }

    // Validar que no haya PVP menor al costo sistema antes de mostrar confirmacion
    const lineasConMargenNeg = lineasValidas.filter(
      (l) => l.nuevo_precio_venta_usd !== undefined && l.nuevo_precio_venta_usd < l.costo_usd_sistema
    )
    if (lineasConMargenNeg.length > 0) {
      toast.error('Hay productos con PVP menor al costo. Corrija los precios antes de guardar.')
      return
    }

    // Guardar params y mostrar confirmacion
    pendingParamsRef.current = {
      proveedor_id: headerParsed.data.proveedor_id,
      tasa: usaTasaParalela ? tasaProveedorNum : tasaInternaNum,
      tasa_costo: usaTasaParalela ? tasaInternaNum : undefined,
      fecha_factura: headerParsed.data.fecha_factura,
      nro_factura: headerParsed.data.nro_factura,
      nro_control: headerParsed.data.nro_control,
      moneda: headerParsed.data.moneda,
      lineas: lineasValidas,
      pagos: pagosParam,
      usuario_id: user.id,
      empresa_id: user.empresa_id!,
    }
    setShowConfirm(true)
  }

  async function handleConfirm() {
    const params = pendingParamsRef.current
    if (!params) return
    setSubmitting(true)
    try {
      const result = await crearCompra(params)
      toast.success(`Factura ${result.nroFactura} registrada exitosamente`)
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
      setShowConfirm(false)
    } finally {
      setSubmitting(false)
    }
  }

  const monedaLabel = moneda === 'USD' ? '$' : 'Bs'

  const submitLabel = submitting
    ? 'Registrando...'
    : tipoDetectado === 'CREDITO' && pagos.length === 0
    ? 'Registrar a Credito'
    : tipoDetectado === 'CREDITO'
    ? `Registrar (${formatUsd(pendienteUsd)} a credito)`
    : 'Registrar Factura de Compra'

  const mostrarColumnasSistema = usaTasaParalela && tasaInternaNum > 0

  // True si hay al menos una línea con costo REALMENTE cambiado pero sin decisión de PVP.
  // Usa lineaTieneCostoCambiado (hoisted) para no dispararse cuando el usuario
  // tipea el mismo valor que el costo actual.
  const hayLineasSinDecisionPvp = lineas.some(
    (l) => lineaTieneCostoCambiado(l) && l.pvp_decision === null
  )

  /** True si el nuevo_costo_raw de una línea difiere del costo vigente en sistema. */
  function lineaTieneCostoCambiado(l: LineaUI): boolean {
    if (l.nuevo_costo_raw === '') return false
    const costoNuevoUsd = moneda === 'USD'
      ? (l.factor > 0 ? l.costo_input / l.factor : l.costo_input)
      : (tasaFacturaNum > 0 ? l.costo_input / tasaFacturaNum / (l.factor > 0 ? l.factor : 1) : 0)
    const costoUsdActual = parseFloat(l.costo_usd_actual) || 0
    return Math.abs(costoNuevoUsd - costoUsdActual) > 0.0001
  }

  /** True si el nuevo costo USD supera el pvp actual (obliga recalculo). */
  function lineaCostoSuperaPvp(l: LineaUI): boolean {
    if (l.nuevo_costo_raw === '') return false
    const costoNuevoUsd = moneda === 'USD'
      ? (l.factor > 0 ? l.costo_input / l.factor : l.costo_input)
      : (tasaFacturaNum > 0 ? l.costo_input / tasaFacturaNum / (l.factor > 0 ? l.factor : 1) : 0)
    return costoNuevoUsd > (parseFloat(l.precio_venta_usd) || 0) + 0.001
  }

  return (
    <div className="rounded-2xl bg-card shadow-lg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="rounded-xl p-2 text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Nueva Factura de Compra</h2>
          <p className="text-sm text-muted-foreground">Registrar factura de compra a proveedor</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section: Datos de la Factura */}
        <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Datos de la Factura</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Fecha Factura */}
            <div>
              <label htmlFor="fecha-factura" className="block text-xs font-medium text-muted-foreground mb-1">
                Fecha Factura
              </label>
              <input
                id="fecha-factura"
                type="date"
                value={fechaFactura}
                onChange={(e) => setFechaFactura(e.target.value)}
                className={`w-full rounded-xl border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                  errors.fecha_factura ? 'border-destructive' : 'border-input'
                }`}
              />
              {errors.fecha_factura && <p className="text-destructive text-xs mt-1">{errors.fecha_factura}</p>}
              {fechaEsFutura && !errors.fecha_factura && (
                <p className="text-amber-600 text-xs mt-1">
                  ⚠ La fecha es posterior a hoy. Verifique que sea correcta.
                </p>
              )}
            </div>

            {/* Nro Factura */}
            <div>
              <label htmlFor="nro-factura" className="block text-xs font-medium text-muted-foreground mb-1">
                Nro. Factura
              </label>
              <input
                id="nro-factura"
                type="text"
                value={nroFactura}
                onChange={(e) => setNroFactura(e.target.value.toUpperCase())}
                onKeyDown={handleSafeTextKeyDown}
                onPaste={handleSafeTextPaste}
                placeholder="Ej: 00012345"
                maxLength={50}
                autoComplete="off"
                className={`w-full rounded-xl border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                  errors.nro_factura ? 'border-destructive' : 'border-input'
                }`}
              />
              {errors.nro_factura
                ? <p className="text-destructive text-xs mt-1">{errors.nro_factura}</p>
                : <p className="text-muted-foreground/60 text-[11px] mt-1">Solo letras, números y guiones. Máx. 50 caracteres.</p>
              }
            </div>

            {/* Nro Control */}
            <div>
              <label htmlFor="nro-control" className="block text-xs font-medium text-muted-foreground mb-1">
                Nro. Control (opcional)
              </label>
              <input
                id="nro-control"
                type="text"
                value={nroControl}
                onChange={(e) => setNroControl(e.target.value.toUpperCase())}
                onKeyDown={handleSafeTextKeyDown}
                onPaste={handleSafeTextPaste}
                placeholder="Ej: 00-0012345"
                maxLength={20}
                autoComplete="off"
                className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-muted-foreground/60 text-[11px] mt-1">Solo dígitos, letras y guiones. Ej: 00-0012345. Máx. 20 caracteres.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Proveedor */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="compra-proveedor" className="block text-xs font-medium text-muted-foreground">
                  Proveedor
                </label>
                <button
                  type="button"
                  onClick={() => setShowCrearProveedor(true)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                  title="Crear nuevo proveedor"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Nuevo
                </button>
              </div>
              <select
                id="compra-proveedor"
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                disabled={loadingProveedores}
                className={`w-full rounded-xl border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                  errors.proveedor_id ? 'border-destructive' : 'border-input'
                }`}
              >
                <option value="">
                  {loadingProveedores ? 'Cargando...' : 'Seleccionar proveedor'}
                </option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.rif} - {p.razon_social}
                  </option>
                ))}
              </select>
              {errors.proveedor_id && <p className="text-destructive text-xs mt-1">{errors.proveedor_id}</p>}
            </div>

            {/* Tasa Interna */}
            <div>
              <label htmlFor="compra-tasa-interna" className="block text-xs font-medium text-muted-foreground mb-1">
                Tasa Interna (Bs/USD)
              </label>
              <input
                id="compra-tasa-interna"
                type="number"
                step="0.0001"
                min="0.0001"
                max={NUMERIC_LIMITS.tasa.max}
                value={tasaInterna}
                onChange={(e) => setTasaInterna(clampNumeric(e.target.value, NUMERIC_LIMITS.tasa.max, NUMERIC_LIMITS.tasa.decimals))}
                onKeyDown={handleNumericKeyDown}
                placeholder="0.0000"
                className={`w-full rounded-xl border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                  errors.tasa_interna ? 'border-destructive' : 'border-input'
                }`}
              />
              {errors.tasa_interna && <p className="text-destructive text-xs mt-1">{errors.tasa_interna}</p>}
              {tasaInternaFound
                ? <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Tasa encontrada para esta fecha</p>
                : <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">No hay tasa para esta fecha — ingrese manualmente</p>
              }
            </div>
          </div>

          {/* Moneda switch */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Moneda del documento fisico
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Solo afecta la visualizacion. El asiento contable siempre se genera en Bolivares.
            </p>
            <div className="inline-flex rounded-xl border border-input overflow-hidden">
              <button
                type="button"
                onClick={() => handleMonedaSwitch('USD')}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
                  moneda === 'USD'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                <Money className="h-4 w-4" />
                USD
              </button>
              <button
                type="button"
                onClick={() => handleMonedaSwitch('BS')}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
                  moneda === 'BS'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                <Money className="h-4 w-4" />
                Bs
              </button>
            </div>
          </div>

          {/* Tasa Paralela */}
          <div>
            <div className="flex items-center gap-2">
              <input
                id="tasa-paralela-check"
                type="checkbox"
                checked={usaTasaParalela}
                onChange={(e) => setUsaTasaParalela(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
              />
              <label htmlFor="tasa-paralela-check" className="text-sm text-foreground cursor-pointer select-none">
                Proveedor usa tasa paralela (distinta a la tasa interna BCV)
              </label>
            </div>
            {usaTasaParalela && (
              <div className="mt-3 p-3 rounded-lg bg-amber-50/80 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
                    Tasa Proveedor (Paralela) (Bs/USD)
                  </label>
                  <input
                    id="tasa-proveedor"
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    max={NUMERIC_LIMITS.tasa.max}
                    value={tasaProveedor}
                    onChange={(e) => setTasaProveedor(clampNumeric(e.target.value, NUMERIC_LIMITS.tasa.max, NUMERIC_LIMITS.tasa.decimals))}
                    onKeyDown={handleNumericKeyDown}
                    placeholder="0.0000"
                    className={`w-full rounded-xl border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      errors.tasa_proveedor ? 'border-destructive' : 'border-amber-200 dark:border-amber-700'
                    }`}
                  />
                  {errors.tasa_proveedor && <p className="text-destructive text-xs mt-1">{errors.tasa_proveedor}</p>}
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {moneda === 'BS'
                    ? `Ingrese los costos en Bs al precio del proveedor. El sistema los convierte a USD usando la Tasa Interna para contabilidad. Ejemplo: producto a Bs 700 (tasa proveedor 700) con tasa interna 500 → costo sistema = 700 ÷ 500 = `
                    : `Ingrese los costos en USD segun la factura. El sistema ajusta el costo de inventario multiplicando por el diferencial de tasas. Ejemplo: producto a $1.00 (tasa proveedor 700) con tasa interna 500 → costo sistema = $1.00 × 700 ÷ 500 = `
                  }
                  <strong>
                    {moneda === 'BS' ? '1.40 USD' : '$1.40'}
                  </strong>.
                </p>
                <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                  <p className="font-medium mb-1">Costo contabilidad (usando tasa interna arriba):</p>
                  {moneda === 'BS'
                    ? <p>Bs ÷ {tasaInternaNum > 0 ? tasaInternaNum.toFixed(2) : '?'} = USD</p>
                    : <p>USD × {tasaProveedorNum > 0 ? tasaProveedorNum.toFixed(2) : '?'} ÷ {tasaInternaNum > 0 ? tasaInternaNum.toFixed(2) : '?'} = USD</p>
                  }
                  {tasaProveedorNum > 0 && tasaInternaNum > 0 && (
                    <p className="mt-1 text-amber-700 dark:text-amber-400 font-medium">
                      Factor: ×{(tasaProveedorNum / tasaInternaNum).toFixed(4)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section: Productos */}
        <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Productos</h3>

          {/* Product search + create button */}
          <div className="flex gap-2">
            <div className="relative flex-1">
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
                  placeholder={loadingProductos ? 'Cargando productos...' : 'Buscar producto por nombre o codigo...'}
                  disabled={loadingProductos}
                  autoComplete="off"
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {dropdownOpen && busqueda && productosFiltrados.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
                  {productosFiltrados.slice(0, 10).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => handleAddProducto(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                      >
                        <Plus className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        <span className="font-mono text-muted-foreground">{p.codigo}</span>
                        <span className="text-muted-foreground/50">|</span>
                        <span className="text-foreground">{p.nombre}</span>
                        <span className="text-muted-foreground text-xs ml-auto">
                          Costo: {formatUsd(p.costo_usd)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {dropdownOpen && busqueda && productosFiltrados.length === 0 && !loadingProductos && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-background shadow-lg p-3 text-sm text-muted-foreground">
                  No se encontraron productos
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowCrearProducto(true)}
              title="Crear nuevo producto"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-input bg-background text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Nuevo producto</span>
            </button>
          </div>

          {/* Line items table */}
          {lineas.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full divide-y divide-border text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {/* ── LADO FACTURA ── */}
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground uppercase">Codigo</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground uppercase">Producto</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground uppercase w-24">Unidad</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground uppercase w-20">Cantidad</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground uppercase w-24">
                      Costo actual ({monedaLabel})
                    </th>
                    <th className="px-2 py-2 text-right font-medium text-amber-600 uppercase w-28">
                      Nuevo costo ({monedaLabel})
                    </th>
                    {mostrarColumnasSistema && (
                      <th className="px-2 py-2 text-right font-medium text-slate-400 uppercase w-28">
                        Costo contab. ($)
                      </th>
                    )}
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground uppercase w-20">
                      IVA compra
                    </th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground uppercase w-24">
                      Subtotal ({monedaLabel})
                    </th>
                    {/* ── SEPARADOR ── */}
                    <th className="px-1 py-2 w-px bg-border/40"></th>
                    {/* ── LADO PRECIOS DEL SISTEMA ── */}
                    <th className="px-2 py-2 text-right font-medium text-blue-600 uppercase w-20">Margen%</th>
                    <th className="px-2 py-2 text-right font-medium text-blue-600 uppercase w-24">PVP ({monedaLabel})</th>
                    <th className="px-2 py-2 text-right font-medium text-blue-600 uppercase w-24">PVP + IVA ({monedaLabel})</th>
                    {/* ── ESTADO / DECISIÓN ── */}
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground uppercase w-32">Estado</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="bg-background divide-y divide-border">
                  {lineas.map((linea, index) => {
                    const subtotal = getLineSubtotal(linea)
                    const costoSistema = getCostoSistema(linea)
                    const costoCambio = lineaTieneCostoCambiado(linea)
                    const costoForzado = lineaCostoSuperaPvp(linea)

                    // PVP efectivo en USD (vigente o el que el usuario editó)
                    const pvpEfectivoUsd = linea.pvp_decision === 'actualizar' && linea.nuevo_pvp_input !== ''
                      ? (moneda === 'USD'
                          ? parseFloat(linea.nuevo_pvp_input) || 0
                          : (tasaFacturaNum > 0 ? (parseFloat(linea.nuevo_pvp_input) || 0) / tasaFacturaNum : 0))
                      : parseFloat(linea.precio_venta_usd) || 0
                    const pvpMasIva = linea.tipo_impuesto === 'Gravable'
                      ? pvpEfectivoUsd * (1 + linea.impuesto_pct / 100)
                      : pvpEfectivoUsd

                    // Margen efectivo
                    const margenEfectivo = linea.pvp_decision === 'actualizar' && linea.nuevo_margen_input !== ''
                      ? linea.nuevo_margen_input
                      : linea.margen_actual

                    // Colores según si hay cambio
                    const nuevoCostoBg = costoCambio
                      ? 'bg-amber-50 dark:bg-amber-950/20'
                      : ''

                    const totalCols = mostrarColumnasSistema ? 16 : 15

                    return (
                      <React.Fragment key={linea.producto_id}>
                        <tr className={nuevoCostoBg}>
                          {/* Codigo */}
                          <td className="px-2 py-2 font-mono text-muted-foreground">{linea.codigo}</td>

                          {/* Producto */}
                          <td className="px-2 py-2 text-foreground max-w-[180px]">
                            <span className="truncate block">{linea.nombre}</span>
                          </td>

                          {/* Unidad */}
                          <td className="px-2 py-2">
                            <select
                              value={linea.unidad_seleccionada_id ?? '__base__'}
                              onChange={(e) => handleUnidadChange(index, e.target.value)}
                              className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              {linea.unidadOptions.map((opt) => (
                                <option key={opt.id ?? '__base__'} value={opt.id ?? '__base__'}>
                                  {opt.abreviatura}{opt.factor > 1 && ` ×${opt.factor}`}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Cantidad */}
                          <td className="px-2 py-2">
                            <input
                              type="number" step="0.001" min="0.001" max={NUMERIC_LIMITS.cantidad.max}
                              value={linea.cantidad_input || ''}
                              onChange={(e) => handleLineaChange(index, 'cantidad_input', e.target.value)}
                              onKeyDown={handleNumericKeyDown}
                              onPaste={handleNumericPaste}
                              className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </td>

                          {/* Costo Actual (read-only) */}
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                            {moneda === 'USD' ? formatUsd(linea.costo_actual) : formatBs(linea.costo_actual)}
                          </td>

                          {/* Nuevo Costo (editable, blank = sin cambio) */}
                          <td className="px-2 py-2">
                            <input
                              type="text" inputMode="decimal"
                              value={linea.nuevo_costo_raw}
                              onChange={(e) => handleNuevoCostoChange(index, e.target.value)}
                              onKeyDown={handleNumericKeyDown}
                              onPaste={handleNumericPaste}
                              placeholder=""
                              className={`w-full rounded border px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring ${
                                costoCambio
                                  ? costoForzado
                                    ? 'border-red-400 bg-red-50 dark:bg-red-950/20'
                                    : 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                                  : 'border-input bg-background'
                              }`}
                            />
                          </td>

                          {/* Costo Contab. (tasa paralela) */}
                          {mostrarColumnasSistema && (
                            <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                              {costoSistema !== null ? formatUsd(costoSistema) : '—'}
                            </td>
                          )}

                          {/* IVA de Compra */}
                          <td className="px-2 py-2 text-center">
                            {linea.tipo_impuesto === 'Exento' ? (
                              <span className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">Exento</span>
                            ) : linea.tipo_impuesto === 'Exonerado' ? (
                              <span className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">Exonerado</span>
                            ) : (
                              <span className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">{linea.impuesto_pct}%</span>
                            )}
                          </td>

                          {/* Subtotal */}
                          <td className="px-2 py-2 text-right tabular-nums font-medium text-foreground">
                            {moneda === 'USD' ? formatUsd(subtotal) : formatBs(subtotal)}
                          </td>

                          {/* Separador visual */}
                          <td className="px-0 bg-border/30 w-px"></td>

                          {/* Margen% — read-only o editable */}
                          <td className="px-2 py-2 text-right">
                            {linea.pvp_decision === 'actualizar' || linea.pvp_decision === 'mantener' ? (
                              <input
                                type="number" step="0.1" min="-99" max={NUMERIC_LIMITS.margen.max}
                                value={linea.nuevo_margen_input}
                                onChange={(e) => handleNuevoMargenChange(index, e.target.value)}
                                onKeyDown={handleNumericKeyDown}
                                onPaste={handleNumericPaste}
                                className="w-16 rounded border border-blue-400 bg-blue-50 dark:bg-blue-950/20 px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            ) : (
                              <span className="tabular-nums text-muted-foreground">{margenEfectivo}%</span>
                            )}
                          </td>

                          {/* PVP — read-only o editable */}
                          <td className="px-2 py-2 text-right">
                            {linea.pvp_decision === 'actualizar' || linea.pvp_decision === 'mantener' ? (
                              <input
                                type="number" step="0.01" min="0.01" max={NUMERIC_LIMITS.pvp.max}
                                value={linea.nuevo_pvp_input}
                                onChange={(e) => handleNuevoPvpChange(index, e.target.value)}
                                onKeyDown={handleNumericKeyDown}
                                onPaste={handleNumericPaste}
                                className="w-20 rounded border border-blue-400 bg-blue-50 dark:bg-blue-950/20 px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            ) : (
                              <span className="tabular-nums text-muted-foreground">
                                {moneda === 'USD' ? formatUsd(pvpEfectivoUsd) : formatBs(pvpEfectivoUsd * tasaFacturaNum)}
                              </span>
                            )}
                          </td>

                          {/* PVP + IVA */}
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                            {moneda === 'USD' ? formatUsd(pvpMasIva) : formatBs(pvpMasIva * tasaFacturaNum)}
                          </td>

                          {/* Estado / Decisión */}
                          <td className="px-2 py-2 text-center">
                            {!costoCambio ? (
                              <span className="text-[9px] text-muted-foreground/50">—</span>
                            ) : costoForzado && linea.pvp_decision !== 'actualizar' ? (
                              <span className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                                ⚠ PVP &lt; costo
                              </span>
                            ) : linea.pvp_decision === null ? (
                              <div className="flex flex-col gap-1 items-center">
                                <button type="button" onClick={() => handlePvpDecision(index, 'mantener')}
                                  className="w-full rounded px-1.5 py-0.5 text-[9px] font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
                                  Mantener PVP
                                </button>
                                <button type="button" onClick={() => handlePvpDecision(index, 'actualizar')}
                                  className="w-full rounded px-1.5 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 hover:bg-amber-200 transition-colors">
                                  Actualizar PVP
                                </button>
                              </div>
                            ) : linea.pvp_decision === 'mantener' ? (
                              <div className="flex flex-col gap-1 items-center">
                                <button type="button" onClick={() => handlePvpDecision(index, 'actualizar')}
                                  className="w-full rounded px-1.5 py-0.5 text-[9px] font-medium bg-slate-100 text-slate-500 hover:bg-amber-100 hover:text-amber-700 transition-colors">
                                  ✓ Manteniendo
                                </button>
                                <button type="button" title="Revertir a valores originales"
                                  onClick={() => handleResetLinea(index)}
                                  className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors">
                                  <ArrowCounterClockwise className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1 items-center">
                                <button type="button" onClick={() => handlePvpDecision(index, 'mantener')}
                                  className="w-full rounded px-1.5 py-0.5 text-[9px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 hover:bg-slate-100 hover:text-slate-500 transition-colors">
                                  ✎ Editando PVP
                                </button>
                                <button type="button" title="Revertir a valores originales"
                                  onClick={() => handleResetLinea(index)}
                                  className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors">
                                  <ArrowCounterClockwise className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Delete */}
                          <td className="px-2 py-2 text-center">
                            <button type="button" onClick={() => handleRemoveLinea(index)}
                              className="text-muted-foreground hover:text-destructive transition-colors">
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>

                        {/* Fila de lote (si aplica) */}
                        {linea.maneja_lotes === 1 && (
                          <tr key={`lote-${linea.producto_id}`} className="bg-amber-50/50">
                            <td colSpan={totalCols} className="px-3 py-2">
                              <div className="flex flex-wrap items-center gap-3 text-xs">
                                <span className="text-amber-700 font-medium shrink-0">Lote:</span>
                                <div className="flex items-center gap-1.5">
                                  <label className="text-muted-foreground shrink-0">Nro.</label>
                                  <input type="text" value={linea.lote_nro}
                                    onChange={(e) => handleLoteChange(index, 'lote_nro', e.target.value.toUpperCase())}
                                    onKeyDown={handleSafeTextKeyDown}
                                    onPaste={handleSafeTextPaste}
                                    placeholder="Ej: LOT-001" autoComplete="off"
                                    maxLength={30}
                                    className="w-28 rounded border border-amber-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <label className="text-muted-foreground shrink-0">Fab.</label>
                                  <input type="date" value={linea.lote_fecha_fab}
                                    onChange={(e) => handleLoteChange(index, 'lote_fecha_fab', e.target.value)}
                                    className="rounded border border-amber-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <label className="text-muted-foreground shrink-0">Venc.</label>
                                  <input type="date" value={linea.lote_fecha_venc}
                                    onChange={(e) => handleLoteChange(index, 'lote_fecha_venc', e.target.value)}
                                    className="rounded border border-amber-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                                </div>
                                <span className="text-amber-600/70 italic">Opcional</span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {errors.lineas && <p className="text-destructive text-xs">{errors.lineas}</p>}
        </div>

        {/* Section: Pagos */}
        <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Pagos</h3>
            {tipoDetectado === 'CONTADO' && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 ring-1 ring-green-600/20">
                CONTADO
              </span>
            )}
            {tipoDetectado === 'CREDITO' && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-50 text-orange-700 ring-1 ring-orange-600/20">
                CREDITO
              </span>
            )}
          </div>

          {/* Payment input row */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_auto] gap-2 items-end">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Metodo</label>
              <select
                value={pagoMetodoId}
                onChange={(e) => setPagoMetodoId(e.target.value)}
                disabled={loadingMetodos}
                className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">{loadingMetodos ? 'Cargando...' : 'Seleccionar...'}</option>
                {metodos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} ({m.moneda})
                  </option>
                ))}
              </select>
            </div>

            <div className="hidden sm:block">
              <div className="h-8" />
              {metodoSeleccionado && (
                <span className="inline-flex items-center px-2 py-2 text-xs font-medium text-muted-foreground">
                  {metodoSeleccionado.moneda}
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">Monto</label>
                {pendienteUsd > 0 && metodoSeleccionado && (
                  <button
                    type="button"
                    onClick={handlePagoMax}
                    className="text-xs text-primary hover:underline"
                  >
                    Max
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={NUMERIC_LIMITS.monto.max}
                value={pagoMonto}
                onChange={(e) => setPagoMonto(clampNumeric(e.target.value, NUMERIC_LIMITS.monto.max, NUMERIC_LIMITS.monto.decimals))}
                onKeyDown={handleNumericKeyDown}
                placeholder="0.00"
                className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Referencia</label>
              <input
                type="text"
                value={pagoReferencia}
                onChange={(e) => setPagoReferencia(e.target.value.toUpperCase())}
                onKeyDown={handleSafeTextKeyDown}
                onPaste={handleSafeTextPaste}
                placeholder="Opcional"
                maxLength={100}
                autoComplete="off"
                className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-muted-foreground/60 text-[11px] mt-1">Solo letras, números y guiones. Máx. 100 caracteres.</p>
            </div>

            <div>
              <div className="h-5 mb-1" />
              <button
                type="button"
                onClick={handleAddPago}
                disabled={!pagoMetodoId || !pagoMonto || parseFloat(pagoMonto) <= 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Agregar
              </button>
            </div>
          </div>

          {/* Pagos list */}
          {pagos.length > 0 && (
            <ul className="space-y-2">
              {pagos.map((pago, index) => {
                const mUsdProveedor = pago.moneda === 'BS'
                  ? (tasaFacturaNum > 0 ? pago.monto / tasaFacturaNum : 0)
                  : pago.monto
                const mUsdInterno = pago.moneda === 'BS' && usaTasaParalela && tasaInternaNum > 0
                  ? pago.monto / tasaInternaNum
                  : null
                return (
                  <li key={index} className="flex items-start justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-foreground">{pago.metodo_nombre}</span>
                        <span className="text-muted-foreground">
                          {pago.moneda === 'USD' ? formatUsd(pago.monto) : formatBs(pago.monto)}
                        </span>
                        {pago.referencia && (
                          <span className="text-muted-foreground text-xs font-mono">{pago.referencia}</span>
                        )}
                      </div>
                      {pago.moneda === 'BS' && tasaFacturaNum > 0 && (
                        <div className="text-xs text-muted-foreground ml-0.5">
                          <span>= {formatUsd(mUsdProveedor)} (tasa prov. {tasaFacturaNum.toFixed(2)})</span>
                          {mUsdInterno !== null && (
                            <span className="ml-3 text-slate-400">
                              {formatUsd(mUsdInterno)} (tasa int. {tasaInternaNum.toFixed(2)})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePago(index)}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-2 mt-0.5"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {pagos.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Sin pagos registrados. La factura se procesara completamente a credito.
            </p>
          )}
        </div>

        {/* Section: Totales */}
        {lineas.length > 0 && (
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            {usaTasaParalela ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      Costo contabilidad (tasa int.) <span className="text-amber-600 font-medium">→ Inventario</span>
                    </span>
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatUsd(totalUsdSistema)}</p>
                    <p className="text-xs text-muted-foreground">a tasa {tasaInternaNum > 0 ? tasaInternaNum.toFixed(2) : '?'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Total factura</span>
                    <p className="text-xl font-bold text-foreground">{formatUsd(totalUsd)}</p>
                    <p className="text-sm font-medium text-muted-foreground">{formatBs(totalBs)}</p>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Deuda CxP (tasa proveedor {tasaFacturaNum > 0 ? tasaFacturaNum.toFixed(2) : '?'}):</span>
                    <span className="font-medium">{formatUsd(totalUsd)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Total USD</span>
                  <p className="text-xl font-bold text-foreground">{formatUsd(totalUsd)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Total Bs</span>
                  <p className="text-xl font-bold text-foreground">{formatBs(totalBs)}</p>
                </div>
              </div>
            )}

            {/* Desglose fiscal por alicuota de IVA */}
            {totalIvaUsd > 0.001 && (
              <div className="mt-3 pt-3 border-t border-border space-y-1 text-xs text-muted-foreground">
                {exentoUsd > 0.001 && (
                  <div className="flex justify-between">
                    <span>Base exenta:</span>
                    <div className="text-right tabular-nums">
                      <div>{formatUsd(exentoUsd)}</div>
                      <div className="text-muted-foreground/60">{formatBs(exentoUsd * tasaFacturaNum)}</div>
                    </div>
                  </div>
                )}
                {gravableGroups.map((g) => (
                  <React.Fragment key={g.pct}>
                    <div className="flex justify-between">
                      <span>Base imponible ({g.pct}%):</span>
                      <div className="text-right tabular-nums">
                        <div>{formatUsd(g.base)}</div>
                        <div className="text-muted-foreground/60">{formatBs(g.base * tasaFacturaNum)}</div>
                      </div>
                    </div>
                    <div className="flex justify-between font-medium text-amber-700 dark:text-amber-400">
                      <span>IVA {g.pct}%:</span>
                      <div className="text-right tabular-nums">
                        <div>+ {formatUsd(g.iva)}</div>
                        <div className="font-normal text-amber-600/70">+ {formatBs(g.iva * tasaFacturaNum)}</div>
                      </div>
                    </div>
                  </React.Fragment>
                ))}
                {gravableGroups.length > 1 && (
                  <div className="flex justify-between font-semibold text-amber-700 dark:text-amber-400 border-t border-border pt-1 mt-1">
                    <span>Total IVA:</span>
                    <div className="text-right tabular-nums">
                      <div>+ {formatUsd(totalIvaUsd)}</div>
                      <div className="font-normal text-amber-600/70">+ {formatBs(totalIvaUsd * tasaFacturaNum)}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-border space-y-1">
              {pagos.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Abonado:</span>
                  <div className="text-right tabular-nums">
                    <div className="font-medium text-green-600">{formatUsd(totalAbonadoUsd)}</div>
                    <div className="text-xs text-green-600/70">{formatBs(totalAbonadoBs)}</div>
                  </div>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {tipoDetectado === 'CREDITO' ? 'Queda a credito (USD):' : 'Pendiente (USD):'}
                </span>
                <span className={`font-bold ${tipoDetectado === 'CREDITO' ? 'text-orange-600' : 'text-green-600'}`}>
                  {formatUsd(pendienteUsd)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {tipoDetectado === 'CREDITO' ? 'Queda a credito (Bs):' : 'Pendiente (Bs):'}
                </span>
                <span className={`font-bold ${tipoDetectado === 'CREDITO' ? 'text-orange-600' : 'text-green-600'}`}>
                  {formatBs(pendienteBs)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pb-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-medium text-muted-foreground bg-muted rounded-xl hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || lineas.length === 0 || hayLineasSinDecisionPvp}
            className="px-5 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </form>

      {/* Dialog: Confirmar registro */}
      <Dialog open={showConfirm} onOpenChange={(v) => { if (!v && !submitting) setShowConfirm(false) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              Confirmar Factura de Compra
            </DialogTitle>
          </DialogHeader>

          {/* Resumen header */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
            <div className="font-semibold text-base">
              {proveedores.find((p) => p.id === proveedorId)?.razon_social ?? '—'}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Nro. Factura</span>
              <span className="font-mono font-medium">{nroFactura}</span>
              {nroControl && <>
                <span className="text-muted-foreground">Nro. Control</span>
                <span className="font-mono">{nroControl}</span>
              </>}
              <span className="text-muted-foreground">Fecha</span>
              <span>{fechaFactura}</span>
              <span className="text-muted-foreground">Moneda</span>
              <span>{moneda}</span>
              <span className="text-muted-foreground">Tasa interna</span>
              <span>{tasaInternaNum.toFixed(4)}</span>
              {usaTasaParalela && tasaProveedorNum > 0 && <>
                <span className="text-muted-foreground">Tasa proveedor</span>
                <span>{tasaProveedorNum.toFixed(4)}</span>
              </>}
              <span className="text-muted-foreground">Tipo</span>
              <span className={tipoDetectado === 'CONTADO' ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>
                {tipoDetectado}
              </span>
            </div>
          </div>

          {/* Productos */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Productos ({lineas.length})
            </h4>
            <div className="overflow-auto rounded-xl border border-border max-h-48">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Producto</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cant.</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Costo ({monedaLabel})</th>
                    {mostrarColumnasSistema && (
                      <th className="text-right px-3 py-2 font-medium text-slate-400">Costo Contab. ($)</th>
                    )}
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Subtotal ({monedaLabel})</th>
                    <th className="text-right px-3 py-2 font-medium text-blue-600">PVP resultante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lineas.map((l) => {
                    const cs = getCostoSistema(l)
                    const st = getLineSubtotal(l)
                    const sts = getSubtotalSistema(l)
                    const costoCambio = lineaTieneCostoCambiado(l)
                    const pvpResultante = l.pvp_decision === 'actualizar' && l.nuevo_pvp_input !== ''
                      ? (moneda === 'USD'
                          ? parseFloat(l.nuevo_pvp_input)
                          : (tasaFacturaNum > 0 ? parseFloat(l.nuevo_pvp_input) / tasaFacturaNum : 0))
                      : parseFloat(l.precio_venta_usd) || 0
                    return (
                      <tr key={l.producto_id} className={costoCambio ? 'bg-amber-50/40' : ''}>
                        <td className="px-3 py-1.5">
                          <span className="font-mono text-muted-foreground text-[10px]">{l.codigo}</span>
                          {' '}{l.nombre}
                          {costoCambio && (
                            <span className={`ml-1 text-[9px] font-bold ${
                              l.pvp_decision === 'actualizar' ? 'text-blue-600' : l.pvp_decision === 'mantener' ? 'text-slate-500' : 'text-amber-600'
                            }`}>
                              {l.pvp_decision === 'actualizar' ? '↺ PVP actualizado' : l.pvp_decision === 'mantener' ? '✓ PVP sin cambio' : '⚠ sin decidir'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {l.cantidad_input} {l.unidadOptions.find((o) => (o.id ?? '__base__') === (l.unidad_seleccionada_id ?? '__base__'))?.abreviatura}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {l.nuevo_costo_raw !== '' ? (
                            <div>
                              <div className="text-muted-foreground line-through text-[10px]">
                                {moneda === 'USD' ? formatUsd(l.costo_actual) : formatBs(l.costo_actual)}
                              </div>
                              <div className="font-medium">{moneda === 'USD' ? formatUsd(l.costo_input) : formatBs(l.costo_input)}</div>
                            </div>
                          ) : (
                            moneda === 'USD' ? formatUsd(l.costo_input) : formatBs(l.costo_input)
                          )}
                        </td>
                        {mostrarColumnasSistema && (
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">
                            {cs !== null ? formatUsd(cs) : '—'}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {moneda === 'USD' ? formatUsd(st) : formatBs(st)}
                          {sts !== null && (
                            <div className="text-[10px] text-slate-400">{formatUsd(sts)}</div>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-blue-700 dark:text-blue-400">
                          {formatUsd(pvpResultante)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagos */}
          {pagos.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Pagos registrados
              </h4>
              <ul className="space-y-1">
                {pagos.map((p, i) => (
                  <li key={i} className="flex justify-between text-sm rounded bg-muted/50 px-3 py-1.5">
                    <span>{p.metodo_nombre}</span>
                    <span className="font-medium">
                      {p.moneda === 'USD' ? formatUsd(p.monto) : formatBs(p.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Totales */}
          <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total USD (factura):</span>
              <span className="font-semibold">{formatUsd(totalUsd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Bs:</span>
              <span className="font-semibold">{formatBs(totalBs)}</span>
            </div>
            {usaTasaParalela && (
              <div className="flex justify-between text-amber-700 dark:text-amber-400">
                <span>Costo contabilidad (tasa interna):</span>
                <span className="font-semibold">{formatUsd(totalUsdSistema)}</span>
              </div>
            )}
            {pagos.length > 0 && (
              <div className="flex justify-between text-green-600 border-t border-border pt-1">
                <span>Abonado:</span>
                <span className="font-medium">{formatUsd(totalAbonadoUsd)}</span>
              </div>
            )}
            <div className={`flex justify-between font-bold ${tipoDetectado === 'CREDITO' ? 'text-orange-600' : 'text-green-600'}`}>
              <span>{tipoDetectado === 'CREDITO' ? 'Queda a credito:' : 'Pagado completamente'}</span>
              {tipoDetectado === 'CREDITO' && <span>{formatUsd(pendienteUsd)}</span>}
            </div>
          </div>

          {/* Resumen de cambios de costo/pvp */}
          {lineas.some(lineaTieneCostoCambiado) && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
              <p className="font-semibold text-sm">⚠ Cambios de costo en esta compra</p>
              <ul className="space-y-0.5">
                {lineas.filter(lineaTieneCostoCambiado).map((l) => {
                  const pvpResultante = l.pvp_decision === 'actualizar' && l.nuevo_pvp_input !== ''
                    ? (moneda === 'USD'
                        ? parseFloat(l.nuevo_pvp_input)
                        : (tasaFacturaNum > 0 ? parseFloat(l.nuevo_pvp_input) / tasaFacturaNum : 0))
                    : parseFloat(l.precio_venta_usd) || 0
                  return (
                    <li key={l.producto_id} className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px]">{l.codigo}</span>
                      <span className="font-medium">{l.nombre}</span>
                      <span className="text-muted-foreground">
                        costo: {moneda === 'USD' ? formatUsd(l.costo_actual) : formatBs(l.costo_actual)} →{' '}
                        <span className="font-medium">{moneda === 'USD' ? formatUsd(l.costo_input) : formatBs(l.costo_input)}</span>
                      </span>
                      <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                        l.pvp_decision === 'actualizar'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                          : l.pvp_decision === 'mantener'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {l.pvp_decision === 'actualizar'
                          ? `PVP → ${formatUsd(pvpResultante)}`
                          : l.pvp_decision === 'mantener'
                          ? 'PVP sin cambio'
                          : 'PVP sin decidir (se mantendrá)'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-xl hover:bg-muted/80 transition-colors disabled:opacity-50"
            >
              Cancelar — Seguir editando
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              {submitting ? 'Registrando...' : 'Confirmar y Registrar'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Crear Producto */}
      <Dialog open={showCrearProducto} onOpenChange={(v) => { if (!v) setShowCrearProducto(false) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Producto</DialogTitle>
          </DialogHeader>
          <ProductoForm isOpen={showCrearProducto} onClose={() => setShowCrearProducto(false)} />
        </DialogContent>
      </Dialog>

      {/* Dialog: Crear Proveedor (usa su propio dialog interno) */}
      <ProveedorForm
        isOpen={showCrearProveedor}
        onClose={() => setShowCrearProveedor(false)}
      />
    </div>
  )
}
