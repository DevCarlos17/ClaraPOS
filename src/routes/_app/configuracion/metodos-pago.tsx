import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/configuracion/metodos-pago')({
  beforeLoad: () => {
    throw redirect({ to: '/configuracion/bancos' })
  },
})
