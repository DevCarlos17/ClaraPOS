import type { FocusEvent } from 'react'
import { selectOnFocus, soloNumeroPositivo } from '../numeric-input'

describe('soloNumeroPositivo', () => {
  it('elimina letras dejando string vacio', () => {
    expect(soloNumeroPositivo('abc')).toBe('')
  })

  it('elimina el signo negativo de un entero', () => {
    expect(soloNumeroPositivo('-10')).toBe('10')
  })

  it('preserva un decimal valido', () => {
    expect(soloNumeroPositivo('3.5')).toBe('3.5')
  })

  it('descarta todo lo que sigue al segundo punto decimal', () => {
    expect(soloNumeroPositivo('3.5.2')).toBe('3.5')
  })

  it('un solo guion produce string vacio', () => {
    expect(soloNumeroPositivo('-')).toBe('')
  })

  it('elimina la notacion cientifica dejando solo los digitos', () => {
    expect(soloNumeroPositivo('12e5')).toBe('125')
  })

  it('espacios en blanco producen string vacio', () => {
    expect(soloNumeroPositivo('  ')).toBe('')
  })

  it('preserva un decimal positivo sin cambios', () => {
    expect(soloNumeroPositivo('0.27')).toBe('0.27')
  })

  it('elimina el signo negativo de un decimal', () => {
    expect(soloNumeroPositivo('-0.5')).toBe('0.5')
  })

  it('string vacio produce string vacio', () => {
    expect(soloNumeroPositivo('')).toBe('')
  })
})

describe('selectOnFocus', () => {
  it('difiere el select() con requestAnimationFrame (corre DESPUES del commit de React, no en el mismo tick)', () => {
    const selectSpy = vi.fn()
    const el = { select: selectSpy } as unknown as HTMLInputElement
    const event = { currentTarget: el } as unknown as FocusEvent<HTMLInputElement>

    let capturedCallback: (() => void) | undefined
    const rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        capturedCallback = () => cb(0)
        return 0
      })

    selectOnFocus(event)

    // No debe llamar select() sincronicamente: el valor mascarado viejo
    // todavia no fue reemplazado por el valor revelado en este tick.
    expect(selectSpy).not.toHaveBeenCalled()
    expect(rafSpy).toHaveBeenCalledTimes(1)

    capturedCallback?.()
    expect(selectSpy).toHaveBeenCalledTimes(1)

    rafSpy.mockRestore()
  })

  it('no lanza si currentTarget es null/undefined (guard defensivo)', () => {
    const event = { currentTarget: null } as unknown as FocusEvent<HTMLInputElement>
    expect(() => selectOnFocus(event)).not.toThrow()
  })
})
