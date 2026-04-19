import { useEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import { Printer, X } from 'lucide-react'
import type { Gasto } from '@/features/contabilidad/hooks/use-gastos'
import { formatDate } from '@/lib/format'
import { formatUsd, formatBs } from '@/lib/currency'

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
}

function ReportePorCuenta({ gastos }: ReportePorCuentaProps) {
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
    acc[key].totalBs += parseFloat(g.monto_bs) || 0
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
      <p className="text-center text-sm text-gray-500 py-8">
        No hay gastos registrados para mostrar
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-4 py-3 font-medium text-gray-700">Cuenta</th>
            <th className="text-right px-4 py-3 font-medium text-gray-700">Total USD</th>
            <th className="text-right px-4 py-3 font-medium text-gray-700">Total Bs</th>
            <th className="text-right px-4 py-3 font-medium text-gray-700">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(([id, v]) => (
            <tr key={id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900">{v.nombre}</td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                {formatUsd(v.totalUsd)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                {formatBs(v.totalBs)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                {v.cantidad}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
            <td className="px-4 py-3 text-gray-900">Total General</td>
            <td className="px-4 py-3 text-right tabular-nums text-gray-900">
              {formatUsd(grandTotalUsd)}
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-gray-600">
              {formatBs(grandTotalBs)}
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-gray-600">
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
}

function TablaDetallada({ gastos }: TablaDetalladaProps) {
  if (gastos.length === 0) {
    return (
      <p className="text-center text-sm text-gray-500 py-8">
        No hay gastos para mostrar
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-3 py-3 font-medium text-gray-700">Nro</th>
            <th className="text-left px-3 py-3 font-medium text-gray-700">Fecha</th>
            <th className="text-left px-3 py-3 font-medium text-gray-700">Cuenta</th>
            <th className="text-left px-3 py-3 font-medium text-gray-700">Proveedor</th>
            <th className="text-left px-3 py-3 font-medium text-gray-700">Descripcion</th>
            <th className="text-right px-3 py-3 font-medium text-gray-700">Monto USD</th>
            <th className="text-right px-3 py-3 font-medium text-gray-700">Monto Bs</th>
            <th className="text-center px-3 py-3 font-medium text-gray-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {gastos.map((g) => (
            <tr
              key={g.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2 font-mono text-gray-700">{g.nro_gasto}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                {formatDate(g.fecha)}
              </td>
              <td className="px-3 py-2 text-gray-900">{g.cuenta_nombre}</td>
              <td className="px-3 py-2 text-gray-600">{g.proveedor_nombre ?? '-'}</td>
              <td className="px-3 py-2 text-gray-700 max-w-xs truncate">
                {g.descripcion}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                {formatUsd(g.monto_usd)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                {formatBs(g.monto_bs)}
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
}

function ReporteEspecifico({ gastos }: ReporteEspecificoProps) {
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
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Nro Gasto
          </label>
          <input
            type="text"
            value={nroGasto}
            onChange={(e) => setNroGasto(e.target.value)}
            placeholder="GTO-0001"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Proveedor
          </label>
          <input
            type="text"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            placeholder="Nombre del proveedor"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Referencia
          </label>
          <input
            type="text"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Nro de referencia"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Resultados */}
      <p className="text-xs text-gray-500">
        {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''} encontrado
        {filtrados.length !== 1 ? 's' : ''}
      </p>
      <TablaDetallada gastos={filtrados} />
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
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-4xl shadow-xl"
    >
      {reporte && (
        <>
          <style>{'@media print { .no-print { display: none } }'}</style>

          <div className="p-6 max-h-[90vh] overflow-y-auto">
            {/* Encabezado */}
            <div className="flex items-center justify-between mb-6 no-print">
              <h2 className="text-lg font-semibold text-gray-900">
                {tituloReporte(reporte)}
              </h2>
              <div className="flex items-center gap-2">
                {reporte === 'DETALLADO' && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Contenido segun tipo de reporte */}
            {reporte === 'POR_CUENTA' && <ReportePorCuenta gastos={gastos} />}
            {reporte === 'DETALLADO' && <TablaDetallada gastos={gastos} />}
            {reporte === 'ESPECIFICO' && <ReporteEspecifico gastos={gastos} />}
          </div>
        </>
      )}
    </dialog>
  )
}
