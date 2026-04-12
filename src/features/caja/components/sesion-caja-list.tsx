import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  useSesionActiva,
  useSesionesCaja,
  type SesionCaja,
} from '@/features/caja/hooks/use-sesiones-caja'
import { SesionCajaForm } from './sesion-caja-form'
import { formatDateTime } from '@/lib/format'

// ─── Badge de status ──────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'ABIERTA') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
        ABIERTA
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
      CERRADA
    </span>
  )
}

// ─── Skeleton de carga ────────────────────────────────────────

function TablaSkeletonSesiones() {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {[
              'Fecha Apertura',
              'Monto Apertura',
              'Fecha Cierre',
              'Monto Fisico',
              'Diferencia',
              'Status',
            ].map((col) => (
              <th key={col} className="text-left px-4 py-3 font-medium text-gray-700">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b border-gray-100">
              {Array.from({ length: 6 }).map((__, j) => (
                <td key={j} className="px-4 py-3">
                  <div className="h-4 bg-gray-200 rounded animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Banner de sesion activa ──────────────────────────────────

function BannerSesionActiva({
  sesion,
  onCerrar,
}: {
  sesion: SesionCaja
  onCerrar: () => void
}) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-green-800">Sesion Activa</p>
        <p className="text-xs text-green-700 mt-0.5">
          Apertura: {formatDateTime(sesion.fecha_apertura)}
        </p>
        <p className="text-xs text-green-700">
          Monto apertura: USD {parseFloat(sesion.monto_apertura_usd).toFixed(2)}
        </p>
      </div>
      <button
        onClick={onCerrar}
        className="shrink-0 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
      >
        Cerrar Sesion
      </button>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

export function SesionCajaList() {
  const { sesion: sesionActiva, isLoading: loadingActiva } = useSesionActiva()
  const { sesiones, isLoading: loadingSesiones } = useSesionesCaja()

  const [aperturaOpen, setAperturaOpen] = useState(false)
  const [cierreOpen, setCierreOpen] = useState(false)

  // Estado de carga inicial del banner
  const bannerLoading = loadingActiva

  return (
    <div className="space-y-4">
      {/* Banner / Boton de apertura */}
      {bannerLoading ? (
        <div className="h-20 bg-gray-100 rounded-lg animate-pulse" />
      ) : sesionActiva ? (
        <BannerSesionActiva
          sesion={sesionActiva}
          onCerrar={() => setCierreOpen(true)}
        />
      ) : (
        <div className="flex justify-end">
          <button
            onClick={() => setAperturaOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Abrir Sesion
          </button>
        </div>
      )}

      {/* Tabla de sesiones */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Historial de Sesiones
          <span className="text-sm font-normal text-gray-500 ml-2">
            (ultimas {sesiones.length})
          </span>
        </h2>

        {loadingSesiones ? (
          <TablaSkeletonSesiones />
        ) : sesiones.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-base font-medium">No hay sesiones registradas</p>
            <p className="text-sm mt-1">Abre la primera sesion de caja para comenzar</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">
                    Fecha Apertura
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">
                    Monto Apertura
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">
                    Fecha Cierre
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">
                    Monto Fisico
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">
                    Diferencia
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {sesiones.map((s) => {
                  const diferencia = s.diferencia_usd !== null
                    ? parseFloat(s.diferencia_usd)
                    : null

                  return (
                    <tr
                      key={s.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDateTime(s.fecha_apertura)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 tabular-nums">
                        USD {parseFloat(s.monto_apertura_usd).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {s.fecha_cierre ? formatDateTime(s.fecha_cierre) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 tabular-nums">
                        {s.monto_fisico_usd !== null
                          ? `USD ${parseFloat(s.monto_fisico_usd).toFixed(2)}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {diferencia !== null ? (
                          <span
                            className={
                              diferencia >= 0 ? 'text-green-700 font-medium' : 'text-red-600 font-medium'
                            }
                          >
                            {diferencia >= 0 ? '+' : ''}
                            {diferencia.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialogo de apertura */}
      <SesionCajaForm
        mode="apertura"
        isOpen={aperturaOpen}
        onClose={() => setAperturaOpen(false)}
      />

      {/* Dialogo de cierre */}
      <SesionCajaForm
        mode="cierre"
        isOpen={cierreOpen}
        onClose={() => setCierreOpen(false)}
        sesionId={sesionActiva?.id}
      />
    </div>
  )
}
