import { useState } from 'react'
import { CheckCircle, Clock, Bank } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useMovBancarios } from '@/features/caja/hooks/use-mov-bancarios'
import { validarMovimientoBancario } from '../hooks/use-conciliacion'
import { useBancosActivos } from '@/features/configuracion/hooks/use-bancos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatUsd } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ORIGEN_LABELS: Record<string, string> = {
  DEPOSITO_CAJA: 'Deposito caja',
  TRANSFERENCIA_CLIENTE: 'Cobro cliente',
  PAGO_PROVEEDOR: 'Pago proveedor',
  GASTO: 'Gasto',
  MANUAL: 'Manual',
}

export function ConciliacionBancaria() {
  const { user } = useCurrentUser()
  const { bancos } = useBancosActivos()

  const [selectedBancoId, setSelectedBancoId] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [queryParams, setQueryParams] = useState<{
    bancoId: string
    desde?: string
    hasta?: string
  }>({ bancoId: '' })

  const { movimientos, isLoading } = useMovBancarios(
    queryParams.bancoId || null,
    queryParams.desde,
    queryParams.hasta
  )

  function handleConsultar() {
    if (!selectedBancoId) {
      toast.error('Seleccione una cuenta bancaria')
      return
    }
    setQueryParams({
      bancoId: selectedBancoId,
      desde: fechaDesde || undefined,
      hasta: fechaHasta || undefined,
    })
  }

  async function handleValidar(movId: string) {
    if (!user?.id) return
    try {
      await validarMovimientoBancario(movId, user.id)
      toast.success('Movimiento validado correctamente')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al validar movimiento')
    }
  }

  const selectedBanco = bancos.find((b) => b.id === selectedBancoId)

  const totalMovimientos = movimientos.length
  const totalValidados = movimientos.filter((m) => m.validado === 1).length
  const totalPendientes = totalMovimientos - totalValidados
  const montoIngresos = movimientos
    .filter((m) => m.tipo === 'INGRESO' && m.validado === 1)
    .reduce((s, m) => s + parseFloat(m.monto), 0)
  const montoEgresos = movimientos
    .filter((m) => m.tipo === 'EGRESO' && m.validado === 1)
    .reduce((s, m) => s + parseFloat(m.monto), 0)

  return (
    <div className="space-y-5">
      {/* Selector + filtros */}
      <div className="rounded-2xl bg-card shadow-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Cuenta Bancaria</Label>
            <Select value={selectedBancoId} onValueChange={setSelectedBancoId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar banco..." />
              </SelectTrigger>
              <SelectContent>
                {bancos.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.nombre_banco} - {b.nro_cuenta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Desde</Label>
            <Input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hasta</Label>
            <Input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleConsultar} className="w-full" size="sm">
              Consultar
            </Button>
          </div>
        </div>
      </div>

      {/* Cards de resumen */}
      {selectedBanco && queryParams.bancoId && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-2xl bg-card shadow-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Saldo Actual</div>
            <div className="text-base font-bold text-primary">
              {formatUsd(parseFloat(selectedBanco.saldo_actual))}
            </div>
          </div>
          <div className="rounded-2xl bg-card shadow-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Total Movimientos</div>
            <div className="text-base font-bold">{totalMovimientos}</div>
          </div>
          <div className="rounded-2xl bg-green-50 shadow-sm border border-green-200/60 p-3">
            <div className="text-xs text-green-600 mb-1">Validados</div>
            <div className="text-base font-bold text-green-700">{totalValidados}</div>
          </div>
          <div className="rounded-2xl bg-amber-50 shadow-sm border border-amber-200/60 p-3">
            <div className="text-xs text-amber-600 mb-1">Pendientes</div>
            <div className="text-base font-bold text-amber-700">{totalPendientes}</div>
          </div>
          <div className="rounded-2xl bg-card shadow-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Neto Validado</div>
            <div className={`text-base font-bold ${montoIngresos - montoEgresos >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatUsd(montoIngresos - montoEgresos)}
            </div>
          </div>
        </div>
      )}

      {/* Tabla de movimientos */}
      <div className="rounded-2xl bg-card shadow-lg overflow-hidden">
        <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Fecha</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Origen</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Descripcion</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tipo</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Monto</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Saldo Post</th>
              <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Estado</th>
              <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Accion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  Cargando movimientos...
                </td>
              </tr>
            )}
            {!isLoading && movimientos.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Bank size={32} className="opacity-30" />
                    <span className="text-sm">
                      {queryParams.bancoId
                        ? 'No hay movimientos para los filtros seleccionados'
                        : 'Seleccione una cuenta bancaria y consulte'}
                    </span>
                  </div>
                </td>
              </tr>
            )}
            {movimientos.map((mov) => (
              <tr key={mov.id} className="hover:bg-muted/20">
                <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                  {mov.fecha?.toString().slice(0, 10)}
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {ORIGEN_LABELS[mov.origen] ?? mov.origen}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate text-xs">
                  {mov.observacion ?? '-'}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      mov.tipo === 'INGRESO'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {mov.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'}
                  </span>
                </td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                    mov.tipo === 'INGRESO' ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {mov.tipo === 'INGRESO' ? '+' : '-'}
                  {formatUsd(parseFloat(mov.monto))}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                  {parseFloat(mov.saldo_nuevo) !== 0 ? formatUsd(parseFloat(mov.saldo_nuevo)) : '-'}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {mov.validado === 1 ? (
                    <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                      <CheckCircle size={13} />
                      Validado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                      <Clock size={13} />
                      Pendiente
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {mov.validado === 0 && (
                    <Button
                      size="sm"
                      className="text-xs h-7 px-2.5 text-green-700 border-green-300 hover:bg-green-50 cursor-pointer"
                      onClick={() => handleValidar(mov.id)}
                    >
                      Validar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
