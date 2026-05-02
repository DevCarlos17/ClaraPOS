import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { RetIvaCompraList } from '@/features/compras/components/ret-iva-compra-list'
import { RetIslrCompraList } from '@/features/compras/components/ret-islr-compra-list'
import { SegmentedTabs, tabContentVariants } from '@/components/shared/segmented-tabs'

export const Route = createFileRoute('/_app/compras/retenciones')({
  component: RetencionesCompraPage,
})

type TabActiva = 'iva' | 'islr'

const TAB_ORDER: TabActiva[] = ['iva', 'islr']

const TABS = [
  { key: 'iva'  as const, label: 'IVA' },
  { key: 'islr' as const, label: 'ISLR' },
]

function RetencionesCompraPage() {
  const [tabActiva, setTabActiva] = useState<TabActiva>('iva')
  const [prevTab, setPrevTab] = useState<TabActiva>('iva')

  function handleTabChange(key: TabActiva) {
    setPrevTab(tabActiva)
    setTabActiva(key)
  }

  const direction = TAB_ORDER.indexOf(tabActiva) > TAB_ORDER.indexOf(prevTab) ? 1 : -1

  return (
    <RequirePermission permission={PERMISSIONS.PURCHASES_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Retenciones" descripcion="Retenciones de IVA e ISLR en compras" />

        <div className="space-y-0">
          <SegmentedTabs
            tabs={TABS}
            active={tabActiva}
            onChange={handleTabChange}
            layoutId="retenciones-tab"
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
                <div className="rounded-b-xl rounded-tr-xl border border-t-0 bg-card p-6">
                  {tabActiva === 'iva'  && <RetIvaCompraList />}
                  {tabActiva === 'islr' && <RetIslrCompraList />}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </RequirePermission>
  )
}
