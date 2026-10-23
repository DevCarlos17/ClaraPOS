import { render, screen } from '@testing-library/react'
import { MovimientosTable, type MovimientoTableRow } from '../movimientos-table'

/**
 * Cambio `desconciliar-reverso-historico-tesoreria`: primera cobertura de
 * `movimientos-table.tsx`. Cubre el gate de visibilidad del nuevo boton
 * "Desconciliar" en `HistoricoRow` (Phase 1/2 de tasks.md) y fija por
 * primera vez en codigo el comportamiento existente de "Rechazar" en
 * `PendienteRow` (regresion, Phase 1.6).
 */

function buildRow(overrides: Partial<MovimientoTableRow> = {}): MovimientoTableRow {
  return {
    id: 'mov-1',
    tipo: 'INGRESO',
    origen: 'TRANSFERENCIA_CLIENTE',
    referencia: 'REF-001',
    descripcion: 'Cobro cliente',
    monto: '100.00',
    saldo_nuevo: '100.00',
    fecha: '2026-10-20',
    created_at: '2026-10-20T10:00:00Z',
    validado: 0,
    reversado: 0,
    ...overrides,
  }
}

describe('MovimientosTable — Historico — boton Desconciliar', () => {
  it('se renderiza cuando validado=1, reversado=0 y origen=TRANSFERENCIA_CLIENTE', () => {
    const onReversar = vi.fn()
    const row = buildRow({ validado: 1, reversado: 0, origen: 'TRANSFERENCIA_CLIENTE', onReversar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.getByRole('button', { name: 'Desconciliar' })).toBeInTheDocument()
  })

  it('NO se renderiza cuando validado=0 (va por "Rechazar" en Pendientes)', () => {
    const onReversar = vi.fn()
    const row = buildRow({ validado: 0, reversado: 0, origen: 'TRANSFERENCIA_CLIENTE', onReversar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.queryByRole('button', { name: 'Desconciliar' })).not.toBeInTheDocument()
  })

  it('MANDATORIO: NO se renderiza cuando reversado=1 — guard anti reverso-de-reverso', () => {
    const onReversar = vi.fn()
    const row = buildRow({ validado: 1, reversado: 1, origen: 'TRANSFERENCIA_CLIENTE', onReversar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.queryByRole('button', { name: 'Desconciliar' })).not.toBeInTheDocument()
  })

  it('NO se renderiza cuando el origen no es TRANSFERENCIA_CLIENTE', () => {
    const onReversar = vi.fn()
    const row = buildRow({ validado: 1, reversado: 0, origen: 'PAGO_PROVEEDOR', onReversar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.queryByRole('button', { name: 'Desconciliar' })).not.toBeInTheDocument()
  })

  it('al hacer click invoca onReversar con el id del movimiento correcto', async () => {
    const onReversar = vi.fn()
    const row = buildRow({ id: 'mov-xyz', validado: 1, reversado: 0, origen: 'TRANSFERENCIA_CLIENTE', onReversar })

    const { default: userEvent } = await import('@testing-library/user-event')
    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    await userEvent.click(screen.getByRole('button', { name: 'Desconciliar' }))

    expect(onReversar).toHaveBeenCalledTimes(1)
    expect(onReversar).toHaveBeenCalledWith('mov-xyz')
  })
})

describe('MovimientosTable — Pendientes — boton Rechazar (regresion)', () => {
  it('se mantiene visible con el guard actual !isReversado, sin importar validado', () => {
    const onReversar = vi.fn()
    const onValidar = vi.fn()
    const rowPendiente = buildRow({ id: 'mov-a', validado: 0, reversado: 0, onReversar, onValidar })
    const rowValidado = buildRow({ id: 'mov-b', validado: 1, reversado: 0, onReversar, onValidar })

    render(<MovimientosTable movimientos={[rowPendiente, rowValidado]} modo="pendiente" />)

    expect(screen.getAllByRole('button', { name: 'Rechazar' })).toHaveLength(2)
  })

  it('NO se muestra cuando reversado=1', () => {
    const onReversar = vi.fn()
    const row = buildRow({ validado: 1, reversado: 1, onReversar })

    render(<MovimientosTable movimientos={[row]} modo="pendiente" />)

    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument()
  })
})
