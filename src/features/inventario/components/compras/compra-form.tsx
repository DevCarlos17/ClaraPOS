import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Search, CreditCard, Banknote } from 'lucide-react'
import { compraHeaderSchema, lineaCompraSchema } from '@/features/inventario/schemas/compra-schema'
import { crearCompra } from '@/features/inventario/hooks/use-compras'
import { useProveedoresActivos } from '@/features/proveedores/hooks/use-proveedores'
import { useProductosTipo, type Producto } from '@/features/inventario/hooks/use-productos'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useConversiones } from '@/features/inventario/hooks/use-unidades-conversion'
import { useUnidadesActivas } from '@/features/inventario/hooks/use-unidades'
import { formatUsd, formatBs } from '@/lib/currency'

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

  // Header fields
  const [fechaFactura, setFechaFactura] = useState(new Date().toISOString().slice(0, 10))
  const [nroFactura, setNroFactura] = useState('')
  const [nroControl, setNroControl] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [moneda, setMoneda] = useState<'USD' | 'BS'>('USD')
  const [tasa, setTasa] = useState(tasaValor > 0 ? tasaValor.toFixed(4) : '')
  const [tipo, setTipo] = useState<'CONTADO' | 'CREDITO'>('CONTADO')

  // Lines
  const [lineas, setLineas] = useState<LineaUI[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Product search
  const [busqueda, setBusqueda] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const tasaNum = parseFloat(tasa) || 0

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

  function handleUnidadChange(index: number, unidadId: string) {
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        const option = l.unidadOptions.find((o) =>
          unidadId === '__base__' ? o.id === null : o.id === unidadId
        )
        if (!option) return l

        // Recalculate cost per new unit
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
      tipo,
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
      }
    })

    if (productosFiltrados && lineasConvertidas.some((l) => l === null)) return
    const lineasValidas = lineasConvertidas.filter((l): l is NonNullable<typeof l> => l !== null)

    setSubmitting(true)
    try {
      const result = await crearCompra({
        proveedor_id: headerParsed.data.proveedor_id,
        tasa: headerParsed.data.tasa,
        fecha_factura: headerParsed.data.fecha_factura,
        nro_factura: headerParsed.data.nro_factura,
        nro_control: headerParsed.data.nro_control,
        moneda: headerParsed.data.moneda,
        tipo: headerParsed.data.tipo,
        lineas: lineasValidas,
        usuario_id: user.id,
        empresa_id: user.empresa_id!,
      })
      toast.success(`Compra ${result.nroFactura} registrada exitosamente`)
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const monedaLabel = moneda === 'USD' ? '$' : 'Bs'

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
          <h2 className="text-lg font-semibold text-foreground">Nueva Compra</h2>
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
              <label htmlFor="compra-proveedor" className="block text-xs font-medium text-muted-foreground mb-1">
                Proveedor
              </label>
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
            <label className="block text-xs font-medium text-muted-foreground mb-2">
              Moneda de entrada
            </label>
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

          {/* Product search */}
          <div className="relative">
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
                      <tr key={linea.producto_id}>
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
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {errors.lineas && <p className="text-destructive text-xs">{errors.lineas}</p>}
        </div>

        {/* Section: Tipo de Compra */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Tipo de Compra</h3>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="tipo-compra"
                value="CONTADO"
                checked={tipo === 'CONTADO'}
                onChange={() => setTipo('CONTADO')}
                className="h-4 w-4 text-primary focus:ring-ring"
              />
              <div className="flex items-center gap-1.5">
                <Banknote className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Contado</span>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="tipo-compra"
                value="CREDITO"
                checked={tipo === 'CREDITO'}
                onChange={() => setTipo('CREDITO')}
                className="h-4 w-4 text-primary focus:ring-ring"
              />
              <div className="flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium">Credito</span>
              </div>
            </label>
          </div>
          {tipo === 'CREDITO' && (
            <p className="text-xs text-muted-foreground">
              La factura quedara con saldo pendiente por el total.
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
            {tipo === 'CREDITO' && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Saldo pendiente:</span>
                  <span className="font-bold text-orange-600">{formatUsd(totalUsd)}</span>
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
            {submitting ? 'Registrando...' : 'Registrar Compra'}
          </button>
        </div>
      </form>
    </div>
  )
}
