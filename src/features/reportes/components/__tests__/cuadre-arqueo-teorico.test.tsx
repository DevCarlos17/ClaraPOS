// CuadreArqueoTeorico (Card 5) — verifica que los reembolsos de efectivo por Nota de
// Credito (origen='NCR', ya clasificados fuera del componente via splitEgresosArqueo)
// se muestren en su PROPIA linea "Devoluciones (NC)", separada de "Retiros", y que el
// Total Teorico NO cambie por el split (arqueo-nc-cuadre-devoluciones). Cero mocks —
// componente puro controlado por props.
import { render, screen } from '@testing-library/react'
import { CuadreArqueoTeorico, type CuadreArqueoTeoricoProps } from '../cuadre-arqueo-teorico'

function baseProps(overrides: Partial<CuadreArqueoTeoricoProps> = {}): CuadreArqueoTeoricoProps {
  return {
    fondoAperturaUsd: 100,
    fondoAperturaBs: 0,
    ventasEfectivoUsd: 200,
    ventasEfectivoBsNativo: 0,
    ingresosEfectivoUsd: 0,
    ingresosEfectivoBsNativo: 0,
    egresosUsd: 0,
    egresosBsNativo: 0,
    retirosManualesUsd: 0,
    retirosManualesBsNativo: 0,
    devolucionesNcUsd: 0,
    devolucionesNcBsNativo: 0,
    vueltosUsd: 0,
    vueltosBsNativo: 0,
    tasaCambio: 40,
    ...overrides,
  }
}

describe('CuadreArqueoTeorico — linea "Devoluciones (NC)" separada de "Retiros"', () => {
  it('muestra la linea "Devoluciones (NC)" cuando devolucionesNcUsd > 0', () => {
    render(<CuadreArqueoTeorico {...baseProps({ devolucionesNcUsd: 25, egresosUsd: 25 })} />)
    expect(screen.getByText(/Devoluciones \(NC\)/)).toBeInTheDocument()
  })

  it('oculta la linea "Devoluciones (NC)" cuando devolucionesNcUsd y devolucionesNcBsNativo son 0', () => {
    render(<CuadreArqueoTeorico {...baseProps()} />)
    expect(screen.queryByText(/Devoluciones \(NC\)/)).not.toBeInTheDocument()
  })

  it('"Retiros" sigue renderizando y sigue siendo un concepto DISTINTO de "Devoluciones (NC)" cuando ambos > 0', () => {
    render(<CuadreArqueoTeorico {...baseProps({
      retirosManualesUsd: 10,
      devolucionesNcUsd: 25,
      egresosUsd: 35,
    })} />)
    expect(screen.getByText('Retiros')).toBeInTheDocument()
    expect(screen.getByText(/Devoluciones \(NC\)/)).toBeInTheDocument()
  })

  it('el Total Teorico usa egresosUsd (total agregado) y NO cambia segun como se reparta entre retiros/devoluciones/vueltos', () => {
    // Escenario A: 35 de egreso, todo como "retiros" (comportamiento pre-cambio)
    const { unmount } = render(<CuadreArqueoTeorico {...baseProps({
      retirosManualesUsd: 35,
      devolucionesNcUsd: 0,
      egresosUsd: 35,
    })} />)
    // fondo 100 + ventas 200 - egresos 35 = 265
    expect(screen.getByText('$265.00')).toBeInTheDocument()
    unmount()

    // Escenario B: mismos 35 de egreso, mismo total, mismo teorico resultante — solo
    // se reetiqueta 25 como Devoluciones y 10 como Retiros.
    render(<CuadreArqueoTeorico {...baseProps({
      retirosManualesUsd: 10,
      devolucionesNcUsd: 25,
      egresosUsd: 35,
    })} />)
    expect(screen.getByText('$265.00')).toBeInTheDocument()
  })

  it('devolucionesNcBsNativo > 0 tambien muestra la linea "Devoluciones (NC)" en Bs', () => {
    render(<CuadreArqueoTeorico {...baseProps({ devolucionesNcBsNativo: 1000, egresosBsNativo: 1000 })} />)
    expect(screen.getByText(/Devoluciones \(NC\)/)).toBeInTheDocument()
  })
})
