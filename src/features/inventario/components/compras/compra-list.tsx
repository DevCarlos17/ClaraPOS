import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { ArrowCounterClockwise, CaretRight } from '@phosphor-icons/react'
import { DataTable } from '@/components/data-table/data-table'
import { DateRangeField } from '@/components/data-table/date-range-field'
import { Button } from '@/components/ui/button'
import { useComprasPorFecha, type CompraConProveedor } from '@/features/inventario/hooks/use-compras'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { todayStr, startOfMonth } from '@/lib/dates'
import { CompraForm } from './compra-form'
import { FacturaProveedorModal } from '@/features/compras/components/factura-proveedor-modal'
import { CompraReportes } from './compra-reportes'
import { CompraWizardSheet } from './wizard/compra-wizard-sheet'
import { useCompraWizardStore } from '@/stores/compra-wizard-store'
import { useMobile } from '@/hooks/use-mobile'

const MAX_RANGE_DAYS = 62 // ~2 meses

// ─── Badges compartidos (columna desktop + card mobile) ─────────────────

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
        tipo === 'CREDITO'
          ? 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-950 dark:text-orange-300'
          : 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-950 dark:text-green-300'
      }`}
    >
      {tipo}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'REVERSADA') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-950 dark:text-purple-300">
        <ArrowCounterClockwise className="h-2.5 w-2.5" />
        REVERSADA
      </span>
    )
  }
  if (status === 'ANULADA') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950 dark:text-red-300">
        ANULADA
      </span>
    )
  }
  if (status === 'PROCESADA') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950 dark:text-blue-300">
        PROCESADA
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-muted text-muted-foreground ring-muted-foreground/20">
      {status}
    </span>
  )
}

function getDaysDiff(from: string, to: string): number {
  const d1 = new Date(from)
  const d2 = new Date(to)
  return Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

function getDefaultDates() {
  return {
    desde: startOfMonth(),
    hasta: todayStr(),
  }
}

/** Card compacta mobile (< lg, DataTable renderMobileCard): mismo contenido que la fila desktop; tap abre el mismo modal de detalle via onRowClick. */
function renderCompraMobileCard(compra: CompraConProveedor) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono font-semibold text-sm text-foreground truncate">
            {compra.nro_factura}
          </span>
          <StatusBadge status={compra.status} />
          <TipoBadge tipo={compra.tipo} />
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {compra.proveedor_nombre} · {formatDate(compra.fecha_factura)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums text-foreground">
            {formatUsd(compra.total_usd)}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {formatBs(compra.total_bs)}
          </p>
        </div>
        <CaretRight className="h-4 w-4 text-muted-foreground/60" />
      </div>
    </div>
  )
}

export function CompraList() {
  const defaults = getDefaultDates()
  const [showForm, setShowForm] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const isMobile = useMobile(1024)
  const openCompraWizardSheet = useCompraWizardStore((s) => s.openSheet)

  // Date range filter: estado "staged" (Desde/Hasta editados por el usuario)
  // separado de consultaActiva (lo que dispara la query) — Consultar copia
  // uno en el otro. DateRangeField se enlaza al staged, nunca a consultaActiva.
  const [fechaDesde, setFechaDesde] = useState(defaults.desde)
  const [fechaHasta, setFechaHasta] = useState(defaults.hasta)
  const [consultaActiva, setConsultaActiva] = useState({ desde: '', hasta: '' })

  const { compras, isLoading } = useComprasPorFecha(consultaActiva.desde, consultaActiva.hasta)

  const rangeError = getRangeError()

  function getRangeError(): string | null {
    if (!fechaDesde || !fechaHasta) return null
    if (fechaDesde > fechaHasta) return 'La fecha inicio no puede ser mayor a la fecha fin'
    const diff = getDaysDiff(fechaDesde, fechaHasta)
    if (diff > MAX_RANGE_DAYS) return `El rango maximo es de ${MAX_RANGE_DAYS} dias (~2 meses)`
    return null
  }

  function handleConsultar() {
    if (rangeError || !fechaDesde || !fechaHasta) return
    setConsultaActiva({ desde: fechaDesde, hasta: fechaHasta })
  }

  const hasConsulta = Boolean(consultaActiva.desde && consultaActiva.hasta)

  if (showForm && !isMobile) {
    return <CompraForm onClose={() => setShowForm(false)} />
  }

  const columns: ColumnDef<CompraConProveedor>[] = [
    {
      accessorKey: 'nro_factura',
      header: 'Nro Factura',
      cell: ({ row }) => (
        <span className="font-mono text-sm text-foreground">{row.original.nro_factura}</span>
      ),
    },
    {
      accessorKey: 'fecha_factura',
      header: 'Fecha',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.fecha_factura)}</span>
      ),
    },
    {
      accessorKey: 'proveedor_nombre',
      header: 'Proveedor',
      cell: ({ row }) => <span className="text-sm text-foreground">{row.original.proveedor_nombre}</span>,
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }) => <TipoBadge tipo={row.original.tipo} />,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'total_exento_usd',
      header: () => <div className="text-right">Exento USD</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm text-muted-foreground">
          {formatUsd(row.original.total_exento_usd)}
        </div>
      ),
    },
    {
      accessorKey: 'total_base_usd',
      header: () => <div className="text-right">Base USD</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm text-muted-foreground">
          {formatUsd(row.original.total_base_usd)}
        </div>
      ),
    },
    {
      accessorKey: 'total_iva_usd',
      header: () => <div className="text-right">IVA USD</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm text-muted-foreground">
          {formatUsd(row.original.total_iva_usd)}
        </div>
      ),
    },
    {
      accessorKey: 'total_usd',
      header: () => <div className="text-right">Total USD</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm font-medium text-foreground">
          {formatUsd(row.original.total_usd)}
        </div>
      ),
    },
    {
      accessorKey: 'total_bs',
      header: () => <div className="text-right">Total Bs</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm text-muted-foreground">
          {formatBs(row.original.total_bs)}
        </div>
      ),
    },
    {
      accessorKey: 'tasa',
      header: () => <div className="text-right">Tasa</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm text-muted-foreground">
          {parseFloat(row.original.tasa).toFixed(4)}
        </div>
      ),
    },
    {
      accessorKey: 'creado_por_nombre',
      header: 'Registrado por',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.creado_por_nombre ?? '-'}</span>
      ),
    },
  ]

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-2">
      {hasConsulta && !isLoading && (
        <p className="px-1 text-sm text-muted-foreground">
          {compras.length}{' '}
          {compras.length === 1 ? 'factura encontrada' : 'facturas encontradas'}
        </p>
      )}
      <DataTable
        columns={columns}
        data={compras}
        isLoading={isLoading}
        onRowClick={(compra) => setDetalleId(compra.id)}
        emptyMessage={
          !hasConsulta
            ? 'Seleccione un rango de fechas y presione "Consultar" para ver las facturas de compra.'
            : 'Sin compras en el periodo. No se encontraron facturas de compra entre las fechas seleccionadas.'
        }
        renderMobileCard={renderCompraMobileCard}
        toolbarSlot={
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeField
              value={{ desde: fechaDesde, hasta: fechaHasta }}
              onChange={(v) => {
                setFechaDesde(v.desde)
                setFechaHasta(v.hasta)
              }}
            />
            <Button
              type="button"
              variant="secondary"
              className="h-10 rounded-xl gap-2.5"
              onClick={handleConsultar}
              disabled={!!rangeError || !fechaDesde || !fechaHasta}
            >
              Consultar
            </Button>
            {hasConsulta && (
              <CompraReportes
                compras={compras}
                fechaDesde={consultaActiva.desde}
                fechaHasta={consultaActiva.hasta}
              />
            )}
            <Button
              type="button"
              className="h-11 rounded-xl text-base"
              onClick={() => (isMobile ? openCompraWizardSheet() : setShowForm(true))}
            >
              Registrar compra
            </Button>
          </div>
        }
      />
      {rangeError && <p className="text-destructive text-xs px-1">{rangeError}</p>}

      <FacturaProveedorModal
        tipo="COMPRA"
        id={detalleId ?? ''}
        isOpen={!!detalleId}
        onClose={() => setDetalleId(null)}
      />
      {isMobile && <CompraWizardSheet />}
    </div>
  )
}
