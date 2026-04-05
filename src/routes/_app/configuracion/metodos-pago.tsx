import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { PaymentMethodList } from '@/features/configuracion/components/payment-method-list'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/configuracion/metodos-pago')({
  component: MetodosPagoPage,
})

function MetodosPagoPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Metodos de Pago" descripcion="Gestiona los metodos de pago disponibles" />
        <PaymentMethodList />
      </div>
    </RequirePermission>
  )
}
