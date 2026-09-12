import { DownloadSimple, ShareNetwork } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FacturaDetallePanel } from './factura-detalle-panel'
import { useReciboDesdeFactura } from '../utils/recibo-desde-factura'
import { descargarReciboPdf, compartirReciboImagen } from '../utils/factura-export'
import type { FacturaParaAnular } from '../hooks/use-notas-credito'

/**
 * Consulta de una factura guardada (Design §Decision 5, §Data Flow).
 * Superficie de SOLO LECTURA: `useReciboDesdeFactura` reconstruye el mismo
 * `ReciboData` del recibo original (esReimpresion: true -> marca visible en
 * PDF/texto/PNG, ver factura-export.ts) y reusa `FacturaDetallePanel`
 * AS-IS. Los botones Descargar/Compartir mirror `venta-exitosa-modal.tsx`.
 */
interface ConsultaFacturaModalProps {
  venta: FacturaParaAnular | null
  isOpen: boolean
  onClose: () => void
  /**
   * Contenedor del portal. Necesario cuando este modal se abre desde otro modal
   * montado como `<dialog>` nativo con `showModal()` (top layer del navegador):
   * sin esto el contenido se portaliza al body y queda TAPADO por la top layer
   * (se ve solo el overlay). Ver `nota-credito-pos-modal.tsx`. Los demas
   * consumidores (Gestion de Clientes, Ventas -> Consultas) lo omiten y usan el
   * default de Radix (`document.body`).
   */
  portalContainer?: HTMLElement | null
}

export function ConsultaFacturaModal({ venta, isOpen, onClose, portalContainer }: ConsultaFacturaModalProps) {
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" container={portalContainer ?? undefined}>
        <DialogHeader>
          <DialogTitle>Consulta de Factura</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            Cargando factura...
          </div>
        ) : (
          <>
            <FacturaDetallePanel recibo={recibo} />
            <div className={puedeCompartir ? 'grid grid-cols-2 gap-2' : ''}>
              <Button
                className="w-full border-slate-300"
                variant="outline"
                disabled={!recibo}
                onClick={handleDescargar}
              >
                <DownloadSimple className="size-4" />
                Descargar PDF
              </Button>
              {puedeCompartir && (
                <Button
                  className="w-full border-slate-300"
                  variant="outline"
                  disabled={!recibo}
                  onClick={handleCompartir}
                >
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
