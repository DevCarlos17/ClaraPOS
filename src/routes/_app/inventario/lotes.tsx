import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { LoteList } from '@/features/inventario/components/lotes/lote-list'
import { LoteTrazabilidad } from '@/features/inventario/components/lotes/lote-trazabilidad'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/inventario/lotes')({
  component: LotesPage,
})

type TabActiva = 'lotes' | 'trazabilidad'

function LotesPage() {
  const [tabActiva, setTabActiva] = useState<TabActiva>('lotes')

  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Lotes" descripcion="Gestion de lotes, vencimientos y trazabilidad" />

        <div className="border-b border-border">
          <nav className="-mb-px flex gap-6">
            <button
              onClick={() => setTabActiva('lotes')}
              className={`pb-3 text-sm font-medium transition-colors ${
                tabActiva === 'lotes'
                  ? 'border-b-2 border-blue-600 text-blue-600 cursor-pointer'
                  : 'text-muted-foreground hover:text-foreground cursor-pointer'
              }`}
            >
              Lotes
            </button>
            <button
              onClick={() => setTabActiva('trazabilidad')}
              className={`pb-3 text-sm font-medium transition-colors ${
                tabActiva === 'trazabilidad'
                  ? 'border-b-2 border-blue-600 text-blue-600 cursor-pointer'
                  : 'text-muted-foreground hover:text-foreground cursor-pointer'
              }`}
            >
              Trazabilidad
            </button>
          </nav>
        </div>

        {tabActiva === 'lotes' && <LoteList />}
        {tabActiva === 'trazabilidad' && <LoteTrazabilidad />}
      </div>
    </RequirePermission>
  )
}
