import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
    <div className="space-y-6">
      <PageHeader titulo="Facturas emitidas" descripcion="Consulta de facturas y notas de credito" />

      <div className="space-y-0">
        <SegmentedTabs tabs={TABS} active={tabActiva} onChange={handleTabChange} />

        <div className="overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={tabActiva}
              custom={direction}
              variants={tabContentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
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
