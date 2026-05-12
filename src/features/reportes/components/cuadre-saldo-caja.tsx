import { useState } from 'react'
import { CaretDown, CaretRight, Wallet } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import {
  useSesionApertura,
  usePagosPorMetodo,
  useMovimientosManualesDia,
  useSaldoEfectivoBimonetario,
  useCobrosEfectivoCaja,
  useMovimientosEfectivoCaja,
  type CuadreFilters,
} from '../hooks/use-cuadre'

interface CuadreSaldoCajaProps {
  filters: CuadreFilters
}

type ExpandedRow = 'ventas' | 'ingresos' | 'retiros' | 'vueltos' | 'avances' | null

export function CuadreSaldoCaja({ filters }: CuadreSaldoCajaProps) {
  const [expanded, setExpanded] = useState<ExpandedRow>(null)

  const { aperturaUsd, aperturaBs } = useSesionApertura(filters)
  const { metodos } = usePagosPorMetodo(filters)
  const { movimientos } = useMovimientosManualesDia(filters)
  const { saldoEsperadoUsd, saldoEsperadoBs } = useSaldoEfectivoBimonetario(filters)
  const { cobros } = useCobrosEfectivoCaja(filters)
  const { movimientos: movsDetalle } = useMovimientosEfectivoCaja(filters)

  // Solo movimientos de tipo EFECTIVO
  const movsEf = movimientos.filter((m) => m.metodo_tipo === 'EFECTIVO')

  const sumMovs = (origenes: string[], moneda: 'USD' | 'BS') =>
    movsEf
      .filter((m) => origenes.includes(m.origen) && m.metodo_moneda === moneda)
      .reduce((s, m) => s + m.total, 0)

  const cobrosEfUsd = metodos
    .filter((m) => m.tipo === 'EFECTIVO' && m.moneda !== 'BS')
    .reduce((s, m) => s + m.totalUsd, 0)
  const cobrosEfBs = metodos
    .filter((m) => m.tipo === 'EFECTIVO' && m.moneda === 'BS')
    .reduce((s, m) => s + m.totalOriginal, 0)

  const ingManUsd = sumMovs(['INGRESO_MANUAL'], 'USD')
  const ingManBs  = sumMovs(['INGRESO_MANUAL'], 'BS')
  const retManUsd = sumMovs(['EGRESO_MANUAL'], 'USD')
  const retManBs  = sumMovs(['EGRESO_MANUAL'], 'BS')
  const vueltosUsd = sumMovs(['VUELTO'], 'USD')
  const vueltosBs  = sumMovs(['VUELTO'], 'BS')
  const avancesUsd = sumMovs(['AVANCE', 'PRESTAMO'], 'USD')
  const avancesBs  = sumMovs(['AVANCE', 'PRESTAMO'], 'BS')

  const hasData = aperturaUsd > 0.001 || aperturaBs > 0.001 || cobrosEfUsd > 0.001 || cobrosEfBs > 0.001
  if (!hasData) return null

  const toggle = (row: Exclude<ExpandedRow, null>) =>
    setExpanded((prev) => (prev === row ? null : row))

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={18} className="text-primary" />
        <h3 className="text-sm font-semibold">Saldo de Efectivo en Caja</h3>
      </div>

      <div className="space-y-0.5 text-sm">
        {/* Efectivo inicial */}
        <StaticRow
          label="Efectivo inicial"
          sign="+"
          usd={aperturaUsd}
          bs={aperturaBs}
          color="green"
        />

        {/* Ingresos de venta */}
        {(cobrosEfUsd > 0.001 || cobrosEfBs > 0.001) && (
          <>
            <ExpandableRow
              label="Ingresos de venta"
              sign="+"
              usd={cobrosEfUsd}
              bs={cobrosEfBs}
              color="green"
              isOpen={expanded === 'ventas'}
              onToggle={() => toggle('ventas')}
            />
            {expanded === 'ventas' && (
              <DetailPanel>
                {cobros.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">Sin registros</p>
                ) : (
                  cobros.map((c) => (
                    <DetailRow
                      key={c.id}
                      label={`${c.nro_factura} · ${c.cliente_nombre}`}
                      value={
                        c.moneda === 'BS'
                          ? formatBs(parseFloat(c.monto))
                          : formatUsd(parseFloat(c.monto))
                      }
                      fecha={c.fecha}
                    />
                  ))
                )}
              </DetailPanel>
            )}
          </>
        )}

        {/* Ingresos manuales */}
        {(ingManUsd > 0.001 || ingManBs > 0.001) && (
          <>
            <ExpandableRow
              label="Ingresos manuales"
              sign="+"
              usd={ingManUsd}
              bs={ingManBs}
              color="green"
              isOpen={expanded === 'ingresos'}
              onToggle={() => toggle('ingresos')}
            />
            {expanded === 'ingresos' && (
              <DetailPanel>
                {movsDetalle
                  .filter((m) => m.origen === 'INGRESO_MANUAL')
                  .map((m) => (
                    <DetailRow
                      key={m.id}
                      label={m.concepto ?? m.metodo_nombre}
                      value={
                        m.metodo_moneda === 'BS'
                          ? formatBs(parseFloat(m.monto))
                          : formatUsd(parseFloat(m.monto))
                      }
                      fecha={m.fecha}
                    />
                  ))}
              </DetailPanel>
            )}
          </>
        )}

        {/* Separador egresos */}
        {(retManUsd > 0.001 || retManBs > 0.001 ||
          vueltosUsd > 0.001 || vueltosBs > 0.001 ||
          avancesUsd > 0.001 || avancesBs > 0.001) && (
          <div className="border-t my-1" />
        )}

        {/* Retiros manuales */}
        {(retManUsd > 0.001 || retManBs > 0.001) && (
          <>
            <ExpandableRow
              label="Retiros manuales"
              sign="-"
              usd={retManUsd}
              bs={retManBs}
              color="red"
              isOpen={expanded === 'retiros'}
              onToggle={() => toggle('retiros')}
            />
            {expanded === 'retiros' && (
              <DetailPanel>
                {movsDetalle
                  .filter((m) => m.origen === 'EGRESO_MANUAL')
                  .map((m) => (
                    <DetailRow
                      key={m.id}
                      label={m.concepto ?? m.metodo_nombre}
                      value={
                        m.metodo_moneda === 'BS'
                          ? formatBs(parseFloat(m.monto))
                          : formatUsd(parseFloat(m.monto))
                      }
                      fecha={m.fecha}
                    />
                  ))}
              </DetailPanel>
            )}
          </>
        )}

        {/* Vueltos entregados */}
        {(vueltosUsd > 0.001 || vueltosBs > 0.001) && (
          <>
            <ExpandableRow
              label="Vueltos entregados"
              sign="-"
              usd={vueltosUsd}
              bs={vueltosBs}
              color="red"
              isOpen={expanded === 'vueltos'}
              onToggle={() => toggle('vueltos')}
            />
            {expanded === 'vueltos' && (
              <DetailPanel>
                {movsDetalle
                  .filter((m) => m.origen === 'VUELTO')
                  .map((m) => (
                    <DetailRow
                      key={m.id}
                      label={m.concepto ?? m.metodo_nombre}
                      value={
                        m.metodo_moneda === 'BS'
                          ? formatBs(parseFloat(m.monto))
                          : formatUsd(parseFloat(m.monto))
                      }
                      fecha={m.fecha}
                    />
                  ))}
              </DetailPanel>
            )}
          </>
        )}

        {/* Avances y prestamos */}
        {(avancesUsd > 0.001 || avancesBs > 0.001) && (
          <>
            <ExpandableRow
              label="Avances y prestamos"
              sign="-"
              usd={avancesUsd}
              bs={avancesBs}
              color="red"
              isOpen={expanded === 'avances'}
              onToggle={() => toggle('avances')}
            />
            {expanded === 'avances' && (
              <DetailPanel>
                {movsDetalle
                  .filter((m) => ['AVANCE', 'PRESTAMO'].includes(m.origen))
                  .map((m) => (
                    <DetailRow
                      key={m.id}
                      label={m.destinatario ?? m.concepto ?? m.metodo_nombre}
                      value={
                        m.metodo_moneda === 'BS'
                          ? formatBs(parseFloat(m.monto))
                          : formatUsd(parseFloat(m.monto))
                      }
                      fecha={m.fecha}
                      badge={m.origen}
                    />
                  ))}
              </DetailPanel>
            )}
          </>
        )}

        {/* Saldo de caja */}
        <div className="border-t pt-2 mt-1">
          <div className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-primary/5">
            <span className="font-semibold">Saldo de caja</span>
            <div className="text-right tabular-nums">
              <p className="text-base font-bold text-primary leading-none">
                {formatUsd(saldoEsperadoUsd)}
              </p>
              {saldoEsperadoBs > 0.001 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatBs(saldoEsperadoBs)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-componentes ─────────────────────────────────────────

function StaticRow({
  label,
  sign,
  usd,
  bs,
  color,
}: {
  label: string
  sign: '+' | '-'
  usd: number
  bs: number
  color: 'green' | 'red' | 'gray'
}) {
  const colorClass =
    color === 'green'
      ? 'text-green-700'
      : color === 'red'
      ? 'text-red-600'
      : 'text-foreground'
  return (
    <div className="flex items-center justify-between py-1.5 px-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono text-xs tabular-nums ${colorClass}`}>
        {usd > 0.001 && `${sign}${formatUsd(usd)}`}
        {bs > 0.001 && (
          <span className="ml-2">{sign}{formatBs(bs)}</span>
        )}
      </span>
    </div>
  )
}

function ExpandableRow({
  label,
  sign,
  usd,
  bs,
  color,
  isOpen,
  onToggle,
}: {
  label: string
  sign: '+' | '-'
  usd: number
  bs: number
  color: 'green' | 'red'
  isOpen: boolean
  onToggle: () => void
}) {
  const colorClass = color === 'green' ? 'text-green-700' : 'text-red-600'
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-1.5">
        {isOpen ? (
          <CaretDown size={11} className="text-muted-foreground" />
        ) : (
          <CaretRight size={11} className="text-muted-foreground" />
        )}
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className={`font-mono text-xs tabular-nums ${colorClass}`}>
        {usd > 0.001 && `${sign}${formatUsd(usd)}`}
        {bs > 0.001 && (
          <span className="ml-2">{sign}{formatBs(bs)}</span>
        )}
      </span>
    </button>
  )
}

function DetailPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-5 mr-1 mb-1 rounded-md border border-dashed border-muted-foreground/20 bg-muted/20 p-2 space-y-0.5">
      {children}
    </div>
  )
}

function DetailRow({
  label,
  value,
  fecha,
  badge,
}: {
  label: string
  value: string
  fecha: string
  badge?: string
}) {
  const hora = fecha.length >= 16 ? fecha.substring(11, 16) : ''
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-xs">
      <div className="flex items-center gap-1.5 min-w-0">
        {badge && (
          <span className="shrink-0 inline-flex items-center rounded px-1 py-0.5 text-[10px] bg-amber-100 text-amber-700 font-medium">
            {badge}
          </span>
        )}
        <span className="truncate text-muted-foreground">{label}</span>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {hora && <span className="text-[10px] text-muted-foreground">{hora}</span>}
        <span className="font-mono tabular-nums">{value}</span>
      </div>
    </div>
  )
}
