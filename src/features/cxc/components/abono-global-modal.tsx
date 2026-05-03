import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@powersync/react'
import { X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { formatUsd, formatBs, usdToBs, bsToUsd } from '@/lib/currency'
import {
  registrarAbonoGlobal,
  registrarAbonoPrestamo,
  useFacturasPendientes,
} from '../hooks/use-cxc'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { db } from '@/core/db/powersync/db'
import { todayStr } from '@/lib/dates'
import { NativeSelect } from '@/components/ui/native-select'

interface PrestamoPendiente {
  id: string
  saldo_pendiente_usd: string
  monto_original_usd: string
  fecha_vencimiento: string
  nro_cuota: number
  nro_factura: string | null
}

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

  // Préstamos pendientes del cliente
  const empresaId = user?.empresa_id ?? ''
  const { data: prestamosData } = useQuery(
    `SELECT vc.id, vc.saldo_pendiente_usd, vc.monto_original_usd,
            vc.fecha_vencimiento, vc.nro_cuota, v.nro_factura
     FROM vencimientos_cobrar vc
     LEFT JOIN ventas v ON vc.venta_id = v.id
     WHERE vc.empresa_id = ? AND vc.cliente_id = ? AND vc.status = 'PENDIENTE'
     ORDER BY vc.fecha_vencimiento ASC`,
    [empresaId, isOpen ? clienteId : '']
  )
  const prestamosActivos = (prestamosData ?? []) as PrestamoPendiente[]

  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [referencia, setReferencia] = useState('')
  const [fechaPago, setFechaPago] = useState(() => todayStr())
  const [tasaFecha, setTasaFecha] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  // Estado para sección de préstamo
  const [incluirPrestamo, setIncluirPrestamo] = useState(false)
  const [prestamoIdSeleccionado, setPrestamoIdSeleccionado] = useState('')
  const [montoPrestamoStr, setMontoPrestamoStr] = useState('')

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
      setIncluirPrestamo(false)
      setPrestamoIdSeleccionado('')
      setMontoPrestamoStr('')
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  // Auto-seleccionar préstamo cuando solo hay uno y se activa la sección
  useEffect(() => {
    if (incluirPrestamo && prestamosActivos.length === 1 && !prestamoIdSeleccionado) {
      setPrestamoIdSeleccionado(prestamosActivos[0].id)
    }
  }, [incluirPrestamo, prestamosActivos, prestamoIdSeleccionado])

  const metodoSeleccionado = metodos.find((m) => m.id === metodoPagoId)
  const moneda = metodoSeleccionado?.moneda ?? 'USD'
  const monto = parseFloat(montoStr) || 0

  // Tasa efectiva: la de la fecha del abono (historica si es pasada), con fallback a la actual
  const tasaEfectiva = tasaFecha || tasaValor

  const montoUsd = moneda === 'BS' ? bsToUsd(monto, tasaEfectiva) : monto
  const montoBs = moneda === 'USD' ? usdToBs(monto, tasaEfectiva) : monto

  const montoPrestamo = parseFloat(montoPrestamoStr) || 0
  const montoPrestamoUsd = moneda === 'BS' ? bsToUsd(montoPrestamo, tasaEfectiva) : montoPrestamo
  const prestamoSeleccionado = prestamosActivos.find((p) => p.id === prestamoIdSeleccionado) ?? null

  const excedeSaldoPrestamo =
    prestamoSeleccionado !== null &&
    montoPrestamoUsd > parseFloat(prestamoSeleccionado.saldo_pendiente_usd) + 0.01

  const tieneAbonoFactura = monto > 0
  const tieneAbonoPrestamo =
    incluirPrestamo && !!prestamoIdSeleccionado && montoPrestamo > 0 && !excedeSaldoPrestamo

  const canSubmit =
    !!metodoPagoId &&
    tasaEfectiva > 0 &&
    !submitting &&
    (tieneAbonoFactura || tieneAbonoPrestamo)

  // Simulacion FIFO para preview (solo relevante cuando hay abono a facturas)
  const fifoPreview = (() => {
    if (montoUsd <= 0) return []
    let restante = montoUsd
    const result: { nro_factura: string; saldo: number; aplicar: number }[] = []
    for (const f of facturas) {
      if (restante <= 0.01) break
      const saldo = parseFloat(f.saldo_pend_usd)
      const aplicar = Math.min(saldo, restante)
      result.push({ nro_factura: f.nro_factura, saldo, aplicar })
      restante = Number((restante - aplicar).toFixed(2))
    }
    if (restante > 0.01) {
      result.push({ nro_factura: 'ANTICIPO', saldo: 0, aplicar: restante })
    }
    return result
  })()

  const handlePayMax = () => {
    if (moneda === 'BS') {
      setMontoStr(usdToBs(saldoActual, tasaEfectiva).toFixed(2))
    } else {
      setMontoStr(saldoActual.toFixed(2))
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return

    setSubmitting(true)
    try {
      const mensajes: string[] = []

      // 1. Abono global a facturas (FIFO)
      if (tieneAbonoFactura) {
        const result = await registrarAbonoGlobal({
          cliente_id: clienteId,
          metodo_cobro_id: metodoPagoId,
          moneda: moneda as 'USD' | 'BS',
          tasa: tasaEfectiva,
          monto,
          referencia: referencia.trim() || undefined,
          empresa_id: user!.empresa_id!,
          procesado_por: user!.id,
          procesado_por_nombre: user!.nombre,
        })
        mensajes.push(
          `${formatUsd(result.montoAplicado)} a ${result.facturasAfectadas} factura(s)`
        )
      }

      // 2. Abono al préstamo seleccionado
      if (tieneAbonoPrestamo) {
        await registrarAbonoPrestamo({
          vencimiento_id: prestamoIdSeleccionado,
          metodo_cobro_id: metodoPagoId,
          moneda: moneda as 'USD' | 'BS',
          tasa: tasaEfectiva,
          monto: montoPrestamo,
          fechaPago,
          referencia: referencia.trim() || undefined,
          empresa_id: user!.empresa_id!,
          procesado_por: user!.id,
          procesado_por_nombre: user!.nombre,
        })
        mensajes.push(`${formatUsd(montoPrestamoUsd)} al préstamo`)
      }

      toast.success(mensajes.join(' + '))
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

  const submitLabel = (() => {
    if (submitting) return 'Registrando...'
    if (tieneAbonoFactura && tieneAbonoPrestamo) return 'Abonar facturas y préstamo'
    if (tieneAbonoPrestamo) return `Abonar préstamo ${formatUsd(montoPrestamoUsd)}`
    return `Abonar ${formatUsd(montoUsd)}`
  })()

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
            <span className="text-muted-foreground">Deuda total (facturas)</span>
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
          {prestamosActivos.length > 0 && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Préstamos pendientes</span>
              <span className="font-medium text-amber-700">{prestamosActivos.length}</span>
            </div>
          )}
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
          </div>

          {/* Monto facturas */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                {incluirPrestamo ? `Monto facturas (${moneda})` : `Monto (${moneda})`}
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
              min="0"
              value={montoStr}
              onChange={(e) => setMontoStr(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
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

        {/* Sección préstamos */}
        {prestamosActivos.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={incluirPrestamo}
                onChange={(e) => {
                  setIncluirPrestamo(e.target.checked)
                  if (!e.target.checked) {
                    setPrestamoIdSeleccionado('')
                    setMontoPrestamoStr('')
                  }
                }}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm font-medium text-amber-800">
                ¿Incluir pago a préstamo? ({prestamosActivos.length} pendiente
                {prestamosActivos.length !== 1 ? 's' : ''})
              </span>
            </label>

            {incluirPrestamo && (
              <div className="mt-3 space-y-2 border-t border-amber-200/60 pt-3">
                {/* Selector solo si hay más de un préstamo */}
                {prestamosActivos.length > 1 && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Préstamo</label>
                    <NativeSelect
                      value={prestamoIdSeleccionado}
                      onChange={(e) => {
                        setPrestamoIdSeleccionado(e.target.value)
                        setMontoPrestamoStr('')
                      }}
                      wrapperClassName="mt-1"
                    >
                      <option value="">Seleccionar préstamo...</option>
                      {prestamosActivos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nro_factura
                            ? `Fact. #${p.nro_factura}`
                            : `Cuota ${p.nro_cuota}`}{' '}
                          — Saldo: ${parseFloat(p.saldo_pendiente_usd).toFixed(2)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                )}

                {/* Monto del préstamo */}
                {prestamoSeleccionado && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">
                        Monto préstamo ({moneda})
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const saldo = parseFloat(prestamoSeleccionado.saldo_pendiente_usd)
                          setMontoPrestamoStr(
                            moneda === 'BS'
                              ? usdToBs(saldo, tasaEfectiva).toFixed(2)
                              : saldo.toFixed(2)
                          )
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        Pagar saldo total
                      </button>
                    </div>
                    <p className="text-xs text-amber-700 mt-1 mb-1.5">
                      Saldo: {formatUsd(parseFloat(prestamoSeleccionado.saldo_pendiente_usd))}
                      {prestamoSeleccionado.nro_factura
                        ? ` · Factura #${prestamoSeleccionado.nro_factura}`
                        : ' · Préstamo sin factura'}
                    </p>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={montoPrestamoStr}
                      onChange={(e) => setMontoPrestamoStr(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    {montoPrestamo > 0 && tasaEfectiva > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {moneda === 'USD'
                          ? `Equivale a ${formatBs(usdToBs(montoPrestamo, tasaEfectiva))}`
                          : `Equivale a ${formatUsd(bsToUsd(montoPrestamo, tasaEfectiva))}`}
                      </p>
                    )}
                    {excedeSaldoPrestamo && (
                      <p className="text-xs text-red-600 mt-1">
                        El monto excede el saldo del préstamo (
                        {formatUsd(parseFloat(prestamoSeleccionado.saldo_pendiente_usd))})
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Preview FIFO */}
        {fifoPreview.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Distribucion del pago (FIFO)
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
                        {p.saldo > 0 ? formatUsd(p.saldo) : '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium text-green-600">
                        {formatUsd(p.aplicar)}
                      </td>
                    </tr>
                  ))}
                </tbody>
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
            {submitLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
