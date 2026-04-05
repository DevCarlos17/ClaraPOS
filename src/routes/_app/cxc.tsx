import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/cxc')({
  beforeLoad: () => {
    throw redirect({ to: '/clientes/cuentas-por-cobrar' })
  },
  component: () => null,
})
