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
  resolverModalidadDesdeOrigen,
  debeUsarRefundTesoreria,
  calcularMontoDisponibleRefund,
  type BadgeReverso,
  type OrigenReverso,
} from '../utils/notas-credito-ui'
import { type ReciboData, type TipoImpuestoLinea } from '../utils/factura-export'
import { buildReciboDataDesdeFacturaGuardada } from '../utils/recibo-desde-factura'
import { FacturaDetallePanel } from './factura-detalle-panel'
import { SeleccionLineasNc, type LineaSeleccionNc } from './seleccion-lineas-nc'
import { RefundTesoreriaForm } from './refund-tesoreria-form'
import { TipoNcSelector } from './tipo-nc-selector'
import { OrigenReversoSelector } from './origen-reverso-selector'
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
 * `origenReverso` arrancan en `null`. QA fix (unificacion-modal-nc):
 * Total/Parcial es una decision de INVENTARIO, ortogonal a la gestion del
 * vuelto — `SeleccionLineasNc` (rama PARCIAL) se muestra apenas se elige
 * "Parcial", SIN esperar `origenReverso` (antes exigia ambos, lo que
 * ocultaba la seccion hasta elegir el vuelto). Su boton Confirmar SI queda
 * bloqueado por `origenPendiente` hasta elegir el origen — evita el gap
 * real que motivo el gate original: con el default viejo (`CREDITO_A_FAVOR`),
 * un usuario podia confirmar "Parcial" sin tocar nunca "Origen del reverso"
 * y `emitirNc` igual computaba una `modalidad` (antes SALDO_FAVOR por el
 * default, ahora — sin `origenPendiente` — caeria en el branch `AJUSTE_CXC`
 * fuera de alcance). El resto del contenido accionable (RefundTesoreriaForm
 * / aviso de irreversibilidad, rama TOTAL) SI sigue oculto hasta elegir
 * `origenReverso` explicitamente (ver JSX), nunca asumiendo un default
 * silencioso.
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
  // PR3 (nc-parcial-devolver-dinero): espeja el ultimo calculo de
  // `SeleccionLineasNc` (via `onEstadoConfirmarChange`, PR1) — MISMO patron
  // ya usado en `nota-credito-pos-modal.tsx` (PR2). Alimenta
  // `RefundTesoreriaForm` cuando PARCIAL + "Devolver dinero" enruta a el
  // (ver `debeUsarRefundTesoreria` mas abajo): las lineas de articulos van
  // a `emitirNcRefund` y el preview de monto a `montoDisponibleParaRefund`,
  // SIN recalcular nada.
  const [estadoParcialConfirm, setEstadoParcialConfirm] = useState<{
    puedeConfirmar: boolean
    confirmar: () => void
    lineasValidas: LineaNcSeleccionada[]
    totalUsdPreview: number
  } | null>(null)

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
      setEstadoParcialConfirm(null)
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

  // Monto disponible para reembolsar via Tesoreria (nc-refund-tesoreria;
  // ampliado en PR3, nc-parcial-devolver-dinero) — MISMA formula pura que
  // `nota-credito-pos-modal.tsx` (`calcularMontoDisponibleRefund`, PR1): el
  // monto de esta NC se aplica primero contra la deuda pendiente de la
  // factura, lo que sobra queda disponible para reembolso. Para TOTAL,
  // `totalUsdNc` es el total completo de la factura (comportamiento
  // preexistente, sin cambios); para PARCIAL es la SUMA de solo las lineas
  // seleccionadas (`estadoParcialConfirm.totalUsdPreview`, ya calculado por
  // `SeleccionLineasNc`) — nunca `factura.total_usd`, que sobre-estimaria
  // el disponible.
  const montoDisponibleParaRefund = useMemo(() => {
    if (!factura) return 0
    const totalUsdNc = tipoNc === 'PARCIAL' ? (estadoParcialConfirm?.totalUsdPreview ?? 0) : Number(factura.total_usd)
    return calcularMontoDisponibleRefund(totalUsdNc, factura.saldo_pend_usd).toNumber()
  }, [factura, tipoNc, estadoParcialConfirm])

  /**
   * "Devolver dinero" via Tesoreria (nc-refund-tesoreria; ampliado en PR3,
   * nc-parcial-devolver-dinero) — `lineasParcial` presente -> `tipo:'PARCIAL'`
   * + esas lineas de articulos, MISMO contrato que `emitirNc` para PARCIAL
   * sin refund. Ausente -> `tipo:'TOTAL'`, comportamiento preexistente
   * byte-a-byte (bug fix obs #4013/#4007: antes de PR1/PR3, PARCIAL +
   * "Devolver dinero" nunca llegaba aqui — se perdia el egreso real de
   * tesoreria).
   */
  async function emitirNcRefund(lineas: EgresoTesoreriaLinea[], lineasParcial?: LineaNcSeleccionada[]) {
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
        ...(lineasParcial ? { tipo: 'PARCIAL' as const, lineas: lineasParcial } : { tipo: 'TOTAL' as const }),
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
        // `emitirNc` solo se llama para PARCIAL + "Credito a favor" (via
        // SeleccionLineasNc, con su boton interno visible) o para TOTAL +
        // "Credito a favor" (footer). "Credito a favor" produce un saldo a
        // favor real via el branch SALDO_FAVOR ya probado del write core
        // (nc-admin-saldo-favor-real). PARCIAL + "Devolver dinero" ya NO
        // pasa por aqui (fix obs #4013/#4007, PR3 de nc-parcial-devolver-
        // dinero): `debeUsarRefundTesoreria(origenReverso)` oculta el boton
        // interno de `SeleccionLineasNc` (`mostrarBotonConfirmar={false}`)
        // para esa combinacion y enruta a `RefundTesoreriaForm` ->
        // `emitirNcRefund` en su lugar — este branch (`AJUSTE_CXC` via
        // `resolverModalidadDesdeOrigen`) es ahora genuinamente inalcanzable
        // para `DEVOLVER_DINERO`, no solo "sin UI que lo alcance". Extraido
        // a `resolverModalidadDesdeOrigen` (Slice 3, unificacion-modal-nc,
        // Design §D2) — copia verbatim del ternario original, mismo
        // consumidor: `nota-credito-pos-modal.tsx`.
        modalidad: resolverModalidadDesdeOrigen(origenReverso!),
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

                {/* 2. Tipo de NC — SIN preseleccion (Design §D1, Slice 1 de
                    unificacion-modal-nc: extraido a componente compartido
                    `TipoNcSelector`, presentacional puro). */}
                <TipoNcSelector tipoNc={tipoNc} onChange={setTipoNc} puedeTotal={puedeTotal} />

                {/* Articulos a devolver (PARCIAL) — Slice 2 (D4) de
                    unificacion-modal-nc, gate corregido (QA fix): se
                    muestra apenas se elige Parcial, INDEPENDIENTE de
                    Origen del reverso. Total/Parcial es una decision de
                    INVENTARIO (que productos se reingresan al stock),
                    ortogonal a la gestion del vuelto — antes este bloque
                    exigia origenReverso tambien, lo que ocultaba la
                    seccion hasta elegir Devolver dinero/Credito a favor.
                    `origenPendiente` bloquea el boton Confirmar (no la
                    visibilidad) hasta que el origen este elegido. */}
                {tipoNc === 'PARCIAL' ? (
                  // PR3 (nc-parcial-devolver-dinero): cuando el origen
                  // elegido es "Devolver dinero", el boton interno de
                  // confirmar se oculta (`mostrarBotonConfirmar={false}`) —
                  // la confirmacion pasa a ser el propio boton "Confirmar
                  // reembolso" de `RefundTesoreriaForm` mas abajo (MISMO
                  // patron que `nota-credito-pos-modal.tsx`, PR2).
                  // "Credito a favor" (o sin origen elegido todavia) sigue
                  // usando el boton interno sin cambios.
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
                    origenPendiente={origenReverso === null}
                    mostrarBotonConfirmar={!debeUsarRefundTesoreria(origenReverso)}
                    onEstadoConfirmarChange={setEstadoParcialConfirm}
                  />
                ) : null}

                {/* 3. Origen del reverso — SIN preseleccion. "Credito a
                    favor" mapea a modalidad SALDO_FAVOR real
                    (nc-admin-saldo-favor-real), sin cambios. "Devolver
                    dinero" revela `RefundTesoreriaForm` directamente — ya NO
                    hay una segunda fila fija de botones aqui (UX rework,
                    nc-refund-tesoreria): el primer select del propio
                    formulario ES esa eleccion Tesoreria/Sesion. Extraido a
                    `OrigenReversoSelector` (Slice 3, unificacion-modal-nc,
                    Design §D1) — nuevo consumidor: `nota-credito-pos-modal.tsx`. */}
                <OrigenReversoSelector value={origenReverso} onChange={setOrigenReverso} />

                {/* 6. Motivo — cuando el flujo activo es "Devolver dinero"
                    (TOTAL), se intercala DENTRO de `RefundTesoreriaForm` via
                    `motivoSlot` (entre "+ Agregar cuenta" y "Pendiente por
                    reembolsar", orden exacto pedido en el rework). En
                    cualquier otro flujo (PARCIAL, Credito a favor, o
                    todavia sin elegir) se muestra aqui, justo despues de
                    Origen del reverso. */}
                {!debeUsarRefundTesoreria(origenReverso) && (
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

                {/* Contenido especifico del flujo TOTAL — gateado por
                    origenReverso. El bloque PARCIAL (SeleccionLineasNc) se
                    movio justo debajo de TipoNcSelector (Slice 2, D4 de
                    unificacion-modal-nc); su gate es SOLO `tipoNc ===
                    'PARCIAL'` (QA fix), independiente de origenReverso —
                    ver `origenPendiente` pasado arriba. */}
                {debeUsarRefundTesoreria(origenReverso) ? (
                  // PR3 (nc-parcial-devolver-dinero): "Devolver dinero"
                  // SIEMPRE enruta a `RefundTesoreriaForm`, sin importar
                  // `tipoNc` — `debeUsarRefundTesoreria` (PR1, capa pura) es
                  // el UNICO criterio de este gate (antes exigia ADEMAS
                  // `tipoNc === 'TOTAL'`, fix obs #4013/#4007, MISMO cambio
                  // ya aplicado en `nota-credito-pos-modal.tsx`, PR2).
                  // PARCIAL: `montoDisponibleParaRefund` ya usa la suma de
                  // lineas seleccionadas (ver el useMemo de arriba);
                  // `disabledExterno` bloquea "Confirmar reembolso" hasta
                  // que `SeleccionLineasNc` tenga lineas validas
                  // (`estadoParcialConfirm.puedeConfirmar`); al confirmar,
                  // las lineas validadas (`lineasValidas`) viajan a
                  // `emitirNcRefund` para que arme `tipo:'PARCIAL'` + `lineas`.
                  <RefundTesoreriaForm
                    montoDisponibleUsd={montoDisponibleParaRefund}
                    tasaHistorica={Number(factura.tasa)}
                    onConfirm={(lineas) =>
                      void emitirNcRefund(
                        lineas,
                        tipoNc === 'PARCIAL' ? estadoParcialConfirm?.lineasValidas : undefined
                      )
                    }
                    loading={loading}
                    portalContainer={dialogRef.current}
                    disabledExterno={tipoNc === 'PARCIAL' && !estadoParcialConfirm?.puedeConfirmar}
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
