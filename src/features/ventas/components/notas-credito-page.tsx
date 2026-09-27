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
 * agrupada a la izquierda, con borde + subrayado azul animado).
 *
 * facturas-mobile-bottomsheet (Cambio 3): el look "adosado" (tabs fundidas
 * a la tarjeta via `containerClassName="rounded-t-none"`) se retira — ambas
 * pestañas (`FacturasEmpresaTab`/`NotasCreditoTab`) ya NO pasan esa prop, la
 * tarjeta del `DataTable` recupera sus esquinas redondeadas normales
 * (default `rounded-2xl`).
 *
 * Bugfix (mismo cambio, revision posterior): quitar `rounded-t-none` NO
 * bastaba — el wrapper de este componente es `flex flex-col` (a diferencia
 * de `kardex.tsx`, que usa un `<div>` block plano `space-y-0`), y
 * flexbox aplica `align-items: stretch` por default: `SegmentedTabs`
 * (un flex ITEM de este wrapper, aunque su `display` INTERNO sea
 * `inline-flex`) se estiraba a lo ancho completo del contenedor,
 * fusionando visualmente la capsula de tabs con la barra blanca completa
 * en vez de mostrarla de ancho natural. Fix real (`self-start` en el
 * propio `SegmentedTabs`, ver `segmented-tabs.tsx`) — no reproducible con
 * cambios solo en este archivo. El resultado visual final SI es identico
 * al de `kardex.tsx`: sin gap entre `SegmentedTabs` y el contenido, el
 * borde SUPERIOR de la tarjeta del `DataTable` hace de linea base de
 * ancho completo debajo de las tabs de ancho natural — misma estructura
 * `flex flex-col min-h-0` que ya existia (WU2/WU3, parrafo de abajo).
 *
 * WU2/WU3 (datatable-referencia-unificado / notas-credito-datatable): AMBAS
 * pestañas activan el `DataTable` con toolbar/paginacion internos
 * (`FacturasEmpresaTab`/`NotasCreditoTab`) — para que SOLO el body de la
 * tabla scrollee (footer de paginacion siempre visible), todo el arbol
 * desde este componente hasta el `DataTable` debe ser una cadena
 * `flex flex-col min-h-0` sin cortes: `<main>` de `route.tsx` ya aporta
 * `flex-1 min-h-0 flex flex-col` (WU1b) — este componente completa la
 * cadena (`h-full flex flex-col min-h-0`) para AMBOS tabs, ya sin condicion
 * (WU3: antes solo `tabActiva === 'facturas'` tenia scroll interno propio;
 * "Notas de credito" era una tabla `<table>` plana sin `ScrollArea` que
 * crecia a su alto natural con scroll de PAGINA — ahora que ambas usan
 * `DataTable`, ambas necesitan la misma cadena de contencion de alto, o el
 * contenido quedaria RECORTADO por `overflow-hidden` en vez de scrollear).
 */
export function NotasCreditoPage() {
  const [tabActiva, setTabActiva] = useState<TabActiva>('facturas')
  const [prevTab, setPrevTab] = useState<TabActiva>('facturas')

  function handleTabChange(key: TabActiva) {
    setPrevTab(tabActiva)
    setTabActiva(key)
  }

  const direction = TAB_ORDER.indexOf(tabActiva) > TAB_ORDER.indexOf(prevTab) ? 1 : -1

  return (
    <div className={cn('flex flex-col gap-0 lg:gap-6', 'h-full min-h-0')}>
      <PageHeader titulo="Facturas emitidas" descripcion="Consulta de facturas y notas de credito" />

      <div className={cn('flex flex-col', 'flex-1 min-h-0')}>
        <SegmentedTabs tabs={TABS} active={tabActiva} onChange={handleTabChange} />

        <div className={cn('overflow-hidden', 'flex-1 min-h-0')}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={tabActiva}
              custom={direction}
              variants={tabContentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={cn('h-full flex flex-col min-h-0')}
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
