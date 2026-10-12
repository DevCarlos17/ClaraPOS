// CuadreDevolucionesNeto — Card 2 "Resumen de Caja": linea unica "(−) Notas
// de Credito" (global, SIN desglose contado/credito — ese detalle vive en
// Card 3) + "TOTAL FACTURADO NETO" = Total Facturado - Notas de Credito. Ver
// engram sdd/nc-cuadre/card2-diseno. Componente puro (sin hooks, sin mocks
// necesarios) para cumplir la regla de higiene de mocks del modo TDD.
//
// RELABEL (sdd/cuadre-cobros-anteriores-y-neto-sesion, Option A del owner): el total
// que esta card mostraba como "TOTAL NETO SESIÓN" (facturado − NC) se renombra a
// "TOTAL FACTURADO NETO" para dejar espacio al NUEVO "TOTAL NETO SESIÓN" (ver
// CuadreTotalNetoSesion abajo).
//
// MODELO ACTUALIZADO (sdd/cuadre-propinas-y-ajustes-izquierda, decision del owner):
// Diferencial Cambiario y Negocio asume (absorcion) son FALTANTES de una factura ya
// facturada — describen COMO se resolvio el cobro de esa factura, no dinero nuevo.
// Viven SOLO en la Card derecha (pagos-resumen.tsx); YA NO se suman aqui ni se
// reciben como props en CuadreTotalNetoSesion. Propinas SI es dinero que entro via
// metodo de pago sin estar ligado a ninguna factura — ahora SI se suma aqui, y su
// fila vive en el bloque "Caja no facturada" (CuadreCajaNoFacturada, mas abajo).
import { render, screen, within } from '@testing-library/react'
import { CuadreDevolucionesNeto, CuadreTotalNetoSesion, CuadreCajaNoFacturada } from '../cuadre-devoluciones-neto'

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

// CuadreTotalNetoSesion — (sdd/cuadre-propinas-y-ajustes-izquierda, decision del owner):
// TOTAL NETO SESION = facturadoNeto + cobrosAnteriores + anticipo(SAF generado) + propinas.
// Diferencial/absorcion YA NO se suman aqui (son faltantes de una factura ya contada en
// facturadoNeto; su resolucion vive solo en la Card derecha). Propinas SI se suma: es
// dinero que entro via metodo de pago sin estar ligado a ninguna factura.
describe('CuadreTotalNetoSesion — incluye caja no facturada + propinas (sdd/cuadre-propinas-y-ajustes-izquierda)', () => {
  it('facturadoNeto 1950 + cobrosAnteriores 99.99 + SAF generado 1300 (sin propina) = 3349.99', () => {
    render(
      <CuadreTotalNetoSesion
        facturadoNetoUsd={1950}
        facturadoNetoBs={1950 * 42}
        cobrosAnterioresUsd={99.99}
        cobrosAnterioresBs={99.99 * 42}
        anticipoUsd={1300}
        anticipoBs={1300 * 42}
        propinaUsd={0}
        propinaBs={0}
      />
    )

    const label = screen.getByText('TOTAL NETO SESIÓN')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$3,349.99', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/Bs\.\s*140\.699,58/)).toBeInTheDocument()
  })

  it('con propina 50: se SUMA al total (3349.99 -> 3399.99) — propina es dinero real no facturado', () => {
    render(
      <CuadreTotalNetoSesion
        facturadoNetoUsd={1950}
        facturadoNetoBs={1950 * 42}
        cobrosAnterioresUsd={99.99}
        cobrosAnterioresBs={99.99 * 42}
        anticipoUsd={1300}
        anticipoBs={1300 * 42}
        propinaUsd={50}
        propinaBs={50 * 42}
      />
    )

    const label = screen.getByText('TOTAL NETO SESIÓN')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$3,399.99', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/Bs\.\s*142\.799,58/)).toBeInTheDocument()
  })

  it('triangulacion: propina con un valor DISTINTO (25) produce un total DISTINTO (3374.99) — prueba suma real, no hardcodeada', () => {
    render(
      <CuadreTotalNetoSesion
        facturadoNetoUsd={1950}
        facturadoNetoBs={1950 * 42}
        cobrosAnterioresUsd={99.99}
        cobrosAnterioresBs={99.99 * 42}
        anticipoUsd={1300}
        anticipoBs={1300 * 42}
        propinaUsd={25}
        propinaBs={25 * 42}
      />
    )

    const label = screen.getByText('TOTAL NETO SESIÓN')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$3,374.99', { exact: false })).toBeInTheDocument()
  })

  it('caso simple cash-only: sin cobros anteriores, sin SAF generado, sin propina -> Neto == Facturado Neto (500)', () => {
    render(
      <CuadreTotalNetoSesion
        facturadoNetoUsd={500}
        facturadoNetoBs={21000}
        cobrosAnterioresUsd={0}
        cobrosAnterioresBs={0}
        anticipoUsd={0}
        anticipoBs={0}
        propinaUsd={0}
        propinaBs={0}
      />
    )

    const label = screen.getByText('TOTAL NETO SESIÓN')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$500.00', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/Bs\.\s*21\.000,00/)).toBeInTheDocument()
  })
})

// CuadreCajaNoFacturada — bloque "Caja no facturada en esta sesión"
// (sdd/cuadre-propinas-y-ajustes-izquierda). Contiene Cobros Anteriores (CxC vieja),
// Cobros por Adelantado (SAF generado) y AHORA Propinas (movida aqui desde su posicion
// anterior, entre Facturado y NC). Diferencial Cambiario y Negocio asume NUNCA viven
// aqui — ese es exactamente el punto del cambio B: no aceptan props de ellos siquiera.
describe('CuadreCajaNoFacturada — bloque caja no facturada con Propinas movidas aqui (sdd/cuadre-propinas-y-ajustes-izquierda)', () => {
  it('renderiza "Cobros Anteriores (CxC)" siempre, con el monto formateado', () => {
    render(
      <CuadreCajaNoFacturada
        cobrosAnterioresUsd={99.99}
        cobrosAnterioresBs={99.99 * 42}
        anticipoUsd={0}
        anticipoBsNativo={0}
        propinaUsd={0}
        propinaBs={0}
      />
    )

    const label = screen.getByText('Cobros Anteriores (CxC)')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$99.99', { exact: false })).toBeInTheDocument()
  })

  it('oculta "Cobros por Adelantado" cuando anticipo es 0 en ambas monedas', () => {
    render(
      <CuadreCajaNoFacturada
        cobrosAnterioresUsd={0}
        cobrosAnterioresBs={0}
        anticipoUsd={0}
        anticipoBsNativo={0}
        propinaUsd={0}
        propinaBs={0}
      />
    )

    expect(screen.queryByText('Cobros por Adelantado')).not.toBeInTheDocument()
  })

  it('muestra "Cobros por Adelantado" con el monto cuando anticipoUsd > 0 — prueba gating real', () => {
    render(
      <CuadreCajaNoFacturada
        cobrosAnterioresUsd={0}
        cobrosAnterioresBs={0}
        anticipoUsd={1300}
        anticipoBsNativo={0}
        propinaUsd={0}
        propinaBs={0}
      />
    )

    const label = screen.getByText('Cobros por Adelantado')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$1,300.00', { exact: false })).toBeInTheDocument()
  })

  it('CAMBIO A: oculta "Propinas" cuando propina es 0 en ambas monedas', () => {
    render(
      <CuadreCajaNoFacturada
        cobrosAnterioresUsd={0}
        cobrosAnterioresBs={0}
        anticipoUsd={0}
        anticipoBsNativo={0}
        propinaUsd={0}
        propinaBs={0}
      />
    )

    expect(screen.queryByText('Propinas')).not.toBeInTheDocument()
  })

  it('CAMBIO A: muestra "Propinas" con su monto cuando propinaUsd > 0 — fila ahora vive en este bloque', () => {
    render(
      <CuadreCajaNoFacturada
        cobrosAnterioresUsd={0}
        cobrosAnterioresBs={0}
        anticipoUsd={0}
        anticipoBsNativo={0}
        propinaUsd={50}
        propinaBs={50 * 42}
      />
    )

    const label = screen.getByText('Propinas')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$50.00', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/Bs\.\s*2\.100,00/)).toBeInTheDocument()
  })

  it('triangulacion: Propinas con un monto DISTINTO (12.5) renderiza ESE monto, no uno hardcodeado', () => {
    render(
      <CuadreCajaNoFacturada
        cobrosAnterioresUsd={0}
        cobrosAnterioresBs={0}
        anticipoUsd={0}
        anticipoBsNativo={0}
        propinaUsd={12.5}
        propinaBs={12.5 * 42}
      />
    )

    const label = screen.getByText('Propinas')
    const row = label.parentElement as HTMLElement
    expect(within(row).getByText('$12.50', { exact: false })).toBeInTheDocument()
  })

  it('CAMBIO B: NUNCA renderiza "Diferencial Cambiario" ni "Negocio asume" — ese bloque no los acepta', () => {
    render(
      <CuadreCajaNoFacturada
        cobrosAnterioresUsd={99.99}
        cobrosAnterioresBs={99.99 * 42}
        anticipoUsd={1300}
        anticipoBsNativo={1300 * 42}
        propinaUsd={50}
        propinaBs={50 * 42}
      />
    )

    expect(screen.queryByText('Diferencial Cambiario')).not.toBeInTheDocument()
    expect(screen.queryByText('Negocio asume')).not.toBeInTheDocument()
  })
})
