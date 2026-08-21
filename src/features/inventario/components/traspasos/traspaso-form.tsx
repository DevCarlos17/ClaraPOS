import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, MagnifyingGlass } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { traspasoSchema } from '@/features/inventario/schemas/traspaso-schema'
import { crearTraspaso } from '@/features/inventario/hooks/use-traspasos'
import { useProductos } from '@/features/inventario/hooks/use-productos'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useStockPorDeposito } from '@/features/inventario/hooks/use-inventario-stock'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePlantillasTraspaso, usePlantillaProductos } from '@/features/inventario/hooks/use-plantillas-traspaso'

interface TraspasoFormProps {
  isOpen: boolean
  onClose: () => void
}

interface LineaItem {
  producto_id: string
  producto_nombre: string
  producto_codigo: string
  cantidad: string
}

const LINEA_VACIA: LineaItem = { producto_id: '', producto_nombre: '', producto_codigo: '', cantidad: '' }

// Buscador inline de productos por linea — mismo patron portal-based que
// `ajuste-form.tsx` `ProductoBuscador`, sin costo_usd (los traspasos no
// mueven costo, solo cantidad entre depositos).
function ProductoBuscador({
  value,
  onSelect,
  productos,
  portalTarget,
  origenSeleccionado,
  stockDisponiblePorProducto,
}: {
  value: { id: string; nombre: string; codigo: string } | null
  onSelect: (p: { id: string; nombre: string; codigo: string }) => void
  productos: Array<{ id: string; nombre: string; codigo: string; tipo: string; is_active: number }>
  portalTarget: HTMLElement | null
  /** Si no hay deposito origen elegido, el buscador no ofrece productos: primero se elige el origen. */
  origenSeleccionado: boolean
  /** Stock por producto en el deposito origen; solo se sugieren productos con stock > 0. */
  stockDisponiblePorProducto: Map<string, string>
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const sugerencias = useMemo(() => {
    // Sin deposito origen no hay universo de stock: no se ofrece nada hasta elegir origen.
    if (!origenSeleccionado) return []
    const q = query.trim().toLowerCase()
    if (!q) return []
    const isWild = q === '*'
    const conStockEnOrigen = (p: { id: string }) => {
      const disp = stockDisponiblePorProducto.get(p.id)
      return disp !== undefined && parseFloat(disp) > 0
    }
    const lista = productos.filter(
      (p) => p.tipo === 'P' && p.is_active === 1 && conStockEnOrigen(p)
    )
    if (isWild) return lista.slice(0, 50)
    return lista.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
    ).slice(0, 15)
  }, [query, productos, origenSeleccionado, stockDisponiblePorProducto])

  function calcularPosicion() {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 260),
        zIndex: 9999,
        maxHeight: 208,
        overflowY: 'auto' as const,
      })
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(p: typeof productos[0]) {
    onSelect(p)
    setQuery('')
    setOpen(false)
  }

  if (value) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-mono text-xs text-muted-foreground">{value.codigo}</span>
        <span className="text-sm truncate">{value.nombre}</span>
        <button
          type="button"
          onClick={() => onSelect({ id: '', nombre: '', codigo: '' })}
          className="p-0.5 text-muted-foreground hover:text-destructive shrink-0"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef}>
      <div className="relative">
        <MagnifyingGlass className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); calcularPosicion(); setOpen(true) }}
          onFocus={() => { calcularPosicion(); setOpen(true) }}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          disabled={!origenSeleccionado}
          placeholder={origenSeleccionado ? 'Buscar producto (* = todos)' : 'Elegi un deposito origen primero'}
          className="w-full h-8 pl-6 pr-2 text-sm border border-input bg-white rounded focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-muted/40 disabled:cursor-not-allowed disabled:placeholder:text-muted-foreground/60"
        />
      </div>
      {open && sugerencias.length > 0 && createPortal(
        <div style={dropdownStyle} className="rounded-md border border-border bg-white shadow-xl">
          {sugerencias.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(p) }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60 flex items-center gap-2"
            >
              <span className="font-mono text-xs text-muted-foreground shrink-0">{p.codigo}</span>
              <span className="truncate">{p.nombre}</span>
            </button>
          ))}
        </div>,
        portalTarget ?? document.body
      )}
    </div>
  )
}

export function TraspasoForm({ isOpen, onClose }: TraspasoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { productos } = useProductos()
  const { depositos } = useDepositosActivos()
  const { user } = useCurrentUser()

  const [depositoOrigenId, setDepositoOrigenId] = useState('')
  const [depositoDestinoId, setDepositoDestinoId] = useState('')
  const [observacion, setObservacion] = useState('')
  const [lineas, setLineas] = useState<LineaItem[]>([{ ...LINEA_VACIA }])
  const [submitting, setSubmitting] = useState(false)
  const [plantillaSeleccionadaId, setPlantillaSeleccionadaId] = useState('')
  // Marca la ultima plantilla efectivamente cargada, para no re-preguntar la
  // confirmacion ni recargar cuando `productosPlantilla` (useQuery async de
  // PowerSync) cambia de referencia tras el fetch. La carga real ocurre cuando
  // llegan los datos, no en el render de la seleccion.
  const plantillaCargadaRef = useRef('')

  const { plantillas } = usePlantillasTraspaso()
  const { productos: productosPlantilla } = usePlantillaProductos(plantillaSeleccionadaId)

  const { stock: stockOrigen } = useStockPorDeposito(depositoOrigenId)
  const stockDisponiblePorProducto = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of stockOrigen) map.set(s.producto_id, s.cantidad_actual)
    return map
  }, [stockOrigen])

  // Rechazo temprano del lado del cliente — feedback inmediato antes de
  // intentar el submit; `crearTraspaso` tambien rechaza este caso (defensa
  // en profundidad), pero bloquear aqui evita el viaje redondo.
  const mismoDeposito = !!depositoOrigenId && !!depositoDestinoId && depositoOrigenId === depositoDestinoId

  const productosActivos = useMemo(
    () => productos.filter((p) => p.tipo === 'P' && p.is_active === 1) as typeof productos,
    [productos]
  )

  function reset() {
    setDepositoOrigenId('')
    setDepositoDestinoId('')
    setObservacion('')
    setLineas([{ ...LINEA_VACIA }])
    setSubmitting(false)
    setPlantillaSeleccionadaId('')
    plantillaCargadaRef.current = ''
  }

  // "Cargar plantilla": al elegir una plantilla se REEMPLAZAN las lineas
  // actuales por sus productos (cantidad vacia — se completa en el
  // traspaso, nunca se persiste cantidad en la plantilla). Si ya hay datos
  // cargados se pide confirmacion antes de reemplazar (evita perdida
  // accidental). Productos inactivos de la plantilla se excluyen del set
  // cargado; si todos estan inactivos, la grilla vuelve a una linea vacia
  // en lugar de quedar en blanco. No filtra por stock en origen — un
  // producto sin stock igual se carga y usa el feedback existente
  // (`stockDisponiblePorProducto`/`stockExcedido`).
  useEffect(() => {
    // Sin plantilla elegida: resetea la marca para permitir recargar la misma
    // plantilla mas tarde.
    if (!plantillaSeleccionadaId) {
      plantillaCargadaRef.current = ''
      return
    }
    // `productosPlantilla` es un useQuery ASINCRONO de PowerSync: en el render
    // de la seleccion todavia llega vacio y se puebla despues. Este effect
    // depende de `productosPlantilla`, asi que se re-ejecuta cuando los datos
    // llegan; el ref evita repetir la confirmacion/carga una vez procesada
    // esta plantilla.
    if (plantillaCargadaRef.current === plantillaSeleccionadaId) return
    // Espera a que la query resuelva antes de cargar (no reemplazar con vacio).
    if (productosPlantilla.length === 0) return

    const tieneLineasNoVacias = lineas.some((l) => l.producto_id)
    if (tieneLineasNoVacias && !window.confirm('Esto reemplazara los productos actuales. Continuar?')) {
      // Rechazo: revierte la seleccion para que el usuario pueda reintentar.
      setPlantillaSeleccionadaId('')
      return
    }

    plantillaCargadaRef.current = plantillaSeleccionadaId
    const activos = productosPlantilla.filter((p) => p.producto_is_active === 1)
    setLineas(
      activos.length > 0
        ? activos.map((p) => ({
            producto_id: p.producto_id,
            producto_nombre: p.producto_nombre,
            producto_codigo: p.producto_codigo,
            cantidad: '',
          }))
        : [{ ...LINEA_VACIA }]
    )
    // `lineas` se lee para el gate de confirmacion pero no debe re-disparar el
    // effect (la carga la gobiernan la seleccion + la llegada de datos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillaSeleccionadaId, productosPlantilla])

  useEffect(() => {
    if (isOpen) {
      reset()
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  const agregarLinea = useCallback(() => {
    setLineas((prev) => [...prev, { ...LINEA_VACIA }])
  }, [])

  const removerLinea = useCallback((index: number) => {
    setLineas((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }, [])

  const actualizarProducto = useCallback((
    index: number,
    p: { id: string; nombre: string; codigo: string }
  ) => {
    setLineas((prev) => prev.map((l, i) =>
      i !== index ? l : { ...l, producto_id: p.id, producto_nombre: p.nombre, producto_codigo: p.codigo }
    ))
  }, [])

  const actualizarCantidad = useCallback((index: number, valor: string) => {
    setLineas((prev) => prev.map((l, i) => (i !== index ? l : { ...l, cantidad: valor })))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) { toast.error('No se pudo identificar el usuario'); return }
    if (mismoDeposito) {
      toast.error('El deposito de origen y el deposito de destino deben ser diferentes')
      return
    }

    const parsed = traspasoSchema.safeParse({
      deposito_origen_id: depositoOrigenId,
      deposito_destino_id: depositoDestinoId,
      observacion: observacion.trim() || undefined,
      lineas: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: parseFloat(l.cantidad) })),
    })

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos invalidos')
      return
    }

    setSubmitting(true)
    try {
      await crearTraspaso({
        empresa_id: user.empresa_id!,
        usuario_id: user.id,
        deposito_origen_id: parsed.data.deposito_origen_id,
        deposito_destino_id: parsed.data.deposito_destino_id,
        observacion: parsed.data.observacion,
        lineas: parsed.data.lineas,
      })
      toast.success('Traspaso registrado')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al registrar el traspaso')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-xl p-0 w-full max-w-2xl shadow-2xl border-0"
    >
      <div className="flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Nuevo Traspaso de Inventario</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
            {/* Origen + Destino */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="traspaso-origen" className="text-xs font-medium text-muted-foreground">
                  Deposito Origen <span className="text-destructive">*</span>
                </label>
                <select
                  id="traspaso-origen"
                  value={depositoOrigenId}
                  onChange={(e) => setDepositoOrigenId(e.target.value)}
                  className="h-9 px-3 text-sm border border-input bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Seleccionar...</option>
                  {depositos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="traspaso-destino" className="text-xs font-medium text-muted-foreground">
                  Deposito Destino <span className="text-destructive">*</span>
                </label>
                <select
                  id="traspaso-destino"
                  value={depositoDestinoId}
                  onChange={(e) => setDepositoDestinoId(e.target.value)}
                  aria-invalid={mismoDeposito}
                  className={`h-9 px-3 text-sm border bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${
                    mismoDeposito ? 'border-destructive' : 'border-input'
                  }`}
                >
                  <option value="">Seleccionar...</option>
                  {depositos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            {mismoDeposito && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                El deposito de origen y el deposito de destino deben ser diferentes.
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label htmlFor="traspaso-observacion" className="text-xs font-medium text-muted-foreground">
                Observacion (opcional)
              </label>
              <input
                id="traspaso-observacion"
                type="text"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Descripcion o comentario"
                className="h-9 px-3 text-sm border border-input bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="traspaso-plantilla" className="text-xs font-medium text-muted-foreground">
                Cargar plantilla
              </label>
              <select
                id="traspaso-plantilla"
                value={plantillaSeleccionadaId}
                onChange={(e) => setPlantillaSeleccionadaId(e.target.value)}
                className="h-9 px-3 text-sm border border-input bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Seleccionar plantilla...</option>
                {plantillas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            {/* Lineas — 1 = individual, N = por lote, mismo formulario */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Productos <span className="text-destructive">*</span>
                </label>
                <span className="text-xs text-muted-foreground">{lineas.length} linea(s)</span>
              </div>

              <div className="space-y-2 mb-3">
                <div className="grid grid-cols-[1fr_100px_110px_32px] gap-2 px-3 py-1.5 bg-muted/60 rounded-lg text-xs font-medium text-muted-foreground">
                  <span>Producto</span>
                  <span className="text-right">Cantidad</span>
                  <span className="text-right">Disp. en origen</span>
                  <span />
                </div>

                {lineas.map((linea, index) => {
                  const disponible = linea.producto_id ? stockDisponiblePorProducto.get(linea.producto_id) : undefined
                  const disponibleNum = disponible !== undefined ? parseFloat(disponible) : null
                  const cantidadNum = parseFloat(linea.cantidad)
                  // Feedback visual (no bloquea el submit por si mismo; `crearTraspaso`
                  // es la guarda real). Mismo patron que linea-items.tsx del POS.
                  const stockExcedido =
                    !!linea.producto_id &&
                    disponibleNum !== null &&
                    Number.isFinite(cantidadNum) &&
                    cantidadNum > disponibleNum
                  return (
                    <div
                      key={index}
                      className={`grid grid-cols-[1fr_100px_110px_32px] gap-2 items-center px-3 py-2 border rounded-lg hover:bg-muted/20 ${
                        stockExcedido ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-white'
                      }`}
                    >
                      <ProductoBuscador
                        value={linea.producto_id ? { id: linea.producto_id, nombre: linea.producto_nombre, codigo: linea.producto_codigo } : null}
                        onSelect={(p) => actualizarProducto(index, p)}
                        productos={productosActivos as never}
                        portalTarget={dialogRef.current}
                        origenSeleccionado={!!depositoOrigenId}
                        stockDisponiblePorProducto={stockDisponiblePorProducto}
                      />
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        value={linea.cantidad}
                        onChange={(e) => actualizarCantidad(index, e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0.000"
                        aria-invalid={stockExcedido}
                        className={`h-8 px-2 text-sm text-right border bg-white rounded focus:outline-none focus:ring-2 w-full ${
                          stockExcedido
                            ? 'border-destructive text-destructive focus:ring-destructive'
                            : 'border-input focus:ring-primary'
                        }`}
                      />
                      <div
                        className={`text-right tabular-nums text-sm whitespace-nowrap ${
                          stockExcedido ? 'text-destructive font-medium' : 'text-muted-foreground'
                        }`}
                      >
                        {disponibleNum !== null ? disponibleNum.toFixed(3) : '—'}
                      </div>
                      <button
                        type="button"
                        onClick={() => removerLinea(index)}
                        disabled={lineas.length === 1}
                        aria-label="Quitar linea"
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors justify-self-center disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={agregarLinea}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground border border-border rounded-md hover:bg-muted/50 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Agregar producto
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
            <button
              type="button"
              onClick={() => { reset(); onClose() }}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-muted-foreground bg-white border border-border rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || mismoDeposito}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Registrando...' : 'Registrar Traspaso'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
