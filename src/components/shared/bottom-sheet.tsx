import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * Patron mobile de detalle SYSTEM-WIDE (facturas-mobile-bottomsheet):
 * wrapper delgado sobre el `Sheet` de shadcn (`side="bottom"`), pensado para
 * reemplazar los `Dialog` de detalle en viewport mobile (`useMobile(1024)`
 * en el llamador decide Dialog vs BottomSheet — este componente NO conoce
 * breakpoints, solo renderiza el sheet).
 *
 * Contrato:
 * - `open`/`onOpenChange`: mismo patron controlado que `Dialog`/`Sheet`.
 * - `title`: opcional — cuando se omite, no se renderiza `SheetHeader`
 *   (consumidores que ya muestran su propio titulo dentro de `children`
 *   pueden omitirlo, ej. `FacturaDetallePanel` ya trae "Factura #...").
 * - `children`: cuerpo SCROLLEABLE (`overflow-y-auto`, `max-h-[85vh]`) —
 *   pensado para contenido alto como paneles de detalle fiscal completos.
 * - `footer`: opcional, acciones fijas debajo del cuerpo scrolleable (ej.
 *   "Aplicar nota de credito", Descargar/Compartir) — usa el mismo
 *   `SheetFooter` (sticky al fondo, fuera del scroll).
 *
 * Reuso: cualquier pantalla que hoy abre un `Dialog` de detalle en mobile
 * puede migrar a este componente pasando el MISMO contenido interno como
 * `children` (ver `consulta-factura-modal.tsx` para el patron de extraer
 * el cuerpo compartido entre Dialog/BottomSheet).
 */
export interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Titulo opcional, renderizado en un `SheetHeader`. Omitir si el contenido ya trae su propio titulo. */
  title?: ReactNode
  /** Cuerpo scrolleable del sheet. */
  children: ReactNode
  /** Acciones fijas debajo del cuerpo (fuera del scroll). */
  footer?: ReactNode
  /** Clase adicional para el cuerpo scrolleable (ej. ajustar padding). */
  bodyClassName?: string
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
  bodyClassName,
}: BottomSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] rounded-t-2xl bg-card p-0">
        {title && (
          <SheetHeader className="border-b pb-3">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
        )}

        <div className={cn('overflow-y-auto max-h-[85vh]', bodyClassName)}>{children}</div>

        {footer && <SheetFooter className="border-t">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}
