import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { kardexSchema } from '@/features/inventario/schemas/kardex-schema'
import { useProductosTipo } from '@/features/inventario/hooks/use-productos'
import { registrarMovimiento } from '@/features/inventario/hooks/use-kardex'
import { useLotesPorProducto } from '@/features/inventario/hooks/use-lotes'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useUnidades } from '@/features/inventario/hooks/use-unidades'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface MovimientoFormProps {
  isOpen: boolean
  onClose: () => void
}

export function MovimientoForm({ isOpen, onClose }: MovimientoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { productos, isLoading: loadingProductos } = useProductosTipo('P')
  const { user } = useCurrentUser()

  const [productoId, setProductoId] = useState('')
  const [tipo, setTipo] = useState<'E' | 'S'>('E')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Estado para manejo de lotes
  const [loteId, setLoteId] = useState('')
  const [loteModo, setLoteModo] = useState<'existente' | 'nuevo'>('existente')
  const [loteNro, setLoteNro] = useState('')
  const [loteFechaFab, setLoteFechaFab] = useState('')
  const [loteFechaVenc, setLoteFechaVenc] = useState('')
  const [depositoId, setDepositoId] = useState('')

  const { lotes } = useLotesPorProducto(productoId)
  const { depositos } = useDepositosActivos()
  const { unidades } = useUnidades()

  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo.toLowerCase().includes(busqueda.toLowerCase())
  )

  const productoSeleccionado = productos.find((p) => p.id === productoId)
  const manejaLotes = productoSeleccionado?.maneja_lotes === 1
  const lotesActivos = lotes.filter((l) => l.status === 'ACTIVO')
  const loteSeleccionado = lotesActivos.find((l) => l.id === loteId)

  // Determinar si el producto acepta decimales segun su unidad base
  const unidadBase = unidades.find((u) => u.id === productoSeleccionado?.unidad_base_id)
  const esDecimal = unidadBase ? unidadBase.es_decimal === 1 : true
  const cantidadStep = esDecimal ? '0.001' : '1'
  const cantidadMin = esDecimal ? '0.001' : '1'

  useEffect(() => {
    if (isOpen) {
      setProductoId('')
      setTipo('E')
      setCantidad('')
      setMotivo('')
      setBusqueda('')
      setDropdownOpen(false)
      setErrors({})
      setLoteId('')
      setLoteModo('existente')
      setLoteNro('')
      setLoteFechaFab('')
      setLoteFechaVenc('')
      setDepositoId('')
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function resetLoteState() {
    setLoteId('')
    setLoteNro('')
    setLoteFechaFab('')
    setLoteFechaVenc('')
    setDepositoId('')
    setLoteModo('existente')
  }

  function handleSelectProducto(id: string, nombre: string) {
    setProductoId(id)
    setBusqueda(nombre)
    setDropdownOpen(false)
    resetLoteState()
  }

  function handleBusquedaChange(value: string) {
    setBusqueda(value)
    setDropdownOpen(true)
    if (!value) {
      setProductoId('')
      resetLoteState()
    }
  }

  function handleTipoChange(nuevoTipo: 'E' | 'S') {
    setTipo(nuevoTipo)
    setLoteId('')
    setErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    const cantidadNum = parseFloat(cantidad)
    const parsed = kardexSchema.safeParse({
      producto_id: productoId,
      tipo,
      cantidad: isNaN(cantidadNum) ? 0 : cantidadNum,
      motivo: motivo.trim() || undefined,
    })

    const newErrors: Record<string, string> = {}

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) newErrors[field] = issue.message
      }
    }

    // Validar decimales segun unidad del producto
    if (!isNaN(cantidadNum) && !esDecimal && cantidadNum !== Math.floor(cantidadNum)) {
      newErrors.cantidad = `Este producto se maneja por ${unidadBase?.abreviatura ?? 'unidades'} enteras`
    }

    // Validaciones de lote
    if (manejaLotes) {
      if (tipo === 'S') {
        if (!loteId) {
          newErrors.lote =
            lotesActivos.length === 0
              ? 'No hay lotes activos disponibles para este producto'
              : 'Debe seleccionar el lote a descontar'
        }
      } else {
        if (loteModo === 'existente' && !loteId) {
          newErrors.lote =
            lotesActivos.length === 0
              ? 'No hay lotes activos. Use "Lote nuevo"'
              : 'Debe seleccionar el lote'
        } else if (loteModo === 'nuevo' && !depositoId) {
          newErrors.deposito = 'Debe seleccionar el deposito para el nuevo lote'
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSubmitting(true)
    try {
      // Deposito: viene del lote seleccionado o del selector (lote nuevo)
      const movDepositoId = loteSeleccionado?.deposito_id ?? (loteModo === 'nuevo' ? depositoId : undefined)

      await registrarMovimiento({
        producto_id: parsed.data!.producto_id,
        tipo: parsed.data!.tipo,
        cantidad: parsed.data!.cantidad,
        motivo: parsed.data!.motivo,
        usuario_id: user.id,
        empresa_id: user.empresa_id!,
        ...(manejaLotes && movDepositoId ? { deposito_id: movDepositoId } : {}),
        ...(manejaLotes && loteId ? { lote_id: loteId } : {}),
        ...(manejaLotes && tipo === 'E' && loteModo === 'nuevo' && loteNro.trim()
          ? { lote_nro: loteNro.trim() }
          : {}),
        ...(manejaLotes && tipo === 'E' && loteModo === 'nuevo' && loteFechaFab
          ? { lote_fecha_fab: loteFechaFab }
          : {}),
        ...(manejaLotes && tipo === 'E' && loteModo === 'nuevo' && loteFechaVenc
          ? { lote_fecha_venc: loteFechaVenc }
          : {}),
      })
      toast.success(
        tipo === 'E'
          ? `Entrada de ${parsed.data!.cantidad} registrada`
          : `Salida de ${parsed.data!.cantidad} registrada`
      )
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Nuevo Movimiento de Inventario</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Producto (buscador) */}
          <div className="relative">
            <label htmlFor="mov-producto" className="block text-sm font-medium text-gray-700 mb-1">
              Producto
            </label>
            <input
              id="mov-producto"
              type="text"
              value={busqueda}
              onChange={(e) => handleBusquedaChange(e.target.value)}
              onFocus={() => setDropdownOpen(true)}
              placeholder={loadingProductos ? 'Cargando productos...' : 'Buscar producto por nombre o codigo'}
              disabled={loadingProductos}
              autoComplete="off"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.producto_id ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.producto_id && (
              <p className="text-red-500 text-xs mt-1">{errors.producto_id}</p>
            )}

            {dropdownOpen && busqueda && productosFiltrados.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                {productosFiltrados.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectProducto(p.id, `${p.codigo} - ${p.nombre}`)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                    >
                      <span className="font-mono text-gray-500">{p.codigo}</span>
                      <span className="mx-1.5 text-gray-300">|</span>
                      <span className="text-gray-900">{p.nombre}</span>
                      <span className="text-gray-400 text-xs ml-2">Stock: {parseFloat(p.stock).toFixed(3)}</span>
                      {p.maneja_lotes === 1 && (
                        <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          Lotes
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {dropdownOpen && busqueda && productosFiltrados.length === 0 && !loadingProductos && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg p-3 text-sm text-gray-500">
                No se encontraron productos
              </div>
            )}
          </div>

          {/* Info de producto seleccionado */}
          {productoSeleccionado && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2 flex items-center gap-3">
              <span>
                Stock actual:{' '}
                <span className="font-medium text-gray-700">
                  {parseFloat(productoSeleccionado.stock).toFixed(3)}
                </span>
              </span>
              {manejaLotes && (
                <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-xs font-medium">
                  Maneja lotes
                </span>
              )}
            </div>
          )}

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Movimiento</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleTipoChange('E')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors border ${
                  tipo === 'E'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-green-50'
                }`}
              >
                Entrada
              </button>
              <button
                type="button"
                onClick={() => handleTipoChange('S')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors border ${
                  tipo === 'S'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-red-50'
                }`}
              >
                Salida
              </button>
            </div>
            {errors.tipo && <p className="text-red-500 text-xs mt-1">{errors.tipo}</p>}
          </div>

          {/* Seccion de lotes (solo si el producto maneja lotes) */}
          {manejaLotes && productoId && (
            <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Seleccion de lote</p>

              {tipo === 'S' ? (
                /* SALIDA: selector de lote obligatorio */
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lote a descontar <span className="text-red-500">*</span>
                  </label>
                  {lotesActivos.length === 0 ? (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      No hay lotes activos disponibles para este producto.
                    </div>
                  ) : (
                    <select
                      value={loteId}
                      onChange={(e) => setLoteId(e.target.value)}
                      className={`w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.lote ? 'border-red-500' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Seleccionar lote...</option>
                      {lotesActivos.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nro_lote}
                          {l.fecha_vencimiento ? ` | Venc: ${l.fecha_vencimiento}` : ''}
                          {` | Disp: ${parseFloat(l.cantidad_actual).toFixed(3)}`}
                          {l.nombre_deposito ? ` | ${l.nombre_deposito}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.lote && <p className="text-red-500 text-xs mt-1">{errors.lote}</p>}
                </div>
              ) : (
                /* ENTRADA: toggle existente / nuevo */
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLoteModo('existente')
                        setLoteNro('')
                        setLoteFechaFab('')
                        setLoteFechaVenc('')
                        setDepositoId('')
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium border transition-colors ${
                        loteModo === 'existente'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50'
                      }`}
                    >
                      Lote existente
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLoteModo('nuevo')
                        setLoteId('')
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium border transition-colors ${
                        loteModo === 'nuevo'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50'
                      }`}
                    >
                      Lote nuevo
                    </button>
                  </div>

                  {loteModo === 'existente' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Lote <span className="text-red-500">*</span>
                      </label>
                      {lotesActivos.length === 0 ? (
                        <div className="rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-800">
                          No hay lotes activos. Cambie a "Lote nuevo" para crear uno.
                        </div>
                      ) : (
                        <select
                          value={loteId}
                          onChange={(e) => setLoteId(e.target.value)}
                          className={`w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.lote ? 'border-red-500' : 'border-gray-300'
                          }`}
                        >
                          <option value="">Seleccionar lote...</option>
                          {lotesActivos.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.nro_lote}
                              {l.fecha_vencimiento ? ` | Venc: ${l.fecha_vencimiento}` : ''}
                              {` | Actual: ${parseFloat(l.cantidad_actual).toFixed(3)}`}
                              {l.nombre_deposito ? ` | ${l.nombre_deposito}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      {errors.lote && <p className="text-red-500 text-xs mt-1">{errors.lote}</p>}
                    </div>
                  ) : (
                    /* Lote nuevo */
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Deposito <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={depositoId}
                          onChange={(e) => setDepositoId(e.target.value)}
                          className={`w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.deposito ? 'border-red-500' : 'border-gray-300'
                          }`}
                        >
                          <option value="">Seleccionar deposito...</option>
                          {depositos.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nombre}
                            </option>
                          ))}
                        </select>
                        {errors.deposito && <p className="text-red-500 text-xs mt-1">{errors.deposito}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nro. Lote{' '}
                          <span className="text-gray-400 font-normal">- Opcional</span>
                        </label>
                        <input
                          type="text"
                          value={loteNro}
                          onChange={(e) => setLoteNro(e.target.value.toUpperCase())}
                          placeholder="Ej: L-2024-001"
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Fec. Fabricacion{' '}
                            <span className="text-gray-400 font-normal">- Opc.</span>
                          </label>
                          <input
                            type="date"
                            value={loteFechaFab}
                            onChange={(e) => setLoteFechaFab(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Fec. Vencimiento{' '}
                            <span className="text-gray-400 font-normal">- Opc.</span>
                          </label>
                          <input
                            type="date"
                            value={loteFechaVenc}
                            onChange={(e) => setLoteFechaVenc(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cantidad */}
          <div>
            <label htmlFor="mov-cantidad" className="block text-sm font-medium text-gray-700 mb-1">
              Cantidad
              {unidadBase && (
                <span className="ml-1.5 text-gray-400 font-normal">
                  ({unidadBase.abreviatura}{!esDecimal ? ' — solo enteros' : ''})
                </span>
              )}
            </label>
            <input
              id="mov-cantidad"
              type="number"
              step={cantidadStep}
              min={cantidadMin}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.cantidad ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.cantidad && <p className="text-red-500 text-xs mt-1">{errors.cantidad}</p>}
          </div>

          {/* Motivo */}
          <div>
            <label htmlFor="mov-motivo" className="block text-sm font-medium text-gray-700 mb-1">
              Motivo <span className="text-gray-400 font-normal">- Opcional</span>
            </label>
            <textarea
              id="mov-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Descripcion del motivo del ajuste"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

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
              className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 ${
                tipo === 'E'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {submitting
                ? 'Registrando...'
                : tipo === 'E'
                  ? 'Registrar Entrada'
                  : 'Registrar Salida'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
