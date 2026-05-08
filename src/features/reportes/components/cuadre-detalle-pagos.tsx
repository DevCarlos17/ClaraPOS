import { useState, useCallback, useEffect } from 'react'
import { CheckCircle, Circle, MagnifyingGlass, PencilSimple, Check, X, Plus } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { usePagosDetalleCompleto, usePagosPorMetodo, type CuadreFilters, type VerifiedEntry } from '../hooks/use-cuadre'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'

function formatHora(fechaStr: string): string {
  try {
    const parts = fechaStr.split(' ')
    if (parts.length >= 2) return parts[1].substring(0, 5)
    return ''
  } catch {
    return ''
  }
}

interface PagoOverride {
  amount: string
  supervisorId: string
}

interface ManualEntry {
  id: string
  metodoCobro_id: string
  metodoNombre: string
  moneda: string
  monto: string
  referencia: string
}

// Tipo de accion de PIN pendiente
type PinAction =
  | { type: 'override'; pagoId: string }
  | { type: 'referencia'; pagoId: string }
  | { type: 'manual' }

interface DetallePagosProps {
  filters: CuadreFilters
  onVerifiedChange: (amounts: Record<string, VerifiedEntry>) => void
  /** Incrementar para resetear verificados y overrides (e.g. al limpiar conteo fisico) */
  resetKey?: number
}

export function CuadreDetallePagos({ filters, onVerifiedChange, resetKey }: DetallePagosProps) {
  const [visible, setVisible] = useState(false)
  const [verificados, setVerificados] = useState(new Set<string>())
  const [busq, setBusq] = useState('')

  // Overrides de monto (monto ajustado por supervisor)
  const [overrides, setOverrides] = useState<Record<string, PagoOverride>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editSupervisorId, setEditSupervisorId] = useState('')

  // Overrides de referencia
  const [refOverrides, setRefOverrides] = useState<Record<string, string>>({})
  const [editingRefId, setEditingRefId] = useState<string | null>(null)
  const [editRef, setEditRef] = useState('')

  // Transferencias manuales
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([])
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualMetodoId, setManualMetodoId] = useState('')
  const [manualMonto, setManualMonto] = useState('')
  const [manualReferencia, setManualReferencia] = useState('')

  // PIN dialog — una sola instancia, distinguida por accion pendiente
  const [pinAction, setPinAction] = useState<PinAction | null>(null)

  const { pagos: todosPagos, isLoading } = usePagosDetalleCompleto(visible ? filters : null)
  const pagos = todosPagos.filter((p) => p.metodoTipo !== 'EFECTIVO')

  // Metodos disponibles para el form manual (excluye EFECTIVO)
  const { metodos: todosMetodos } = usePagosPorMetodo(visible ? filters : null)
  const metodosDisponibles = todosMetodos.filter((m) => m.tipo !== 'EFECTIVO')

  const toggleVerificado = useCallback((id: string) => {
    setVerificados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Reset cuando el padre limpiar conteo
  useEffect(() => {
    if (resetKey === undefined) return
    setVerificados(new Set())
    setOverrides({})
    setRefOverrides({})
    setManualEntries([])
    setEditingId(null)
    setEditAmount('')
    setEditSupervisorId('')
    setEditingRefId(null)
    setEditRef('')
    setShowManualForm(false)
  }, [resetKey])

  // Emitir verified amounts por metodo_cobro_id (incluye entradas manuales)
  useEffect(() => {
    if (!visible) return
    const amounts: Record<string, VerifiedEntry> = {}

    for (const p of pagos) {
      if (!verificados.has(p.id)) continue
      const key = p.metodoCobro_id
      const override = overrides[p.id]
      let native: number
      let usd: number
      if (override) {
        native = parseFloat(override.amount) || 0
        const origNative = parseFloat(p.monto)
        const origUsd = parseFloat(p.montoUsd)
        usd = origNative > 0 ? origUsd * (native / origNative) : 0
      } else {
        native = parseFloat(p.monto)
        usd = parseFloat(p.montoUsd)
      }
      const existing = amounts[key]
      amounts[key] = {
        native: (existing?.native ?? 0) + native,
        usd: (existing?.usd ?? 0) + usd,
        moneda: p.moneda,
        overrideCount: (existing?.overrideCount ?? 0) + (override ? 1 : 0),
      }
    }

    // Incluir entradas manuales (todas auto-verificadas)
    for (const m of manualEntries) {
      const key = m.metodoCobro_id
      const native = parseFloat(m.monto) || 0
      const metodo = todosMetodos.find((mt) => mt.metodo_cobro_id === m.metodoCobro_id)
      const usd = m.moneda === 'BS' && metodo && metodo.totalOriginal > 0 && metodo.totalUsd > 0
        ? native / (metodo.totalOriginal / metodo.totalUsd)
        : native
      const existing = amounts[key]
      amounts[key] = {
        native: (existing?.native ?? 0) + native,
        usd: (existing?.usd ?? 0) + usd,
        moneda: m.moneda,
        overrideCount: existing?.overrideCount ?? 0,
      }
    }

    onVerifiedChange(amounts)
  }, [verificados, pagos, overrides, manualEntries, onVerifiedChange, visible, todosMetodos])

  // ── Monto override ──────────────────────────────────────────
  const handleRequestOverride = useCallback((id: string) => {
    setPinAction({ type: 'override', pagoId: id })
  }, [])

  // ── Referencia override ─────────────────────────────────────
  const handleRequestRefEdit = useCallback((id: string) => {
    setPinAction({ type: 'referencia', pagoId: id })
  }, [])

  // ── Manual entry ────────────────────────────────────────────
  const handleRequestManual = useCallback(() => {
    setPinAction({ type: 'manual' })
  }, [])

  // ── PIN autorizado ──────────────────────────────────────────
  const handlePinAuthorized = useCallback(
    (supervisorId: string) => {
      if (!pinAction) return

      if (pinAction.type === 'override') {
        const pago = pagos.find((p) => p.id === pinAction.pagoId)
        const defaultAmount =
          overrides[pinAction.pagoId]?.amount ??
          (pago ? parseFloat(pago.monto).toFixed(2) : '0')
        setEditSupervisorId(supervisorId)
        setEditAmount(defaultAmount)
        setEditingId(pinAction.pagoId)

      } else if (pinAction.type === 'referencia') {
        const pago = pagos.find((p) => p.id === pinAction.pagoId)
        const currentRef = refOverrides[pinAction.pagoId] ?? pago?.referencia ?? ''
        setEditRef(currentRef)
        setEditingRefId(pinAction.pagoId)

      } else if (pinAction.type === 'manual') {
        setShowManualForm(true)
        if (metodosDisponibles.length > 0 && !manualMetodoId) {
          setManualMetodoId(metodosDisponibles[0].metodo_cobro_id)
        }
      }

      setPinAction(null)
    },
    [pinAction, pagos, overrides, refOverrides, metodosDisponibles, manualMetodoId]
  )

  // ── Confirmar override de monto ─────────────────────────────
  const handleConfirmEdit = useCallback(() => {
    if (!editingId || !editSupervisorId) return
    setOverrides((prev) => ({
      ...prev,
      [editingId]: { amount: editAmount, supervisorId: editSupervisorId },
    }))
    setEditingId(null)
    setEditAmount('')
    setEditSupervisorId('')
  }, [editingId, editAmount, editSupervisorId])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditAmount('')
    setEditSupervisorId('')
  }, [])

  // ── Confirmar override de referencia ────────────────────────
  const handleConfirmRefEdit = useCallback(() => {
    if (!editingRefId) return
    setRefOverrides((prev) => ({ ...prev, [editingRefId]: editRef }))
    setEditingRefId(null)
    setEditRef('')
  }, [editingRefId, editRef])

  const handleCancelRefEdit = useCallback(() => {
    setEditingRefId(null)
    setEditRef('')
  }, [])

  // ── Confirmar entrada manual ─────────────────────────────────
  const handleConfirmManual = useCallback(() => {
    if (!manualMetodoId || !manualMonto) return
    const metodo = todosMetodos.find((m) => m.metodo_cobro_id === manualMetodoId)
    if (!metodo) return
    const newEntry: ManualEntry = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      metodoCobro_id: manualMetodoId,
      metodoNombre: metodo.nombre,
      moneda: metodo.moneda,
      monto: manualMonto,
      referencia: manualReferencia,
    }
    setManualEntries((prev) => [...prev, newEntry])
    setManualMonto('')
    setManualReferencia('')
    setShowManualForm(false)
  }, [manualMetodoId, manualMonto, manualReferencia, todosMetodos])

  const handleRemoveManual = useCallback((id: string) => {
    setManualEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const filtrados = busq.trim()
    ? pagos.filter(
        (p) =>
          (p.nroFactura ?? '').toLowerCase().includes(busq.toLowerCase()) ||
          (p.clienteNombre ?? '').toLowerCase().includes(busq.toLowerCase()) ||
          (p.referencia ?? '').toLowerCase().includes(busq.toLowerCase()) ||
          p.metodoNombre.toLowerCase().includes(busq.toLowerCase())
      )
    : pagos

  const activeOverrides = Object.keys(overrides).filter((id) => verificados.has(id))

  const totalVerificadoUsd = pagos
    .filter((p) => verificados.has(p.id))
    .reduce((sum, p) => {
      const override = overrides[p.id]
      if (override) {
        const origNative = parseFloat(p.monto)
        const origUsd = parseFloat(p.montoUsd)
        const native = parseFloat(override.amount) || 0
        return sum + (origNative > 0 ? origUsd * (native / origNative) : 0)
      }
      return sum + parseFloat(p.montoUsd)
    }, 0)

  return (
    <div className="rounded-2xl bg-card shadow-lg overflow-hidden">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={visible}
            onChange={() => {}}
            className="h-4 w-4 rounded border-gray-300 text-primary pointer-events-none"
          />
          <span className="text-sm font-semibold">Detalle de pagos recibidos</span>
          {visible && pagos.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {pagos.length} transacciones
            </span>
          )}
          <span className="text-xs text-muted-foreground">(transferencias y otros)</span>
        </div>
        {visible && (verificados.size > 0 || manualEntries.length > 0) && (
          <span className="text-xs text-green-600 font-medium">
            {verificados.size} verificado(s) · {formatUsd(totalVerificadoUsd)}
            {activeOverrides.length > 0 && (
              <span className="ml-1 text-amber-600">· {activeOverrides.length} ajustado(s)</span>
            )}
            {manualEntries.length > 0 && (
              <span className="ml-1 text-blue-600">· {manualEntries.length} manual(es)</span>
            )}
          </span>
        )}
      </button>

      {visible && (
        <div className="px-5 pb-5">
          {/* Barra de herramientas */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por factura, cliente, referencia, metodo..."
                value={busq}
                onChange={(e) => setBusq(e.target.value)}
                className="w-full rounded-md border border-input bg-white pl-8 pr-3 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleRequestManual}
              title="Agregar transferencia manual (requiere supervisor)"
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors whitespace-nowrap"
            >
              <Plus size={13} weight="bold" />
              Agregar manual
            </button>
          </div>

          {/* Form inline de entrada manual */}
          {showManualForm && (
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-800">Nueva transferencia manual</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Metodo</label>
                  <select
                    value={manualMetodoId}
                    onChange={(e) => setManualMetodoId(e.target.value)}
                    className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs"
                  >
                    {metodosDisponibles.map((m) => (
                      <option key={m.metodo_cobro_id} value={m.metodo_cobro_id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Monto</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualMonto}
                    onChange={(e) => setManualMonto(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Referencia</label>
                  <input
                    type="text"
                    value={manualReferencia}
                    onChange={(e) => setManualReferencia(e.target.value)}
                    placeholder="Opcional"
                    className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmManual}
                  disabled={!manualMetodoId || !manualMonto}
                  className="inline-flex items-center gap-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1 rounded transition-colors"
                >
                  <Check size={12} weight="bold" />
                  Agregar
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : filtrados.length === 0 && manualEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {pagos.length === 0 ? 'Sin pagos no-efectivo en este periodo' : 'Sin coincidencias'}
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr className="border-b">
                      <th className="text-left px-2 py-2 font-medium text-xs w-8"></th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Hora</th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Factura</th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Cliente</th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Metodo</th>
                      <th className="text-left px-2 py-2 font-medium text-xs">Referencia</th>
                      <th className="text-right px-2 py-2 font-medium text-xs">Monto</th>
                      <th className="text-right px-2 py-2 font-medium text-xs">Captura</th>
                      <th className="text-right px-2 py-2 font-medium text-xs">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Pagos del sistema */}
                    {filtrados.map((p) => {
                      const esVerificado = verificados.has(p.id)
                      const hasOverride = !!overrides[p.id]
                      const isEditing = editingId === p.id
                      const isEditingRef = editingRefId === p.id
                      const captureNative = hasOverride
                        ? parseFloat(overrides[p.id].amount) || 0
                        : null
                      const displayRef = refOverrides[p.id] ?? p.referencia

                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-muted/50 transition-colors ${
                            hasOverride && esVerificado
                              ? 'bg-amber-50/50'
                              : esVerificado
                              ? 'bg-green-50/50'
                              : 'hover:bg-muted/20'
                          }`}
                        >
                          {/* Checkbox verificar */}
                          <td className="px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => toggleVerificado(p.id)}
                              title={esVerificado ? 'Desmarcar' : 'Verificar'}
                              className="text-muted-foreground hover:text-green-600 transition-colors"
                            >
                              {esVerificado ? (
                                <CheckCircle size={16} weight="fill" className="text-green-600" />
                              ) : (
                                <Circle size={16} />
                              )}
                            </button>
                          </td>

                          {/* Hora */}
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">
                            {formatHora(p.fecha)}
                          </td>

                          {/* Factura */}
                          <td className="px-2 py-1.5">
                            {p.nroFactura ? (
                              <span className="font-mono text-xs">#{p.nroFactura}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>

                          {/* Cliente */}
                          <td className="px-2 py-1.5 text-xs truncate max-w-[120px]">
                            {p.clienteNombre ?? '-'}
                          </td>

                          {/* Metodo */}
                          <td className="px-2 py-1.5 text-xs">{p.metodoNombre}</td>

                          {/* Referencia con edicion */}
                          <td className="px-2 py-1.5 text-xs text-muted-foreground max-w-[100px]">
                            {isEditingRef ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editRef}
                                  onChange={(e) => setEditRef(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleConfirmRefEdit()
                                    if (e.key === 'Escape') handleCancelRefEdit()
                                  }}
                                  className="w-20 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  autoFocus
                                />
                                <button type="button" onClick={handleConfirmRefEdit} className="text-green-600 hover:text-green-700"><Check size={12} weight="bold" /></button>
                                <button type="button" onClick={handleCancelRefEdit} className="text-muted-foreground hover:text-red-500"><X size={12} weight="bold" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className={`truncate ${refOverrides[p.id] ? 'text-blue-700 font-medium' : ''}`}>
                                  {displayRef ?? '-'}
                                </span>
                                {esVerificado && (
                                  <button
                                    type="button"
                                    onClick={() => handleRequestRefEdit(p.id)}
                                    title="Editar referencia (requiere supervisor)"
                                    className="text-muted-foreground hover:text-blue-600 transition-colors shrink-0"
                                  >
                                    <PencilSimple size={11} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Monto original del sistema */}
                          <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                            {p.moneda === 'BS'
                              ? formatBs(parseFloat(p.monto))
                              : formatUsd(parseFloat(p.monto))}
                          </td>

                          {/* Captura (monto ajustado) */}
                          <td className="px-2 py-1.5 text-right text-xs tabular-nums">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={editAmount}
                                  onChange={(e) => setEditAmount(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleConfirmEdit()
                                    if (e.key === 'Escape') handleCancelEdit()
                                  }}
                                  className="w-24 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-xs tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  autoFocus
                                />
                                <button type="button" onClick={handleConfirmEdit} className="text-green-600 hover:text-green-700" title="Confirmar">
                                  <Check size={13} weight="bold" />
                                </button>
                                <button type="button" onClick={handleCancelEdit} className="text-muted-foreground hover:text-red-500" title="Cancelar">
                                  <X size={13} weight="bold" />
                                </button>
                              </div>
                            ) : captureNative !== null ? (
                              <div className="flex items-center justify-end gap-1">
                                <span className={esVerificado ? 'text-amber-700 font-semibold' : 'text-amber-600'}>
                                  {p.moneda === 'BS' ? formatBs(captureNative) : formatUsd(captureNative)}
                                  <span className="text-amber-400 ml-0.5">*</span>
                                </span>
                                {esVerificado && (
                                  <button
                                    type="button"
                                    onClick={() => handleRequestOverride(p.id)}
                                    title="Ajustar monto (requiere supervisor)"
                                    className="text-muted-foreground hover:text-amber-600 transition-colors"
                                  >
                                    <PencilSimple size={11} />
                                  </button>
                                )}
                              </div>
                            ) : esVerificado ? (
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-muted-foreground">—</span>
                                <button
                                  type="button"
                                  onClick={() => handleRequestOverride(p.id)}
                                  title="Ajustar monto (requiere supervisor)"
                                  className="text-muted-foreground hover:text-amber-600 transition-colors"
                                >
                                  <PencilSimple size={11} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* USD */}
                          <td className="px-2 py-1.5 text-right text-xs font-bold tabular-nums">
                            {formatUsd(parseFloat(p.montoUsd))}
                          </td>
                        </tr>
                      )
                    })}

                    {/* Entradas manuales */}
                    {manualEntries.map((m) => (
                      <tr key={m.id} className="border-b border-muted/50 bg-blue-50/40">
                        <td className="px-2 py-1.5">
                          <CheckCircle size={16} weight="fill" className="text-blue-500" />
                        </td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">—</td>
                        <td className="px-2 py-1.5">
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">MANUAL</span>
                        </td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">—</td>
                        <td className="px-2 py-1.5 text-xs">{m.metodoNombre}</td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground truncate max-w-[100px]">
                          {m.referencia || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                          {m.moneda === 'BS' ? formatBs(parseFloat(m.monto)) : formatUsd(parseFloat(m.monto))}
                        </td>
                        <td className="px-2 py-1.5 text-right text-xs tabular-nums text-blue-700 font-semibold">
                          {m.moneda === 'BS' ? formatBs(parseFloat(m.monto)) : formatUsd(parseFloat(m.monto))}
                        </td>
                        <td className="px-2 py-1.5 text-right text-xs">
                          <button
                            type="button"
                            onClick={() => handleRemoveManual(m.id)}
                            title="Eliminar"
                            className="text-muted-foreground hover:text-red-500 transition-colors"
                          >
                            <X size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer summary */}
              <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {filtrados.length} pago(s)
                  {manualEntries.length > 0 && ` + ${manualEntries.length} manual(es)`}
                </span>
                <span className="font-semibold">
                  Total: {formatUsd(filtrados.reduce((s, p) => s + parseFloat(p.montoUsd), 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PIN dialog unificado */}
      <SupervisorPinDialog
        isOpen={!!pinAction}
        onClose={() => setPinAction(null)}
        onAuthorized={handlePinAuthorized}
        titulo={
          pinAction?.type === 'manual'
            ? 'Autorizar transferencia manual'
            : pinAction?.type === 'referencia'
            ? 'Autorizar edicion de referencia'
            : 'Autorizar ajuste de monto'
        }
        mensaje={
          pinAction?.type === 'manual'
            ? 'Se requiere autorizacion de supervisor para agregar una transferencia manual.'
            : pinAction?.type === 'referencia'
            ? 'Se requiere autorizacion de supervisor para editar la referencia de este pago.'
            : 'Se requiere autorizacion de supervisor para modificar el monto de esta transferencia.'
        }
        requiredPermission="caja.movimientos_manual"
      />
    </div>
  )
}
