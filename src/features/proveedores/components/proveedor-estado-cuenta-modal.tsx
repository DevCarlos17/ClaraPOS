import { useMemo, useState } from 'react'
import { useQuery } from '@powersync/react'
import { formatUsd } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { startOfMonth, todayStr } from '@/lib/dates'
import { useMovCuentaProveedor } from '@/features/compras/hooks/use-mov-cuenta-proveedor'
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

interface DocResumen {
  id: string
  nro_doc: string
  fecha: string
  total_usd: string
  saldo_pend_usd: string
  status: string
  tipo_doc: 'FACTURA' | 'GASTO'
}

// ─── Badge de status ─────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PAGADO:    { label: 'Pagado',    cls: 'bg-green-50 text-green-700 ring-green-600/20' },
    PROCESADA: { label: 'Procesada', cls: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
    REGISTRADO:{ label: 'Registrado',cls: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
    PENDIENTE: { label: 'Pendiente', cls: 'bg-orange-50 text-orange-700 ring-orange-600/20' },
    PARCIAL:   { label: 'Parcial',   cls: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20' },
    ANULADO:   { label: 'Anulado',   cls: 'bg-red-50 text-red-700 ring-red-600/20' },
    REVERSADA: { label: 'Reversada', cls: 'bg-gray-50 text-gray-600 ring-gray-400/20' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground ring-border' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${s.cls}`}>
      {s.label}
    </span>
  )
}

// ─── Componente principal ────────────────────────────────────

export function ProveedorEstadoCuentaModal({ proveedor, isOpen, onClose }: Props) {
  const today = todayStr()
  const [fechaDesde, setFechaDesde] = useState(startOfMonth())
  const [fechaHasta, setFechaHasta] = useState(today)

  // Movimientos filtrados por fecha
  const { movimientos: todosMovimientos, isLoading: loadingMovs } = useMovCuentaProveedor(
    proveedor.id,
    proveedor.empresa_id,
  )

  const movimientos = useMemo(
    () => todosMovimientos.filter((m) => {
      const f = m.fecha.slice(0, 10)
      return f >= fechaDesde && f <= fechaHasta
    }),
    [todosMovimientos, fechaDesde, fechaHasta],
  )

  // Documentos: facturas_compra + gastos a crédito, filtrados por fecha
  const { data: facturasRaw, isLoading: loadingFacturas } = useQuery(
    proveedor.id
      ? `SELECT id, nro_factura as nro_doc, fecha_factura as fecha,
                total_usd, saldo_pend_usd, status, 'FACTURA' as tipo_doc
         FROM facturas_compra
         WHERE proveedor_id = ? AND empresa_id = ?
           AND DATE(fecha_factura) >= ? AND DATE(fecha_factura) <= ?
         ORDER BY fecha_factura ASC`
      : '',
    proveedor.id ? [proveedor.id, proveedor.empresa_id, fechaDesde, fechaHasta] : [],
  )

  const { data: gastosRaw, isLoading: loadingGastos } = useQuery(
    proveedor.id
      ? `SELECT id, nro_gasto as nro_doc, fecha,
                monto_usd as total_usd, saldo_pendiente_usd as saldo_pend_usd,
                status, 'GASTO' as tipo_doc
         FROM gastos
         WHERE proveedor_id = ? AND empresa_id = ?
           AND DATE(fecha) >= ? AND DATE(fecha) <= ?
         ORDER BY fecha ASC`
      : '',
    proveedor.id ? [proveedor.id, proveedor.empresa_id, fechaDesde, fechaHasta] : [],
  )

  const documentos = useMemo(() => {
    const facs = (facturasRaw ?? []) as DocResumen[]
    const gsts = (gastosRaw ?? []) as DocResumen[]
    return [...facs, ...gsts].sort((a, b) => a.fecha.localeCompare(b.fecha))
  }, [facturasRaw, gastosRaw])

  const loadingDocs = loadingFacturas || loadingGastos
  const saldo = parseFloat(proveedor.saldo_actual) || 0

  // ─── Filtro de fechas ────────────────────────────────────

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
            <p className="font-mono font-medium text-foreground">{proveedor.rif}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Ciudad</p>
            <p className="text-foreground">{proveedor.ciudad ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Telefono</p>
            <p className="text-foreground">{proveedor.telefono ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Saldo Actual</p>
            <p className={`font-bold tabular-nums ${saldo > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {formatUsd(proveedor.saldo_actual)}
            </p>
          </div>
        </div>

        {/* Filtro de fechas */}
        {DateFilter}

        {/* Tabs */}
        <Tabs defaultValue="movimientos">
          <TabsList>
            <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
          </TabsList>

          {/* Tab: Movimientos */}
          <TabsContent value="movimientos">
            {loadingMovs ? (
              <div className="space-y-2 py-4">
                {[0, 1, 2].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
              </div>
            ) : movimientos.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                Sin movimientos en el periodo seleccionado
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-lg mt-2">
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
                    {movimientos.map((mov) => {
                      // FAC/SAL/CARG = deuda → Debe | PAG/DEV = pago → Haber
                      const isDebe = mov.tipo === 'FAC' || mov.tipo === 'SAL' || mov.tipo === 'CARG'
                      const monto = parseFloat(mov.monto) || 0
                      return (
                        <tr key={mov.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                            {formatDate(mov.fecha)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-xs">{mov.tipo}</span>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground max-w-[180px] truncate">
                            {mov.referencia}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-destructive">
                            {isDebe ? formatUsd(monto) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-green-700">
                            {!isDebe ? formatUsd(monto) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                            {formatUsd(mov.saldo_nuevo)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Tab: Documentos (facturas + gastos) */}
          <TabsContent value="documentos">
            {loadingDocs ? (
              <div className="space-y-2 py-4">
                {[0, 1, 2].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
              </div>
            ) : documentos.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                Sin documentos en el periodo seleccionado
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-lg mt-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Tipo</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Nro</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Fecha</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Total</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Pagado</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Saldo</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentos.map((doc) => {
                      const total = parseFloat(doc.total_usd) || 0
                      const saldoPend = parseFloat(doc.saldo_pend_usd) || 0
                      const pagado = total - saldoPend
                      return (
                        <tr key={`${doc.tipo_doc}-${doc.id}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                              doc.tipo_doc === 'FACTURA'
                                ? 'bg-blue-50 text-blue-700 ring-blue-600/20'
                                : 'bg-purple-50 text-purple-700 ring-purple-600/20'
                            }`}>
                              {doc.tipo_doc === 'FACTURA' ? 'Factura' : 'Gasto'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                            {doc.nro_doc}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                            {formatDate(doc.fecha)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {formatUsd(total)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-green-700">
                            {formatUsd(pagado)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium text-destructive">
                            {formatUsd(saldoPend)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <StatusBadge status={doc.status} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30">
                      <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        Saldo pendiente en periodo
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-destructive">
                        {formatUsd(documentos.reduce((s, d) => s + (parseFloat(d.saldo_pend_usd) || 0), 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Footer: saldo total del proveedor */}
        <div className="flex items-center justify-between border-t border-border pt-3 mt-1">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Saldo Total Proveedor
          </span>
          <span className={`text-lg font-bold tabular-nums ${saldo > 0 ? 'text-destructive' : 'text-foreground'}`}>
            {formatUsd(proveedor.saldo_actual)}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
