import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { useBuscarClientes, type Cliente } from '@/features/clientes/hooks/use-clientes'
import { formatUsd } from '@/lib/currency'

interface ClienteSelectorProps {
  clienteId: string | null
  onSelect: (cliente: Cliente) => void
  onClear: () => void
}

function CreditoBadge({ cliente }: { cliente: Cliente }) {
  const limite = parseFloat(cliente.limite_credito_usd)
  const saldo = parseFloat(cliente.saldo_actual)

  if (limite <= 0) {
    return (
      <span className="text-xs text-muted-foreground">Sin credito asignado</span>
    )
  }

  const disponible = Math.max(0, limite - saldo)
  const excedido = saldo > limite

  return (
    <span className={`text-xs ${excedido ? 'text-destructive' : disponible < limite * 0.2 ? 'text-orange-600' : 'text-green-700'}`}>
      Limite: {formatUsd(limite)} | Disponible: {excedido ? <span className="text-destructive font-medium">Excedido</span> : formatUsd(disponible)}
    </span>
  )
}

export function ClienteSelector({ clienteId, onSelect, onClear }: ClienteSelectorProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedNombre, setSelectedNombre] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const { clientes, isLoading } = useBuscarClientes(query)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (cliente: Cliente) => {
    setSelectedNombre(cliente.nombre)
    setSelectedCliente(cliente)
    setQuery('')
    setOpen(false)
    onSelect(cliente)
  }

  const handleClear = () => {
    setSelectedNombre('')
    setSelectedCliente(null)
    setQuery('')
    onClear()
  }

  if (clienteId && selectedNombre) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{selectedNombre}</p>
          {selectedCliente && (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {selectedCliente.identificacion} | Saldo: {formatUsd(selectedCliente.saldo_actual)}
              </p>
              <CreditoBadge cliente={selectedCliente} />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="shrink-0 rounded-md p-1 hover:bg-muted transition-colors"
        >
          <X size={16} className="text-muted-foreground" />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar cliente por nombre o identificacion..."
          className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground text-center">Buscando...</div>
          ) : clientes.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">Sin resultados</div>
          ) : (
            clientes.map((c) => {
              const limite = parseFloat(c.limite_credito_usd)
              const saldo = parseFloat(c.saldo_actual)
              const disponible = limite > 0 ? Math.max(0, limite - saldo) : null
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.nombre}</p>
                      <p className="text-xs text-muted-foreground">{c.identificacion}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        Saldo: {formatUsd(c.saldo_actual)}
                      </p>
                      {disponible !== null && (
                        <p className={`text-xs ${disponible === 0 && saldo > limite ? 'text-destructive' : 'text-green-700'}`}>
                          Disp: {formatUsd(disponible)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
