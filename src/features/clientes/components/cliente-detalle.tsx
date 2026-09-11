import { useEffect, useState } from 'react'
import { ArrowLeft, Phone, MapPin, Calendar } from '@phosphor-icons/react'
import { type Cliente } from '@/features/clientes/hooks/use-clientes'
import { useFacturasEmpresa } from '@/features/ventas/hooks/use-facturas-empresa'
import { FacturasEmpresaTable } from '@/features/ventas/components/facturas-empresa-tab'
import type { FacturaParaAnular } from '@/features/ventas/hooks/use-notas-credito'
import { startOfMonth, todayStr } from '@/lib/dates'

interface ClienteDetalleProps {
  onVolver: () => void
  cliente: Cliente
}

// =============================================
// ClienteDetalle
// =============================================

export function ClienteDetalle({ onVolver, cliente }: ClienteDetalleProps) {
  const [fechaDesde, setFechaDesde] = useState(startOfMonth)
  const [fechaHasta, setFechaHasta] = useState(todayStr)
  // PR3a (reimpresion-factura-fiscal): sostiene la factura elegida por
  // click de fila. PR3b monta `ReimprimirFacturaModal` consumiendola; hasta
  // entonces no hay modal — el placeholder de abajo solo la mantiene
  // type-safe/observable en tests.
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<FacturaParaAnular | null>(null)

  useEffect(() => {
    setFechaDesde(startOfMonth())
    setFechaHasta(todayStr())
  }, [cliente.id])

  const { facturas, isLoading: isLoadingFacturas } = useFacturasEmpresa({
    clienteId: cliente.id,
    fechaDesde,
    fechaHasta,
  })

  function handleLimpiarFiltro() {
    setFechaDesde(startOfMonth())
    setFechaHasta(todayStr())
  }

  const esRangoPorDefecto = fechaDesde === startOfMonth() && fechaHasta === todayStr()

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
            <h3 className="text-sm font-semibold mb-2">Facturas</h3>
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
                facturas={facturas}
                isLoading={isLoadingFacturas}
                mostrarAcciones={false}
                onRowClick={setFacturaSeleccionada}
              />
            )}
          </div>
        </div>
      </div>
      {/* PR3b: <ReimprimirFacturaModal venta={facturaSeleccionada} isOpen={!!facturaSeleccionada} onClose={() => setFacturaSeleccionada(null)} /> */}
      {facturaSeleccionada && (
        <div
          data-testid="factura-seleccionada-placeholder"
          data-nro-factura={facturaSeleccionada.nro_factura}
          className="hidden"
        />
      )}
    </>
  )
}
