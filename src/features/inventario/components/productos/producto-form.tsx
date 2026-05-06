import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { productoSchema } from '@/features/inventario/schemas/producto-schema'
import {
  crearProducto,
  actualizarProducto,
  type Producto,
} from '@/features/inventario/hooks/use-productos'
import { useDepartamentosActivos } from '@/features/inventario/hooks/use-departamentos'
import { useUnidadesActivas } from '@/features/inventario/hooks/use-unidades'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useImpuestosActivos } from '@/features/configuracion/hooks/use-impuestos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { db } from '@/core/db/powersync/db'
import { formatUsd, formatBs, usdToBs, bsToUsd } from '@/lib/currency'
import { localNow } from '@/lib/dates'
import { useCatalogoGlobal } from '@/features/inventario/hooks/use-catalogo-global'
import { useDebounce } from '@/hooks/use-debounce'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'

interface ProductoFormProps {
  isOpen: boolean
  onClose: () => void
  producto?: Producto
}

export function ProductoForm({ isOpen, onClose, producto }: ProductoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = !!producto

  const { departamentos } = useDepartamentosActivos()
  const { unidades } = useUnidadesActivas()
  const { depositos } = useDepositosActivos()
  const { tasaValor } = useTasaActual()
  const { user } = useCurrentUser()
  const { impuestos: todosImpuestos } = useImpuestosActivos()
  const impuestosIva = todosImpuestos.filter((i) => i.tipo_tributo === 'IVA')

  const [codigo, setCodigo] = useState('')
  const [tipo, setTipo] = useState<'P' | 'S' | 'C'>('P')
  const [nombre, setNombre] = useState('')
  const [presentacion, setPresentacion] = useState('')
  const [departamentoId, setDepartamentoId] = useState('')
  const [costoUsd, setCostoUsd] = useState('')
  const [precioVentaUsd, setPrecioVentaUsd] = useState('')
  const [precioMayorUsd, setPrecioMayorUsd] = useState('')
  const [stockMinimo, setStockMinimo] = useState('')
  const [tipoImpuesto, setTipoImpuesto] = useState<'Gravable' | 'Exento' | 'Exonerado'>('Exento')
  const [impuestoIvaId, setImpuestoIvaId] = useState<string>('')
  const [isActive, setIsActive] = useState(true)
  const [ubicacion, setUbicacion] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [unidadBaseId, setUnidadBaseId] = useState('')
  const [manejaLotes, setManejaLotes] = useState(false)
  const [depositoId, setDepositoId] = useState('')
  const [stockInicial, setStockInicial] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)

  // Bs inputs (bidireccionales) y margen
  const [costoBs, setCostoBs] = useState('')
  const [precioVentaBs, setPrecioVentaBs] = useState('')
  const [precioMayorBs, setPrecioMayorBs] = useState('')
  const [margen, setMargen] = useState('')
  const [margenTipo, setMargenTipo] = useState<'pct' | 'abs'>('pct')

  const debouncedNombre = useDebounce(nombre, 300)
  const { sugerencias } = useCatalogoGlobal(isEditing ? '' : debouncedNombre)

  useEffect(() => {
    if (isOpen) {
      if (producto) {
        setCodigo(producto.codigo)
        setTipo(producto.tipo as 'P' | 'S' | 'C')
        setNombre(producto.nombre)
        setPresentacion(producto.presentacion ?? '')
        setDepartamentoId(producto.departamento_id)
        setCostoUsd(producto.costo_usd)
        setPrecioVentaUsd(producto.precio_venta_usd)
        setPrecioMayorUsd(producto.precio_mayor_usd ?? '')
        setStockMinimo(producto.stock_minimo)
        setTipoImpuesto((producto.tipo_impuesto as 'Gravable' | 'Exento' | 'Exonerado') ?? 'Exento')
        setImpuestoIvaId(producto.impuesto_iva_id ?? '')
        setIsActive(producto.is_active === 1)
        setUbicacion(producto.ubicacion ?? '')
        setCodigoBarras(producto.codigo_barras ?? '')
        setUnidadBaseId(producto.unidad_base_id ?? '')
        setManejaLotes(producto.maneja_lotes === 1)
        setDepositoId('')
        setStockInicial('')
        // Inicializar campos Bs y margen
        if (tasaValor > 0) {
          const costoN = parseFloat(producto.costo_usd) || 0
          const ventaN = parseFloat(producto.precio_venta_usd) || 0
          const mayorN = parseFloat(producto.precio_mayor_usd ?? '') || 0
          setCostoBs(costoN > 0 ? usdToBs(costoN, tasaValor).toFixed(2) : '')
          setPrecioVentaBs(ventaN > 0 ? usdToBs(ventaN, tasaValor).toFixed(2) : '')
          setPrecioMayorBs(mayorN > 0 ? usdToBs(mayorN, tasaValor).toFixed(2) : '')
          if (costoN > 0 && ventaN > 0) {
            setMargen(((ventaN - costoN) / costoN * 100).toFixed(1))
          } else {
            setMargen('')
          }
        } else {
          setCostoBs('')
          setPrecioVentaBs('')
          setPrecioMayorBs('')
          setMargen('')
        }
      } else {
        setCodigo('')
        setTipo('P')
        setNombre('')
        setPresentacion('')
        setDepartamentoId('')
        setCostoUsd('')
        setPrecioVentaUsd('')
        setPrecioMayorUsd('')
        setStockMinimo('')
        setTipoImpuesto('Exento')
        setImpuestoIvaId('')
        setIsActive(true)
        setUbicacion('')
        setCodigoBarras('')
        setUnidadBaseId('')
        setManejaLotes(false)
        setDepositoId('')
        setStockInicial('')
        setCostoBs('')
        setPrecioVentaBs('')
        setPrecioMayorBs('')
        setMargen('')
      }
      setErrors({})
      setPopoverOpen(false)
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, producto])

  function handleCodigoChange(value: string) {
    setCodigo(value.toUpperCase())
  }

  function handleNombreChange(value: string) {
    setNombre(value.toUpperCase())
    setPopoverOpen(true)
  }

  function handlePresentacionChange(value: string) {
    setPresentacion(value.toUpperCase())
  }

  function handleUbicacionChange(value: string) {
    setUbicacion(value.toUpperCase())
  }

  function handleTipoImpuestoChange(valor: 'Gravable' | 'Exento' | 'Exonerado') {
    setTipoImpuesto(valor)
    if (valor !== 'Gravable') setImpuestoIvaId('')
  }

  function handleTipoChange(nuevoTipo: 'P' | 'S' | 'C') {
    setTipo(nuevoTipo)
    if (nuevoTipo === 'S' || nuevoTipo === 'C') {
      setUbicacion('')
      setPresentacion('')
      setStockMinimo('0')
      setUnidadBaseId('')
      setManejaLotes(false)
      setDepositoId('')
      setStockInicial('')
    }
    if (nuevoTipo === 'C') {
      setCostoUsd('0')
    }
  }

  // Sync Bs values when tasa changes while form is open
  useEffect(() => {
    if (!isOpen || tasaValor <= 0) return
    const costoN = parseFloat(costoUsd) || 0
    const ventaN = parseFloat(precioVentaUsd) || 0
    const mayorN = parseFloat(precioMayorUsd) || 0
    if (costoN > 0) setCostoBs(usdToBs(costoN, tasaValor).toFixed(2))
    if (ventaN > 0) setPrecioVentaBs(usdToBs(ventaN, tasaValor).toFixed(2))
    if (mayorN > 0) setPrecioMayorBs(usdToBs(mayorN, tasaValor).toFixed(2))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasaValor])

  // --- Handlers bidireccionales de precios ---

  function handleCostoUsdChange(val: string) {
    setCostoUsd(val)
    const num = parseFloat(val)
    if (!isNaN(num) && tasaValor > 0) {
      setCostoBs(usdToBs(num, tasaValor).toFixed(2))
    }
    const ventaN = parseFloat(precioVentaUsd) || 0
    const costoN = isNaN(parseFloat(val)) ? 0 : parseFloat(val)
    if (costoN > 0) {
      const m = margenTipo === 'pct' ? ((ventaN - costoN) / costoN * 100) : (ventaN - costoN)
      setMargen(m.toFixed(2))
    }
  }

  function handleCostoBsChange(val: string) {
    setCostoBs(val)
    const num = parseFloat(val)
    if (!isNaN(num) && tasaValor > 0) {
      const usd = bsToUsd(num, tasaValor)
      setCostoUsd(usd.toFixed(2))
      const ventaN = parseFloat(precioVentaUsd) || 0
      if (usd > 0) {
        const m = margenTipo === 'pct' ? ((ventaN - usd) / usd * 100) : (ventaN - usd)
        setMargen(m.toFixed(2))
      }
    }
  }

  function handlePrecioVentaUsdChange(val: string) {
    setPrecioVentaUsd(val)
    const num = parseFloat(val)
    if (!isNaN(num) && tasaValor > 0) {
      setPrecioVentaBs(usdToBs(num, tasaValor).toFixed(2))
    }
    const costoN = esComboLocal ? 0 : (parseFloat(costoUsd) || 0)
    const ventaN = isNaN(parseFloat(val)) ? 0 : parseFloat(val)
    if (costoN > 0) {
      const m = margenTipo === 'pct' ? ((ventaN - costoN) / costoN * 100) : (ventaN - costoN)
      setMargen(m.toFixed(2))
    }
  }

  function handlePrecioVentaBsChange(val: string) {
    setPrecioVentaBs(val)
    const num = parseFloat(val)
    if (!isNaN(num) && tasaValor > 0) {
      const usd = bsToUsd(num, tasaValor)
      setPrecioVentaUsd(usd.toFixed(2))
      const costoN = esComboLocal ? 0 : (parseFloat(costoUsd) || 0)
      if (costoN > 0) {
        const m = margenTipo === 'pct' ? ((usd - costoN) / costoN * 100) : (usd - costoN)
        setMargen(m.toFixed(2))
      }
    }
  }

  function handleMargenChange(val: string) {
    setMargen(val)
    const margenN = parseFloat(val)
    const costoN = esComboLocal ? 0 : (parseFloat(costoUsd) || 0)
    if (!isNaN(margenN) && costoN > 0) {
      const pvp = Math.max(0, margenTipo === 'pct' ? costoN * (1 + margenN / 100) : costoN + margenN)
      setPrecioVentaUsd(pvp.toFixed(2))
      if (tasaValor > 0) setPrecioVentaBs(usdToBs(pvp, tasaValor).toFixed(2))
    }
  }

  function handleMargenTipoChange(tipo: 'pct' | 'abs') {
    setMargenTipo(tipo)
    const costoN = esComboLocal ? 0 : (parseFloat(costoUsd) || 0)
    const ventaN = parseFloat(precioVentaUsd) || 0
    if (costoN > 0) {
      const m = tipo === 'pct' ? ((ventaN - costoN) / costoN * 100) : (ventaN - costoN)
      setMargen(m.toFixed(2))
    }
  }

  function handlePrecioMayorUsdChange(val: string) {
    setPrecioMayorUsd(val)
    const num = parseFloat(val)
    if (!isNaN(num) && tasaValor > 0) {
      setPrecioMayorBs(usdToBs(num, tasaValor).toFixed(2))
    }
  }

  function handlePrecioMayorBsChange(val: string) {
    setPrecioMayorBs(val)
    const num = parseFloat(val)
    if (!isNaN(num) && tasaValor > 0) {
      setPrecioMayorUsd(bsToUsd(num, tasaValor).toFixed(2))
    }
  }

  function handleSugerenciaSelect(s: { nombre: string; presentacion: string | null; maneja_lotes: boolean; tipo_impuesto: string }) {
    setNombre(s.nombre)
    if (tipo === 'P') {
      if (s.presentacion) setPresentacion(s.presentacion)
      setManejaLotes(s.maneja_lotes)
      setTipoImpuesto(s.tipo_impuesto as 'Gravable' | 'Exento' | 'Exonerado')
    }
    setPopoverOpen(false)
  }

  function parseNumOrZero(val: string): number {
    const n = parseFloat(val)
    return isNaN(n) ? 0 : n
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const esCombo = tipo === 'C'
    const esServicioOCombo = tipo === 'S' || tipo === 'C'

    // Validar deposito para productos fisicos en modo creacion
    const newErrors: Record<string, string> = {}
    if (!isEditing && tipo === 'P' && !depositoId) {
      newErrors.deposito_id = 'Selecciona un deposito'
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    const data = {
      codigo,
      tipo,
      nombre,
      departamento_id: departamentoId,
      costo_usd: esCombo ? 0 : parseNumOrZero(costoUsd),
      precio_venta_usd: parseNumOrZero(precioVentaUsd),
      precio_mayor_usd: precioMayorUsd.trim() === '' ? null : parseNumOrZero(precioMayorUsd),
      stock_minimo: esServicioOCombo ? 0 : parseNumOrZero(stockMinimo),
      tipo_impuesto: tipoImpuesto,
      impuesto_iva_id: tipoImpuesto === 'Gravable' && impuestoIvaId ? impuestoIvaId : null,
      is_active: isActive,
      ubicacion: esServicioOCombo ? '' : ubicacion,
      presentacion: esServicioOCombo ? '' : presentacion,
      codigo_barras: codigoBarras.trim(),
    }

    const parsed = productoSchema.safeParse(data)

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setSubmitting(true)
    try {
      if (isEditing && producto) {
        await actualizarProducto(producto.id, {
          nombre: parsed.data.nombre,
          departamento_id: parsed.data.departamento_id,
          costo_usd: esCombo ? 0 : parsed.data.costo_usd,
          precio_venta_usd: parsed.data.precio_venta_usd,
          precio_mayor_usd: parsed.data.precio_mayor_usd ?? null,
          stock_minimo: parsed.data.stock_minimo,
          tipo_impuesto: parsed.data.tipo_impuesto,
          impuesto_iva_id: parsed.data.impuesto_iva_id ?? null,
          is_active: parsed.data.is_active,
          tipo: parsed.data.tipo,
          ubicacion: esServicioOCombo ? null : (parsed.data.ubicacion || null),
          unidad_base_id: esServicioOCombo ? null : (unidadBaseId || null),
          maneja_lotes: esServicioOCombo ? false : manejaLotes,
          presentacion: esServicioOCombo ? null : (parsed.data.presentacion || null),
          codigo_barras: parsed.data.codigo_barras?.trim() || null,
        })
        toast.success('Producto actualizado correctamente')
      } else {
        const productoId = await crearProducto({
          codigo: parsed.data.codigo,
          tipo: parsed.data.tipo,
          nombre: parsed.data.nombre,
          departamento_id: parsed.data.departamento_id,
          costo_usd: esCombo ? 0 : parsed.data.costo_usd,
          precio_venta_usd: parsed.data.precio_venta_usd,
          precio_mayor_usd: parsed.data.precio_mayor_usd ?? null,
          stock_minimo: parsed.data.stock_minimo,
          tipo_impuesto: parsed.data.tipo_impuesto,
          impuesto_iva_id: parsed.data.impuesto_iva_id ?? null,
          empresa_id: user!.empresa_id!,
          ubicacion: esServicioOCombo ? undefined : (parsed.data.ubicacion || undefined),
          unidad_base_id: esServicioOCombo ? undefined : (unidadBaseId || undefined),
          maneja_lotes: esServicioOCombo ? false : manejaLotes,
          presentacion: esServicioOCombo ? undefined : (parsed.data.presentacion || undefined),
          codigo_barras: parsed.data.codigo_barras?.trim() || undefined,
        })

        // Si es producto fisico con stock inicial, crear movimiento y actualizar stock
        const stockInicialNum = parseNumOrZero(stockInicial)
        if (tipo === 'P' && depositoId && stockInicialNum > 0) {
          const now = localNow()
          const fecha = now.split('T')[0] ?? now.substring(0, 10)
          await db.writeTransaction(async (tx) => {
            await tx.execute(
              `INSERT INTO movimientos_inventario
               (id, empresa_id, producto_id, deposito_id, tipo, origen, cantidad,
                stock_anterior, stock_nuevo, motivo, usuario_id, fecha, created_at)
               VALUES (?, ?, ?, ?, 'E', 'MAN', ?, '0.000', ?, 'Stock inicial', ?, ?, ?)`,
              [
                uuidv4(),
                user!.empresa_id!,
                productoId,
                depositoId,
                stockInicialNum.toFixed(3),
                stockInicialNum.toFixed(3),
                user!.id,
                fecha,
                now,
              ]
            )
            await tx.execute(
              'UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?',
              [stockInicialNum.toFixed(3), now, productoId]
            )
            await tx.execute(
              `INSERT INTO inventario_stock
               (id, empresa_id, producto_id, deposito_id, cantidad_actual, stock_reservado, updated_at, updated_by)
               VALUES (?, ?, ?, ?, ?, '0.000', ?, ?)`,
              [
                uuidv4(),
                user!.empresa_id!,
                productoId,
                depositoId,
                stockInicialNum.toFixed(3),
                now,
                user!.id,
              ]
            )
          })
        }

        toast.success('Producto creado correctamente')
      }
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const esServicioOComboLocal = tipo === 'S' || tipo === 'C'
  const esComboLocal = tipo === 'C'

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  const costoNum = esComboLocal ? 0 : parseNumOrZero(costoUsd)
  const ventaNum = parseNumOrZero(precioVentaUsd)
  const mayorNum = precioMayorUsd.trim() === '' ? null : parseNumOrZero(precioMayorUsd)

  const selectedImpuesto = impuestosIva.find((i) => i.id === impuestoIvaId)
  const alicuota = tipoImpuesto === 'Gravable' && selectedImpuesto
    ? parseFloat(selectedImpuesto.porcentaje)
    : 0
  const ivaMontoUsd = ventaNum * (alicuota / 100)
  const precioFinalUsd = ventaNum + ivaMontoUsd
  const mostrarResumenFiscal = ventaNum > 0 && tipoImpuesto !== 'Exento'

  const mostrarPopover = popoverOpen && sugerencias.length > 0 && !isEditing

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-lg shadow-xl"
    >
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">
          {isEditing ? 'Editar Producto' : 'Nuevo Producto'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Codigo */}
          <div>
            <label htmlFor="prod-codigo" className="block text-sm font-medium text-gray-700 mb-1">
              Codigo
            </label>
            <input
              id="prod-codigo"
              type="text"
              value={codigo}
              onChange={(e) => handleCodigoChange(e.target.value)}
              disabled={isEditing}
              placeholder="Ej: PROD-001"
              autoComplete="off"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isEditing ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
              } ${errors.codigo ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.codigo && <p className="text-red-500 text-xs mt-1">{errors.codigo}</p>}
            {isEditing && <p className="text-gray-400 text-xs mt-1">El codigo no puede modificarse</p>}
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tipo"
                  value="P"
                  checked={tipo === 'P'}
                  onChange={() => handleTipoChange('P')}
                  disabled={isEditing}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm">Producto</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tipo"
                  value="S"
                  checked={tipo === 'S'}
                  onChange={() => handleTipoChange('S')}
                  disabled={isEditing}
                  className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm">Servicio</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tipo"
                  value="C"
                  checked={tipo === 'C'}
                  onChange={() => handleTipoChange('C')}
                  disabled={isEditing}
                  className="h-4 w-4 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm">Combo / Receta</span>
              </label>
            </div>
            {errors.tipo && <p className="text-red-500 text-xs mt-1">{errors.tipo}</p>}
            {esComboLocal && (
              <p className="text-green-700 text-xs mt-1 bg-green-50 px-2 py-1 rounded">
                El costo se calcula automaticamente desde los ingredientes del combo
              </p>
            )}
          </div>

          {/* Nombre con autocomplete desde catalogo global */}
          <div>
            <label htmlFor="prod-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <Popover open={mostrarPopover} onOpenChange={(open) => { if (!open) setPopoverOpen(false) }}>
              <PopoverAnchor asChild>
                <input
                  id="prod-nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => handleNombreChange(e.target.value)}
                  onBlur={() => setTimeout(() => setPopoverOpen(false), 200)}
                  placeholder="Nombre del producto"
                  autoComplete="off"
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.nombre ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
              </PopoverAnchor>
              <PopoverContent
                onOpenAutoFocus={(e) => e.preventDefault()}
                align="start"
                sideOffset={4}
                className="p-0"
                style={{ width: 'var(--radix-popover-anchor-width, 300px)' }}
              >
                <Command shouldFilter={false}>
                  <CommandList>
                    <CommandGroup>
                      {sugerencias.map((s) => (
                        <CommandItem
                          key={s.id}
                          value={s.nombre}
                          onSelect={() => handleSugerenciaSelect(s)}
                          className="flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium truncate">{s.nombre}</span>
                            {s.presentacion && (
                              <span className="text-xs text-gray-400 truncate">{s.presentacion}</span>
                            )}
                          </div>
                          <span className="shrink-0 text-xs font-medium text-blue-600 tabular-nums">
                            {Math.round(s.similitud * 100)}%
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>}
          </div>

          {/* Presentacion - solo para tipo P */}
          {!esServicioOComboLocal && (
            <div>
              <label htmlFor="prod-presentacion" className="block text-sm font-medium text-gray-700 mb-1">
                Presentacion <span className="text-gray-400 font-normal">(Opcional)</span>
              </label>
              <input
                id="prod-presentacion"
                type="text"
                value={presentacion}
                onChange={(e) => handlePresentacionChange(e.target.value)}
                placeholder="Ej: FRASCO 500ML, CAJA x12 UND"
                autoComplete="off"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Codigo de barras */}
          <div>
            <label htmlFor="prod-codigo-barras" className="block text-sm font-medium text-gray-700 mb-1">
              Codigo de Barras <span className="text-gray-400 font-normal">(Opcional)</span>
            </label>
            <input
              id="prod-codigo-barras"
              type="text"
              value={codigoBarras}
              onChange={(e) => setCodigoBarras(e.target.value)}
              placeholder="Escanear o ingresar EAN-13, UPC, Code128..."
              autoComplete="off"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Puede escanear directamente con un lector de codigo de barras</p>
          </div>

          {/* Departamento */}
          <div>
            <label htmlFor="prod-depto" className="block text-sm font-medium text-gray-700 mb-1">
              Departamento
            </label>
            <select
              id="prod-depto"
              value={departamentoId}
              onChange={(e) => setDepartamentoId(e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                errors.departamento_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Seleccionar departamento</option>
              {departamentos.map((dep) => (
                <option key={dep.id} value={dep.id}>
                  {dep.nombre}
                </option>
              ))}
            </select>
            {errors.departamento_id && (
              <p className="text-red-500 text-xs mt-1">{errors.departamento_id}</p>
            )}
          </div>

          {/* Unidad Base - solo para tipo P */}
          {!esServicioOComboLocal && (
            <div>
              <label htmlFor="prod-unidad" className="block text-sm font-medium text-gray-700 mb-1">
                Unidad de Medida <span className="text-gray-400 font-normal">(Opcional)</span>
              </label>
              <select
                id="prod-unidad"
                value={unidadBaseId}
                onChange={(e) => setUnidadBaseId(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sin unidad</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} ({u.abreviatura})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Precios bidireccionales */}
          <div className="space-y-3">
            {/* Costo: USD | Bs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="prod-costo" className="block text-xs font-medium text-gray-600 mb-1">
                  Costo (USD)
                </label>
                <input
                  id="prod-costo"
                  type="number"
                  step="0.01"
                  min="0"
                  value={esComboLocal ? '0' : costoUsd}
                  onChange={(e) => handleCostoUsdChange(e.target.value)}
                  disabled={esComboLocal}
                  placeholder="0.00"
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    esComboLocal ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
                  } ${errors.costo_usd ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.costo_usd && <p className="text-red-500 text-xs mt-1">{errors.costo_usd}</p>}
                {esComboLocal && <p className="text-gray-400 text-xs mt-1">Se calcula desde ingredientes</p>}
              </div>
              <div>
                <label htmlFor="prod-costo-bs" className="block text-xs font-medium text-gray-600 mb-1">
                  Costo (Bs)
                </label>
                <input
                  id="prod-costo-bs"
                  type="number"
                  step="0.01"
                  min="0"
                  value={esComboLocal ? '0' : costoBs}
                  onChange={(e) => handleCostoBsChange(e.target.value)}
                  disabled={esComboLocal || tasaValor <= 0}
                  placeholder="0,00"
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    esComboLocal || tasaValor <= 0 ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
                  } border-gray-300`}
                />
              </div>
            </div>

            {/* Margen */}
            {!esComboLocal && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor="prod-margen" className="block text-xs font-medium text-gray-600 mb-1">
                    Margen de ganancia
                  </label>
                  <input
                    id="prod-margen"
                    type="number"
                    step="0.1"
                    value={margen}
                    onChange={(e) => handleMargenChange(e.target.value)}
                    placeholder={margenTipo === 'pct' ? 'Ej: 30' : 'Ej: 5.00'}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex rounded-md border border-gray-300 overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMargenTipoChange('pct')}
                    className={`px-3 py-2 text-xs font-medium transition-colors ${
                      margenTipo === 'pct' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >%</button>
                  <button
                    type="button"
                    onClick={() => handleMargenTipoChange('abs')}
                    className={`px-3 py-2 text-xs font-medium border-l border-gray-300 transition-colors ${
                      margenTipo === 'abs' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >$</button>
                </div>
              </div>
            )}

            {/* PVP: USD | Bs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="prod-venta" className="block text-xs font-medium text-gray-600 mb-1">
                  PVP (USD)
                </label>
                <input
                  id="prod-venta"
                  type="number"
                  step="0.01"
                  min="0"
                  value={precioVentaUsd}
                  onChange={(e) => handlePrecioVentaUsdChange(e.target.value)}
                  placeholder="0.00"
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                    errors.precio_venta_usd ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.precio_venta_usd && (
                  <p className="text-red-500 text-xs mt-1">{errors.precio_venta_usd}</p>
                )}
              </div>
              <div>
                <label htmlFor="prod-venta-bs" className="block text-xs font-medium text-gray-600 mb-1">
                  PVP (Bs)
                </label>
                <input
                  id="prod-venta-bs"
                  type="number"
                  step="0.01"
                  min="0"
                  value={precioVentaBs}
                  onChange={(e) => handlePrecioVentaBsChange(e.target.value)}
                  disabled={tasaValor <= 0}
                  placeholder="0,00"
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    tasaValor <= 0 ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
                  } border-gray-300`}
                />
              </div>
            </div>

            {/* Mayor: USD | Bs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="prod-mayor" className="block text-xs font-medium text-gray-600 mb-1">
                  Precio Mayor (USD) <span className="text-gray-400 font-normal">- Opcional</span>
                </label>
                <input
                  id="prod-mayor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={precioMayorUsd}
                  onChange={(e) => handlePrecioMayorUsdChange(e.target.value)}
                  placeholder="0.00"
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                    errors.precio_mayor_usd ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.precio_mayor_usd && (
                  <p className="text-red-500 text-xs mt-1">{errors.precio_mayor_usd}</p>
                )}
              </div>
              <div>
                <label htmlFor="prod-mayor-bs" className="block text-xs font-medium text-gray-600 mb-1">
                  Precio Mayor (Bs) <span className="text-gray-400 font-normal">- Opcional</span>
                </label>
                <input
                  id="prod-mayor-bs"
                  type="number"
                  step="0.01"
                  min="0"
                  value={precioMayorBs}
                  onChange={(e) => handlePrecioMayorBsChange(e.target.value)}
                  disabled={tasaValor <= 0}
                  placeholder="0,00"
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    tasaValor <= 0 ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
                  } border-gray-300`}
                />
              </div>
            </div>
          </div>

          {/* Stock Minimo */}
          <div>
            <label htmlFor="prod-stock-min" className="block text-sm font-medium text-gray-700 mb-1">
              Stock Minimo
            </label>
            <input
              id="prod-stock-min"
              type="number"
              step="0.001"
              min="0"
              value={esServicioOComboLocal ? '0' : stockMinimo}
              onChange={(e) => setStockMinimo(e.target.value)}
              disabled={esServicioOComboLocal}
              placeholder="0"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                esServicioOComboLocal ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
              } ${errors.stock_minimo ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.stock_minimo && <p className="text-red-500 text-xs mt-1">{errors.stock_minimo}</p>}
            {tipo === 'S' && (
              <p className="text-gray-400 text-xs mt-1">Servicios no manejan stock</p>
            )}
            {tipo === 'C' && (
              <p className="text-gray-400 text-xs mt-1">Combos no manejan stock propio</p>
            )}
          </div>

          {/* Maneja Lotes - solo para tipo P */}
          {!esServicioOComboLocal && (
            <div className="flex items-center gap-2">
              <input
                id="prod-maneja-lotes"
                type="checkbox"
                checked={manejaLotes}
                onChange={(e) => setManejaLotes(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="prod-maneja-lotes" className="text-sm font-medium text-gray-700">
                Maneja Lotes
              </label>
              <span className="text-xs text-gray-400">(Habilita control FEFO)</span>
            </div>
          )}

          {/* Deposito + Stock Inicial - solo en creacion para tipo P */}
          {!isEditing && !esServicioOComboLocal && (
            <div className="border border-gray-200 rounded-md p-3 space-y-3 bg-gray-50">
              <p className="text-xs font-medium text-gray-600">Inventario Inicial</p>

              <div>
                <label htmlFor="prod-deposito" className="block text-sm font-medium text-gray-700 mb-1">
                  Deposito <span className="text-red-500">*</span>
                </label>
                <select
                  id="prod-deposito"
                  value={depositoId}
                  onChange={(e) => setDepositoId(e.target.value)}
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                    errors.deposito_id ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">Seleccionar deposito</option>
                  {depositos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
                {errors.deposito_id && (
                  <p className="text-red-500 text-xs mt-1">{errors.deposito_id}</p>
                )}
              </div>

              <div>
                <label htmlFor="prod-stock-inicial" className="block text-sm font-medium text-gray-700 mb-1">
                  Stock Inicial <span className="text-gray-400 font-normal">(Opcional)</span>
                </label>
                <input
                  id="prod-stock-inicial"
                  type="number"
                  step="0.001"
                  min="0"
                  value={stockInicial}
                  onChange={(e) => setStockInicial(e.target.value)}
                  placeholder="0.000"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Los movimientos posteriores se gestionan via Compras o Ajustes
                </p>
              </div>
            </div>
          )}

          {/* Stock actual en modo edicion para tipo P */}
          {isEditing && producto && tipo === 'P' && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
              <span className="text-sm text-gray-500">Stock actual:</span>
              <span className="text-sm font-semibold text-gray-900">
                {parseFloat(producto.stock).toFixed(3)}
              </span>
              <span className="text-xs text-gray-400">(modificar via Compras o Ajustes)</span>
            </div>
          )}

          {/* Ubicacion */}
          <div>
            <label htmlFor="prod-ubicacion" className="block text-sm font-medium text-gray-700 mb-1">
              Ubicacion <span className="text-gray-400 font-normal">(Opcional)</span>
            </label>
            <input
              id="prod-ubicacion"
              type="text"
              value={esServicioOComboLocal ? '' : ubicacion}
              onChange={(e) => handleUbicacionChange(e.target.value)}
              disabled={esServicioOComboLocal}
              placeholder="Ej: ESTANTE A-3"
              autoComplete="off"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                esServicioOComboLocal ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
              } border-gray-300`}
            />
            {esServicioOComboLocal && (
              <p className="text-gray-400 text-xs mt-1">
                {tipo === 'S' ? 'Servicios' : 'Combos'} no tienen ubicacion fisica
              </p>
            )}
          </div>

          {/* Tipo Impuesto */}
          <div>
            <label htmlFor="prod-tipo-impuesto" className="block text-sm font-medium text-gray-700 mb-1">
              Tipo Impuesto
            </label>
            <select
              id="prod-tipo-impuesto"
              value={tipoImpuesto}
              onChange={(e) => handleTipoImpuestoChange(e.target.value as 'Gravable' | 'Exento' | 'Exonerado')}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Exento">Exento</option>
              <option value="Gravable">Gravable</option>
              <option value="Exonerado">Exonerado</option>
            </select>
            {errors.tipo_impuesto && (
              <p className="text-red-500 text-xs mt-1">{errors.tipo_impuesto}</p>
            )}
          </div>

          {/* Tasa IVA - solo cuando el producto es Gravable */}
          {tipoImpuesto === 'Gravable' && (
            <div>
              <label htmlFor="prod-impuesto-iva" className="block text-sm font-medium text-gray-700 mb-1">
                Tasa IVA
              </label>
              <select
                id="prod-impuesto-iva"
                value={impuestoIvaId}
                onChange={(e) => setImpuestoIvaId(e.target.value)}
                className={`w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.impuesto_iva_id ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Sin tasa especifica</option>
                {impuestosIva.map((imp) => (
                  <option key={imp.id} value={imp.id}>
                    {imp.nombre} ({parseFloat(imp.porcentaje).toFixed(2)}%)
                  </option>
                ))}
              </select>
              {impuestosIva.length === 0 && (
                <p className="text-amber-600 text-xs mt-1">
                  No hay tasas IVA configuradas. Agrega una en Configuracion &gt; Impuestos.
                </p>
              )}
              {errors.impuesto_iva_id && (
                <p className="text-red-500 text-xs mt-1">{errors.impuesto_iva_id}</p>
              )}
            </div>
          )}

          {/* Resumen Fiscal */}
          {mostrarResumenFiscal && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Resumen Fiscal</p>
              <div className="flex justify-between text-xs text-amber-700">
                <span>Base imponible</span>
                <span className="font-medium tabular-nums">
                  {formatUsd(ventaNum)}&nbsp;/&nbsp;{tasaValor > 0 ? formatBs(usdToBs(ventaNum, tasaValor)) : '—'}
                </span>
              </div>
              {alicuota > 0 && (
                <div className="flex justify-between text-xs text-amber-700">
                  <span>IVA ({alicuota.toFixed(2)}%)</span>
                  <span className="font-medium tabular-nums">
                    {formatUsd(ivaMontoUsd)}&nbsp;/&nbsp;{tasaValor > 0 ? formatBs(usdToBs(ivaMontoUsd, tasaValor)) : '—'}
                  </span>
                </div>
              )}
              <div className="border-t border-amber-200 pt-1.5 flex justify-between text-xs font-bold text-amber-900">
                <span>Precio Final</span>
                <span className="tabular-nums">
                  {formatUsd(precioFinalUsd)}&nbsp;/&nbsp;{tasaValor > 0 ? formatBs(usdToBs(precioFinalUsd, tasaValor)) : '—'}
                </span>
              </div>
            </div>
          )}

          {/* Activo */}
          {isEditing && (
            <div className="flex items-center gap-2">
              <input
                id="prod-activo"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="prod-activo" className="text-sm font-medium text-gray-700">
                Activo
              </label>
            </div>
          )}

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
