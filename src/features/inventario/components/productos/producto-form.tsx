import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@powersync/react'
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

type TabId = 'general' | 'precios' | 'inventario'

interface LoteRow {
  nro_lote: string
  fecha_vencimiento: string | null
  cantidad_actual: string
  status: string
}

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

  // === STICKY HEADER: identidad primaria ===
  const [codigo, setCodigo] = useState('')
  const [tipo, setTipo] = useState<'P' | 'S' | 'C'>('P')
  const [nombre, setNombre] = useState('')

  // === TAB STATE ===
  const [activeTab, setActiveTab] = useState<TabId>('general')

  // === TAB A: Informacion General ===
  const [departamentoId, setDepartamentoId] = useState('')
  const [unidadBaseId, setUnidadBaseId] = useState('')
  const [presentacion, setPresentacion] = useState('')
  const [stockMinimo, setStockMinimo] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [isActive, setIsActive] = useState(true)

  // === TAB B: Precios y Fiscalidad ===
  const [costoUsd, setCostoUsd] = useState('')
  const [costoBs, setCostoBs] = useState('')
  const [margen, setMargen] = useState('')
  const [margenTipo, setMargenTipo] = useState<'pct' | 'abs'>('pct')
  const [precioVentaUsd, setPrecioVentaUsd] = useState('')
  const [precioVentaBs, setPrecioVentaBs] = useState('')
  const [precioMayorUsd, setPrecioMayorUsd] = useState('')
  const [precioMayorBs, setPrecioMayorBs] = useState('')
  const [precioEspecialUsd, setPrecioEspecialUsd] = useState('')
  const [precioEspecialBs, setPrecioEspecialBs] = useState('')
  const [tipoImpuesto, setTipoImpuesto] = useState<'Gravable' | 'Exento' | 'Exonerado'>('Exento')
  const [impuestoIvaId, setImpuestoIvaId] = useState<string>('')

  // === TAB C: Ubicacion e Inventario ===
  const [ubicacion, setUbicacion] = useState('')
  const [manejaLotes, setManejaLotes] = useState(false)
  const [depositoId, setDepositoId] = useState('')
  const [stockInicial, setStockInicial] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)

  const debouncedNombre = useDebounce(nombre, 300)
  const { sugerencias } = useCatalogoGlobal(isEditing ? '' : debouncedNombre)

  // Lotes read-only (Tab C, modo edicion, tipo P)
  const lotesProductoId = isEditing && tipo === 'P' && producto ? producto.id : ''
  const { data: lotesData } = useQuery(
    `SELECT nro_lote, fecha_vencimiento, cantidad_actual, status
     FROM lotes
     WHERE producto_id = ? AND empresa_id = ?
     ORDER BY fecha_vencimiento ASC
     LIMIT 20`,
    [lotesProductoId, user?.empresa_id ?? '']
  )
  const lotes = (lotesData ?? []) as LoteRow[]

  // === Reset form on open / populate on edit ===
  useEffect(() => {
    if (isOpen) {
      setActiveTab('general')
      if (producto) {
        setCodigo(producto.codigo)
        setTipo(producto.tipo as 'P' | 'S' | 'C')
        setNombre(producto.nombre)
        setDepartamentoId(producto.departamento_id)
        setUnidadBaseId(producto.unidad_base_id ?? '')
        setPresentacion(producto.presentacion ?? '')
        setStockMinimo(producto.stock_minimo)
        setCodigoBarras(producto.codigo_barras ?? '')
        setIsActive(producto.is_active === 1)
        setCostoUsd(producto.costo_usd)
        setPrecioVentaUsd(producto.precio_venta_usd)
        setPrecioMayorUsd(producto.precio_mayor_usd ?? '')
        setPrecioEspecialUsd(producto.precio_especial_usd ?? '')
        setTipoImpuesto((producto.tipo_impuesto as 'Gravable' | 'Exento' | 'Exonerado') ?? 'Exento')
        setImpuestoIvaId(producto.impuesto_iva_id ?? '')
        setUbicacion(producto.ubicacion ?? '')
        setManejaLotes(producto.maneja_lotes === 1)
        setDepositoId('')
        setStockInicial('')
        if (tasaValor > 0) {
          const costoN = parseFloat(producto.costo_usd) || 0
          const ventaN = parseFloat(producto.precio_venta_usd) || 0
          const mayorN = parseFloat(producto.precio_mayor_usd ?? '') || 0
          const especN = parseFloat(producto.precio_especial_usd ?? '') || 0
          setCostoBs(costoN > 0 ? usdToBs(costoN, tasaValor).toFixed(2) : '')
          setPrecioVentaBs(ventaN > 0 ? usdToBs(ventaN, tasaValor).toFixed(2) : '')
          setPrecioMayorBs(mayorN > 0 ? usdToBs(mayorN, tasaValor).toFixed(2) : '')
          setPrecioEspecialBs(especN > 0 ? usdToBs(especN, tasaValor).toFixed(2) : '')
          if (costoN > 0 && ventaN > 0) {
            setMargen(((ventaN - costoN) / costoN * 100).toFixed(1))
          } else {
            setMargen('')
          }
        } else {
          setCostoBs('')
          setPrecioVentaBs('')
          setPrecioMayorBs('')
          setPrecioEspecialBs('')
          setMargen('')
        }
      } else {
        setCodigo('')
        setTipo('P')
        setNombre('')
        setDepartamentoId('')
        setUnidadBaseId('')
        setPresentacion('')
        setStockMinimo('')
        setCodigoBarras('')
        setIsActive(true)
        setCostoUsd('')
        setCostoBs('')
        setPrecioVentaUsd('')
        setPrecioVentaBs('')
        setPrecioMayorUsd('')
        setPrecioMayorBs('')
        setPrecioEspecialUsd('')
        setPrecioEspecialBs('')
        setMargen('')
        setMargenTipo('pct')
        setTipoImpuesto('Exento')
        setImpuestoIvaId('')
        setUbicacion('')
        setManejaLotes(false)
        setDepositoId('')
        setStockInicial('')
      }
      setErrors({})
      setPopoverOpen(false)
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, producto])

  // Sync Bs values when tasa changes while form is open
  useEffect(() => {
    if (!isOpen || tasaValor <= 0) return
    const costoN = parseFloat(costoUsd) || 0
    const ventaN = parseFloat(precioVentaUsd) || 0
    const mayorN = parseFloat(precioMayorUsd) || 0
    const especN = parseFloat(precioEspecialUsd) || 0
    if (costoN > 0) setCostoBs(usdToBs(costoN, tasaValor).toFixed(2))
    if (ventaN > 0) setPrecioVentaBs(usdToBs(ventaN, tasaValor).toFixed(2))
    if (mayorN > 0) setPrecioMayorBs(usdToBs(mayorN, tasaValor).toFixed(2))
    if (especN > 0) setPrecioEspecialBs(usdToBs(especN, tasaValor).toFixed(2))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasaValor])

  // === Handlers ===

  function handleTipoChange(nuevoTipo: 'P' | 'S' | 'C') {
    setTipo(nuevoTipo)
    if (nuevoTipo === 'S') {
      // Limpiar campos de inventario al pasar a Servicio
      setUbicacion('')
      setPresentacion('')
      setStockMinimo('0')
      setUnidadBaseId('')
      setManejaLotes(false)
      setDepositoId('')
      setStockInicial('')
      if (activeTab === 'inventario') setActiveTab('general')
    }
    if (nuevoTipo === 'C') {
      setUbicacion('')
      setPresentacion('')
      setStockMinimo('0')
      setUnidadBaseId('')
      setManejaLotes(false)
      setDepositoId('')
      setStockInicial('')
      setCostoUsd('0')
      setCostoBs('0')
    }
  }

  function handleTipoImpuestoChange(valor: 'Gravable' | 'Exento' | 'Exonerado') {
    setTipoImpuesto(valor)
    if (valor !== 'Gravable') setImpuestoIvaId('')
  }

  // --- Bidireccionales: Costo ---
  function handleCostoUsdChange(val: string) {
    setCostoUsd(val)
    const num = parseFloat(val)
    if (!isNaN(num) && tasaValor > 0) setCostoBs(usdToBs(num, tasaValor).toFixed(2))
    const costoN = isNaN(num) ? 0 : num
    const ventaN = parseFloat(precioVentaUsd) || 0
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

  // --- Bidireccionales: PVP Detal ---
  function handlePrecioVentaUsdChange(val: string) {
    setPrecioVentaUsd(val)
    const num = parseFloat(val)
    if (!isNaN(num) && tasaValor > 0) setPrecioVentaBs(usdToBs(num, tasaValor).toFixed(2))
    const costoN = esComboLocal ? 0 : (parseFloat(costoUsd) || 0)
    const ventaN = isNaN(num) ? 0 : num
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

  // --- Margen ---
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

  function handleMargenTipoChange(mt: 'pct' | 'abs') {
    setMargenTipo(mt)
    const costoN = esComboLocal ? 0 : (parseFloat(costoUsd) || 0)
    const ventaN = parseFloat(precioVentaUsd) || 0
    if (costoN > 0) {
      const m = mt === 'pct' ? ((ventaN - costoN) / costoN * 100) : (ventaN - costoN)
      setMargen(m.toFixed(2))
    }
  }

  // --- Bidireccionales: PVP Mayor ---
  function handlePrecioMayorUsdChange(val: string) {
    setPrecioMayorUsd(val)
    const num = parseFloat(val)
    if (!isNaN(num) && tasaValor > 0) setPrecioMayorBs(usdToBs(num, tasaValor).toFixed(2))
  }

  function handlePrecioMayorBsChange(val: string) {
    setPrecioMayorBs(val)
    const num = parseFloat(val)
    if (!isNaN(num) && tasaValor > 0) setPrecioMayorUsd(bsToUsd(num, tasaValor).toFixed(2))
  }

  // --- Bidireccionales: PVP Especial ---
  function handlePrecioEspecialUsdChange(val: string) {
    setPrecioEspecialUsd(val)
    const num = parseFloat(val)
    if (!isNaN(num) && tasaValor > 0) setPrecioEspecialBs(usdToBs(num, tasaValor).toFixed(2))
  }

  function handlePrecioEspecialBsChange(val: string) {
    setPrecioEspecialBs(val)
    const num = parseFloat(val)
    if (!isNaN(num) && tasaValor > 0) setPrecioEspecialUsd(bsToUsd(num, tasaValor).toFixed(2))
  }

  function handleSugerenciaSelect(s: {
    nombre: string
    presentacion: string | null
    maneja_lotes: boolean
    tipo_impuesto: string
  }) {
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

    const newErrors: Record<string, string> = {}
    if (!isEditing && tipo === 'P' && !depositoId) {
      newErrors.deposito_id = 'Selecciona un deposito'
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setActiveTab('inventario')
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
      precio_especial_usd: precioEspecialUsd.trim() === '' ? null : parseNumOrZero(precioEspecialUsd),
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
      // Navegar al tab con el primer error
      const precioFields = ['costo_usd', 'precio_venta_usd', 'precio_mayor_usd', 'precio_especial_usd', 'tipo_impuesto', 'impuesto_iva_id']
      const generalFields = ['departamento_id', 'stock_minimo']
      const hasPrecios = precioFields.some((f) => fieldErrors[f])
      const hasGeneral = generalFields.some((f) => fieldErrors[f])
      if (hasPrecios) setActiveTab('precios')
      else if (hasGeneral) setActiveTab('general')
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
          precio_especial_usd: parsed.data.precio_especial_usd ?? null,
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
          precio_especial_usd: parsed.data.precio_especial_usd ?? null,
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
                uuidv4(), user!.empresa_id!, productoId, depositoId,
                stockInicialNum.toFixed(3), stockInicialNum.toFixed(3),
                user!.id, fecha, now,
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
                uuidv4(), user!.empresa_id!, productoId, depositoId,
                stockInicialNum.toFixed(3), now, user!.id,
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
    if (e.target === dialogRef.current) onClose()
  }

  // Valores computados para resumen fiscal
  const ventaNum = parseNumOrZero(precioVentaUsd)
  const selectedImpuesto = impuestosIva.find((i) => i.id === impuestoIvaId)
  const alicuota =
    tipoImpuesto === 'Gravable' && selectedImpuesto
      ? parseFloat(selectedImpuesto.porcentaje)
      : 0
  const ivaMontoUsd = ventaNum * (alicuota / 100)
  const precioFinalUsd = ventaNum + ivaMontoUsd
  const mostrarResumenFiscal = ventaNum > 0 && tipoImpuesto !== 'Exento'

  const mostrarPopover = popoverOpen && sugerencias.length > 0 && !isEditing

  // Deshabilitar submit si faltan datos criticos
  const isSubmitDisabled =
    submitting ||
    !codigo.trim() ||
    !nombre.trim() ||
    (!esComboLocal && parseNumOrZero(costoUsd) === 0)

  const tabs: { id: TabId; label: string }[] = [
    { id: 'general', label: 'Informacion General' },
    { id: 'precios', label: 'Precios y Fiscalidad' },
    ...(tipo !== 'S' ? [{ id: 'inventario' as TabId, label: 'Inventario' }] : []),
  ]

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-xl p-0 w-full max-w-2xl shadow-2xl overflow-hidden"
    >
      <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">

        {/* ============================================================
            STICKY HEADER — Identidad primaria
        ============================================================ */}
        <div className="flex-none bg-white border-b border-gray-200 px-6 pt-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {isEditing ? 'Editar Producto' : 'Nuevo Producto'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Codigo + Nombre */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label htmlFor="prod-codigo" className="block text-xs font-medium text-gray-600 mb-1">
                Codigo <span className="text-red-500">*</span>
              </label>
              <input
                id="prod-codigo"
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                disabled={isEditing}
                placeholder="Ej: PROD-001"
                autoComplete="off"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isEditing ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
                } ${errors.codigo ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.codigo && <p className="text-red-500 text-xs mt-0.5">{errors.codigo}</p>}
              {isEditing && (
                <p className="text-gray-400 text-xs mt-0.5">El codigo no puede modificarse</p>
              )}
            </div>
            <div>
              <label htmlFor="prod-nombre" className="block text-xs font-medium text-gray-600 mb-1">
                Nombre <span className="text-red-500">*</span>
              </label>
              <Popover
                open={mostrarPopover}
                onOpenChange={(open) => { if (!open) setPopoverOpen(false) }}
              >
                <PopoverAnchor asChild>
                  <input
                    id="prod-nombre"
                    type="text"
                    value={nombre}
                    onChange={(e) => {
                      setNombre(e.target.value.toUpperCase())
                      setPopoverOpen(true)
                    }}
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
              {errors.nombre && <p className="text-red-500 text-xs mt-0.5">{errors.nombre}</p>}
            </div>
          </div>

          {/* Tipo de Item */}
          <div className="flex flex-wrap gap-4">
            {(['P', 'S', 'C'] as const).map((t) => (
              <label key={t} className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tipo"
                  value={t}
                  checked={tipo === t}
                  onChange={() => handleTipoChange(t)}
                  disabled={isEditing}
                  className={`h-4 w-4 focus:ring-2 ${
                    t === 'P'
                      ? 'text-blue-600 focus:ring-blue-500'
                      : t === 'S'
                      ? 'text-purple-600 focus:ring-purple-500'
                      : 'text-green-600 focus:ring-green-500'
                  }`}
                />
                <span className="text-sm font-medium text-gray-700">
                  {t === 'P' ? 'Producto' : t === 'S' ? 'Servicio' : 'Combo / Receta'}
                </span>
              </label>
            ))}
          </div>
          {errors.tipo && <p className="text-red-500 text-xs mt-1">{errors.tipo}</p>}
          {esComboLocal && (
            <p className="text-green-700 text-xs mt-2 bg-green-50 px-2 py-1 rounded">
              El costo se calcula automaticamente desde los ingredientes del combo
            </p>
          )}
        </div>

        {/* ============================================================
            TABS NAV
        ============================================================ */}
        <div className="flex-none bg-white border-b border-gray-200 px-6">
          <div className="flex -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ============================================================
            SCROLLABLE CONTENT
        ============================================================ */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">

          {/* ---- TAB A: Informacion General ---- */}
          {activeTab === 'general' && (
            <>
              {/* Departamento */}
              <div>
                <label htmlFor="prod-depto" className="block text-sm font-medium text-gray-700 mb-1">
                  Departamento <span className="text-red-500">*</span>
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
                    <option key={dep.id} value={dep.id}>{dep.nombre}</option>
                  ))}
                </select>
                {errors.departamento_id && (
                  <p className="text-red-500 text-xs mt-1">{errors.departamento_id}</p>
                )}
              </div>

              {/* Unidad de Medida — solo Producto */}
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

              {/* Presentacion — solo Producto */}
              {!esServicioOComboLocal && (
                <div>
                  <label htmlFor="prod-presentacion" className="block text-sm font-medium text-gray-700 mb-1">
                    Presentacion <span className="text-gray-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    id="prod-presentacion"
                    type="text"
                    value={presentacion}
                    onChange={(e) => setPresentacion(e.target.value.toUpperCase())}
                    placeholder="Ej: FRASCO 500ML, CAJA x12 UND"
                    autoComplete="off"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Stock Minimo — oculto para Servicio */}
              {tipo !== 'S' && (
                <div>
                  <label htmlFor="prod-stock-min" className="block text-sm font-medium text-gray-700 mb-1">
                    Stock Minimo
                    {tipo === 'C' && (
                      <span className="text-gray-400 font-normal ml-1">(Combos no aplica)</span>
                    )}
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
                      esServicioOComboLocal
                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                        : 'bg-white'
                    } ${errors.stock_minimo ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {errors.stock_minimo && (
                    <p className="text-red-500 text-xs mt-1">{errors.stock_minimo}</p>
                  )}
                </div>
              )}

              {/* Codigo de Barras */}
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
                <p className="text-xs text-gray-400 mt-1">
                  Puede escanear directamente con un lector de codigo de barras
                </p>
              </div>

              {/* Activo — solo edicion */}
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
            </>
          )}

          {/* ---- TAB B: Precios y Fiscalidad ---- */}
          {activeTab === 'precios' && (
            <div className="space-y-5">

              {/* Seccion Costos */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Costos
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="prod-costo" className="block text-xs font-medium text-gray-600 mb-1">
                      Costo (USD) <span className="text-red-500">*</span>
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
                    {errors.costo_usd && (
                      <p className="text-red-500 text-xs mt-0.5">{errors.costo_usd}</p>
                    )}
                    {esComboLocal && (
                      <p className="text-green-600 text-xs mt-0.5">Se calcula desde ingredientes</p>
                    )}
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
                        esComboLocal || tasaValor <= 0
                          ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                          : 'bg-white'
                      } border-gray-300`}
                    />
                  </div>
                </div>
              </div>

              {/* Margen de Ganancia */}
              {!esComboLocal && (
                <div>
                  <label htmlFor="prod-margen" className="block text-xs font-medium text-gray-600 mb-1">
                    Margen de Ganancia
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="prod-margen"
                      type="number"
                      step="0.1"
                      value={margen}
                      onChange={(e) => handleMargenChange(e.target.value)}
                      placeholder={margenTipo === 'pct' ? 'Ej: 30' : 'Ej: 5.00'}
                      className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex rounded-md border border-gray-300 overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMargenTipoChange('pct')}
                        className={`px-3 py-2 text-xs font-medium transition-colors ${
                          margenTipo === 'pct'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMargenTipoChange('abs')}
                        className={`px-3 py-2 text-xs font-medium border-l border-gray-300 transition-colors ${
                          margenTipo === 'abs'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        $
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Esquema de Precios (3 niveles) */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Esquema de Precios
                </p>

                {/* PVP Detal */}
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1.5 font-medium">PVP Detal</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="prod-venta" className="block text-xs font-medium text-gray-600 mb-1">
                        USD
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
                        <p className="text-red-500 text-xs mt-0.5">{errors.precio_venta_usd}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="prod-venta-bs" className="block text-xs font-medium text-gray-600 mb-1">
                        Bs
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
                          tasaValor <= 0
                            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                            : 'bg-white'
                        } border-gray-300`}
                      />
                    </div>
                  </div>
                </div>

                {/* PVP Mayor */}
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1.5 font-medium">
                    PVP Mayor <span className="text-gray-400 font-normal">(Opcional)</span>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="prod-mayor" className="block text-xs font-medium text-gray-600 mb-1">
                        USD
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
                        <p className="text-red-500 text-xs mt-0.5">{errors.precio_mayor_usd}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="prod-mayor-bs" className="block text-xs font-medium text-gray-600 mb-1">
                        Bs
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
                          tasaValor <= 0
                            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                            : 'bg-white'
                        } border-gray-300`}
                      />
                    </div>
                  </div>
                </div>

                {/* PVP Especial / Distribuidor */}
                <div>
                  <p className="text-xs text-gray-500 mb-1.5 font-medium">
                    PVP Especial / Distribuidor <span className="text-gray-400 font-normal">(Opcional)</span>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="prod-especial" className="block text-xs font-medium text-gray-600 mb-1">
                        USD
                      </label>
                      <input
                        id="prod-especial"
                        type="number"
                        step="0.01"
                        min="0"
                        value={precioEspecialUsd}
                        onChange={(e) => handlePrecioEspecialUsdChange(e.target.value)}
                        placeholder="0.00"
                        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                          errors.precio_especial_usd ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {errors.precio_especial_usd && (
                        <p className="text-red-500 text-xs mt-0.5">{errors.precio_especial_usd}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="prod-especial-bs" className="block text-xs font-medium text-gray-600 mb-1">
                        Bs
                      </label>
                      <input
                        id="prod-especial-bs"
                        type="number"
                        step="0.01"
                        min="0"
                        value={precioEspecialBs}
                        onChange={(e) => handlePrecioEspecialBsChange(e.target.value)}
                        disabled={tasaValor <= 0}
                        placeholder="0,00"
                        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          tasaValor <= 0
                            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                            : 'bg-white'
                        } border-gray-300`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Configuracion de IVA */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Configuracion de IVA
                </p>

                <div className="mb-3">
                  <label htmlFor="prod-tipo-impuesto" className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Impuesto
                  </label>
                  <select
                    id="prod-tipo-impuesto"
                    value={tipoImpuesto}
                    onChange={(e) =>
                      handleTipoImpuestoChange(
                        e.target.value as 'Gravable' | 'Exento' | 'Exonerado'
                      )
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Exento">Exento</option>
                    <option value="Gravable">Gravable (IVA General)</option>
                    <option value="Exonerado">Exonerado</option>
                  </select>
                  {errors.tipo_impuesto && (
                    <p className="text-red-500 text-xs mt-1">{errors.tipo_impuesto}</p>
                  )}
                </div>

                {/* Tasa IVA % — solo si Gravable */}
                {tipoImpuesto === 'Gravable' && (
                  <div>
                    <label htmlFor="prod-impuesto-iva" className="block text-sm font-medium text-gray-700 mb-1">
                      Tasa IVA (%)
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
              </div>

              {/* Resumen Fiscal */}
              {mostrarResumenFiscal && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                    Resumen Fiscal
                  </p>
                  <div className="flex justify-between text-xs text-amber-700">
                    <span>Base imponible</span>
                    <span className="font-medium tabular-nums">
                      {formatUsd(ventaNum)}&nbsp;/&nbsp;
                      {tasaValor > 0 ? formatBs(usdToBs(ventaNum, tasaValor)) : '—'}
                    </span>
                  </div>
                  {alicuota > 0 && (
                    <div className="flex justify-between text-xs text-amber-700">
                      <span>IVA ({alicuota.toFixed(2)}%)</span>
                      <span className="font-medium tabular-nums">
                        {formatUsd(ivaMontoUsd)}&nbsp;/&nbsp;
                        {tasaValor > 0 ? formatBs(usdToBs(ivaMontoUsd, tasaValor)) : '—'}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-amber-200 pt-1.5 flex justify-between text-xs font-bold text-amber-900">
                    <span>Precio Final</span>
                    <span className="tabular-nums">
                      {formatUsd(precioFinalUsd)}&nbsp;/&nbsp;
                      {tasaValor > 0 ? formatBs(usdToBs(precioFinalUsd, tasaValor)) : '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---- TAB C: Ubicacion e Inventario ---- */}
          {activeTab === 'inventario' && tipo !== 'S' && (
            <>
              {/* Inventario Inicial — solo creacion tipo P */}
              {!isEditing && tipo === 'P' && (
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
                        <option key={d.id} value={d.id}>{d.nombre}</option>
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

              {/* Stock actual — edicion tipo P */}
              {isEditing && producto && tipo === 'P' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
                  <span className="text-sm text-gray-500">Stock actual:</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {parseFloat(producto.stock).toFixed(3)}
                  </span>
                  <span className="text-xs text-gray-400">(modificar via Compras o Ajustes)</span>
                </div>
              )}

              {/* Ubicacion Fisica */}
              <div>
                <label htmlFor="prod-ubicacion" className="block text-sm font-medium text-gray-700 mb-1">
                  Ubicacion Fisica <span className="text-gray-400 font-normal">(Opcional)</span>
                </label>
                <input
                  id="prod-ubicacion"
                  type="text"
                  value={ubicacion}
                  onChange={(e) => setUbicacion(e.target.value.toUpperCase())}
                  placeholder="Ej: PASILLO 3, ESTANTE A"
                  autoComplete="off"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Manejo de Lotes */}
              <div className="flex items-center gap-2">
                <input
                  id="prod-maneja-lotes"
                  type="checkbox"
                  checked={manejaLotes}
                  onChange={(e) => setManejaLotes(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="prod-maneja-lotes" className="text-sm font-medium text-gray-700">
                  Manejo de Lotes
                </label>
                <span className="text-xs text-gray-400">(Activa control FEFO)</span>
              </div>

              {/* Consulta de Lotes — solo edicion tipo P */}
              {isEditing && tipo === 'P' && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Lotes Existentes</p>
                  {lotes.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-2">Sin lotes registrados</p>
                  ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-md">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Nro. Lote</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Vencimiento</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-600">Cantidad</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {lotes.map((lote, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-mono">{lote.nro_lote}</td>
                              <td className="px-3 py-2">{lote.fecha_vencimiento ?? '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {parseFloat(lote.cantidad_actual).toFixed(3)}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                                    lote.status === 'ACTIVO'
                                      ? 'bg-green-100 text-green-700'
                                      : lote.status === 'AGOTADO'
                                      ? 'bg-gray-100 text-gray-600'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {lote.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ============================================================
            STICKY FOOTER — Acciones
        ============================================================ */}
        <div className="flex-none bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            {!esComboLocal && parseNumOrZero(costoUsd) === 0 && (
              <span className="text-amber-600">Ingresa el costo para habilitar el guardado</span>
            )}
          </p>
          <div className="flex gap-3">
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
              disabled={isSubmitDisabled}
              title={
                !codigo.trim()
                  ? 'Ingresa el codigo'
                  : !nombre.trim()
                  ? 'Ingresa el nombre'
                  : !esComboLocal && parseNumOrZero(costoUsd) === 0
                  ? 'El costo no puede ser 0'
                  : undefined
              }
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  )
}
