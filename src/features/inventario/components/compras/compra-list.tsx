import { useState } from 'react'
import { Plus, Eye } from 'lucide-react'
import { useCompras } from '@/features/inventario/hooks/use-compras'
import { formatUsd, formatBs } from '@/lib/currency'
import { CompraForm } from './compra-form'
import { CompraDetalleModal } from './compra-detalle-modal'

export function CompraList() {
  const { compras, isLoading } = useCompras()
  const [showForm, setShowForm] = useState(false)
  const [detalleCompraId, setDetalleCompraId] = useState<string | null>(null)

  if (showForm) {
    return <CompraForm onClose={() => setShowForm(false)} />
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-9 w-40 bg-muted rounded animate-pulse" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Historial de Compras
          <span className="text-sm font-normal text-muted-foreground ml-2">({compras.length})</span>
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva Compra
        </button>
      </div>

      {compras.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">Sin compras registradas</p>
          <p className="text-sm mt-1">Haz clic en "Nueva Compra" para registrar una factura de compra</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Nro Factura</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Proveedor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Total USD</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Bs</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Tasa</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-background divide-y divide-border">
              {compras.map((compra) => (
                <tr key={compra.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-sm text-foreground">{compra.nro_factura}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(compra.fecha_factura).toLocaleDateString('es-VE')}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">{compra.proveedor_nombre}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                        compra.tipo === 'CREDITO'
                          ? 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-950 dark:text-orange-300'
                          : 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-950 dark:text-green-300'
                      }`}
                    >
                      {compra.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                    {formatUsd(compra.total_usd)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                    {formatBs(compra.total_bs)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                    {parseFloat(compra.tasa).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setDetalleCompraId(compra.id)}
                      className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalleCompraId && (
        <CompraDetalleModal
          compraId={detalleCompraId}
          isOpen={!!detalleCompraId}
          onClose={() => setDetalleCompraId(null)}
        />
      )}
    </div>
  )
}
