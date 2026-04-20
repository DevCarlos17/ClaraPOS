import { useState } from 'react'
import { Building2, ChevronRight, DollarSign } from 'lucide-react'
import {
  useProveedoresConDeuda,
  useFacturasCompraPendientes,
  type ProveedorConDeuda,
  type FacturaCompraPendiente,
} from '../hooks/use-cxp'
import { PagoCxPModal } from './pago-cxp-modal'
import { formatUsd } from '@/lib/currency'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function CxpPage() {
  const { proveedores, isLoading } = useProveedoresConDeuda()
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState<ProveedorConDeuda | null>(null)
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<FacturaCompraPendiente | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const { facturas, isLoading: loadingFacturas } = useFacturasCompraPendientes(
    proveedorSeleccionado?.id ?? null
  )

  function handlePagar(factura: FacturaCompraPendiente) {
    setFacturaSeleccionada(factura)
    setModalOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Cargando proveedores con deuda...
      </div>
    )
  }

  if (proveedores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <Building2 size={40} className="opacity-30" />
        <p className="text-sm">No hay proveedores con saldo pendiente</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Lista de proveedores con deuda */}
      <div className="md:col-span-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Proveedores con Deuda
        </h3>
        <div className="space-y-2">
          {proveedores.map((proveedor) => {
            const isSelected = proveedorSeleccionado?.id === proveedor.id
            return (
              <button
                key={proveedor.id}
                onClick={() => setProveedorSeleccionado(proveedor)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{proveedor.razon_social}</div>
                    <div className="text-xs text-muted-foreground">{proveedor.rif}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className="text-sm font-semibold text-destructive">
                      {formatUsd(parseFloat(proveedor.saldo_actual))}
                    </span>
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </div>
                </div>
                <div className="mt-1">
                  <Badge variant="outline" className="text-xs">
                    {proveedor.facturas_pendientes} factura(s) pendiente(s)
                  </Badge>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Facturas pendientes del proveedor seleccionado */}
      <div className="md:col-span-2">
        {!proveedorSeleccionado ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2 border border-dashed rounded-lg">
            <DollarSign size={32} className="opacity-30" />
            <p className="text-sm">Seleccione un proveedor para ver sus facturas pendientes</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Facturas Pendientes - {proveedorSeleccionado.razon_social}
              </h3>
              <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                Deuda total: {formatUsd(parseFloat(proveedorSeleccionado.saldo_actual))}
              </Badge>
            </div>

            {loadingFacturas ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                Cargando facturas...
              </div>
            ) : facturas.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
                No hay facturas pendientes
              </div>
            ) : (
              <div className="overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Factura</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Fecha</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tipo</th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Pendiente</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Accion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {facturas.map((factura) => (
                      <tr key={factura.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{factura.nro_factura}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {factura.fecha_factura?.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs">
                            {factura.tipo}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatUsd(parseFloat(factura.total_usd))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-destructive">
                          {formatUsd(parseFloat(factura.saldo_pend_usd))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePagar(factura)}
                            className="text-xs"
                          >
                            Pagar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <PagoCxPModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setFacturaSeleccionada(null)
        }}
        factura={facturaSeleccionada}
        proveedorId={proveedorSeleccionado?.id ?? ''}
        proveedorNombre={proveedorSeleccionado?.razon_social ?? ''}
      />
    </div>
  )
}
