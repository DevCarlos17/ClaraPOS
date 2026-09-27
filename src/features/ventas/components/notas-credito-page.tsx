import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/page-header'
import { SegmentedTabs, tabContentVariants } from '@/components/shared/segmented-tabs'
import { FacturasEmpresaTab } from './facturas-empresa-tab'
import { NotasCreditoTab } from './notas-credito-tab'

type TabActiva = 'facturas' | 'notas-credito'

const TAB_ORDER: TabActiva[] = ['facturas', 'notas-credito']

const TABS = [
  { key: 'facturas' as const, label: 'Facturas' },
  { key: 'notas-credito' as const, label: 'Notas de credito' },
]

/**
 * Ruta "Facturas emitidas" (design.md §Decision 1, mismo patron que
 * `traspasos.tsx`/`gastos-dashboard.tsx`/`horarios-staff-page.tsx`: tabs sin
 * rutas anidadas ni search param). Pestana "Facturas" primaria y activa por
 * defecto; "Notas de credito" secundaria conserva el comportamiento
 * existente sin cambios (Slice C3a — estructura + contenido movido; filtros
 * nuevos llegan en Slice C3b).
 *
 * facturas-emitidas-tabla-tabs-ui: tabs migradas del `Tabs` shadcn al mismo
 * `SegmentedTabs` compartido que usa `kardex.tsx` (tab-bar de ancho natural,
 * agrupada a la izquierda, con borde + subrayado azul animado) para lograr
 * el look de "cap" adjunto a la tarjeta de filtros sin apilar hacks locales.
 *
 * WU2 (datatable-referencia-unificado): la pestaña "Facturas" activa el
 * `DataTable` con toolbar/paginacion internos (`FacturasEmpresaTab`) — para
 * que SOLO el body de la tabla scrollee (footer de paginacion siempre
 * visible), todo el arbol desde este componente hasta el `DataTable` debe
 * ser una cadena `flex flex-col min-h-0` sin cortes: `<main>` de
 * `route.tsx` ya aporta `flex-1 min-h-0 flex flex-col` (WU1b) — este
 * componente completa la cadena (`h-full flex flex-col min-h-0`) SOLO
 * cuando `tabActiva === 'facturas'`.
 *
 * La cadena es CONDICIONAL a proposito, no incondicional: "Notas de
 * credito" no tiene su propio scroll interno (tabla `<table>` plana, sin
 * `ScrollArea`) y debe seguir creciendo a su alto natural con scroll de
 * PAGINA via el `overflow-y-auto` de `<main>` (comportamiento preservado
 * sin cambios). Si la cadena `min-h-0`/`overflow-hidden` quedara fija sin
 * condicionar por tab, el contenido de "Notas de credito" quedaria
 * RECORTADO (clip silencioso) en vez de scrollear — el flex item se
 * encoge a `min-h-0` pero su contenido (sin `flex-1` propio) excede esa
 * caja, y `overflow-hidden` oculta el excedente en vez de mostrarlo.
 */
export function NotasCreditoPage() {
  const [tabActiva, setTabActiva] = useState<TabActiva>('facturas')
  const [prevTab, setPrevTab] = useState<TabActiva>('facturas')

  function handleTabChange(key: TabActiva) {
    setPrevTab(tabActiva)
    setTabActiva(key)
  }

  const direction = TAB_ORDER.indexOf(tabActiva) > TAB_ORDER.indexOf(prevTab) ? 1 : -1

  const facturasActiva = tabActiva === 'facturas'

  return (
    <div className={cn('flex flex-col gap-6', facturasActiva && 'h-full min-h-0')}>
      <PageHeader titulo="Facturas emitidas" descripcion="Consulta de facturas y notas de credito" />

      <div className={cn('flex flex-col', facturasActiva && 'flex-1 min-h-0')}>
        <SegmentedTabs tabs={TABS} active={tabActiva} onChange={handleTabChange} />

        <div className={cn('overflow-hidden', facturasActiva && 'flex-1 min-h-0')}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={tabActiva}
              custom={direction}
              variants={tabContentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={cn(facturasActiva && 'h-full flex flex-col min-h-0')}
            >
              {tabActiva === 'facturas' && <FacturasEmpresaTab />}

              {tabActiva === 'notas-credito' && <NotasCreditoTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
