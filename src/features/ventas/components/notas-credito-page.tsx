import { useState } from 'react'
import { MagnifyingGlass, FileX } from '@phosphor-icons/react'
import { PageHeader } from '@/components/layout/page-header'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import {
  useNotasCredito,
  useBuscarFacturaParaAnular,
} from '../hooks/use-notas-credito'
import type { FacturaParaAnular } from '../hooks/use-notas-credito'
import { CrearNcrModal } from './crear-ncr-modal'

export function NotasCreditoPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<FacturaParaAnular | null>(null)

  const { notas, isLoading: loadingNotas } = useNotasCredito()
  const { facturas, isLoading: loadingSearch } = useBuscarFacturaParaAnular(searchQuery)

  function handleSelectFactura(factura: FacturaParaAnular) {
    setFacturaSeleccionada(factura)
    setModalOpen(true)
    setSearchQuery('')
  }

  function handleCloseModal() {
    setModalOpen(false)
    setFacturaSeleccionada(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Notas de Credito" descripcion="Anulacion total de facturas" />

      {/* Buscar factura */}
      <div className="rounded-xl bg-card shadow-md p-4">
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar factura por numero..."
            className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-white text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          {/* Resultados de busqueda */}
          {searchQuery.trim().length >= 1 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {loadingSearch ? (
                <div className="p-3 text-sm text-muted-foreground">Buscando...</div>
              ) : facturas.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  No se encontraron facturas activas
                </div>
              ) : (
                facturas.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleSelectFactura(f)}
                    className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-muted last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-sm font-bold">#{f.nro_factura}</span>
                        <span className="ml-2 text-sm text-muted-foreground">
                          {f.cliente_nombre}
                        </span>
                        {f.tipo === 'CREDITO' && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                            CREDITO
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-bold">{formatUsd(f.total_usd)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(f.fecha)} &middot; Saldo pend: {formatUsd(f.saldo_pend_usd)}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabla de NCR existentes */}
      <div className="rounded-xl bg-card shadow-md">
        {loadingNotas ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : notas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileX className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No hay notas de credito registradas</p>
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

      {/* Modal */}
      <CrearNcrModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        factura={facturaSeleccionada}
      />
    </div>
  )
}
