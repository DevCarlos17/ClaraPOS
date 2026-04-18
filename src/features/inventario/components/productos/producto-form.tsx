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
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { db } from '@/core/db/powersync/db'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { localNow } from '@/lib/dates'

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

  const [codigo, setCodigo] = useState('')
  const [tipo, setTipo] = useState<'P' | 'S' | 'C'>('P')
  const [nombre, setNombre] = useState('')
  const [departamentoId, setDepartamentoId] = useState('')
  const [costoUsd, setCostoUsd] = useState('')
  const [precioVentaUsd, setPrecioVentaUsd] = useState('')
  const [precioMayorUsd, setPrecioMayorUsd] = useState('')
  const [stockMinimo, setStockMinimo] = useState('')
  const [tipoImpuesto, setTipoImpuesto] = useState<'Gravable' | 'Exento' | 'Exonerado'>('Exento')
  const [isActive, setIsActive] = useState(true)
  const [ubicacion, setUbicacion] = useState('')
  const [unidadBaseId, setUnidadBaseId] = useState('')
  const [manejaLotes, setManejaLotes] = useState(false)
  const [depositoId, setDepositoId] = useState('')
  const [stockInicial, setStockInicial] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (producto) {
        setCodigo(producto.codigo)
        setTipo(producto.tipo as 'P' | 'S' | 'C')
        setNombre(producto.nombre)
        setDepartamentoId(producto.departamento_id)
        setCostoUsd(producto.costo_usd)
        setPrecioVentaUsd(producto.precio_venta_usd)
        setPrecioMayorUsd(producto.precio_mayor_usd ?? '')
        setStockMinimo(producto.stock_minimo)
        setTipoImpuesto((producto.tipo_impuesto as 'Gravable' | 'Exento' | 'Exonerado') ?? 'Exento')
        setIsActive(producto.is_active === 1)
        setUbicacion(producto.ubicacion ?? '')
        setUnidadBaseId(producto.unidad_base_id ?? '')
        setManejaLotes(producto.maneja_lotes === 1)
        setDepositoId('')
        setStockInicial('')
      } else {
        setCodigo('')
        setTipo('P')
        setNombre('')
        setDepartamentoId('')
        setCostoUsd('')
        setPrecioVentaUsd('')
        setPrecioMayorUsd('')
        setStockMinimo('')
        setTipoImpuesto('Exento')
        setIsActive(true)
        setUbicacion('')
        setUnidadBaseId('')
        setManejaLotes(false)
        setDepositoId('')
        setStockInicial('')
      }
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, producto])

  function handleCodigoChange(value: string) {
    setCodigo(value.toUpperCase())
  }

  function handleNombreChange(value: string) {
    setNombre(value.toUpperCase())
  }

  function handleUbicacionChange(value: string) {
    setUbicacion(value.toUpperCase())
  }

  function handleTipoChange(nuevoTipo: 'P' | 'S' | 'C') {
    setTipo(nuevoTipo)
    if (nuevoTipo === 'S' || nuevoTipo === 'C') {
      setUbicacion('')
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
      is_active: isActive,
      ubicacion: esServicioOCombo ? '' : ubicacion,
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
          is_active: parsed.data.is_active,
          tipo: parsed.data.tipo,
          ubicacion: esServicioOCombo ? null : (parsed.data.ubicacion || null),
          unidad_base_id: esServicioOCombo ? null : (unidadBaseId || null),
          maneja_lotes: esServicioOCombo ? false : manejaLotes,
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
          empresa_id: user!.empresa_id!,
          ubicacion: esServicioOCombo ? undefined : (parsed.data.ubicacion || undefined),
          unidad_base_id: esServicioOCombo ? undefined : (unidadBaseId || undefined),
          maneja_lotes: esServicioOCombo ? false : manejaLotes,
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

          {/* Nombre */}
          <div>
            <label htmlFor="prod-nombre" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="prod-nombre"
              type="text"
              value={nombre}
              onChange={(e) => handleNombreChange(e.target.value)}
              placeholder="Nombre del producto"
              autoComplete="off"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.nombre ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>}
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

          {/* Precios */}
          <div className="grid grid-cols-2 gap-4">
            {/* Costo USD */}
            <div>
              <label htmlFor="prod-costo" className="block text-sm font-medium text-gray-700 mb-1">
                Costo (USD)
              </label>
              <input
                id="prod-costo"
                type="number"
                step="0.01"
                min="0"
                value={esComboLocal ? '0' : costoUsd}
                onChange={(e) => setCostoUsd(e.target.value)}
                disabled={esComboLocal}
                placeholder="0.00"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  esComboLocal ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
                } ${errors.costo_usd ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.costo_usd && <p className="text-red-500 text-xs mt-1">{errors.costo_usd}</p>}
              {esComboLocal ? (
                <p className="text-gray-400 text-xs mt-1">Se calcula desde ingredientes</p>
              ) : (
                tasaValor > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{formatBs(usdToBs(costoNum, tasaValor))}</p>
                )
              )}
            </div>

            {/* Precio Venta USD */}
            <div>
              <label htmlFor="prod-venta" className="block text-sm font-medium text-gray-700 mb-1">
                Precio Venta (USD)
              </label>
              <input
                id="prod-venta"
                type="number"
                step="0.01"
                min="0"
                value={precioVentaUsd}
                onChange={(e) => setPrecioVentaUsd(e.target.value)}
                placeholder="0.00"
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.precio_venta_usd ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.precio_venta_usd && (
                <p className="text-red-500 text-xs mt-1">{errors.precio_venta_usd}</p>
              )}
              {tasaValor > 0 && (
                <p className="text-xs text-gray-400 mt-1">{formatBs(usdToBs(ventaNum, tasaValor))}</p>
              )}
            </div>
          </div>

          {/* Precio Mayor USD */}
          <div>
            <label htmlFor="prod-mayor" className="block text-sm font-medium text-gray-700 mb-1">
              Precio Mayor (USD) <span className="text-gray-400 font-normal">- Opcional</span>
            </label>
            <input
              id="prod-mayor"
              type="number"
              step="0.01"
              min="0"
              value={precioMayorUsd}
              onChange={(e) => setPrecioMayorUsd(e.target.value)}
              placeholder="0.00"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.precio_mayor_usd ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.precio_mayor_usd && (
              <p className="text-red-500 text-xs mt-1">{errors.precio_mayor_usd}</p>
            )}
            {tasaValor > 0 && mayorNum !== null && (
              <p className="text-xs text-gray-400 mt-1">{formatBs(usdToBs(mayorNum, tasaValor))}</p>
            )}
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
              onChange={(e) => setTipoImpuesto(e.target.value as 'Gravable' | 'Exento' | 'Exonerado')}
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

          {/* Preview de precios en Bs */}
          {tasaValor > 0 && (!esComboLocal ? costoNum > 0 : false || ventaNum > 0) && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-xs font-medium text-blue-700 mb-2">Vista previa en Bolivares (Tasa: {tasaValor.toFixed(4)})</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {!esComboLocal && costoNum > 0 && (
                  <div>
                    <span className="text-blue-600">Costo:</span>
                    <p className="font-medium text-blue-900">{formatUsd(costoNum)}</p>
                    <p className="text-blue-600">{formatBs(usdToBs(costoNum, tasaValor))}</p>
                  </div>
                )}
                <div>
                  <span className="text-blue-600">Venta:</span>
                  <p className="font-medium text-blue-900">{formatUsd(ventaNum)}</p>
                  <p className="text-blue-600">{formatBs(usdToBs(ventaNum, tasaValor))}</p>
                </div>
                {mayorNum !== null && (
                  <div>
                    <span className="text-blue-600">Mayor:</span>
                    <p className="font-medium text-blue-900">{formatUsd(mayorNum)}</p>
                    <p className="text-blue-600">{formatBs(usdToBs(mayorNum, tasaValor))}</p>
                  </div>
                )}
              </div>
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
