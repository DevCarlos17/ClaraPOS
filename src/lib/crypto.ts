/**
 * Calcula SHA-256(pin + empresaId) usando Web Crypto API (disponible en todos los browsers modernos).
 * El empresa_id actua como salt para evitar ataques de precomputo entre empresas.
 */
export async function hashPin(pin: string, empresaId: string): Promise<string> {
  const data = new TextEncoder().encode(pin + empresaId)
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
