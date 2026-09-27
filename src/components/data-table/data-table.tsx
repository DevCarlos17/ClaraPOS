import {
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type Table as TableType,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useMobile } from '@/hooks/use-mobile'
import { DataTableToolbar } from './toolbar'
import { DataTablePagination } from './pagination'
import { DEFAULT_PAGE_SIZE, UNPAGINATED_PAGE_SIZE } from './pagination-utils'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  table?: TableType<TData>
  isLoading?: boolean
  onRowClick?: (row: TData) => void
  emptyMessage?: string
  rowClassName?: string | ((row: TData) => string | undefined)
  /** Atributos HTML extra por fila (p.ej. `data-*` para marcadores semanticos no acoplados a CSS). */
  rowProps?: (row: TData) => Record<string, string>
  containerClassName?: string
  searchKey?: string
  searchPlaceholder?: string
  filters?: {
    columnId: string
    title: string
    options: {
      label: string
      value: string
      icon?: React.ComponentType<{ className?: string }>
    }[]
  }[]
  showToolbar?: boolean
  showPagination?: boolean
  /** Controles custom (ej. rango de fechas) en la misma fila del buscador, antes de "Vista". Default: nada renderizado. */
  toolbarSlot?: React.ReactNode
  /** Predicado custom para el buscador propio de DataTable (multi-campo / keywords). Default: filtro por substring de TanStack sobre columnas visibles. */
  globalFilterFn?: (row: TData, filterValue: string) => boolean
  /**
   * Render-prop de card para viewport `< lg`. OPT-IN explicito: si se omite,
   * el `DataTable` SIEMPRE renderiza el `<Table>` de escritorio sin importar
   * el viewport (identico al comportamiento previo a este cambio — scroll
   * horizontal en mobile, sin card). Pasar esta prop es lo unico que activa
   * la vista de cards; no existe un fallback generico automatico (ver
   * `mobile-card-fallback.ts`/`derivarCamposMobile` si un consumidor quiere
   * construir su propio `renderMobileCard` a partir de las celdas visibles).
   */
  renderMobileCard?: (row: TData) => React.ReactNode
  /** Activa modo controlado (server-side). Default `false` = paginacion cliente. */
  manualPagination?: boolean
  /** Requerido con `manualPagination`. Total de paginas segun el server. */
  pageCount?: number
  /** Requerido con `manualPagination`. Estado controlado por el consumidor. */
  pagination?: PaginationState
  /** Requerido con `manualPagination`. */
  onPaginationChange?: OnChangeFn<PaginationState>
}

export function DataTable<TData, TValue>({
  columns,
  data,
  table: externalTable,
  isLoading,
  onRowClick,
  emptyMessage = 'No se encontraron resultados.',
  rowClassName,
  rowProps,
  containerClassName,
  searchKey,
  searchPlaceholder,
  filters,
  showToolbar = true,
  showPagination = true,
  toolbarSlot,
  globalFilterFn,
  renderMobileCard,
  manualPagination = false,
  pageCount,
  pagination,
  onPaginationChange,
}: DataTableProps<TData, TValue>) {
  const internalTable = useReactTable({
    data,
    columns,
    ...(manualPagination
      ? { state: { pagination }, onPaginationChange, manualPagination: true, pageCount }
      : {}),
    globalFilterFn: globalFilterFn
      ? (row, _columnId, value) => globalFilterFn(row.original, value as string)
      : undefined,
    // Guard contra truncacion silenciosa: consumidores con `showPagination=false`
    // (los 3 legacy read-only) deben seguir mostrando TODAS las filas ahora que
    // `getPaginationRowModel` esta registrado siempre (ver design.md §2).
    initialState: manualPagination
      ? undefined
      : { pagination: { pageSize: showPagination ? DEFAULT_PAGE_SIZE : UNPAGINATED_PAGE_SIZE } },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(manualPagination ? {} : { getPaginationRowModel: getPaginationRowModel() }),
  })

  const table = externalTable ?? internalTable
  // Breakpoint `lg` (1024px): mismo umbral que Tailwind, mismo hook ya usado
  // en `cuadre-totales-fiscales.tsx`/`cxc-list.tsx`. Se prefiere el toggle JS
  // (un solo branch montado) sobre CSS `hidden`/`lg:hidden` con doble-mount:
  // jsdom no aplica el stylesheet de Tailwind en tests, por lo que un
  // doble-mount puro-CSS deja ambos branches "visibles" para
  // testing-library (`getByText` no filtra por `display:none` sin CSS real
  // cargado), duplicando cada texto de fila y rompiendo los tests que
  // renderizan el `DataTable` real (ver apply-progress).
  const isMobile = useMobile(1024)
  // Bug CRITICAL (fresh-context review): la vista de cards es OPT-IN via
  // `renderMobileCard`, nunca automatica. Sin esta prop, los 4 consumidores
  // existentes deben renderizar el `<Table>` de escritorio SIEMPRE, sin
  // importar el viewport — identico al comportamiento previo a WU1b. La
  // condicion se evalua inline (no en una variable separada) para que
  // TypeScript angoste `renderMobileCard` a no-undefined dentro del branch.

  function resolveRowClassName(row: TData): string | undefined {
    return typeof rowClassName === 'function' ? rowClassName(row) : rowClassName
  }

  const rows = table.getRowModel().rows

  return (
    <div className={cn(
      'flex flex-1 flex-col min-h-0 rounded-2xl bg-card border shadow-lg overflow-hidden',
      containerClassName
    )}>
      {showToolbar && (
        <div className="p-4 border-b shrink-0">
          <DataTableToolbar
            table={table}
            searchKey={searchKey}
            searchPlaceholder={searchPlaceholder}
            filters={filters}
            toolbarSlot={toolbarSlot}
          />
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        {isMobile && renderMobileCard ? (
          <div className="flex flex-col gap-3 p-4">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full opacity-50 rounded-xl" />
              ))
            ) : rows.length ? (
              rows.map((row) => (
                <div
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn('cursor-pointer', resolveRowClassName(row.original))}
                  {...rowProps?.(row.original)}
                >
                  {renderMobileCard(row.original)}
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm italic font-medium text-muted-foreground/60">
                {emptyMessage}
              </p>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/30 border-b">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        'h-11 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 py-0',
                        (header.column.columnDef.meta as Record<string, string> | undefined)?.className
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    {columns.map((_, colIndex) => (
                      <TableCell key={colIndex} className="py-4 px-4">
                        <Skeleton className="h-4 w-full opacity-50" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length ? (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-muted/40',
                      resolveRowClassName(row.original)
                    )}
                    onClick={() => onRowClick?.(row.original)}
                    {...rowProps?.(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'py-3.5 px-4',
                          (cell.column.columnDef.meta as Record<string, string> | undefined)?.className
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground/60 italic font-medium"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </ScrollArea>

      {showPagination && (
        <div className="p-4 border-t shrink-0">
          <DataTablePagination table={table} />
        </div>
      )}
    </div>
  )
}
