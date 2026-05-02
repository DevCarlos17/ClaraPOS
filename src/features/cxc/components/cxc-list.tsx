import { useState } from 'react'
import {
  MagnifyingGlass,
  Users,
  CurrencyDollar,
  CaretRight,
} from '@phosphor-icons/react'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import {
  useClientesConDeuda,
  useBuscarClientesDeuda,
  type ClienteConDeuda,
} from '../hooks/use-cxc'
import { CxcClienteDetalle } from './cxc-cliente-detalle'
import { CxcReportesGeneral } from './cxc-reportes-general'

// ─── KPI Card ─────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-2xl bg-card shadow-lg p-4 border border-border">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold mt-1 tabular-nums ${accent ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────

export function CxcList() {
  const [searchQuery, setSearchQuery] = useState('')
  const { clientes: allClientes, isLoading } = useClientesConDeuda()
  const { clientes: searchResults, isLoading: loadingSearch } = useBuscarClientesDeuda(searchQuery)
  const { tasaValor } = useTasaActual()
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteConDeuda | null>(null)

  const isSearching = searchQuery.trim().length >= 2
  const clientes = isSearching ? searchResults : allClientes
  const clientesLoading = isSearching ? loadingSearch : isLoading

  const totalDeuda = allClientes.reduce((sum, c) => sum + parseFloat(c.saldo_actual), 0)
  const totalClientes = allClientes.length
  const totalFacturas = allClientes.reduce((sum, c) => sum + Number(c.facturas_pendientes), 0)

  const clienteActual = clienteSeleccionado
    ? (allClientes.find((c) => c.id === clienteSeleccionado.id) ?? clienteSeleccionado)
    : null

  // ─── Loading ──────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted/50 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-muted/50 animate-pulse" />
      </div>
    )
  }

  if (allClientes.length === 0) {
    return (
      <div className="rounded-2xl bg-card shadow-lg p-16 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Users size={48} className="opacity-20" />
        <p className="text-base font-medium">Sin cuentas por cobrar</p>
        <p className="text-sm">No hay clientes con saldo pendiente en este momento</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* KPIs globales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Deuda Total"
          value={formatUsd(totalDeuda)}
          sub={tasaValor > 0 ? formatBs(usdToBs(totalDeuda, tasaValor)) : 'Suma de todos los clientes'}
          accent
        />
        <KpiCard
          label="Clientes con Deuda"
          value={String(totalClientes)}
          sub={totalClientes === 1 ? '1 cliente pendiente' : `${totalClientes} clientes pendientes`}
        />
        <KpiCard
          label="Facturas Pendientes"
          value={String(totalFacturas)}
          sub="Total documentos por cobrar"
        />
      </div>

      {/* Layout principal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">

        {/* Panel izquierdo: clientes */}
        <div className="md:col-span-1 rounded-2xl bg-card shadow-lg overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Clientes con Deuda
            </span>
            <CxcReportesGeneral clientes={clientes} />
          </div>

          {/* Buscador */}
          <div className="px-3 py-2 border-b border-border/50">
            <div className="relative">
              <MagnifyingGlass
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre o cedula..."
                className="w-full rounded-md border border-input bg-transparent pl-8 pr-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Lista de clientes */}
          {clientesLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : clientes.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <p className="text-sm">
                {isSearching ? 'Sin resultados' : 'Sin clientes con deuda'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {clientes.map((cliente) => {
                const isSelected = clienteSeleccionado?.id === cliente.id
                const deuda = parseFloat(cliente.saldo_actual)
                return (
                  <button
                    key={cliente.id}
                    type="button"
                    onClick={() => setClienteSeleccionado(cliente)}
                    className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-primary/5 border-l-2 border-primary'
                        : 'hover:bg-muted/30 border-l-2 border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                        {cliente.nombre}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {cliente.identificacion} · {cliente.facturas_pendientes} factura{Number(cliente.facturas_pendientes) !== 1 ? 's' : ''} pendiente{Number(cliente.facturas_pendientes) !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-sm font-bold tabular-nums ${deuda > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {formatUsd(deuda)}
                      </span>
                      <CaretRight size={13} className={isSelected ? 'text-primary' : 'text-muted-foreground/40'} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Total al pie */}
          <div className="px-4 py-2.5 bg-muted/30 border-t border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</span>
            <span className="text-sm font-bold text-destructive tabular-nums">{formatUsd(totalDeuda)}</span>
          </div>
        </div>

        {/* Panel derecho: detalle del cliente */}
        <div className="md:col-span-2">
          {!clienteSeleccionado || !clienteActual ? (
            <div className="rounded-2xl bg-card shadow-lg flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <CurrencyDollar size={40} className="opacity-20" />
              <p className="text-sm font-medium">Seleccione un cliente</p>
              <p className="text-xs">Haga clic en un cliente de la lista para ver sus facturas pendientes</p>
            </div>
          ) : (
            <CxcClienteDetalle
              cliente={clienteActual}
              onClose={() => setClienteSeleccionado(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
