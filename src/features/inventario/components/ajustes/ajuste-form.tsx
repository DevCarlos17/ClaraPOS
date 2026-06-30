import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Plus, X, MagnifyingGlass } from '@phosphor-icons/react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { crearAjuste, aplicarAjuste } from '@/features/inventario/hooks/use-ajustes'
import { useAjusteMotivosActivos } from '@/features/inventario/hooks/use-ajuste-motivos'
import { useProductos } from '@/features/inventario/hooks/use-productos'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatUsd, formatBs } from '@/lib/currency'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { todayStr } from '@/lib/dates'

const CLAVES_SALIDA = ['MERMA_INVENTARIO', 'EXTRAVIO_INVENTARIO', 'CONSUMO_INTERNO']

interface AjusteFormProps {
  isOpen: boolean
  onClose: () => void
}

interface LineaItem {
  producto_id: string
  producto_nombre: string
  producto_codigo: string
  costo_usd: string        // string preservando precisión completa del DB
  cantidad: string
}

// Buscador inline de productos por línea
function ProductoBuscador({
  value,
  onSelect,
  productos,
}: {
  value: { id: string; nombre: string; codigo: string } | null
  onSelect: (p: { id: string; nombre: string; codigo: string; costo_usd: string }) => void
  productos: Array<{ id: string; nombre: string; codigo: string; costo_usd: string; tipo: string; is_active: number }>
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const sugerencias = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const isWild = q === '*'
    const lista = productos.filter((p) => p.tipo === 'P' && p.is_active === 1)
    if (isWild) return lista.slice(0, 50)
    return lista.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
    ).slice(0, 15)
  }, [query, productos])

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
          onClick={() => onSelect({ id: '', nombre: '', codigo: '', costo_usd: '0' })}
          className="p-0.5 text-muted-foreground hover:text-destructive shrink-0"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MagnifyingGlass className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder="Buscar (* = todos)"
          className="w-full h-8 pl-6 pr-2 text-sm border border-input bg-white rounded focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      {open && sugerencias.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-white shadow-lg max-h-52 overflow-auto">
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
        </div>
      )}
    </div>
  )
}

export function AjusteForm({ isOpen, onClose }: AjusteFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { motivos } = useAjusteMotivosActivos()
  const { productos } = useProductos()
  const { depositos } = useDepositosActivos()
  const { user } = useCurrentUser()
  const { tasa: tasaActual } = useTasaActual()

  const [tipoRegistro, setTipoRegistro] = useState<'S' | 'E' | ''>('')
  const [motivoId, setMotivoId] = useState('')
  const [depositoId, setDepositoId] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [lineas, setLineas] = useState<LineaItem[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Motivos filtrados por tipo
  const motivosFiltrados = useMemo(() => {
    if (tipoRegistro === 'S') {
      return motivos.filter((m) => m.operacion_base === 'RESTA' && CLAVES_SALIDA.includes(m.cuentas_config_clave ?? ''))
    }
    if (tipoRegistro === 'E') {
      return motivos.filter((m) => m.operacion_base === 'SUMA')
    }
    return []
  }, [motivos, tipoRegistro])

  // Total con Decimal.js
  const totalUsd = useMemo(() => {
    return lineas.reduce((acc, l) => {
      const cant = parseFloat(l.cantidad)
      const costo = parseFloat(l.costo_usd)
      if (isNaN(cant) || isNaN(costo) || cant <= 0) return acc
      return acc.plus(new Decimal(l.costo_usd).times(new Decimal(l.cantidad)))
    }, new Decimal(0))
  }, [lineas])

  const totalBs = useMemo(() => {
    const tasa = parseFloat(tasaActual?.valor ?? '0')
    return tasa > 0 ? totalUsd.times(new Decimal(tasaActual!.valor)) : new Decimal(0)
  }, [totalUsd, tasaActual])

  function reset() {
    setTipoRegistro('')
    setMotivoId('')
    setDepositoId('')
    setObservaciones('')
    setLineas([])
    setSubmitting(false)
  }

  useEffect(() => {
    if (isOpen) {
      reset()
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMotivoId('')
  }, [tipoRegistro])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  const agregarLinea = useCallback(() => {
    setLineas((prev) => [
      ...prev,
      { producto_id: '', producto_nombre: '', producto_codigo: '', costo_usd: '0', cantidad: '' },
    ])
  }, [])

  const removerLinea = useCallback((index: number) => {
    setLineas((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const actualizarProducto = useCallback((
    index: number,
    p: { id: string; nombre: string; codigo: string; costo_usd: string }
  ) => {
    setLineas((prev) => prev.map((l, i) =>
      i !== index
        ? l
        : { ...l, producto_id: p.id, producto_nombre: p.nombre, producto_codigo: p.codigo, costo_usd: p.costo_usd || '0' }
    ))
  }, [])

  const actualizarCantidad = useCallback((index: number, valor: string) => {
    setLineas((prev) => prev.map((l, i) => i !== index ? l : { ...l, cantidad: valor }))
  }, [])

  const actualizarCosto = useCallback((index: number, valor: string) => {
    setLineas((prev) => prev.map((l, i) => i !== index ? l : { ...l, costo_usd: valor }))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) { toast.error('No se pudo identificar el usuario'); return }
    if (!tipoRegistro) { toast.error('Seleccioná el tipo de registro'); return }
    if (!motivoId && motivosFiltrados.length > 0) { toast.error('Seleccioná la causa'); return }
    if (!depositoId) { toast.error('Seleccioná el depósito'); return }
    if (lineas.length === 0) { toast.error('Agregá al menos un artículo'); return }

    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i]
      if (!l.producto_id) { toast.error(`Línea ${i + 1}: seleccioná el producto`); return }
      const cant = parseFloat(l.cantidad)
      if (isNaN(cant) || cant <= 0) { toast.error(`Línea ${i + 1}: cantidad inválida`); return }
    }

    setSubmitting(true)
    try {
      const lineasData = lineas.map((l) => ({
        producto_id: l.producto_id,
        deposito_id: depositoId,
        cantidad: parseFloat(l.cantidad),
        costo_unitario: parseFloat(l.costo_usd) || undefined,
      }))

      const ajusteId = await crearAjuste({
        motivo_id: motivoId,
        fecha: todayStr(),
        observaciones: observaciones.trim() || 'Ajuste individual',
        lineas: lineasData,
        empresa_id: user.empresa_id!,
        created_by: user.id,
      })

      await aplicarAjuste(ajusteId, user.empresa_id!, user.id ?? '')

      toast.success('Ajuste registrado y aplicado correctamente')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al procesar el ajuste')
    } finally {
      setSubmitting(false)
    }
  }

  const productosActivos = useMemo(
    () => productos.filter((p) => p.tipo === 'P' && p.is_active === 1) as typeof productos,
    [productos]
  )

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-xl p-0 w-full max-w-2xl shadow-2xl border-0"
    >
      <div className="flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Ajuste Individual de Inventario</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">

            {/* Tipo + Causa + Depósito */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Tipo <span className="text-destructive">*</span>
                </label>
                <select
                  value={tipoRegistro}
                  onChange={(e) => setTipoRegistro(e.target.value as 'S' | 'E' | '')}
                  className="h-9 px-3 text-sm border border-input bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Seleccionar...</option>
                  <option value="S">Salida</option>
                  <option value="E">Entrada</option>
                </select>
              </div>

              {tipoRegistro && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Causa {motivosFiltrados.length > 0 && <span className="text-destructive">*</span>}
                  </label>
                  {motivosFiltrados.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic h-9 flex items-center">Sin causas configuradas</p>
                  ) : (
                    <select
                      value={motivoId}
                      onChange={(e) => setMotivoId(e.target.value)}
                      className="h-9 px-3 text-sm border border-input bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Seleccionar...</option>
                      {motivosFiltrados.map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Depósito <span className="text-destructive">*</span>
                </label>
                <select
                  value={depositoId}
                  onChange={(e) => setDepositoId(e.target.value)}
                  className="h-9 px-3 text-sm border border-input bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Seleccionar...</option>
                  {depositos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Observaciones (opcional)</label>
              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Descripción o comentario"
                className="h-9 px-3 text-sm border border-input bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Artículos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Artículos <span className="text-destructive">*</span>
                </label>
                <span className="text-xs text-muted-foreground">{lineas.length} línea(s)</span>
              </div>

              {lineas.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden mb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/60">
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Artículo</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-24">Cantidad</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-28">Costo USD</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-24">Subtotal</th>
                        <th className="w-8 px-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {lineas.map((linea, index) => {
                        const cant = parseFloat(linea.cantidad)
                        const costo = linea.costo_usd ? new Decimal(linea.costo_usd) : new Decimal(0)
                        const subtotal = !isNaN(cant) && cant > 0 ? costo.times(cant) : new Decimal(0)

                        return (
                          <tr key={index} className="hover:bg-muted/30">
                            <td className="px-3 py-2">
                              <ProductoBuscador
                                value={linea.producto_id ? { id: linea.producto_id, nombre: linea.producto_nombre, codigo: linea.producto_codigo } : null}
                                onSelect={(p) => actualizarProducto(index, p)}
                                productos={productosActivos as any}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.001"
                                min="0.001"
                                value={linea.cantidad}
                                onChange={(e) => actualizarCantidad(index, e.target.value)}
                                placeholder="0.000"
                                className="w-full h-8 px-2 text-sm text-right border border-input bg-white rounded focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.00001"
                                min="0"
                                value={linea.costo_usd === '0' ? '' : linea.costo_usd}
                                onChange={(e) => actualizarCosto(index, e.target.value || '0')}
                                placeholder="auto"
                                className="w-full h-8 px-2 text-sm text-right border border-input bg-white rounded focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-sm text-muted-foreground whitespace-nowrap">
                              {subtotal.gt(0) ? formatUsd(subtotal.toNumber()) : '—'}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => removerLinea(index)}
                                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <button
                type="button"
                onClick={agregarLinea}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground border border-border rounded-md hover:bg-muted/50 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Agregar artículo
              </button>
            </div>

            {/* Total */}
            {totalUsd.gt(0) && (
              <div className="flex items-center justify-end gap-4 p-3 bg-muted/40 rounded-lg border border-border">
                <span className="text-sm font-medium text-muted-foreground">Total costo:</span>
                <div className="text-right">
                  <p className="text-base font-semibold">{formatUsd(totalUsd.toNumber())}</p>
                  {totalBs.gt(0) && (
                    <p className="text-xs text-muted-foreground">{formatBs(totalBs.toNumber())}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-muted-foreground bg-white border border-border rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || lineas.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Procesando...' : 'Aplicar Ajuste'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
