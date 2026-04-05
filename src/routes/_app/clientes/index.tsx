import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/clientes/')({
  beforeLoad: () => {
    throw redirect({ to: '/clientes/gestion' })
  },
  component: () => null,
})
