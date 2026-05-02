import { useEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import { Printer, X } from '@phosphor-icons/react'
import type { Gasto } from '@/features/contabilidad/hooks/use-gastos'
import { formatDate } from '@/lib/format'
import { formatUsd, formatBs } from '@/lib/currency'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'

// ─── Tipos ────────────────────────────────────────────────────

export type TipoReporte = 'POR_CUENTA' | 'DETALLADO' | 'ESPECIFICO'

type GastoConJoins = Gasto & {
  cuenta_nombre: string
  proveedor_nombre: string | null
}

interface GastoReportesProps {
  gastos: GastoConJoins[]
  reporte: TipoReporte | null
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────

function tituloReporte(tipo: TipoReporte): string {
  switch (tipo) {
    case 'POR_CUENTA':
      return 'Reporte por Cuenta'
    case 'DETALLADO':
      return 'Reporte Detallado'
    case 'ESPECIFICO':
      return 'Busqueda Especifica'
  }
}

// ─── Sub-vistas ───────────────────────────────────────────────

interface ReportePorCuentaProps {
  gastos: GastoConJoins[]
  tasaValor: number
}

function ReportePorCuenta({ gastos, tasaValor }: ReportePorCuentaProps) {
  const registrados = gastos.filter((g) => g.status === 'REGISTRADO')

  // Agrupar por cuenta
  const porCuenta = registrados.reduce<
    Record<string, { nombre: string; totalUsd: number; totalBs: number; cantidad: number }>
  >((acc, g) => {
    const key = g.cuenta_id
    const nombre = g.cuenta_nombre ?? 'Sin cuenta'
    if (!acc[key]) {
      acc[key] = { nombre, totalUsd: 0, totalBs: 0, cantidad: 0 }
    }
    acc[key].totalUsd += parseFloat(g.monto_usd) || 0
    acc[key].totalBs += parseFloat(g.monto_usd) * tasaValor || 0
    acc[key].cantidad += 1
    return acc
  }, {})

  const filas = Object.entries(porCuenta).sort((a, b) =>
    a[1].nombre.localeCompare(b[1].nombre)
  )

  const grandTotalUsd = filas.reduce((sum, [, v]) => sum + v.totalUsd, 0)
  const grandTotalBs = filas.reduce((sum, [, v]) => sum + v.totalBs, 0)
  const grandCantidad = filas.reduce((sum, [, v]) => sum + v.cantidad, 0)

  if (filas.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        No hay gastos registrados para mostrar
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Cuenta</th>
            <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Total USD</th>
            <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Total Bs</th>
            <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(([id, v]) => (
            <tr key={id} className="border-b border-border hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3 text-foreground">{v.nombre}</td>
              <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                {formatUsd(v.totalUsd)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {formatBs(v.totalBs)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {v.cantidad}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/50 font-semibold">
            <td className="px-4 py-3 text-foreground">Total General</td>
            <td className="px-4 py-3 text-right tabular-nums text-foreground">
              {formatUsd(grandTotalUsd)}
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
              {formatBs(grandTotalBs)}
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
              {grandCantidad}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────

interface TablaDetalladaProps {
  gastos: GastoConJoins[]
  tasaValor: number
}

function TablaDetallada({ gastos, tasaValor }: TablaDetalladaProps) {
  if (gastos.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        No hay gastos para mostrar
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Nro</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fecha</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Cuenta</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Proveedor</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Descripcion</th>
            <th className="text-right px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Monto USD</th>
            <th className="text-right px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Monto Bs</th>
            <th className="text-center px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          {gastos.map((g) => (
            <tr
              key={g.id}
              className="border-b border-border hover:bg-muted/30 transition-colors"
            >
              <td className="px-3 py-2 font-mono text-foreground">{g.nro_gasto}</td>
              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                {formatDate(g.fecha)}
              </td>
              <td className="px-3 py-2 text-foreground">{g.cuenta_nombre}</td>
              <td className="px-3 py-2 text-muted-foreground">{g.proveedor_nombre ?? '—'}</td>
              <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">
                {g.descripcion}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                {formatUsd(g.monto_usd)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {formatBs(parseFloat(g.monto_usd) * tasaValor)}
              </td>
              <td className="px-3 py-2 text-center">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                    g.status === 'REGISTRADO'
                      ? 'bg-green-50 text-green-700 ring-green-600/20'
                      : 'bg-red-50 text-red-700 ring-red-600/20'
                  }`}
                >
                  {g.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────

interface ReporteEspecificoProps {
  gastos: GastoConJoins[]
  tasaValor: number
}

function ReporteEspecifico({ gastos, tasaValor }: ReporteEspecificoProps) {
  const [nroGasto, setNroGasto] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [referencia, setReferencia] = useState('')

  const filtrados = gastos.filter((g) => {
    const matchNro = nroGasto
      ? g.nro_gasto.toLowerCase().includes(nroGasto.toLowerCase())
      : true
    const matchProv = proveedor
      ? (g.proveedor_nombre ?? '').toLowerCase().includes(proveedor.toLowerCase())
      : true
    const matchRef = referencia
      ? (g.referencia ?? '').toLowerCase().includes(referencia.toLowerCase())
      : true
    return matchNro && matchProv && matchRef
  })

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Nro Gasto
          </label>
          <input
            type="text"
            value={nroGasto}
            onChange={(e) => setNroGasto(e.target.value)}
            placeholder="GTO-0001"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Proveedor
          </label>
          <input
            type="text"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            placeholder="Nombre del proveedor"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Referencia
          </label>
          <input
            type="text"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Nro de referencia"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Resultados */}
      <p className="text-xs text-muted-foreground">
        {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''} encontrado
        {filtrados.length !== 1 ? 's' : ''}
      </p>
      <TablaDetallada gastos={filtrados} tasaValor={tasaValor} />
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

export const GastoReportes: FC<GastoReportesProps> = ({
  gastos,
  reporte,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { tasaValor } = useTasaActual()

  useEffect(() => {
    if (reporte !== null) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [reporte])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-4xl shadow-xl bg-card text-foreground"
    >
      {reporte && (
        <>
          <style>{'@media print { .no-print { display: none } }'}</style>

          <div className="p-6 max-h-[90vh] overflow-y-auto">
            {/* Encabezado */}
            <div className="flex items-center justify-between mb-6 no-print">
              <h2 className="text-lg font-semibold text-foreground">
                {tituloReporte(reporte)}
              </h2>
              <div className="flex items-center gap-2">
                {reporte === 'DETALLADO' && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Contenido segun tipo de reporte */}
            {reporte === 'POR_CUENTA' && <ReportePorCuenta gastos={gastos} tasaValor={tasaValor} />}
            {reporte === 'DETALLADO' && <TablaDetallada gastos={gastos} tasaValor={tasaValor} />}
            {reporte === 'ESPECIFICO' && <ReporteEspecifico gastos={gastos} tasaValor={tasaValor} />}
          </div>
        </>
      )}
    </dialog>
  )
}
