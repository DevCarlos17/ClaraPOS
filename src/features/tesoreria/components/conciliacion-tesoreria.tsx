import { useState, useEffect } from 'react'
import {
  Plus,
  ArrowsLeftRight,
  ArrowsClockwise,
  X,
  Clock,
  FilePdf,
  FileXls,
  PaperPlaneTilt,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { formatUsd, formatBs } from '@/lib/currency'
import { todayStr, startOfMonth } from '@/lib/dates'

import { useCurrentUser } from '@/core/hooks/use-current-user'
import {
  useCuentasTesoreria,
  useBancosInactivosTesoreria,
  usePendingCounts,
  type CuentaTesoreria,
} from '../hooks/use-cuentas-tesoreria'
import {
  useMovBancariosFiltrados,
  type MovBancario,
} from '@/features/caja/hooks/use-mov-bancarios'
import {
  useMovCajaFuerteFiltrados,
  type MovCajaFuerte,
} from '../hooks/use-mov-caja-fuerte'
import { useTraspasos, reversarTraspaso, findTraspasoByMovId, validarTraspaso, type TraspasoEnriquecido } from '../hooks/use-traspasos'
import {
  validarMovBancario,
  validarMovCajaFuerte,
} from '../hooks/use-conciliacion-tesoreria'
import { CuentasOverview } from './cuentas-overview'
import { resolverCuentaSeleccionadaViva } from '../utils/resolver-cuenta-seleccionada-viva'
import { MovimientosTable, type MovimientoTesoreria, type MovimientoTableRow } from './movimientos-table'
import { CajaFuerteModal } from './caja-fuerte-modal'
import { MovimientoManualModal } from './movimiento-manual-modal'
import { TraspasoModal } from './traspaso-modal'
import { ReversoModal } from './reverso-modal'
import { EnviarEfectivoACajaModal } from './enviar-efectivo-a-caja-modal'
import type { CajaFuerte } from '../hooks/use-caja-fuerte'
import { db } from '@/core/db/powersync/db'
import {
  exportHistoricoPdf,
  exportHistoricoExcel,
  exportPendientesPdf,
  exportPendientesExcel,
  exportConsolidadoPendientesPdf,
  exportConsolidadoPendientesExcel,
} from '../utils/export-tesoreria'

// ─── Helper: convertir movimiento a fila de tabla ────────────

function toMovRow(
  mov: MovBancario | MovCajaFuerte,
  onValidar?: (id: string) => void,
  onReversar?: (id: string) => void,
): MovimientoTableRow {
  return {
    id: mov.id,
    tipo: mov.tipo,
    origen: mov.origen,
    referencia: mov.referencia,
    descripcion: 'observacion' in mov ? (mov.descripcion ?? mov.observacion) : mov.descripcion,
    monto: mov.monto,
    saldo_nuevo: mov.saldo_nuevo,
    fecha: mov.fecha,
    created_at: mov.created_at,
    validado: mov.validado,
    reversado: mov.reversado,
    onValidar,
    onReversar,
  }
}

// ─── Tabla de traspasos ──────────────────────────────────────

function TraspasoRow({
  traspaso,
  onReversar,
}: {
  traspaso: TraspasoEnriquecido
  onReversar: (t: TraspasoEnriquecido) => void
}) {
  return (
    <tr
      className={cn(
        'hover:bg-muted/30 transition-colors',
        traspaso.reversado === 1 && 'opacity-50'
      )}
    >
      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
        {String(traspaso.fecha).slice(0, 10)}
      </td>
      <td className="py-3 px-4 text-sm">
        <p className="font-medium">{traspaso.nombre_origen}</p>
        <p className="text-xs text-muted-foreground">{traspaso.moneda_origen_codigo}</p>
      </td>
      <td className="py-3 px-4 text-sm">
        <p className="font-medium">{traspaso.nombre_destino}</p>
        <p className="text-xs text-muted-foreground">{traspaso.moneda_destino_codigo}</p>
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-sm font-medium">
        {traspaso.moneda_origen_codigo} {formatUsd(parseFloat(traspaso.monto_origen))}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-sm">
        {traspaso.moneda_destino_codigo} {formatUsd(parseFloat(traspaso.monto_destino))}
      </td>
      {traspaso.tasa_cambio ? (
        <td className="py-3 px-4 text-right text-xs text-muted-foreground">
          {parseFloat(traspaso.tasa_cambio).toFixed(4)}
        </td>
      ) : (
        <td className="py-3 px-4" />
      )}
      <td className="py-3 px-4 text-center">
        {traspaso.reversado === 1 ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <X size={12} />
            Reversado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <Clock size={12} weight="fill" />
            Activo
          </span>
        )}
      </td>
      <td className="py-3 px-4 text-right">
        {traspaso.reversado !== 1 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
            onClick={() => onReversar(traspaso)}
          >
            Reversar
          </Button>
        )}
      </td>
    </tr>
  )
}

// ─── Componente principal ────────────────────────────────────

export function ConciliacionTesoreria() {
  const { user } = useCurrentUser()

  const [empresaNombre, setEmpresaNombre] = useState('ClaraPOS')

  useEffect(() => {
    if (!user?.empresa_id) return
    db.execute('SELECT nombre FROM empresas WHERE id = ? LIMIT 1', [user.empresa_id])
      .then((res) => {
        const nombre = (res.rows?.item(0) as { nombre?: string } | undefined)?.nombre
        if (nombre) setEmpresaNombre(nombre)
      })
      .catch(() => {})
  }, [user?.empresa_id])

  // Seleccion de cuenta
  const [selectedCuenta, setSelectedCuenta] = useState<CuentaTesoreria | null>(null)

  // Tabs
  const [activeTab, setActiveTab] = useState<'pendiente' | 'historico' | 'traspasos'>('pendiente')

  // Filtros de historico (inputs — no aplicados hasta "Consultar")
  const DESDE_DEFAULT = startOfMonth()
  const HASTA_DEFAULT = todayStr()

  const [filterDesde,  setFilterDesde]  = useState(DESDE_DEFAULT)
  const [filterHasta,  setFilterHasta]  = useState(HASTA_DEFAULT)
  const [filterTipo, setFilterTipo] = useState<'INGRESO' | 'EGRESO' | ''>('')
  const [filterSearch, setFilterSearch] = useState('')

  // Filtros aplicados (se actualizan al hacer clic en "Consultar")
  const [appliedDesde, setAppliedDesde] = useState(DESDE_DEFAULT)
  const [appliedHasta, setAppliedHasta] = useState(HASTA_DEFAULT)
  const [appliedTipo, setAppliedTipo] = useState<'INGRESO' | 'EGRESO' | ''>('')
  const [appliedSearch, setAppliedSearch] = useState('')

  // Paginacion historico
  const [histPage, setHistPage] = useState(1)

  // Modales
  const [showCajaFuerteModal, setShowCajaFuerteModal] = useState(false)
  const [editandoCaja, setEditandoCaja] = useState<CajaFuerte | null>(null)
  const [showManualModal, setShowManualModal] = useState(false)
  const [showTraspasoModal, setShowTraspasoModal] = useState(false)
  const [showEnviarEfectivoModal, setShowEnviarEfectivoModal] = useState(false)
  const [movParaReversar, setMovParaReversar] = useState<MovimientoTesoreria | null>(null)
  const [traspasoIdParaReversar, setTraspasoIdParaReversar] = useState<string | null>(null)

  // Datos
  const { cuentas, isLoading: loadingCuentas } = useCuentasTesoreria()
  const { cuentas: cuentasInactivas } = useBancosInactivosTesoreria()
  const pendingCounts = usePendingCounts()

  // Estado VIVO de la cuenta seleccionada — NO confiar en el snapshot de
  // `selectedCuenta.is_active`, que queda obsoleto si el banco se inactiva
  // desde otra sesion mientras sigue seleccionado (ver resolver-cuenta-seleccionada-viva.ts)
  const { cuenta: selectedCuentaLive, esActivo: selectedEsActivo } =
    resolverCuentaSeleccionadaViva(selectedCuenta?.id ?? null, cuentas, cuentasInactivas)

  const bancoId = selectedCuenta?.tipo === 'BANCO' ? selectedCuenta.id : ''
  const cajaId = selectedCuenta?.tipo === 'CAJA_FUERTE' ? selectedCuenta.id : ''

  // Pendientes
  const pendienteBancoResult = useMovBancariosFiltrados({ bancoId, estado: 'pendiente' })
  const pendienteCajaResult = useMovCajaFuerteFiltrados({ cajaId, estado: 'pendiente' })

  // Historico
  const historicoBancoResult = useMovBancariosFiltrados({
    bancoId,
    estado: 'historico',
    desde: appliedDesde,
    hasta: appliedHasta,
    tipo: appliedTipo || undefined,
    search: appliedSearch || undefined,
    page: histPage,
  })
  const historicoCajaResult = useMovCajaFuerteFiltrados({
    cajaId,
    estado: 'historico',
    desde: appliedDesde,
    hasta: appliedHasta,
    tipo: appliedTipo || undefined,
    search: appliedSearch || undefined,
    page: histPage,
  })

  // Traspasos (sin filtro de fecha — muestra todos hasta 200)
  const { traspasos, isLoading: loadingTraspasos } = useTraspasos()

  // Resultados activos segun tipo de cuenta
  const pendienteResult =
    selectedCuenta?.tipo === 'BANCO' ? pendienteBancoResult : pendienteCajaResult
  const historicoResult =
    selectedCuenta?.tipo === 'BANCO' ? historicoBancoResult : historicoCajaResult

  // ─── Handlers ────────────────────────────────────────────────

  function handleSelectCuenta(cuenta: CuentaTesoreria) {
    setSelectedCuenta(cuenta)
    setHistPage(1)
  }

  function handleDeselectCuenta() {
    setSelectedCuenta(null)
  }

  function handleAbrirTraspaso() {
    // Defensa adicional: no abrir si el banco se inactivo justo antes del click
    // (el `disabled` del boton ya cubre el caso normal — ver selectedEsActivo)
    if (!selectedCuenta || !selectedEsActivo) return
    setShowTraspasoModal(true)
  }

  function handleAbrirMovimientoManual() {
    if (!selectedCuenta || !selectedEsActivo) return
    setShowManualModal(true)
  }

  function handleConsultarHistorico() {
    setAppliedDesde(filterDesde)
    setAppliedHasta(filterHasta)
    setAppliedTipo(filterTipo)
    setAppliedSearch(filterSearch)
    setHistPage(1)
  }

  async function handleValidarMov(id: string) {
    if (!user?.id || !user?.empresa_id) return
    try {
      // Check if this movement is part of a traspaso
      const mov =
        selectedCuenta?.tipo === 'BANCO'
          ? pendienteBancoResult.data.find((m) => m.id === id)
          : pendienteCajaResult.data.find((m) => m.id === id)

      if (mov?.origen === 'TRASPASO') {
        // Auto-conciliate both sides
        const traspasoId = await findTraspasoByMovId(id, user.empresa_id)
        if (traspasoId) {
          await validarTraspaso(traspasoId, user.id, user.empresa_id)
          toast.success('Traspaso conciliado en ambas cuentas')
          return
        }
      }

      // Normal single-movement validation
      if (selectedCuenta?.tipo === 'BANCO') {
        await validarMovBancario(id, user.id)
      } else {
        await validarMovCajaFuerte(id, user.id)
      }
      toast.success('Movimiento conciliado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al conciliar')
    }
  }

  async function handleReversarMov(id: string) {
    if (!selectedCuenta || !user?.empresa_id) return

    if (selectedCuenta.tipo === 'BANCO') {
      const mov = pendienteBancoResult.data.find((m) => m.id === id)
      if (!mov) return
      setMovParaReversar({ ...mov, _source: 'BANCO' as const })
      if (mov.origen === 'TRASPASO') {
        const traspasoId = await findTraspasoByMovId(id, user.empresa_id)
        setTraspasoIdParaReversar(traspasoId)
      } else {
        setTraspasoIdParaReversar(null)
      }
    } else {
      const mov = pendienteCajaResult.data.find((m) => m.id === id)
      if (!mov) return
      setMovParaReversar({ ...mov, _source: 'CAJA_FUERTE' as const })
      if (mov.origen === 'TRASPASO') {
        const traspasoId = await findTraspasoByMovId(id, user.empresa_id)
        setTraspasoIdParaReversar(traspasoId)
      } else {
        setTraspasoIdParaReversar(null)
      }
    }
  }

  async function handleReversarTraspaso(traspaso: TraspasoEnriquecido) {
    if (!user?.id || !user?.empresa_id) return
    const motivo = window.prompt('Ingrese el motivo del reverso (min 3 caracteres):')
    if (!motivo || motivo.trim().length < 3) {
      toast.error('El motivo debe tener al menos 3 caracteres')
      return
    }
    try {
      await reversarTraspaso({
        traspasoId: traspaso.id,
        motivo: motivo.trim(),
        userId: user.id,
        empresaId: user.empresa_id,
      })
      toast.success('Traspaso reversado correctamente')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reversar traspaso')
    }
  }

  // ─── Filas de tabla ──────────────────────────────────────────

  const pendienteMovRows: MovimientoTableRow[] = pendienteResult.data.map((mov) =>
    toMovRow(mov, handleValidarMov, handleReversarMov)
  )

  const historicoMovRows: MovimientoTableRow[] = historicoResult.data.map((mov) =>
    toMovRow(mov)
  )

  // ─── Helpers de exportación ──────────────────────────────────

  const getLast12Months = (): Array<{ label: string; desde: string; hasta: string }> => {
    const months: Array<{ label: string; desde: string; hasta: string }> = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const year = d.getFullYear()
      const month = d.getMonth()
      const desde = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const hasta = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const label = d.toLocaleDateString('es-VE', { month: 'short', year: '2-digit' })
      months.push({ label, desde, hasta })
    }
    return months
  }

  function handleExportHistoricoPdf() {
    if (!selectedCuenta) return
    exportHistoricoPdf({
      movimientos: historicoMovRows,
      cuenta: selectedCuenta,
      desde: appliedDesde || '—',
      hasta: appliedHasta || '—',
      empresaNombre,
    })
  }

  function handleExportHistoricoExcel() {
    if (!selectedCuenta) return
    exportHistoricoExcel({
      movimientos: historicoMovRows,
      cuenta: selectedCuenta,
      desde: appliedDesde || '—',
      hasta: appliedHasta || '—',
      empresaNombre,
    })
  }

  function handleExportPendientesPdf() {
    if (!selectedCuenta) return
    exportPendientesPdf({
      movimientos: pendienteMovRows,
      cuenta: selectedCuenta,
      empresaNombre,
    })
  }

  function handleExportPendientesExcel() {
    if (!selectedCuenta) return
    exportPendientesExcel({
      movimientos: pendienteMovRows,
      cuenta: selectedCuenta,
      empresaNombre,
    })
  }

  async function handleExportConsolidadoPdf() {
    if (!user?.empresa_id) return
    await exportConsolidadoPendientesPdf({ empresaId: user.empresa_id, empresaNombre, cuentas })
  }

  async function handleExportConsolidadoExcel() {
    if (!user?.empresa_id) return
    await exportConsolidadoPendientesExcel({ empresaId: user.empresa_id, empresaNombre, cuentas })
  }

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center gap-2 justify-end">
        {/* Report buttons — left side, context-aware */}
        {!selectedCuenta ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportConsolidadoPdf}
              disabled={cuentas.length === 0}
            >
              <FilePdf size={14} className="mr-1.5" />
              Consolidado PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportConsolidadoExcel}
              disabled={cuentas.length === 0}
            >
              <FileXls size={14} className="mr-1.5" />
              Consolidado Excel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportPendientesPdf}
              disabled={pendienteMovRows.length === 0}
            >
              <FilePdf size={14} className="mr-1.5" />
              Pendientes PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportPendientesExcel}
              disabled={pendienteMovRows.length === 0}
            >
              <FileXls size={14} className="mr-1.5" />
              Pendientes Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportHistoricoPdf}
              disabled={historicoMovRows.length === 0}
            >
              <FilePdf size={14} className="mr-1.5" />
              Histórico PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportHistoricoExcel}
              disabled={historicoMovRows.length === 0}
            >
              <FileXls size={14} className="mr-1.5" />
              Histórico Excel
            </Button>
          </>
        )}

        {/* Separator */}
        <div className="w-px h-6 bg-border mx-1 hidden sm:block" />

        {/* Enviar efectivo a caja */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowEnviarEfectivoModal(true)}
        >
          <PaperPlaneTilt size={16} className="mr-1.5" />
          Enviar efectivo a caja
        </Button>

        {/* Traspaso + Manual — deshabilitados si el banco seleccionado está inactivo (estado VIVO, no snapshot) */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleAbrirTraspaso}
          disabled={!selectedCuenta || !selectedEsActivo}
          title={
            selectedCuenta && !selectedEsActivo
              ? 'No disponible para bancos inactivos'
              : undefined
          }
        >
          <ArrowsLeftRight size={16} className="mr-1.5" />
          Traspaso
        </Button>
        <Button
          size="sm"
          onClick={handleAbrirMovimientoManual}
          disabled={!selectedCuenta || !selectedEsActivo}
          title={
            selectedCuenta && !selectedEsActivo
              ? 'No disponible para bancos inactivos'
              : undefined
          }
        >
          <Plus size={16} className="mr-1.5" />
          Movimiento manual
        </Button>
      </div>

      {/* Cuentas overview */}
      {loadingCuentas ? (
        <div className="text-sm text-muted-foreground py-4">Cargando cuentas...</div>
      ) : (
        <CuentasOverview
          cuentas={cuentas}
          cuentasInactivas={cuentasInactivas}
          selectedId={selectedCuenta?.id ?? null}
          onSelect={handleSelectCuenta}
          onDeselect={handleDeselectCuenta}
          pendingCounts={pendingCounts}
        />
      )}

      {/* Contenido principal */}
      {!selectedCuenta ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
          <ArrowsLeftRight size={32} className="opacity-30" />
          <p>Seleccione una cuenta para ver sus movimientos</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Encabezado de cuenta */}
          <div>
            <h3 className="font-semibold text-base">{selectedCuenta.nombre}</h3>
            <p className="text-xs text-muted-foreground">
              {selectedCuenta.moneda_codigo}
              {' · '}
              {selectedCuenta.tipo === 'BANCO' ? 'Cuenta bancaria' : 'Caja fuerte'}
            </p>
          </div>

          {/* Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          >
            <TabsList>
              <TabsTrigger value="pendiente">Pendientes</TabsTrigger>
              <TabsTrigger value="historico">Historico</TabsTrigger>
              <TabsTrigger value="traspasos">Traspasos</TabsTrigger>
            </TabsList>

            {/* Tab: Pendientes */}
            <TabsContent value="pendiente" className="mt-4">
              {/* Resumen de pendientes */}
              {pendienteMovRows.length > 0 && (() => {
                const totalPorConciliar = pendienteResult.data.reduce((acc, mov) => {
                  const m = parseFloat(mov.monto ?? '0')
                  return mov.tipo === 'INGRESO' ? acc + m : acc - m
                }, 0)
                const moneda = selectedCuenta?.moneda_codigo ?? 'USD'
                const formatted = moneda === 'USD'
                  ? formatUsd(Math.abs(totalPorConciliar))
                  : formatBs(Math.abs(totalPorConciliar))
                return (
                  <div className="flex items-center justify-between rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 px-4 py-2 text-sm mb-3">
                    <span className="text-muted-foreground">
                      {pendienteResult.data.length} registro{pendienteResult.data.length !== 1 ? 's' : ''} pendiente{pendienteResult.data.length !== 1 ? 's' : ''} de conciliación
                    </span>
                    <span className="font-semibold">
                      Por conciliar: {formatted}
                    </span>
                  </div>
                )
              })()}
              <MovimientosTable
                movimientos={pendienteMovRows}
                modo="pendiente"
                loading={pendienteResult.isLoading}
                monedaSimbolo={selectedCuenta.moneda_simbolo}
              />
            </TabsContent>

            {/* Tab: Historico */}
            <TabsContent value="historico" className="mt-4">
              {/* Filtros — mes + rango + tipo + buscar en una sola fila */}
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div className="space-y-1">
                  <Label className="text-xs">Mes</Label>
                  <select
                    value={(() => {
                      const m = getLast12Months().find(
                        (m) => m.desde === appliedDesde && m.hasta === appliedHasta
                      )
                      return m ? `${m.desde}|${m.hasta}` : ''
                    })()}
                    onChange={(e) => {
                      if (!e.target.value) return
                      const [desde, hasta] = e.target.value.split('|')
                      setFilterDesde(desde)
                      setFilterHasta(hasta)
                      setAppliedDesde(desde)
                      setAppliedHasta(hasta)
                      setAppliedTipo('')
                      setAppliedSearch('')
                      setHistPage(1)
                    }}
                    className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">-- Mes --</option>
                    {getLast12Months().map((m) => (
                      <option key={m.desde} value={`${m.desde}|${m.hasta}`}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Desde</Label>
                  <Input
                    type="date"
                    value={filterDesde}
                    onChange={(e) => setFilterDesde(e.target.value)}
                    className="h-8 text-sm w-36"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasta</Label>
                  <Input
                    type="date"
                    value={filterHasta}
                    onChange={(e) => setFilterHasta(e.target.value)}
                    className="h-8 text-sm w-36"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <select
                    value={filterTipo}
                    onChange={(e) =>
                      setFilterTipo(e.target.value as '' | 'INGRESO' | 'EGRESO')
                    }
                    className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Todos</option>
                    <option value="INGRESO">Ingreso</option>
                    <option value="EGRESO">Egreso</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Buscar</Label>
                  <Input
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    placeholder="Referencia o descripcion"
                    className="h-8 text-sm w-44"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={handleConsultarHistorico}>
                  <ArrowsClockwise size={14} className="mr-1.5" />
                  Consultar
                </Button>
              </div>

              <MovimientosTable
                movimientos={historicoMovRows}
                modo="historico"
                loading={historicoResult.isLoading}
                monedaSimbolo={selectedCuenta.moneda_simbolo}
                pagination={{
                  page: histPage,
                  totalPages: historicoResult.totalPages,
                  total: historicoResult.total,
                  onPageChange: setHistPage,
                }}
              />
            </TabsContent>

            {/* Tab: Traspasos */}
            <TabsContent value="traspasos" className="mt-4">
              {loadingTraspasos ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  Cargando traspasos...
                </div>
              ) : traspasos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                  <ArrowsLeftRight size={32} className="opacity-30" />
                  <p>No hay traspasos registrados</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                            Fecha
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                            Origen
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                            Destino
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                            Monto origen
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                            Monto destino
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                            Tasa
                          </th>
                          <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                            Estado
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {traspasos.map((t) => (
                          <TraspasoRow
                            key={t.id}
                            traspaso={t}
                            onReversar={handleReversarTraspaso}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Modales */}
      <CajaFuerteModal
        isOpen={showCajaFuerteModal}
        onClose={() => {
          setShowCajaFuerteModal(false)
          setEditandoCaja(null)
        }}
        editando={editandoCaja}
      />

      {selectedCuentaLive && (
        <MovimientoManualModal
          isOpen={showManualModal}
          onClose={() => setShowManualModal(false)}
          cuenta={selectedCuentaLive}
        />
      )}

      <TraspasoModal
        isOpen={showTraspasoModal}
        onClose={() => setShowTraspasoModal(false)}
        cuentas={cuentas}
        cuentaOrigen={selectedCuentaLive ?? undefined}
      />

      <ReversoModal
        isOpen={!!movParaReversar}
        onClose={() => {
          setMovParaReversar(null)
          setTraspasoIdParaReversar(null)
        }}
        movimiento={movParaReversar}
        monedaSimbolo={selectedCuenta?.moneda_simbolo ?? '$'}
        traspasoId={traspasoIdParaReversar ?? undefined}
      />

      <EnviarEfectivoACajaModal
        open={showEnviarEfectivoModal}
        onClose={() => setShowEnviarEfectivoModal(false)}
        cajasFuerteActivas={cuentas.filter((c) => c.tipo === 'CAJA_FUERTE' && c.detalle != null).map((c) => c.detalle as CajaFuerte)}
        empresaId={user?.empresa_id ?? ''}
        userId={user?.id ?? ''}
      />
    </div>
  )
}
