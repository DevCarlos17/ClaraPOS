import { useMemo, useState } from 'react'
import { useQuery } from '@powersync/react'
import { formatUsd } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { startOfMonth, todayStr } from '@/lib/dates'
import { useMovCuentaProveedor } from '@/features/compras/hooks/use-mov-cuenta-proveedor'
import { useFacturasCompraPendientes } from '@/features/compras/hooks/use-cxp'
import { useGastosPendientesProveedor } from '@/features/contabilidad/hooks/use-gastos'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'

// ─── Interfaces ─────────────────────────────────────────────

export interface ProveedorEstadoCuentaProps {
  id: string
  empresa_id: string
  razon_social: string
  rif: string
  ciudad: string | null
  telefono: string | null
  saldo_actual: string
}

interface Props {
  proveedor: ProveedorEstadoCuentaProps
  isOpen: boolean
  onClose: () => void
}

interface RawDoc { id: string; ref: string; fecha: string; monto: string }
interface LedgerItem {
  id: string
  tipo: string
  referencia: string
  fecha: string
  cargo: number
  abono: number
  saldo: number
}

// ─── Componente principal ────────────────────────────────────

export function ProveedorEstadoCuentaModal({ proveedor, isOpen, onClose }: Props) {
  const today = todayStr()
  const [fechaDesde, setFechaDesde] = useState(startOfMonth())
  const [fechaHasta, setFechaHasta] = useState(today)

  const pid = proveedor.id
  const eid = proveedor.empresa_id

  // ── Datos para tab Movimientos ───────────────────────────────

  // Facturas de compra en el período (fuente de deuda)
  const { data: facRaw } = useQuery(
    pid ? `SELECT id, nro_factura as ref, fecha_factura as fecha, total_usd as monto
           FROM facturas_compra
           WHERE proveedor_id = ? AND empresa_id = ?
             AND DATE(fecha_factura) >= ? AND DATE(fecha_factura) <= ?
           ORDER BY fecha_factura ASC` : '',
    pid ? [pid, eid, fechaDesde, fechaHasta] : [],
  )

  // Gastos a crédito en el período (fuente de deuda)
  const { data: gtoRaw } = useQuery(
    pid ? `SELECT id, nro_gasto as ref, fecha, monto_usd as monto
           FROM gastos
           WHERE proveedor_id = ? AND empresa_id = ? AND status = 'REGISTRADO'
             AND DATE(fecha) >= ? AND DATE(fecha) <= ?
           ORDER BY fecha ASC` : '',
    pid ? [pid, eid, fechaDesde, fechaHasta] : [],
  )

  // Abonos (PAG/DEV) desde movimientos_cuenta_proveedor, filtrados en JS
  const { movimientos: todosMovs } = useMovCuentaProveedor(pid, eid)
  const pagMovs = useMemo(
    () => todosMovs.filter((m) => {
      const f = m.fecha.slice(0, 10)
      return (m.tipo === 'PAG' || m.tipo === 'DEV') && f >= fechaDesde && f <= fechaHasta
    }),
    [todosMovs, fechaDesde, fechaHasta],
  )

  // Construir ledger: deudas + abonos, ordenados por fecha, con saldo acumulado
  const ledger = useMemo((): LedgerItem[] => {
    const facs = ((facRaw ?? []) as RawDoc[]).map((r) => ({
      id: `fac-${r.id}`,
      tipo: 'Factura',
      referencia: r.ref,
      fecha: r.fecha?.slice(0, 10) ?? '',
      cargo: parseFloat(r.monto) || 0,
      abono: 0,
    }))
    const gtos = ((gtoRaw ?? []) as RawDoc[]).map((r) => ({
      id: `gto-${r.id}`,
      tipo: 'Gasto',
      referencia: r.ref,
      fecha: r.fecha?.slice(0, 10) ?? '',
      cargo: parseFloat(r.monto) || 0,
      abono: 0,
    }))
    const pags = pagMovs.map((m) => ({
      id: `pag-${m.id}`,
      tipo: m.tipo === 'DEV' ? 'Devol.' : 'Abono',
      referencia: m.referencia,
      fecha: m.fecha.slice(0, 10),
      cargo: 0,
      abono: parseFloat(m.monto) || 0,
    }))

    const all = [...facs, ...gtos, ...pags].sort((a, b) => a.fecha.localeCompare(b.fecha))

    let saldo = 0
    return all.map((item) => {
      saldo = saldo + item.cargo - item.abono
      return { ...item, saldo }
    })
  }, [facRaw, gtoRaw, pagMovs])

  // ── Datos para tab Documentos (mismas fuentes que CxP) ──────

  const { facturas: facturasPendientes, isLoading: loadingFacs } = useFacturasCompraPendientes(pid)
  const { gastosPendientes, isLoading: loadingGtos } = useGastosPendientesProveedor(pid)
  const loadingDocs = loadingFacs || loadingGtos

  const totalDeuda = useMemo(() => {
    const tf = facturasPendientes.reduce((s, f) => s + (parseFloat(f.saldo_pend_usd) || 0), 0)
    const tg = gastosPendientes.reduce((s, g) => s + (parseFloat(g.saldo_pendiente_usd) || 0), 0)
    return tf + tg
  }, [facturasPendientes, gastosPendientes])

  const saldoProveedor = parseFloat(proveedor.saldo_actual) || 0

  // ─── Filtro de fechas ────────────────────────────────────────

  const DateFilter = (
    <div className="flex flex-wrap items-end gap-3 rounded-xl bg-muted/30 border border-border px-4 py-3">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Desde</label>
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className="rounded-md border border-input px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Hasta</label>
        <input
          type="date"
          value={fechaHasta}
          min={fechaDesde}
          onChange={(e) => setFechaHasta(e.target.value)}
          className="rounded-md border border-input px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <button
        type="button"
        onClick={() => { setFechaDesde(startOfMonth()); setFechaHasta(today) }}
        className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        Mes actual
      </button>
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Estado de Cuenta — {proveedor.razon_social}</DialogTitle>
        </DialogHeader>

        {/* Header card */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-muted/40 border border-border p-4 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">RIF</p>
            <p className="font-mono font-medium">{proveedor.rif}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Ciudad</p>
            <p>{proveedor.ciudad ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Telefono</p>
            <p>{proveedor.telefono ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Saldo Actual</p>
            <p className={`font-bold tabular-nums ${saldoProveedor > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {formatUsd(proveedor.saldo_actual)}
            </p>
          </div>
        </div>

        <Tabs defaultValue="movimientos">
          <TabsList>
            <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
            <TabsTrigger value="documentos">Documentos pendientes</TabsTrigger>
          </TabsList>

          {/* ── Tab: Movimientos (ledger cronológico) ─── */}
          <TabsContent value="movimientos" className="space-y-3">
            {DateFilter}
            {ledger.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                Sin movimientos en el periodo seleccionado
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Fecha</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Tipo</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Referencia</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Saldo Adeudado</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Abonos</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Saldo Restante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                          {formatDate(item.fecha)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                            item.tipo === 'Abono' || item.tipo === 'Devol.'
                              ? 'bg-green-50 text-green-700 ring-green-600/20'
                              : item.tipo === 'Factura'
                              ? 'bg-blue-50 text-blue-700 ring-blue-600/20'
                              : 'bg-purple-50 text-purple-700 ring-purple-600/20'
                          }`}>
                            {item.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground max-w-[160px] truncate">
                          {item.referencia}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-destructive text-sm">
                          {item.cargo > 0 ? formatUsd(item.cargo) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-green-700 text-sm">
                          {item.abono > 0 ? formatUsd(item.abono) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-sm">
                          {formatUsd(item.saldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30">
                      <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        Totales del periodo
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-destructive text-sm">
                        {formatUsd(ledger.reduce((s, i) => s + i.cargo, 0))}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-green-700 text-sm">
                        {formatUsd(ledger.reduce((s, i) => s + i.abono, 0))}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-sm">
                        {formatUsd(ledger.at(-1)?.saldo ?? 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ── Tab: Documentos pendientes (igual que CxP) ── */}
          <TabsContent value="documentos" className="space-y-3">
            {loadingDocs ? (
              <div className="space-y-2 py-4">
                {[0, 1, 2].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
              </div>
            ) : (facturasPendientes.length === 0 && gastosPendientes.length === 0) ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                Sin documentos pendientes con este proveedor
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Tipo</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Nro</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Fecha</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Total</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Saldo Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturasPendientes.map((f) => (
                      <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-blue-50 text-blue-700 ring-blue-600/20">
                            Factura
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{f.nro_factura}</td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                          {formatDate(f.fecha_factura)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatUsd(parseFloat(f.total_usd))}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-destructive">
                          {formatUsd(parseFloat(f.saldo_pend_usd))}
                        </td>
                      </tr>
                    ))}
                    {gastosPendientes.map((g) => (
                      <tr key={g.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-purple-50 text-purple-700 ring-purple-600/20">
                            Gasto
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{g.nro_gasto}</td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                          {formatDate(g.fecha)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatUsd(parseFloat(g.monto_usd))}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-destructive">
                          {formatUsd(parseFloat(g.saldo_pendiente_usd))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30">
                      <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        Total pendiente
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-destructive">
                        {formatUsd(totalDeuda)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border pt-3 mt-1">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Saldo Total con Proveedor
          </span>
          <span className={`text-lg font-bold tabular-nums ${saldoProveedor > 0 ? 'text-destructive' : 'text-foreground'}`}>
            {formatUsd(proveedor.saldo_actual)}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
