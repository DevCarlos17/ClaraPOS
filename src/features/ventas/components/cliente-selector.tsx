import { useState, useRef, useEffect, useLayoutEffect, forwardRef, useImperativeHandle } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { useBuscarClientes, type Cliente } from '@/features/clientes/hooks/use-clientes'
import { formatUsd } from '@/lib/currency'

interface ClienteSelectorProps {
  clienteId: string | null
  onSelect: (cliente: Cliente) => void
  onClear: () => void
}

export interface ClienteSelectorHandle {
  focus: () => void
}


export const ClienteSelector = forwardRef<ClienteSelectorHandle, ClienteSelectorProps>(
function ClienteSelector({ clienteId, onSelect, onClear }, ref) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedNombre, setSelectedNombre] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const { clientes, isLoading } = useBuscarClientes(query)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const dropdownVisible = open && query.trim().length >= 2

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset highlight when results change
  useEffect(() => {
    setActiveIndex(-1)
  }, [clientes])

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  // Calcular posicion fija del dropdown para escapar de parents con overflow-hidden
  useLayoutEffect(() => {
    if (!dropdownVisible || !inputRef.current) return
    const updatePos = () => {
      if (!inputRef.current) return
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [dropdownVisible])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || clientes.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(prev => (prev + 1) % clientes.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(prev => (prev - 1 + clientes.length) % clientes.length)
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      handleSelect(clientes[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

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
    const limite = selectedCliente ? parseFloat(selectedCliente.limite_credito_usd) : 0
    const saldo = selectedCliente ? parseFloat(selectedCliente.saldo_actual) : 0
    const disponible = Math.max(0, limite - saldo)
    const excedido = saldo > limite

    return (
      <div className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2">
        <div className="flex-1 min-w-0">
          {/* Fila 1: cédula primero (siempre visible) + nombre (trunca si es largo) */}
          <div className="flex items-baseline gap-1.5 min-w-0">
            {selectedCliente && (
              <span className="text-xs font-mono text-muted-foreground shrink-0">
                {selectedCliente.identificacion}
              </span>
            )}
            <p className="text-sm font-semibold truncate">{selectedNombre}</p>
          </div>
          {/* Fila 2: Saldo + Disponible (sin Limite) */}
          {selectedCliente && (
            <p className="text-xs mt-0.5">
              <span className="text-muted-foreground">Saldo: {formatUsd(selectedCliente.saldo_actual)}</span>
              {limite > 0 && (
                <>
                  <span className="text-muted-foreground mx-1">|</span>
                  <span className={excedido ? 'text-destructive font-medium' : disponible < limite * 0.2 ? 'text-orange-600' : 'text-green-700'}>
                    Disponible: {excedido ? 'Excedido' : formatUsd(disponible)}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        {/* Botón X clásico con borde */}
        <button
          type="button"
          onClick={handleClear}
          className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-muted-foreground hover:border-destructive/60 hover:text-destructive hover:bg-destructive/5 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (

    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar cliente por nombre o identificacion..."
          className="w-full rounded-lg border bg-white pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {dropdownVisible && (
        <div style={dropdownStyle} className="fixed z-[9999] rounded-lg border bg-white shadow-md max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground text-center">Buscando...</div>
          ) : clientes.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">Sin resultados</div>
          ) : (
            clientes.map((c, i) => {
              const limite = parseFloat(c.limite_credito_usd)
              const saldo = parseFloat(c.saldo_actual)
              const disponible = limite > 0 ? Math.max(0, limite - saldo) : null
              return (
                <button
                  key={c.id}
                  ref={(el) => { itemRefs.current[i] = el }}
                  type="button"
                  onClick={() => handleSelect(c)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full text-left px-3 py-2 transition-colors border-b last:border-b-0 ${activeIndex === i ? 'bg-primary/10' : 'hover:bg-muted'}`}
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
})
