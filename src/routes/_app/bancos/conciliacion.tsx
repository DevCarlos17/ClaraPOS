import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/bancos/conciliacion')({
  beforeLoad: () => {
    throw redirect({ to: '/tesoreria' })
  },
})
