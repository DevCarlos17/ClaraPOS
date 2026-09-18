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
 * favor-real, extendido por nc-refund-tesoreria, UX rework). "Credito a
 * favor" alimenta `modalidad: 'SALDO_FAVOR'` en `crearNotaCredito`, igual
 * que el selector equivalente de `nota-credito-pos-modal.tsx` — SIN cambios
 * respecto al comportamiento existente. "Devolver dinero" revela
 * `RefundTesoreriaForm` directamente — la jerarquia YA NO tiene una segunda
 * fila fija de botones "Tesoreria"/"Sesion de caja activa" a nivel de modal:
 * el PRIMER select de `RefundTesoreriaForm` ES esa eleccion (Tesoreria
 * habilitada, sesiones activas deshabilitadas "Proximamente").
 */
type OrigenReverso = 'DEVOLVER_DINERO' | 'CREDITO_A_FAVOR'

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
 * favor" produce `'SALDO_FAVOR'` (credito real trazable en
 * `movimientos_cuenta`, tipo='SAFC') y "Devolver dinero" produce
 * `'REFUND_TESORERIA'` (egreso real de tesoreria, `RefundTesoreriaForm`).
 *
 * UX rework (nc-refund-tesoreria): CERO preseleccion — `tipoNc` y
 * `origenReverso` arrancan en `null`, el usuario debe elegir ambos
 * explicitamente antes de que se muestre cualquier contenido accionable
 * (SeleccionLineasNc / RefundTesoreriaForm / aviso de irreversibilidad) o el
 * boton de confirmacion. Esto cierra un gap real: con el default viejo
 * (`CREDITO_A_FAVOR`), un usuario podia elegir "Parcial" sin tocar nunca
 * "Origen del reverso" y `emitirNc` igual computaba una `modalidad` (antes
 * SALDO_FAVOR por el default, ahora — sin gating — caeria en el branch
 * `AJUSTE_CXC` fuera de alcance). Se resuelve NO renderizando
 * `SeleccionLineasNc`/el resto del contenido hasta que `origenReverso` este
 * explicitamente elegido (ver JSX), nunca asumiendo un default silencioso.
 */
export function CrearNcrModal({ isOpen, onClose, factura }: CrearNcrModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()
  const { depositos: depositosActivos } = useDepositosVentaActivos()

  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [depositoElegidoId, setDepositoElegidoId] = useState<string | null>(null)
  // UX rework (nc-refund-tesoreria): SIN preseleccion — el usuario debe
  // elegir tipo Y origen explicitamente (ver comentario del componente).
  const [tipoNc, setTipoNc] = useState<'TOTAL' | 'PARCIAL' | null>(null)
  const [origenReverso, setOrigenReverso] = useState<OrigenReverso | null>(null)

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
      setTipoNc(null)
      setOrigenReverso(null)
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
        // `emitirNc` solo se llama para PARCIAL (via SeleccionLineasNc,
        // gateada a `origenReverso` no-null en el JSX) o para TOTAL +
        // "Credito a favor" (footer). "Credito a favor" produce un saldo a
        // favor real via el branch SALDO_FAVOR ya probado del write core
        // (nc-admin-saldo-favor-real). "Devolver dinero" + PARCIAL queda
        // fuera de alcance (REFUND_TESORERIA solo esta wireado para TOTAL,
        // via `emitirNcRefund`) — se mapea a AJUSTE_CXC por completitud del
        // tipo, aunque este branch no tiene UI que lo alcance hoy (TOTAL +
        // Devolver dinero usa `emitirNcRefund`, nunca `emitirNc`).
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
                {/* 1. Deposito de reingreso — libre, SIN PIN (obs #2835, la
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

                {/* 2. Tipo de NC — SIN preseleccion (Design §Decision 6:
                    selector duplicado, sin extraerse a componente
                    compartido — mismo criterio que la Decision 2 de este
                    mismo change). */}
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

                {/* 3. Origen del reverso — SIN preseleccion. "Credito a
                    favor" mapea a modalidad SALDO_FAVOR real
                    (nc-admin-saldo-favor-real), sin cambios. "Devolver
                    dinero" revela `RefundTesoreriaForm` directamente — ya NO
                    hay una segunda fila fija de botones aqui (UX rework,
                    nc-refund-tesoreria): el primer select del propio
                    formulario ES esa eleccion Tesoreria/Sesion. */}
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
                </div>

                {/* 6. Motivo — cuando el flujo activo es "Devolver dinero"
                    (TOTAL), se intercala DENTRO de `RefundTesoreriaForm` via
                    `motivoSlot` (entre "+ Agregar cuenta" y "Pendiente por
                    reembolsar", orden exacto pedido en el rework). En
                    cualquier otro flujo (PARCIAL, Credito a favor, o
                    todavia sin elegir) se muestra aqui, justo despues de
                    Origen del reverso. */}
                {!(tipoNc === 'TOTAL' && origenReverso === 'DEVOLVER_DINERO') && (
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
                )}

                {/* Contenido especifico del flujo — gateado por AMBAS
                    elecciones explicitas (tipoNc Y origenReverso). Sin esto,
                    "Parcial" sin tocar "Origen del reverso" podia confirmar
                    con una `modalidad` nunca elegida por el usuario (ver
                    comentario del componente) — bug real destapado al
                    quitar el default viejo, corregido aqui, no ignorado. */}
                {tipoNc === 'PARCIAL' && origenReverso ? (
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
                ) : tipoNc === 'TOTAL' && origenReverso === 'DEVOLVER_DINERO' ? (
                  <RefundTesoreriaForm
                    montoDisponibleUsd={montoDisponibleParaRefund}
                    tasaHistorica={Number(factura.tasa)}
                    onConfirm={(lineas) => void emitirNcRefund(lineas)}
                    loading={loading}
                    portalContainer={dialogRef.current}
                    motivoSlot={
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
                    }
                  />
                ) : tipoNc === 'TOTAL' && origenReverso === 'CREDITO_A_FAVOR' ? (
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
                ) : null}
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
            {puedeEmitirNc && tipoNc === 'TOTAL' && origenReverso === 'CREDITO_A_FAVOR' && (
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
