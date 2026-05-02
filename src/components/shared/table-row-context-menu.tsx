import { Fragment, type ComponentType, type ReactNode } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

export interface ContextMenuAction {
  key: string
  label: string
  icon?: ComponentType<{ className?: string }>
  onClick: () => void
  hidden?: boolean
  disabled?: boolean
  variant?: 'default' | 'destructive'
  /** If true, renders a separator above this item */
  separator?: boolean
}

interface TableRowContextMenuProps {
  items: ContextMenuAction[]
  children: ReactNode
  disabled?: boolean
}

export function TableRowContextMenu({
  items,
  children,
  disabled,
}: TableRowContextMenuProps) {
  const visibleItems = items.filter((a) => !a.hidden)

  if (disabled || visibleItems.length === 0) {
    return <>{children}</>
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {visibleItems.map((action) => (
          <Fragment key={action.key}>
            {action.separator && <ContextMenuSeparator />}
            <ContextMenuItem
              onClick={action.onClick}
              disabled={action.disabled}
              variant={action.variant}
            >
              {action.icon && <action.icon className="h-3.5 w-3.5" />}
              {action.label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
