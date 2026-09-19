import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Phone, MapPin, Calendar, MagnifyingGlass } from '@phosphor-icons/react'
import { type Cliente } from '@/features/clientes/hooks/use-clientes'
import { useFacturasEmpresa } from '@/features/ventas/hooks/use-facturas-empresa'
import { FacturasEmpresaTable } from '@/features/ventas/components/facturas-empresa-tab'
import { ConsultaFacturaModal } from '@/features/ventas/components/consulta-factura-modal'
import { NotasCreditoTab } from '@/features/ventas/components/notas-credito-tab'
import { derivarEstadoPago, ESTADO_PAGO_LABEL } from '@/features/ventas/utils/notas-credito-ui'
import type { FacturaParaAnular } from '@/features/ventas/hooks/use-notas-credito'
import { SegmentedTabs, tabContentVariants } from '@/components/shared/segmented-tabs'
import { Input } from '@/components/ui/input'
import { startOfMonth, todayStr } from '@/lib/dates'
import { formatDateTime } from '@/lib/format'
import { coincideBusquedaMultiCampo } from '@/lib/search'

interface ClienteDetalleProps {
  onVolver: () => void
  cliente: Cliente
}

type TabActiva = 'facturas' | 'notas-credito'

const TAB_ORDER: TabActiva[] = ['facturas', 'notas-credito']

const TABS = [
  { key: 'facturas' as const, label: 'Facturas' },
  { key: 'notas-credito' as const, label: 'Notas de credito' },
]

// =============================================
// ClienteDetalle
// =============================================

export function ClienteDetalle({ onVolver, cliente }: ClienteDetalleProps) {
  const [fechaDesde, setFechaDesde] = useState(startOfMonth)
  const [fechaHasta, setFechaHasta] = useState(todayStr)
  // PR3a/PR3b (reimpresion-factura-fiscal): sostiene la factura elegida por
  // click de fila; `ConsultaFacturaModal` (PR3b) la consume abajo.
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<FacturaParaAnular | null>(null)
  const [tabActiva, setTabActiva] = useState<TabActiva>('facturas')
  const [prevTab, setPrevTab] = useState<TabActiva>('facturas')
  // cliente-detalle-tablas-pestanas: busqueda CLIENT-SIDE sobre las facturas
  // ya cargadas para el rango de fecha vigente (el rango sigue siendo el
  // unico filtro SQL — la busqueda solo acota lo YA traido).
  const [busquedaFacturas, setBusquedaFacturas] = useState('')

  useEffect(() => {
    setFechaDesde(startOfMonth())
    setFechaHasta(todayStr())
  }, [cliente.id])

  const { facturas, isLoading: isLoadingFacturas } = useFacturasEmpresa({
    clienteId: cliente.id,
    fechaDesde,
    fechaHasta,
  })

  const facturasFiltradas = facturas.filter((f) =>
    coincideBusquedaMultiCampo(
      [
        f.nro_factura,
        formatDateTime(f.fecha),
        f.total_usd,
        f.total_bs,
        f.cliente_nombre,
        f.cliente_identificacion,
        ESTADO_PAGO_LABEL[derivarEstadoPago(f)],
      ],
      busquedaFacturas
    )
  )

  function handleLimpiarFiltro() {
    setFechaDesde(startOfMonth())
    setFechaHasta(todayStr())
  }

  function handleTabChange(key: TabActiva) {
    setPrevTab(tabActiva)
    setTabActiva(key)
  }

  const esRangoPorDefecto = fechaDesde === startOfMonth() && fechaHasta === todayStr()
  const direction = TAB_ORDER.indexOf(tabActiva) > TAB_ORDER.indexOf(prevTab) ? 1 : -1

  return (
    <>
      <div className="rounded-2xl bg-card shadow-lg overflow-hidden">
        <div className="p-5 overflow-y-auto max-h-[calc(100vh-8rem)]">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <button
                type="button"
                onClick={onVolver}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver
              </button>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{cliente.identificacion}</span>
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
              <h2 className="text-xl font-semibold mt-1">{cliente.nombre}</h2>
            </div>
          </div>

          {/* Info del cliente */}
          {(cliente.telefono || cliente.direccion) && (
            <div className="space-y-2 mb-5">
              {cliente.telefono && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4 text-muted-foreground/60" />
                  {cliente.telefono}
                </div>
              )}
              {cliente.direccion && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 text-muted-foreground/60 mt-0.5 shrink-0" />
                  {cliente.direccion}
                </div>
              )}
            </div>
          )}

          {/* Tabs: Facturas / Notas de credito */}
          <div className="space-y-0">
            <SegmentedTabs tabs={TABS} active={tabActiva} onChange={handleTabChange} />

            <div className="overflow-hidden">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={tabActiva}
                  custom={direction}
                  variants={tabContentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {tabActiva === 'facturas' && (
                    <div className="rounded-b-lg border border-t-0 p-4">
                      {/* Filtro de fechas */}
                      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg border bg-muted/20">
                        <Calendar size={15} className="text-muted-foreground mb-0.5" />
                        <div>
                          <label htmlFor="facturas-fecha-desde" className="block text-xs text-muted-foreground mb-1">Desde</label>
                          <input
                            id="facturas-fecha-desde"
                            type="date"
                            value={fechaDesde}
                            onChange={(e) => setFechaDesde(e.target.value)}
                            autoComplete="off"
                            className="rounded-md border border-input bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label htmlFor="facturas-fecha-hasta" className="block text-xs text-muted-foreground mb-1">Hasta</label>
                          <input
                            id="facturas-fecha-hasta"
                            type="date"
                            value={fechaHasta}
                            onChange={(e) => setFechaHasta(e.target.value)}
                            autoComplete="off"
                            className="rounded-md border border-input bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        {!esRangoPorDefecto && (
                          <button
                            type="button"
                            onClick={handleLimpiarFiltro}
                            className="text-xs text-muted-foreground hover:text-foreground underline mb-1.5"
                          >
                            Limpiar filtro
                          </button>
                        )}
                      </div>

                      {/* Facturas */}
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                          <h3 className="text-sm font-semibold">Facturas</h3>
                          {!isLoadingFacturas && facturas.length > 0 && (
                            <div className="relative w-full max-w-xs">
                              <MagnifyingGlass
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                              />
                              <Input
                                value={busquedaFacturas}
                                placeholder="Buscar..."
                                onChange={(e) => setBusquedaFacturas(e.target.value)}
                                className="pl-9 h-8 text-sm"
                              />
                            </div>
                          )}
                        </div>
                        {isLoadingFacturas ? (
                          <div className="space-y-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                            ))}
                          </div>
                        ) : facturas.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                            <p className="text-sm font-medium">Sin facturas</p>
                          </div>
                        ) : (
                          <FacturasEmpresaTable
                            facturas={facturasFiltradas}
                            isLoading={isLoadingFacturas}
                            mostrarAcciones={false}
                            mostrarCliente={false}
                            onRowClick={setFacturaSeleccionada}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {tabActiva === 'notas-credito' && (
                    <div className="rounded-b-lg border border-t-0 p-4">
                      <NotasCreditoTab clienteId={cliente.id} />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      <ConsultaFacturaModal
        venta={facturaSeleccionada}
        isOpen={!!facturaSeleccionada}
        onClose={() => setFacturaSeleccionada(null)}
      />
    </>
  )
}
