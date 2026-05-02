import { useState, useCallback } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { PageHeader } from '@/components/layout/page-header'
import { useCajasActivas } from '@/features/configuracion/hooks/use-cajas'
import { todayStr } from '@/lib/dates'
import { formatTasa } from '@/lib/currency'
import { CuadreKpiCards } from './cuadre-kpi-cards'
import { VentasDeptChart } from './ventas-dept-chart'
import { PagosResumen } from './pagos-resumen'
import { TopProductos } from './top-productos'
import { CuadreTopGanancias } from './cuadre-top-ganancias'
import { AuditModal } from './audit-modal'
import { CxcModal } from './cxc-modal'
import { CuadreMetodoModal } from './cuadre-metodo-modal'
import { CuadreDeptoModal } from './cuadre-depto-modal'
import {
  useSesionesPorCajaYFecha,
  useTasaDelDia,
  type CuadreFilters,
} from '../hooks/use-cuadre'

export function CuadrePage() {
  // Funnel state
  const [fecha, setFecha] = useState(todayStr)
  const [cajaId, setCajaId] = useState<string | null>(null)
  const [sesionCajaId, setSesionCajaId] = useState<string | null>(null)

  // Consulted state
  const [consulted, setConsulted] = useState(false)
  const [activeFilters, setActiveFilters] = useState<CuadreFilters | null>(null)

  // Modal states
  const [auditOpen, setAuditOpen] = useState(false)
  const [cxcOpen, setCxcOpen] = useState(false)
  const [metodoModal, setMetodoModal] = useState<string | null>(null)
  const [deptoModal, setDeptoModal] = useState<string | null>(null)

  // Data
  const { cajas } = useCajasActivas()
  const { sesiones } = useSesionesPorCajaYFecha(cajaId, fecha)
  const { tasaPromedio, tasaCount } = useTasaDelDia(activeFilters?.fecha ?? null)

  const handleConsultar = useCallback(() => {
    setActiveFilters({ fecha, cajaId, sesionCajaId })
    setConsulted(true)
  }, [fecha, cajaId, sesionCajaId])

  const handleFechaChange = useCallback((newFecha: string) => {
    setFecha(newFecha)
    setSesionCajaId(null)
    setConsulted(false)
    setActiveFilters(null)
  }, [])

  const handleCajaChange = useCallback((newCajaId: string) => {
    const val = newCajaId === '' ? null : newCajaId
    setCajaId(val)
    setSesionCajaId(null)
    setConsulted(false)
    setActiveFilters(null)
  }, [])

  const handleSesionChange = useCallback((newSesionId: string) => {
    const val = newSesionId === '' ? null : newSesionId
    setSesionCajaId(val)
    setConsulted(false)
    setActiveFilters(null)
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader titulo="Cuadre de Caja" descripcion="Resumen de operaciones del dia">
        {/* Tasa del dia */}
        {consulted && tasaCount > 0 && (
          <div className="text-right text-xs mr-2">
            <p className="text-muted-foreground">Tasa del dia</p>
            <p className="font-bold">{formatTasa(tasaPromedio)} Bs/$</p>
            {tasaCount > 1 && (
              <p className="text-muted-foreground">({tasaCount} tasas, promedio)</p>
            )}
          </div>
        )}
      </PageHeader>

      {/* Funnel bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-card shadow-md p-4">
        {/* Fecha */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => handleFechaChange(e.target.value)}
            className="rounded-md border border-input bg-white px-3 py-2 text-sm"
          />
        </div>

        {/* Caja */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Caja</label>
          <select
            value={cajaId ?? ''}
            onChange={(e) => handleCajaChange(e.target.value)}
            className="rounded-md border border-input bg-white px-3 py-2 text-sm min-w-[160px]"
          >
            <option value="">Todas las cajas</option>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        {/* Sesion */}
        {cajaId && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Sesion</label>
            <select
              value={sesionCajaId ?? ''}
              onChange={(e) => handleSesionChange(e.target.value)}
              className="rounded-md border border-input bg-white px-3 py-2 text-sm min-w-[200px]"
            >
              <option value="">Todas las sesiones</option>
              {sesiones.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fecha_apertura.substring(11, 16)} - {s.status}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Consultar button */}
        <button
          onClick={handleConsultar}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <MagnifyingGlass className="w-4 h-4" />
          Consultar
        </button>
      </div>

      {/* Content */}
      {!consulted || !activeFilters ? (
        <div className="text-center py-16 text-muted-foreground">
          <MagnifyingGlass className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Seleccione los filtros y presione Consultar</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <CuadreKpiCards
            filters={activeFilters}
            onClickVentas={() => setAuditOpen(true)}
            onClickCxc={() => setCxcOpen(true)}
          />

          {/* Content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <VentasDeptChart
              filters={activeFilters}
              onDeptoClick={(nombre) => setDeptoModal(nombre)}
            />
            <PagosResumen
              filters={activeFilters}
              onMetodoClick={(nombre) => setMetodoModal(nombre)}
            />
          </div>

          {/* Top tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopProductos filters={activeFilters} />
            <CuadreTopGanancias filters={activeFilters} />
          </div>

          {/* Modals */}
          <AuditModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} filters={activeFilters} />
          <CxcModal isOpen={cxcOpen} onClose={() => setCxcOpen(false)} filters={activeFilters} />
          {metodoModal && (
            <CuadreMetodoModal
              isOpen={!!metodoModal}
              onClose={() => setMetodoModal(null)}
              filters={activeFilters}
              metodoNombre={metodoModal}
            />
          )}
          {deptoModal && (
            <CuadreDeptoModal
              isOpen={!!deptoModal}
              onClose={() => setDeptoModal(null)}
              filters={activeFilters}
              deptoNombre={deptoModal}
            />
          )}
        </>
      )}
    </div>
  )
}
