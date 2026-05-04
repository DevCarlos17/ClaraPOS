import { Bank, Vault } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/lib/currency'
import type { CuentaTesoreria } from '../hooks/use-cuentas-tesoreria'

interface Props {
  cuentas: CuentaTesoreria[]
  selectedId: string | null
  onSelect: (cuenta: CuentaTesoreria) => void
}

export function CuentasOverview({ cuentas, selectedId, onSelect }: Props) {
  const bancos = cuentas.filter((c) => c.tipo === 'BANCO')
  const cajas = cuentas.filter((c) => c.tipo === 'CAJA_FUERTE')

  if (cuentas.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No hay cuentas configuradas. Cree un banco o una caja fuerte para comenzar.
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
                selected={selectedId === cuenta.id}
                onSelect={onSelect}
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
                selected={selectedId === cuenta.id}
                onSelect={onSelect}
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
}: {
  cuenta: CuentaTesoreria
  selected: boolean
  onSelect: (c: CuentaTesoreria) => void
}) {
  const Icon = cuenta.tipo === 'BANCO' ? Bank : Vault
  const saldo = parseFloat(cuenta.saldo_actual ?? '0')

  return (
    <button
      onClick={() => onSelect(cuenta)}
      className={cn(
        'flex-shrink-0 w-52 rounded-xl border p-4 text-left transition-all',
        'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-card hover:border-primary/40'
      )}
    >
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
        {cuenta.moneda_simbolo} {formatUsd(saldo)}
      </p>
    </button>
  )
}
