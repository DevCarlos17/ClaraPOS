import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { LoteList } from '@/features/inventario/components/lotes/lote-list'
import { LoteTrazabilidad } from '@/features/inventario/components/lotes/lote-trazabilidad'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { SegmentedTabs, tabContentVariants } from '@/components/shared/segmented-tabs'

export const Route = createFileRoute('/_app/inventario/lotes')({
  component: LotesPage,
})

type TabActiva = 'lotes' | 'trazabilidad'

const TAB_ORDER: TabActiva[] = ['lotes', 'trazabilidad']

const TABS = [
  { key: 'lotes'         as const, label: 'Lotes' },
  { key: 'trazabilidad'  as const, label: 'Trazabilidad' },
]

function LotesPage() {
  const [tabActiva, setTabActiva] = useState<TabActiva>('lotes')
  const [prevTab, setPrevTab] = useState<TabActiva>('lotes')

  function handleTabChange(key: TabActiva) {
    setPrevTab(tabActiva)
    setTabActiva(key)
  }

  const direction = TAB_ORDER.indexOf(tabActiva) > TAB_ORDER.indexOf(prevTab) ? 1 : -1

  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Lotes" descripcion="Gestion de lotes, vencimientos y trazabilidad" />

        <div className="space-y-0">
          <SegmentedTabs
            tabs={TABS}
            active={tabActiva}
            onChange={handleTabChange}
            layoutId="lotes-tab"
          />

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
                {tabActiva === 'lotes'        && <LoteList />}
                {tabActiva === 'trazabilidad' && <LoteTrazabilidad />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </RequirePermission>
  )
}
