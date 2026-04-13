import { createFileRoute } from '@tanstack/react-router'
import { UsuarioList } from '@/features/configuracion/components/usuario-list'

export const Route = createFileRoute('/_app/configuracion/usuarios/')({
  component: UsuariosIndexPage,
})

function UsuariosIndexPage() {
  return <UsuarioList />
}
