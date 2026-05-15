import { useState, useEffect, useRef } from 'react'
import { Plus, Trash, ShoppingCart, CreditCard } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { formatUsd, formatBs } from '@/lib/currency'
import {
  crearVenta,
  validarStockServidor,
  type VueltoParam,
} from '../hooks/use-ventas'
import type { CargoEspecial } from '../hooks/use-ventas'
import type { LineaVentaForm, PagoEntryForm } from '../schemas/venta-schema'
import type { Cliente } from '@/features/clientes/hooks/use-clientes'
import type { VentaExitosaData } from './venta-exitosa-modal'
import type { PaymentMethod } from '@/features/configuracion/hooks/use-payment-methods'
import { useIgtfConfig } from '@/features/configuracion/hooks/use-igtf-config'

interface CobroModalProps {
  isOpen: boolean
  onClose: () => void
  /** Tasa live del parent; se congela internamente al abrir el modal */
  tasa: number
  /** Total bruto de la factura antes del descuento (en USD) */
  totalBrutoUsd: number
  /** Descuento comercial en Bs que se resta al total */
  descuentoBs: number
  descuentoMotivo: string
  clienteId: string
  clienteNombre: string
  clienteData: Cliente | null
  lineas: LineaVentaForm[]
  cargosEspeciales: CargoEspecial[]
  sesionCajaId: string | null
  usuarioId: string
  empresaId: string
  metodos: PaymentMethod[]
  onSuccess: (data: VentaExitosaData) => void
}

export function CobroModal({
  isOpen,
  onClose,
  tasa,
  totalBrutoUsd,
  descuentoBs,
  descuentoMotivo,
  clienteId,
  clienteNombre,
  clienteData,
  lineas,
  cargosEspeciales,
  sesionCajaId,
  usuarioId,
  empresaId,
  metodos,
  onSuccess,
}: CobroModalProps) {
  const tasaFrozen = useRef<number>(0)

  const [pagos, setPagos] = useState<PagoEntryForm[]>([])
  const [metodoId, setMetodoId] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [referencia, setReferencia] = useState('')
  const [vueltoMetodoId, setVueltoMetodoId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Congelar tasa al abrir el modal; resetear formulario de cobro
  useEffect(() => {
    if (!isOpen) return
    tasaFrozen.current = tasa > 0 ? tasa : 1
    setPagos([])
    setMetodoId('')
    setMontoStr('')
    setReferencia('')
    setVueltoMetodoId('')
    setSubmitting(false)
  // La tasa se congela solo al abrir (se excluye tasa de deps intencionalmente)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const tasaUsada = tasaFrozen.current || tasa || 1

  // ── Calculo de totales (con tasa congelada) ───────────────────────────────
  const totalEfectivoBs = Math.max(0, totalBrutoUsd * tasaUsada - descuentoBs)
  const totalEfectivoUsd = Number((totalEfectivoBs / tasaUsada).toFixed(2))

  // Ancla en Bs (sin doble conversion USD→Bs→USD)
  const totalPagadoBs = pagos.reduce((sum, p) => {
    return sum + (p.moneda === 'BS' ? p.monto : p.monto * tasaUsada)
  }, 0)
  const pendienteBs4 = totalEfectivoBs - totalPagadoBs
  const umbralBs = tasaUsada * 0.01
  const esPagado = pendienteBs4 <= umbralBs
  const esDiferencialRedondeo = pendienteBs4 > 0.001 && pendienteBs4 <= umbralBs
  const tipoDetectado: 'CONTADO' | 'CREDITO' = esPagado ? 'CONTADO' : 'CREDITO'
  const pendienteUsd = Number((Math.max(0, pendienteBs4) / tasaUsada).toFixed(2))

  // ── Vuelto (cliente pago de mas) ──────────────────────────────────────────
  const estaOverpago = pendienteBs4 < -0.01
  const vueltoMontoBs = estaOverpago ? Math.abs(pendienteBs4) : 0
  const selectedVueltoMetodo = metodos.find((m) => m.id === vueltoMetodoId)
  const vueltoMontoNativo = selectedVueltoMetodo
    ? selectedVueltoMetodo.moneda === 'BS'
      ? Number(vueltoMontoBs.toFixed(2))
      : Number((vueltoMontoBs / tasaUsada).toFixed(2))
    : 0

  // Auto-seleccionar primer metodo efectivo cuando hay vuelto
  useEffect(() => {
    if (estaOverpago && !vueltoMetodoId) {
      const efectivos = metodos.filter((m) => m.tipo === 'EFECTIVO')
      if (efectivos.length > 0) setVueltoMetodoId(efectivos[0].id)
    } else if (!estaOverpago && vueltoMetodoId) {
      setVueltoMetodoId('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estaOverpago])

  const metodosEfectivo = metodos.filter((m) => m.tipo === 'EFECTIVO')

  // ── Calculo IGTF ──────────────────────────────────────────────────────────
  const { aplicaIgtf, tasaIgtf } = useIgtfConfig()
  const totalPagosUsdNativo = pagos
    .filter((p) => p.moneda !== 'BS')
    .reduce((sum, p) => sum + p.monto, 0)
  const igtfUsd =
    aplicaIgtf && totalPagosUsdNativo > 0
      ? Number((totalPagosUsdNativo * tasaIgtf / 100).toFixed(2))
      : 0
  const igtfBs = Number((igtfUsd * tasaUsada).toFixed(2))

  // ── Estado del boton Procesar ─────────────────────────────────────────────
  const puedeProcesar =
    // Contado/vuelto: pago completo con metodo de vuelto si aplica
    (pagos.length > 0 && (esPagado || estaOverpago) && (!estaOverpago || !!vueltoMetodoId)) ||
    // Credito parcial: hay al menos un pago pero queda saldo pendiente
    (tipoDetectado === 'CREDITO' && pagos.length > 0) ||
    // Credito total sin abono: el cliente asume la deuda completa
    (tipoDetectado === 'CREDITO' && pagos.length === 0 && !!clienteId)

  const selectedMetodo = metodos.find((m) => m.id === metodoId)
  const monedaMetodo = selectedMetodo?.moneda as 'USD' | 'BS' | undefined

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAddPago = () => {
    const montoNum = parseFloat(montoStr)
    if (!metodoId || isNaN(montoNum) || montoNum <= 0 || !monedaMetodo || !selectedMetodo) return
    setPagos((prev) => [
      ...prev,
      {
        metodo_cobro_id: metodoId,
        metodo_nombre: selectedMetodo.nombre,
        moneda: monedaMetodo,
        monto: montoNum,
        referencia: referencia.trim() || undefined,
      },
    ])
    setMetodoId('')
    setMontoStr('')
    setReferencia('')
  }

  const handleRemovePago = (index: number) => {
    setPagos((prev) => prev.filter((_, i) => i !== index))
  }

  // Rellena el monto pendiente exacto en la moneda del metodo seleccionado
  const handleAutocompletar = () => {
    if (!monedaMetodo) return
    const pendBs = Math.max(0, pendienteBs4)
    const montoPend =
      monedaMetodo === 'BS'
        ? Number(pendBs.toFixed(2))
        : Number((pendBs / tasaUsada).toFixed(2))
    setMontoStr(String(montoPend))
  }

  const handleProcesar = async () => {
    // Validar limite de credito si queda saldo
    if (tipoDetectado === 'CREDITO' && clienteData) {
      const limite = parseFloat(clienteData.limite_credito_usd)
      const saldoActual = parseFloat(clienteData.saldo_actual)
      if (limite <= 0) {
        toast.error('Este cliente no tiene credito asignado. Registra un pago para facturar a contado.')
        return
      }
      const creditoDisponible = Math.max(0, limite - saldoActual)
      if (pendienteUsd > creditoDisponible + 0.01) {
        toast.error(
          `El monto a credito (${formatUsd(pendienteUsd)}) excede el credito disponible (${formatUsd(creditoDisponible)})`
        )
        return
      }
    }

    // Avances deben cubrirse completamente (no se aceptan a credito)
    const totalAvancesUsd = cargosEspeciales
      .filter((c) => c.tipo === 'AVANCE')
      .reduce((sum, c) => sum + c.montoCargoUsd, 0)
    const totalPagadoUsd = pagos.reduce((sum, p) => {
      return sum + (p.moneda === 'BS' ? p.monto / tasaUsada : p.monto)
    }, 0)
    if (totalAvancesUsd > 0.01 && totalPagadoUsd < totalAvancesUsd - 0.01) {
      toast.error(
        `El avance de efectivo debe pagarse en su totalidad. Registra un pago de al menos ${formatUsd(totalAvancesUsd)}.`
      )
      return
    }

    // Vuelto requiere metodo seleccionado
    if (estaOverpago && !vueltoMetodoId) {
      toast.error('Selecciona el metodo en que entregaras el vuelto al cliente')
      return
    }

    const vueltoParam: VueltoParam | undefined =
      estaOverpago && vueltoMetodoId && vueltoMontoNativo > 0.005
        ? {
            metodo_cobro_id: vueltoMetodoId,
            moneda: selectedVueltoMetodo?.moneda === 'BS' ? 'BS' : 'USD',
            monto: vueltoMontoNativo,
          }
        : undefined

    setSubmitting(true)
    try {
      // Validar stock en servidor antes de escribir (no bloquea si offline)
      await validarStockServidor(
        lineas
          .filter((l) => l.tipo === 'P')
          .map((l) => ({
            producto_id: l.producto_id,
            cantidad: l.cantidad,
            nombre: l.nombre,
            tipo: l.tipo,
          })),
        empresaId,
      )

      const result = await crearVenta({
        cliente_id: clienteId,
        tipo: tipoDetectado,
        tasa: tasaUsada,
        lineas: lineas.map((l) => ({
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          precio_unitario_usd: l.precio_unitario_usd,
          tipo_impuesto: (l.tipo_impuesto as string | undefined) ?? 'Exento',
          impuesto_pct: (l.impuesto_pct as number | undefined) ?? 0,
        })),
        pagos: pagos.map((p) => ({
          metodo_cobro_id: p.metodo_cobro_id,
          moneda: p.moneda,
          monto: p.monto,
          referencia: p.referencia,
        })),
        vuelto: vueltoParam,
        usuario_id: usuarioId,
        empresa_id: empresaId,
        sesion_caja_id: sesionCajaId,
        cargosEspeciales,
        descuentoUsd: descuentoBs > 0 ? Number((descuentoBs / tasaUsada).toFixed(4)) : 0,
        descuentoMotivo: descuentoMotivo.trim() || undefined,
        totalIgtfUsd: igtfUsd,
      })

      onSuccess({
        nroFactura: result.nroFactura,
        clienteNombre,
        totalUsd: totalEfectivoUsd,
        totalBs: totalEfectivoBs,
        tipo: tipoDetectado,
        pagos: [...pagos],
        tasa: tasaUsada,
        cargosEspeciales: [...cargosEspeciales],
        igtfUsd,
        igtfBs,
        tasaIgtfPct: tasaIgtf,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al procesar la venta')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !submitting) onClose() }}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">

        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">Cobro</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tasa: {tasaUsada.toFixed(2)} Bs/$ · {clienteNombre || 'Sin cliente'}
          </p>
        </DialogHeader>

        {/* Total */}
        <div className="px-5 py-3 bg-primary/5 border-b shrink-0 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-primary/60 uppercase tracking-widest font-semibold mb-0.5">
              Total a cobrar
            </p>
            <p className="text-2xl font-bold tabular-nums leading-tight">{formatBs(totalEfectivoBs)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(totalEfectivoUsd)}</p>
          </div>
          {descuentoBs > 0 && (
            <div className="text-right text-xs text-orange-600">
              <p className="font-medium">Descuento</p>
              <p>−{formatBs(descuentoBs)}</p>
            </div>
          )}
        </div>

        {/* IGTF informativo */}
        {aplicaIgtf && igtfUsd > 0 && (
          <div className="px-5 py-2 border-b shrink-0 bg-amber-50">
            <div className="flex items-center justify-between">
              <p className="text-xs text-amber-800 font-medium">
                IGTF {tasaIgtf}% (sobre pagos en divisas)
              </p>
              <div className="text-right">
                <p className="text-xs font-semibold text-amber-800">+{formatBs(igtfBs)}</p>
                <p className="text-[10px] text-amber-600">{formatUsd(igtfUsd)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Balance resumen */}
        {pagos.length > 0 && (
          <div className="px-5 py-2 border-b shrink-0 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Abonado</p>
              <p className="font-semibold text-green-600">{formatBs(totalPagadoBs)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Pendiente</p>
              {estaOverpago ? (
                <p className="font-semibold text-amber-600">Vuelto {formatBs(vueltoMontoBs)}</p>
              ) : esDiferencialRedondeo ? (
                <p className="font-semibold text-muted-foreground">Dif. redondeo</p>
              ) : (
                <p className={`font-semibold ${pendienteBs4 > umbralBs ? 'text-orange-600' : 'text-green-600'}`}>
                  {formatBs(Math.max(0, pendienteBs4))}
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Estado</p>
              <p className={`font-semibold ${tipoDetectado === 'CREDITO' ? 'text-orange-600' : 'text-green-600'}`}>
                {tipoDetectado}
              </p>
            </div>
          </div>
        )}

        {/* Lista de pagos (scrollable) */}
        <div className="max-h-36 overflow-y-auto divide-y">
          {pagos.length === 0 ? (
            <div className="px-5 py-4 text-xs text-muted-foreground text-center">
              Sin pagos registrados
            </div>
          ) : (
            pagos.map((p, i) => {
              const equiv = p.moneda === 'BS' ? Number((p.monto / tasaUsada).toFixed(2)) : p.monto
              return (
                <div key={i} className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/30">
                  <div className="min-w-0">
                    <span className="text-xs font-medium">{p.metodo_nombre}</span>
                    {p.referencia && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">Ref: {p.referencia}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs">
                      {p.moneda === 'BS' ? formatBs(p.monto) : formatUsd(p.monto)}
                      {p.moneda === 'BS' && (
                        <span className="ml-1 text-[10px] text-muted-foreground">({formatUsd(equiv)})</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemovePago(i)}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Formulario de pago */}
        <div className="px-5 py-3 border-t border-b shrink-0 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Agregar pago</p>
          <NativeSelect value={metodoId} onChange={(e) => setMetodoId(e.target.value)}>
            <option value="">Seleccionar metodo...</option>
            {metodos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} ({m.moneda})
              </option>
            ))}
          </NativeSelect>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={montoStr}
                onChange={(e) => setMontoStr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPago()
                  if (e.key === '-') e.preventDefault()
                }}
                placeholder={monedaMetodo ? `Monto (${monedaMetodo})` : 'Monto'}
                className="h-8 text-sm pr-16"
                autoFocus={false}
              />
              {monedaMetodo && pendienteBs4 > umbralBs && (
                <button
                  type="button"
                  onClick={handleAutocompletar}
                  className="absolute right-1.5 top-1.5 text-[10px] text-primary hover:text-primary/80 font-medium px-1 leading-none"
                >
                  Exacto
                </button>
              )}
            </div>
            <Input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddPago() }}
              placeholder="Ref. (opcional)"
              className="h-8 text-sm w-28"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={handleAddPago}
              disabled={!metodoId || !montoStr || parseFloat(montoStr) <= 0}
            >
              <Plus size={14} />
            </Button>
          </div>
        </div>

        {/* Seccion de vuelto */}
        {estaOverpago && (
          <div className="px-5 py-3 border-b shrink-0 bg-amber-50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-amber-800">
                Vuelto: {formatBs(vueltoMontoBs)}
                {selectedVueltoMetodo?.moneda === 'USD' && (
                  <span className="ml-1.5 text-amber-600 font-normal">
                    ({formatUsd(vueltoMontoNativo)})
                  </span>
                )}
              </p>
            </div>
            <div>
              <label className="text-[10px] text-amber-700 mb-1 block">Dar cambio en</label>
              {metodosEfectivo.length === 0 ? (
                <p className="text-xs text-destructive">No hay metodos de efectivo configurados</p>
              ) : (
                <NativeSelect
                  value={vueltoMetodoId}
                  onChange={(e) => setVueltoMetodoId(e.target.value)}
                  className="border-amber-200"
                >
                  <option value="">Seleccionar...</option>
                  {metodosEfectivo.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} ({m.moneda})
                    </option>
                  ))}
                </NativeSelect>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 shrink-0 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => void handleProcesar()}
            disabled={!puedeProcesar || submitting}
            className={
              tipoDetectado === 'CREDITO'
                ? 'bg-orange-600 hover:bg-orange-700'
                : ''
            }
          >
            {tipoDetectado === 'CREDITO' ? (
              <CreditCard size={14} className="mr-1.5" />
            ) : (
              <ShoppingCart size={14} className="mr-1.5" />
            )}
            {submitting
              ? 'Procesando...'
              : tipoDetectado === 'CREDITO'
              ? 'Factura Credito'
              : 'Procesar'}
            {!submitting && (
              <kbd className="ml-1.5 rounded border bg-muted/40 px-1 py-px text-[10px] font-mono leading-none opacity-70">
                F12
              </kbd>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
