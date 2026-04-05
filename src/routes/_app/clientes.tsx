import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/clientes')({
  component: ClientesLayout,
})

function ClientesLayout() {
  return <Outlet />
}
