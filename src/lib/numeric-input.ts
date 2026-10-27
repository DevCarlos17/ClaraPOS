import type { FocusEvent } from 'react'

/**
 * Filtra el input de un numero positivo (entero o decimal) en tiempo real.
 *
 * Motivacion: los inputs de precio/costo/margen del form de producto son
 * `type="number"`, pero eso NO bloquea de forma confiable el signo negativo,
 * notacion cientifica ("e"), letras ni el pegado ("paste") de texto invalido
 * en todos los navegadores. En vez de dejar que el usuario tipee "-10" y
 * corregirlo reactivamente despues (confuso), esta funcion se aplica en el
 * `onChange`/`onBlur` ANTES de `parseFloat`/`setState` para que el caracter
 * invalido nunca llegue a pisar el estado.
 *
 * Reglas:
 * - Se descarta cualquier caracter que no sea digito o punto (letras, signo
 *   "-", espacios, "e" de notacion cientifica, etc).
 * - Solo se conserva el PRIMER punto decimal encontrado; todo lo que venga
 *   despues del segundo punto (incluyendo mas digitos) se descarta, no se
 *   reconcatena — evita ambiguedad sobre "donde" cae el decimal real.
 *
 * Ejemplos:
 *   "abc"    → ""
 *   "-10"    → "10"
 *   "3.5"    → "3.5"
 *   "3.5.2"  → "3.5"
 *   "-"      → ""
 *   "12e5"   → "125"
 *   "0.27"   → "0.27"
 *   "-0.5"   → "0.5"
 */
export function soloNumeroPositivo(val: string): string {
  const cleaned = val.replace(/[^\d.]/g, '')
  if (cleaned === '') return ''
  const [intPart, decPart] = cleaned.split('.', 2)
  return decPart === undefined ? intPart : `${intPart}.${decPart}`
}

/**
 * Selecciona todo el contenido de un input numerico al enfocarlo, para que el
 * primer caracter tipeado reemplace el valor anterior en vez de insertarse en
 * medio de el.
 *
 * Motivacion: varios inputs de precio/costo del form de producto revelan su
 * precision completa (hasta 8 decimales) en el propio `onFocus` via
 * `setState(toFullDisplay(ref.current))` (ver `decimal-display-mask.ts`). Ese
 * `setState` no actualiza `e.target.value` de forma sincronica — React recien
 * commitea el nuevo render DESPUES de que el handler de `onFocus` retorna. Si
 * `select()` se llamara en el mismo tick, seleccionaria el string mascarado
 * (2 decimales) viejo, no el de precision completa recien revelado.
 *
 * Por eso el `.select()` se difiere con `requestAnimationFrame`, que corre
 * despues del commit sincronico de React para un evento discreto como focus,
 * garantizando que `el.value` ya tenga el valor revelado al momento de
 * seleccionar. Debe invocarse como la ULTIMA linea de cada `onFocus` (despues
 * de cualquier reveal de mascara), nunca antes.
 *
 * El deselect nativo del navegador en un segundo click (click-drag dentro del
 * input) no se toca: esta funcion solo actua en el evento `focus`.
 */
export function selectOnFocus(e: FocusEvent<HTMLInputElement>): void {
  const el = e.currentTarget
  if (!el) return
  requestAnimationFrame(() => el.select())
}
