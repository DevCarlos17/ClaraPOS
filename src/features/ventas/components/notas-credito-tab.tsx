import { useState, type ReactNode } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table/data-table'
import { DateRangeField } from '@/components/data-table/date-range-field'
import { Card } from '@/components/ui/card'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import { useNotasCredito, type NotaCreditoRow } from '../hooks/use-notas-credito'
import { rangoMesActual } from '../utils/notas-credito-admin-filters'
import { notaCreditoCoincideBusqueda } from '../utils/notas-credito-ui'

/**
 * Pestana secundaria de "Facturas emitidas" (Slice C3b — design.md
 * §Decision 4/7). El buscador de facturas (`useBuscarFacturaParaAnular`) y
 * el modal de C3a se retiran: la pestana "Facturas" (empresa-wide,
 * primaria) es ahora el unico punto de entrada para seleccionar una
 * factura y aplicar una NC (Design §Decision 7 — dead code una vez
 * migrado este consumidor).
 *
 * Slice E.2/E.4 (tester QA feedback): los 3 inputs separados (nro_ncr,
 * cliente, RIF) se reemplazaron por UN SOLO input de busqueda (patron
 * POS); el selector "Tipo" y el boton "Ver todo el historial" se
 * RETIRARON — el rango de fecha (default `rangoMesActual()`) queda como
 * UNICO control de amplitud: no existe ningun escape hatch de historial
 * completo en esta pestaña.
 *
 * Slice E.b (correccion de tester QA sobre E.3): el selector `<select>` de
 * "Estado" (Reverso Total/Reverso Parcial) agregado en E.3 se RETIRA por
 * completo — a diferencia de la pestaña Facturas, el estado de NC NO se
 * folded en la busqueda, simplemente deja de ser un filtro disponible.
 *
 * WU3 (notas-credito-datatable): migra el `<table>` hand-rolled a
 * `<DataTable>` (mismo patron que `facturas-empresa-tab.tsx`, WU2) —
 * toolbar/paginacion internos, sticky header, card mobile (`< lg`), y
 * Desde/Hasta compartidos via `DateRangeField`. El buscador pasa de
 * server-side (SQL `busqueda`) a client-side sobre el rango ya cargado
 * (`globalFilterFn={notaCreditoCoincideBusqueda}`) — el hook deja de
 * recibir `busqueda`, Desde/Hasta se mantienen server-side sin cambios.
 * Modo `scopedToCliente` (cliente-detalle.tsx) preserva su comportamiento:
 * oculta la columna Cliente y sigue filtrando client-side, ahora sobre el
 * MISMO buscador unico del `DataTable` en vez de un input separado.
 */

interface FiltrosNotasCreditoState {
  fechaDesde: string
  fechaHasta: string
}

function filtrosIniciales(): FiltrosNotasCreditoState {
  return rangoMesActual()
}

interface NotasCreditoTabProps {
  /**
   * Filtro por cliente (cliente-detalle-pantalla, PR1). Cuando esta
   * presente, la pestaña queda ESCOPEADA a ese cliente: se oculta la
   * columna "Cliente" (redundante — ya hay un solo cliente en juego) y se
   * pasa `clienteId` al hook. Cuando se omite, el comportamiento es
   * empresa-wide (uso en `notas-credito-page.tsx`).
   */
  clienteId?: string
}

export interface NotasCreditoTableProps {
  notas: NotaCreditoRow[]
  isLoading: boolean
  /** Oculta la columna/card "Cliente" cuando la pestaña esta escopeada a un cliente conocido (`scopedToCliente`). Default `true`. */
  mostrarCliente?: boolean
  toolbarSlot?: ReactNode
  containerClassName?: string
}

/** Presentacional: recibe data via props, sin conocer el hook ni el estado de filtros. */
export function NotasCreditoTable({
  notas,
  isLoading,
  mostrarCliente = true,
  toolbarSlot,
  containerClassName,
}: NotasCreditoTableProps) {
  const columns: ColumnDef<NotaCreditoRow>[] = [
    {
      accessorKey: 'fecha',
      header: 'Fecha',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(row.original.fecha)}</span>
      ),
    },
    {
      accessorKey: 'nro_ncr',
      header: 'Nro NCR',
      cell: ({ row }) => <span className="font-mono font-bold text-xs">{row.original.nro_ncr}</span>,
    },
    {
      accessorKey: 'nro_factura',
      header: 'Factura',
      cell: ({ row }) => <span className="font-mono text-xs">#{row.original.nro_factura}</span>,
    },
    ...(mostrarCliente
      ? [
          {
            id: 'cliente',
            header: 'Cliente',
            cell: ({ row }: { row: { original: NotaCreditoRow } }) => (
              <div>
                <p className="text-sm font-medium">{row.original.cliente_nombre}</p>
                <p className="text-xs text-muted-foreground">{row.original.cliente_identificacion}</p>
              </div>
            ),
          } satisfies ColumnDef<NotaCreditoRow>,
        ]
      : []),
    {
      accessorKey: 'total_usd',
      header: 'Monto USD',
      cell: ({ row }) => <span className="font-bold">{formatUsd(row.original.total_usd)}</span>,
    },
    {
      accessorKey: 'total_bs',
      header: 'Monto Bs',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatBs(row.original.total_bs)}</span>
      ),
    },
    {
      accessorKey: 'motivo',
      header: 'Motivo',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
          {row.original.motivo}
        </span>
      ),
    },
  ]

  function renderMobileCard(n: NotaCreditoRow) {
    return (
      <Card className="gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono font-bold text-xs">{n.nro_ncr}</p>
            <p className="font-mono text-xs text-muted-foreground">#{n.nro_factura}</p>
            {mostrarCliente && (
              <>
                <p className="text-sm font-medium truncate">{n.cliente_nombre}</p>
                <p className="text-xs text-muted-foreground truncate">{n.cliente_identificacion}</p>
              </>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sm">{formatUsd(n.total_usd)}</p>
            <p className="text-xs text-muted-foreground">{formatBs(n.total_bs)}</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{formatDateTime(n.fecha)}</span>
      </Card>
    )
  }

  return (
    <DataTable
      columns={columns}
      data={notas}
      isLoading={isLoading}
      emptyMessage="No hay notas de credito para el periodo o filtros seleccionados."
      showToolbar
      showPagination
      toolbarSlot={toolbarSlot}
      searchPlaceholder="Buscar por NCR, cliente o RIF..."
      globalFilterFn={(n, term) => notaCreditoCoincideBusqueda(n, term)}
      renderMobileCard={renderMobileCard}
      containerClassName={containerClassName}
    />
  )
}

/** Contenedor: mantiene el estado de filtros + el hook, delega el render a `NotasCreditoTable`. */
export function NotasCreditoTab({ clienteId }: NotasCreditoTabProps = {}) {
  const [filtros, setFiltros] = useState<FiltrosNotasCreditoState>(filtrosIniciales)
  const scopedToCliente = !!clienteId

  const { notas, isLoading: loadingNotas } = useNotasCredito({
    fechaDesde: filtros.fechaDesde,
    fechaHasta: filtros.fechaHasta,
    clienteId,
  })

  return (
    <div className="h-full flex flex-col min-h-0">
      <NotasCreditoTable
        notas={notas}
        isLoading={loadingNotas}
        mostrarCliente={!scopedToCliente}
        toolbarSlot={
          <DateRangeField
            value={{ desde: filtros.fechaDesde, hasta: filtros.fechaHasta }}
            onChange={(v) => setFiltros({ fechaDesde: v.desde, fechaHasta: v.hasta })}
          />
        }
        containerClassName={scopedToCliente ? undefined : 'rounded-tl-none'}
      />
    </div>
  )
}
