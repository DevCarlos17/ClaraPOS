// PagosResumen — Card "Cobros por Metodo de Pago". BUG A (sdd/cuadre-saf-generado-consumido):
// el guard de empty-state (antes: `metodosMostrar.length === 0 && cxcTotalUsd <= 0`) ignoraba
// el resto de los conceptos que la card puede renderizar (SAF consumido, diferencial cambiario,
// absorcion). Resultado: una sesion 100%-SAF (sin efectivo, sin CxC) caia en "Sin cobros en
// esta fecha" aunque el bloque "Saldo a favor aplicado" (ya escrito, L128-150) tuviera datos
// reales para mostrar. El fix amplia el guard para exigir que TODOS los conceptos esten vacios
// antes de mostrar el empty-state. Ver engram sdd/cuadre-saf-generado-consumido/analisis (#5305).
vi.mock('../../hooks/use-cuadre', () => ({
  usePagosPorMetodo: vi.fn(),
  useCxcDelDia: vi.fn(),
  useTotalesFiscales: vi.fn(),
  useSafDiario: vi.fn(),
  useDiferencialCambiarioDelDia: vi.fn(),
  useAbsorcionDelDia: vi.fn(),
}))

import { render, screen } from '@testing-library/react'
import { PagosResumen } from '../pagos-resumen'
import {
  usePagosPorMetodo,
  useCxcDelDia,
  useTotalesFiscales,
  useSafDiario,
  useDiferencialCambiarioDelDia,
  useAbsorcionDelDia,
} from '../../hooks/use-cuadre'

const mockedUsePagosPorMetodo = vi.mocked(usePagosPorMetodo)
const mockedUseCxcDelDia = vi.mocked(useCxcDelDia)
const mockedUseTotalesFiscales = vi.mocked(useTotalesFiscales)
const mockedUseSafDiario = vi.mocked(useSafDiario)
const mockedUseDiferencialCambiarioDelDia = vi.mocked(useDiferencialCambiarioDelDia)
const mockedUseAbsorcionDelDia = vi.mocked(useAbsorcionDelDia)

const filters = { fecha: '2026-10-11', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }

function setup(opts: {
  metodos?: Array<{ metodo_cobro_id: string; nombre: string; tipo: string; moneda: string; totalUsd: number; totalOriginal: number; totalBs: number }>
  cxcTotalUsd?: number
  cxcTotalBs?: number
  safTotalUsd?: number
  hayDiferencial?: boolean
  hayAbsorcion?: boolean
}) {
  mockedUsePagosPorMetodo.mockReturnValue({
    metodos: opts.metodos ?? [],
    isLoading: false,
  } as never)
  mockedUseCxcDelDia.mockReturnValue({
    cxcTotalUsd: opts.cxcTotalUsd ?? 0,
    cxcTotalBs: opts.cxcTotalBs ?? 0,
    isLoading: false,
  } as never)
  mockedUseTotalesFiscales.mockReturnValue({
    totales: {},
    isLoading: false,
  } as never)
  mockedUseSafDiario.mockReturnValue({
    totalUsd: opts.safTotalUsd ?? 0,
    items: [],
    isLoading: false,
  } as never)
  mockedUseDiferencialCambiarioDelDia.mockReturnValue({
    netoBs: opts.hayDiferencial ? 1000 : 0,
    netoUsd: opts.hayDiferencial ? 20 : 0,
    hayDiferencial: opts.hayDiferencial ?? false,
    isLoading: false,
  } as never)
  mockedUseAbsorcionDelDia.mockReturnValue({
    totalBs: opts.hayAbsorcion ? 500 : 0,
    totalUsd: opts.hayAbsorcion ? 10 : 0,
    hayAbsorcion: opts.hayAbsorcion ?? false,
    isLoading: false,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PagosResumen — guard de empty-state considera TODOS los conceptos (BUG A, sdd/cuadre-saf-generado-consumido)', () => {
  it('sin metodos de pago en efectivo pero CON SAF consumido (haySaf=true): muestra "Saldo a favor aplicado" y NO el empty-state', () => {
    setup({ metodos: [], cxcTotalUsd: 0, safTotalUsd: 650 })

    render(<PagosResumen filters={filters} tasaDelDia={42} />)

    expect(screen.getByText('Saldo a favor aplicado')).toBeInTheDocument()
    expect(screen.getByText('Credito consumido de clientes')).toBeInTheDocument()
    expect(screen.queryByText('Sin cobros en esta fecha')).not.toBeInTheDocument()
  })

  it('genuinely empty — sin metodos, sin SAF, sin CxC, sin diferencial, sin absorcion: SI muestra el empty-state', () => {
    setup({ metodos: [], cxcTotalUsd: 0, safTotalUsd: 0, hayDiferencial: false, hayAbsorcion: false })

    render(<PagosResumen filters={filters} tasaDelDia={42} />)

    expect(screen.getByText('Sin cobros en esta fecha')).toBeInTheDocument()
    expect(screen.queryByText('Saldo a favor aplicado')).not.toBeInTheDocument()
  })

  it('triangulacion: sin metodos, sin SAF, sin CxC, pero CON diferencial cambiario: NO cae en empty-state (prueba que el guard no es solo "!haySaf")', () => {
    setup({ metodos: [], cxcTotalUsd: 0, safTotalUsd: 0, hayDiferencial: true })

    render(<PagosResumen filters={filters} tasaDelDia={42} />)

    expect(screen.getByText('Diferencial cambiario')).toBeInTheDocument()
    expect(screen.queryByText('Sin cobros en esta fecha')).not.toBeInTheDocument()
  })

  it('triangulacion: sin metodos, sin SAF, sin CxC, sin diferencial, pero CON absorcion ("Negocio asume"): NO cae en empty-state', () => {
    setup({ metodos: [], cxcTotalUsd: 0, safTotalUsd: 0, hayAbsorcion: true })

    render(<PagosResumen filters={filters} tasaDelDia={42} />)

    expect(screen.getByText('Negocio asume')).toBeInTheDocument()
    expect(screen.queryByText('Sin cobros en esta fecha')).not.toBeInTheDocument()
  })

  it('triangulacion: CON metodos de pago en efectivo (caso ya-correcto previo al fix) sigue mostrando el contenido normal', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 100, totalOriginal: 100, totalBs: 4200 },
      ],
    })

    render(<PagosResumen filters={filters} tasaDelDia={42} />)

    expect(screen.getByText('Efectivo USD')).toBeInTheDocument()
    expect(screen.queryByText('Sin cobros en esta fecha')).not.toBeInTheDocument()
  })
})
