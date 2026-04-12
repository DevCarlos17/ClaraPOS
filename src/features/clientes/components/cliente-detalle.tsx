import { useRef, useEffect } from 'react'
import { X, Phone, MapPin, CreditCard } from 'lucide-react'
import {
  useMovimientosCliente,
  type Cliente,
} from '@/features/clientes/hooks/use-clientes'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'

interface ClienteDetalleProps {
  isOpen: boolean
  onClose: () => void
  cliente?: Cliente
}

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  FAC: { label: 'Factura', color: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  PAG: { label: 'Pago', color: 'bg-green-50 text-green-700 ring-green-600/20' },
  NCR: { label: 'Nota Credito', color: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  NDB: { label: 'Nota Debito', color: 'bg-red-50 text-red-700 ring-red-600/20' },
}

function formatFecha(fecha: string): string {
  try {
    const d = new Date(fecha)
    return d.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return fecha
  }
}

export function ClienteDetalle({ isOpen, onClose, cliente }: ClienteDetalleProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { movimientos, isLoading } = useMovimientosCliente(cliente?.id)
  const { tasaValor } = useTasaActual()

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  if (!cliente) return null

  const saldo = parseFloat(cliente.saldo_actual || '0')

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl"
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-gray-500">{cliente.identificacion}</span>
              {cliente.is_active === 1 ? (
                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                  Activo
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                  Inactivo
                </span>
              )}
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mt-1">{cliente.nombre}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {cliente.telefono && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="h-4 w-4 text-gray-400" />
              {cliente.telefono}
            </div>
          )}
          {cliente.direccion && (
            <div className="flex items-start gap-2 text-sm text-gray-600 sm:col-span-2">
              <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              {cliente.direccion}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CreditCard className="h-4 w-4 text-gray-400" />
            Limite: {formatUsd(cliente.limite_credito_usd)}
          </div>
        </div>

        {/* Saldo Destacado */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-6">
          <p className="text-sm text-gray-500 mb-1">Saldo Actual</p>
          <p className={`text-3xl font-bold ${saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatUsd(saldo)}
          </p>
          {tasaValor > 0 && (
            <p className="text-sm text-gray-400 mt-1">
              {formatBs(usdToBs(saldo, tasaValor))}
            </p>
          )}
        </div>

        {/* Movimientos */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Estado de Cuenta</h3>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : movimientos.length === 0 ? (
            <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-lg">
              <p className="text-sm font-medium">Sin movimientos</p>
              <p className="text-xs mt-1">Los movimientos se crearan automaticamente al registrar ventas y pagos</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Fecha</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Tipo</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Referencia</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">Monto</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">Saldo</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700 hidden sm:table-cell">Observacion</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((mov) => {
                    const tipo = TIPO_LABELS[mov.tipo] ?? {
                      label: mov.tipo,
                      color: 'bg-gray-50 text-gray-700 ring-gray-600/20',
                    }
                    return (
                      <tr key={mov.id} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {formatFecha(mov.fecha)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tipo.color}`}>
                            {tipo.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-700">{mov.referencia}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                          {formatUsd(mov.monto)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">
                          {formatUsd(mov.saldo_anterior)} → {formatUsd(mov.saldo_nuevo)}
                        </td>
                        <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">
                          {mov.observacion || '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cerrar */}
        <div className="flex justify-end pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  )
}
