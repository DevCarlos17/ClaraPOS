import { useState } from 'react'
import {
  Plus,
  ArrowsLeftRight,
  Vault,
  ArrowsClockwise,
  X,
  Clock,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/lib/currency'
import { todayStr, daysAgo } from '@/lib/dates'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCuentasTesoreria, type CuentaTesoreria } from '../hooks/use-cuentas-tesoreria'
import {
  useMovBancariosFiltrados,
  type MovBancario,
} from '@/features/caja/hooks/use-mov-bancarios'
import {
  useMovCajaFuerteFiltrados,
  type MovCajaFuerte,
} from '../hooks/use-mov-caja-fuerte'
import { useTraspasos, reversarTraspaso, type TraspasoEnriquecido } from '../hooks/use-traspasos'
import {
  validarMovBancario,
  validarMovCajaFuerte,
} from '../hooks/use-conciliacion-tesoreria'
import { CuentasOverview } from './cuentas-overview'
import { MovimientosTable, type MovimientoTesoreria, type MovimientoTableRow } from './movimientos-table'
import { CajaFuerteModal } from './caja-fuerte-modal'
import { MovimientoManualModal } from './movimiento-manual-modal'
import { TraspasoModal } from './traspaso-modal'
import { ReversoModal } from './reverso-modal'
import type { CajaFuerte } from '../hooks/use-caja-fuerte'

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
    descripcion: mov.descripcion,
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

  // Seleccion de cuenta
  const [selectedCuenta, setSelectedCuenta] = useState<CuentaTesoreria | null>(null)

  // Tabs
  const [activeTab, setActiveTab] = useState<'pendiente' | 'historico' | 'traspasos'>('pendiente')

  // Filtros de historico (inputs — no aplicados hasta "Consultar")
  const [filterDesde, setFilterDesde] = useState(daysAgo(30))
  const [filterHasta, setFilterHasta] = useState(todayStr())
  const [filterTipo, setFilterTipo] = useState<'INGRESO' | 'EGRESO' | ''>('')
  const [filterSearch, setFilterSearch] = useState('')

  // Filtros aplicados (se actualizan al hacer clic en "Consultar")
  const [appliedDesde, setAppliedDesde] = useState(daysAgo(30))
  const [appliedHasta, setAppliedHasta] = useState(todayStr())
  const [appliedTipo, setAppliedTipo] = useState<'INGRESO' | 'EGRESO' | ''>('')
  const [appliedSearch, setAppliedSearch] = useState('')

  // Paginacion historico
  const [histPage, setHistPage] = useState(1)

  // Modales
  const [showCajaFuerteModal, setShowCajaFuerteModal] = useState(false)
  const [editandoCaja, setEditandoCaja] = useState<CajaFuerte | null>(null)
  const [showManualModal, setShowManualModal] = useState(false)
  const [showTraspasoModal, setShowTraspasoModal] = useState(false)
  const [movParaReversar, setMovParaReversar] = useState<MovimientoTesoreria | null>(null)

  // Datos
  const { cuentas, isLoading: loadingCuentas } = useCuentasTesoreria()

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

  function handleConsultarHistorico() {
    setAppliedDesde(filterDesde)
    setAppliedHasta(filterHasta)
    setAppliedTipo(filterTipo)
    setAppliedSearch(filterSearch)
    setHistPage(1)
  }

  async function handleValidarMov(id: string) {
    if (!user?.id) return
    try {
      if (selectedCuenta?.tipo === 'BANCO') {
        await validarMovBancario(id, user.id)
      } else {
        await validarMovCajaFuerte(id, user.id)
      }
      toast.success('Movimiento validado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al validar')
    }
  }

  function handleReversarMov(id: string) {
    if (!selectedCuenta) return
    if (selectedCuenta.tipo === 'BANCO') {
      const mov = pendienteBancoResult.data.find((m) => m.id === id)
      if (mov) setMovParaReversar({ ...mov, _source: 'BANCO' as const })
    } else {
      const mov = pendienteCajaResult.data.find((m) => m.id === id)
      if (mov) setMovParaReversar({ ...mov, _source: 'CAJA_FUERTE' as const })
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

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditandoCaja(null)
            setShowCajaFuerteModal(true)
          }}
        >
          <Vault size={16} className="mr-1.5" />
          Nueva caja fuerte
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowTraspasoModal(true)}
          disabled={cuentas.length < 2}
        >
          <ArrowsLeftRight size={16} className="mr-1.5" />
          Traspaso
        </Button>
        <Button
          size="sm"
          onClick={() => setShowManualModal(true)}
          disabled={!selectedCuenta}
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
          selectedId={selectedCuenta?.id ?? null}
          onSelect={handleSelectCuenta}
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
              <MovimientosTable
                movimientos={pendienteMovRows}
                modo="pendiente"
                loading={pendienteResult.isLoading}
                monedaSimbolo={selectedCuenta.moneda_simbolo}
              />
            </TabsContent>

            {/* Tab: Historico */}
            <TabsContent value="historico" className="mt-4">
              {/* Barra de filtros */}
              <div className="flex flex-wrap items-end gap-3 mb-4">
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

      {selectedCuenta && (
        <MovimientoManualModal
          isOpen={showManualModal}
          onClose={() => setShowManualModal(false)}
          cuenta={selectedCuenta}
        />
      )}

      <TraspasoModal
        isOpen={showTraspasoModal}
        onClose={() => setShowTraspasoModal(false)}
        cuentas={cuentas}
      />

      <ReversoModal
        isOpen={movParaReversar !== null}
        onClose={() => setMovParaReversar(null)}
        movimiento={movParaReversar}
        monedaSimbolo={selectedCuenta?.moneda_simbolo ?? '$'}
      />
    </div>
  )
}
