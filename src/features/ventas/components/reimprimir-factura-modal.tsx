import { DownloadSimple, ShareNetwork } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FacturaDetallePanel } from './factura-detalle-panel'
import { useReciboDesdeFactura } from '../utils/recibo-desde-factura'
import { descargarReciboPdf, compartirReciboImagen } from '../utils/factura-export'
import type { FacturaParaAnular } from '../hooks/use-notas-credito'

/**
 * Reimpresion de una factura guardada (Design §Decision 5, §Data Flow).
 * Superficie de SOLO LECTURA: `useReciboDesdeFactura` reconstruye el mismo
 * `ReciboData` del recibo original (esReimpresion: true -> marca visible en
 * PDF/texto/PNG, ver factura-export.ts) y reusa `FacturaDetallePanel`
 * AS-IS. Los botones Descargar/Compartir mirror `venta-exitosa-modal.tsx`.
 */
interface ReimprimirFacturaModalProps {
  venta: FacturaParaAnular | null
  isOpen: boolean
  onClose: () => void
}

export function ReimprimirFacturaModal({ venta, isOpen, onClose }: ReimprimirFacturaModalProps) {
  const { recibo, isLoading } = useReciboDesdeFactura(venta, {
    esReimpresion: true,
    derivarMonedaPresentacion: true,
  })

  // Evaluado en cada render (no module-level, a diferencia de
  // `venta-exitosa-modal.tsx`) para que el boton reaccione si el entorno
  // cambia entre aperturas del modal (y para permitir `vi.stubGlobal` por test).
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  function handleDescargar() {
    if (!recibo) return
    descargarReciboPdf(recibo)
  }

  async function handleCompartir() {
    if (!recibo) return
    try {
      await compartirReciboImagen(recibo)
    } catch (err) {
      // `compartirReciboImagen` ya traga AbortError internamente en su flujo
      // real (ver su JSDoc), pero esta guarda es defensa en profundidad para
      // que cancelar el share sheet NUNCA muestre error, sin importar el
      // origen exacto del rechazo (mismo contrato que `venta-exitosa-modal.tsx`).
      const esAbort = (err instanceof DOMException || err instanceof Error) && err.name === 'AbortError'
      if (esAbort) return
      toast.error(err instanceof Error ? err.message : 'Error al compartir el recibo')
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reimprimir Factura</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            Cargando factura...
          </div>
        ) : (
          <>
            <FacturaDetallePanel recibo={recibo} />
            <div className={puedeCompartir ? 'grid grid-cols-2 gap-2' : ''}>
              <Button className="w-full" variant="outline" disabled={!recibo} onClick={handleDescargar}>
                <DownloadSimple className="size-4" />
                Descargar PDF
              </Button>
              {puedeCompartir && (
                <Button className="w-full" variant="outline" disabled={!recibo} onClick={handleCompartir}>
                  <ShareNetwork className="size-4" />
                  Compartir
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
