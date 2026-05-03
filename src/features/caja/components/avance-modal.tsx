import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Wallet, Info, CashRegister, Vault, Bank } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'

// ─── Types ────────────────────────────────────────────────────

export type OrigenFondos = 'CAJA' | 'EFECTIVO_EMPRESA' | 'BANCO'

// ─── Props ────────────────────────────────────────────────────

export interface AvanceAplicado {
  montoAvanceUsd: number
  montoAvanceBs: number
  cargoUsd: number        // fee en USD
  totalCargoUsd: number   // avance convertido a USD + cargo
  movimientoIds: string[] // siempre [] - egresos se crean al confirmar la factura
  descripcion: string
  origenFondosTipo: OrigenFondos
  // Datos raw para crear los egresos de caja al finalizar la factura
  egresosCaja: Array<{ metodo_cobro_id: string; monto: number }>
}

interface AvanceModalProps {
  isOpen: boolean
  onClose: () => void
  sesionCajaId?: string
  tasaActual: number
  /** Nombre del cliente actual en el POS (solo display) */
  clienteNombre?: string
  /** Callback cuando el avance es aplicado exitosamente */
  onAplicado?: (avance: AvanceAplicado) => void
  /** Egresos de caja ya comprometidos en esta factura (aun no debitados) */
  pendingCajaUsd?: number
  pendingCajaBs?: number
}

// ─── Utilidades ───────────────────────────────────────────────

function calcularAvance(
  montoUsd: number,
  montoBs: number,
  tasa: number,
  porcentajeFee: number
): { avanceTotalUsd: number; cargoUsd: number; totalCargoUsd: number } {
  const avanceBsEnUsd = tasa > 0 ? Number((montoBs / tasa).toFixed(2)) : 0
  const avanceTotalUsd = Number((montoUsd + avanceBsEnUsd).toFixed(2))
  const cargoUsd = Number((avanceTotalUsd * porcentajeFee / 100).toFixed(2))
  const totalCargoUsd = Number((avanceTotalUsd + cargoUsd).toFixed(2))
  return { avanceTotalUsd, cargoUsd, totalCargoUsd }
}

// ─── Form ─────────────────────────────────────────────────────

function FormAvance({
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
  onAplicado?: (avance: AvanceAplicado) => void
  pendingCajaUsd?: number
  pendingCajaBs?: number
}) {
  const { metodos, isLoading: loadingMetodos } = useMetodosPagoActivos()

  // Origen de fondos
  const [origenFondos, setOrigenFondos] = useState<OrigenFondos>('CAJA')

  // Montos del avance entregado al cliente
  const [montoUsd, setMontoUsd] = useState('')
  const [montoBs, setMontoBs] = useState('')

  // Porcentaje de cargo (en el futuro vendra de configuracion)
  const [porcentajeFee, setPorcentajeFee] = useState('10')

  const [concepto, setConcepto] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const submitting = false

  // Metodos de efectivo disponibles
  const efectivoUsd = metodos.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'USD')
  const efectivoBs = metodos.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'BS')

  // Saldo disponible real = saldo_actual - egresos pendientes en esta factura
  const dispUsd = Math.max(0, parseFloat(efectivoUsd?.saldo_actual || '0') - pendingCajaUsd)
  const dispBs = Math.max(0, parseFloat(efectivoBs?.saldo_actual || '0') - pendingCajaBs)

  const usd = parseFloat(montoUsd) || 0
  const bs = parseFloat(montoBs) || 0
  const fee = parseFloat(porcentajeFee) || 0

  const { avanceTotalUsd, cargoUsd, totalCargoUsd } = calcularAvance(usd, bs, tasaActual, fee)
  const totalCargoBs = usdToBs(totalCargoUsd, tasaActual)

  function reset() {
    setOrigenFondos('CAJA')
    setMontoUsd('')
    setMontoBs('')
    setPorcentajeFee('10')
    setConcepto('')
    setErrors({})
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}

    if (usd <= 0 && bs <= 0) {
      newErrors.general = 'Ingresa al menos un monto de avance mayor a 0'
    }
    if (fee < 0 || fee > 100) {
      newErrors.fee = 'El porcentaje debe estar entre 0 y 100'
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
      `Avance de efectivo${clienteNombre ? ` - ${clienteNombre}` : ''}`

    const egresosCaja: Array<{ metodo_cobro_id: string; monto: number }> = []
    if (origenFondos === 'CAJA') {
      if (usd > 0 && efectivoUsd) egresosCaja.push({ metodo_cobro_id: efectivoUsd.id, monto: usd })
      if (bs > 0 && efectivoBs) egresosCaja.push({ metodo_cobro_id: efectivoBs.id, monto: bs })
    }

    toast.success(
      `Avance agregado a la factura. Cargo al cliente: ${formatUsd(totalCargoUsd)} (${fee}% recargo)`
    )

    onAplicado?.({
      montoAvanceUsd: usd,
      montoAvanceBs: bs,
      cargoUsd,
      totalCargoUsd,
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
                  layoutId="avance-tab-pill"
                  className="absolute inset-0 bg-amber-500 rounded-lg shadow-sm"
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

      {/* Monto del avance entregado */}
      <div>
        <p className="text-sm font-medium mb-2">
          Efectivo entregado al cliente
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

      {/* Porcentaje de cargo */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Porcentaje de recargo (%)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="100"
            value={porcentajeFee}
            onChange={(e) => setPorcentajeFee(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            className={`no-spinner w-24 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
              errors.fee ? 'border-destructive' : ''
            }`}
          />
          <span className="text-sm text-muted-foreground">%</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Info size={12} />
            Se configurara desde Configuracion &gt; POS
          </span>
        </div>
        {errors.fee && <p className="text-destructive text-xs mt-1">{errors.fee}</p>}
      </div>

      {/* Resumen del cargo al cliente */}
      {avanceTotalUsd > 0 && (
        <div className="rounded-xl bg-amber-50/80 border border-amber-200/60 p-3.5 space-y-1.5 text-sm">
          <p className="font-medium text-amber-900">Cargo al cliente</p>
          <div className="flex justify-between text-amber-800">
            <span>Avance total</span>
            <span>{formatUsd(avanceTotalUsd)}</span>
          </div>
          {fee > 0 && (
            <div className="flex justify-between text-amber-800">
              <span>Recargo ({fee}%)</span>
              <span>{formatUsd(cargoUsd)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-amber-900 border-t border-amber-200 pt-1.5">
            <span>Total a cobrar</span>
            <span>{formatUsd(totalCargoUsd)} / {formatBs(totalCargoBs)}</span>
          </div>
          <p className="text-xs text-amber-700 mt-1">
            Este monto se sumara al total de la factura actual
          </p>
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
          placeholder={`Avance de efectivo${clienteNombre ? ` - ${clienteNombre}` : ''}...`}
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
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          {submitting ? 'Registrando...' : 'Registrar Avance'}
        </Button>
      </div>
    </form>
  )
}

// ─── Dialog wrapper ───────────────────────────────────────────

export function AvanceModal({
  isOpen,
  onClose,
  sesionCajaId,
  tasaActual,
  clienteNombre,
  onAplicado,
  pendingCajaUsd,
  pendingCajaBs,
}: AvanceModalProps) {
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
      <div className="bg-gradient-to-br from-amber-500/15 to-amber-400/5 px-6 pt-5 pb-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/15">
            <Wallet size={18} className="text-amber-600" weight="fill" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Avance de Efectivo</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Efectivo al cliente con recargo en factura
            </p>
          </div>
        </div>
      </div>
      {/* Form body */}
      <div className="p-5">
        <FormAvance
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
