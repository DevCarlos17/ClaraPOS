import { useState, useEffect, useRef } from 'react'
import { useBuscarProductosKardex } from '@/features/inventario/hooks/use-kardex'

interface KardexProductoBuscadorProps {
  value: string
  onChange: (val: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
}

export function KardexProductoBuscador({
  value,
  onChange,
  onKeyDown,
  placeholder,
  className,
}: KardexProductoBuscadorProps) {
  const [inputValue, setInputValue] = useState(value)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync inputValue when value prop changes externally
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Debounce query 300ms
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(inputValue)
    }, 300)
    return () => clearTimeout(timeout)
  }, [inputValue])

  // Close dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const { productos } = useBuscarProductosKardex(debouncedQuery)

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setInputValue(val)
    setOpen(true)
    if (val === '') onChange('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
    }
    onKeyDown?.(e)
  }

  function handleSelect(p: { id: string; nombre: string; codigo: string }) {
    onChange(p.nombre)
    setInputValue(p.nombre)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
      />
      {open && debouncedQuery && productos.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-white shadow-lg max-h-60 overflow-auto">
          {productos.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(p)
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center"
            >
              <span className="font-mono text-xs text-muted-foreground mr-2">{p.codigo}</span>
              {p.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
