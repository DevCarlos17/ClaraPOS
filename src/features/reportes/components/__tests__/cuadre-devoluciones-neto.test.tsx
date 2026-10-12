// CuadreDevolucionesNeto — Card 2 "Resumen de Caja": linea unica "(−) Notas
// de Credito" (global, SIN desglose contado/credito — ese detalle vive en
// Card 3) + "TOTAL FACTURADO NETO" = Total Facturado - Notas de Credito. Ver
// engram sdd/nc-cuadre/card2-diseno. Componente puro (sin hooks, sin mocks
// necesarios) para cumplir la regla de higiene de mocks del modo TDD.
//
// RELABEL (sdd/cuadre-cobros-anteriores-y-neto-sesion, Option A del owner): el total
// que esta card mostraba como "TOTAL NETO SESIÓN" (facturado − NC) se renombra a
// "TOTAL FACTURADO NETO" para dejar espacio al NUEVO "TOTAL NETO SESIÓN" (ver
// CuadreTotalNetoSesion abajo), que suma facturado neto + caja no facturada
// (cobros anteriores + SAF generado) + diferencial/absorcion cuando existen.
import { render, screen, within } from '@testing-library/react'
import { CuadreDevolucionesNeto, CuadreTotalNetoSesion } from '../cuadre-devoluciones-neto'

describe('CuadreDevolucionesNeto — Card 2 Resumen de Caja (nc-cuadre-sesion)', () => {
  it('renderiza "(−) Notas de Credito" con el monto NC en negativo (Bs y USD)', () => {
    render(
      <CuadreDevolucionesNeto
        totalFacturadoUsd={2704}
        totalFacturadoBs={113568}
        totalNcrUsd={2704}
        totalNcrBs={113568}
      />
    )

    const label = screen.getByText('(−) Notas de Crédito')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('-$2,704.00', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/-Bs\.\s*113\.568,00/)).toBeInTheDocument()
  })

  it('TOTAL FACTURADO NETO = Total Facturado - Notas de Credito (escenario 2704 -> NC total -> 0)', () => {
    render(
      <CuadreDevolucionesNeto
        totalFacturadoUsd={2704}
        totalFacturadoBs={113568}
        totalNcrUsd={2704}
        totalNcrBs={113568}
      />
    )

    const label = screen.getByText('TOTAL FACTURADO NETO')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$0.00', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/Bs\.\s*0,00/)).toBeInTheDocument()
  })

  it('triangulacion: sin devoluciones (NC=0), el Neto queda IGUAL al Facturado — prueba resta real, no hardcodeada', () => {
    render(
      <CuadreDevolucionesNeto
        totalFacturadoUsd={500}
        totalFacturadoBs={21000}
        totalNcrUsd={0}
        totalNcrBs={0}
      />
    )

    const label = screen.getByText('TOTAL FACTURADO NETO')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$500.00', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/Bs\.\s*21\.000,00/)).toBeInTheDocument()
  })

  it('triangulacion: devolucion PARCIAL (NC=100 de 500) — Neto=400, prueba un tercer valor distinto', () => {
    render(
      <CuadreDevolucionesNeto
        totalFacturadoUsd={500}
        totalFacturadoBs={21000}
        totalNcrUsd={100}
        totalNcrBs={4200}
      />
    )

    const label = screen.getByText('TOTAL FACTURADO NETO')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$400.00', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/Bs\.\s*16\.800,00/)).toBeInTheDocument()
  })
})

// CuadreTotalNetoSesion — NUEVO total (sdd/cuadre-cobros-anteriores-y-neto-sesion, Option A):
// TOTAL NETO SESION = facturadoNeto + cobrosAnteriores + anticipo(SAF generado) +
// diferencial (solo si hayDiferencial) + absorcion (solo si hayAbsorcion). Debe calzar
// exactamente con TOTAL COBRADO de la Card derecha (pagos-resumen.tsx) en todo escenario
// balanceado — ver engram #5346 (grafo de dependencias 100% aislado, formula segura).
describe('CuadreTotalNetoSesion — nuevo total que incluye caja no facturada (sdd/cuadre-cobros-anteriores-y-neto-sesion)', () => {
  it('ejemplo completo del owner: facturadoNeto 1950 + cobrosAnteriores 99.99 + SAF generado 1300 (sin diferencial/absorcion) = 3349.99', () => {
    render(
      <CuadreTotalNetoSesion
        facturadoNetoUsd={1950}
        facturadoNetoBs={1950 * 42}
        cobrosAnterioresUsd={99.99}
        cobrosAnterioresBs={99.99 * 42}
        anticipoUsd={1300}
        anticipoBs={1300 * 42}
      />
    )

    const label = screen.getByText('TOTAL NETO SESIÓN')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$3,349.99', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/Bs\.\s*140\.699,58/)).toBeInTheDocument()
  })

  it('con diferencial cambiario activo: suma 50 USD extra al total (3349.99 -> 3399.99)', () => {
    render(
      <CuadreTotalNetoSesion
        facturadoNetoUsd={1950}
        facturadoNetoBs={1950 * 42}
        cobrosAnterioresUsd={99.99}
        cobrosAnterioresBs={99.99 * 42}
        anticipoUsd={1300}
        anticipoBs={1300 * 42}
        diferencialUsd={50}
        diferencialBs={50 * 42}
        hayDiferencial
      />
    )

    const label = screen.getByText('TOTAL NETO SESIÓN')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$3,399.99', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/Bs\.\s*142\.799,58/)).toBeInTheDocument()
  })

  it('con absorcion (Negocio asume) activa: suma su monto al total', () => {
    render(
      <CuadreTotalNetoSesion
        facturadoNetoUsd={1950}
        facturadoNetoBs={1950 * 42}
        cobrosAnterioresUsd={99.99}
        cobrosAnterioresBs={99.99 * 42}
        anticipoUsd={1300}
        anticipoBs={1300 * 42}
        absorcionUsd={25}
        absorcionBs={25 * 42}
        hayAbsorcion
      />
    )

    const label = screen.getByText('TOTAL NETO SESIÓN')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$3,374.99', { exact: false })).toBeInTheDocument()
  })

  it('caso simple cash-only: sin cobros anteriores, sin SAF generado, sin diferencial/absorcion -> Neto == Facturado Neto (500)', () => {
    render(
      <CuadreTotalNetoSesion
        facturadoNetoUsd={500}
        facturadoNetoBs={21000}
        cobrosAnterioresUsd={0}
        cobrosAnterioresBs={0}
        anticipoUsd={0}
        anticipoBs={0}
      />
    )

    const label = screen.getByText('TOTAL NETO SESIÓN')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$500.00', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/Bs\.\s*21\.000,00/)).toBeInTheDocument()
  })

  it('defensivo: diferencial/absorcion pasados pero hayDiferencial/hayAbsorcion=false (default) NO se suman', () => {
    render(
      <CuadreTotalNetoSesion
        facturadoNetoUsd={500}
        facturadoNetoBs={21000}
        cobrosAnterioresUsd={0}
        cobrosAnterioresBs={0}
        anticipoUsd={0}
        anticipoBs={0}
        diferencialUsd={999}
        diferencialBs={999 * 42}
        absorcionUsd={999}
        absorcionBs={999 * 42}
      />
    )

    const label = screen.getByText('TOTAL NETO SESIÓN')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$500.00', { exact: false })).toBeInTheDocument()
  })
})
