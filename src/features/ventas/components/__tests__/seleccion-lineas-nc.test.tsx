import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SeleccionLineasNc, type LineaSeleccionNc } from '../seleccion-lineas-nc'

const facturaHistorica = { total_usd: 100, total_bs: 4000, tasa: 40 }

function lineaGravable(overrides: Partial<LineaSeleccionNc> = {}): LineaSeleccionNc {
  return {
    venta_det_id: 'vd-1',
    producto_nombre: 'Botox 50U',
    producto_codigo: 'P001',
    cantidadFacturada: 5,
    esDecimal: false,
    precioUnitarioUsd: 10,
    tipoImpuesto: 'Gravable',
    impuestoPct: 16,
    ...overrides,
  }
}

describe('SeleccionLineasNc (Design §Decision 7, Spec notas-credito-pos: Selección TOTAL/PARCIAL)', () => {
  it('boton Confirmar deshabilitado mientras todas las cantidades esten en 0', () => {
    render(<SeleccionLineasNc lineas={[lineaGravable()]} factura={facturaHistorica} onConfirm={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled()
  })

  it('al ingresar una cantidad valida > 0 habilita Confirmar; onConfirm recibe la linea mapeada al contrato de crearNotaCredito', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<SeleccionLineasNc lineas={[lineaGravable()]} factura={facturaHistorica} onConfirm={onConfirm} />)

    await user.type(screen.getByRole('spinbutton'), '2')

    const boton = screen.getByRole('button', { name: /Confirmar/i })
    expect(boton).not.toBeDisabled()

    await user.click(boton)

    expect(onConfirm).toHaveBeenCalledWith([{ venta_det_id: 'vd-1', cantidadDevolver: '2.000' }])
  })

  it('linea con esDecimal=false: el boton "+" incrementa el stepper exactamente en 1 (paso entero)', async () => {
    const user = userEvent.setup()
    render(
      <SeleccionLineasNc lineas={[lineaGravable({ esDecimal: false })]} factura={facturaHistorica} onConfirm={vi.fn()} />
    )

    await user.click(screen.getByRole('button', { name: /Incrementar cantidad/i }))

    expect(screen.getByRole('spinbutton')).toHaveValue(1)
  })

  it('linea con esDecimal=true: el boton "+" incrementa el stepper exactamente en 0.001 (paso decimal)', async () => {
    const user = userEvent.setup()
    render(
      <SeleccionLineasNc
        lineas={[lineaGravable({ esDecimal: true, cantidadFacturada: 2 })]}
        factura={facturaHistorica}
        onConfirm={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /Incrementar cantidad/i }))

    expect(screen.getByRole('spinbutton')).toHaveValue(0.001)
  })

  it('linea con esDecimal=false: bloquea la tecla decimal (.) en el input de cantidad', async () => {
    const user = userEvent.setup()
    render(
      <SeleccionLineasNc
        lineas={[lineaGravable({ esDecimal: false, cantidadFacturada: 20 })]}
        factura={facturaHistorica}
        onConfirm={vi.fn()}
      />
    )

    const input = screen.getByRole('spinbutton')
    await user.type(input, '1.5')

    // El punto fue bloqueado por el guard de es_decimal=0 -> solo quedan los digitos "1" y "5" = 15
    expect(input).toHaveValue(15)
  })

  it('cantidad no puede exceder lo facturado: el input clampa al maximo, Confirmar permanece habilitado con el valor clampado', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <SeleccionLineasNc
        lineas={[lineaGravable({ cantidadFacturada: 3, esDecimal: false })]}
        factura={facturaHistorica}
        onConfirm={onConfirm}
      />
    )

    await user.type(screen.getByRole('spinbutton'), '9')

    expect(screen.getByRole('spinbutton')).toHaveValue(3)

    await user.click(screen.getByRole('button', { name: /Confirmar/i }))

    expect(onConfirm).toHaveBeenCalledWith([{ venta_det_id: 'vd-1', cantidadDevolver: '3.000' }])
  })

  it('muestra el preview de monto en Bs derivado de la tasa historica de la factura (nunca la tasa vigente)', async () => {
    const user = userEvent.setup()
    render(
      <SeleccionLineasNc
        lineas={[lineaGravable({ precioUnitarioUsd: 10, impuestoPct: 16, tipoImpuesto: 'Gravable' })]}
        factura={facturaHistorica}
        onConfirm={vi.fn()}
      />
    )

    await user.type(screen.getByRole('spinbutton'), '1')

    // 10 USD + 16% IVA = 11.60 USD a tasa historica 40 -> 464 Bs.
    expect(screen.getByText(/11[.,]60/)).toBeInTheDocument()
    expect(screen.getByText(/464/)).toBeInTheDocument()
  })
})
