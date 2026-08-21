import { useState, useMemo } from 'react'
import { Plus, ArrowRight } from '@phosphor-icons/react'
import { useTraspasos } from '@/features/inventario/hooks/use-traspasos'
import { formatDateTime } from '@/lib/format'
import { startOfMonth, todayStr } from '@/lib/dates'
import { TraspasoForm } from './traspaso-form'

export function TraspasoList() {
  const { traspasos, isLoading } = useTraspasos()
  const [formOpen, setFormOpen] = useState(false)

  const [fechaDesde, setFechaDesde] = useState(() => startOfMonth())
  const [fechaHasta, setFechaHasta] = useState(() => todayStr())

  const traspasosFiltrados = useMemo(() => {
    return traspasos.filter((t) => {
      const fecha = t.fecha?.substring(0, 10) ?? ''
      if (fechaDesde && fecha < fechaDesde) return false
      if (fechaHasta && fecha > fechaHasta) return false
      return true
    })
  }, [traspasos, fechaDesde, fechaHasta])

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card shadow-lg p-6 space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-56 bg-muted rounded animate-pulse" />
          <div className="h-9 w-40 bg-muted rounded animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-card shadow-lg p-6 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-lg font-semibold">Traspasos de Inventario</h2>
        <button
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nuevo Traspaso
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-end p-3 bg-muted/40 border border-border rounded-lg">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="h-8 px-2 text-sm border border-input bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="h-8 px-2 text-sm border border-input bg-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <span className="text-xs text-muted-foreground self-end pb-1.5">
          {traspasosFiltrados.length} resultado(s)
        </span>
      </div>

      {traspasosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay traspasos registrados</p>
          <p className="text-sm mt-1">Crea el primer traspaso para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Correlativo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Origen</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground"></th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Destino</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Items</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usuario</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Observacion</th>
              </tr>
            </thead>
            <tbody>
              {traspasosFiltrados.map((t) => (
                <tr key={t.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium">TRA-{t.correlativo_usuario}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDateTime(t.fecha)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.nombre_deposito_origen ?? '-'}</td>
                  <td className="px-2 py-3 text-muted-foreground">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t.nombre_deposito_destino ?? '-'}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{t.items_count}</td>
                  <td className="px-4 py-3 text-muted-foreground text-sm">{t.nombre_usuario ?? '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-sm">{t.observacion ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TraspasoForm isOpen={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
