import { useState, useRef, useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { formatUsd, formatBs, usdToBs, bsToUsd } from '@/lib/currency'
import {
  registrarAbonoGlobal,
  registrarDiscrepanciaCxC,
  useFacturasPendientes,
} from '../hooks/use-cxc'
import { useSaldoAFavor } from '@/core/hooks/use-saldo-a-favor'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { db } from '@/core/db/powersync/db'
import { todayStr } from '@/lib/dates'
import { NativeSelect } from '@/components/ui/native-select'

type ExcessMode = 'ANTICIPO' | 'VUELTO' | 'PROPINA'

interface AbonoGlobalModalProps {
  isOpen: boolean
  onClose: () => void
  clienteId: string
  clienteNombre: string
  saldoActual: number
  onSuccess: () => void
}

export function AbonoGlobalModal({
  isOpen,
  onClose,
  clienteId,
  clienteNombre,
  saldoActual,
  onSuccess,
}: AbonoGlobalModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { tasaValor } = useTasaActual()
  const { user } = useCurrentUser()
  const { metodos } = useMetodosPagoActivos()
  const { facturas } = useFacturasPendientes(isOpen ? clienteId : null)
  const { disponible: safDisponible, tieneSaf } = useSaldoAFavor(isOpen ? clienteId : null)

  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [referencia, setReferencia] = useState('')
  const [fechaPago, setFechaPago] = useState(() => todayStr())
  const [tasaFecha, setTasaFecha] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [excessMode, setExcessMode] = useState<ExcessMode>('ANTICIPO')

  // Manual SAF state
  const [usarSaf, setUsarSaf] = useState(false)
  const [montoSafStr, setMontoSafStr] = useState('')

  // Buscar tasa BCV correspondiente a la fecha del abono
  useEffect(() => {
    if (!user?.empresa_id || !fechaPago) return
    db.execute(
      'SELECT valor FROM tasas_cambio WHERE empresa_id = ? AND DATE(fecha) <= ? ORDER BY fecha DESC, created_at DESC LIMIT 1',
      [user.empresa_id, fechaPago]
    ).then((res) => {
      const row = res.rows?.item(0) as { valor: string } | undefined
      setTasaFecha(row ? parseFloat(row.valor) : 0)
    }).catch(() => setTasaFecha(0))
  }, [fechaPago, user?.empresa_id])

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      setMetodoPagoId('')
      setMontoStr('')
      setReferencia('')
      setFechaPago(todayStr())
      setExcessMode('ANTICIPO')
      setUsarSaf(false)
      setMontoSafStr('')
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  const metodoSeleccionado = metodos.find((m) => m.id === metodoPagoId)
  const moneda = metodoSeleccionado?.moneda ?? 'USD'
  const monto = parseFloat(montoStr) || 0

  // Tasa efectiva: la de la fecha del abono (historica si es pasada), con fallback a la actual
  const tasaEfectiva = tasaFecha || tasaValor

  const montoUsd = moneda === 'BS' ? bsToUsd(monto, tasaEfectiva).toNumber() : monto
  const montoBs = moneda === 'USD' ? usdToBs(monto, tasaEfectiva).toNumber() : monto

  // SAF manual calculations
  const montoSafNum = usarSaf ? (parseFloat(montoSafStr) || 0) : 0
  const maxSaf = Math.min(safDisponible, saldoActual)
  // Effective debt after SAF reduction
  const saldoConSaf = Math.max(0, Number((saldoActual - montoSafNum).toFixed(2)))

  // Overpayment: cuando el monto supera la deuda total (descontando SAF)
  const estaOverpago = saldoConSaf > 0 && montoUsd > saldoConSaf + 0.01
  const excedenteUsd = estaOverpago ? Number((montoUsd - saldoConSaf).toFixed(2)) : 0

  // Deteccion de efectivo para aviso
  const esEfectivo =
    !!metodoSeleccionado &&
    (metodoSeleccionado.nombre.toLowerCase().includes('efectivo') ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (metodoSeleccionado as any).tipo === 'EFECTIVO')

  const safCubreTodo = usarSaf && montoSafNum >= saldoActual - 0.001
  const canSubmit =
    (safCubreTodo || (!!metodoPagoId && monto > 0)) &&
    tasaEfectiva > 0 &&
    !submitting &&
    (!usarSaf || montoSafNum > 0)

  // Preview FIFO — para VUELTO/PROPINA solo muestra las facturas (sin fila Anticipo)
  // Los montos se muestran en la moneda del método seleccionado
  const fifoPreview = (() => {
    const totalParaFifo = montoUsd + montoSafNum
    if (totalParaFifo <= 0) return []
    // Para VUELTO/PROPINA el abono se limita a la deuda total
    const montoEfectivo = (estaOverpago && excessMode !== 'ANTICIPO') ? saldoConSaf : (montoUsd + montoSafNum)
    let restante = montoEfectivo
    const result: { nro_factura: string; saldo: number; aplicar: number }[] = []
    for (const f of facturas) {
      if (restante <= 1e-8) break  // same epsilon as registrarAbonoGlobal
      const saldo = parseFloat(f.saldo_pend_usd)
      const aplicar = Math.min(saldo, restante)
      result.push({ nro_factura: f.nro_factura, saldo, aplicar })
      restante = Number((restante - aplicar).toFixed(2))
    }
    // Solo mostrar fila Anticipo cuando el modo es ANTICIPO
    if (restante > 0.01 && excessMode === 'ANTICIPO') {
      result.push({ nro_factura: 'ANTICIPO', saldo: 0, aplicar: restante })
    }
    return result
  })()

  const handlePayMax = () => {
    if (moneda === 'BS') {
      setMontoStr(usdToBs(saldoConSaf, tasaEfectiva).toFixed(2))
    } else {
      setMontoStr(saldoConSaf.toFixed(2))
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return

    setSubmitting(true)
    try {
      const safFifoRefs = fifoPreview
        .filter((f) => f.nro_factura !== 'ANTICIPO')
        .map((f) => f.nro_factura)
      const safParams = usarSaf && montoSafNum > 0
        ? { aplicarSaf: true as const, montoSaf: montoSafNum, safOrigenRefs: safFifoRefs.length > 0 ? safFifoRefs : undefined }
        : {}

      if (estaOverpago && excessMode !== 'ANTICIPO') {
        // VUELTO o PROPINA: abonar solo la deuda exacta y registrar el excedente aparte
        const montoDeuda = moneda === 'BS' ? usdToBs(saldoConSaf, tasaEfectiva).toNumber() : saldoConSaf
        const montoExcedente = moneda === 'BS' ? usdToBs(excedenteUsd, tasaEfectiva).toNumber() : excedenteUsd

        const result = await registrarAbonoGlobal({
          cliente_id: clienteId,
          metodo_cobro_id: metodoPagoId,
          moneda: moneda as 'USD' | 'BS',
          tasa: tasaEfectiva,
          monto: montoDeuda,
          referencia: referencia.trim() || undefined,
          empresa_id: user!.empresa_id!,
          procesado_por: user!.id,
          procesado_por_nombre: user!.nombre,
          ...safParams,
        })

        await registrarDiscrepanciaCxC({
          metodo_cobro_id: metodoPagoId,
          tipo: excessMode as 'VUELTO' | 'PROPINA',
          monto: montoExcedente,
          moneda: moneda as 'USD' | 'BS',
          tasa: tasaEfectiva,
          empresa_id: user!.empresa_id!,
          doc_origen_id: clienteId,
          doc_origen_ref: `ABONO-GLOBAL-${clienteId.slice(0, 8).toUpperCase()}`,
          referencia: referencia.trim() || undefined,
          procesado_por: user!.id,
        })

        const label = excessMode === 'VUELTO' ? 'Vuelto' : 'Propina'
        toast.success(
          `${formatUsd(result.montoAplicado)} aplicado a ${result.facturasAfectadas} factura(s). ${label}: ${formatUsd(excedenteUsd)}`
        )
      } else {
        // Comportamiento normal (incluye ANTICIPO cuando hay excedente o SAF)
        const montoMetodo = safCubreTodo ? 0 : monto
        const result = await registrarAbonoGlobal({
          cliente_id: clienteId,
          metodo_cobro_id: metodoPagoId,
          moneda: moneda as 'USD' | 'BS',
          tasa: tasaEfectiva,
          monto: montoMetodo,
          referencia: referencia.trim() || undefined,
          empresa_id: user!.empresa_id!,
          procesado_por: user!.id,
          procesado_por_nombre: user!.nombre,
          ...safParams,
        })
        toast.success(`${formatUsd(result.montoAplicado)} aplicado a ${result.facturasAfectadas} factura(s)`)
      }

      onSuccess()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al registrar abono')
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-lg shadow-xl"
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Abono Global</h2>
            <p className="text-sm text-muted-foreground">{clienteNombre}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Resumen saldo */}
        <div className="rounded-lg border bg-muted/50 p-3 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Deuda total</span>
            <span className="font-bold text-red-600">{formatUsd(saldoActual)}</span>
          </div>
          {tasaEfectiva > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Equivalente Bs</span>
              <span className="text-muted-foreground">
                {formatBs(usdToBs(saldoActual, tasaEfectiva))}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">Facturas pendientes</span>
            <span className="font-medium">{facturas.length}</span>
          </div>
          {tasaEfectiva > 0 && (
            <div className="flex justify-between text-sm border-t border-border/50 pt-1 mt-1">
              <span className="text-muted-foreground font-medium">
                Tasa {fechaPago === todayStr() ? 'actual' : `al ${fechaPago}`}
              </span>
              <span className="font-semibold tabular-nums">{tasaEfectiva.toFixed(4)} Bs/$</span>
            </div>
          )}
        </div>

        {/* Form */}
        <div className="space-y-3">
          {/* Fecha del abono */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Fecha del abono</label>
            <input
              type="date"
              value={fechaPago}
              onChange={(e) => { setFechaPago(e.target.value); setMontoStr('') }}
              max={todayStr()}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {tasaFecha > 0 && fechaPago !== todayStr() && (
              <p className="text-xs text-muted-foreground mt-1">
                Tasa BCV a esa fecha: <span className="font-medium">{tasaFecha.toFixed(4)}</span>
              </p>
            )}
            {tasaFecha === 0 && fechaPago !== todayStr() && (
              <p className="text-xs text-amber-600 mt-1">
                Sin tasa registrada para esa fecha. Se usara la tasa actual.
              </p>
            )}
          </div>

          {/* Metodo de pago */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Metodo de pago</label>
            <NativeSelect
              value={metodoPagoId}
              onChange={(e) => {
                setMetodoPagoId(e.target.value)
                setMontoStr('')
              }}
              wrapperClassName="mt-1"
            >
              <option value="">Seleccionar...</option>
              {metodos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.moneda})
                </option>
              ))}
            </NativeSelect>
            {/* Aviso efectivo */}
            {esEfectivo && (
              <p className="text-xs text-blue-600 mt-1">
                Cobro en efectivo — no debe ingresar a caja. Si querés registrarlo, usá "Ingreso de efectivo" desde el POS.
              </p>
            )}
          </div>

          {/* Monto */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Monto ({moneda})
              </label>
              <button
                type="button"
                onClick={handlePayMax}
                className="text-xs text-primary hover:underline"
              >
                Pagar deuda total
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={montoStr}
              onChange={(e) => setMontoStr(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {montoStr !== '' && monto === 0 && (
              <p className="text-xs text-destructive mt-1">
                Ingresá un monto válido mayor a 0
              </p>
            )}
            {monto > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {moneda === 'USD'
                  ? `Equivale a ${formatBs(montoBs)} a tasa ${tasaEfectiva.toFixed(4)}`
                  : `Equivale a ${formatUsd(montoUsd)} a tasa ${tasaEfectiva.toFixed(4)}`}
              </p>
            )}
          </div>

          {/* Referencia */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Referencia (opcional)
            </label>
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Nro. transferencia, etc."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Sección SAF manual — visible solo cuando cliente tiene crédito */}
        {tieneSaf && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-800">
                Saldo a favor disponible: {formatUsd(safDisponible)}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-blue-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usarSaf}
                  onChange={(e) => {
                    setUsarSaf(e.target.checked)
                    if (!e.target.checked) setMontoSafStr('')
                    else setMontoSafStr(Math.min(safDisponible, saldoActual).toFixed(2))
                  }}
                  className="rounded border-blue-300"
                />
                Usar saldo a favor
              </label>
            </div>
            {usarSaf && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-blue-700">Monto SAF a aplicar (USD)</label>
                  <button
                    type="button"
                    onClick={() => setMontoSafStr(maxSaf.toFixed(2))}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Máximo ({formatUsd(maxSaf)})
                  </button>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={maxSaf}
                  value={montoSafStr}
                  onChange={(e) => setMontoSafStr(e.target.value)}
                  placeholder="0.00"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {montoSafNum > 0 && !safCubreTodo && (
                  <p className="text-xs text-blue-600">
                    Resta a cobrar por método: {formatUsd(saldoConSaf)}
                  </p>
                )}
                {safCubreTodo && (
                  <p className="text-xs text-green-600 font-medium">
                    El SAF cubre la deuda completa
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Panel overpayment — solo cuando monto supera deuda total */}
        {estaOverpago && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800">
              Excedente: {formatUsd(excedenteUsd)} — ¿Cómo se gestiona?
            </p>
            <div className="flex gap-2">
              {([
                { mode: 'ANTICIPO' as ExcessMode, label: 'Saldo a favor' },
                { mode: 'VUELTO' as ExcessMode, label: 'Dar vuelto' },
                { mode: 'PROPINA' as ExcessMode, label: 'Propina' },
              ] as const).map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setExcessMode(mode)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium border transition-colors ${
                    excessMode === mode
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {excessMode === 'ANTICIPO' && (
              <p className="text-xs text-amber-700">
                El excedente quedará como crédito en la cuenta del cliente.
              </p>
            )}
            {excessMode === 'VUELTO' && (
              <p className="text-xs text-amber-700">
                Se abona la deuda exacta ({formatUsd(saldoActual)}) y se registra {formatUsd(excedenteUsd)} como vuelto.
              </p>
            )}
            {excessMode === 'PROPINA' && (
              <p className="text-xs text-amber-700">
                Se abona la deuda exacta ({formatUsd(saldoActual)}) y el excedente de {formatUsd(excedenteUsd)} queda a favor del negocio.
              </p>
            )}
          </div>
        )}

        {/* Preview FIFO — montos en la moneda del método seleccionado */}
        {fifoPreview.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Distribucion del pago (FIFO)
              {moneda === 'BS' && tasaEfectiva > 0 && (
                <span className="ml-1 text-muted-foreground/70">— en Bs</span>
              )}
            </p>
            <div className="overflow-x-auto border rounded-lg max-h-40 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0">
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-2 py-1.5 font-medium">Factura</th>
                    <th className="text-right px-2 py-1.5 font-medium">Saldo</th>
                    <th className="text-right px-2 py-1.5 font-medium">Aplicar</th>
                  </tr>
                </thead>
                <tbody>
                  {fifoPreview.map((p) => (
                    <tr key={p.nro_factura} className="border-b border-muted">
                      <td className="px-2 py-1.5 font-mono">
                        {p.nro_factura === 'ANTICIPO' ? (
                          <span className="text-amber-600 font-medium">Anticipo</span>
                        ) : (
                          `#${p.nro_factura}`
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {p.saldo > 0
                          ? moneda === 'BS' && tasaEfectiva > 0
                            ? formatBs(p.saldo * tasaEfectiva)
                            : formatUsd(p.saldo)
                          : '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium text-green-600">
                        {moneda === 'BS' && tasaEfectiva > 0
                          ? formatBs(p.aplicar * tasaEfectiva)
                          : formatUsd(p.aplicar)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td colSpan={2} className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
                      Total abonado
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold text-green-700">
                      {moneda === 'BS' && tasaEfectiva > 0
                        ? formatBs(fifoPreview.reduce((s, p) => s + p.aplicar, 0) * tasaEfectiva)
                        : formatUsd(fifoPreview.reduce((s, p) => s + p.aplicar, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting
              ? 'Registrando...'
              : safCubreTodo
                ? `Aplicar SAF ${formatUsd(montoSafNum)}`
                : estaOverpago && excessMode !== 'ANTICIPO'
                  ? `Abonar ${formatUsd(saldoConSaf)}`
                  : `Abonar ${(montoUsd + montoSafNum) > 0 ? formatUsd(montoUsd + montoSafNum) : ''}`}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
