import { useRef, useCallback, useEffect, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingBag,
  ArrowLeftRight,
  BookOpen,
  Users,
  ShoppingCart,
  CreditCard,
  FileX,
  BarChart3,
  Heart,
  Settings,
  DollarSign,
  LogOut,
  ChevronDown,
  Truck,
  Building2,
  UserCog,
  Landmark,
  Wallet,
  Receipt,
  ClipboardList,
  Calculator,
  Tag,
  Ruler,
  Warehouse,
  Layers,
  Monitor,
  ArrowDownUp,
  FileSpreadsheet,
  FileCheck,
  FileMinus,
  BookOpenCheck,
  HandCoins,
  BookText,
  SlidersHorizontal,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/stores/sidebar-store'
import { useAuth } from '@/core/auth/auth-provider'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS, type PermissionKey } from '@/core/hooks/use-permissions'
import { toast } from 'sonner'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

interface ChildMenuItem {
  title: string
  url: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  requiredPermission?: PermissionKey
}

interface MenuItem {
  title: string
  url?: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  disabled?: boolean
  requiredPermission?: PermissionKey
  children?: ChildMenuItem[]
}

const menuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  {
    title: 'Ventas',
    icon: ShoppingCart,
    children: [
      { title: 'Nueva Venta', url: '/ventas/nueva', icon: ShoppingCart, requiredPermission: PERMISSIONS.SALES_CREATE },
      { title: 'Nota de Credito', url: '/ventas/notas-credito', icon: FileX, requiredPermission: PERMISSIONS.SALES_VOID },
      { title: 'Dashboard de Ventas', url: '/ventas/reportes', icon: BarChart3, requiredPermission: PERMISSIONS.REPORTS_VIEW },
      { title: 'Cuadre de Caja', url: '/ventas/cuadre-de-caja', icon: Receipt, requiredPermission: PERMISSIONS.REPORTS_CASHCLOSE },
    ],
  },
  {
    title: 'Caja',
    icon: Wallet,
    children: [
      { title: 'Sesiones', url: '/caja/sesiones', icon: Monitor, requiredPermission: PERMISSIONS.CAJA_ACCESS },
      { title: 'Movimientos', url: '/caja/movimientos', icon: ArrowDownUp, requiredPermission: PERMISSIONS.CAJA_ACCESS },
    ],
  },
  {
    title: 'Inventario',
    icon: Package,
    children: [
      { title: 'Departamentos', url: '/inventario/departamentos', icon: FolderTree, requiredPermission: PERMISSIONS.INVENTORY_VIEW },
      { title: 'Productos / Servicios', url: '/inventario/productos', icon: ShoppingBag, requiredPermission: PERMISSIONS.INVENTORY_VIEW },
      { title: 'Kardex', url: '/inventario/kardex', icon: ArrowLeftRight, requiredPermission: PERMISSIONS.INVENTORY_VIEW },
      { title: 'Servicios y Recetas', url: '/inventario/recetas', icon: BookOpen, requiredPermission: PERMISSIONS.INVENTORY_VIEW },
      { title: 'Reportes de Inventario', url: '/inventario/reportes', icon: BarChart3, requiredPermission: PERMISSIONS.INVENTORY_VIEW },
      { title: 'Marcas', url: '/inventario/marcas', icon: Tag, requiredPermission: PERMISSIONS.INVENTORY_VIEW },
      { title: 'Unidades', url: '/inventario/unidades', icon: Ruler, requiredPermission: PERMISSIONS.INVENTORY_VIEW },
      { title: 'Depositos', url: '/inventario/depositos', icon: Warehouse, requiredPermission: PERMISSIONS.INVENTORY_VIEW },
      { title: 'Lotes', url: '/inventario/lotes', icon: Layers, requiredPermission: PERMISSIONS.INVENTORY_VIEW },
    ],
  },
  {
    title: 'Proveedores',
    icon: Truck,
    children: [
      { title: 'Gestion de Proveedores', url: '/proveedores/gestion', icon: Truck, requiredPermission: PERMISSIONS.INVENTORY_ADJUST },
    ],
  },
  {
    title: 'Compras',
    icon: ClipboardList,
    children: [
      { title: 'Facturas', url: '/compras/facturas', icon: FileSpreadsheet, requiredPermission: PERMISSIONS.PURCHASES_VIEW },
      { title: 'Retenciones', url: '/compras/retenciones', icon: FileCheck, requiredPermission: PERMISSIONS.PURCHASES_VIEW },
      { title: 'Notas Fiscales', url: '/compras/notas-fiscales', icon: FileMinus, requiredPermission: PERMISSIONS.PURCHASES_VIEW },
    ],
  },
  {
    title: 'Contabilidad',
    icon: BookOpenCheck,
    children: [
      { title: 'Libro Contable', url: '/contabilidad/libro-contable', icon: BookText, requiredPermission: PERMISSIONS.ACCOUNTING_VIEW },
      { title: 'Plan de Cuentas', url: '/contabilidad/plan-cuentas', icon: BookOpenCheck, requiredPermission: PERMISSIONS.ACCOUNTING_VIEW },
      { title: 'Gastos', url: '/contabilidad/gastos', icon: HandCoins, requiredPermission: PERMISSIONS.ACCOUNTING_VIEW },
      { title: 'Config. Contable', url: '/contabilidad/cuentas-config', icon: SlidersHorizontal, requiredPermission: PERMISSIONS.ACCOUNTING_VIEW },
    ],
  },
  {
    title: 'Clientes',
    icon: Users,
    children: [
      { title: 'Gestion de Clientes', url: '/clientes/gestion', icon: Users, requiredPermission: PERMISSIONS.CLIENTS_MANAGE },
      { title: 'Cuentas por Cobrar', url: '/clientes/cuentas-por-cobrar', icon: CreditCard, requiredPermission: PERMISSIONS.CLIENTS_CREDIT },
      { title: 'Reportes de CxC', url: '/clientes/reportes', icon: BarChart3, requiredPermission: PERMISSIONS.CLIENTS_CREDIT },
    ],
  },
  {
    title: 'Configuracion',
    icon: Settings,
    children: [
      { title: 'Datos Empresa', url: '/configuracion/datos-empresa', icon: Building2, requiredPermission: PERMISSIONS.CONFIG_RATES },
      { title: 'Tasa de Cambio', url: '/configuracion/tasa-cambio', icon: DollarSign, requiredPermission: PERMISSIONS.CONFIG_RATES },
      { title: 'Usuarios y Perfiles', url: '/configuracion/usuarios', icon: UserCog, requiredPermission: PERMISSIONS.CONFIG_USERS },
      { title: 'Cajas', url: '/configuracion/cajas', icon: Monitor, requiredPermission: PERMISSIONS.CONFIG_RATES },
      { title: 'Impuestos', url: '/configuracion/impuestos', icon: Calculator, requiredPermission: PERMISSIONS.CONFIG_RATES },
    ],
  },
  {
    title: 'Informacion Bancaria',
    icon: Landmark,
    children: [
      { title: 'Bancos', url: '/configuracion/bancos', icon: Landmark, requiredPermission: PERMISSIONS.CONFIG_RATES },
      { title: 'Metodos de Pago', url: '/configuracion/metodos-pago', icon: Wallet, requiredPermission: PERMISSIONS.CONFIG_RATES },
    ],
  },
  { title: 'Clinica', url: '/clinica', icon: Heart, requiredPermission: PERMISSIONS.CLINIC_ACCESS },
]

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { isHovered, setHovered, isMobile, setMobile, setOpen } = useSidebarStore()
  const router = useRouterState()
  const currentPath = router.location.pathname
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mounted, setMounted] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  const { signOut } = useAuth()
  const { user } = useCurrentUser()
  const { hasPermission } = usePermissions()

  // Filter menu items based on permissions
  const filteredMenuItems = menuItems
    .filter((item) => {
      if (item.requiredPermission && !hasPermission(item.requiredPermission)) return false
      if (item.children) {
        return item.children.some((child) => !child.requiredPermission || hasPermission(child.requiredPermission))
      }
      return true
    })
    .map((item) => {
      if (!item.children) return item
      return {
        ...item,
        children: item.children.filter((child) => !child.requiredPermission || hasPermission(child.requiredPermission)),
      }
    })

  const isActive = (path: string) => {
    if (currentPath === path) return true
    if (path !== '/' && currentPath.startsWith(path + '/')) return true
    return false
  }

  const isGroupActive = (children: { url: string }[]) => {
    return children.some((child) => isActive(child.url))
  }

  const toggleGroup = (title: string) => {
    setExpandedGroups((prev) => ({ ...prev, [title]: !prev[title] }))
  }

  const handleLogout = async () => {
    try {
      await signOut()
      toast.success('Sesion cerrada')
      window.location.href = '/login'
    } catch {
      toast.error('Error al cerrar sesion')
    }
  }

  const clearHoverTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const handleMouseEnter = useCallback(() => {
    if (!isMobile) {
      clearHoverTimeout()
      setHovered(true)
    }
  }, [isMobile, setHovered, clearHoverTimeout])

  const handleMouseLeave = useCallback(() => {
    if (!isMobile) {
      clearHoverTimeout()
      timeoutRef.current = setTimeout(() => {
        setHovered(false)
        timeoutRef.current = null
      }, 100)
    }
  }, [isMobile, setHovered, clearHoverTimeout])

  useEffect(() => {
    setMounted(true)
    const checkMobile = () => {
      const isMobileView = window.innerWidth < 768
      setMobile(isMobileView)
      if (!isMobileView && isOpen) setOpen(false)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => {
      window.removeEventListener('resize', checkMobile)
      clearHoverTimeout()
    }
  }, [clearHoverTimeout, setMobile, isOpen, setOpen])

  // Auto-expand groups that have active children
  useEffect(() => {
    const newExpanded: Record<string, boolean> = {}
    for (const item of filteredMenuItems) {
      if (item.children && isGroupActive(item.children)) {
        newExpanded[item.title] = true
      }
    }
    setExpandedGroups((prev) => ({ ...prev, ...newExpanded }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath])

  const handleLinkClick = () => {
    if (isMobile && isOpen) onClose()
  }

  if (!mounted) return null

  const renderMenuItem = (item: MenuItem, expanded: boolean) => {
    if (item.children) {
      const groupExpanded = expandedGroups[item.title] || false
      const groupIsActive = isGroupActive(item.children)

      return (
        <div key={item.title}>
          <button
            onClick={() => toggleGroup(item.title)}
            className={cn(
              'flex items-center w-full gap-3 px-4 py-3 rounded-xl transition-all duration-200 active:scale-[0.98]',
              groupIsActive
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <item.icon size={20} />
            {expanded && (
              <>
                <span className="text-sm font-medium flex-1 text-left">{item.title}</span>
                <ChevronDown
                  size={16}
                  className={cn('transition-transform duration-200', groupExpanded && 'rotate-180')}
                />
              </>
            )}
          </button>
          {expanded && groupExpanded && (
            <div className="ml-4 pl-4 border-l border-border space-y-1 mt-1">
              {item.children.map((child) => {
                const childActive = isActive(child.url)
                return (
                  <Link
                    key={child.url}
                    to={child.url}
                    onClick={handleLinkClick}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm',
                      childActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    <child.icon size={16} />
                    <span>{child.title}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    if (item.disabled) {
      return (
        <div
          key={item.title}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground/50 cursor-not-allowed"
        >
          <item.icon size={20} />
          {expanded && <span className="text-sm">{item.title}</span>}
        </div>
      )
    }

    const isActiveRoute = isActive(item.url!)
    return (
      <Link
        key={item.url}
        to={item.url!}
        onClick={handleLinkClick}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 active:scale-[0.98]',
          isActiveRoute
            ? 'bg-accent text-accent-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        )}
      >
        <item.icon size={20} />
        {expanded && <span className="text-sm font-medium">{item.title}</span>}
      </Link>
    )
  }

  // Mobile drawer
  if (isMobile) {
    return (
      <>
        {isOpen && (
          <div className="fixed inset-0 bg-black/50 z-60 backdrop-blur-sm" onClick={onClose} />
        )}
        <div
          className={cn(
            'fixed left-0 top-0 h-full w-72 bg-card z-70 shadow-2xl transition-transform duration-300 ease-out',
            isOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex flex-col h-full py-6 px-4">
            <Link to="/dashboard" className="flex items-center gap-3 mb-8" onClick={handleLinkClick}>
              <span className="text-2xl font-bold text-primary">CP</span>
              <span className="font-bold text-xl text-card-foreground">ClaraPOS</span>
            </Link>

            <nav className="flex-1 space-y-1 overflow-y-auto">
              {filteredMenuItems.map((item) => renderMenuItem(item, true))}
            </nav>

            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-muted">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-primary-foreground text-sm font-semibold">
                    {user?.nombre?.[0]?.toUpperCase() ?? 'U'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{user?.nombre ?? 'Usuario'}</span>
                  <span className="text-xs text-muted-foreground">{user?.rol_nombre ?? 'Usuario'}</span>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center w-full gap-3 p-3 rounded-xl text-destructive hover:bg-destructive/10 transition-all duration-200 active:scale-[0.98]"
              >
                <LogOut size={20} />
                <span className="text-sm font-medium">Cerrar Sesion</span>
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Desktop hover-expand
  return (
    <div className="fixed left-0 top-0 bottom-0 z-50 flex transition-all duration-300 ease-out">
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'flex flex-col py-8 relative transition-all duration-300 ease-out border-r border-border/80',
          isHovered ? 'w-64 bg-slate-50 shadow-lg' : 'w-[72px] bg-slate-50'
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center mb-10 transition-all duration-300', isHovered ? 'px-6' : 'justify-center px-0')}>
          <Link to="/dashboard" className="shrink-0 transition-transform duration-300 hover:scale-105">
            <span className="text-xl font-bold text-primary">CP</span>
          </Link>
          <span
            className={cn(
              'font-bold tracking-tight text-xl text-foreground whitespace-nowrap transition-all duration-300',
              isHovered ? 'opacity-100 translate-x-0 ml-3' : 'opacity-0 -translate-x-4 w-0 h-0'
            )}
          >
            ClaraPOS
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
          {filteredMenuItems.map((item) => {
            if (item.children) {
              const groupIsActive = isGroupActive(item.children)
              if (!isHovered) {
                // Collapsed: just show icon, active if any child is active
                return (
                  <div key={item.title} className={cn('flex items-center justify-center h-11 w-11 mx-auto rounded-2xl', groupIsActive ? 'text-primary' : 'text-slate-500')}>
                    <item.icon size={20} strokeWidth={groupIsActive ? 2.5 : 2} />
                  </div>
                )
              }
              return renderMenuItem(item, true)
            }

            if (item.disabled) {
              return (
                <div
                  key={item.title}
                  className={cn('flex items-center h-11 rounded-2xl transition-all duration-300 text-slate-300', isHovered ? 'px-3' : 'justify-center w-11 mx-auto')}
                >
                  <div className="shrink-0 w-10 flex justify-center">
                    <item.icon size={20} />
                  </div>
                  {isHovered && <span className="text-sm ml-3 whitespace-nowrap">{item.title}</span>}
                </div>
              )
            }

            const isActiveRoute = isActive(item.url!)
            return (
              <Link
                key={item.url}
                to={item.url!}
                className={cn(
                  'flex items-center h-11 rounded-2xl transition-all duration-300 group relative active:scale-[0.98] overflow-visible',
                  isHovered ? 'px-3' : 'justify-center w-11 mx-auto',
                  isActiveRoute ? 'text-foreground font-bold' : 'text-slate-500 hover:text-slate-900'
                )}
              >
                {isActiveRoute && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="absolute left-[-8px] w-[3px] h-6 bg-primary rounded-full z-20"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <div className="shrink-0 w-10 flex justify-center z-10">
                  <item.icon
                    className={cn('transition-colors duration-300', isActiveRoute ? 'text-primary' : 'opacity-50 group-hover:opacity-100')}
                    size={20}
                    strokeWidth={isActiveRoute ? 2.5 : 2}
                  />
                </div>
                <span
                  className={cn(
                    'text-[14px] tracking-tight transition-all duration-300 whitespace-nowrap ml-3 z-10',
                    isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 w-0 h-0 overflow-hidden'
                  )}
                >
                  {item.title}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div className="mt-auto flex flex-col gap-4 pt-6 border-t border-border px-3">
          <div className={cn('flex items-center rounded-xl hover:bg-muted/40 transition-all duration-300 group active:scale-[0.98] overflow-hidden p-1.5', isHovered ? 'w-full' : 'justify-center w-11 mx-auto')}>
            <div className="w-9 h-9 bg-muted text-primary border border-border/10 rounded-full flex items-center justify-center shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider">
                {user?.nombre?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className={cn('flex flex-col transition-all duration-300 overflow-hidden', isHovered ? 'opacity-100 translate-x-0 ml-3.5' : 'opacity-0 -translate-x-4 w-0 h-0')}>
              <span className="text-[14px] font-bold text-foreground truncate tracking-tight">{user?.nombre ?? 'Usuario'}</span>
              <span className="text-[11px] font-medium text-muted-foreground truncate uppercase tracking-widest leading-none mt-1">{user?.rol_nombre ?? 'Usuario'}</span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className={cn(
              'flex items-center h-10 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-300 group active:scale-[0.98] overflow-hidden',
              isHovered ? 'px-3 w-full' : 'justify-center w-11 mx-auto'
            )}
            title="Cerrar sesion"
          >
            <div className="shrink-0 w-6 flex justify-center">
              <LogOut size={20} strokeWidth={2} />
            </div>
            <span
              className={cn(
                'text-[15px] font-medium transition-all duration-300 whitespace-nowrap',
                isHovered ? 'opacity-100 translate-x-0 ml-4' : 'opacity-0 -translate-x-4'
              )}
            >
              Cerrar Sesion
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
