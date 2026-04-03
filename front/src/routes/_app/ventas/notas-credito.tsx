import { createFileRoute } from '@tanstack/react-router'
import { NotasCreditoPage } from '@/features/ventas/components/notas-credito-page'

export const Route = createFileRoute('/_app/ventas/notas-credito')({
  component: NotasCreditoPageRoute,
})

function NotasCreditoPageRoute() {
  return <NotasCreditoPage />
}
