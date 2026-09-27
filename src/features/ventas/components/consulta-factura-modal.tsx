import { DownloadSimple, ShareNetwork } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/shared/bottom-sheet'
import { FacturaDetallePanel } from './factura-detalle-panel'
import { useReciboDesdeFactura } from '../utils/recibo-desde-factura'
import { descargarReciboPdf, compartirReciboImagen } from '../utils/factura-export'
import type { FacturaParaAnular } from '../hooks/use-notas-credito'
import { useGastoAbsorcionFactura } from '@/features/contabilidad/hooks/use-gastos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useMobile } from '@/hooks/use-mobile'

/**
 * Consulta de una factura guardada (Design §Decision 5, §Data Flow).
 * Superficie de SOLO LECTURA: `useReciboDesdeFactura` reconstruye el mismo
 * `ReciboData` del recibo original (esReimpresion: true -> marca visible en
 * PDF/texto/PNG, ver factura-export.ts) y reusa `FacturaDetallePanel`
 * AS-IS. Los botones Descargar/Compartir mirror `venta-exitosa-modal.tsx`.
 *
 * facturas-mobile-bottomsheet: en mobile (`useMobile(1024)`) esta superficie
 * se renderiza en el `BottomSheet` system-wide (`components/shared/
 * bottom-sheet.tsx`) en vez del `Dialog` de escritorio — el cuerpo
 * (recibo/`FacturaDetallePanel`/Descargar/Compartir) se arma UNA sola vez
 * (const `cuerpo` abajo) y se pasa como children a cualquiera de los dos
 * contenedores, para no duplicar la logica de carga (`useReciboDesdeFactura`
 * + `useGastoAbsorcionFactura`) entre ambas superficies. El boton "Aplicar
 * nota de credito" SOLO aparece en el `BottomSheet` (footer fijo, fuera del
 * scroll) porque en desktop esa accion ya vive en el boton de la fila de la
 * tabla (`AplicarNcButton`, `facturas-empresa-tab.tsx`) — agregarla tambien
 * al `Dialog` duplicaria la UI existente sin necesidad (desktop permanece
 * SIN CAMBIOS). `onAplicarNc` es opcional: los otros 2 consumidores del
 * modal (Gestion de Clientes, Ventas -> Consultas) no lo pasan y no ven
 * ningun cambio de comportamiento.
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
   * default de Radix (`document.body`). Solo aplica al `Dialog` de escritorio.
   */
  portalContainer?: HTMLElement | null
  /**
   * facturas-mobile-bottomsheet: accion "Aplicar nota de credito" expuesta
   * SOLO dentro del `BottomSheet` mobile (ver comentario de arriba). Al
   * pulsar, el llamador debe cerrar este sheet Y abrir `CrearNcrModal` — el
   * cierre ocurre ANTES de invocar este callback (ver `handleAplicarNc`
   * abajo) para evitar dos overlays Radix superpuestos (Sheet + Dialog).
   * Omitido = sin boton, comportamiento identico a hoy.
   */
  onAplicarNc?: (f: FacturaParaAnular) => void
}

export function ConsultaFacturaModal({
  venta,
  isOpen,
  onClose,
  portalContainer,
  onAplicarNc,
}: ConsultaFacturaModalProps) {
  const isMobile = useMobile(1024)
  const { recibo, isLoading } = useReciboDesdeFactura(venta, {
    esReimpresion: true,
    derivarMonedaPresentacion: true,
  })

  // Desglose "Pagado/Asumido por el negocio" (nc-reembolso-real-reverso-gasto,
  // Slice B): superficie de solo lectura, mismo predicado que Step C del motor
  // (`nro_factura`). Solo alimenta el display; esta pantalla no emite NC.
  const { user } = useCurrentUser()
  const { gasto: gastoAbsorbidoRaw } = useGastoAbsorcionFactura(
    venta?.nro_factura ?? null,
    user?.empresa_id ?? null
  )
  const gastoAbsorbido = gastoAbsorbidoRaw
    ? { montoUsd: gastoAbsorbidoRaw.monto_usd, tipo: gastoAbsorbidoRaw.descripcion }
    : null

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

  function handleAplicarNc() {
    if (!venta) return
    // Cierra el sheet ANTES de abrir `CrearNcrModal` en el llamador — evita
    // dos overlays Radix (Sheet + Dialog) superpuestos (ver JSDoc de
    // `onAplicarNc` arriba).
    onClose()
    onAplicarNc?.(venta)
  }

  // Cuerpo compartido Dialog/BottomSheet — armado UNA sola vez para que
  // `useReciboDesdeFactura`/`useGastoAbsorcionFactura` (arriba, a nivel de
  // componente) nunca se dupliquen entre las dos superficies.
  const cuerpo = isLoading ? (
    <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
      Cargando factura...
    </div>
  ) : (
    <>
      <FacturaDetallePanel recibo={recibo} gastoAbsorbido={gastoAbsorbido} />
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
  )

  if (isMobile) {
    return (
      <BottomSheet
        open={isOpen}
        onOpenChange={(v) => {
          if (!v) onClose()
        }}
        title="Consulta de Factura"
        bodyClassName="flex flex-col gap-4 p-4"
        footer={
          onAplicarNc && (
            <Button
              type="button"
              className="w-full"
              disabled={!venta || venta.tiene_reverso_total === 1}
              onClick={handleAplicarNc}
            >
              Aplicar nota de credito
            </Button>
          )
        }
      >
        {cuerpo}
      </BottomSheet>
    )
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

        {cuerpo}
      </DialogContent>
    </Dialog>
  )
}
