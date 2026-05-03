import { useEffect, useRef, useState } from 'react'
import { ArrowCircleDown, ArrowCircleUp } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
      <div className={`rounded-xl border bg-muted/20 p-3 space-y-1.5 ${!efectivoUsd && !loadingMetodos ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Efectivo USD</span>
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
          className="no-spinner w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Seccion Efectivo Bs */}
      <div className={`rounded-xl border bg-muted/20 p-3 space-y-1.5 ${!efectivoBs && !loadingMetodos ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Efectivo Bs</span>
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
          className="no-spinner w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Concepto */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Concepto / Descripcion
        </label>
        <textarea
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="Descripcion del movimiento..."
          rows={2}
          className={`w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none ${
            errors.concepto ? 'border-destructive' : ''
          }`}
        />
        {errors.concepto && (
          <p className="text-destructive text-xs mt-1">{errors.concepto}</p>
        )}
      </div>

      {errors.general && (
        <p className="rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center p-2.5">
          {errors.general}
        </p>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          className={
            modo === 'INGRESO'
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }
        >
          {submitting
            ? 'Registrando...'
            : `Registrar ${modo === 'INGRESO' ? 'Ingreso' : 'Retiro'}`}
        </Button>
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
      className="backdrop:bg-black/60 backdrop:backdrop-blur-sm rounded-2xl p-0 w-full max-w-md shadow-2xl m-auto border-0 outline-none"
    >
      {/* iOS-style colored header */}
      <div
        className={`px-6 pt-5 pb-4 border-b ${
          modo === 'INGRESO'
            ? 'bg-gradient-to-br from-emerald-500/15 to-emerald-400/5'
            : 'bg-gradient-to-br from-red-500/15 to-red-400/5'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-xl ${
              modo === 'INGRESO' ? 'bg-emerald-500/15' : 'bg-red-500/15'
            }`}
          >
            {modo === 'INGRESO' ? (
              <ArrowCircleDown size={18} className="text-emerald-600" weight="fill" />
            ) : (
              <ArrowCircleUp size={18} className="text-red-600" weight="fill" />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">{titulo}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{descripcion}</p>
          </div>
        </div>
      </div>
      {/* Form body */}
      <div className="p-5">
        <FormIngresoRetiro
          onClose={onClose}
          sesionCajaId={sesionCajaId}
          modo={modo}
        />
      </div>
    </dialog>
  )
}
