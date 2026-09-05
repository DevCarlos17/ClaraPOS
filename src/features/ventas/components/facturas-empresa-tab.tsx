import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { rangoMesActual } from '../utils/notas-credito-admin-filters'
import {
  derivarEstadoPago,
  resolverBadgesFactura,
  ESTADO_PAGO_LABEL,
  type EstadoPago,
  type BadgeReverso,
} from '../utils/notas-credito-ui'
import { useFacturasEmpresa } from '../hooks/use-facturas-empresa'
import type { FacturaParaAnular } from '../hooks/use-notas-credito'
import { CrearNcrModal } from './crear-ncr-modal'

/**
 * Slice C3b (notas-credito-ruta-administrativa, Design §Decision 3/File
 * Changes): reemplaza el placeholder de C3a por el listado empresa-wide
 * real sobre `useFacturasEmpresa(filtros)` + filtros (fecha, nro_factura,
 * cliente, RIF) + accion "Aplicar nota de credito" por fila. El wiring del
 * modal real es Slice D (`onAplicarNc` es un callback prop que hoy no tiene
 * consumidor por defecto — stub inofensivo).
 *
 * `showToolbar`/`showPagination` del `DataTable` generico se dejan en
 * `false`: ese componente registra el `useReactTable` solo con
 * `getCoreRowModel` (sin `getFilteredRowModel`/`getPaginationRowModel`), por
 * lo que su buscador/paginacion interna caen al fallback de TanStack Table
 * (siempre el listado completo sin truncar) — cosmeticamente presentes pero
 * no funcionales. Filtrado real se hace aqui, contra el SQL empresa-wide via
 * el hook, no client-side. Ver residual risk en el reporte de esta entrega.
 */
const ESTADO_PAGO_BADGE_CLASS: Record<EstadoPago, string> = {
  CONTADO: 'border-green-200 bg-green-50 text-green-700',
  CREDITO: 'border-blue-200 bg-blue-50 text-blue-700',
  ABONADA: 'border-amber-200 bg-amber-50 text-amber-700',
}

interface FiltrosFacturasEmpresaState {
  fechaDesde: string
  fechaHasta: string
  nroFactura: string
  clienteNombre: string
  clienteIdentificacion: string
}

function filtrosIniciales(): FiltrosFacturasEmpresaState {
  return { ...rangoMesActual(), nroFactura: '', clienteNombre: '', clienteIdentificacion: '' }
}

interface FacturasEmpresaFiltrosProps {
  filtros: FiltrosFacturasEmpresaState
  onChange: (filtros: FiltrosFacturasEmpresaState) => void
}

/** Presentacional: solo renderiza inputs, delega el estado al contenedor (`FacturasEmpresaTab`). */
function FacturasEmpresaFiltros({ filtros, onChange }: FacturasEmpresaFiltrosProps) {
  function set<K extends keyof FiltrosFacturasEmpresaState>(key: K, value: FiltrosFacturasEmpresaState[K]) {
    onChange({ ...filtros, [key]: value })
  }

  return (
    <div className="rounded-2xl bg-card shadow-lg p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="facturas-fecha-desde" className="text-xs text-muted-foreground">
            Desde
          </label>
          <input
            id="facturas-fecha-desde"
            type="date"
            value={filtros.fechaDesde}
            onChange={(e) => set('fechaDesde', e.target.value)}
            className="rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="facturas-fecha-hasta" className="text-xs text-muted-foreground">
            Hasta
          </label>
          <input
            id="facturas-fecha-hasta"
            type="date"
            value={filtros.fechaHasta}
            onChange={(e) => set('fechaHasta', e.target.value)}
            className="rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label htmlFor="facturas-nro" className="text-xs text-muted-foreground">
            Nro factura
          </label>
          <Input
            id="facturas-nro"
            value={filtros.nroFactura}
            placeholder="C01-000123"
            onChange={(e) => set('nroFactura', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label htmlFor="facturas-cliente" className="text-xs text-muted-foreground">
            Cliente
          </label>
          <Input
            id="facturas-cliente"
            value={filtros.clienteNombre}
            placeholder="Nombre del cliente"
            onChange={(e) => set('clienteNombre', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label htmlFor="facturas-rif" className="text-xs text-muted-foreground">
            RIF
          </label>
          <Input
            id="facturas-rif"
            value={filtros.clienteIdentificacion}
            placeholder="V-12345678"
            onChange={(e) => set('clienteIdentificacion', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

export interface FacturasEmpresaTableProps {
  facturas: FacturaParaAnular[]
  isLoading: boolean
  onAplicarNc?: (factura: FacturaParaAnular) => void
}

/** Presentacional: recibe data via props, sin conocer el hook ni el estado de filtros. */
export function FacturasEmpresaTable({ facturas, isLoading, onAplicarNc }: FacturasEmpresaTableProps) {
  const columns: ColumnDef<FacturaParaAnular>[] = [
    {
      accessorKey: 'nro_factura',
      header: 'Factura',
      cell: ({ row }) => (
        <span className="font-mono font-bold text-xs">#{row.original.nro_factura}</span>
      ),
    },
    {
      accessorKey: 'fecha',
      header: 'Fecha',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{formatDate(row.original.fecha)}</span>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.cliente_nombre}</p>
          <p className="text-xs text-muted-foreground">{row.original.cliente_identificacion}</p>
        </div>
      ),
    },
    {
      accessorKey: 'total_usd',
      header: 'Total USD',
      cell: ({ row }) => <span className="font-bold">{formatUsd(row.original.total_usd)}</span>,
    },
    {
      accessorKey: 'total_bs',
      header: 'Total Bs',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatBs(row.original.total_bs)}</span>
      ),
    },
    {
      id: 'estado',
      header: 'Estado',
      cell: ({ row }) => {
        const f = row.original
        // Reuso parcial de la capa pura de `notas-credito-ui-pos` (Design
        // §Testing Strategy: "reuso sin tests nuevos"): a diferencia de
        // `useBadgesReversoSesion`/`calcularBadgesReversoPorVenta` (que
        // acumulan facturado-vs-reversado linea por linea via una query
        // adicional de `ventas_det`/`notas_credito_det`), aqui se deriva el
        // badge directo de los flags `tiene_reverso_total`/
        // `tiene_reverso_parcial` YA presentes en la fila (Slice A, EXISTS
        // sobre `notas_credito.tipo`) — evita una query extra empresa-wide
        // no exigida por design.md para esta pestana.
        const badgeReverso: BadgeReverso =
          f.tiene_reverso_total === 1 ? 'TOTAL' : f.tiene_reverso_parcial === 1 ? 'PARCIAL' : null
        const badges = resolverBadgesFactura(derivarEstadoPago(f), badgeReverso)
        return (
          <div className="flex flex-wrap items-center gap-1">
            {badges.estadoPago && (
              <Badge variant="outline" className={ESTADO_PAGO_BADGE_CLASS[badges.estadoPago]}>
                {ESTADO_PAGO_LABEL[badges.estadoPago]}
              </Badge>
            )}
            {badges.reverso === 'TOTAL' && (
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                Reverso Total
              </Badge>
            )}
            {badges.reverso === 'PARCIAL' && (
              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                Reverso Parcial
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => {
        const f = row.original
        return (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={f.tiene_reverso_total === 1}
            onClick={() => onAplicarNc?.(f)}
          >
            Aplicar nota de credito
          </Button>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={facturas}
      isLoading={isLoading}
      emptyMessage="No hay facturas para el periodo o filtros seleccionados."
      showToolbar={false}
      showPagination={false}
    />
  )
}

export interface FacturasEmpresaTabProps {
  /** Costura de extensibilidad opcional (tests, futuros consumidores) — se invoca ADEMAS de abrir `CrearNcrModal`, nunca en su lugar. */
  onAplicarNc?: (factura: FacturaParaAnular) => void
}

/**
 * Contenedor: mantiene el estado de filtros + el hook + la factura
 * seleccionada para NC, delega el render a los componentes presentacionales
 * de arriba. Slice D (Design §Decision 2): monta `CrearNcrModal` real —
 * el modal admin delgado que reversa CUALQUIER factura de la empresa sin PIN.
 */
export function FacturasEmpresaTab({ onAplicarNc }: FacturasEmpresaTabProps = {}) {
  const [filtros, setFiltros] = useState<FiltrosFacturasEmpresaState>(filtrosIniciales)
  const { facturas, isLoading } = useFacturasEmpresa(filtros)
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<FacturaParaAnular | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  function handleAplicarNc(f: FacturaParaAnular) {
    onAplicarNc?.(f)
    setFacturaSeleccionada(f)
    setModalOpen(true)
  }

  return (
    <div className="space-y-4">
      <FacturasEmpresaFiltros filtros={filtros} onChange={setFiltros} />
      <FacturasEmpresaTable facturas={facturas} isLoading={isLoading} onAplicarNc={handleAplicarNc} />
      <CrearNcrModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        factura={facturaSeleccionada}
      />
    </div>
  )
}
