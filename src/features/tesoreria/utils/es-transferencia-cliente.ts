/**
 * Determina si el preview de "facturas afectadas" (slice 1b-panel de
 * `preview-facturas-afectadas-reverso-tesoreria`) aplica para un movimiento
 * de tesoreria dado.
 *
 * Bug historico: `reverso-modal.tsx` comparaba
 * `movimiento?.doc_origen_tipo === 'PAGO'`, una condicion MUERTA — el codigo
 * real escribe `doc_origen_tipo` como `'PAGO_CXC'` o `'VENTA'`, nunca
 * `'PAGO'` a secas, por lo que el warning nunca se mostraba. El gate
 * correcto (y el unico que la spec define, Requirement "Aplicabilidad del
 * preview basada en el origen real") es el campo `origen` del movimiento,
 * sin depender de `doc_origen_tipo`.
 */
export function esTransferenciaCliente(origen: string | null | undefined): boolean {
  return origen === 'TRANSFERENCIA_CLIENTE'
}
