import { useState } from 'react'
import { Plus, ArrowCircleDown, ArrowCircleUp, Wallet, Handshake, X } from '@phosphor-icons/react'
import {
  useSesionesActivas,
  useSesionesCaja,
  type SesionCajaConNombre,
  type SesionCaja,
} from '@/features/caja/hooks/use-sesiones-caja'
import { SesionCajaForm } from './sesion-caja-form'
import { MovimientoManualForm } from './movimiento-manual-form'
import { formatDateTime } from '@/lib/format'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import type { OrigenManual } from '@/features/caja/schemas/movimiento-manual-schema'

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
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted">
            {[
              'Fecha Apertura',
              'Monto Apertura',
              'Fecha Cierre',
              'Monto Fisico',
              'Diferencia',
              'Status',
            ].map((col) => (
              <th key={col} className="text-left px-4 py-3 font-medium text-muted-foreground">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b border-border">
              {Array.from({ length: 6 }).map((__, j) => (
                <td key={j} className="px-4 py-3">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Card de sesion activa ────────────────────────────────────

function SesionActivaCard({
  sesion,
  onCerrar,
  onMovimiento,
  canClose,
  canMovManual,
}: {
  sesion: SesionCajaConNombre
  onCerrar: (id: string) => void
  onMovimiento: (id: string, origen: OrigenManual) => void
  canClose: boolean
  canMovManual: boolean
}) {
  return (
    <div className="rounded-2xl bg-card shadow-lg p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
            <p className="text-sm font-semibold truncate">
              {sesion.caja_nombre ?? 'Caja'}
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Apertura: {formatDateTime(sesion.fecha_apertura)}
          </p>
          <p className="text-xs text-muted-foreground">
            Fondo: USD {parseFloat(sesion.monto_apertura_usd).toFixed(2)}
            {sesion.monto_apertura_bs && parseFloat(sesion.monto_apertura_bs) > 0 && (
              <span className="ml-1">
                + Bs {parseFloat(sesion.monto_apertura_bs).toFixed(2)}
              </span>
            )}
          </p>
        </div>

        {canClose && (
          <button
            onClick={() => onCerrar(sesion.id)}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
          >
            <X className="h-3 w-3" />
            Cerrar
          </button>
        )}
      </div>

      {/* Botones de movimiento */}
      {canMovManual && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
          <button
            onClick={() => onMovimiento(sesion.id, 'INGRESO_MANUAL')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-green-700 hover:bg-green-50 hover:border-green-200 transition-colors cursor-pointer"
          >
            <ArrowCircleDown className="h-3.5 w-3.5" />
            Ingreso
          </button>
          <button
            onClick={() => onMovimiento(sesion.id, 'EGRESO_MANUAL')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer"
          >
            <ArrowCircleUp className="h-3.5 w-3.5" />
            Egreso
          </button>
          <button
            onClick={() => onMovimiento(sesion.id, 'AVANCE')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-amber-700 hover:bg-amber-50 hover:border-amber-200 transition-colors cursor-pointer"
          >
            <Wallet className="h-3.5 w-3.5" />
            Avance
          </button>
          <button
            onClick={() => onMovimiento(sesion.id, 'PRESTAMO')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-purple-700 hover:bg-purple-50 hover:border-purple-200 transition-colors cursor-pointer"
          >
            <Handshake className="h-3.5 w-3.5" />
            Prestamo
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

export function SesionCajaList() {
  const { sesiones: sesionesActivas, isLoading: loadingActivas } = useSesionesActivas()
  const { sesiones, isLoading: loadingSesiones } = useSesionesCaja()
  const { hasPermission, isOwner } = usePermissions()

  const canClose = isOwner || hasPermission(PERMISSIONS.CAJA_CLOSE)
  const canMovManual = isOwner || hasPermission(PERMISSIONS.CAJA_MOV_MANUAL)

  const [aperturaOpen, setAperturaOpen] = useState(false)
  const [cierreOpen, setCierreOpen] = useState(false)
  const [movManualOpen, setMovManualOpen] = useState(false)
  const [sesionIdACerrar, setSesionIdACerrar] = useState<string | null>(null)
  const [sesionIdMovimiento, setSesionIdMovimiento] = useState<string | null>(null)
  const [origenSeleccionado, setOrigenSeleccionado] = useState<OrigenManual>('INGRESO_MANUAL')

  function handleCerrar(sesionId: string) {
    setSesionIdACerrar(sesionId)
    setCierreOpen(true)
  }

  function handleMovimiento(sesionId: string, origen: OrigenManual) {
    setSesionIdMovimiento(sesionId)
    setOrigenSeleccionado(origen)
    setMovManualOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Seccion de sesiones activas */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">
            Sesiones Activas
            {!loadingActivas && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({sesionesActivas.length})
              </span>
            )}
          </h2>
        </div>
        <button
          onClick={() => setAperturaOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Abrir Sesion
        </button>
      </div>

      {loadingActivas ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : sesionesActivas.length === 0 ? (
        <div className="rounded-2xl bg-card shadow-lg p-6 text-center text-muted-foreground">
          <p className="text-sm font-medium">Sin sesiones activas</p>
          <p className="text-xs mt-1">Abre una sesion de caja para comenzar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sesionesActivas.map((s) => (
            <SesionActivaCard
              key={s.id}
              sesion={s}
              onCerrar={handleCerrar}
              onMovimiento={handleMovimiento}
              canClose={canClose}
              canMovManual={canMovManual}
            />
          ))}
        </div>
      )}

      {/* Historial de sesiones */}
      <div className="rounded-2xl bg-card shadow-lg p-5">
        <h2 className="text-lg font-semibold mb-3">
          Historial de Sesiones
          <span className="text-sm font-normal text-muted-foreground ml-2">
            (ultimas {sesiones.length})
          </span>
        </h2>

        {loadingSesiones ? (
          <TablaSkeletonSesiones />
        ) : sesiones.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-base font-medium">No hay sesiones registradas</p>
            <p className="text-sm mt-1">Abre la primera sesion de caja para comenzar</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Fecha Apertura
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    Monto Apertura
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Fecha Cierre
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    Monto Fisico
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    Diferencia
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">
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
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDateTime(s.fecha_apertura)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        USD {parseFloat(s.monto_apertura_usd).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {s.fecha_cierre ? formatDateTime(s.fecha_cierre) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
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
                          <span className="text-muted-foreground">-</span>
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
        onClose={() => {
          setCierreOpen(false)
          setSesionIdACerrar(null)
        }}
        sesionId={sesionIdACerrar ?? undefined}
      />

      {/* Dialogo de movimiento manual */}
      {sesionIdMovimiento && (
        <MovimientoManualForm
          isOpen={movManualOpen}
          onClose={() => {
            setMovManualOpen(false)
            setSesionIdMovimiento(null)
          }}
          sesionCajaId={sesionIdMovimiento}
          origenInicial={origenSeleccionado}
        />
      )}
    </div>
  )
}
