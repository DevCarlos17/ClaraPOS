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
