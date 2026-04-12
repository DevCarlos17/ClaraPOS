import { useState } from 'react'
import { Search, Users, DollarSign, FileText } from 'lucide-react'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { useClientesConDeuda, useBuscarClientesDeuda, type ClienteConDeuda } from '../hooks/use-cxc'
import { CxcClienteDetalle } from './cxc-cliente-detalle'

export function CxcList() {
  const [searchQuery, setSearchQuery] = useState('')
  const { clientes: allClientes, isLoading: loadingAll } = useClientesConDeuda()
  const { clientes: searchResults, isLoading: loadingSearch } = useBuscarClientesDeuda(searchQuery)
  const { tasaValor } = useTasaActual()

  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteConDeuda | null>(null)
  const [detalleOpen, setDetalleOpen] = useState(false)

  const isSearching = searchQuery.trim().length >= 2
  const clientes = isSearching ? searchResults : allClientes
  const isLoading = isSearching ? loadingSearch : loadingAll

  // Totales
  const totalDeuda = clientes.reduce((sum, c) => sum + parseFloat(c.saldo_actual), 0)
  const totalClientes = clientes.length
  const totalFacturas = clientes.reduce((sum, c) => sum + Number(c.facturas_pendientes), 0)

  const handleSelectCliente = (cliente: ClienteConDeuda) => {
    setClienteSeleccionado(cliente)
    setDetalleOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Users size={14} />
            Clientes con deuda
          </div>
          <p className="text-2xl font-bold">{totalClientes}</p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <FileText size={14} />
            Facturas pendientes
          </div>
          <p className="text-2xl font-bold">{totalFacturas}</p>
        </div>

        <div className="rounded-lg border bg-red-50 p-4">
          <div className="flex items-center gap-2 text-sm text-red-700/70 mb-1">
            <DollarSign size={14} />
            Deuda total
          </div>
          <p className="text-2xl font-bold text-red-600">{formatUsd(totalDeuda)}</p>
          {tasaValor > 0 && (
            <p className="text-xs text-red-700/50">{formatBs(usdToBs(totalDeuda, tasaValor))}</p>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar cliente por nombre o identificacion..."
          className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : clientes.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <DollarSign size={40} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {isSearching ? 'Sin resultados' : 'No hay clientes con deuda pendiente'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {isSearching
              ? 'Intenta con otro termino de busqueda'
              : 'Las deudas se generan al crear ventas a credito'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Identificacion</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Telefono</th>
                <th className="text-center px-4 py-3 font-medium">Facturas</th>
                <th className="text-right px-4 py-3 font-medium">Deuda USD</th>
                <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Deuda Bs</th>
                <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">Limite</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => {
                const saldo = parseFloat(c.saldo_actual)
                const limite = parseFloat(c.limite_credito_usd)
                const excedido = limite > 0 && saldo > limite
                return (
                  <tr
                    key={c.id}
                    className="border-b border-muted hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => handleSelectCliente(c)}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{c.identificacion}</td>
                    <td className="px-4 py-3 font-medium">{c.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {c.telefono || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-red-50 text-red-700 text-xs font-medium px-2 py-0.5 ring-1 ring-red-600/20 ring-inset">
                        {c.facturas_pendientes}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">
                      {formatUsd(saldo)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                      {tasaValor > 0 ? formatBs(usdToBs(saldo, tasaValor)) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      <span className={excedido ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                        {formatUsd(limite)}
                      </span>
                      {excedido && (
                        <span className="ml-1 text-xs text-destructive">Excedido</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectCliente(c)
                        }}
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        Ver detalles
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      <CxcClienteDetalle
        isOpen={detalleOpen}
        onClose={() => setDetalleOpen(false)}
        cliente={clienteSeleccionado}
      />
    </div>
  )
}
