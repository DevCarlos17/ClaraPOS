import { Search, X } from 'lucide-react'
import { type Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTableFacetedFilter } from './faceted-filter'
import { DataTableViewOptions } from './view-options'
import { Separator } from '@/components/ui/separator'

type DataTableToolbarProps<TData> = {
  table: Table<TData>
  searchPlaceholder?: string
  searchKey?: string
  filters?: {
    columnId: string
    title: string
    options: {
      label: string
      value: string
      icon?: React.ComponentType<{ className?: string }>
    }[]
  }[]
}

export function DataTableToolbar<TData>({
  table,
  searchPlaceholder = 'Filtrar...',
  searchKey,
  filters = [],
}: DataTableToolbarProps<TData>) {
  const isFiltered =
    table.getState().columnFilters.length > 0 || table.getState().globalFilter

  const searchValue = searchKey
    ? (table.getColumn(searchKey)?.getFilterValue() as string) ?? ''
    : (table.getState().globalFilter ?? '')

  const filteredRowCount = table.getFilteredRowModel().rows.length
  const totalRowCount = table.getRowCount()
  const hasSearchOrFilters = searchValue || isFiltered

  return (
    <div className="flex flex-col gap-3 md:gap-4 w-full">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 w-full">
        <div className="flex flex-1 min-w-0 items-center gap-2 md:gap-3">
          <div className="relative w-full sm:w-[220px] lg:w-[280px] min-w-0 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(event) =>
                searchKey
                  ? table.getColumn(searchKey)?.setFilterValue(event.target.value)
                  : table.setGlobalFilter(event.target.value)
              }
              className="pl-9 h-8 md:h-9 text-xs md:text-sm"
            />
          </div>

          {hasSearchOrFilters && (
            <>
              <Separator orientation="vertical" className="h-5 md:h-6 hidden md:block" />
              <div className="hidden md:flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground shrink-0">
                <span className="font-medium">{filteredRowCount}</span>
                <span>de</span>
                <span className="font-medium">{totalRowCount}</span>
                <span className="hidden lg:inline">resultados</span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap justify-end">
          {hasSearchOrFilters && (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  table.resetColumnFilters()
                  table.setGlobalFilter('')
                }}
                className="h-8 px-2 md:px-2.5 shrink-0"
                size="sm"
                title="Limpiar filtros"
              >
                <X className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span className="hidden lg:inline ml-1.5 text-xs">Limpiar</span>
              </Button>
              <Separator orientation="vertical" className="h-5 md:h-6 hidden md:block" />
            </>
          )}

          <div className="flex gap-x-1.5 md:gap-x-2 flex-wrap gap-y-1.5 md:gap-y-2">
            {filters.map((filter) => {
              const column = table.getColumn(filter.columnId)
              if (!column) return null
              return (
                <DataTableFacetedFilter
                  key={filter.columnId}
                  column={column}
                  title={filter.title}
                  options={filter.options}
                />
              )
            })}
          </div>

          {filters.length > 0 && (
            <Separator orientation="vertical" className="h-5 md:h-6 hidden md:block" />
          )}

          <div className="shrink-0">
            <DataTableViewOptions table={table} />
          </div>
        </div>
      </div>

      {hasSearchOrFilters && (
        <div className="md:hidden flex items-center gap-1.5 text-xs text-muted-foreground px-0.5">
          <span className="font-medium">{filteredRowCount}</span>
          <span>de</span>
          <span className="font-medium">{totalRowCount}</span>
          <span>resultados</span>
        </div>
      )}
    </div>
  )
}
