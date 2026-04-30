import { useState, useMemo } from 'react'
import { useQuery } from '@powersync/react'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { reversarAbonoCxP, type FacturaCompraPendiente } from '../hooks/use-cxp'
import {
  anularGasto,
  reversarPagoGasto,
  type GastoPendiente,
} from '@/features/contabilidad/hooks/use-gastos'
import { PagoCxPModal } from './pago-cxp-modal'
import { PagoGastoCxpModal } from './pago-gasto-cxp-modal'

// ─── Tipos internos ──────────────────────────────────────────

interface CompraRow {
  id: string
  proveedor_id: string
  nro_factura: string
  nro_control: string | null
  tasa: string
  tasa_costo: string | null
  total_usd: string
  total_bs: string
  saldo_pend_usd: string
  tipo: string
  status: string
  fecha_factura: string
  created_by: string | null
  created_by_nombre: string | null
  proveedor_razon_social: string | null
  proveedor_rif: string | null
}

interface GastoRow {
  id: string
  empresa_id: string
  proveedor_id: string | null
  nro_gasto: string
  nro_factura: string | null
  nro_control: string | null
  cuenta_id: string
  descripcion: string
  fecha: string
  moneda_factura: string
  usa_tasa_paralela: number
  tasa: string
  tasa_proveedor: string | null
  monto_factura: string
  monto_usd: string
  monto_bs: string
  saldo_pendiente_usd: string
  status: string
  observaciones: string | null
  created_by: string | null
  created_by_nombre: string | null
  proveedor_razon_social: string | null
  proveedor_rif: string | null
  cuenta_nombre: string | null
  cuenta_codigo: string | null
}

interface DetalleRow {
  id: string
  producto_id: string
  cantidad: string
  costo_unitario_usd: string
  producto_codigo: string | null
  producto_nombre: string | null
}

interface AbonoRow {
  id: string
  tipo: string
  referencia: string | null
  monto: string
  fecha: string
  moneda_pago: string | null
  monto_moneda: string | null
  tasa_pago: string | null
  monto_usd_interno: string | null
}

// ─── Props ───────────────────────────────────────────────────

export interface FacturaProveedorModalProps {
  tipo: 'COMPRA' | 'GASTO'
  id: string
  isOpen: boolean
  onClose: () => void
}

// ─── Componente ──────────────────────────────────────────────

export function FacturaProveedorModal({ tipo, id, isOpen, onClose }: FacturaProveedorModalProps) {
  const { user } = useCurrentUser()
  const { hasPermission } = usePermissions()
  const puedeReversarAbono = hasPermission(PERMISSIONS.CXP_REVERSE)
  const puedeAnular = hasPermission(PERMISSIONS.ACCOUNTING_VIEW)

  const [confirmandoAbonoId, setConfirmandoAbonoId] = useState<string | null>(null)
  const [reversandoAbonoId, setReversandoAbonoId] = useState<string | null>(null)
  const [pagoOpen, setPagoOpen] = useState(false)
  const [confirmandoAnular, setConfirmandoAnular] = useState(false)
  const [anulando, setAnulando] = useState(false)

  // ─── Compra data ──────────────────────────────────────────

  const { data: compraData } = useQuery(
    tipo === 'COMPRA' && id
      ? `SELECT fc.*, p.razon_social as proveedor_razon_social, p.rif as proveedor_rif,
               u.nombre as created_by_nombre
         FROM facturas_compra fc
         LEFT JOIN proveedores p ON fc.proveedor_id = p.id
         LEFT JOIN usuarios u ON fc.created_by = u.id
         WHERE fc.id = ?`
      : '',
    tipo === 'COMPRA' && id ? [id] : []
  )
  const compra = (compraData as CompraRow[])?.[0]

  // ─── Gasto data ───────────────────────────────────────────

  const { data: gastoData } = useQuery(
    tipo === 'GASTO' && id
      ? `SELECT g.*, pc.nombre as cuenta_nombre, pc.codigo as cuenta_codigo,
               p.razon_social as proveedor_razon_social, p.rif as proveedor_rif,
               u.nombre as created_by_nombre
         FROM gastos g
         LEFT JOIN plan_cuentas pc ON g.cuenta_id = pc.id
         LEFT JOIN proveedores p ON g.proveedor_id = p.id
         LEFT JOIN usuarios u ON g.created_by = u.id
         WHERE g.id = ?`
      : '',
    tipo === 'GASTO' && id ? [id] : []
  )
  const gasto = (gastoData as GastoRow[])?.[0]

  // ─── Detalle de compra ────────────────────────────────────

  const { data: detalleData } = useQuery(
    tipo === 'COMPRA' && id
      ? `SELECT dc.*, p.codigo as producto_codigo, p.nombre as producto_nombre
         FROM detalle_compra dc
         LEFT JOIN productos p ON dc.producto_id = p.id
         WHERE dc.factura_compra_id = ?`
      : '',
    tipo === 'COMPRA' && id ? [id] : []
  )
  const detalle = (detalleData ?? []) as DetalleRow[]

  // ─── Abonos ───────────────────────────────────────────────

  const { data: abonosCompraData } = useQuery(
    tipo === 'COMPRA' && id
      ? `SELECT mcp.*
         FROM movimientos_cuenta_proveedor mcp
         WHERE mcp.factura_compra_id = ? AND mcp.tipo IN ('PAG', 'DEV')
         ORDER BY mcp.created_at ASC`
      : '',
    tipo === 'COMPRA' && id ? [id] : []
  )
  const { data: abonosGastoData } = useQuery(
    tipo === 'GASTO' && id
      ? `SELECT mcp.*
         FROM movimientos_cuenta_proveedor mcp
         WHERE mcp.doc_origen_id = ? AND mcp.doc_origen_tipo = 'GASTO'
         AND mcp.tipo IN ('PAG', 'DEV')
         ORDER BY mcp.created_at ASC`
      : '',
    tipo === 'GASTO' && id ? [id] : []
  )
  const abonos = ((tipo === 'COMPRA' ? abonosCompraData : abonosGastoData) ?? []) as AbonoRow[]

  // ─── Abonos reversados ────────────────────────────────────

  const reversedPagRefs = useMemo(() => {
    const set = new Set<string>()
    for (const a of abonos) {
      if (a.tipo === 'DEV' && a.referencia?.startsWith('DEV-'))
        set.add(a.referencia.slice(4))
    }
    return set
  }, [abonos])

  // ─── Montos derivados ─────────────────────────────────────

  const amounts = useMemo(() => {
    if (tipo === 'COMPRA' && compra) {
      const tasaFactura = parseFloat(compra.tasa)
      const tasaInterna = compra.tasa_costo ? parseFloat(compra.tasa_costo) : tasaFactura
      const usaParalela = Boolean(
        compra.tasa_costo && Math.abs(tasaFactura - parseFloat(compra.tasa_costo)) > 0.001
      )
      const totalProveedorUsd = parseFloat(compra.total_usd)
      const totalBs = parseFloat(compra.total_bs)
      const totalContableUsd = usaParalela && tasaInterna > 0
        ? totalBs / tasaInterna
        : totalProveedorUsd
      const saldo = parseFloat(compra.saldo_pend_usd)
      return { tasaFactura, tasaInterna, usaParalela, totalProveedorUsd, totalContableUsd, totalBs, saldo }
    }
    if (tipo === 'GASTO' && gasto) {
      const tasaInterna = parseFloat(gasto.tasa)
      const tasaFactura = gasto.tasa_proveedor ? parseFloat(gasto.tasa_proveedor) : tasaInterna
      const usaParalela = gasto.usa_tasa_paralela === 1 && Boolean(gasto.tasa_proveedor)
      const montoFactura = parseFloat(gasto.monto_factura)
      const totalContableUsd = parseFloat(gasto.monto_usd)
      const totalBs = parseFloat(gasto.monto_bs)
      const totalProveedorUsd = (() => {
        if (gasto.moneda_factura === 'USD') return montoFactura
        const tasaRef = usaParalela && tasaFactura > 0 ? tasaFactura : tasaInterna
        return tasaRef > 0 ? montoFactura / tasaRef : totalContableUsd
      })()
      const saldo = parseFloat(gasto.saldo_pendiente_usd)
      return { tasaFactura, tasaInterna, usaParalela, totalProveedorUsd, totalContableUsd, totalBs, saldo }
    }
    return null
  }, [tipo, compra, gasto])

  // ─── Totales abonados ─────────────────────────────────────

  const { totalAbonadoProveedor, totalAbonadoContable } = useMemo(() => {
    let prov = 0
    let cont = 0
    for (const a of abonos) {
      if (a.tipo !== 'PAG') continue
      if (reversedPagRefs.has(a.referencia ?? '')) continue
      const m = parseFloat(a.monto)
      prov += m
      cont += a.monto_usd_interno ? parseFloat(a.monto_usd_interno) : m
    }
    return { totalAbonadoProveedor: prov, totalAbonadoContable: cont }
  }, [abonos, reversedPagRefs])

  // ─── Acciones ─────────────────────────────────────────────

  async function handleReversarAbono(abonoId: string) {
    if (!user?.empresa_id) return
    setReversandoAbonoId(abonoId)
    try {
      if (tipo === 'COMPRA' && compra) {
        await reversarAbonoCxP({
          abonoId,
          facturaCompraId: id,
          proveedorId: compra.proveedor_id,
          empresaId: user.empresa_id,
          usuarioId: user.id,
        })
      } else if (tipo === 'GASTO' && gasto?.proveedor_id) {
        await reversarPagoGasto({
          abonoId,
          gastoId: id,
          proveedorId: gasto.proveedor_id,
          empresaId: user.empresa_id,
          usuarioId: user.id,
        })
      }
      toast.success('Abono reversado exitosamente')
      setConfirmandoAbonoId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reversar el abono')
    } finally {
      setReversandoAbonoId(null)
    }
  }

  async function handleAnularGasto() {
    if (!gasto || !user) return
    setAnulando(true)
    try {
      await anularGasto(gasto.id, user.id)
      toast.success(`Gasto ${gasto.nro_gasto} anulado exitosamente`)
      setConfirmandoAnular(false)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al anular el gasto')
    } finally {
      setAnulando(false)
    }
  }

  // ─── Reconstruccion para sub-modales de pago ──────────────

  const facturaParaPago: FacturaCompraPendiente | null = compra
    ? {
        id: compra.id,
        nro_factura: compra.nro_factura,
        fecha_factura: compra.fecha_factura,
        total_usd: compra.total_usd,
        saldo_pend_usd: compra.saldo_pend_usd,
        tipo: compra.tipo,
        tasa: compra.tasa,
        tasa_costo: compra.tasa_costo,
      }
    : null

  const gastoParaPago: GastoPendiente | null = gasto
    ? {
        id: gasto.id,
        nro_gasto: gasto.nro_gasto,
        nro_factura: gasto.nro_factura,
        fecha: gasto.fecha,
        monto_usd: gasto.monto_usd,
        monto_factura: gasto.monto_factura,
        moneda_factura: gasto.moneda_factura,
        saldo_pendiente_usd: gasto.saldo_pendiente_usd,
        descripcion: gasto.descripcion,
        cuenta_nombre: gasto.cuenta_nombre,
        tasa: gasto.tasa,
        tasa_proveedor: gasto.tasa_proveedor,
        usa_tasa_paralela: gasto.usa_tasa_paralela,
      }
    : null

  // ─── Estado derivado ──────────────────────────────────────

  const isLoading = tipo === 'COMPRA' ? !compra : !gasto
  const saldo = amounts?.saldo ?? 0
  const esAnulado =
    tipo === 'GASTO'
      ? gasto?.status === 'ANULADO'
      : compra?.status === 'ANULADA' || compra?.status === 'REVERSADA'

  const proveedorNombre =
    tipo === 'COMPRA' ? compra?.proveedor_razon_social : gasto?.proveedor_razon_social
  const proveedorRif =
    tipo === 'COMPRA' ? compra?.proveedor_rif : gasto?.proveedor_rif

  // ─── Render ───────────────────────────────────────────────

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <DialogTitle>
                  {tipo === 'COMPRA' ? 'Detalle de Compra' : 'Detalle de Gasto'}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    tipo === 'COMPRA'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-purple-50 text-purple-700 border-purple-200'
                  }`}
                >
                  {tipo}
                </Badge>
              </div>
              {tipo === 'GASTO' && gasto && !esAnulado && puedeAnular && (
                <div className="flex items-center gap-2 shrink-0">
                  {confirmandoAnular ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={anulando}
                        onClick={handleAnularGasto}
                      >
                        {anulando ? 'Anulando...' : 'Confirmar anulacion'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmandoAnular(false)}
                      >
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => setConfirmandoAnular(true)}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Anular
                    </Button>
                  )}
                </div>
              )}
            </div>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-4 py-4">
              <div className="h-24 bg-muted/50 rounded animate-pulse" />
              <div className="h-32 bg-muted/50 rounded animate-pulse" />
              <div className="h-16 bg-muted/50 rounded animate-pulse" />
            </div>
          ) : (
            <div className="space-y-4">

              {/* ── Encabezado del documento ─────────────── */}
              <div className="rounded-lg bg-muted/40 border border-border p-4 space-y-3">
                {/* Proveedor */}
                {(proveedorNombre || proveedorRif) && (
                  <div>
                    <div className="text-base font-semibold text-foreground">
                      {proveedorNombre ?? '—'}
                    </div>
                    {proveedorRif && (
                      <div className="text-xs text-muted-foreground font-mono">
                        RIF: {proveedorRif}
                      </div>
                    )}
                  </div>
                )}

                {/* Datos del documento */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  {tipo === 'COMPRA' && compra && (
                    <>
                      <div className="text-muted-foreground">Nro. Factura</div>
                      <div className="font-mono font-medium">{compra.nro_factura}</div>
                      {compra.nro_control && (
                        <>
                          <div className="text-muted-foreground">Nro. Control</div>
                          <div className="font-mono">{compra.nro_control}</div>
                        </>
                      )}
                      <div className="text-muted-foreground">Fecha</div>
                      <div>{formatDate(compra.fecha_factura)}</div>
                      <div className="text-muted-foreground">Tipo pago</div>
                      <div>
                        <Badge variant="outline" className="text-xs">{compra.tipo}</Badge>
                      </div>
                    </>
                  )}
                  {tipo === 'GASTO' && gasto && (
                    <>
                      <div className="text-muted-foreground">Nro. Interno</div>
                      <div className="font-mono font-medium">{gasto.nro_gasto}</div>
                      {gasto.nro_factura && (
                        <>
                          <div className="text-muted-foreground">Nro. Factura</div>
                          <div className="font-mono">{gasto.nro_factura}</div>
                        </>
                      )}
                      {gasto.nro_control && (
                        <>
                          <div className="text-muted-foreground">Nro. Control</div>
                          <div className="font-mono">{gasto.nro_control}</div>
                        </>
                      )}
                      <div className="text-muted-foreground">Fecha</div>
                      <div>{formatDate(gasto.fecha)}</div>
                    </>
                  )}

                  {/* Tasas */}
                  {amounts && (
                    <>
                      <div className="text-muted-foreground">Tasa Factura</div>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        {amounts.tasaFactura.toFixed(4)} Bs/USD
                        {amounts.usaParalela && (
                          <Badge className="text-[9px] px-1.5 py-0 bg-amber-50 text-amber-700 border border-amber-200">
                            Paralela
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground">Tasa Interna</div>
                      <div className="font-mono tabular-nums">
                        {amounts.tasaInterna.toFixed(4)} Bs/USD
                      </div>
                    </>
                  )}

                  {/* Status + procesado por */}
                  <div className="text-muted-foreground">Status</div>
                  <div>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        esAnulado
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-green-50 text-green-700 border-green-200'
                      }`}
                    >
                      {tipo === 'COMPRA' ? compra?.status : gasto?.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">Procesado por</div>
                  <div className="text-muted-foreground">
                    {(tipo === 'COMPRA' ? compra?.created_by_nombre : gasto?.created_by_nombre) ?? '—'}
                  </div>
                </div>
              </div>

              {/* ── Detalle segun tipo ───────────────────── */}
              {tipo === 'COMPRA' && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Articulos Comprados
                  </h4>
                  {detalle.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">Sin detalle disponible</p>
                  ) : (
                    <div className="overflow-auto rounded-md border max-h-40">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                              Producto
                            </th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                              Cant.
                            </th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                              Costo USD
                            </th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                              Subtotal
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {detalle.map((d) => {
                            const cant = parseFloat(d.cantidad)
                            const costo = parseFloat(d.costo_unitario_usd)
                            return (
                              <tr key={d.id}>
                                <td className="px-3 py-1.5">
                                  <span className="font-mono text-muted-foreground text-[10px]">
                                    {d.producto_codigo}
                                  </span>
                                  {' '}
                                  <span>{d.producto_nombre}</span>
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {cant.toFixed(2)}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {formatUsd(costo)}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                                  {formatUsd(cant * costo)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {tipo === 'GASTO' && gasto && (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5 text-sm">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[90px] shrink-0">Cuenta:</span>
                    <span className="font-medium">
                      {gasto.cuenta_codigo && (
                        <span className="font-mono text-muted-foreground text-xs mr-1">
                          {gasto.cuenta_codigo}
                        </span>
                      )}
                      {gasto.cuenta_nombre}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[90px] shrink-0">Descripcion:</span>
                    <span>{gasto.descripcion}</span>
                  </div>
                  {gasto.observaciones && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-[90px] shrink-0">
                        Observaciones:
                      </span>
                      <span className="italic text-muted-foreground">{gasto.observaciones}</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Totales ──────────────────────────────── */}
              {amounts && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1.5">
                  {amounts.usaParalela ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total Factura (Proveedor):</span>
                        <span className="font-bold text-foreground">
                          {formatUsd(amounts.totalProveedorUsd)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Equivalente Bs ({amounts.tasaFactura.toFixed(2)} Bs/USD):
                        </span>
                        <span className="font-medium text-muted-foreground">
                          {formatBs(amounts.totalBs)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-border/50 pt-1.5">
                        <span className="text-muted-foreground">
                          Total Contable USD ({amounts.tasaInterna.toFixed(2)} Bs/USD):
                        </span>
                        <span className="font-bold text-foreground">
                          {formatUsd(amounts.totalContableUsd)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total Factura:</span>
                        <span className="font-bold text-foreground">
                          {formatUsd(amounts.totalProveedorUsd)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total Bs:</span>
                        <span className="font-medium text-muted-foreground">
                          {formatBs(amounts.totalBs)}
                        </span>
                      </div>
                    </>
                  )}

                  {totalAbonadoProveedor > 0.005 && (
                    <div className="flex justify-between text-sm border-t border-border pt-1.5 mt-1">
                      <span className="text-muted-foreground">Abonado:</span>
                      <div className="text-right">
                        <div className="font-medium text-green-600">
                          {formatUsd(totalAbonadoProveedor)}
                        </div>
                        {Math.abs(totalAbonadoContable - totalAbonadoProveedor) > 0.005 && (
                          <div className="text-[10px] text-muted-foreground">
                            Contable: {formatUsd(totalAbonadoContable)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {saldo > 0.005 ? (
                    <div className="flex justify-between text-sm border-t border-border pt-1.5 mt-1">
                      <span className="font-medium text-muted-foreground">Saldo Pendiente:</span>
                      <span className="font-bold text-destructive">{formatUsd(saldo)}</span>
                    </div>
                  ) : totalAbonadoProveedor > 0.005 ? (
                    <div className="text-center text-xs text-green-600 font-medium pt-1.5 border-t border-border">
                      Factura completamente pagada
                    </div>
                  ) : null}
                </div>
              )}

              {/* ── Historial de pagos ───────────────────── */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Historial de Pagos
                </h4>
                {abonos.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Sin pagos registrados</p>
                ) : (
                  <div className="overflow-auto rounded-md border max-h-48">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                            Fecha
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                            Tipo
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                            Ref.
                          </th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                            Monto
                          </th>
                          {puedeReversarAbono && (
                            <th className="text-center px-3 py-2 font-medium text-muted-foreground">
                              Accion
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {abonos.map((a) => {
                          const esReversado =
                            a.tipo === 'PAG' && reversedPagRefs.has(a.referencia ?? '')
                          const esBs =
                            a.moneda_pago === 'BS' && a.monto_moneda && a.tasa_pago
                          return (
                            <tr
                              key={a.id}
                              className={
                                esReversado ? 'opacity-40 line-through' : ''
                              }
                            >
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {a.fecha?.slice(0, 10)}
                              </td>
                              <td className="px-3 py-1.5">
                                <span
                                  className={`font-medium ${
                                    a.tipo === 'PAG' && !esReversado
                                      ? 'text-green-600'
                                      : 'text-muted-foreground'
                                  }`}
                                >
                                  {a.tipo}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 font-mono text-muted-foreground">
                                {a.referencia ?? '—'}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                <div className="font-medium tabular-nums">
                                  {a.tipo === 'PAG' ? '+' : '-'}
                                  {formatUsd(parseFloat(a.monto))}
                                </div>
                                {esBs && (
                                  <div className="text-muted-foreground text-[10px] leading-tight">
                                    {formatBs(parseFloat(a.monto_moneda!))} @{' '}
                                    {parseFloat(a.tasa_pago!).toFixed(2)}
                                    {a.monto_usd_interno &&
                                      Math.abs(
                                        parseFloat(a.monto_usd_interno) - parseFloat(a.monto)
                                      ) > 0.005 && (
                                        <span className="text-slate-400 ml-1">
                                          / {formatUsd(parseFloat(a.monto_usd_interno))} int.
                                        </span>
                                      )}
                                  </div>
                                )}
                              </td>
                              {puedeReversarAbono && (
                                <td className="px-3 py-1.5 text-center">
                                  {a.tipo === 'PAG' && !esReversado ? (
                                    confirmandoAbonoId === a.id ? (
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          type="button"
                                          disabled={reversandoAbonoId === a.id}
                                          onClick={() => handleReversarAbono(a.id)}
                                          className="px-2 py-0.5 text-[10px] font-medium text-white bg-destructive rounded hover:bg-destructive/90 disabled:opacity-50"
                                        >
                                          {reversandoAbonoId === a.id ? '...' : 'Confirmar'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmandoAbonoId(null)}
                                          className="px-2 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted rounded"
                                        >
                                          Cancelar
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmandoAbonoId(a.id)}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors"
                                      >
                                        <RotateCcw className="h-2.5 w-2.5" />
                                        Reversar
                                      </button>
                                    )
                                  ) : esReversado ? (
                                    <span className="text-[10px] text-muted-foreground italic">
                                      Reversado
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Footer ───────────────────────────────── */}
              <div className="flex justify-between items-center pt-3 border-t border-border">
                <Button variant="outline" onClick={onClose}>
                  Cerrar
                </Button>
                {saldo > 0.01 && !esAnulado && (
                  <Button onClick={() => setPagoOpen(true)}>
                    Registrar Pago
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sub-modales de pago */}
      {tipo === 'COMPRA' && (
        <PagoCxPModal
          open={pagoOpen}
          onClose={() => setPagoOpen(false)}
          factura={facturaParaPago}
          proveedorId={compra?.proveedor_id ?? ''}
          proveedorNombre={compra?.proveedor_razon_social ?? ''}
        />
      )}
      {tipo === 'GASTO' && (
        <PagoGastoCxpModal
          open={pagoOpen}
          onClose={() => setPagoOpen(false)}
          gasto={gastoParaPago}
          proveedorId={gasto?.proveedor_id ?? ''}
          proveedorNombre={gasto?.proveedor_razon_social ?? ''}
        />
      )}
    </>
  )
}
