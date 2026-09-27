import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { type Table } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PAGE_SIZE_OPTIONS, canGoNext, canGoPrevious, formatPagerLabel } from './pagination-utils'

type DataTablePaginationProps<TData> = {
  table: Table<TData>
  className?: string
}

export function DataTablePagination<TData>({
  table,
  className,
}: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination
  const pageCount = table.getPageCount()

  return (
    <div className={cn('grid grid-cols-3 items-center gap-2 w-full', className)}>
      <div />

      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          className="size-8 p-0 shrink-0"
          onClick={() => table.previousPage()}
          disabled={!canGoPrevious(pageIndex)}
        >
          <span className="sr-only">Página anterior</span>
          <CaretLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[64px] text-center text-sm font-medium tabular-nums">
          {formatPagerLabel(pageIndex, pageCount)}
        </span>
        <Button
          variant="outline"
          className="size-8 p-0 shrink-0"
          onClick={() => table.nextPage()}
          disabled={!canGoNext(pageIndex, pageCount)}
        >
          <span className="sr-only">Página siguiente</span>
          <CaretRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center justify-end gap-2">
        <p className="hidden text-sm font-medium sm:block">Filas</p>
        <Select
          value={`${pageSize}`}
          onValueChange={(value) => {
            table.setPageSize(Number(value))
            table.setPageIndex(0)
          }}
        >
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue placeholder={pageSize} />
          </SelectTrigger>
          <SelectContent side="top">
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={`${size}`}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
