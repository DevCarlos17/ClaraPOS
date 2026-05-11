import { useState } from 'react'
import { Plus, X, Eye, ArrowSquareOut } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import {
  useSesionesActivasDashboard,
  useSesionesCaja,
} from '@/features/caja/hooks/use-sesiones-caja'
import { SesionCajaForm } from './sesion-caja-form'
import { formatDateTime } from '@/lib/format'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { formatUsd, formatBs } from '@/lib/currency'

// ─── Helpers ─────────────────────────────────────────────────

function formatHoras(horas: number): string {
  const h = Math.floor(horas)
  const m = Math.round((horas - h) * 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

// ─── Skeleton tabla activas ───────────────────────────────────

function SesionActivaSkeletonTabla() {
  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted">
            {['Caja / Cajera', 'Fondo', 'Saldo actual', 'Facturado', 'Fact.', 'Items', ''].map((col) => (
              <th key={col} className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 2 }).map((_, i) => (
            <tr key={i} className="border-b border-border">
              {Array.from({ length: 7 }).map((__, j) => (
                <td key={j} className="px-4 py-3">
                  <div className={`h-4 bg-muted rounded animate-pulse ${j === 0 ? 'w-28' : 'w-14'}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tabla de sesiones activas ────────────────────────────────

function SesionActivaTabla({
  onCerrar,
  canClose,
  onIrAlCuadre,
}: {
  onCerrar: (id: string) => void
  canClose: boolean
  onIrAlCuadre: (s: { id: string; caja_id: string; fecha_apertura: string }) => void
}) {
  const { sesiones, isLoading } = useSesionesActivasDashboard()

  if (isLoading) return <SesionActivaSkeletonTabla />

  if (sesiones.length === 0) {
    return (
      <div className="rounded-2xl bg-card shadow-lg p-6 text-center text-muted-foreground">
        <p className="text-sm font-medium">Sin sesiones activas</p>
        <p className="text-xs mt-1">Abre una sesion de caja para comenzar</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-card shadow-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                Caja / Cajera
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                Fondo inicial
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                Saldo actual
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                Facturado
              </th>
              <th
                className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-help"
                title="Cantidad de facturas procesadas en la sesion"
              >
                Fact.
              </th>
              <th
                className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-help"
                title="Cantidad total de articulos facturados"
              >
                Items
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sesiones.map((s) => (
              <tr
                key={s.id}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
              >
                {/* Caja / Cajera */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    <div>
                      <p className="font-semibold text-sm leading-tight">
                        {s.caja_nombre ?? 'Caja'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.cajera_nombre ?? 'Sin nombre'}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70">
                        {formatHoras(s.horasTranscurridas)} de sesion
                      </p>
                    </div>
                  </div>
                </td>

                {/* Fondo inicial */}
                <td className="px-4 py-3 text-right tabular-nums">
                  <div className="text-sm font-medium">
                    USD {parseFloat(s.monto_apertura_usd).toFixed(2)}
                  </div>
                  {parseFloat(s.monto_apertura_bs) > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Bs {parseFloat(s.monto_apertura_bs).toFixed(2)}
                    </div>
                  )}
                </td>

                {/* Saldo actual */}
                <td className="px-4 py-3 text-right tabular-nums">
                  <div className="text-sm font-semibold text-foreground">
                    {formatUsd(s.saldoUsd)}
                  </div>
                  {s.saldoBs > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {formatBs(s.saldoBs)}
                    </div>
                  )}
                </td>

                {/* Facturado total */}
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className="font-semibold">{formatUsd(s.totalFacturadoUsd)}</span>
                </td>

                {/* Cantidad facturas */}
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {s.totalFacturas}
                </td>

                {/* Cantidad articulos */}
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {s.totalArticulos}
                </td>

                {/* Acciones */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => onIrAlCuadre(s)}
                      title="Ver cuadre en vivo"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowSquareOut size={13} />
                      Cuadre
                    </button>
                    {canClose && (
                      <button
                        onClick={() => onCerrar(s.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                        Cerrar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Skeleton tabla historial ─────────────────────────────────

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

// ─── Componente principal ─────────────────────────────────────

export function SesionCajaList() {
  const navigate = useNavigate()
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
    <div className="space-y-6">
      {/* Seccion de sesiones activas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Sesiones Activas</h2>
          <button
            onClick={() => setAperturaOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Abrir Sesion
          </button>
        </div>

        <SesionActivaTabla
          onCerrar={handleCerrar}
          canClose={canClose}
          onIrAlCuadre={irAlCuadre}
        />
      </div>

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
                        className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
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
