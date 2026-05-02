import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createFileRoute } from '@tanstack/react-router'
import { KardexList } from '@/features/inventario/components/kardex/kardex-list'
import { AjusteMasivo } from '@/features/inventario/components/ajustes/ajuste-masivo'
import { AjusteMotivoList } from '@/features/inventario/components/ajuste-motivos/ajuste-motivo-list'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { SegmentedTabs, tabContentVariants } from '@/components/shared/segmented-tabs'

export const Route = createFileRoute('/_app/inventario/kardex')({
  component: KardexPage,
})

type TabActiva = 'movimientos' | 'ajustes' | 'motivos'

const TAB_ORDER: TabActiva[] = ['movimientos', 'ajustes', 'motivos']

const TABS = [
  { key: 'movimientos' as const, label: 'Movimientos' },
  { key: 'ajustes'     as const, label: 'Ajuste Masivo' },
  { key: 'motivos'     as const, label: 'Motivos de Ajuste' },
]

function KardexPage() {
  const [tabActiva, setTabActiva] = useState<TabActiva>('movimientos')
  const [prevTab, setPrevTab] = useState<TabActiva>('movimientos')

  function handleTabChange(key: TabActiva) {
    setPrevTab(tabActiva)
    setTabActiva(key)
  }

  const direction = TAB_ORDER.indexOf(tabActiva) > TAB_ORDER.indexOf(prevTab) ? 1 : -1

  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Kardex" descripcion="Movimientos y ajustes de inventario" />

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
                {tabActiva === 'movimientos' && <KardexList />}

                {tabActiva === 'ajustes' && (
                  <RequirePermission
                    permission={PERMISSIONS.INVENTORY_ADJUST}
                    fallback={<AccessDeniedPage />}
                  >
                    <AjusteMasivo />
                  </RequirePermission>
                )}

                {tabActiva === 'motivos' && (
                  <RequirePermission
                    permission={PERMISSIONS.INVENTORY_ADJUST}
                    fallback={<AccessDeniedPage />}
                  >
                    <AjusteMotivoList />
                  </RequirePermission>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </RequirePermission>
  )
}
