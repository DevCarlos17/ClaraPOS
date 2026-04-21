import React, { useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Search, Banknote, PackagePlus, UserPlus, X } from 'lucide-react'
import { compraHeaderSchema, lineaCompraSchema } from '@/features/inventario/schemas/compra-schema'
import { crearCompra, type PagoCompraParam } from '@/features/inventario/hooks/use-compras'
import { useProveedoresActivos } from '@/features/proveedores/hooks/use-proveedores'
import { useProductosTipo, type Producto } from '@/features/inventario/hooks/use-productos'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useConversiones } from '@/features/inventario/hooks/use-unidades-conversion'
import { useUnidadesActivas } from '@/features/inventario/hooks/use-unidades'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { formatUsd, formatBs } from '@/lib/currency'
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
  costo_input: number
  maneja_lotes: number
  lote_nro: string
  lote_fecha_fab: string
  lote_fecha_venc: string
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

export function CompraForm({ onClose }: CompraFormProps) {
  const { proveedores, isLoading: loadingProveedores } = useProveedoresActivos()
  const { productos, isLoading: loadingProductos } = useProductosTipo('P')
  const { tasaValor } = useTasaActual()
  const { user } = useCurrentUser()
  const { conversiones } = useConversiones()
  const { unidades } = useUnidadesActivas()
  const { metodos, isLoading: loadingMetodos } = useMetodosPagoActivos()

  // Header fields
  const [fechaFactura, setFechaFactura] = useState(new Date().toISOString().slice(0, 10))
  const [nroFactura, setNroFactura] = useState('')
  const [nroControl, setNroControl] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [moneda, setMoneda] = useState<'USD' | 'BS'>('USD')
  const [tasa, setTasa] = useState(tasaValor > 0 ? tasaValor.toFixed(4) : '')

  // Lines
  const [lineas, setLineas] = useState<LineaUI[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

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

  const tasaNum = parseFloat(tasa) || 0

  // Validacion de fecha: advertencia si es futura
  const hoy = new Date().toISOString().slice(0, 10)
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

  const totalDisplay = lineas.reduce((sum, l) => sum + getLineSubtotal(l), 0)
  const totalUsd = moneda === 'USD' ? totalDisplay : tasaNum > 0 ? totalDisplay / tasaNum : 0
  const totalBs = moneda === 'BS' ? totalDisplay : totalDisplay * tasaNum

  // Payment calculations
  const totalAbonadoUsd = pagos.reduce((sum, p) => {
    const mUsd = p.moneda === 'BS' ? (tasaNum > 0 ? p.monto / tasaNum : 0) : p.monto
    return sum + mUsd
  }, 0)
  const pendienteUsd = Math.max(0, Number((totalUsd - totalAbonadoUsd).toFixed(2)))
  const tipoDetectado: 'CONTADO' | 'CREDITO' = pendienteUsd <= 0.01 ? 'CONTADO' : 'CREDITO'

  const metodoSeleccionado = metodos.find((m) => m.id === pagoMetodoId)

  function handleAddProducto(producto: Producto) {
    const options = getUnidadOptions(producto)
    const costoBase = parseFloat(producto.costo_usd) || 0
    const costoDisplay = moneda === 'USD' ? costoBase : costoBase * tasaNum

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
        costo_input: Number(costoDisplay.toFixed(2)),
        maneja_lotes: Number(producto.maneja_lotes) || 0,
        lote_nro: '',
        lote_fecha_fab: '',
        lote_fecha_venc: '',
      },
    ])
    setBusqueda('')
    setDropdownOpen(false)
  }

  function handleRemoveLinea(index: number) {
    setLineas((prev) => prev.filter((_, i) => i !== index))
  }

  function handleLineaChange(index: number, field: keyof LineaUI, value: string) {
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        if (field === 'cantidad_input' || field === 'costo_input') {
          const num = parseFloat(value)
          return { ...l, [field]: isNaN(num) || num < 0 ? 0 : num }
        }
        return l
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

        const oldCostoPerBase = l.factor > 0 ? l.costo_input / l.factor : l.costo_input
        const newCostoDisplay = oldCostoPerBase * option.factor

        return {
          ...l,
          unidad_seleccionada_id: option.id,
          factor: option.factor,
          costo_input: Number(newCostoDisplay.toFixed(2)),
        }
      })
    )
  }

  function handleMonedaSwitch(newMoneda: 'USD' | 'BS') {
    if (newMoneda === moneda || tasaNum <= 0) return

    setLineas((prev) =>
      prev.map((l) => {
        const newCosto =
          newMoneda === 'BS'
            ? Number((l.costo_input * tasaNum).toFixed(2))
            : Number((l.costo_input / tasaNum).toFixed(2))
        return { ...l, costo_input: newCosto }
      })
    )
    setMoneda(newMoneda)
  }

  function handleAddPago() {
    const montoNum = parseFloat(pagoMonto)
    if (!pagoMetodoId || isNaN(montoNum) || montoNum <= 0 || !metodoSeleccionado) return
    setPagos((prev) => [
      ...prev,
      {
        metodo_cobro_id: pagoMetodoId,
        metodo_nombre: metodoSeleccionado.nombre,
        moneda: metodoSeleccionado.moneda as 'USD' | 'BS',
        monto: montoNum,
        banco_empresa_id: metodoSeleccionado.banco_empresa_id,
        referencia: pagoReferencia.trim() || undefined,
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
      setPagoMonto((pendienteUsd * tasaNum).toFixed(2))
    } else {
      setPagoMonto(pendienteUsd.toFixed(2))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    // Validate header
    const headerParsed = compraHeaderSchema.safeParse({
      proveedor_id: proveedorId,
      tasa: tasaNum,
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

    // Convert lines to USD base units for storage
    const lineasConvertidas = lineas.map((l, i) => {
      const cantidadBase = l.cantidad_input * l.factor
      let costoUnitarioUsd: number
      if (moneda === 'USD') {
        costoUnitarioUsd = l.factor > 0 ? l.costo_input / l.factor : l.costo_input
      } else {
        const costoUsdPerUnit = tasaNum > 0 ? l.costo_input / tasaNum : 0
        costoUnitarioUsd = l.factor > 0 ? costoUsdPerUnit / l.factor : costoUsdPerUnit
      }

      const parsed = lineaCompraSchema.safeParse({
        producto_id: l.producto_id,
        cantidad: cantidadBase,
        costo_unitario_usd: Number(costoUnitarioUsd.toFixed(4)),
      })

      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? 'Error en linea'
        setErrors({ lineas: `Linea ${i + 1} (${l.nombre}): ${msg}` })
        return null
      }

      return {
        producto_id: l.producto_id,
        cantidad: cantidadBase,
        costo_unitario_usd: Number(costoUnitarioUsd.toFixed(4)),
        lote_nro: l.lote_nro.trim() || undefined,
        lote_fecha_fab: l.lote_fecha_fab || undefined,
        lote_fecha_venc: l.lote_fecha_venc || undefined,
      }
    })

    if (productosFiltrados && lineasConvertidas.some((l) => l === null)) return
    const lineasValidas = lineasConvertidas.filter((l): l is NonNullable<typeof l> => l !== null)

    // Build pagos param
    const pagosParam: PagoCompraParam[] = pagos.map((p) => ({
      metodo_cobro_id: p.metodo_cobro_id,
      moneda: p.moneda,
      monto: p.monto,
      banco_empresa_id: p.banco_empresa_id,
      referencia: p.referencia,
    }))

    setSubmitting(true)
    try {
      const result = await crearCompra({
        proveedor_id: headerParsed.data.proveedor_id,
        tasa: headerParsed.data.tasa,
        fecha_factura: headerParsed.data.fecha_factura,
        nro_factura: headerParsed.data.nro_factura,
        nro_control: headerParsed.data.nro_control,
        moneda: headerParsed.data.moneda,
        lineas: lineasValidas,
        pagos: pagosParam,
        usuario_id: user.id,
        empresa_id: user.empresa_id!,
      })
      toast.success(`Factura ${result.nroFactura} registrada exitosamente`)
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted transition-colors"
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
        <div className="rounded-lg border bg-card p-4 space-y-4">
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
                className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
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
                placeholder="Ej: 00012345"
                className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                  errors.nro_factura ? 'border-destructive' : 'border-input'
                }`}
              />
              {errors.nro_factura && <p className="text-destructive text-xs mt-1">{errors.nro_factura}</p>}
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
                placeholder="Ej: 00-0012345"
                className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
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
                className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
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

            {/* Tasa */}
            <div>
              <label htmlFor="compra-tasa" className="block text-xs font-medium text-muted-foreground mb-1">
                Tasa (Bs/USD)
              </label>
              <input
                id="compra-tasa"
                type="number"
                step="0.0001"
                min="0.0001"
                value={tasa}
                onChange={(e) => setTasa(e.target.value)}
                placeholder="0.0000"
                className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                  errors.tasa ? 'border-destructive' : 'border-input'
                }`}
              />
              {errors.tasa && <p className="text-destructive text-xs mt-1">{errors.tasa}</p>}
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
            <div className="inline-flex rounded-lg border border-input overflow-hidden">
              <button
                type="button"
                onClick={() => handleMonedaSwitch('USD')}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
                  moneda === 'USD'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                <Banknote className="h-4 w-4" />
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
                <Banknote className="h-4 w-4" />
                Bs
              </button>
            </div>
          </div>
        </div>

        {/* Section: Productos */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Productos</h3>

          {/* Product search + create button */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                  className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-input bg-background text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <PackagePlus className="h-4 w-4" />
              <span className="hidden sm:inline">Nuevo producto</span>
            </button>
          </div>

          {/* Line items table */}
          {lineas.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Codigo</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Producto</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase w-32">Unidad</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase w-24">Cantidad</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase w-32">
                      Costo ({monedaLabel})
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">
                      Subtotal ({monedaLabel})
                    </th>
                    <th className="px-3 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody className="bg-background divide-y divide-border">
                  {lineas.map((linea, index) => {
                    const subtotal = getLineSubtotal(linea)
                    return (
                      <React.Fragment key={linea.producto_id}>
                      <tr>
                        <td className="px-3 py-2 text-sm font-mono text-muted-foreground">{linea.codigo}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{linea.nombre}</td>
                        <td className="px-3 py-2">
                          {linea.unidadOptions.length > 1 ? (
                            <select
                              value={linea.unidad_seleccionada_id ?? '__base__'}
                              onChange={(e) => handleUnidadChange(index, e.target.value)}
                              className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              {linea.unidadOptions.map((opt) => (
                                <option key={opt.id ?? '__base__'} value={opt.id ?? '__base__'}>
                                  {opt.abreviatura}
                                  {opt.factor > 1 && ` (x${opt.factor})`}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {linea.unidadOptions[0]?.abreviatura ?? 'UND'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={linea.cantidad_input || ''}
                            onChange={(e) => handleLineaChange(index, 'cantidad_input', e.target.value)}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={linea.costo_input || ''}
                            onChange={(e) => handleLineaChange(index, 'costo_input', e.target.value)}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm text-right font-medium text-foreground">
                          {moneda === 'USD' ? formatUsd(subtotal) : formatBs(subtotal)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLinea(index)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      {linea.maneja_lotes === 1 && (
                        <tr key={`lote-${linea.producto_id}`} className="bg-amber-50/50 border-b border-amber-100">
                          <td colSpan={7} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <span className="text-amber-700 font-medium shrink-0">Lote:</span>
                              <div className="flex items-center gap-1.5">
                                <label className="text-muted-foreground shrink-0">Nro.</label>
                                <input
                                  type="text"
                                  value={linea.lote_nro}
                                  onChange={(e) => handleLoteChange(index, 'lote_nro', e.target.value.toUpperCase())}
                                  placeholder="Ej: LOT-001"
                                  autoComplete="off"
                                  className="w-28 rounded border border-amber-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <label className="text-muted-foreground shrink-0">Fab.</label>
                                <input
                                  type="date"
                                  value={linea.lote_fecha_fab}
                                  onChange={(e) => handleLoteChange(index, 'lote_fecha_fab', e.target.value)}
                                  className="rounded border border-amber-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <label className="text-muted-foreground shrink-0">Venc.</label>
                                <input
                                  type="date"
                                  value={linea.lote_fecha_venc}
                                  onChange={(e) => handleLoteChange(index, 'lote_fecha_venc', e.target.value)}
                                  className="rounded border border-amber-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                              </div>
                              <span className="text-amber-600/70 text-xs italic">Opcional - dejar vacio si no aplica</span>
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
        <div className="rounded-lg border bg-card p-4 space-y-4">
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
                className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
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
                value={pagoMonto}
                onChange={(e) => setPagoMonto(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Referencia</label>
              <input
                type="text"
                value={pagoReferencia}
                onChange={(e) => setPagoReferencia(e.target.value.toUpperCase())}
                placeholder="Opcional"
                className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <div className="h-5 mb-1" />
              <button
                type="button"
                onClick={handleAddPago}
                disabled={!pagoMetodoId || !pagoMonto || parseFloat(pagoMonto) <= 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Agregar
              </button>
            </div>
          </div>

          {/* Pagos list */}
          {pagos.length > 0 && (
            <ul className="space-y-2">
              {pagos.map((pago, index) => (
                <li key={index} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-foreground">{pago.metodo_nombre}</span>
                    <span className="text-muted-foreground">
                      {pago.moneda === 'USD' ? formatUsd(pago.monto) : formatBs(pago.monto)}
                    </span>
                    {pago.referencia && (
                      <span className="text-muted-foreground text-xs font-mono">{pago.referencia}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemovePago(index)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
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
          <div className="rounded-lg border bg-card p-4">
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
            {pagos.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Abonado:</span>
                  <span className="font-medium text-green-600">{formatUsd(totalAbonadoUsd)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {tipoDetectado === 'CREDITO' ? 'Queda a credito:' : 'Pendiente:'}
                  </span>
                  <span className={`font-bold ${tipoDetectado === 'CREDITO' ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatUsd(pendienteUsd)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pb-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-medium text-muted-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || lineas.length === 0}
            className="px-5 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </form>

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
