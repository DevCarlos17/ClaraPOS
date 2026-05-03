import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Handshake, Info, CashRegister, Vault, Bank } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'

// ─── Types ────────────────────────────────────────────────────

export type OrigenFondos = 'CAJA' | 'EFECTIVO_EMPRESA' | 'BANCO'

// ─── Props ────────────────────────────────────────────────────

export interface PrestamoAplicado {
  montoPrestamoUsd: number
  montoPrestamoBs: number
  interesUsd: number
  totalDeudaUsd: number
  diasPlazo: number
  movimientoIds: string[] // siempre [] - egresos se crean al confirmar la factura
  descripcion: string
  origenFondosTipo: OrigenFondos
  // Datos raw para crear los egresos de caja al finalizar la factura
  egresosCaja: Array<{ metodo_cobro_id: string; monto: number }>
}

interface PrestamoModalProps {
  isOpen: boolean
  onClose: () => void
  sesionCajaId?: string
  tasaActual: number
  /** Nombre del cliente actual en el POS (solo display) */
  clienteNombre?: string
  /** Callback cuando el prestamo es aplicado exitosamente */
  onAplicado?: (prestamo: PrestamoAplicado) => void
  /** Egresos de caja ya comprometidos en esta factura (aun no debitados) */
  pendingCajaUsd?: number
  pendingCajaBs?: number
}

// ─── Constantes por defecto (en el futuro vendran de configuracion) ──

const DEFAULT_DIAS_PLAZO = 30
const DEFAULT_PORCENTAJE_INTERES = 5

// ─── Form ─────────────────────────────────────────────────────

function FormPrestamo({
  onClose,
  sesionCajaId: _sesionCajaId,
  tasaActual,
  clienteNombre,
  onAplicado,
  pendingCajaUsd = 0,
  pendingCajaBs = 0,
}: {
  onClose: () => void
  sesionCajaId?: string
  tasaActual: number
  clienteNombre?: string
  onAplicado?: (prestamo: PrestamoAplicado) => void
  pendingCajaUsd?: number
  pendingCajaBs?: number
}) {
  const { metodos, isLoading: loadingMetodos } = useMetodosPagoActivos()
  const { isOwner, hasPermission } = usePermissions()

  // Origen de fondos
  const [origenFondos, setOrigenFondos] = useState<OrigenFondos>('CAJA')

  // Montos del prestamo
  const [montoUsd, setMontoUsd] = useState('')
  const [montoBs, setMontoBs] = useState('')

  // Condiciones del prestamo
  const [porcentajeInteres, setPorcentajeInteres] = useState(String(DEFAULT_PORCENTAJE_INTERES))
  const [diasPlazo, setDiasPlazo] = useState(String(DEFAULT_DIAS_PLAZO))

  const [concepto, setConcepto] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const submitting = false

  // Solo pueden modificar dias quienes tengan permiso
  const puedeModificarDias = isOwner || hasPermission(PERMISSIONS.CAJA_MOV_MANUAL)

  // Metodos de efectivo disponibles
  const efectivoUsd = metodos.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'USD')
  const efectivoBs = metodos.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'BS')

  // Saldo disponible real = saldo_actual - egresos pendientes en esta factura
  const dispUsd = Math.max(0, parseFloat(efectivoUsd?.saldo_actual || '0') - pendingCajaUsd)
  const dispBs = Math.max(0, parseFloat(efectivoBs?.saldo_actual || '0') - pendingCajaBs)

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
    setOrigenFondos('CAJA')
    setMontoUsd('')
    setMontoBs('')
    setPorcentajeInteres(String(DEFAULT_PORCENTAJE_INTERES))
    setDiasPlazo(String(DEFAULT_DIAS_PLAZO))
    setConcepto('')
    setErrors({})
  }

  function handleSubmit(e: React.FormEvent) {
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
    if (origenFondos === 'CAJA') {
      if (usd > 0) {
        if (!efectivoUsd) {
          newErrors.general = (newErrors.general ? newErrors.general + '. ' : '') +
            'No hay un metodo EFECTIVO en USD configurado'
        } else if (usd > dispUsd + 0.01) {
          newErrors.general = (newErrors.general ? newErrors.general + '. ' : '') +
            `Saldo insuficiente en USD. Disponible: ${formatUsd(dispUsd)}`
        }
      }
      if (bs > 0) {
        if (!efectivoBs) {
          newErrors.general = (newErrors.general ? newErrors.general + '. ' : '') +
            'No hay un metodo EFECTIVO en Bs configurado'
        } else if (bs > dispBs + 0.01) {
          newErrors.general = (newErrors.general ? newErrors.general + '. ' : '') +
            `Saldo insuficiente en Bs. Disponible: ${formatBs(dispBs)}`
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    const conceptoFinal = concepto.trim() ||
      `Prestamo${clienteNombre ? ` - ${clienteNombre}` : ''} - ${dias} dias`

    const egresosCaja: Array<{ metodo_cobro_id: string; monto: number }> = []
    if (origenFondos === 'CAJA') {
      if (usd > 0 && efectivoUsd) egresosCaja.push({ metodo_cobro_id: efectivoUsd.id, monto: usd })
      if (bs > 0 && efectivoBs) egresosCaja.push({ metodo_cobro_id: efectivoBs.id, monto: bs })
    }

    toast.success(
      `Prestamo agregado a la factura. Deuda: ${formatUsd(totalDeudaUsd)} en ${dias} dias`
    )

    onAplicado?.({
      montoPrestamoUsd: usd,
      montoPrestamoBs: bs,
      interesUsd,
      totalDeudaUsd,
      diasPlazo: dias,
      movimientoIds: [],
      descripcion: conceptoFinal,
      origenFondosTipo: origenFondos,
      egresosCaja,
    })

    reset()
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Cliente */}
      {clienteNombre && (
        <div className="rounded-xl bg-muted/60 border px-3 py-2 text-sm flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Cliente</span>
          <span className="font-medium text-foreground">{clienteNombre}</span>
        </div>
      )}

      {/* Origen de fondos */}
      <div>
        <p className="text-sm font-medium mb-2">Origen de los fondos</p>
        <div className="flex rounded-xl border bg-muted/30 overflow-hidden text-xs p-0.5 gap-0.5">
          {([
            { key: 'CAJA' as OrigenFondos, label: 'Caja', Icon: CashRegister },
            { key: 'EFECTIVO_EMPRESA' as OrigenFondos, label: 'Efectivo empresa', Icon: Vault },
            { key: 'BANCO' as OrigenFondos, label: 'Banco', Icon: Bank },
          ] as const).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setOrigenFondos(key)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 py-1.5 font-medium transition-colors rounded-lg ${
                origenFondos === key
                  ? 'text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {origenFondos === key && (
                <motion.div
                  layoutId="prestamo-tab-pill"
                  className="absolute inset-0 bg-purple-600 rounded-lg shadow-sm"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon size={13} weight={origenFondos === key ? 'fill' : 'regular'} />
                {label}
              </span>
            </button>
          ))}
        </div>
        {origenFondos !== 'CAJA' && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-xl px-3 py-2">
            Los fondos no se descontaran de la caja activa. El modulo bancario esta pendiente de implementacion.
          </p>
        )}
      </div>

      {/* Monto del prestamo */}
      <div>
        <p className="text-sm font-medium mb-2">
          {origenFondos === 'CAJA' ? 'Monto del prestamo (de la caja)' : 'Monto del prestamo'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-xl border bg-muted/20 p-3 space-y-1 transition-opacity ${origenFondos === 'CAJA' && !efectivoUsd && !loadingMetodos ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">USD</label>
              {origenFondos === 'CAJA' && efectivoUsd && (
                <span className="text-xs text-muted-foreground">
                  Disp: {formatUsd(dispUsd)}
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
              disabled={origenFondos === 'CAJA' && (!efectivoUsd || loadingMetodos)}
              className="no-spinner w-full rounded-lg border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {origenFondos === 'CAJA' && !efectivoUsd && !loadingMetodos && (
              <p className="text-xs text-amber-600">No configurado</p>
            )}
          </div>

          <div className={`rounded-xl border bg-muted/20 p-3 space-y-1 transition-opacity ${origenFondos === 'CAJA' && !efectivoBs && !loadingMetodos ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Bs</label>
              {origenFondos === 'CAJA' && efectivoBs && (
                <span className="text-xs text-muted-foreground">
                  Disp: {formatBs(dispBs)}
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
              disabled={origenFondos === 'CAJA' && (!efectivoBs || loadingMetodos)}
              className="no-spinner w-full rounded-lg border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {origenFondos === 'CAJA' && !efectivoBs && !loadingMetodos && (
              <p className="text-xs text-amber-600">No configurado</p>
            )}
          </div>
        </div>
      </div>

      {/* Condiciones */}
      <div className="grid grid-cols-2 gap-3">
        {/* Interes */}
        <div>
          <label className="block text-sm font-medium mb-1">
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
              className={`no-spinner w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
                errors.interes ? 'border-destructive' : ''
              }`}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          {errors.interes && <p className="text-destructive text-xs mt-1">{errors.interes}</p>}
        </div>

        {/* Dias plazo */}
        <div>
          <label className="block text-sm font-medium mb-1">
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
            className={`no-spinner w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed ${
              errors.dias ? 'border-destructive' : ''
            }`}
          />
          {errors.dias && <p className="text-destructive text-xs mt-1">{errors.dias}</p>}
          {!puedeModificarDias && (
            <p className="text-xs text-muted-foreground mt-1">Solo supervisores pueden modificar el plazo</p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Info size={12} />
        Los valores por defecto se configuraran desde Configuracion &gt; POS
      </p>

      {/* Resumen de la deuda */}
      {prestamoTotalUsd > 0 && (
        <div className="rounded-xl bg-purple-50/80 border border-purple-200/60 p-3.5 space-y-1.5 text-sm">
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
        <label className="block text-sm font-medium mb-1">
          Concepto / Descripcion
        </label>
        <textarea
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder={`Prestamo${clienteNombre ? ` - ${clienteNombre}` : ''} - ${dias} dias...`}
          rows={2}
          className={`w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none ${
            errors.concepto ? 'border-destructive' : ''
          }`}
        />
        {errors.concepto && <p className="text-destructive text-xs mt-1">{errors.concepto}</p>}
      </div>

      {errors.general && (
        <p className="rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center p-2.5">{errors.general}</p>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={submitting || (usd <= 0 && bs <= 0)}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          {submitting ? 'Registrando...' : 'Registrar Prestamo'}
        </Button>
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
  pendingCajaUsd,
  pendingCajaBs,
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
      className="backdrop:bg-black/60 backdrop:backdrop-blur-sm rounded-2xl p-0 w-full max-w-md shadow-2xl m-auto border-0 outline-none"
    >
      {/* iOS-style colored header */}
      <div className="bg-gradient-to-br from-purple-500/15 to-purple-400/5 px-6 pt-5 pb-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/15">
            <Handshake size={18} className="text-purple-600" weight="fill" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Prestamo</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Credito con interes y plazo de devolucion
            </p>
          </div>
        </div>
      </div>
      {/* Form body */}
      <div className="p-5">
        <FormPrestamo
          onClose={onClose}
          sesionCajaId={sesionCajaId}
          tasaActual={tasaActual}
          clienteNombre={clienteNombre}
          onAplicado={onAplicado}
          pendingCajaUsd={pendingCajaUsd}
          pendingCajaBs={pendingCajaBs}
        />
      </div>
    </dialog>
  )
}
