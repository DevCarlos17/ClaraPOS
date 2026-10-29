import { render, screen } from '@testing-library/react'
import { MovimientosTable, type MovimientoTableRow } from '../movimientos-table'

/**
 * Cambio `split-desconciliar-reversar-historico`: separa "Desconciliar"
 * (flip de estado puro, origin-agnostico, via `onDesconciliar`) de
 * "Reversar" (el reverso real que abre `ReversoModal`, antes mal etiquetado
 * "Desconciliar", via `onReversar`, gate restringido a
 * `TRANSFERENCIA_CLIENTE`). Ambos botones coexisten de forma independiente
 * en `HistoricoRow`. Se mantiene la regresion de "Rechazar" en
 * `PendienteRow` (Phase 1.6 original).
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

describe('MovimientosTable — Historico — boton Reversar (antes "Desconciliar")', () => {
  it('se renderiza cuando validado=1, reversado=0 y origen=TRANSFERENCIA_CLIENTE', () => {
    const onReversar = vi.fn()
    const row = buildRow({ validado: 1, reversado: 0, origen: 'TRANSFERENCIA_CLIENTE', onReversar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.getByRole('button', { name: 'Reversar' })).toBeInTheDocument()
  })

  it('NO se renderiza cuando validado=0 (va por "Rechazar" en Pendientes)', () => {
    const onReversar = vi.fn()
    const row = buildRow({ validado: 0, reversado: 0, origen: 'TRANSFERENCIA_CLIENTE', onReversar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.queryByRole('button', { name: 'Reversar' })).not.toBeInTheDocument()
  })

  it('MANDATORIO: NO se renderiza cuando reversado=1 — guard anti reverso-de-reverso', () => {
    const onReversar = vi.fn()
    const row = buildRow({ validado: 1, reversado: 1, origen: 'TRANSFERENCIA_CLIENTE', onReversar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.queryByRole('button', { name: 'Reversar' })).not.toBeInTheDocument()
  })

  it('NO se renderiza cuando el origen no es TRANSFERENCIA_CLIENTE', () => {
    const onReversar = vi.fn()
    const row = buildRow({ validado: 1, reversado: 0, origen: 'PAGO_PROVEEDOR', onReversar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.queryByRole('button', { name: 'Reversar' })).not.toBeInTheDocument()
  })

  it('NO se renderiza para origen TRASPASO (el reverso real solo aplica a TRANSFERENCIA_CLIENTE)', () => {
    const onReversar = vi.fn()
    const row = buildRow({ validado: 1, reversado: 0, origen: 'TRASPASO', onReversar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.queryByRole('button', { name: 'Reversar' })).not.toBeInTheDocument()
  })

  it('al hacer click invoca onReversar con el id del movimiento correcto', async () => {
    const onReversar = vi.fn()
    const row = buildRow({ id: 'mov-xyz', validado: 1, reversado: 0, origen: 'TRANSFERENCIA_CLIENTE', onReversar })

    const { default: userEvent } = await import('@testing-library/user-event')
    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    await userEvent.click(screen.getByRole('button', { name: 'Reversar' }))

    expect(onReversar).toHaveBeenCalledTimes(1)
    expect(onReversar).toHaveBeenCalledWith('mov-xyz')
  })
})

describe('MovimientosTable — Historico — boton Desconciliar (nuevo, flip de estado puro)', () => {
  it('se renderiza con CUALQUIER origen (incl. TRASPASO) cuando validado=1, reversado=0', () => {
    const onDesconciliar = vi.fn()
    const row = buildRow({ validado: 1, reversado: 0, origen: 'TRASPASO', onDesconciliar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.getByRole('button', { name: 'Desconciliar' })).toBeInTheDocument()
  })

  it('se renderiza tambien para TRANSFERENCIA_CLIENTE (coexiste con Reversar)', () => {
    const onDesconciliar = vi.fn()
    const onReversar = vi.fn()
    const row = buildRow({
      validado: 1,
      reversado: 0,
      origen: 'TRANSFERENCIA_CLIENTE',
      onDesconciliar,
      onReversar,
    })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.getByRole('button', { name: 'Desconciliar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reversar' })).toBeInTheDocument()
  })

  it('NO se renderiza cuando validado=0', () => {
    const onDesconciliar = vi.fn()
    const row = buildRow({ validado: 0, reversado: 0, origen: 'PAGO_PROVEEDOR', onDesconciliar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.queryByRole('button', { name: 'Desconciliar' })).not.toBeInTheDocument()
  })

  it('MANDATORIO: NO se renderiza cuando reversado=1 — guard anti reverso-de-reverso', () => {
    const onDesconciliar = vi.fn()
    const row = buildRow({ validado: 1, reversado: 1, origen: 'TRASPASO', onDesconciliar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.queryByRole('button', { name: 'Desconciliar' })).not.toBeInTheDocument()
  })

  it('NUEVO (terminal, change reverso-terminal-tesoreria): NO se renderiza cuando origen=REVERSO, aunque validado=1 y reversado=0', () => {
    const onDesconciliar = vi.fn()
    const row = buildRow({ validado: 1, reversado: 0, origen: 'REVERSO', onDesconciliar })

    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    expect(screen.queryByRole('button', { name: 'Desconciliar' })).not.toBeInTheDocument()
  })

  it('al hacer click invoca onDesconciliar con el id correcto, SIN tocar onReversar', async () => {
    const onDesconciliar = vi.fn()
    const onReversar = vi.fn()
    const row = buildRow({
      id: 'mov-xyz',
      validado: 1,
      reversado: 0,
      origen: 'PAGO_PROVEEDOR',
      onDesconciliar,
      onReversar,
    })

    const { default: userEvent } = await import('@testing-library/user-event')
    render(<MovimientosTable movimientos={[row]} modo="historico" />)

    await userEvent.click(screen.getByRole('button', { name: 'Desconciliar' }))

    expect(onDesconciliar).toHaveBeenCalledTimes(1)
    expect(onDesconciliar).toHaveBeenCalledWith('mov-xyz')
    expect(onReversar).not.toHaveBeenCalled()
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

  it('NUEVO (defensa en profundidad, change reverso-terminal-tesoreria): NO se muestra cuando origen=REVERSO, sin importar validado', () => {
    const onReversar = vi.fn()
    const rowPendiente = buildRow({ id: 'mov-rev-0', validado: 0, reversado: 0, origen: 'REVERSO', onReversar })
    const rowValidado = buildRow({ id: 'mov-rev-1', validado: 1, reversado: 0, origen: 'REVERSO', onReversar })

    render(<MovimientosTable movimientos={[rowPendiente, rowValidado]} modo="pendiente" />)

    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument()
  })
})

describe('MovimientosTable — Pendientes — boton Conciliar (regresion: mecanismo legado reversarMovBancario)', () => {
  it('REGRESSION GUARD: SIGUE mostrando Conciliar para origen=REVERSO con validado=0 (reverso legado de GASTO/PAGO_PROVEEDOR/MANUAL/TRASPASO via reversarMovBancario, gate Conciliar permanece origin-agnostic)', () => {
    const onValidar = vi.fn()
    const row = buildRow({ validado: 0, reversado: 0, origen: 'REVERSO', onValidar })

    render(<MovimientosTable movimientos={[row]} modo="pendiente" />)

    expect(screen.getByRole('button', { name: 'Conciliar' })).toBeInTheDocument()
  })
})
