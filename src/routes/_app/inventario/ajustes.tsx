import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { AjusteMotivoList } from '@/features/inventario/components/ajuste-motivos/ajuste-motivo-list'
import { AjusteList } from '@/features/inventario/components/ajustes/ajuste-list'
import { SegmentedTabs, tabContentVariants } from '@/components/shared/segmented-tabs'

export const Route = createFileRoute('/_app/inventario/ajustes')({
  component: AjustesPage,
})

type TabActiva = 'ajustes' | 'motivos'

const TAB_ORDER: TabActiva[] = ['ajustes', 'motivos']

const TABS = [
  { key: 'ajustes' as const, label: 'Ajustes' },
  { key: 'motivos' as const, label: 'Motivos' },
]

function AjustesPage() {
  const [tabActiva, setTabActiva] = useState<TabActiva>('ajustes')
  const [prevTab, setPrevTab] = useState<TabActiva>('ajustes')

  function handleTabChange(key: TabActiva) {
    setPrevTab(tabActiva)
    setTabActiva(key)
  }

  const direction = TAB_ORDER.indexOf(tabActiva) > TAB_ORDER.indexOf(prevTab) ? 1 : -1

  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_ADJUST} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Ajustes de Inventario" descripcion="Entradas y salidas de ajuste de inventario" />

        <div className="space-y-0">
          <SegmentedTabs
            tabs={TABS}
            active={tabActiva}
            onChange={handleTabChange}
            layoutId="ajustes-tab"
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
                {tabActiva === 'ajustes' && <AjusteList />}
                {tabActiva === 'motivos' && <AjusteMotivoList />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </RequirePermission>
  )
}
