import { useEffect, useRef } from 'react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { ejecutarInventarioStockBackfillSiNecesario } from '../lib/inventario-stock-backfill'
import {
  useInventarioStockBackfillGateStore,
  useInventarioStockBackfillListo,
} from '../stores/inventario-stock-backfill-gate-store'

/**
 * Dispara, una unica vez por dispositivo, el backfill de `inventario_stock`
 * desde el kardex historico (Slice 2a — fix CRITICAL: sin esto, un producto
 * legado con stock real en `productos.stock` pero SIN fila propia en
 * `inventario_stock` para el deposito de la caja activa se leeria como 0 en
 * el read-path deposit-scoped del POS y quedaria oculto/bloqueado
 * indebidamente).
 *
 * DONDE SE MONTA: `_app/route.tsx` (`AppLayout`) — el punto mas alto del
 * arbol autenticado. Justificacion:
 *   - `beforeLoad` de esa ruta ya garantiza `connector.currentSession`
 *     existe (redirige a `/login` si no), asi que este hook solo corre para
 *     usuarios autenticados.
 *   - `useCurrentUser()` entrega `empresa_id` de inmediato via el fallback a
 *     `user_metadata` del JWT aunque PowerSync todavia no haya sincronizado
 *     la fila local de `usuarios` — no hace falta esperar un round-trip
 *     adicional.
 *   - PowerSync/SQLite local ya fue inicializado en `main.tsx`
 *     (`await db.init()` corre ANTES de montar `RouterProvider`), asi que
 *     `recalcularStockDesdeKardex` (que opera 100% sobre SQLite local, sin
 *     red) puede ejecutarse de inmediato — offline-safe.
 *   - Es un solo punto de montaje para TODAS las rutas autenticadas (POS,
 *     inventario, etc.), no solo el POS — cualquier pantalla que dependa de
 *     `inventario_stock` se beneficia, no solo `pos-terminal.tsx`.
 *
 * NO bloquea el render: se dispara en un `useEffect` (fire-and-forget), la
 * UI pinta de inmediato. `ejecutarInventarioStockBackfillSiNecesario` es
 * idempotente (flag en localStorage) y nunca lanza — un fallo se loguea y
 * se reintenta en el proximo arranque, jamas rompe la app.
 *
 * GATE DE PRIMER ARRANQUE (cierre de WARNING post-review): este hook
 * tambien es el UNICO que llama `marcarTerminado()` del store compartido
 * `inventario-stock-backfill-gate-store.ts` — al terminar la operacion
 * (exito O fallo, el orquestador siempre resuelve) marca el gate como
 * "listo". El `estado` inicial de ese store ya se computo de forma sincrona
 * al cargar su modulo (antes de este efecto), asi que en arranques
 * posteriores al primero (flag ya marcado) NUNCA hay gate.
 *
 * Retorna `{ listo }` reflejando el store compartido — util si el propio
 * `AppLayout` necesita el valor, pero OTROS componentes (ej.
 * `pos-terminal.tsx`) NO deben volver a montar este hook para leerlo (eso
 * dispararia una SEGUNDA invocacion del backfill en paralelo). Deben usar
 * el selector de solo-lectura `useInventarioStockBackfillListo()` del mismo
 * store.
 */
export function useInventarioStockBackfill(): { listo: boolean } {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? null
  const listo = useInventarioStockBackfillListo()
  // Evita disparar dos veces para la misma empresaId (ej. doble-invocacion
  // de efectos en React StrictMode durante desarrollo).
  const intentadoRef = useRef(false)

  useEffect(() => {
    if (!empresaId || intentadoRef.current) return
    intentadoRef.current = true
    void ejecutarInventarioStockBackfillSiNecesario({ empresaId }).finally(() => {
      useInventarioStockBackfillGateStore.getState().marcarTerminado()
    })
  }, [empresaId])

  return { listo }
}
