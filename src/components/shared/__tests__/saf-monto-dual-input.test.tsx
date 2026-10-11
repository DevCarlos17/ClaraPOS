import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SafMontoDualInput } from '../saf-monto-dual-input'
import type { SafMontoEstado } from '@/lib/saf-monto'

/**
 * PR-A1 (sdd/saf-snapshot-y-trazabilidad/design-b22-dual-input, #5267):
 * componente presentacional compartido — mirror del patron de
 * `refund-tesoreria-form.tsx` (input libre, nunca rechaza el tecleo;
 * `aria-invalid` + mensaje `<p>` + `onEstadoChange` lift-up al llamador).
 * El padre es la fuente de verdad del estado (controlado) — este harness
 * reproduce ese contrato con `useState` local, igual que lo haria
 * `cobro-modal.tsx`/`abono-global-modal.tsx`/`pago-factura-modal.tsx`.
 */
function Harness(props: {
  disponibleUsd: string
  totalUsd: string
  tasa: string
  onEstadoChange?: (estado: SafMontoEstado) => void
  onUsdChange?: (val: string) => void
}) {
  const [usd, setUsd] = useState('')
  const [bs, setBs] = useState('')
  const handleUsdChange = (val: string) => {
    props.onUsdChange?.(val)
    setUsd(val)
  }
  return (
    <SafMontoDualInput
      montoUsdStr={usd}
      montoBsStr={bs}
      disponibleUsd={props.disponibleUsd}
      totalUsd={props.totalUsd}
      tasa={props.tasa}
      onUsdChange={handleUsdChange}
      onBsChange={setBs}
      onEstadoChange={props.onEstadoChange}
    />
  )
}

describe('SafMontoDualInput (PR-A1, reemplaza el clamp de capSafMontoUsd en los 3 modales)', () => {
  it('tipear en el input USD recalcula el input Bs companero (tasa 40)', async () => {
    const user = userEvent.setup()
    render(<Harness disponibleUsd="100.00" totalUsd="100.00" tasa="40" />)

    await user.type(screen.getByLabelText(/Monto SAF \(USD\)/i), '10')

    expect(screen.getByLabelText(/Monto SAF \(Bs\)/i)).toHaveValue('400.00')
  })

  it('tipear en el input Bs recalcula el input USD companero (tasa 40)', async () => {
    const user = userEvent.setup()
    render(<Harness disponibleUsd="100.00" totalUsd="100.00" tasa="40" />)

    await user.type(screen.getByLabelText(/Monto SAF \(Bs\)/i), '400')

    // El USD derivado es el campo canonico/persistido (CLAUDE.md #10): se
    // guarda con precision completa, sin mascara de 2dp — "10", no
    // "10.00" (decimal.js no rellena ceros en una division exacta).
    expect(screen.getByLabelText(/Monto SAF \(USD\)/i)).toHaveValue('10')
  })

  it('el campo Bs que el usuario esta tipeando NUNCA se reformatea (queda exactamente lo tecleado, sin padding de ceros)', async () => {
    const user = userEvent.setup()
    render(<Harness disponibleUsd="100.00" totalUsd="100.00" tasa="40" />)

    await user.type(screen.getByLabelText(/Monto SAF \(Bs\)/i), '10.5')

    expect(screen.getByLabelText(/Monto SAF \(Bs\)/i)).toHaveValue('10.5')
  })

  it('monto que excede el disponible (pero no el total) marca aria-invalid y muestra el mensaje de disponible, no el de total', async () => {
    const user = userEvent.setup()
    render(<Harness disponibleUsd="30.00" totalUsd="100.00" tasa="40" />)

    await user.type(screen.getByLabelText(/Monto SAF \(USD\)/i), '50')

    expect(screen.getByLabelText(/Monto SAF \(USD\)/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/Monto SAF \(Bs\)/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/excede el saldo a favor disponible/i)).toBeInTheDocument()
    expect(screen.queryByText(/excede el total a pagar/i)).not.toBeInTheDocument()
  })

  it('monto que excede el total (pero no el disponible) marca aria-invalid y muestra el mensaje de total, no el de disponible', async () => {
    const user = userEvent.setup()
    render(<Harness disponibleUsd="100.00" totalUsd="30.00" tasa="40" />)

    await user.type(screen.getByLabelText(/Monto SAF \(USD\)/i), '50')

    expect(screen.getByLabelText(/Monto SAF \(USD\)/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/excede el total a pagar/i)).toBeInTheDocument()
    expect(screen.queryByText(/excede el saldo a favor disponible/i)).not.toBeInTheDocument()
  })

  it('boundary: monto === disponible (100% exacto, con total holgado) NO dispara aria-invalid ni mensaje (fix PR11, SAF-only)', async () => {
    const user = userEvent.setup()
    render(<Harness disponibleUsd="30.00" totalUsd="100.00" tasa="40" />)

    await user.type(screen.getByLabelText(/Monto SAF \(USD\)/i), '30')

    expect(screen.getByLabelText(/Monto SAF \(USD\)/i)).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/excede el saldo a favor disponible/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/excede el total a pagar/i)).not.toBeInTheDocument()
  })

  it('notifica el estado al padre via onEstadoChange (lift-up, mirror onExcedeTopeChange de refund-tesoreria-form)', async () => {
    const user = userEvent.setup()
    const onEstadoChange = vi.fn()
    render(<Harness disponibleUsd="30.00" totalUsd="100.00" tasa="40" onEstadoChange={onEstadoChange} />)

    await user.type(screen.getByLabelText(/Monto SAF \(USD\)/i), '50')

    expect(onEstadoChange).toHaveBeenCalledWith('excedeDisponible')
  })

  it('tipear en el input Bs deriva el USD canonico con precision completa, SIN redondear a 2dp (regla CLAUDE.md #10: redondear solo al final de la cadena, nunca en el estado persistido)', async () => {
    const user = userEvent.setup()
    render(<Harness disponibleUsd="100.00" totalUsd="100.00" tasa="500" />)

    // Bs 754 @ tasa 500 = 1.508 USD exacto (no termina en 2dp) — si el
    // estado canonico se enmascara a 2dp antes de guardarse, se pierde
    // 0.002 USD de precision real que luego se persistiria truncado.
    await user.type(screen.getByLabelText(/Monto SAF \(Bs\)/i), '754')

    expect(screen.getByLabelText(/Monto SAF \(USD\)/i)).toHaveValue('1.508')
  })

  it('cambiar la prop tasa recalcula el Bs companero sin tocar el USD canonico (bugfix engram #5296, bug B)', async () => {
    const user = userEvent.setup()
    const onUsdChange = vi.fn()
    const { rerender } = render(
      <Harness disponibleUsd="100.00" totalUsd="100.00" tasa="500" onUsdChange={onUsdChange} />
    )

    await user.type(screen.getByLabelText(/Monto SAF \(USD\)/i), '10')
    expect(screen.getByLabelText(/Monto SAF \(Bs\)/i)).toHaveValue('5000.00')

    onUsdChange.mockClear()
    // El padre cambia la tasa (ej. modal recarga tasa vigente) — el USD
    // tecleado por el usuario NUNCA debe moverse, solo el companero Bs.
    rerender(<Harness disponibleUsd="100.00" totalUsd="100.00" tasa="600" onUsdChange={onUsdChange} />)

    expect(screen.getByLabelText(/Monto SAF \(Bs\)/i)).toHaveValue('6000.00')
    expect(screen.getByLabelText(/Monto SAF \(USD\)/i)).toHaveValue('10')
    expect(onUsdChange).not.toHaveBeenCalled()
  })

  it('cambiar la tasa a 0 (guard) no recalcula el Bs companero ni toca el USD (bugfix engram #5296, bug B — triangulacion)', async () => {
    const user = userEvent.setup()
    const onUsdChange = vi.fn()
    const { rerender } = render(
      <Harness disponibleUsd="100.00" totalUsd="100.00" tasa="500" onUsdChange={onUsdChange} />
    )

    await user.type(screen.getByLabelText(/Monto SAF \(USD\)/i), '10')
    expect(screen.getByLabelText(/Monto SAF \(Bs\)/i)).toHaveValue('5000.00')

    onUsdChange.mockClear()
    rerender(<Harness disponibleUsd="100.00" totalUsd="100.00" tasa="0" onUsdChange={onUsdChange} />)

    // Guard: tasa<=0 no debe producir NaN/0 escrito sobre el Bs ya
    // calculado, ni mover el USD canonico.
    expect(screen.getByLabelText(/Monto SAF \(Bs\)/i)).toHaveValue('5000.00')
    expect(screen.getByLabelText(/Monto SAF \(USD\)/i)).toHaveValue('10')
    expect(onUsdChange).not.toHaveBeenCalled()
  })
})
