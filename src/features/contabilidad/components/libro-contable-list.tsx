import { useState } from 'react'
import { CheckCircle, ArrowCounterClockwise, Plus, CaretDown } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  useLibroContable,
  conciliarAsiento,
  reversarAsientoManual,
  type AsientoContable,
  type FiltrosLibro,
} from '@/features/contabilidad/hooks/use-libro-contable'
import { LibroContableForm } from './libro-contable-form'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { MODULO_LABELS } from '@/features/contabilidad/schemas/libro-contable-schema'

// ─── Badges ───────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === 'CONCILIADO') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
        Conciliado
      </span>
    )
  }
  if (estado === 'ANULADO') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
        Anulado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">
      Pendiente
    </span>
  )
}

function ModuloBadge({ modulo }: { modulo: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
      {MODULO_LABELS[modulo] ?? modulo}
    </span>
  )
}

// ─── Filtros ─────────────────────────────────────────────────

interface FiltroPanelProps {
  filtros: FiltrosLibro
  onChange: (f: FiltrosLibro) => void
}

function FiltroPanel({ filtros, onChange }: FiltroPanelProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
        <input
          type="date"
          value={filtros.fechaDesde ?? ''}
          onChange={(e) => onChange({ ...filtros, fechaDesde: e.target.value || undefined })}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
        <input
          type="date"
          value={filtros.fechaHasta ?? ''}
          onChange={(e) => onChange({ ...filtros, fechaHasta: e.target.value || undefined })}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Modulo</label>
        <select
          value={filtros.modulo ?? ''}
          onChange={(e) => onChange({ ...filtros, modulo: e.target.value || undefined })}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos</option>
          {Object.entries(MODULO_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
        <select
          value={filtros.estado ?? ''}
          onChange={(e) => onChange({ ...filtros, estado: e.target.value || undefined })}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="CONCILIADO">Conciliado</option>
          <option value="ANULADO">Anulado</option>
        </select>
      </div>
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
      ))}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

export function LibroContableList() {
  const { user } = useCurrentUser()
  const [filtros, setFiltros] = useState<FiltrosLibro>({})
  const [formOpen, setFormOpen] = useState(false)
  const [showFiltros, setShowFiltros] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const { asientos, isLoading } = useLibroContable(filtros)

  // Calcular saldo acumulado en frontend (running balance)
  const asientosConSaldo = [...asientos].reverse().reduce<
    Array<AsientoContable & { saldo_acumulado: number }>
  >((acc, a) => {
    const prevSaldo = acc[acc.length - 1]?.saldo_acumulado ?? 0
    acc.push({ ...a, saldo_acumulado: prevSaldo + Number(a.monto) })
    return acc
  }, []).reverse()

  async function handleConciliar(id: string) {
    setProcessingId(id)
    try {
      await conciliarAsiento(id)
      toast.success('Asiento conciliado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setProcessingId(null)
    }
  }

  async function handleReversar(a: AsientoContable) {
    if (!user) return
    setProcessingId(a.id)
    try {
      await reversarAsientoManual(a.id, a.empresa_id, user.id)
      toast.success('Asiento reversado. Se crearon los contra-asientos.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Libro Contable
            <span className="text-sm font-normal text-gray-500 ml-2">({asientos.length})</span>
          </h2>
          <button
            onClick={() => setShowFiltros(!showFiltros)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Filtros
            <CaretDown className={`h-3 w-3 transition-transform ${showFiltros ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Asiento Manual
        </button>
      </div>

      {/* Filtros */}
      {showFiltros && (
        <FiltroPanel filtros={filtros} onChange={setFiltros} />
      )}

      {/* Tabla */}
      {isLoading ? (
        <Skeleton />
      ) : asientos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay asientos contables</p>
          <p className="text-sm mt-1">Los asientos se generan automaticamente con cada operacion</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-3 py-2 font-medium text-gray-700">Nro</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700">Fecha</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700">Modulo</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700">Documento</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700">Cuenta</th>
                <th className="text-right px-3 py-2 font-medium text-gray-700">Debe</th>
                <th className="text-right px-3 py-2 font-medium text-gray-700">Haber</th>
                <th className="text-right px-3 py-2 font-medium text-gray-700">Saldo</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700">Estado</th>
                <th className="text-right px-3 py-2 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {asientosConSaldo.map((a) => {
                const monto = Number(a.monto)
                const debe = monto > 0 ? monto : 0
                const haber = monto < 0 ? Math.abs(monto) : 0
                const isPending = a.estado === 'PENDIENTE'

                return (
                  <tr
                    key={a.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      a.estado === 'ANULADO' ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-gray-700">{a.nro_asiento}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {new Date(a.fecha_registro).toLocaleDateString('es-VE', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <ModuloBadge modulo={a.modulo_origen} />
                    </td>
                    <td className="px-3 py-2 text-gray-700 max-w-[100px] truncate">
                      {a.doc_origen_ref ?? '-'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-gray-600">{a.cuenta_codigo}</div>
                      <div className="text-gray-500 truncate max-w-[120px]">{a.cuenta_nombre}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {debe > 0 ? (
                        <span className="text-blue-700">{debe.toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {haber > 0 ? (
                        <span className="text-red-700">{haber.toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span className={a.saldo_acumulado >= 0 ? 'text-gray-700' : 'text-red-600'}>
                        {a.saldo_acumulado.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <EstadoBadge estado={a.estado} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isPending && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleConciliar(a.id)}
                            disabled={processingId === a.id}
                            title="Conciliar"
                            className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleReversar(a)}
                            disabled={processingId === a.id}
                            title="Reversar"
                            className="p-1 text-amber-600 hover:bg-amber-50 rounded disabled:opacity-50"
                          >
                            <ArrowCounterClockwise className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <LibroContableForm isOpen={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
