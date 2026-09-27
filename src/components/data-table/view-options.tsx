import { SlidersHorizontal } from '@phosphor-icons/react'
import { type Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { getColumnLabel } from './column-label'

type DataTableViewOptionsProps<TData> = {
  table: Table<TData>
  className?: string
}

export function DataTableViewOptions<TData>({
  table,
  className,
}: DataTableViewOptionsProps<TData>) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('ms-auto hidden h-8 lg:flex items-center gap-2 px-3', className)}
        >
          <SlidersHorizontal className="size-4 shrink-0" />
          <span className="text-xs font-semibold">Columnas</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[180px]">
        <DropdownMenuLabel>Columnas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          // `column.accessorFn` solo existe para columnas `accessorKey:` — las
          // columnas `id:` (ej. cliente/estado) quedaban excluidas pese a
          // tener un `header` humano valido. `getCanHide()` es el filtro
          // correcto: incluye ambos tipos, solo excluye columnas fijas
          // (`enableHiding: false`, ninguna hoy) y la de acciones abajo.
          .filter((column) => column.getCanHide())
          // Header string vacio ('') marca columnas puramente visuales (ej.
          // "acciones") que nunca deben listarse para ocultar/mostrar.
          .filter((column) => column.columnDef.header !== '')
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {getColumnLabel(column.columnDef.header, column.id)}
              </DropdownMenuCheckboxItem>
            )
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
