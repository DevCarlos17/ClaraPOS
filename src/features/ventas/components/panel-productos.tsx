import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useQuery } from '@powersync/react'
import { useBuscarProductosVenta, buscarProductoPorCodigoBarras, type ProductoVenta } from '../hooks/use-ventas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatUsd } from '@/lib/currency'
import { buildStockPorDepositoFragments } from '../lib/deposito-venta'

const SCANNER_THRESHOLD_MS = 50

/**
 * `depositoId`: escopea el stock del grid al deposito de la caja activa
 * (Slice 2a, VSD/Producto sin stock en el deposito de la caja queda
 * oculto/bloqueado) — igual contrato que `useBuscarProductosVenta`/
 * `buscarProductoPorCodigoBarras`.
 */
function buildAllProductsQuery(depositoId: string | null) {
  const frag = buildStockPorDepositoFragments(depositoId)
  return {
    sql: `
      SELECT p.id, p.codigo, p.tipo, p.nombre, p.precio_venta_usd, p.precio_mayor_usd,
             ${frag.stockExpr} as stock,
             p.codigo_barras, COALESCE(u.es_decimal, 1) as es_decimal
      FROM productos p
      LEFT JOIN unidades u ON p.unidad_base_id = u.id
      ${frag.joinInventarioStock}
      WHERE p.empresa_id = ? AND p.is_active = 1
        AND (p.tipo = 'S' OR CAST(${frag.stockExpr} AS REAL) > 0)
      ORDER BY p.nombre ASC LIMIT 50
    `,
    paramsPrefix: frag.paramsPrefix,
  }
}

interface PanelProductosProps {
  onSelect: (producto: ProductoVenta) => void
  /** Deposito de la caja activa (Slice 2a) — escopea grid/busqueda/barcode a su stock. */
  depositoId: string | null
}

export interface PanelProductosHandle {
  focus: () => void
}

export const PanelProductos = forwardRef<PanelProductosHandle, PanelProductosProps>(
function PanelProductos({ onSelect, depositoId }, ref) {
  const [query, setQuery] = useState('')
  const { user } = useCurrentUser()
  const inputRef = useRef<HTMLInputElement>(null)
  const lastKeyTime = useRef<number>(0)
  const isScanning = useRef<boolean>(false)

  // All products (shown when query < 2 chars)
  const empresaId = user?.empresa_id ?? ''
  const { sql: allProductsSql, paramsPrefix } = buildAllProductsQuery(depositoId)
  const { data: allProductsRaw } = useQuery(
    empresaId ? allProductsSql : '',
    empresaId ? [...paramsPrefix, empresaId] : []
  )

  // Search results (shown when query >= 2 chars)
  const { productos: searchResults, isLoading: searchLoading } = useBuscarProductosVenta(query, depositoId)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const isSearchMode = query.trim().length >= 2

  const displayedProducts: ProductoVenta[] = isSearchMode
    ? searchResults
    : (allProductsRaw as ProductoVenta[] | undefined) ?? []

  const handleSelect = useCallback((produto: ProductoVenta) => {
    onSelect(produto)
    setQuery('')
    inputRef.current?.focus()
  }, [onSelect])

  const buscarYAgregarPorCodigoBarras = useCallback(async (barcode: string) => {
    if (!user?.empresa_id) return
    const produto = await buscarProductoPorCodigoBarras(barcode, user.empresa_id, depositoId)
    if (produto) {
      onSelect(produto)
      setQuery('')
      inputRef.current?.focus()
    } else {
      toast.error(`Producto no encontrado: ${barcode}`)
      setQuery('')
    }
  }, [user?.empresa_id, onSelect, depositoId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

    if (e.key === 'Enter' && isSearchMode && searchResults.length > 0) {
      e.preventDefault()
      handleSelect(searchResults[0])
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search input */}
      <div className="px-2 py-2 shrink-0">
        <div className="relative">
          <MagnifyingGlass
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar..."
            autoComplete="off"
            className="w-full rounded border bg-white pl-7 pr-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isSearchMode && searchLoading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            Buscando...
          </div>
        ) : displayedProducts.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            {isSearchMode ? 'Sin resultados' : 'Sin productos disponibles'}
          </div>
        ) : (
          displayedProducts.map((p) => {
            const stockNum = parseFloat(p.stock)
            const isServicio = p.tipo === 'S'
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p)}
                className="w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-muted/60 active:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-tight truncate">{p.nombre}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {isServicio
                        ? 'Servicio'
                        : `Stock: ${stockNum.toFixed(p.es_decimal === 1 ? 3 : 0)}`}
                    </p>
                  </div>
                  <span className="text-xs font-semibold shrink-0 text-foreground">
                    {formatUsd(p.precio_venta_usd)}
                  </span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
})
