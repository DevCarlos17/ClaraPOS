import { render, screen } from '@testing-library/react'
import { FacturaDetallePanel } from '../factura-detalle-panel'
import { buildReciboData, type ReciboData } from '../../utils/factura-export'

function baseRecibo(overrides: Partial<Parameters<typeof buildReciboData>[0]> = {}): ReciboData {
  return buildReciboData({
    nroFactura: 'C01-000001',
    fecha: '2026-01-01T10:00:00.000-04:00',
    emisor: { nombre: 'ClaraPOS Estetica C.A.', rif: 'J-12345678-9', direccion: null },
    cliente: { nombre: 'Maria Perez', identificacion: 'V-12345678', direccion: null },
    lineas: [
      {
        codigo: 'P001',
        nombre: 'Botox 50U',
        cantidad: '2',
        precioUnitarioUsd: '10.00',
        tipoImpuesto: 'Gravable',
        impuestoPct: 16,
      },
    ],
    tasa: 40,
    igtfUsd: null,
    pagos: [{ metodo_cobro_id: 'm1', metodo_nombre: 'Efectivo USD', moneda: 'USD', monto: 23.2 }],
    discrepancy: null,
    saldoPendUsd: 0,
    ...overrides,
  })
}

describe('FacturaDetallePanel (Spec notas-credito-pos: Panel de detalle fiscal de la factura seleccionada)', () => {
  it('sin recibo (null): el panel no muestra datos de factura', () => {
    render(<FacturaDetallePanel recibo={null} afectoCxc={null} />)

    expect(screen.queryByText('C01-000001')).not.toBeInTheDocument()
    expect(screen.queryByText('Botox 50U')).not.toBeInTheDocument()
  })

  it('con recibo: muestra articulos (cantidad, precio Bs/USD), subtotal, base imponible, IVA por alicuota y total', () => {
    render(<FacturaDetallePanel recibo={baseRecibo()} afectoCxc={null} />)

    expect(screen.getByText('Botox 50U')).toBeInTheDocument()
    expect(screen.getByText('$10.00')).toBeInTheDocument() // precio unitario USD
    expect(screen.getByText('Bs. 400,00')).toBeInTheDocument() // precio unitario Bs (10 * 40)
    expect(screen.getByText('Base Imponible')).toBeInTheDocument()
    expect(screen.getByText('IVA 16%')).toBeInTheDocument()
    expect(screen.getByText('TOTAL FACTURA')).toBeInTheDocument()
  })

  it('linea exenta: muestra el desglose de Monto Exento separado de la Base Imponible', () => {
    const recibo = baseRecibo({
      lineas: [
        {
          codigo: 'P002',
          nombre: 'Consulta',
          cantidad: '1',
          precioUnitarioUsd: '15.00',
          tipoImpuesto: 'Exento',
          impuestoPct: 0,
        },
      ],
    })

    render(<FacturaDetallePanel recibo={recibo} afectoCxc={null} />)

    expect(screen.getByText('Monto Exento')).toBeInTheDocument()
    expect(screen.queryByText('Base Imponible')).not.toBeInTheDocument()
  })

  it('factura con IGTF aplicado: muestra el monto de IGTF calculado por buildReciboData', () => {
    const recibo = baseRecibo({ igtfUsd: 0.6 })

    render(<FacturaDetallePanel recibo={recibo} afectoCxc={null} />)

    expect(screen.getByText('IGTF')).toBeInTheDocument()
    expect(screen.getByText('TOTAL + IGTF')).toBeInTheDocument()
  })

  it('sin IGTF: no muestra fila de IGTF', () => {
    render(<FacturaDetallePanel recibo={baseRecibo()} afectoCxc={null} />)

    expect(screen.queryByText('IGTF')).not.toBeInTheDocument()
  })

  it('muestra el desglose de metodos de pago', () => {
    render(<FacturaDetallePanel recibo={baseRecibo()} afectoCxc={null} />)

    expect(screen.getByText('Efectivo USD')).toBeInTheDocument()
  })

  it('afectoCxc=true: indica que la factura afecto cuentas por cobrar', () => {
    render(<FacturaDetallePanel recibo={baseRecibo()} afectoCxc={true} />)

    expect(screen.getByText(/Afect(o|ó) cuentas por cobrar/i)).toBeInTheDocument()
  })

  it('afectoCxc=false: indica que la factura NO afecto cuentas por cobrar', () => {
    render(<FacturaDetallePanel recibo={baseRecibo()} afectoCxc={false} />)

    expect(screen.getByText(/No afect(o|ó) cuentas por cobrar/i)).toBeInTheDocument()
  })
})

// ─── F1 QA fix (Slice 5a): historial de reversos additivo — el panel SIEMPRE
// muestra la factura original completa y, si tiene NC(s) aplicadas, ADEMAS
// el historial de lo reversado (nunca reemplaza la vista original). ────

describe('FacturaDetallePanel — F1 QA fix (historial de reversos additivo, junto al detalle original)', () => {
  it('sin reversos (prop omitida o vacia): NO muestra la seccion de notas de credito aplicadas', () => {
    render(<FacturaDetallePanel recibo={baseRecibo()} afectoCxc={null} />)

    expect(screen.queryByText(/Notas de credito aplicadas/i)).not.toBeInTheDocument()
  })

  it('con reversos: el detalle ORIGINAL sigue visible Y ademas se muestra cada NC con su numero/tipo y las lineas devueltas', () => {
    render(
      <FacturaDetallePanel
        recibo={baseRecibo()}
        afectoCxc={null}
        reversos={[
          {
            notaCreditoId: 'nc-1',
            nroNcr: 'NCR-000001',
            tipo: 'PARCIAL',
            fecha: '2026-01-02T00:00:00Z',
            lineas: [{ descripcion: 'Botox 50U', cantidad: '1.000' }],
          },
        ]}
      />
    )

    // Original sigue completo (aditivo, no reemplazado).
    expect(screen.getAllByText('Botox 50U').length).toBeGreaterThan(0)
    // Historial de reverso agregado.
    expect(screen.getByText(/Notas de credito aplicadas/i)).toBeInTheDocument()
    expect(screen.getByText('NCR-000001')).toBeInTheDocument()
    expect(screen.getByText(/1\.000/)).toBeInTheDocument()
  })

  it('multiples NCs aplicadas: cada una se muestra en su propia entrada', () => {
    render(
      <FacturaDetallePanel
        recibo={baseRecibo()}
        afectoCxc={null}
        reversos={[
          {
            notaCreditoId: 'nc-1',
            nroNcr: 'NCR-000001',
            tipo: 'PARCIAL',
            fecha: '2026-01-02T00:00:00Z',
            lineas: [{ descripcion: 'Botox 50U', cantidad: '1.000' }],
          },
          {
            notaCreditoId: 'nc-2',
            nroNcr: 'NCR-000002',
            tipo: 'TOTAL',
            fecha: '2026-01-03T00:00:00Z',
            lineas: [{ descripcion: 'Consulta', cantidad: '1.000' }],
          },
        ]}
      />
    )

    expect(screen.getByText('NCR-000001')).toBeInTheDocument()
    expect(screen.getByText('NCR-000002')).toBeInTheDocument()
  })
})
