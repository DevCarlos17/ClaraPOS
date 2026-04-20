import { useState } from 'react'
import { toast } from 'sonner'
import { TrendingUp, TrendingDown, AlertCircle, Minus } from 'lucide-react'
import { useDiferencialBancos, aplicarDiferencialBanco, type DiferencialBanco } from '../hooks/use-diferencial-banco'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatBs, formatUsd } from '@/lib/currency'
import { Button } from '@/components/ui/button'

// ─── Fila de banco ────────────────────────────────────────────

function BancoRow({ banco, onAplicar }: { banco: DiferencialBanco; onAplicar: (b: DiferencialBanco) => Promise<void> }) {
  const [loading, setLoading] = useState(false)

  const sinCuenta = !banco.cuenta_contable_id
  const sinTasa = banco.tasa === 0
  const diferencial = banco.diferencial_bs

  async function handleAplicar() {
    setLoading(true)
    try {
      await onAplicar(banco)
      toast.success(`Diferencial registrado para ${banco.nombre_banco}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar diferencial')
    } finally {
      setLoading(false)
    }
  }

  return (
    <tr className="hover:bg-muted/20 border-b border-border last:border-0">
      {/* Banco */}
      <td className="px-4 py-3">
        <div className="font-medium text-sm">{banco.nombre_banco}</div>
        <div className="text-xs text-muted-foreground">{banco.nro_cuenta ?? '-'}</div>
      </td>

      {/* Moneda */}
      <td className="px-4 py-3 text-center">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
          {banco.moneda_iso}
        </span>
      </td>

      {/* Saldo en moneda */}
      <td className="px-4 py-3 text-right tabular-nums text-sm font-medium">
        {formatUsd(banco.saldo_foreign)}
      </td>

      {/* Tasa */}
      <td className="px-4 py-3 text-right tabular-nums text-sm text-muted-foreground">
        {sinTasa ? (
          <span className="text-amber-600 text-xs">Sin tasa</span>
        ) : (
          banco.tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        )}
      </td>

      {/* Valor en libro */}
      <td className="px-4 py-3 text-right tabular-nums text-sm text-muted-foreground">
        {formatBs(banco.saldo_bs_libro)}
      </td>

      {/* Valor real */}
      <td className="px-4 py-3 text-right tabular-nums text-sm">
        {sinTasa ? '-' : formatBs(banco.saldo_bs_real)}
      </td>

      {/* Diferencial */}
      <td className="px-4 py-3 text-right tabular-nums">
        {sinTasa || sinCuenta ? (
          <span className="text-xs text-muted-foreground">-</span>
        ) : Math.abs(diferencial) < 0.01 ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
            <Minus size={12} />
            Ajustado
          </span>
        ) : diferencial > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
            <TrendingUp size={13} />
            {formatBs(diferencial)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
            <TrendingDown size={13} />
            {formatBs(diferencial)}
          </span>
        )}
      </td>

      {/* Accion */}
      <td className="px-4 py-3 text-center">
        {sinCuenta ? (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <AlertCircle size={12} />
            Sin cuenta contable
          </span>
        ) : sinTasa ? (
          <span className="text-xs text-muted-foreground">Sin tasa registrada</span>
        ) : Math.abs(diferencial) < 0.01 ? null : (
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 px-2.5"
            disabled={loading}
            onClick={handleAplicar}
          >
            {loading ? 'Registrando...' : 'Registrar ajuste'}
          </Button>
        )}
      </td>
    </tr>
  )
}

// ─── Componente principal ─────────────────────────────────────

export function DiferencialCambiariosbancos() {
  const { user } = useCurrentUser()
  const { diferenciales, isLoading } = useDiferencialBancos()

  async function handleAplicar(banco: DiferencialBanco) {
    if (!user?.id || !user.empresa_id) throw new Error('Usuario no autenticado')
    if (!banco.cuenta_contable_id) throw new Error('El banco no tiene cuenta contable vinculada')

    await aplicarDiferencialBanco({
      empresaId: user.empresa_id,
      bancoId: banco.banco_id,
      cuentaBancoId: banco.cuenta_contable_id,
      diferencialBs: banco.diferencial_bs,
      tasa: banco.tasa,
      monedaIso: banco.moneda_iso,
      nombreBanco: banco.nombre_banco,
      usuarioId: user.id,
    })
  }

  if (isLoading) {
    return <div className="h-32 bg-muted/30 rounded-lg animate-pulse" />
  }

  if (diferenciales.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-muted-foreground">
        No hay bancos en moneda extranjera registrados o todos tienen moneda VES.
      </div>
    )
  }

  const totalDiferencial = diferenciales.reduce((s, b) => s + b.diferencial_bs, 0)

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground mb-1">Bancos en moneda extranjera</div>
          <div className="text-lg font-bold">{diferenciales.length}</div>
        </div>
        <div className={`rounded-lg border p-3 ${totalDiferencial >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className={`text-xs mb-1 ${totalDiferencial >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            Diferencial total
          </div>
          <div className={`text-lg font-bold ${totalDiferencial >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {formatBs(totalDiferencial)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground mb-1">Ajustes pendientes</div>
          <div className="text-lg font-bold text-amber-600">
            {diferenciales.filter((b) => Math.abs(b.diferencial_bs) >= 0.01 && b.cuenta_contable_id && b.tasa > 0).length}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">Banco</th>
              <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs">Moneda</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs">Saldo</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs">Tasa actual</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs">Valor en libro (Bs)</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs">Valor real (Bs)</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs">Diferencial</th>
              <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs">Accion</th>
            </tr>
          </thead>
          <tbody>
            {diferenciales.map((banco) => (
              <BancoRow key={banco.banco_id} banco={banco} onAplicar={handleAplicar} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        El <strong>valor en libro</strong> es la suma historica de asientos contables del banco. El <strong>valor real</strong> es el saldo actual multiplicado por la tasa vigente. El diferencial se registra como ganancia o perdida cambiaria.
      </p>
    </div>
  )
}
