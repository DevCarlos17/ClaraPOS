import { useState } from 'react'
import { Plus, X, Eye } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import {
  useSesionesActivas,
  useSesionesCaja,
  useSaldoSesionCaja,
  useSesionEstadisticas,
  type SesionCajaConNombre,
} from '@/features/caja/hooks/use-sesiones-caja'
import { SesionCajaForm } from './sesion-caja-form'
import { formatDateTime } from '@/lib/format'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { formatUsd, formatBs } from '@/lib/currency'

// ─── Skeleton de carga ────────────────────────────────────────

function TablaSkeletonSesiones() {
  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted">
            {['Fecha Apertura', 'Monto Apertura', 'Fecha Cierre', 'Monto Fisico', 'Diferencia', ''].map((col) => (
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
  canClose,
}: {
  sesion: SesionCajaConNombre
  onCerrar: (id: string) => void
  canClose: boolean
}) {
  const { saldoUsd, saldoBs, isLoading: loadingSaldo } = useSaldoSesionCaja(sesion.id)
  const { totalFacturas, totalFacturadoUsd, totalArticulos } = useSesionEstadisticas(sesion.id)

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

      {/* Saldo actual en caja */}
      <div className="rounded-lg bg-muted/40 px-3 py-2">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Saldo en caja
        </p>
        {loadingSaldo ? (
          <div className="h-5 w-32 bg-muted rounded animate-pulse" />
        ) : (
          <p className="text-base font-semibold tabular-nums">
            {formatUsd(saldoUsd)}
            {saldoBs > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                / {formatBs(saldoBs)}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Estadisticas de rendimiento */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border pt-2">
        <span className="tabular-nums">
          {totalFacturas} {totalFacturas === 1 ? 'factura' : 'facturas'}
        </span>
        <span className="text-border">·</span>
        <span className="font-medium text-foreground tabular-nums">
          {formatUsd(totalFacturadoUsd)}
        </span>
        <span className="text-border">·</span>
        <span className="tabular-nums">
          {totalArticulos} {totalArticulos === 1 ? 'item' : 'items'}
        </span>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

export function SesionCajaList() {
  const navigate = useNavigate()
  const { sesiones: sesionesActivas, isLoading: loadingActivas } = useSesionesActivas()
  const [limiteHistorial, setLimiteHistorial] = useState(10)
  const { sesiones, isLoading: loadingSesiones } = useSesionesCaja(limiteHistorial)
  const { hasPermission, isOwner } = usePermissions()

  function irAlCuadre(s: { id: string; caja_id: string; fecha_apertura: string }) {
    navigate({
      to: '/ventas/cuadre-de-caja',
      search: {
        fecha: s.fecha_apertura.substring(0, 10),
        cajaId: s.caja_id,
        sesionId: s.id,
      },
    })
  }

  const canClose = isOwner || hasPermission(PERMISSIONS.CAJA_CLOSE)

  const [aperturaOpen, setAperturaOpen] = useState(false)
  const [cierreOpen, setCierreOpen] = useState(false)
  const [sesionIdACerrar, setSesionIdACerrar] = useState<string | null>(null)

  function handleCerrar(sesionId: string) {
    setSesionIdACerrar(sesionId)
    setCierreOpen(true)
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
            <div key={i} className="h-40 bg-muted rounded-2xl animate-pulse" />
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
              canClose={canClose}
            />
          ))}
        </div>
      )}

      {/* Historial de sesiones cerradas */}
      <div className="rounded-2xl bg-card shadow-lg p-5">
        <h2 className="text-lg font-semibold mb-3">Historial de Sesiones</h2>

        {loadingSesiones ? (
          <TablaSkeletonSesiones />
        ) : sesiones.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-base font-medium">No hay sesiones cerradas</p>
            <p className="text-sm mt-1">Las sesiones cerradas apareceran aqui</p>
          </div>
        ) : (
          <>
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
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sesiones.map((s) => {
                    const diferencia = s.diferencia_usd !== null
                      ? parseFloat(s.diferencia_usd)
                      : null
                    const aperturaBs = parseFloat(s.monto_apertura_bs ?? '0')

                    return (
                      <tr
                        key={s.id}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDateTime(s.fecha_apertura)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          <div>USD {parseFloat(s.monto_apertura_usd).toFixed(2)}</div>
                          {aperturaBs > 0 && (
                            <div className="text-xs text-muted-foreground">
                              Bs {aperturaBs.toFixed(2)}
                            </div>
                          )}
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
                                diferencia >= 0
                                  ? 'text-green-700 font-medium'
                                  : 'text-red-600 font-medium'
                              }
                            >
                              {diferencia >= 0 ? '+' : ''}
                              {diferencia.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => irAlCuadre(s)}
                            title="Ver resumen"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Eye size={13} />
                            Resumen
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {sesiones.length >= limiteHistorial && (
              <div className="flex justify-center mt-3">
                <button
                  onClick={() => setLimiteHistorial((prev) => prev + 10)}
                  className="text-sm text-primary hover:underline cursor-pointer"
                >
                  Cargar mas sesiones
                </button>
              </div>
            )}
          </>
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
    </div>
  )
}
