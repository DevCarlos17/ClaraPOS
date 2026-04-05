import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/reportes')({
  beforeLoad: () => {
    throw redirect({ to: '/ventas/cuadre-de-caja' })
  },
  component: () => null,
})
