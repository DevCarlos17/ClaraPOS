import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Search } from 'lucide-react'
import { useBuscarProductosVenta, type ProductoVenta } from '../hooks/use-ventas'
import { formatUsd } from '@/lib/currency'

interface ProductoBuscadorProps {
  onSelect: (producto: ProductoVenta) => void
}

export interface ProductoBuscadorHandle {
  focus: () => void
}

export const ProductoBuscador = forwardRef<ProductoBuscadorHandle, ProductoBuscadorProps>(
function ProductoBuscador({ onSelect }, ref) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const { productos, isLoading } = useBuscarProductosVenta(query)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  // Resetear índice activo cuando cambian los resultados
  useEffect(() => {
    setActiveIndex(-1)
    itemRefs.current = []
  }, [productos])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Mantener el ítem activo visible en el scroll del dropdown
  useEffect(() => {
    if (activeIndex >= 0) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  const handleSelect = (producto: ProductoVenta) => {
    onSelect(producto)
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  const dropdownVisible = open && query.trim().length >= 2
  const totalItems = productos.length

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownVisible) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && productos[activeIndex]) {
          handleSelect(productos[activeIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setActiveIndex(-1)
        break
    }
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
          onKeyDown={handleKeyDown}
          placeholder="Buscar producto por nombre o codigo..."
          autoComplete="off"
          role="combobox"
          aria-expanded={dropdownVisible}
          aria-activedescendant={activeIndex >= 0 ? `producto-option-${activeIndex}` : undefined}
          className="w-full rounded-lg border bg-white pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {dropdownVisible && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-lg border bg-white shadow-md max-h-60 overflow-y-auto"
        >
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground text-center">Buscando...</div>
          ) : productos.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">Sin resultados</div>
          ) : (
            productos.map((p, i) => (
              <button
                key={p.id}
                id={`producto-option-${i}`}
                ref={(el) => { itemRefs.current[i] = el }}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => handleSelect(p)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`w-full text-left px-3 py-2 transition-colors border-b last:border-b-0 ${
                  i === activeIndex ? 'bg-primary/10' : 'hover:bg-muted'
                }`}
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
})
