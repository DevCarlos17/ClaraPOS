import { useMemo, useState } from 'react'
import { useQuery } from '@powersync/react'
import Decimal from 'decimal.js'
import { formatUsd } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { startOfMonth, todayStr } from '@/lib/dates'
import { useMovCuentaProveedor } from '@/features/compras/hooks/use-mov-cuenta-proveedor'
import { FacturaProveedorModal } from '@/features/compras/components/factura-proveedor-modal'
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

interface LedgerRawDoc {
  id: string
  ref: string
  fecha: string
  monto: string
}

interface LedgerItem {
  id: string
  tipo: string
  referencia: string
  fecha: string
  cargo: number
  abono: number
  saldo: number
}

interface DocRow {
  id: string
  tipo_doc: 'COMPRA' | 'GASTO'
  nro: string
  fecha: string
  total_usd: string
  saldo_pend: string
}

// ─── Filtro de fechas compartido ─────────────────────────────

function DateFilter({
  desde,
  hasta,
  onDesde,
  onHasta,
  onReset,
}: {
  desde: string
  hasta: string
  onDesde: (v: string) => void
  onHasta: (v: string) => void
  onReset: () => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl bg-muted/30 border border-border px-4 py-3">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Desde</label>
        <input
          type="date"
          value={desde}
          onChange={(e) => onDesde(e.target.value)}
          className="rounded-md border border-input px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Hasta</label>
        <input
          type="date"
          value={hasta}
          min={desde}
          onChange={(e) => onHasta(e.target.value)}
          className="rounded-md border border-input px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <button
        type="button"
        onClick={onReset}
        className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        Mes actual
      </button>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────

export function ProveedorEstadoCuentaModal({ proveedor, isOpen, onClose }: Props) {
  const today = todayStr()
  const defaultDesde = startOfMonth()

  // Rango de fechas compartido por ambas pestañas
  const [fechaDesde, setFechaDesde] = useState(defaultDesde)
  const [fechaHasta, setFechaHasta] = useState(today)

  // Modal de detalle de factura/gasto
  const [detalleDoc, setDetalleDoc] = useState<{ id: string; tipo: 'COMPRA' | 'GASTO' } | null>(null)

  const pid = proveedor.id
  const eid = proveedor.empresa_id

  // ── Datos para tab Movimientos (historia completa, sin filtro de fecha) ─────

  // Todas las facturas del proveedor — para calcular el balance corriente desde el inicio
  const { data: facLedgerRaw } = useQuery(
    pid ? `SELECT id, nro_factura AS ref, fecha_factura AS fecha, total_usd AS monto
           FROM facturas_compra
           WHERE proveedor_id = ? AND empresa_id = ?
           ORDER BY fecha_factura ASC, created_at ASC` : '',
    pid ? [pid, eid] : [],
  )

  // Todos los gastos del proveedor — idem
  const { data: gtoLedgerRaw } = useQuery(
    pid ? `SELECT id, nro_gasto AS ref, fecha, monto_usd AS monto
           FROM gastos
           WHERE proveedor_id = ? AND empresa_id = ? AND status = 'REGISTRADO'
           ORDER BY fecha ASC, created_at ASC` : '',
    pid ? [pid, eid] : [],
  )

  const { movimientos: todosMovs } = useMovCuentaProveedor(pid, eid)

  // Todos los movimientos de cuenta (PAG + DEV) sin filtro de fecha
  const allMovs = useMemo(
    () => todosMovs.filter((m) => m.tipo === 'PAG' || m.tipo === 'DEV'),
    [todosMovs],
  )

  /**
   * Ledger estilo Kardex: historial completo cronologico con balance corriente.
   *
   * Cada evento contribuye al balance global con el proveedor:
   *   Factura / Gasto  → cargo  (suma al balance)
   *   PAG              → abono  (resta al balance)
   *   DEV (reversa)    → cargo  (restaura la deuda, aparece en columna Saldo Adeudado)
   *
   * El saldo de cada fila es el balance acumulado hasta ese momento — igual al
   * extracto de un banco, no el saldo restante del documento individual.
   */
  const ledger = useMemo((): LedgerItem[] => {
    const facs = ((facLedgerRaw ?? []) as LedgerRawDoc[]).map((r) => ({
      id: `fac-${r.id}`,
      tipo: 'Factura',
      referencia: r.ref,
      fecha: r.fecha?.slice(0, 10) ?? '',
      cargo: new Decimal(r.monto || '0').toNumber(),
      abono: 0,
      saldo: 0, // se calcula abajo
    }))

    const gtos = ((gtoLedgerRaw ?? []) as LedgerRawDoc[]).map((r) => ({
      id: `gto-${r.id}`,
      tipo: 'Gasto',
      referencia: r.ref,
      fecha: r.fecha?.slice(0, 10) ?? '',
      cargo: new Decimal(r.monto || '0').toNumber(),
      abono: 0,
      saldo: 0,
    }))

    const pags = allMovs.map((m) => {
      const isReversal = m.tipo === 'DEV'
      return {
        id: `pag-${m.id}`,
        tipo: isReversal ? 'Reversa' : 'Abono',
        referencia: m.referencia,
        fecha: m.fecha.slice(0, 10),
        // DEV restaura la deuda → va en cargo, no en abono
        cargo: isReversal ? new Decimal(m.monto || '0').toNumber() : 0,
        abono: isReversal ? 0 : new Decimal(m.monto || '0').toNumber(),
        saldo: 0,
      }
    })

    // Orden cronologico; mismo dia: cargos antes que abonos
    const sorted = [...facs, ...gtos, ...pags].sort((a, b) => {
      const d = a.fecha.localeCompare(b.fecha)
      if (d !== 0) return d
      if (a.cargo > 0 && b.abono > 0) return -1
      if (a.abono > 0 && b.cargo > 0) return 1
      return 0
    })

    // Balance corriente acumulado desde cero
    let running = 0
    return sorted.map((item) => {
      running += item.cargo - item.abono
      return { ...item, saldo: Math.max(0, running) }
    })
  }, [facLedgerRaw, gtoLedgerRaw, allMovs])

  // ── Datos para tab Facturas (TODAS, con filtro fecha) ────────

  const { data: facAllRaw } = useQuery(
    pid ? `SELECT id, 'COMPRA' AS tipo_doc, nro_factura AS nro, fecha_factura AS fecha,
                  total_usd, saldo_pend_usd AS saldo_pend
           FROM facturas_compra
           WHERE proveedor_id = ? AND empresa_id = ?
             AND DATE(fecha_factura) >= ? AND DATE(fecha_factura) <= ?
           ORDER BY fecha_factura DESC` : '',
    pid ? [pid, eid, fechaDesde, fechaHasta] : [],
  )

  const { data: gtoAllRaw } = useQuery(
    pid ? `SELECT id, 'GASTO' AS tipo_doc, nro_gasto AS nro, fecha,
                  monto_usd AS total_usd, saldo_pendiente_usd AS saldo_pend
           FROM gastos
           WHERE proveedor_id = ? AND empresa_id = ? AND status = 'REGISTRADO'
             AND DATE(fecha) >= ? AND DATE(fecha) <= ?
           ORDER BY fecha DESC` : '',
    pid ? [pid, eid, fechaDesde, fechaHasta] : [],
  )

  const docsAll = useMemo((): DocRow[] => {
    const facs = ((facAllRaw ?? []) as DocRow[])
    const gtos = ((gtoAllRaw ?? []) as DocRow[])
    return [...facs, ...gtos].sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [facAllRaw, gtoAllRaw])

  const totalPendiente = useMemo(
    () => docsAll.reduce((s, d) => s.plus(new Decimal(d.saldo_pend || '0')), new Decimal(0)).toNumber(),
    [docsAll],
  )

  const saldoProveedor = new Decimal(proveedor.saldo_actual || '0').toNumber()

  function resetFechas() {
    setFechaDesde(defaultDesde)
    setFechaHasta(today)
  }

  return (
    <>
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
                {formatUsd(saldoProveedor)}
              </p>
            </div>
          </div>

          <Tabs defaultValue="movimientos">
            <TabsList>
              <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
              <TabsTrigger value="facturas">Facturas</TabsTrigger>
            </TabsList>

            {/* ── Tab: Movimientos ─── */}
            <TabsContent value="movimientos" className="space-y-3">
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
                              item.tipo === 'Abono'
                                ? 'bg-green-50 text-green-700 ring-green-600/20'
                                : item.tipo === 'Factura'
                                ? 'bg-blue-50 text-blue-700 ring-blue-600/20'
                                : item.tipo === 'Reversa'
                                ? 'bg-orange-50 text-orange-700 ring-orange-600/20'
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
                          Totales historicos
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

            {/* ── Tab: Facturas (todas, con filtro fecha) ── */}
            <TabsContent value="facturas" className="space-y-3">
              <DateFilter
                desde={fechaDesde}
                hasta={fechaHasta}
                onDesde={setFechaDesde}
                onHasta={setFechaHasta}
                onReset={resetFechas}
              />
              {docsAll.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  Sin facturas ni gastos en el periodo seleccionado
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
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Abonado</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Pendiente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docsAll.map((doc) => {
                        const total = new Decimal(doc.total_usd || '0')
                        const pend = new Decimal(doc.saldo_pend || '0')
                        const abonado = Decimal.max(new Decimal(0), total.minus(pend))
                        const isPending = pend.gt(new Decimal('0.001'))
                        return (
                          <tr
                            key={`${doc.tipo_doc}-${doc.id}`}
                            onClick={() => setDetalleDoc({ id: doc.id, tipo: doc.tipo_doc })}
                            className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                                doc.tipo_doc === 'COMPRA'
                                  ? 'bg-blue-50 text-blue-700 ring-blue-600/20'
                                  : 'bg-purple-50 text-purple-700 ring-purple-600/20'
                              }`}>
                                {doc.tipo_doc === 'COMPRA' ? 'Factura' : 'Gasto'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs">{doc.nro}</td>
                            <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                              {formatDate(doc.fecha)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {formatUsd(total.toNumber())}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-green-700">
                              {formatUsd(abonado.toNumber())}
                            </td>
                            <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${isPending ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {formatUsd(pend.toNumber())}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30">
                        <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                          Total pendiente en periodo
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold tabular-nums text-destructive">
                          {formatUsd(totalPendiente)}
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
              {formatUsd(saldoProveedor)}
            </span>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de detalle: se renderiza fuera del Dialog para evitar apilamiento */}
      {detalleDoc && (
        <FacturaProveedorModal
          tipo={detalleDoc.tipo}
          id={detalleDoc.id}
          isOpen={true}
          onClose={() => setDetalleDoc(null)}
        />
      )}
    </>
  )
}
