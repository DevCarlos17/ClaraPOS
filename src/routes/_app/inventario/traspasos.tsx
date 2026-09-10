import { createFileRoute } from '@tanstack/react-router'
import { TraspasosPage } from '@/features/inventario/components/traspasos/traspasos-page'

export const Route = createFileRoute('/_app/inventario/traspasos')({
  component: TraspasosPage,
})
