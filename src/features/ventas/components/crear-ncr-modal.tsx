import { useState, useRef, useEffect } from 'react'
import { X, Warning, LockSimple } from '@phosphor-icons/react'
import { formatUsd, formatBs, formatTasa } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import { useDetalleFactura, crearNotaCredito } from '../hooks/use-notas-credito'
import type { FacturaParaAnular } from '../hooks/use-notas-credito'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { useDepositosVentaActivos } from '@/features/inventario/hooks/use-depositos'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { NativeSelect } from '@/components/ui/native-select'
import { requierePinEmisionNc, puedeElegirDepositoExplicito } from '../utils/notas-credito-pin-gating'
import { toast } from 'sonner'

interface CrearNcrModalProps {
  isOpen: boolean
  onClose: () => void
  factura: FacturaParaAnular | null
}

export function CrearNcrModal({ isOpen, onClose, factura }: CrearNcrModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [motivo, setMotivo] = useState('Anulacion total de factura')
  const [loading, setLoading] = useState(false)
  const { user } = useCurrentUser()
  const { hasPermission } = usePermissions()
  const { depositos: depositosActivos } = useDepositosVentaActivos()

  // Doble PIN (Slice 5a, Spec notas-credito-pos "Modelo de doble PIN", obs
  // #2802 decision 3) — DOS autorizaciones SEPARADAS, nunca fusionadas:
  // PIN A gatea la EMISION de la NC (permiso ventas.nota_credito decide);
  // PIN B gatea unicamente el override explicito del deposito de reingreso.
  const [showPinEmision, setShowPinEmision] = useState(false)
  const [showPinOverrideDeposito, setShowPinOverrideDeposito] = useState(false)
  const [pinOverrideAutorizado, setPinOverrideAutorizado] = useState(false)
  const [depositoElegidoId, setDepositoElegidoId] = useState<string | null>(null)

  const selectorDepositoDesbloqueado = puedeElegirDepositoExplicito(pinOverrideAutorizado)

  const { detalles, pagos, isLoading: loadingDetalle } = useDetalleFactura(
    isOpen ? factura?.id ?? null : null
  )

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      setMotivo('Anulacion total de factura')
      setPinOverrideAutorizado(false)
      setDepositoElegidoId(null)
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  async function submitAnulacion() {
    if (!factura || !user) return

    setLoading(true)
    try {
      const result = await crearNotaCredito({
        venta_id: factura.id,
        motivo,
        usuario_id: user.id,
        empresa_id: user.empresa_id!,
        // Este modal vive en el modulo Tradicional dedicado (notas-credito-page.tsx),
        // no en el POS express — Regla de Oro (obs #2804): nunca vincula la sesion
        // activa ni toca el cajon fisico sin un egreso administrativo explicito.
        entryPoint: 'TRADICIONAL',
        // AJUSTE_CXC (default del CHECK de `migrations/0091_notas_credito_schema.sql`)
        // hasta que Slice 5b agregue el selector de modalidad a este modal —
        // liquida el remanente cancelando deuda existente del cliente, cero
        // impacto en caja, sin requerir eleccion del usuario todavia.
        modalidad: 'AJUSTE_CXC',
        // NOTA (Slice 5a, obs #2831 — division explicita de slice 5): el
        // deposito elegido explicitamente (`depositoElegidoId`, solo
        // disponible cuando `selectorDepositoDesbloqueado` es true) todavia
        // NO se threadea aqui. `CrearNotaCreditoParams.depositoReingresoId`
        // (Design §Interfaces) se agrega recien en Slice 5a-2, cuando el
        // MISMO parametro tambien sirve al entry point POS. Hasta entonces
        // el backend sigue resolviendo el deposito por riel automatico
        // (`resolveDepositoReingresoNcr`) sin importar la eleccion visible
        // en este modal.
      })
      toast.success(`Nota de credito ${result.nroNcr} creada exitosamente`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear nota de credito')
    } finally {
      setLoading(false)
    }
  }

  function handleConfirmClick() {
    // PIN A (emision) — el permiso decide, no un PIN fijo (obs #2802
    // decision 3): con permiso `ventas.nota_credito` se emite directo, sin
    // permiso se exige autorizacion de supervisor antes de tocar la DB.
    if (requierePinEmisionNc(hasPermission(PERMISSIONS.SALES_NOTA_CREDITO))) {
      setShowPinEmision(true)
      return
    }
    void submitAnulacion()
  }

  function handleCambiarDepositoClick() {
    setShowPinOverrideDeposito(true)
  }

  const saldoPend = parseFloat(factura?.saldo_pend_usd ?? '0')
  const totalPagado = pagos.reduce((sum, p) => sum + parseFloat(p.monto_usd), 0)

  return (
    <>
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl max-h-[85vh]"
    >
      <div className="p-6 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Confirmar Anulacion de Factura</h2>
            {factura && (
              <p className="text-sm text-muted-foreground">
                Factura #{factura.nro_factura}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {!factura ? (
          <p className="text-sm text-muted-foreground">No se selecciono factura</p>
        ) : loadingDetalle ? (
          <div className="space-y-2 flex-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Info factura */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Cliente:</span>{' '}
                <span className="font-medium">{factura.cliente_nombre}</span>
              </div>
              <div>
                <span className="text-muted-foreground">RIF/CI:</span>{' '}
                {factura.cliente_identificacion}
              </div>
              <div>
                <span className="text-muted-foreground">Fecha:</span>{' '}
                {formatDateTime(factura.fecha)}
              </div>
              <div>
                <span className="text-muted-foreground">Tipo:</span>{' '}
                <span
                  className={
                    factura.tipo === 'CREDITO' ? 'text-red-600 font-medium' : ''
                  }
                >
                  {factura.tipo}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Total:</span>{' '}
                <span className="font-bold">{formatUsd(factura.total_usd)}</span> /{' '}
                {formatBs(factura.total_bs)}
              </div>
              <div>
                <span className="text-muted-foreground">Tasa:</span>{' '}
                {formatTasa(factura.tasa)}
              </div>
            </div>

            {/* Articulos */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Articulos</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 font-medium">Producto</th>
                    <th className="text-right py-1 font-medium">Cant</th>
                    <th className="text-right py-1 font-medium">Precio</th>
                    <th className="text-right py-1 font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detalles.map((d, i) => {
                    const cant = parseFloat(d.cantidad)
                    const precio = parseFloat(d.precio_unitario_usd)
                    return (
                      <tr key={i} className="border-b border-muted">
                        <td className="py-1">
                          <span className="font-mono text-muted-foreground mr-1">
                            {d.producto_codigo}
                          </span>
                          {d.producto_nombre}
                        </td>
                        <td className="py-1 text-right">{cant}</td>
                        <td className="py-1 text-right">{formatUsd(precio)}</td>
                        <td className="py-1 text-right font-medium">
                          {formatUsd(cant * precio)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagos realizados */}
            {pagos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  Pagos realizados ({formatUsd(totalPagado)})
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 font-medium">Metodo</th>
                      <th className="text-right py-1 font-medium">Monto</th>
                      <th className="text-right py-1 font-medium">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((p, i) => (
                      <tr key={i} className="border-b border-muted">
                        <td className="py-1">{p.metodo_nombre}</td>
                        <td className="py-1 text-right">
                          {p.moneda === 'BS' ? formatBs(p.monto) : formatUsd(p.monto)}
                        </td>
                        <td className="py-1 text-right font-medium">{formatUsd(p.monto_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Saldo pendiente */}
            {saldoPend > 0.01 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-amber-800">
                  Saldo pendiente que sera cancelado: {formatUsd(saldoPend)}
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Se reducira la deuda del cliente por este monto
                </p>
              </div>
            )}

            {/* Deposito de reingreso (Slice 5a — deposito-inactivo-guard delta: "Reingreso con Eleccion Explicita") */}
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Deposito de reingreso de stock
              </p>
              {!selectorDepositoDesbloqueado ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <LockSimple className="h-3.5 w-3.5 shrink-0" />
                    Automatico (deposito de origen, o el principal si fue desactivado)
                  </p>
                  <button
                    type="button"
                    onClick={handleCambiarDepositoClick}
                    className="text-xs font-medium text-primary hover:underline shrink-0"
                  >
                    Cambiar deposito
                  </button>
                </div>
              ) : (
                <NativeSelect
                  value={depositoElegidoId ?? ''}
                  onChange={(e) => setDepositoElegidoId(e.target.value || null)}
                  className="text-sm"
                >
                  <option value="">Seleccionar deposito...</option>
                  {depositosActivos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </div>

            {/* Motivo */}
            <div>
              <label className="block text-sm font-medium mb-1">Motivo de anulacion</label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Motivo de la anulacion..."
              />
            </div>

            {/* Advertencia */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <Warning className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">
                <p className="font-medium">Esta accion es irreversible</p>
                <p className="text-xs mt-1">
                  Se reintegrara el stock de todos los productos, se cancelara el saldo pendiente
                  y la factura quedara marcada como anulada permanentemente.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        {factura && (
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t shrink-0">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm rounded-md border border-input hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmClick}
              disabled={loading || !motivo.trim()}
              className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Procesando...' : 'Confirmar Anulacion'}
            </button>
          </div>
        )}
      </div>
    </dialog>

    <SupervisorPinDialog
      isOpen={showPinEmision}
      onClose={() => setShowPinEmision(false)}
      onAuthorized={() => {
        setShowPinEmision(false)
        void submitAnulacion()
      }}
      titulo="Autorizacion de Emision"
      mensaje="Esta accion requiere autorizacion de un supervisor para emitir la nota de credito."
      requiredPermission={PERMISSIONS.SALES_NOTA_CREDITO}
    />

    <SupervisorPinDialog
      isOpen={showPinOverrideDeposito}
      onClose={() => setShowPinOverrideDeposito(false)}
      onAuthorized={() => {
        setPinOverrideAutorizado(true)
        setShowPinOverrideDeposito(false)
      }}
      titulo="Autorizar cambio de deposito"
      mensaje="Ingresa el PIN de un supervisor para elegir explicitamente el deposito de reingreso."
    />
    </>
  )
}
