import { useEffect, useRef, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { createMovimientoManualMulti } from '@/features/caja/hooks/use-movimientos-manual'
import { formatUsd, formatBs } from '@/lib/currency'

// ─── Props ────────────────────────────────────────────────────

interface IngresoRetiroModalProps {
  isOpen: boolean
  onClose: () => void
  sesionCajaId: string
  modo: 'INGRESO' | 'RETIRO'
}

// ─── Form ─────────────────────────────────────────────────────

function FormIngresoRetiro({
  onClose,
  sesionCajaId,
  modo,
}: {
  onClose: () => void
  sesionCajaId: string
  modo: 'INGRESO' | 'RETIRO'
}) {
  const { user } = useCurrentUser()
  const { metodos, isLoading: loadingMetodos } = useMetodosPagoActivos()

  const [montoUsd, setMontoUsd] = useState('')
  const [montoBs, setMontoBs] = useState('')
  const [concepto, setConcepto] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Auto-seleccionar metodos de efectivo por moneda
  const efectivoUsd = metodos.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'USD')
  const efectivoBs = metodos.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'BS')

  function reset() {
    setMontoUsd('')
    setMontoBs('')
    setConcepto('')
    setErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}

    const usd = parseFloat(montoUsd) || 0
    const bs = parseFloat(montoBs) || 0

    if (usd <= 0 && bs <= 0) {
      newErrors.general = 'Ingresa al menos un monto mayor a 0'
    }
    if (!concepto.trim() || concepto.trim().length < 3) {
      newErrors.concepto = 'El concepto debe tener al menos 3 caracteres'
    }
    if (usd > 0 && !efectivoUsd) {
      newErrors.general = 'No hay un metodo EFECTIVO en USD configurado'
    }
    if (bs > 0 && !efectivoBs) {
      newErrors.general = (newErrors.general ? newErrors.general + '. ' : '') +
        'No hay un metodo EFECTIVO en Bs configurado'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    if (!user) return

    const entradas: Array<{ metodo_cobro_id: string; monto: number }> = []
    if (usd > 0 && efectivoUsd) entradas.push({ metodo_cobro_id: efectivoUsd.id, monto: usd })
    if (bs > 0 && efectivoBs) entradas.push({ metodo_cobro_id: efectivoBs.id, monto: bs })

    setSubmitting(true)
    try {
      await createMovimientoManualMulti({
        entradas,
        origen: modo === 'INGRESO' ? 'INGRESO_MANUAL' : 'EGRESO_MANUAL',
        concepto: concepto.trim(),
        sesion_caja_id: sesionCajaId,
        empresa_id: user.empresa_id!,
        usuario_id: user.id,
      })
      toast.success(`${modo === 'INGRESO' ? 'Ingreso' : 'Retiro'} registrado exitosamente`)
      reset()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {loadingMetodos && (
        <p className="text-sm text-muted-foreground text-center">Cargando metodos de cobro...</p>
      )}

      {/* Seccion Efectivo USD */}
      <div className={`rounded-lg border p-3 space-y-2 ${!efectivoUsd && !loadingMetodos ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Efectivo USD</span>
          <div className="flex items-center gap-2">
            {efectivoUsd ? (
              <span className="text-xs text-muted-foreground">
                Saldo: {formatUsd(parseFloat(efectivoUsd.saldo_actual || '0'))}
              </span>
            ) : (
              !loadingMetodos && (
                <span className="text-xs text-amber-600">No configurado</span>
              )
            )}
          </div>
        </div>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={montoUsd}
          onChange={(e) => setMontoUsd(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          placeholder="0.00"
          disabled={!efectivoUsd || loadingMetodos}
          className="no-spinner w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Seccion Efectivo Bs */}
      <div className={`rounded-lg border p-3 space-y-2 ${!efectivoBs && !loadingMetodos ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Efectivo Bs</span>
          <div className="flex items-center gap-2">
            {efectivoBs ? (
              <span className="text-xs text-muted-foreground">
                Saldo: {formatBs(parseFloat(efectivoBs.saldo_actual || '0'))}
              </span>
            ) : (
              !loadingMetodos && (
                <span className="text-xs text-amber-600">No configurado</span>
              )
            )}
          </div>
        </div>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={montoBs}
          onChange={(e) => setMontoBs(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          placeholder="0.00"
          disabled={!efectivoBs || loadingMetodos}
          className="no-spinner w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Concepto */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Concepto / Descripcion
        </label>
        <textarea
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="Descripcion del movimiento..."
          rows={2}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
            errors.concepto ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.concepto && (
          <p className="text-red-500 text-xs mt-1">{errors.concepto}</p>
        )}
      </div>

      {errors.general && (
        <p className="text-red-500 text-sm text-center rounded-md bg-red-50 p-2">{errors.general}</p>
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
          className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 ${
            modo === 'INGRESO'
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {submitting
            ? 'Registrando...'
            : `Registrar ${modo === 'INGRESO' ? 'Ingreso' : 'Retiro'}`}
        </button>
      </div>
    </form>
  )
}

// ─── Dialog wrapper ───────────────────────────────────────────

export function IngresoRetiroModal({
  isOpen,
  onClose,
  sesionCajaId,
  modo,
}: IngresoRetiroModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  const titulo = modo === 'INGRESO' ? 'Ingreso de Efectivo' : 'Retiro de Efectivo'
  const descripcion =
    modo === 'INGRESO'
      ? 'Efectivo que ingresa a la caja sin estar asociado a una venta'
      : 'Efectivo que sale de la caja sin estar asociado a una venta'

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <div className="flex items-center gap-2 mb-1">
          {modo === 'INGRESO' ? (
            <ArrowDownCircle size={18} className="text-green-600" />
          ) : (
            <ArrowUpCircle size={18} className="text-red-600" />
          )}
          <h2 className="text-lg font-semibold">{titulo}</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5">{descripcion}</p>
        <FormIngresoRetiro
          onClose={onClose}
          sesionCajaId={sesionCajaId}
          modo={modo}
        />
      </div>
    </dialog>
  )
}
