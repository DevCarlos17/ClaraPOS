import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/citas/')({
  beforeLoad: () => { throw redirect({ to: '/citas/calendario' }) },
  component: () => null,
})
