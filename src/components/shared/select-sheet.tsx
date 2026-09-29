import { useState, type ReactNode } from 'react'
import { CaretUpDown, Check } from '@phosphor-icons/react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

export interface SelectSheetOption {
  /** Valor unico de la opcion (lo que se guarda). */
  value: string
  /** Texto principal mostrado en la lista y en el trigger. */
  label: string
  /** Texto secundario opcional (ej. RIF, codigo). */
  sublabel?: string
  /** Texto extra para el filtro de busqueda (ademas de label/sublabel). */
  keywords?: string
}

export interface SelectSheetProps {
  /** Valor seleccionado (controlado). */
  value: string
  /** Callback al elegir una opcion. */
  onChange: (value: string) => void
  /** Opciones a mostrar. */
  options: SelectSheetOption[]
  /** Titulo del sheet (ej. "Seleccionar proveedor"). */
  title: string
  /** Placeholder del trigger cuando no hay seleccion. */
  placeholder?: string
  /** Placeholder del searchbar. */
  searchPlaceholder?: string
  /** Mensaje cuando no hay resultados de busqueda. */
  emptyMessage?: string
  /** Deshabilita el trigger (ej. mientras carga). */
  disabled?: boolean
  /**
   * Slot opcional renderizado al final de la lista — util para acciones
   * como "Crear nuevo proveedor". Recibe una funcion `close` para cerrar
   * el sheet tras la accion.
   */
  footerAction?: (close: () => void) => ReactNode
}

/**
 * Selector mobile-first que abre un `Sheet` (bottom) con searchbar en vez de
 * un `<select>` nativo. Reutilizable para cualquier lista larga (proveedores,
 * cuentas contables, metodos de pago). La busqueda usa `cmdk` (filtro por
 * label + sublabel + keywords).
 *
 * Reemplaza el patron `<select>` denso en superficies mobile como el wizard
 * de gasto, donde el picker nativo es incomodo y sin busqueda.
 */
export function SelectSheet({
  value,
  onChange,
  options,
  title,
  placeholder = 'Seleccionar',
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'Sin resultados',
  disabled,
  footerAction,
}: SelectSheetProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <>
      {/* Trigger — muestra el valor seleccionado o el placeholder */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-xl border border-input px-3 py-2 text-sm bg-background text-left',
          'focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <span className={cn('truncate', selected ? 'text-foreground' : 'text-muted-foreground')}>
          {selected ? selected.label : placeholder}
        </span>
        <CaretUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        {/* Altura FIJA (h-[85vh], no max-h) para que el sheet no se encoja al
            filtrar a pocos resultados y quede bajo el teclado. El CommandList
            con flex-1 absorbe el espacio restante. */}
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl bg-card p-0 flex flex-col">
          <SheetHeader className="border-b pb-3 shrink-0">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>

          <Command
            className="flex-1 min-h-0"
            filter={(val, search) => {
              // val es el `value` de CommandItem; buscamos en el texto asociado
              const opt = options.find((o) => o.value === val)
              if (!opt) return 0
              const haystack = `${opt.label} ${opt.sublabel ?? ''} ${opt.keywords ?? ''}`.toLowerCase()
              return haystack.includes(search.toLowerCase()) ? 1 : 0
            }}
          >
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList className="flex-1 min-h-0 max-h-none">
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={(val) => {
                      onChange(val)
                      setOpen(false)
                    }}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{opt.label}</p>
                      {opt.sublabel && (
                        <p className="text-xs text-muted-foreground truncate">{opt.sublabel}</p>
                      )}
                    </div>
                    {opt.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>

          {footerAction && (
            <div className="border-t p-3 shrink-0">{footerAction(() => setOpen(false))}</div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
