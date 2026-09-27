import { useState, type ReactNode } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { CaretRight } from '@phosphor-icons/react'
import { DataTable } from '@/components/data-table/data-table'
import { DateRangeField } from '@/components/data-table/date-range-field'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import { rangoMesActual } from '../utils/notas-credito-admin-filters'
import {
  derivarEstadoPago,
  resolverBadgesFactura,
  filaFacturaAtenuada,
  facturaEmpresaCoincideBusqueda,
  ESTADO_PAGO_LABEL,
  type EstadoPago,
  type BadgeReverso,
} from '../utils/notas-credito-ui'
import { useFacturasEmpresa } from '../hooks/use-facturas-empresa'
import type { FacturaParaAnular } from '../hooks/use-notas-credito'
import { CrearNcrModal } from './crear-ncr-modal'
import { ConsultaFacturaModal } from './consulta-factura-modal'

/**
 * Slice C3b (notas-credito-ruta-administrativa, Design §Decision 3/File
 * Changes): reemplaza el placeholder de C3a por el listado empresa-wide
 * real sobre `useFacturasEmpresa(filtros)` + accion "Aplicar nota de
 * credito" por fila. El wiring del modal real es Slice D (`onAplicarNc` es
 * un callback prop que hoy no tiene consumidor por defecto — stub
 * inofensivo).
 *
 * WU2 (datatable-referencia-unificado): el buscador se movio de server-side
 * (SQL, campo `busqueda` del hook) a client-side sobre el rango de fecha ya
 * cargado — el input UNICO ahora es el propio buscador del `DataTable`
 * (`toolbarSlot`/`globalFilterFn={facturaEmpresaCoincideBusqueda}`), nunca
 * un segundo input custom. `FacturasEmpresaFiltros` (el card separado con
 * Desde/Hasta/Buscar) se retira; Desde/Hasta pasan a vivir DENTRO del
 * toolbar via `toolbarSlot` (siguen disparando el refetch server-side ya
 * existente, sin tocar `buildFacturasEmpresaFiltro`/`useFacturasEmpresa`).
 */
const ESTADO_PAGO_BADGE_CLASS: Record<EstadoPago, string> = {
  CONTADO: 'border-green-200 bg-green-50 text-green-700',
  CREDITO: 'border-blue-200 bg-blue-50 text-blue-700',
  ABONADA: 'border-amber-200 bg-amber-50 text-amber-700',
}

interface FiltrosFacturasEmpresaState {
  fechaDesde: string
  fechaHasta: string
}

function filtrosIniciales(): FiltrosFacturasEmpresaState {
  return rangoMesActual()
}

/** Presentacional compartido: badges de estado de pago + reverso (columna desktop "estado" y card mobile, WU2). */
function FacturaEstadoBadges({ f }: { f: FacturaParaAnular }) {
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
}

/**
 * Presentacional compartido: boton "Aplicar nota de credito" con el MISMO
 * guard `stopPropagation` en la columna desktop "acciones" y en la card
 * mobile (WU2) — sin esta guarda el tap/click tambien dispararia el
 * `onRowClick` de la fila/card y abriria `ConsultaFacturaModal` por encima
 * de `CrearNcrModal` (ver `facturas-emitidas-consulta-rowclick`).
 */
function AplicarNcButton({
  f,
  onAplicarNc,
  className,
}: {
  f: FacturaParaAnular
  onAplicarNc?: (f: FacturaParaAnular) => void
  className?: string
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={className}
      disabled={f.tiene_reverso_total === 1}
      onClick={(e) => {
        e.stopPropagation()
        onAplicarNc?.(f)
      }}
    >
      Aplicar nota de credito
    </Button>
  )
}

export interface FacturasEmpresaTableProps {
  facturas: FacturaParaAnular[]
  isLoading: boolean
  onAplicarNc?: (factura: FacturaParaAnular) => void
  /**
   * Controla si se muestra la columna/boton "Aplicar nota de credito"
   * (cliente-detalle-pantalla, PR3 — aditivo). Default `true`: sin cambios
   * de comportamiento para los llamadores existentes (`FacturasEmpresaTab`).
   * `false` la oculta — usado por la pantalla de detalle de cliente, donde
   * esa accion no aplica.
   */
  mostrarAcciones?: boolean
  /**
   * Controla si se muestra la columna "Cliente" (cliente-detalle-tablas-
   * pestanas, aditivo). Default `true`: sin cambios de comportamiento para
   * los llamadores existentes (empresa-wide, `FacturasEmpresaTab`). `false`
   * la oculta — usado por la pantalla de detalle de cliente, donde el
   * cliente ya es conocido por contexto (un solo cliente en juego).
   */
  mostrarCliente?: boolean
  /**
   * Reimpresion de factura fiscal (PR3a, aditivo): click de fila, pasado
   * directo al `onRowClick` ya existente de `DataTable` (sin cambios en
   * `DataTable`). Omitido = sin handler, comportamiento identico a hoy.
   */
  onRowClick?: (f: FacturaParaAnular) => void
  /**
   * WU2 (datatable-referencia-unificado): activa el toolbar/paginacion
   * internos del `DataTable`. Default `false` — preserva byte-a-byte el
   * comportamiento de los 3 llamadores existentes (`cliente-detalle.tsx`,
   * `ventas-consultas-modal.tsx` x2), que NO pasan esta prop. Solo
   * `FacturasEmpresaTab` (pestaña "Facturas emitidas") la activa.
   */
  showToolbar?: boolean
  /** Ver `showToolbar` — mismo default/alcance. */
  showPagination?: boolean
  /** Controles custom (Desde/Hasta) en la fila del buscador del `DataTable`. Pass-through — ver `DataTableProps.toolbarSlot`. */
  toolbarSlot?: ReactNode
  /** Placeholder del buscador propio del `DataTable`. Pass-through. */
  searchPlaceholder?: string
  /** Predicado custom del buscador propio del `DataTable`. Pass-through. */
  globalFilterFn?: (f: FacturaParaAnular, term: string) => boolean
  /**
   * Card mobile OPT-IN (`< lg`). Pass-through al `DataTable` — se pasa
   * SOLO desde `FacturasEmpresaTab` (pestaña "Facturas emitidas"); los otros
   * 3 llamadores no la pasan y siguen mostrando SIEMPRE la tabla desktop.
   */
  renderMobileCard?: (f: FacturaParaAnular) => ReactNode
  /**
   * Clase extra para el contenedor de la tarjeta del `DataTable`.
   * Pass-through — `FacturasEmpresaTab` ya NO la usa (facturas-mobile-
   * bottomsheet, Cambio 3: tabs estilo Kardex, tarjeta con esquinas
   * redondeadas normales en vez de adosada a `SegmentedTabs`).
   */
  containerClassName?: string
}

/** Presentacional: recibe data via props, sin conocer el hook ni el estado de filtros. */
export function FacturasEmpresaTable({
  facturas,
  isLoading,
  onAplicarNc,
  mostrarAcciones,
  mostrarCliente,
  onRowClick,
  showToolbar = false,
  showPagination = false,
  toolbarSlot,
  searchPlaceholder,
  globalFilterFn,
  renderMobileCard,
  containerClassName,
}: FacturasEmpresaTableProps) {
  const columns: ColumnDef<FacturaParaAnular>[] = [
    {
      accessorKey: 'fecha',
      header: 'Fecha',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(row.original.fecha)}</span>
      ),
    },
    {
      accessorKey: 'nro_factura',
      header: 'Factura',
      cell: ({ row }) => (
        <span className="font-mono font-bold text-xs">#{row.original.nro_factura}</span>
      ),
    },
    ...(mostrarCliente !== false
      ? [
          {
            id: 'cliente',
            header: 'Cliente',
            cell: ({ row }: { row: { original: FacturaParaAnular } }) => (
              <div>
                <p className="text-sm font-medium">{row.original.cliente_nombre}</p>
                <p className="text-xs text-muted-foreground">{row.original.cliente_identificacion}</p>
              </div>
            ),
          } satisfies ColumnDef<FacturaParaAnular>,
        ]
      : []),
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
      // Reuso parcial de la capa pura de `notas-credito-ui-pos` (Design
      // §Testing Strategy: "reuso sin tests nuevos"): a diferencia de
      // `useBadgesReversoSesion`/`calcularBadgesReversoPorVenta` (que
      // acumulan facturado-vs-reversado linea por linea via una query
      // adicional de `ventas_det`/`notas_credito_det`), `FacturaEstadoBadges`
      // deriva el badge directo de los flags `tiene_reverso_total`/
      // `tiene_reverso_parcial` YA presentes en la fila (Slice A, EXISTS
      // sobre `notas_credito.tipo`) — evita una query extra empresa-wide no
      // exigida por design.md para esta pestana. Extraida a componente
      // compartido (WU2) para reusarse identica en la card mobile.
      cell: ({ row }) => <FacturaEstadoBadges f={row.original} />,
    },
    ...(mostrarAcciones !== false
      ? [
          {
            id: 'acciones',
            header: '',
            cell: ({ row }: { row: { original: FacturaParaAnular } }) => (
              <AplicarNcButton f={row.original} onAplicarNc={onAplicarNc} />
            ),
          } satisfies ColumnDef<FacturaParaAnular>,
        ]
      : []),
  ]

  return (
    <DataTable
      columns={columns}
      data={facturas}
      isLoading={isLoading}
      onRowClick={onRowClick}
      emptyMessage="No hay facturas para el periodo o filtros seleccionados."
      showToolbar={showToolbar}
      showPagination={showPagination}
      toolbarSlot={toolbarSlot}
      searchPlaceholder={searchPlaceholder}
      globalFilterFn={globalFilterFn}
      renderMobileCard={renderMobileCard}
      containerClassName={containerClassName}
      rowClassName={(f) => (filaFacturaAtenuada(f) ? 'text-muted-foreground/70' : undefined)}
      rowProps={(f): Record<string, string> => (filaFacturaAtenuada(f) ? { 'data-atenuada': 'true' } : {})}
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
  const { facturas, isLoading } = useFacturasEmpresa({
    fechaDesde: filtros.fechaDesde,
    fechaHasta: filtros.fechaHasta,
  })
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<FacturaParaAnular | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  // facturas-emitidas-consulta-rowclick: estado INDEPENDIENTE del de
  // `CrearNcrModal` de arriba — el click de fila abre este modal de solo
  // lectura (detalle fiscal + evolucion), nunca reemplaza al de NC.
  const [facturaConsulta, setFacturaConsulta] = useState<FacturaParaAnular | null>(null)

  function handleAplicarNc(f: FacturaParaAnular) {
    onAplicarNc?.(f)
    setFacturaSeleccionada(f)
    setModalOpen(true)
  }

  /**
   * facturas-mobile-bottomsheet: la card mobile (con `AplicarNcButton`
   * propio) se reemplaza por una FILA compacta y clickeable — el tap abre
   * el `BottomSheet` (via `onRowClick={setFacturaConsulta}`, sin cambios en
   * el wrapper del `DataTable`) con el detalle completo + "Aplicar nota de
   * credito" (ver `ConsultaFacturaModal`, prop `onAplicarNc`). Solo datos
   * identificatorios (nro/cliente/total/fecha/estado) + un chevron ">" que
   * senaliza "tap para detalle" — sin boton propio, para maximizar
   * densidad (mas filas visibles por scroll).
   */
  function renderFacturaMobileRow(f: FacturaParaAnular) {
    return (
      <div
        className={`flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 shadow-sm ${
          filaFacturaAtenuada(f) ? 'text-muted-foreground/70' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-mono font-bold text-xs shrink-0">#{f.nro_factura}</p>
            <FacturaEstadoBadges f={f} />
          </div>
          <p className="text-sm font-medium truncate">{f.cliente_nombre}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-sm">{formatUsd(f.total_usd)}</p>
          <p className="text-[11px] text-muted-foreground">{formatDateTime(f.fecha)}</p>
        </div>
        <CaretRight className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <FacturasEmpresaTable
        facturas={facturas}
        isLoading={isLoading}
        onAplicarNc={handleAplicarNc}
        onRowClick={setFacturaConsulta}
        showToolbar
        showPagination
        toolbarSlot={
          <DateRangeField
            value={{ desde: filtros.fechaDesde, hasta: filtros.fechaHasta }}
            onChange={(v) => setFiltros({ fechaDesde: v.desde, fechaHasta: v.hasta })}
          />
        }
        searchPlaceholder="Buscar por factura, cliente, RIF o estado (contado, crédito, abonada, reverso total/parcial)..."
        globalFilterFn={(f, term) => facturaEmpresaCoincideBusqueda(f, term)}
        renderMobileCard={renderFacturaMobileRow}
        containerClassName="rounded-tl-none"
      />
      <CrearNcrModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        factura={facturaSeleccionada}
      />
      <ConsultaFacturaModal
        venta={facturaConsulta}
        isOpen={!!facturaConsulta}
        onClose={() => setFacturaConsulta(null)}
        onAplicarNc={handleAplicarNc}
      />
    </div>
  )
}
