import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { type Table } from '@tanstack/react-table'
import { cn, getPageNumbers } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type DataTablePaginationProps<TData> = {
  table: Table<TData>
  className?: string
}

export function DataTablePagination<TData>({
  table,
  className,
}: DataTablePaginationProps<TData>) {
  const currentPage = table.getState().pagination.pageIndex + 1
  const totalPages = table.getPageCount()
  const pageNumbers = getPageNumbers(currentPage, totalPages)

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 px-2 w-full',
        className
      )}
    >
      <div className="flex w-full sm:w-auto items-center justify-between sm:justify-start gap-2">
        <div className="flex items-center justify-center text-sm font-medium sm:hidden">
          Página {currentPage} de {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <p className="hidden text-sm font-medium sm:block">Filas por página</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-center sm:justify-end flex-wrap">
        <div className="hidden sm:flex items-center justify-center text-sm font-medium min-w-[100px]">
          Página {currentPage} de {totalPages}
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center">
          <Button
            variant="outline"
            className="size-8 p-0 hidden sm:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Ir a primera página</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="size-8 p-0 shrink-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Página anterior</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 flex-wrap justify-center">
            {pageNumbers.map((pageNumber, index) => (
              <div key={`${pageNumber}-${index}`} className="flex items-center">
                {pageNumber === '...' ? (
                  <span className="text-muted-foreground px-1 text-sm">...</span>
                ) : (
                  <Button
                    variant={currentPage === pageNumber ? 'default' : 'outline'}
                    className="h-8 min-w-8 px-2 shrink-0"
                    onClick={() => table.setPageIndex((pageNumber as number) - 1)}
                  >
                    <span className="sr-only">Ir a página {pageNumber}</span>
                    {pageNumber}
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            className="size-8 p-0 shrink-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Página siguiente</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="size-8 p-0 hidden sm:flex shrink-0"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Ir a última página</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
