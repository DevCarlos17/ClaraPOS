import { useState, useRef, useEffect, useMemo } from 'react'
import { X, Warning, MagnifyingGlass } from '@phosphor-icons/react'
import { formatUsd, formatBs, formatTasa } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import {
  crearNotaCredito,
  type LiquidacionModalidad,
  type FacturaParaAnular,
  type LineaNcSeleccionada,
} from '../hooks/use-notas-credito'
import { useFacturasSesionActiva } from '../hooks/use-facturas-sesion-activa'
import { resolverDepositoOverride } from '../utils/notas-credito-pin-gating'
import { derivarEstadoPago, facturaCoincideBusqueda, huboAfectacionCxc, ESTADO_PAGO_LABEL } from '../utils/notas-credito-ui'
import { buildReciboData, type ReciboData, type TipoImpuestoLinea } from '../utils/factura-export'
import { FacturaDetallePanel } from './factura-detalle-panel'
import { SeleccionLineasNc, type LineaSeleccionNc } from './seleccion-lineas-nc'
import { useDetalleFactura, usePagosFactura, useAfectacionCxc } from '@/features/cxc/hooks/use-cxc'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { useDepositosVentaActivos } from '@/features/inventario/hooks/use-depositos'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { NativeSelect } from '@/components/ui/native-select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { SesionCaja } from '@/features/caja/hooks/use-sesiones-caja'

/** Mismo mapeo que `venta-exitosa-modal.tsx` (Design §Decision 5) — no una formula nueva. */
function toTipoImpuestoLinea(val: string): TipoImpuestoLinea {
  return val === 'Gravable' || val === 'Exonerado' ? val : 'Exento'
}

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
 * Badges de estado de pago + reverso de una fila del listado (Slice 2, Spec
 * notas-credito-pos: "Badges de estado de pago y reverso"). Puede combinar el
 * badge de pago con uno o ambos badges de reverso simultaneamente.
 */
function FacturaBadges({ f }: { f: FacturaParaAnular }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
        {ESTADO_PAGO_LABEL[derivarEstadoPago(f)]}
      </Badge>
      {f.tiene_reverso_total === 1 && (
        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
          Reverso Total
        </Badge>
      )}
      {f.tiene_reverso_parcial === 1 && (
        <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
          Reverso Parcial
        </Badge>
      )}
    </div>
  )
}

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
  const [searchQuery, setSearchQuery] = useState('')
  const [modalidad, setModalidad] = useState<LiquidacionModalidad>('EFECTIVO_REAL')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPin, setShowPin] = useState(false)
  // PIN B (override de deposito, Slice 5a-2b) — SEPARADO de `showPin`/PIN A.
  const [showPinDeposito, setShowPinDeposito] = useState(false)
  const [pinDepositoAutorizado, setPinDepositoAutorizado] = useState(false)
  const [depositoElegidoId, setDepositoElegidoId] = useState<string | null>(null)
  // Eleccion TOTAL/PARCIAL (Slice 3b, Spec notas-credito-pos: "Seleccion de
  // tipo de nota de credito"). TOTAL es el default — preserva el flujo
  // pre-existente byte-a-byte (mismo `crearNotaCredito` sin `tipo`/`lineas`).
  const [tipoNc, setTipoNc] = useState<'TOTAL' | 'PARCIAL'>('TOTAL')
  // Lineas PARCIAL pendientes de PIN A — solo se usan si el usuario confirmo
  // sin permiso y debe autorizar antes de que `emitirNc` se dispare de nuevo.
  const [lineasParcialPendientes, setLineasParcialPendientes] = useState<LineaNcSeleccionada[] | null>(null)
  // Accion pendiente detras del MISMO PIN A (Slice 4, Design §Decision 9):
  // "Nota de credito" y el placeholder "Editar metodos de pago" comparten un
  // unico SupervisorPinDialog — este estado le dice a `onAuthorized` cual de
  // las dos funciones debe disparar tras la autorizacion.
  const [accionPendiente, setAccionPendiente] = useState<'NC' | 'EDITAR_PAGOS' | null>(null)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
      setFacturaId(null)
      setSearchQuery('')
      setModalidad('EFECTIVO_REAL')
      setMotivo('')
      setShowPin(false)
      setShowPinDeposito(false)
      setPinDepositoAutorizado(false)
      setDepositoElegidoId(null)
      setTipoNc('TOTAL')
      setLineasParcialPendientes(null)
      setAccionPendiente(null)
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  const factura = facturas.find((f) => f.id === facturaId) ?? null

  // Filtro client-side sobre la lista ya escopeada por query (Slice 2, Spec
  // notas-credito-pos: buscador por numero, cliente o estado) — sin nueva
  // query, se recalcula en cada render sobre `facturas`.
  const facturasFiltradas = useMemo(
    () => facturas.filter((f) => facturaCoincideBusqueda(f, searchQuery)),
    [facturas, searchQuery]
  )

  // Panel de detalle fiscal (Slice 3a, Design §Decision 5) — reusa
  // buildReciboData/construirFilasTotales, NUNCA recalcula montos de forma
  // independiente. Mismo mapeo detalle->ReciboLineaInput que
  // venta-exitosa-modal.tsx:94-101.
  const { detalle } = useDetalleFactura(facturaId)
  const { pagos: pagosFactura } = usePagosFactura(facturaId)
  const { company } = useCompany()
  // Afectacion a CxC (Design §Decision 6): fuente movimientos_cuenta, NUNCA
  // construirCierreRecibo/discrepancy (estado efimero de React).
  const { cantidadMovimientos } = useAfectacionCxc(facturaId, user?.empresa_id ?? '')
  const afectoCxc = facturaId ? huboAfectacionCxc(cantidadMovimientos) : null

  const recibo: ReciboData | null = useMemo(() => {
    if (!factura) return null
    return buildReciboData({
      nroFactura: factura.nro_factura,
      fecha: factura.fecha,
      emisor: { nombre: company?.nombre ?? '', rif: company?.rif ?? null, direccion: company?.direccion ?? null },
      cliente: { nombre: factura.cliente_nombre, identificacion: factura.cliente_identificacion, direccion: null },
      lineas: detalle.map((d) => ({
        codigo: d.producto_codigo,
        nombre: d.producto_nombre,
        cantidad: d.cantidad,
        precioUnitarioUsd: d.precio_unitario_usd,
        tipoImpuesto: toTipoImpuestoLinea(d.tipo_impuesto),
        impuestoPct: d.impuesto_pct,
      })),
      // SIEMPRE la tasa historica de la factura — nunca la tasa vigente del sistema.
      tasa: factura.tasa,
      igtfUsd:
        factura.total_igtf_usd && Number(factura.total_igtf_usd) > 0 ? Number(factura.total_igtf_usd) : null,
      pagos: pagosFactura.map((p) => ({
        metodo_cobro_id: p.metodo_cobro_id,
        metodo_nombre: p.metodo_nombre,
        moneda: p.moneda_label as 'USD' | 'BS',
        monto: Number(p.monto),
      })),
      discrepancy: null,
      saldoPendUsd: Number(factura.saldo_pend_usd),
    })
  }, [factura, detalle, pagosFactura, company])

  // Lineas candidatas a NC PARCIAL (Slice 3b, Design §Decision 7) — mismo
  // `detalle` de `useDetalleFactura` ya usado para el panel de detalle,
  // mapeado al contrato de presentacion de `SeleccionLineasNc`.
  const lineasParaNc: LineaSeleccionNc[] = useMemo(
    () =>
      detalle.map((d) => ({
        venta_det_id: d.id,
        producto_nombre: d.producto_nombre,
        producto_codigo: d.producto_codigo,
        cantidadFacturada: Number(d.cantidad),
        esDecimal: d.es_decimal === 1,
        precioUnitarioUsd: Number(d.precio_unitario_usd),
        tipoImpuesto: toTipoImpuestoLinea(d.tipo_impuesto),
        impuestoPct: Number(d.impuesto_pct),
      })),
    [detalle]
  )

  /**
   * `lineasParcial` presente + no vacio → NC PARCIAL (Design §Interfaces,
   * Slice 3b). Ausente → NC TOTAL, comportamiento pre-existente byte-a-byte
   * (mismo `crearNotaCredito` sin `tipo`/`lineas`, Spec: "NC TOTAL reversa
   * la factura completa").
   */
  async function emitirNc(lineasParcial?: LineaNcSeleccionada[]) {
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
        entryPoint: 'POS',
        sesionCajaActivaId: sesion.id,
        modalidad,
        ...(lineasParcial ? { tipo: 'PARCIAL' as const, lineas: lineasParcial } : {}),
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
    setLineasParcialPendientes(null)
    setAccionPendiente('NC')
    if (hasPermission(PERMISSIONS.SALES_NOTA_CREDITO)) {
      void emitirNc()
    } else {
      setShowPin(true)
    }
  }

  /**
   * Confirmar de `SeleccionLineasNc` (Slice 3b, Design §Decision 7): mismo
   * gating de permiso/PIN A que TOTAL — el permiso NUNCA distingue por tipo
   * de NC (Spec: "Permiso determina el PIN para ambas acciones").
   */
  function handleConfirmarParcialClick(lineas: LineaNcSeleccionada[]) {
    setAccionPendiente('NC')
    if (hasPermission(PERMISSIONS.SALES_NOTA_CREDITO)) {
      void emitirNc(lineas)
    } else {
      setLineasParcialPendientes(lineas)
      setShowPin(true)
    }
  }

  /**
   * Placeholder "Editar metodos de pago" (Slice 4, Design §Decision 9, Spec
   * notas-credito-pos: "Boton 'Editar metodos de pago' como placeholder").
   * CERO mutacion de datos — nunca llama `crearNotaCredito` ni ninguna otra
   * escritura. Existe unicamente para reservar el slot de UI, gateado por el
   * MISMO permiso/PIN A que "Nota de credito".
   */
  function ejecutarEditarPagosPlaceholder() {
    toast.info('Funcion "Editar metodos de pago" aun no implementada')
  }

  function handleEditarPagosClick() {
    setAccionPendiente('EDITAR_PAGOS')
    if (hasPermission(PERMISSIONS.SALES_NOTA_CREDITO)) {
      ejecutarEditarPagosPlaceholder()
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
        className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-4xl shadow-xl max-h-[85vh]"
      >
        <div className="p-6 flex flex-col max-h-[85vh]">
          <div className="flex items-start justify-between mb-4 shrink-0">
            <h2 className="text-lg font-semibold">Nota de Credito — Sesion Actual</h2>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {!sesion ? (
            <p className="text-sm text-muted-foreground">No hay sesion de caja activa</p>
          ) : (
            // Layout de dos columnas (Slice 3a, reemplaza el drill-down
            // single-view anterior): lista+buscador a la izquierda (Slice 2),
            // panel de detalle fiscal montado a la derecha (Design §Decision 5).
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
              <div className="flex flex-col min-h-0">
                {facturas.length > 0 && (
                  <div className="relative mb-2 shrink-0">
                    <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por numero, cliente o estado..."
                      className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                )}
                <div className="flex-1 overflow-y-auto space-y-1.5">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                    ))
                  ) : facturas.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No hay facturas en esta sesion todavia.
                    </p>
                  ) : facturasFiltradas.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      Ninguna factura coincide con la busqueda.
                    </p>
                  ) : (
                    facturasFiltradas.map((f) => {
                      // WARNING #2 (Slice 1 review, obs #2877) resuelto aqui:
                      // una factura ya reversada TOTAL (status ANULADA) queda
                      // visible con su badge pero NO clickable — evita el
                      // dead-end confuso de navegar a "Confirmar Anulacion"
                      // sobre una factura que `crearNotaCredito` va a
                      // rechazar. Reverso PARCIAL sigue siendo accionable
                      // (puede recibir otra NC parcial dentro del tope).
                      const bloqueada = f.status === 'ANULADA'
                      const seleccionada = f.id === facturaId
                      return (
                        <button
                          key={f.id}
                          type="button"
                          disabled={bloqueada}
                          onClick={() => {
                            setFacturaId(f.id)
                            setTipoNc('TOTAL')
                          }}
                          aria-label={bloqueada ? `Factura ${f.nro_factura} ya reversada` : undefined}
                          className={`w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                            bloqueada
                              ? 'opacity-60 cursor-not-allowed'
                              : seleccionada
                                ? 'border-primary bg-muted'
                                : 'hover:bg-muted'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{formatDateTime(f.fecha)}</p>
                            <p className="text-sm font-medium">#{f.nro_factura}</p>
                            <p className="text-xs text-muted-foreground truncate">{f.cliente_nombre}</p>
                            <div className="mt-1">
                              <FacturaBadges f={f} />
                            </div>
                          </div>
                          <div className="text-right shrink-0 pl-2">
                            <p className="text-sm font-semibold">{formatUsd(f.total_usd)}</p>
                            <p className="text-xs text-muted-foreground">{formatBs(f.total_bs)}</p>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-col min-h-0 md:border-l md:pl-4 overflow-y-auto">
                {factura && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-4 pt-1 pb-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Cliente:</span> {factura.cliente_nombre}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tasa:</span> {formatTasa(factura.tasa)}
                    </div>
                  </div>
                )}

                <FacturaDetallePanel recibo={recibo} afectoCxc={afectoCxc} />

                {factura && (
                  <div className="space-y-4 px-4 pb-4">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        Tipo de nota de credito
                      </p>
                      <div className="flex gap-2">
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

                    {tipoNc === 'PARCIAL' ? (
                      // PARCIAL (Slice 3b, Design §Decision 7): reemplaza el
                      // warning/footer generico de TOTAL — la propia
                      // SeleccionLineasNc trae su boton de confirmar,
                      // gateado por la misma validacion de
                      // `derivarLineasNcParcial` (tope facturado, es_decimal,
                      // cantidad negativa, al menos una linea).
                      <SeleccionLineasNc
                        lineas={lineasParaNc}
                        factura={{
                          total_usd: Number(factura.total_usd),
                          total_bs: Number(factura.total_bs),
                          tasa: Number(factura.tasa),
                        }}
                        onConfirm={handleConfirmarParcialClick}
                        loading={loading}
                      />
                    ) : (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                        <Warning className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-red-700">
                          <p className="font-medium">Esta accion es irreversible</p>
                          <p className="text-xs mt-1">
                            Se reintegrara el stock de todos los productos y la factura quedara anulada.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
                type="button"
                onClick={handleEditarPagosClick}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-50"
              >
                Editar metodos de pago
              </button>
              {tipoNc === 'TOTAL' && (
                <button
                  onClick={handleConfirmarClick}
                  disabled={loading}
                  className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Procesando...' : 'Confirmar Anulacion'}
                </button>
              )}
            </div>
          )}
        </div>
      </dialog>

      <SupervisorPinDialog
        isOpen={showPin}
        onClose={() => setShowPin(false)}
        onAuthorized={() => {
          // Un unico dialogo, dos acciones posibles (Slice 4, Design
          // §Decision 9) — `accionPendiente` decide cual dispara, nunca
          // ambas ni la equivocada.
          if (accionPendiente === 'EDITAR_PAGOS') {
            ejecutarEditarPagosPlaceholder()
          } else {
            void emitirNc(lineasParcialPendientes ?? undefined)
          }
        }}
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
