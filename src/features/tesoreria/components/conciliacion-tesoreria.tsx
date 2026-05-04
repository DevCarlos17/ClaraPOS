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
import { useMovBancarios } from '@/features/caja/hooks/use-mov-bancarios'
import { useMovCajaFuerte } from '../hooks/use-mov-caja-fuerte'
import { useTraspasos, reversarTraspaso, type TraspasoEnriquecido } from '../hooks/use-traspasos'
import { CuentasOverview } from './cuentas-overview'
import { MovimientosTable, type MovimientoTesoreria } from './movimientos-table'
import { CajaFuerteModal } from './caja-fuerte-modal'
import { MovimientoManualModal } from './movimiento-manual-modal'
import { TraspasoModal } from './traspaso-modal'
import { ReversoModal } from './reverso-modal'
import type { CajaFuerte } from '../hooks/use-caja-fuerte'

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
      {traspaso.tasa_cambio && (
        <td className="py-3 px-4 text-right text-xs text-muted-foreground">
          {parseFloat(traspaso.tasa_cambio).toFixed(4)}
        </td>
      )}
      {!traspaso.tasa_cambio && <td className="py-3 px-4" />}
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

// ─── Pagina principal ────────────────────────────────────────

export function ConciliacionTesoreria() {
  const { user } = useCurrentUser()

  // Estado de UI
  const [selectedCuenta, setSelectedCuenta] = useState<CuentaTesoreria | null>(null)
  const [fechaDesde, setFechaDesde] = useState(daysAgo(30))
  const [fechaHasta, setFechaHasta] = useState(todayStr())
  const [queryParams, setQueryParams] = useState<{ desde: string; hasta: string }>({
    desde: daysAgo(30),
    hasta: todayStr(),
  })

  // Modales
  const [showCajaFuerteModal, setShowCajaFuerteModal] = useState(false)
  const [editandoCaja, setEditandoCaja] = useState<CajaFuerte | null>(null)
  const [showManualModal, setShowManualModal] = useState(false)
  const [showTraspasoModal, setShowTraspasoModal] = useState(false)
  const [movParaReversar, setMovParaReversar] = useState<MovimientoTesoreria | null>(null)

  // Datos
  const { cuentas, isLoading: loadingCuentas } = useCuentasTesoreria()

  // Movimientos bancarios (solo si cuenta es BANCO)
  const { movimientos: movBancarios, isLoading: loadingBancarios } = useMovBancarios(
    selectedCuenta?.tipo === 'BANCO' ? selectedCuenta.id : null,
    queryParams.desde,
    queryParams.hasta
  )

  // Movimientos caja fuerte (solo si cuenta es CAJA_FUERTE)
  const { movimientos: movCaja, isLoading: loadingCaja } = useMovCajaFuerte(
    selectedCuenta?.tipo === 'CAJA_FUERTE' ? selectedCuenta.id : null,
    queryParams.desde,
    queryParams.hasta
  )

  // Traspasos
  const { traspasos, isLoading: loadingTraspasos } = useTraspasos(
    queryParams.desde,
    queryParams.hasta
  )

  // Unificar movimientos segun cuenta seleccionada
  const movimientos: MovimientoTesoreria[] = selectedCuenta
    ? selectedCuenta.tipo === 'BANCO'
      ? movBancarios.map((m) => ({ ...m, _source: 'BANCO' as const }))
      : movCaja.map((m) => ({ ...m, _source: 'CAJA_FUERTE' as const }))
    : []

  const isLoadingMovs =
    selectedCuenta?.tipo === 'BANCO' ? loadingBancarios : loadingCaja

  function handleConsultar() {
    if (!fechaDesde || !fechaHasta) {
      toast.error('Seleccione rango de fechas')
      return
    }
    setQueryParams({ desde: fechaDesde, hasta: fechaHasta })
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
          onSelect={setSelectedCuenta}
        />
      )}

      {/* Filtros de fecha */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Desde</Label>
          <Input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="h-8 text-sm w-36"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hasta</Label>
          <Input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="h-8 text-sm w-36"
          />
        </div>
        <Button size="sm" variant="outline" onClick={handleConsultar}>
          <ArrowsClockwise size={14} className="mr-1.5" />
          Consultar
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="movimientos">
        <TabsList>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="traspasos">Traspasos</TabsTrigger>
        </TabsList>

        <TabsContent value="movimientos" className="mt-4">
          {!selectedCuenta ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
              <ArrowsLeftRight size={32} className="opacity-30" />
              <p>Seleccione una cuenta para ver sus movimientos</p>
            </div>
          ) : (
            <MovimientosTable
              movimientos={movimientos}
              isLoading={isLoadingMovs}
              monedaSimbolo={selectedCuenta.moneda_simbolo}
              onValidar={(mov) => {
                // Validar directamente sin modal
                import('../hooks/use-conciliacion-tesoreria').then(
                  ({ validarMovBancario, validarMovCajaFuerte }) => {
                    if (!user?.id) return
                    const fn =
                      mov._source === 'BANCO' ? validarMovBancario : validarMovCajaFuerte
                    fn(mov.id, user.id)
                      .then(() => toast.success('Movimiento validado'))
                      .catch((err: unknown) =>
                        toast.error(
                          err instanceof Error ? err.message : 'Error al validar'
                        )
                      )
                  }
                )
              }}
              onReversar={(mov) => setMovParaReversar(mov)}
            />
          )}
        </TabsContent>

        <TabsContent value="traspasos" className="mt-4">
          {loadingTraspasos ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Cargando traspasos...
            </div>
          ) : traspasos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
              <ArrowsLeftRight size={32} className="opacity-30" />
              <p>No hay traspasos para el periodo seleccionado</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Fecha</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Origen</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Destino</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Monto origen</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Monto destino</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Tasa</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground">Estado</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Acciones</th>
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
