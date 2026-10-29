import { useState, useEffect } from 'react'
import { DownloadSimple, ShareNetwork } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/shared/bottom-sheet'
import { FacturaDetallePanel, type PagoIndividualAbono } from './factura-detalle-panel'
import { ConfirmarReversoAbonoModal } from './confirmar-reverso-abono-modal'
import { useReciboDesdeFactura } from '../utils/recibo-desde-factura'
import { descargarReciboPdf, compartirReciboImagen } from '../utils/factura-export'
import { MENSAJES_POR_REASON_CODE } from '../utils/abono-reverso-mensajes'
import type { FacturaParaAnular } from '../hooks/use-notas-credito'
import {
  clasificarAbonoParaReverso,
  type ClasificacionAbonoReverso,
} from '../hooks/use-clasificar-abono-reverso'
import { useGastoAbsorcionFactura } from '@/features/contabilidad/hooks/use-gastos'
import { usePagosFactura } from '@/features/cxc/hooks/use-cxc'
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

  // consulta-factura-reverso-abono-directo (Unit 2): filas CRUDAS de pagos
  // (no agrupadas por metodo) para la nueva seccion "Abonos individuales" —
  // `useReciboDesdeFactura` ya consulta `usePagosFactura` internamente pero
  // descarta `pago.id` al agrupar (ver `recibo.pagos` arriba); esta segunda
  // suscripcion reactiva (misma query, PowerSync) es la unica forma de
  // identificar que abono puntual reversar.
  const { pagos: pagosRaw } = usePagosFactura(venta?.id ?? null)
  const empresaId = user?.empresa_id ?? ''

  // Clasifica (Unit 1) cada pago NO reversado para derivar el estado de
  // accion por fila (spec Requirement "Tres estados deshabilitados
  // distintos") — usa la funcion PURA `clasificarAbonoParaReverso` (no el
  // hook) en un `Promise.all`, porque el hook no puede invocarse N veces
  // dentro de un `.map()` (Rules of Hooks: numero de pagos es dinamico).
  const [clasificaciones, setClasificaciones] = useState<Record<string, ClasificacionAbonoReverso>>({})
  const pagoIdsPendientesKey = pagosRaw
    .filter((p) => p.is_reversed !== 1)
    .map((p) => p.id)
    .join(',')

  useEffect(() => {
    const idsPendientes = pagoIdsPendientesKey ? pagoIdsPendientesKey.split(',') : []
    if (!empresaId || idsPendientes.length === 0) return
    let cancelled = false
    Promise.all(idsPendientes.map((id) => clasificarAbonoParaReverso(empresaId, id)))
      .then((resultados) => {
        if (cancelled) return
        setClasificaciones((prev) => {
          const next = { ...prev }
          for (const r of resultados) next[r.pagoId] = r
          return next
        })
      })
      .catch(() => {
        // Best-effort: si falla, las filas afectadas quedan "Verificando..."
        // indefinidamente (estadoReverso null) en vez de romper el panel.
      })
    return () => {
      cancelled = true
    }
  }, [empresaId, pagoIdsPendientesKey])

  const pagosIndividuales: PagoIndividualAbono[] = pagosRaw.map((p) => {
    const clasificacion = clasificaciones[p.id]
    return {
      id: p.id,
      metodoNombre: p.metodo_nombre,
      monto: Number(p.monto),
      monedaLabel: p.moneda_label === 'BS' ? 'BS' : 'USD',
      fecha: p.fecha,
      isReversed: p.is_reversed === 1,
      estadoReverso: p.is_reversed === 1 ? null : clasificacion?.estado ?? null,
      mensajeDeshabilitado: clasificacion?.reasonCode
        ? MENSAJES_POR_REASON_CODE[clasificacion.reasonCode]
        : null,
    }
  })
  const [pagoIdParaReverso, setPagoIdParaReverso] = useState<string | null>(null)

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
      <FacturaDetallePanel
        recibo={recibo}
        gastoAbsorbido={gastoAbsorbido}
        pagosIndividuales={pagosIndividuales}
        onReversarAbono={setPagoIdParaReverso}
      />
      <div className={puedeCompartir ? 'grid grid-cols-2 gap-2' : ''}>
        <Button
          className="h-10 w-full gap-2.5 rounded-xl"
          variant="secondary"
          disabled={!recibo}
          onClick={handleDescargar}
        >
          <DownloadSimple className="size-4" />
          Descargar PDF
        </Button>
        {puedeCompartir && (
          <Button
            className="h-10 w-full gap-2.5 rounded-xl"
            variant="secondary"
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

  // consulta-factura-reverso-abono-directo (Unit 2): UNA sola instancia,
  // reusada en ambas ramas (mobile/desktop) — el estado `pagoIdParaReverso`
  // vive a nivel de este componente para sobrevivir el cambio de rama.
  const confirmarReversoModal = (
    <ConfirmarReversoAbonoModal
      pagoId={pagoIdParaReverso}
      isOpen={pagoIdParaReverso !== null}
      onClose={() => setPagoIdParaReverso(null)}
      portalContainer={portalContainer}
    />
  )

  if (isMobile) {
    return (
      <>
        <BottomSheet
          open={isOpen}
          onOpenChange={(v) => {
            if (!v) onClose()
          }}
          title="Consulta de Factura"
          bodyClassName="flex flex-col gap-4 p-4"
          // Mismo motivo que la rama Dialog: cuando este modal se abre desde otro
          // modal en la top layer del navegador (`<dialog>` con showModal(), ej.
          // nota-credito-pos-modal), portalizar al body deja el sheet POR DEBAJO
          // de la top layer (bug: solo se veia el overlay). Pasar el contenedor
          // del padre lo apila correctamente encima.
          portalContainer={portalContainer ?? undefined}
          footer={
            onAplicarNc && (
              <Button
                type="button"
                className="h-11 w-full rounded-xl text-base"
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
        {confirmarReversoModal}
      </>
    )
  }

  return (
    <>
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
      {confirmarReversoModal}
    </>
  )
}
