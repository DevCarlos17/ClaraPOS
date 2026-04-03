import { createFileRoute } from '@tanstack/react-router'
import { CuadrePage } from '@/features/reportes/components/cuadre-page'

export const Route = createFileRoute('/_app/reportes')({
  component: ReportesPage,
})

function ReportesPage() {
  return <CuadrePage />
}
