import { LayoutDashboard, Package, DollarSign, ShoppingCart } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Dashboard" descripcion="Vision general del negocio" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          titulo="Ventas Hoy"
          valor="--"
          descripcion="Modulo proximo"
          icon={ShoppingCart}
          color="blue"
        />
        <DashboardCard
          titulo="Productos"
          valor="--"
          descripcion="Ver inventario"
          icon={Package}
          color="green"
        />
        <DashboardCard
          titulo="Tasa Actual"
          valor="--"
          descripcion="USD/Bs"
          icon={DollarSign}
          color="amber"
        />
        <DashboardCard
          titulo="Modulos"
          valor="4"
          descripcion="Activos en Fase 1"
          icon={LayoutDashboard}
          color="purple"
        />
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Bienvenido a Nexo21</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Sistema POS y gestion de negocio offline-first. Usa el menu lateral para navegar
          entre los modulos disponibles: <strong>Inventario</strong> (Departamentos, Productos,
          Kardex, Recetas) y <strong>Configuracion</strong> (Tasas de Cambio).
        </p>
        <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
          Los modulos de Clientes, Ventas, Cuentas por Cobrar, Reportes y Clinica
          se habilitaran en fases futuras.
        </p>
      </div>
    </div>
  )
}

function DashboardCard({
  titulo,
  valor,
  descripcion,
  icon: Icon,
  color,
}: {
  titulo: string
  valor: string
  descripcion: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <div className={`p-2 rounded-lg ${colorMap[color] ?? colorMap.blue}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold">{valor}</p>
        <p className="text-xs text-muted-foreground mt-1">{descripcion}</p>
      </div>
    </div>
  )
}
