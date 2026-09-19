// CuadreDevolucionesNeto — Card 2 "Resumen de Caja": linea unica "(−) Notas
// de Credito" (global, SIN desglose contado/credito — ese detalle vive en
// Card 3) + "TOTAL NETO SESION" = Total Facturado - Notas de Credito. Ver
// engram sdd/nc-cuadre/card2-diseno. Componente puro (sin hooks, sin mocks
// necesarios) para cumplir la regla de higiene de mocks del modo TDD.
import { render, screen, within } from '@testing-library/react'
import { CuadreDevolucionesNeto } from '../cuadre-devoluciones-neto'

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

  it('TOTAL NETO SESION = Total Facturado - Notas de Credito (escenario 2704 -> NC total -> 0)', () => {
    render(
      <CuadreDevolucionesNeto
        totalFacturadoUsd={2704}
        totalFacturadoBs={113568}
        totalNcrUsd={2704}
        totalNcrBs={113568}
      />
    )

    const label = screen.getByText('TOTAL NETO SESIÓN')
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

    const label = screen.getByText('TOTAL NETO SESIÓN')
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

    const label = screen.getByText('TOTAL NETO SESIÓN')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$400.00', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/Bs\.\s*16\.800,00/)).toBeInTheDocument()
  })
})
