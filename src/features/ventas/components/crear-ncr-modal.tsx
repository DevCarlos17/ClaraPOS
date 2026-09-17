import { useState, useRef, useEffect, useMemo } from 'react'
import { X, Warning } from '@phosphor-icons/react'
import {
  crearNotaCredito,
  useReversosFactura,
  type FacturaParaAnular,
  type LineaNcSeleccionada,
  type EgresoTesoreriaLinea,
} from '../hooks/use-notas-credito'
import {
  puedeEmitirNcAdicional,
  puedeElegirTipoTotal,
  calcularReversoPorLinea,
  agruparReversosPorNc,
  type BadgeReverso,
} from '../utils/notas-credito-ui'
import { type ReciboData, type TipoImpuestoLinea } from '../utils/factura-export'
import { buildReciboDataDesdeFacturaGuardada } from '../utils/recibo-desde-factura'
import { FacturaDetallePanel } from './factura-detalle-panel'
import { SeleccionLineasNc, type LineaSeleccionNc } from './seleccion-lineas-nc'
import { RefundTesoreriaForm } from './refund-tesoreria-form'
import { useDetalleFactura, usePagosFactura } from '@/features/cxc/hooks/use-cxc'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useDepositosVentaActivos } from '@/features/inventario/hooks/use-depositos'
import { NativeSelect } from '@/components/ui/native-select'
import { toast } from 'sonner'

/** Mismo mapeo que `nota-credito-pos-modal.tsx`/`venta-exitosa-modal.tsx` (Design §Decision 5) — no una formula nueva. */
function toTipoImpuestoLinea(val: string): TipoImpuestoLinea {
  return val === 'Gravable' || val === 'Exonerado' ? val : 'Exento'
}

interface CrearNcrModalProps {
  isOpen: boolean
  onClose: () => void
  factura: FacturaParaAnular | null
}

/**
 * Origen del reverso — "Devolver dinero"/"Credito a favor" (nc-admin-saldo-
 * favor-real, extendido por nc-refund-tesoreria). "Credito a favor" alimenta
 * `modalidad: 'SALDO_FAVOR'` en `crearNotaCredito`, igual que el selector
 * equivalente de `nota-credito-pos-modal.tsx` — SIN cambios respecto al
 * comportamiento existente. "Devolver dinero" revela dos sub-opciones:
 * "Tesoreria" (activa, `modalidad: 'REFUND_TESORERIA'`, ver
 * `SubOpcionDevolverDinero`) y "Sesion de caja activa" (deshabilitada,
 * "Proximamente").
 */
type OrigenReverso = 'DEVOLVER_DINERO' | 'CREDITO_A_FAVOR'

/** Sub-opcion de "Devolver dinero" (nc-refund-tesoreria, Spec notas-credito-admin). Solo `'TESORERIA'` esta implementada — `'SESION_CAJA'` permanece deshabilitada en la UI ("Proximamente"), nunca se llega a setear. */
type SubOpcionDevolverDinero = 'TESORERIA' | null

/**
 * Modal delgado de la ruta administrativa "Facturas emitidas" (Slice D,
 * notas-credito-ruta-administrativa, Design §Decision 2/5/6). Reescritura
 * completa: reusa la MISMA capa pura de `notas-credito-ui-pos`
 * (`FacturaDetallePanel`, `SeleccionLineasNc`, `puedeEmitirNcAdicional`,
 * `puedeElegirTipoTotal`, `agruparReversosPorNc`, `calcularReversoPorLinea`,
 * `buildReciboData`) que ya usa `nota-credito-pos-modal.tsx` — SIN tocar ese
 * archivo (FROZEN) ni generalizarlo con un flag POS/ADMIN.
 *
 * Diferencias deliberadas frente al POS: reversa CUALQUIER factura de la
 * empresa (recibida por prop, no de una lista escopeada a sesion), SIN PIN
 * (la ruta ya esta gateada por `PERMISSIONS.SALES_VOID` a nivel de acceso,
 * obs #2835 — pedir PIN encima seria friccion redundante), `entryPoint:
 * 'TRADICIONAL'` y `modalidad` derivada de `origenReverso` — "Credito a
 * favor" (unica opcion funcional hoy) produce `'SALDO_FAVOR'`, un credito
 * real trazable en `movimientos_cuenta` (tipo='SAFC'), igual que el flujo
 * POS. "Devolver dinero" sigue siendo un shell visual deshabilitado
 * ("Proximamente") porque REFUND_TESORERIA aun no esta implementado en el
 * write core (nc-admin-saldo-favor-real).
 */
export function CrearNcrModal({ isOpen, onClose, factura }: CrearNcrModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()
  const { depositos: depositosActivos } = useDepositosVentaActivos()

  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [depositoElegidoId, setDepositoElegidoId] = useState<string | null>(null)
  const [tipoNc, setTipoNc] = useState<'TOTAL' | 'PARCIAL'>('TOTAL')
  const [origenReverso, setOrigenReverso] = useState<OrigenReverso>('CREDITO_A_FAVOR')
  const [subOpcionDevolver, setSubOpcionDevolver] = useState<SubOpcionDevolverDinero>(null)

  const ventaId = isOpen ? factura?.id ?? null : null
  const { detalle, isLoading: loadingDetalle } = useDetalleFactura(ventaId)
  const { pagos: pagosFactura } = usePagosFactura(ventaId)
  const { company } = useCompany()
  const { reversos } = useReversosFactura(ventaId, user?.empresa_id ?? '')

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      setMotivo('')
      setDepositoElegidoId(null)
      setTipoNc('TOTAL')
      setOrigenReverso('CREDITO_A_FAVOR')
      setSubOpcionDevolver(null)
    } else {
      dialogRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, factura?.id])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  const historialReversos = useMemo(() => agruparReversosPorNc(reversos), [reversos])

  const lineasFacturaParaReverso = useMemo(
    () => detalle.map((d) => ({ venta_det_id: d.id, cantidad_facturada: d.cantidad })),
    [detalle]
  )

  // Gating de ACCION (F1/5f QA fix ya probado en notas-credito-ui-pos, reusado
  // sin reimplementar): reversado TOTAL acumulado bloquea cualquier NC
  // adicional; reversado PARCIAL (sin completar el 100%) solo bloquea TOTAL.
  const puedeEmitirNc = puedeEmitirNcAdicional(lineasFacturaParaReverso, reversos)
  const puedeTotal = puedeElegirTipoTotal(lineasFacturaParaReverso, reversos)

  // Badge de reverso derivado de las MISMAS dos funciones de gating de arriba
  // (sin duplicar la acumulacion por-linea en una tercera funcion): TOTAL
  // cuando ya no se puede emitir NC adicional (100% acumulado); PARCIAL
  // cuando TOTAL ya no es una opcion valida pero la accion sigue disponible.
  const badgeReverso: BadgeReverso = !puedeEmitirNc ? 'TOTAL' : !puedeTotal ? 'PARCIAL' : null

  useEffect(() => {
    if (!puedeTotal && tipoNc === 'TOTAL') setTipoNc('PARCIAL')
  }, [puedeTotal, tipoNc])

  const recibo: ReciboData | null = useMemo(() => {
    if (!factura) return null
    return buildReciboDataDesdeFacturaGuardada(factura, detalle, pagosFactura, company)
  }, [factura, detalle, pagosFactura, company])

  const lineasParaNc: LineaSeleccionNc[] = useMemo(
    () =>
      detalle.map((d) => {
        const { restante } = calcularReversoPorLinea(d.id, d.cantidad, reversos)
        return {
          venta_det_id: d.id,
          producto_nombre: d.producto_nombre,
          producto_codigo: d.producto_codigo,
          cantidadFacturada: Number(d.cantidad),
          cantidadDisponible: restante.toNumber(),
          esDecimal: d.es_decimal === 1,
          precioUnitarioUsd: Number(d.precio_unitario_usd),
          tipoImpuesto: toTipoImpuestoLinea(d.tipo_impuesto),
          impuestoPct: Number(d.impuesto_pct),
        }
      }),
    [detalle, reversos]
  )

  // Monto disponible para reembolsar via Tesoreria (nc-refund-tesoreria):
  // remanente de la NC neto de Step A — misma formula que `crearNotaCredito`
  // (totalUsdNc menos lo aplicado a la deuda pendiente de la factura). Solo
  // se calcula para tipo TOTAL (unico caso wireado a REFUND_TESORERIA en
  // este change; PARCIAL usa su propio flujo de `SeleccionLineasNc`).
  const montoDisponibleParaRefund = useMemo(() => {
    if (!factura) return 0
    const totalUsdNc = Number(factura.total_usd)
    const saldoPendVenta = Number(factura.saldo_pend_usd)
    const montoAplicadoAPendiente = Math.min(saldoPendVenta, totalUsdNc)
    return Math.max(0, totalUsdNc - montoAplicadoAPendiente)
  }, [factura])

  async function emitirNcRefund(lineas: EgresoTesoreriaLinea[]) {
    if (!factura || !user?.empresa_id) return
    setLoading(true)
    try {
      const result = await crearNotaCredito({
        venta_id: factura.id,
        motivo: motivo.trim() || 'Anulacion desde modulo administrativo',
        usuario_id: user.id,
        empresa_id: user.empresa_id,
        entryPoint: 'TRADICIONAL',
        modalidad: 'REFUND_TESORERIA',
        tipo: 'TOTAL',
        egresoParams: lineas,
        depositoReingresoId: depositoElegidoId ?? undefined,
      })
      toast.success(`Nota de credito ${result.nroNcr} creada exitosamente`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear nota de credito')
    } finally {
      setLoading(false)
    }
  }

  async function emitirNc(lineasParcial?: LineaNcSeleccionada[]) {
    if (!factura || !user?.empresa_id) return
    setLoading(true)
    try {
      const result = await crearNotaCredito({
        venta_id: factura.id,
        motivo: motivo.trim() || 'Anulacion desde modulo administrativo',
        usuario_id: user.id,
        empresa_id: user.empresa_id,
        // Modulo Tradicional (ruta admin "Facturas emitidas") — NUNCA vincula
        // la sesion de caja activa (factura potencialmente historica, ni idea
        // de que sesion este abierta ahora). Ver Regla de Oro, obs #2804.
        entryPoint: 'TRADICIONAL',
        // "Credito a favor" (unica opcion seleccionable hoy) produce un
        // saldo a favor real via el branch SALDO_FAVOR ya probado del write
        // core (nc-admin-saldo-favor-real). "Devolver dinero" queda fuera de
        // alcance (REFUND_TESORERIA no implementado) — el selector nunca
        // permite alcanzarlo, pero se mapea igual por completitud del tipo.
        modalidad: origenReverso === 'CREDITO_A_FAVOR' ? 'SALDO_FAVOR' : 'AJUSTE_CXC',
        tipo: lineasParcial ? 'PARCIAL' : 'TOTAL',
        ...(lineasParcial ? { lineas: lineasParcial } : {}),
        depositoReingresoId: depositoElegidoId ?? undefined,
      })
      toast.success(`Nota de credito ${result.nroNcr} creada exitosamente`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear nota de credito')
    } finally {
      setLoading(false)
    }
  }

  return (
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
            <h2 className="text-lg font-semibold">Aplicar Nota de Credito</h2>
            {factura && (
              <p className="text-sm text-muted-foreground">Factura #{factura.nro_factura}</p>
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
            <FacturaDetallePanel recibo={recibo} reversos={historialReversos} badgeReverso={badgeReverso} />

            {!puedeEmitirNc ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-muted-foreground">
                Esta factura ya fue reversada totalmente. No es posible emitir una nueva nota de credito.
              </div>
            ) : (
              <>
                {/* Tipo de NC (Design §Decision 6: selector duplicado, sin
                    extraerse a componente compartido — mismo criterio que la
                    Decision 2 de este mismo change). */}
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Tipo de nota de credito</p>
                  <div className="flex gap-2">
                    {puedeTotal && (
                      <button
                        type="button"
                        onClick={() => setTipoNc('TOTAL')}
                        aria-pressed={tipoNc === 'TOTAL'}
                        className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors ${
                          tipoNc === 'TOTAL' ? 'border-primary bg-muted font-medium' : 'hover:bg-muted'
                        }`}
                      >
                        Total
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setTipoNc('PARCIAL')}
                      aria-pressed={tipoNc === 'PARCIAL'}
                      className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        tipoNc === 'PARCIAL' ? 'border-primary bg-muted font-medium' : 'hover:bg-muted'
                      }`}
                    >
                      Parcial
                    </button>
                  </div>
                  {!puedeTotal && (
                    <p className="text-xs text-orange-600 mt-1.5">
                      Esta factura ya tiene una NC parcial aplicada — solo se puede reversar el remanente por linea.
                    </p>
                  )}
                </div>

                {/* Origen del reverso — "Credito a favor" mapea a modalidad
                    SALDO_FAVOR real (nc-admin-saldo-favor-real), sin
                    cambios. "Devolver dinero" revela dos sub-opciones
                    (nc-refund-tesoreria): "Tesoreria" (activa,
                    REFUND_TESORERIA) y "Sesion de caja activa"
                    (deshabilitada, "Proximamente"). */}
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Origen del reverso</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOrigenReverso('DEVOLVER_DINERO')}
                      aria-pressed={origenReverso === 'DEVOLVER_DINERO'}
                      className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        origenReverso === 'DEVOLVER_DINERO' ? 'border-primary bg-muted font-medium' : 'hover:bg-muted'
                      }`}
                    >
                      Devolver dinero
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrigenReverso('CREDITO_A_FAVOR')}
                      aria-pressed={origenReverso === 'CREDITO_A_FAVOR'}
                      className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        origenReverso === 'CREDITO_A_FAVOR' ? 'border-primary bg-muted font-medium' : 'hover:bg-muted'
                      }`}
                    >
                      Credito a favor
                    </button>
                  </div>

                  {origenReverso === 'DEVOLVER_DINERO' && (
                    <>
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => setSubOpcionDevolver('TESORERIA')}
                          aria-pressed={subOpcionDevolver === 'TESORERIA'}
                          className={`flex-1 px-3 py-1.5 text-xs rounded-md border transition-colors ${
                            subOpcionDevolver === 'TESORERIA' ? 'border-primary bg-muted font-medium' : 'hover:bg-muted'
                          }`}
                        >
                          Tesoreria
                        </button>
                        <button
                          type="button"
                          disabled
                          title="Proximamente"
                          className="flex-1 px-3 py-1.5 text-xs rounded-md border opacity-50 cursor-not-allowed"
                        >
                          Sesion de caja activa
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        "Sesion de caja activa" estara disponible en una entrega futura (Proximamente).
                      </p>
                    </>
                  )}
                </div>

                {/* Deposito de reingreso — libre, SIN PIN (obs #2835, la
                    pantalla Tradicional dedicada ya esta protegida a nivel de
                    ACCESO — pedir PIN encima seria friccion redundante). */}
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    Deposito de reingreso de stock
                  </p>
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

                {tipoNc === 'PARCIAL' ? (
                  <SeleccionLineasNc
                    key={factura.id}
                    lineas={lineasParaNc}
                    factura={{
                      total_usd: Number(factura.total_usd),
                      total_bs: Number(factura.total_bs),
                      tasa: Number(factura.tasa),
                    }}
                    onConfirm={(lineas) => void emitirNc(lineas)}
                    loading={loading}
                  />
                ) : origenReverso === 'DEVOLVER_DINERO' && subOpcionDevolver === 'TESORERIA' ? (
                  <RefundTesoreriaForm
                    montoDisponibleUsd={montoDisponibleParaRefund}
                    tasaHistorica={Number(factura.tasa)}
                    onConfirm={(lineas) => void emitirNcRefund(lineas)}
                    loading={loading}
                  />
                ) : (
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
                )}
              </>
            )}
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
              {puedeEmitirNc ? 'Cancelar' : 'Cerrar'}
            </button>
            {puedeEmitirNc &&
              tipoNc === 'TOTAL' &&
              !(origenReverso === 'DEVOLVER_DINERO' && subOpcionDevolver === 'TESORERIA') && (
              <button
                onClick={() => void emitirNc()}
                disabled={loading || !motivo.trim()}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Procesando...' : 'Confirmar Anulacion'}
              </button>
            )}
          </div>
        )}
      </div>
    </dialog>
  )
}
