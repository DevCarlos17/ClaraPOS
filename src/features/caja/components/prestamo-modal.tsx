import { useEffect, useRef, useState } from 'react'
import { Handshake, Info } from 'lucide-react'
import { toast } from 'sonner'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { createMovimientoManualMulti } from '@/features/caja/hooks/use-movimientos-manual'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'

// ─── Props ────────────────────────────────────────────────────

export interface PrestamoAplicado {
  montoPrestamoUsd: number
  montoPrestamoBs: number
  interesUsd: number
  totalDeudaUsd: number
  diasPlazo: number
  movimientoIds: string[] // IDs de movimientos_metodo_cobro creados
  descripcion: string
}

interface PrestamoModalProps {
  isOpen: boolean
  onClose: () => void
  sesionCajaId: string
  tasaActual: number
  /** Nombre del cliente actual en el POS (solo display) */
  clienteNombre?: string
  /** Callback cuando el prestamo es aplicado exitosamente */
  onAplicado?: (prestamo: PrestamoAplicado) => void
}

// ─── Constantes por defecto (en el futuro vendran de configuracion) ──

const DEFAULT_DIAS_PLAZO = 30
const DEFAULT_PORCENTAJE_INTERES = 5

// ─── Form ─────────────────────────────────────────────────────

function FormPrestamo({
  onClose,
  sesionCajaId,
  tasaActual,
  clienteNombre,
  onAplicado,
}: {
  onClose: () => void
  sesionCajaId: string
  tasaActual: number
  clienteNombre?: string
  onAplicado?: (prestamo: PrestamoAplicado) => void
}) {
  const { user } = useCurrentUser()
  const { metodos, isLoading: loadingMetodos } = useMetodosPagoActivos()
  const { isOwner, hasPermission } = usePermissions()

  // Montos del prestamo
  const [montoUsd, setMontoUsd] = useState('')
  const [montoBs, setMontoBs] = useState('')

  // Condiciones del prestamo
  const [porcentajeInteres, setPorcentajeInteres] = useState(String(DEFAULT_PORCENTAJE_INTERES))
  const [diasPlazo, setDiasPlazo] = useState(String(DEFAULT_DIAS_PLAZO))

  const [concepto, setConcepto] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Solo pueden modificar dias quienes tengan permiso
  const puedeModificarDias = isOwner || hasPermission(PERMISSIONS.CAJA_MOV_MANUAL)

  // Metodos de efectivo disponibles
  const efectivoUsd = metodos.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'USD')
  const efectivoBs = metodos.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'BS')

  const usd = parseFloat(montoUsd) || 0
  const bs = parseFloat(montoBs) || 0
  const interesPct = parseFloat(porcentajeInteres) || 0
  const dias = parseInt(diasPlazo) || DEFAULT_DIAS_PLAZO

  // Calculos
  const bsEnUsd = tasaActual > 0 ? Number((bs / tasaActual).toFixed(2)) : 0
  const prestamoTotalUsd = Number((usd + bsEnUsd).toFixed(2))
  const interesUsd = Number((prestamoTotalUsd * interesPct / 100).toFixed(2))
  const totalDeudaUsd = Number((prestamoTotalUsd + interesUsd).toFixed(2))
  const totalDeudaBs = usdToBs(totalDeudaUsd, tasaActual)

  function reset() {
    setMontoUsd('')
    setMontoBs('')
    setPorcentajeInteres(String(DEFAULT_PORCENTAJE_INTERES))
    setDiasPlazo(String(DEFAULT_DIAS_PLAZO))
    setConcepto('')
    setErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}

    if (usd <= 0 && bs <= 0) {
      newErrors.general = 'Ingresa al menos un monto de prestamo mayor a 0'
    }
    if (interesPct < 0 || interesPct > 100) {
      newErrors.interes = 'El interes debe estar entre 0 y 100'
    }
    if (dias < 1 || dias > 3650) {
      newErrors.dias = 'El plazo debe estar entre 1 y 3650 dias'
    }
    if (!concepto.trim() || concepto.trim().length < 3) {
      newErrors.concepto = 'El concepto debe tener al menos 3 caracteres'
    }
    if (usd > 0 && !efectivoUsd) {
      newErrors.general = (newErrors.general ? newErrors.general + '. ' : '') +
        'No hay un metodo EFECTIVO en USD configurado'
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

    const conceptoFinal = concepto.trim() ||
      `Prestamo${clienteNombre ? ` - ${clienteNombre}` : ''} - ${dias} dias`

    setSubmitting(true)
    try {
      const movimientoIds = await createMovimientoManualMulti({
        entradas,
        origen: 'PRESTAMO',
        concepto: conceptoFinal,
        sesion_caja_id: sesionCajaId,
        empresa_id: user.empresa_id!,
        usuario_id: user.id,
      })

      toast.success(
        `Prestamo registrado. Deuda: ${formatUsd(totalDeudaUsd)} en ${dias} dias`
      )

      onAplicado?.({
        montoPrestamoUsd: usd,
        montoPrestamoBs: bs,
        interesUsd,
        totalDeudaUsd,
        diasPlazo: dias,
        movimientoIds,
        descripcion: conceptoFinal,
      })

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

      {/* Cliente */}
      {clienteNombre && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
          Cliente: <span className="font-medium">{clienteNombre}</span>
        </div>
      )}

      {/* Monto del prestamo */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">
          Monto del prestamo (de la caja)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-lg border p-3 space-y-1 ${!efectivoUsd && !loadingMetodos ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">USD</label>
              {efectivoUsd && (
                <span className="text-xs text-muted-foreground">
                  Disp: {formatUsd(parseFloat(efectivoUsd.saldo_actual || '0'))}
                </span>
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
              className="no-spinner w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
            />
            {!efectivoUsd && !loadingMetodos && (
              <p className="text-xs text-amber-600">No configurado</p>
            )}
          </div>

          <div className={`rounded-lg border p-3 space-y-1 ${!efectivoBs && !loadingMetodos ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Bs</label>
              {efectivoBs && (
                <span className="text-xs text-muted-foreground">
                  Disp: {formatBs(parseFloat(efectivoBs.saldo_actual || '0'))}
                </span>
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
              className="no-spinner w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
            />
            {!efectivoBs && !loadingMetodos && (
              <p className="text-xs text-amber-600">No configurado</p>
            )}
          </div>
        </div>
      </div>

      {/* Condiciones */}
      <div className="grid grid-cols-2 gap-3">
        {/* Interes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Interes (%)
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="100"
              value={porcentajeInteres}
              onChange={(e) => setPorcentajeInteres(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className={`no-spinner w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.interes ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            <span className="text-sm text-gray-500">%</span>
          </div>
          {errors.interes && <p className="text-red-500 text-xs mt-1">{errors.interes}</p>}
        </div>

        {/* Dias plazo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Plazo (dias)
          </label>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            max="3650"
            value={diasPlazo}
            onChange={(e) => setDiasPlazo(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            disabled={!puedeModificarDias}
            className={`no-spinner w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed ${
              errors.dias ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.dias && <p className="text-red-500 text-xs mt-1">{errors.dias}</p>}
          {!puedeModificarDias && (
            <p className="text-xs text-gray-400 mt-1">Solo supervisores pueden modificar el plazo</p>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Info size={12} />
        Los valores por defecto se configuraran desde Configuracion &gt; POS
      </p>

      {/* Resumen de la deuda */}
      {prestamoTotalUsd > 0 && (
        <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 space-y-1.5 text-sm">
          <p className="font-medium text-purple-900">Resumen del prestamo</p>
          <div className="flex justify-between text-purple-800">
            <span>Monto prestado</span>
            <span>{formatUsd(prestamoTotalUsd)}</span>
          </div>
          {interesPct > 0 && (
            <div className="flex justify-between text-purple-800">
              <span>Interes ({interesPct}%)</span>
              <span>{formatUsd(interesUsd)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-purple-900 border-t border-purple-200 pt-1.5">
            <span>Total a devolver</span>
            <span>{formatUsd(totalDeudaUsd)} / {formatBs(totalDeudaBs)}</span>
          </div>
          <div className="flex justify-between text-xs text-purple-700">
            <span>Plazo</span>
            <span>{dias} dias</span>
          </div>
        </div>
      )}

      {/* Concepto */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Concepto / Descripcion
        </label>
        <textarea
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder={`Prestamo${clienteNombre ? ` - ${clienteNombre}` : ''} - ${dias} dias...`}
          rows={2}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
            errors.concepto ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.concepto && <p className="text-red-500 text-xs mt-1">{errors.concepto}</p>}
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
          disabled={submitting || (usd <= 0 && bs <= 0)}
          className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors disabled:opacity-50"
        >
          {submitting ? 'Registrando...' : 'Registrar Prestamo'}
        </button>
      </div>
    </form>
  )
}

// ─── Dialog wrapper ───────────────────────────────────────────

export function PrestamoModal({
  isOpen,
  onClose,
  sesionCajaId,
  tasaActual,
  clienteNombre,
  onAplicado,
}: PrestamoModalProps) {
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

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <Handshake size={18} className="text-purple-600" />
          <h2 className="text-lg font-semibold">Prestamo</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Entrega de efectivo en condicion de credito (con interes y plazo)
        </p>
        <FormPrestamo
          onClose={onClose}
          sesionCajaId={sesionCajaId}
          tasaActual={tasaActual}
          clienteNombre={clienteNombre}
          onAplicado={onAplicado}
        />
      </div>
    </dialog>
  )
}
