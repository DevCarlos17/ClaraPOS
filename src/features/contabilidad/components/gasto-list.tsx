import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  useGastos,
  anularGasto,
  type Gasto,
} from '@/features/contabilidad/hooks/use-gastos'
import { GastoForm } from './gasto-form'
import { formatDate } from '@/lib/format'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Tipo extendido con joins ─────────────────────────────────

type GastoConJoins = Gasto & {
  cuenta_nombre: string
  proveedor_nombre: string | null
}

// ─── Badge de status ──────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'REGISTRADO') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
        REGISTRADO
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
      ANULADO
    </span>
  )
}

// ─── Skeleton de carga ────────────────────────────────────────

function TablaSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-9 w-40 bg-gray-200 rounded animate-pulse" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
      ))}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

export function GastoList() {
  const { user } = useCurrentUser()
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [anulandoId, setAnulandoId] = useState<string | null>(null)

  const { gastos, isLoading } = useGastos(
    fechaDesde || undefined,
    fechaHasta || undefined
  )

  async function handleAnular(gasto: GastoConJoins) {
    const confirmar = window.confirm(
      '¿Esta seguro de anular este gasto? Esta accion no se puede deshacer.'
    )
    if (!confirmar) return

    setAnulandoId(gasto.id)
    try {
      await anularGasto(gasto.id, user?.id)
      toast.success(`Gasto ${gasto.nro_gasto} anulado`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setAnulandoId(null)
    }
  }

  if (isLoading) {
    return <TablaSkeleton />
  }

  return (
    <div>
      {/* Barra superior con filtros y boton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 mb-4">
        {/* Filtros de fecha */}
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="text-lg font-semibold text-gray-900 w-full sm:w-auto">
            Gastos
            <span className="text-sm font-normal text-gray-500 ml-2">({gastos.length})</span>
          </h2>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Boton nuevo */}
        <button
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nuevo Gasto
        </button>
      </div>

      {/* Tabla / estado vacio */}
      {gastos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay gastos registrados</p>
          <p className="text-sm mt-1">
            Haz clic en "Nuevo Gasto" para registrar un egreso
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nro Gasto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Cuenta</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Proveedor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Descripcion</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Monto USD</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => {
                const anulado = g.status === 'ANULADO'

                return (
                  <tr
                    key={g.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className={`px-4 py-3 font-mono text-gray-900 ${anulado ? 'line-through text-gray-400' : ''}`}>
                      {g.nro_gasto}
                    </td>
                    <td className={`px-4 py-3 text-gray-600 whitespace-nowrap ${anulado ? 'line-through' : ''}`}>
                      {formatDate(g.fecha)}
                    </td>
                    <td className={`px-4 py-3 text-gray-900 ${anulado ? 'line-through text-gray-400' : ''}`}>
                      {g.cuenta_nombre}
                    </td>
                    <td className={`px-4 py-3 text-gray-600 ${anulado ? 'line-through text-gray-400' : ''}`}>
                      {g.proveedor_nombre ?? '-'}
                    </td>
                    <td className={`px-4 py-3 text-gray-700 max-w-xs truncate ${anulado ? 'line-through text-gray-400' : ''}`}>
                      {g.descripcion}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${anulado ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      {parseFloat(g.monto_usd).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={g.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!anulado && (
                        <button
                          onClick={() => handleAnular(g as GastoConJoins)}
                          disabled={anulandoId === g.id}
                          className="text-sm font-medium text-red-600 hover:text-red-800 transition-colors disabled:opacity-50"
                        >
                          {anulandoId === g.id ? 'Anulando...' : 'Anular'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogo de creacion */}
      <GastoForm isOpen={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
