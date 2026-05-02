import { useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { useNotasFiscalesCompra, type NotaFiscalCompra } from '@/features/compras/hooks/use-notas-fiscales-compra'
import { NotaFiscalCompraForm } from './nota-fiscal-compra-form'

type NotaFiscalConProveedor = NotaFiscalCompra & { proveedor_nombre: string }

export function NotaFiscalCompraList() {
  const [formOpen, setFormOpen] = useState(false)
  const { notas, isLoading } = useNotasFiscalesCompra()

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-9 w-40 bg-muted rounded animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-card shadow-lg p-6">
      {/* Barra superior */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Notas Fiscales Compra
          <span className="text-sm font-normal text-muted-foreground ml-2">({notas.length})</span>
        </h2>
        <button
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nueva Nota
        </button>
      </div>

      {/* Contenido */}
      {notas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay notas fiscales de compra registradas</p>
          <p className="text-sm mt-1">Haz clic en "Nueva Nota" para registrar una nota fiscal</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nro Documento</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Proveedor</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Motivo</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tasa</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Afecta Inv.</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((nota: NotaFiscalConProveedor) => (
                <tr
                  key={nota.id}
                  className="border-b border-border hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(nota.fecha).toLocaleDateString('es-VE')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {nota.tipo === 'NC' ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
                        NC
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">
                        ND
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-foreground">{nota.nro_documento}</td>
                  <td className="px-4 py-3 text-foreground">{nota.proveedor_nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate" title={nota.motivo}>
                    {nota.motivo}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    {parseFloat(nota.tasa).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {nota.afecta_inventario === 1 ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                        Si
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
                        No
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NotaFiscalCompraForm isOpen={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
