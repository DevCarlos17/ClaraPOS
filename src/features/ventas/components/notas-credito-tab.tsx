import { useState } from 'react'
import { FileX } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import { useNotasCredito } from '../hooks/use-notas-credito'
import { rangoMesActual } from '../utils/notas-credito-admin-filters'

/**
 * Pestana secundaria de "Facturas emitidas" (Slice C3b — design.md
 * §Decision 4/7). Gana filtros ampliados (fecha, nro NC, tipo TOTAL/PARCIAL,
 * cliente, RIF) sobre `useNotasCredito(filtros)` + boton "Ver todo el
 * historial" (mitigacion del cambio de default a mes actual, Design
 * §Riesgos). El buscador de facturas (`useBuscarFacturaParaAnular`) y el
 * modal de C3a se retiran: la pestana "Facturas" (empresa-wide, primaria)
 * es ahora el unico punto de entrada para seleccionar una factura y aplicar
 * una NC (Design §Decision 7 — dead code una vez migrado este consumidor).
 */

const FECHA_MINIMA_HISTORIAL = '2000-01-01'
const FECHA_MAXIMA_HISTORIAL = '2100-12-31'

interface FiltrosNotasCreditoState {
  fechaDesde: string
  fechaHasta: string
  nroNcr: string
  tipo: '' | 'TOTAL' | 'PARCIAL'
  clienteNombre: string
  clienteIdentificacion: string
}

function filtrosIniciales(): FiltrosNotasCreditoState {
  return { ...rangoMesActual(), nroNcr: '', tipo: '', clienteNombre: '', clienteIdentificacion: '' }
}

export function NotasCreditoTab() {
  const [filtros, setFiltros] = useState<FiltrosNotasCreditoState>(filtrosIniciales)

  const { notas, isLoading: loadingNotas } = useNotasCredito({
    fechaDesde: filtros.fechaDesde,
    fechaHasta: filtros.fechaHasta,
    nroNcr: filtros.nroNcr,
    tipo: filtros.tipo || undefined,
    clienteNombre: filtros.clienteNombre,
    clienteIdentificacion: filtros.clienteIdentificacion,
  })

  function set<K extends keyof FiltrosNotasCreditoState>(key: K, value: FiltrosNotasCreditoState[K]) {
    setFiltros((prev) => ({ ...prev, [key]: value }))
  }

  function verTodoElHistorial() {
    setFiltros((prev) => ({ ...prev, fechaDesde: FECHA_MINIMA_HISTORIAL, fechaHasta: FECHA_MAXIMA_HISTORIAL }))
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="rounded-2xl bg-card shadow-lg p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="nc-fecha-desde" className="text-xs text-muted-foreground">
              Desde
            </label>
            <input
              id="nc-fecha-desde"
              type="date"
              value={filtros.fechaDesde}
              onChange={(e) => set('fechaDesde', e.target.value)}
              className="rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="nc-fecha-hasta" className="text-xs text-muted-foreground">
              Hasta
            </label>
            <input
              id="nc-fecha-hasta"
              type="date"
              value={filtros.fechaHasta}
              onChange={(e) => set('fechaHasta', e.target.value)}
              className="rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label htmlFor="nc-nro" className="text-xs text-muted-foreground">
              Nro NC
            </label>
            <Input
              id="nc-nro"
              value={filtros.nroNcr}
              placeholder="NCR-000123"
              onChange={(e) => set('nroNcr', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label htmlFor="nc-tipo" className="text-xs text-muted-foreground">
              Tipo
            </label>
            <NativeSelect
              id="nc-tipo"
              value={filtros.tipo}
              onChange={(e) => set('tipo', e.target.value as FiltrosNotasCreditoState['tipo'])}
            >
              <option value="">Todos</option>
              <option value="TOTAL">Total</option>
              <option value="PARCIAL">Parcial</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label htmlFor="nc-cliente" className="text-xs text-muted-foreground">
              Cliente
            </label>
            <Input
              id="nc-cliente"
              value={filtros.clienteNombre}
              placeholder="Nombre del cliente"
              onChange={(e) => set('clienteNombre', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label htmlFor="nc-rif" className="text-xs text-muted-foreground">
              RIF
            </label>
            <Input
              id="nc-rif"
              value={filtros.clienteIdentificacion}
              placeholder="V-12345678"
              onChange={(e) => set('clienteIdentificacion', e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={verTodoElHistorial}>
            Ver todo el historial
          </Button>
        </div>
      </div>

      {/* Tabla de NCR existentes */}
      <div className="rounded-2xl bg-card shadow-lg">
        {loadingNotas ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : notas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileX className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No hay notas de credito para el periodo o filtros seleccionados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Nro NCR</th>
                  <th className="text-left px-4 py-3 font-medium">Factura</th>
                  <th className="text-left px-4 py-3 font-medium">Cliente</th>
                  <th className="text-right px-4 py-3 font-medium">Monto USD</th>
                  <th className="text-right px-4 py-3 font-medium">Monto Bs</th>
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {notas.map((n) => (
                  <tr key={n.id} className="border-b border-muted hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-xs">{n.nro_ncr}</td>
                    <td className="px-4 py-3 font-mono text-xs">#{n.nro_factura}</td>
                    <td className="px-4 py-3 text-sm">{n.cliente_nombre}</td>
                    <td className="px-4 py-3 text-right font-bold">
                      {formatUsd(n.total_usd)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatBs(n.total_bs)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDateTime(n.fecha)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[200px]">
                      {n.motivo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
