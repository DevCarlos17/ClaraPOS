import { useState, useRef, useEffect } from 'react'
import { X, Warning, ArrowLeft } from '@phosphor-icons/react'
import { formatUsd, formatBs, formatTasa } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import { crearNotaCredito, type LiquidacionModalidad } from '../hooks/use-notas-credito'
import { useFacturasSesionActiva } from '../hooks/use-facturas-sesion-activa'
import { resolverDepositoOverride } from '../utils/notas-credito-pin-gating'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { useDepositosVentaActivos } from '@/features/inventario/hooks/use-depositos'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { NativeSelect } from '@/components/ui/native-select'
import { toast } from 'sonner'
import type { SesionCaja } from '@/features/caja/hooks/use-sesiones-caja'

interface NotaCreditoPosModalProps {
  isOpen: boolean
  onClose: () => void
  /** Sesion de caja actualmente abierta del cajero — null bloquea el flujo (sin sesion, sin NC-POS). */
  sesion: SesionCaja | null
}

/**
 * Modalidades ofrecidas desde el POS-express (Slice 5a-2a). `REFUND_TESORERIA`
 * queda deliberadamente excluida — Design/tasks (Slice 6, task 6.3) la
 * reserva SOLO al modulo Tradicional, nunca al POS.
 */
const MODALIDADES_POS: { value: LiquidacionModalidad; label: string }[] = [
  { value: 'EFECTIVO_REAL', label: 'Efectivo / tarjeta (afecta el cuadre de esta sesion)' },
  { value: 'SALDO_FAVOR', label: 'Saldo a favor del cliente' },
  { value: 'AJUSTE_CXC', label: 'Ajuste de cuentas por cobrar' },
  { value: 'COMPENSACION_VENTA', label: 'Compensar con una venta nueva' },
]

/**
 * Entrada POS-express de Notas de Credito (Slice 5a-2a, Spec
 * notas-credito-pos). Auto-contenido a proposito — NO importa ni toca
 * `cobro-modal.tsx` ni `facturas-espera-store.ts`: es un flujo lateral
 * independiente del carrito de venta, montado como sibling en
 * `pos-terminal.tsx`, para no arriesgar el flujo de venta.
 *
 * Alcance de este slice: NC tipo TOTAL unicamente (sin seleccion de lineas
 * — esa UI es un slice futuro separado, obs #2842).
 *
 * DOS autorizaciones SEPARADAS (Slice 5a-2b, obs #2835/#2842/#2802):
 * - PIN A (emision, por-falta-de-permiso): decide si el usuario actual
 *   puede emitir la NC sin PIN.
 * - PIN B (override de deposito, friccion deliberada — Opcion B): por
 *   defecto el modal usa el riel automatico interno de `crearNotaCredito`
 *   (sin `depositoReingresoId`). Cambiar el deposito de reingreso requiere
 *   un SEGUNDO PIN de supervisor, independiente del PIN A — un usuario
 *   puede enfrentar ninguno, uno o ambos PINs en la misma emision.
 */
export function NotaCreditoPosModal({ isOpen, onClose, sesion }: NotaCreditoPosModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()
  const { hasPermission } = usePermissions()
  const { facturas, isLoading } = useFacturasSesionActiva()
  const { depositos: depositosActivos } = useDepositosVentaActivos()

  const [facturaId, setFacturaId] = useState<string | null>(null)
  const [modalidad, setModalidad] = useState<LiquidacionModalidad>('EFECTIVO_REAL')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPin, setShowPin] = useState(false)
  // PIN B (override de deposito, Slice 5a-2b) — SEPARADO de `showPin`/PIN A.
  const [showPinDeposito, setShowPinDeposito] = useState(false)
  const [pinDepositoAutorizado, setPinDepositoAutorizado] = useState(false)
  const [depositoElegidoId, setDepositoElegidoId] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
      setFacturaId(null)
      setModalidad('EFECTIVO_REAL')
      setMotivo('')
      setShowPin(false)
      setShowPinDeposito(false)
      setPinDepositoAutorizado(false)
      setDepositoElegidoId(null)
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  const factura = facturas.find((f) => f.id === facturaId) ?? null

  async function emitirNc() {
    if (!factura || !user?.empresa_id || !sesion) return
    setLoading(true)
    try {
      const result = await crearNotaCredito({
        venta_id: factura.id,
        motivo: motivo.trim() || 'Anulacion desde POS',
        usuario_id: user.id,
        empresa_id: user.empresa_id,
        // Entrada POS-express: SIEMPRE la sesion activa del cajero — la
        // lista ya viene escopeada query-side (useFacturasSesionActiva).
        // `tipo` se omite (default 'TOTAL' en crearNotaCredito) — la NC
        // PARCIAL desde POS es un slice futuro separado (obs #2842).
        entryPoint: 'POS',
        sesionCajaActivaId: sesion.id,
        modalidad,
        // PIN B (Slice 5a-2b): `resolverDepositoOverride` retorna `null`
        // salvo que el segundo PIN ya haya autorizado el override Y el
        // usuario ya haya elegido un deposito — en cuyo caso retorna ese id.
        // `null` se convierte a `undefined` para que `crearNotaCredito`
        // caiga en su riel automatico existente (mismo contrato que el
        // selector Tradicional en `crear-ncr-modal.tsx`).
        depositoReingresoId:
          resolverDepositoOverride({
            pinOverrideAutorizado: pinDepositoAutorizado,
            depositoElegidoId,
          }) ?? undefined,
      })
      toast.success(`Nota de credito ${result.nroNcr} creada exitosamente`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear nota de credito')
    } finally {
      setLoading(false)
    }
  }

  function handleConfirmarClick() {
    // PIN A (Spec notas-credito-pos, obs #2835 regla definitiva): solo se
    // pide PIN cuando el usuario actual NO tiene el permiso de emision de
    // NC — con permiso, emite directo, sin friccion.
    if (hasPermission(PERMISSIONS.SALES_NOTA_CREDITO)) {
      void emitirNc()
    } else {
      setShowPin(true)
    }
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={handleBackdropClick}
        className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-lg shadow-xl max-h-[85vh]"
      >
        <div className="p-6 flex flex-col max-h-[85vh]">
          <div className="flex items-start justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              {factura && (
                <button
                  type="button"
                  onClick={() => setFacturaId(null)}
                  className="p-1 rounded-md hover:bg-muted transition-colors"
                  aria-label="Volver a la lista"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
              <h2 className="text-lg font-semibold">Nota de Credito — Sesion Actual</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {!sesion ? (
            <p className="text-sm text-muted-foreground">No hay sesion de caja activa</p>
          ) : !factura ? (
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                ))
              ) : facturas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No hay facturas en esta sesion todavia.
                </p>
              ) : (
                facturas.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFacturaId(f.id)}
                    className="w-full flex items-center justify-between rounded-lg border p-3 text-left hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">#{f.nro_factura}</p>
                      <p className="text-xs text-muted-foreground">{f.cliente_nombre}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatUsd(f.total_usd)}</p>
                      <p className="text-xs text-muted-foreground">{formatBs(f.total_bs)}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Factura:</span>{' '}
                  <span className="font-medium">#{factura.nro_factura}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Cliente:</span> {factura.cliente_nombre}
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha:</span> {formatDateTime(factura.fecha)}
                </div>
                <div>
                  <span className="text-muted-foreground">Tasa:</span> {formatTasa(factura.tasa)}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Total:</span>{' '}
                  <span className="font-bold">{formatUsd(factura.total_usd)}</span> /{' '}
                  {formatBs(factura.total_bs)}
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  Modalidad de liquidacion
                </p>
                <NativeSelect
                  value={modalidad}
                  onChange={(e) => setModalidad(e.target.value as LiquidacionModalidad)}
                  className="text-sm"
                >
                  {MODALIDADES_POS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </NativeSelect>
                {modalidad === 'EFECTIVO_REAL' && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    Esta modalidad afecta el cuadre de la sesion activa (salida real de efectivo/tarjeta).
                  </p>
                )}
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  Deposito de reingreso de stock
                </p>
                {!pinDepositoAutorizado ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      Automatico (riel de deposito principal)
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowPinDeposito(true)}
                      className="text-xs text-primary hover:underline shrink-0"
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

              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <Warning className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div className="text-sm text-red-700">
                  <p className="font-medium">Esta accion es irreversible</p>
                  <p className="text-xs mt-1">
                    Se reintegrara el stock de todos los productos y la factura quedara anulada.
                  </p>
                </div>
              </div>
            </div>
          )}

          {factura && (
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t shrink-0">
              <button
                onClick={() => setFacturaId(null)}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-md border border-input hover:bg-muted transition-colors"
              >
                Volver
              </button>
              <button
                onClick={handleConfirmarClick}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Procesando...' : 'Confirmar Anulacion'}
              </button>
            </div>
          )}
        </div>
      </dialog>

      <SupervisorPinDialog
        isOpen={showPin}
        onClose={() => setShowPin(false)}
        onAuthorized={() => void emitirNc()}
        titulo="Emision de Nota de Credito"
        mensaje="No tienes permiso para emitir notas de credito. Ingresa el PIN de un supervisor autorizado."
        requiredPermission={PERMISSIONS.SALES_NOTA_CREDITO}
      />

      {/* PIN B (Slice 5a-2b, obs #2835/#2802) — SEPARADO del PIN A de
          arriba: autoriza unicamente el cambio del deposito de reingreso,
          nunca la emision de la NC en si. */}
      <SupervisorPinDialog
        isOpen={showPinDeposito}
        onClose={() => setShowPinDeposito(false)}
        onAuthorized={() => setPinDepositoAutorizado(true)}
        titulo="Cambiar deposito de reingreso"
        mensaje="Cambiar el deposito de reingreso requiere autorizacion de un supervisor."
        requiredPermission={PERMISSIONS.SALES_NOTA_CREDITO}
      />
    </>
  )
}
