import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from 'lucide-react'
import { type Column } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type DataTableColumnHeaderProps<TData, TValue> =
  React.HTMLAttributes<HTMLDivElement> & {
    column: Column<TData, TValue>
    title: string
  }

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const metaClassName = (column.columnDef.meta as { className?: string } | undefined)?.className
  const isCentered = className?.includes('text-center') || metaClassName?.includes('text-center')

  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  return (
    <div className={cn('flex items-center space-x-2', isCentered && 'justify-center', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="data-[state=open]:bg-accent h-8"
          >
            <span>{title}</span>
            {column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ms-2 h-4 w-4" />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ms-2 h-4 w-4" />
            ) : (
              <ChevronsUpDown className="ms-2 h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUp className="text-muted-foreground/70 size-3.5" />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDown className="text-muted-foreground/70 size-3.5" />
            Desc
          </DropdownMenuItem>
          {column.getCanHide() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeOff className="text-muted-foreground/70 size-3.5" />
                Ocultar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
