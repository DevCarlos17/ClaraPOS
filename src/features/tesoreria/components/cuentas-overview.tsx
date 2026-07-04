import { Bank, Vault, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { formatBs, formatUsd } from '@/lib/currency'
import type { CuentaTesoreria } from '../hooks/use-cuentas-tesoreria'

interface Props {
  cuentas: CuentaTesoreria[]
  selectedId: string | null
  onSelect: (cuenta: CuentaTesoreria) => void
  onDeselect?: () => void
  pendingCounts?: Map<string, number>
}

export function CuentasOverview({ cuentas, selectedId, onSelect, onDeselect, pendingCounts }: Props) {
  // If a card is selected, show ONLY that card (no section headers, no other cards)
  if (selectedId) {
    const seleccionada = cuentas.find((c) => c.id === selectedId)
    if (!seleccionada) return null
    return (
      <div className="py-1">
        <CuentaCard
          cuenta={seleccionada}
          selected
          onSelect={onSelect}
          onDeselect={onDeselect}
          pendingCount={pendingCounts?.get(seleccionada.id) ?? 0}
        />
      </div>
    )
  }

  // No selection: show all cards grouped by type (existing behavior)
  const bancos = cuentas.filter((c) => c.tipo === 'BANCO')
  const cajas = cuentas.filter((c) => c.tipo === 'CAJA_FUERTE')

  if (cuentas.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No hay cuentas configuradas. Cree un banco para comenzar.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {bancos.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Bancos
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {bancos.map((cuenta) => (
              <CuentaCard
                key={cuenta.id}
                cuenta={cuenta}
                selected={false}
                onSelect={onSelect}
                pendingCount={pendingCounts?.get(cuenta.id) ?? 0}
              />
            ))}
          </div>
        </div>
      )}
      {cajas.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Caja Fuerte
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {cajas.map((cuenta) => (
              <CuentaCard
                key={cuenta.id}
                cuenta={cuenta}
                selected={false}
                onSelect={onSelect}
                pendingCount={pendingCounts?.get(cuenta.id) ?? 0}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CuentaCard({
  cuenta,
  selected,
  onSelect,
  onDeselect,
  pendingCount,
}: {
  cuenta: CuentaTesoreria
  selected: boolean
  onSelect: (c: CuentaTesoreria) => void
  onDeselect?: () => void
  pendingCount?: number
}) {
  const Icon = cuenta.tipo === 'BANCO' ? Bank : Vault
  const saldo = parseFloat(cuenta.saldo_actual ?? '0')

  return (
    <button
      onClick={() => onSelect(cuenta)}
      className={cn(
        'relative flex-shrink-0 w-52 rounded-xl border p-4 text-left transition-all',
        'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-card hover:border-primary/40'
      )}
    >
      {/* Pending badge */}
      {pendingCount !== undefined && pendingCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 shadow-sm z-10">
          {pendingCount > 99 ? '99+' : pendingCount}
        </span>
      )}

      {/* X button to deselect — only when selected */}
      {selected && onDeselect && (
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation()
            onDeselect()
          }}
          className="absolute top-2 right-2 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Deseleccionar"
        >
          <X size={13} />
        </span>
      )}

      <div className="flex items-center gap-2 mb-3">
        <div
          className={cn(
            'p-1.5 rounded-lg',
            selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon size={16} weight="bold" />
        </div>
        <span
          className={cn(
            'text-xs font-semibold px-1.5 py-0.5 rounded-full',
            cuenta.moneda_codigo === 'USD'
              ? 'bg-green-100 text-green-700'
              : 'bg-blue-100 text-blue-700'
          )}
        >
          {cuenta.moneda_codigo}
        </span>
      </div>

      <p className="text-sm font-medium leading-tight truncate mb-1">{cuenta.nombre}</p>
      <p
        className={cn(
          'text-lg font-bold tabular-nums',
          saldo < 0 ? 'text-destructive' : selected ? 'text-primary' : 'text-foreground'
        )}
      >
        {cuenta.moneda_codigo === 'USD' ? formatUsd(saldo) : formatBs(saldo)}
      </p>
    </button>
  )
}
