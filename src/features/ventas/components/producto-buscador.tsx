import { useState, useRef, useEffect } from 'react'
import { Search } from 'lucide-react'
import { useBuscarProductosVenta, type ProductoVenta } from '../hooks/use-ventas'
import { formatUsd } from '@/lib/currency'

interface ProductoBuscadorProps {
  onSelect: (producto: ProductoVenta) => void
}

export function ProductoBuscador({ onSelect }: ProductoBuscadorProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const { productos, isLoading } = useBuscarProductosVenta(query)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (producto: ProductoVenta) => {
    onSelect(producto)
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar producto por nombre o codigo..."
          className="w-full rounded-lg border bg-white pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-white shadow-md max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground text-center">Buscando...</div>
          ) : productos.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">Sin resultados</div>
          ) : (
            productos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p)}
                className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      <span className="text-muted-foreground">{p.codigo}</span>
                      {' - '}
                      {p.nombre}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.tipo === 'S' ? 'Servicio' : `Stock: ${parseFloat(p.stock).toFixed(3)}`}
                    </p>
                  </div>
                  <span className="text-sm font-medium shrink-0">
                    {formatUsd(p.precio_venta_usd)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
