import { useState, useRef, useEffect, useLayoutEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useBuscarProductosVenta, buscarProductoPorCodigoBarras, type ProductoVenta } from '../hooks/use-ventas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'

const SCANNER_THRESHOLD_MS = 50

interface ProductoBuscadorProps {
  onSelect: (producto: ProductoVenta) => void
  tasa: number
}

export interface ProductoBuscadorHandle {
  focus: () => void
  clear: () => void
}

export const ProductoBuscador = forwardRef<ProductoBuscadorHandle, ProductoBuscadorProps>(
function ProductoBuscador({ onSelect, tasa }, ref) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const { productos, isLoading } = useBuscarProductosVenta(query)
  const { user } = useCurrentUser()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const lastKeyTime = useRef<number>(0)
  const isScanning = useRef<boolean>(false)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => {
      setQuery('')
      setOpen(false)
      setActiveIndex(-1)
    },
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

  const handleSelect = useCallback((producto: ProductoVenta) => {
    onSelect(producto)
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
  }, [onSelect])

  const buscarYAgregarPorCodigoBarras = useCallback(async (barcode: string) => {
    if (!user?.empresa_id) return
    const producto = await buscarProductoPorCodigoBarras(barcode, user.empresa_id)
    if (producto) {
      onSelect(producto)
      setQuery('')
      setOpen(false)
      setActiveIndex(-1)
    } else {
      toast.error(`Producto no encontrado: ${barcode}`)
      setQuery('')
    }
  }, [user?.empresa_id, onSelect])

  const dropdownVisible = open && query.trim().length >= 2
  const totalItems = productos.length

  // Calcular posicion fija del dropdown para escapar de parents con overflow-hidden
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Deteccion de scanner por velocidad entre teclas
    const now = Date.now()
    const delta = now - lastKeyTime.current
    lastKeyTime.current = now

    if (delta < SCANNER_THRESHOLD_MS) {
      isScanning.current = true
    } else {
      isScanning.current = false
    }

    if (e.key === 'Enter' && isScanning.current) {
      e.preventDefault()
      isScanning.current = false
      const barcode = query.trim()
      if (barcode) {
        void buscarYAgregarPorCodigoBarras(barcode)
      }
      return
    }

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
        } else if (productos.length > 0) {
          handleSelect(productos[0])
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
          placeholder="Buscar por nombre, codigo o codigo de barras..."
          autoComplete="new-password"
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
          style={dropdownStyle}
          className="fixed z-[9999] rounded-lg border bg-white shadow-lg max-h-60 overflow-y-auto"
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
                      {p.codigo_barras && (
                        <span className="ml-2 font-mono">CB: {p.codigo_barras}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">{formatUsd(p.precio_venta_usd)}</p>
                    {tasa > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {formatBs(usdToBs(parseFloat(p.precio_venta_usd), tasa))}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
})
