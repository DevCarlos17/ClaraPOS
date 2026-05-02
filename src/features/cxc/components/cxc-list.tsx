import { useState } from 'react'
import { Search, Users, DollarSign, FileText, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { useClientesConDeuda, useBuscarClientesDeuda, type ClienteConDeuda } from '../hooks/use-cxc'
import { CxcClienteDetalle } from './cxc-cliente-detalle'
import { CxcReportesGeneral } from './cxc-reportes-general'

type SortField = 'identificacion' | 'nombre' | 'facturas_pendientes' | 'saldo_actual' | 'limite_credito_usd'
type SortDir = 'asc' | 'desc'

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ChevronsUpDown size={12} className="ml-1 text-muted-foreground/50" />
  return sortDir === 'asc'
    ? <ArrowUp size={12} className="ml-1 text-primary" />
    : <ArrowDown size={12} className="ml-1 text-primary" />
}

export function CxcList() {
  const [searchQuery, setSearchQuery] = useState('')
  const { clientes: allClientes, isLoading: loadingAll } = useClientesConDeuda()
  const { clientes: searchResults, isLoading: loadingSearch } = useBuscarClientesDeuda(searchQuery)
  const { tasaValor } = useTasaActual()

  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteConDeuda | null>(null)
  const [sortField, setSortField] = useState<SortField>('saldo_actual')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const isSearching = searchQuery.trim().length >= 2
  const clientes = isSearching ? searchResults : allClientes
  const isLoading = isSearching ? loadingSearch : loadingAll

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const clientesSorted = [...clientes].sort((a, b) => {
    let aVal: number | string
    let bVal: number | string
    switch (sortField) {
      case 'identificacion': aVal = a.identificacion; bVal = b.identificacion; break
      case 'nombre': aVal = a.nombre; bVal = b.nombre; break
      case 'facturas_pendientes': aVal = Number(a.facturas_pendientes); bVal = Number(b.facturas_pendientes); break
      case 'saldo_actual': aVal = parseFloat(a.saldo_actual); bVal = parseFloat(b.saldo_actual); break
      case 'limite_credito_usd': aVal = parseFloat(a.limite_credito_usd); bVal = parseFloat(b.limite_credito_usd); break
    }
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string) : (aVal as number) - (bVal as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalDeuda = clientes.reduce((sum, c) => sum + parseFloat(c.saldo_actual), 0)
  const totalClientes = clientes.length
  const totalFacturas = clientes.reduce((sum, c) => sum + Number(c.facturas_pendientes), 0)

  const thSort = (field: SortField, label: string, align: string = 'left', extra?: string) => (
    <th
      className={`text-${align} px-4 py-3 font-medium cursor-pointer select-none hover:bg-muted/70 transition-colors${extra ? ` ${extra}` : ''}`}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
      </span>
    </th>
  )

  const handleSelectCliente = (cliente: ClienteConDeuda) => {
    setClienteSeleccionado(cliente)
  }

  const clienteActual = clienteSeleccionado
    ? (allClientes.find(c => c.id === clienteSeleccionado.id) ?? clienteSeleccionado)
    : null

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-card shadow-md p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Users size={14} />
            Clientes con deuda
          </div>
          <p className="text-2xl font-bold">{totalClientes}</p>
        </div>

        <div className="rounded-xl bg-card shadow-md p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <FileText size={14} />
            Facturas pendientes
          </div>
          <p className="text-2xl font-bold">{totalFacturas}</p>
        </div>

        <div className="rounded-xl bg-red-50 shadow-sm border border-red-200/60 p-4">
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

      {/* Search + Table + Detail split layout */}
      <div className={clienteSeleccionado ? 'grid grid-cols-1 xl:grid-cols-[2fr_3fr] gap-4 items-start' : ''}>
        {/* Search + Table card */}
        <div className="rounded-xl bg-card shadow-md p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar cliente por nombre o identificacion..."
                className="w-full rounded-md border border-input bg-white pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground"
              />
            </div>
            <CxcReportesGeneral clientes={clientesSorted} />
          </div>

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
                    {thSort('identificacion', 'Identificacion', 'left')}
                    {thSort('nombre', 'Cliente', 'left')}
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Telefono</th>
                    {thSort('facturas_pendientes', 'Facturas', 'center')}
                    {thSort('saldo_actual', 'Deuda USD', 'right')}
                    <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Deuda Bs</th>
                    {thSort('limite_credito_usd', 'Limite', 'right', 'hidden lg:table-cell')}
                  </tr>
                </thead>
                <tbody>
                  {clientesSorted.map((c) => {
                    const saldo = parseFloat(c.saldo_actual)
                    const limite = parseFloat(c.limite_credito_usd)
                    const excedido = limite > 0 && saldo > limite
                    const isSelected = clienteSeleccionado?.id === c.id
                    return (
                      <tr
                        key={c.id}
                        className={`border-b border-muted transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel de detalle (inline, sticky) */}
        {clienteSeleccionado && clienteActual && (
          <CxcClienteDetalle
            cliente={clienteActual}
            onClose={() => setClienteSeleccionado(null)}
          />
        )}
      </div>
    </div>
  )
}
