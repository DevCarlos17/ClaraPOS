
# Proposal: Traspaso de Inventario — Validaciones y Redes de Seguridad (Change A)

## Intent

El modal de traspaso entre depositos (`traspaso-form.tsx` + `use-traspasos.ts`) ya es una feature completa y probada (atomicidad, stock-no-negativo, guard same-deposito 4-capas, double-submit). El tester envio una spec funcional mas precisa (obs #2607) con 3 requisitos puntuales que el codigo actual NO cierra del todo. Esta es la primera de 4 changes acordadas con el mantenedor (decision obs #2609): cerrar validaciones + redes de seguridad del formulario antes de auditoria (B), persistencia (C) y lotes (D).

## Scope

### In Scope
- **Req 1 (origen != destino)**: exclusion mutua en las opciones de los selects origen/destino (al elegir uno, desaparece del otro). El guard de sistema (schema + hook + DB CHECK) y el mensaje de error ya existen — confirmar, no reconstruir.
- **Req 2 (busqueda + lock de origen)**: el filtro "solo productos con stock en origen" YA esta implementado. Falta: bloquear el select de deposito origen al agregar el primer articulo (o cargar plantilla) y desbloquearlo al vaciar la tabla.
- **Req 3 (no exceder disponible + boton)**: cablear el boton "Registrar Traspaso" para que se desactive si: origen=destino, falta origen/destino, o cualquier linea excede el stock disponible.
- **Manejo de errores**: confirmar que el modal ya NO se cierra en error (`catch` actual no llama `onClose()`) y que el toast comunica el fallo — sin rediseno de UI de error.
- **Dos guardas chicas de seguridad** (del explore obs #2606, encajan en el tema "redes de seguridad" de este change): re-chequeo de `is_active` de origen/destino en `crearTraspaso` (mismo patron que `use-ventas.ts:313-339`), y filtro `empresa_id` en `leerStockDeposito`.

### Out of Scope (Changes B/C/D — obs #2609)
- **Change B**: modal de detalle/auditoria en `traspaso-list.tsx`.
- **Change C**: persistencia del form (restaurar/cancelar ultimo traspaso, precedente `facturas-espera-store`).
- **Change D — mas urgente de los 3 diferidos**: `lotes` nunca se toca en traspasos (gap ALTO del explore #2606: `lotes.cantidad_actual` queda desactualizado en origen y no se crea/acredita en destino para productos con `maneja_lotes=1`). Riesgo de integridad de stock real, requiere diseno propio.

## Evaluacion: Req 3a (stock "en vivo" durante facturacion concurrente)

**Hallazgo clave**: `stockDisponiblePorProducto` (linea 176-181 de `traspaso-form.tsx`) ya viene de `useStockPorDeposito`, que usa `useQuery` de `@powersync/react` — **reactivo por diseño**. Cuando otro dispositivo vende y esa venta sincroniza al SQLite local, la query se re-ejecuta sola: `disponibleNum` se recalcula y `stockExcedido` (linea 442-446, ya existente) ya resalta la fila en rojo (`border-destructive`) sin codigo nuevo. La "arquitectura de reactividad" pedida por el tester **ya esta construida** por Req 2.

Lo unico que falta es CABLEAR esa señal ya reactiva al boton (hoy `disabled={submitting || mismoDeposito}` ignora `stockExcedido` por completo). Costo estimado: ~15-20 lineas (un boolean agregado `algunaLineaExcedida` + su uso en `disabled`).

**Recomendacion: INCLUIR req 3a en Change A**, no partir en Change A2. La reactividad cross-device via sync tiene latencia de red inherente (limitacion sistemica de PowerSync last-write-wins, ya documentada como gap 4 no accionable en el explore) — se documenta como limitacion conocida, no como bug a resolver aqui.

## Estimacion de tamaño

| Item | Lineas aprox. |
|---|---|
| Exclusion mutua origen/destino (Req 1) | 10-15 |
| Lock/unlock select origen (Req 2) | 15-25 |
| Boton disabled: mismoDeposito + faltantes + stockExcedido (Req 3+3a) | 15-25 |
| Guarda is_active en hook | 15-25 |
| Guarda empresa_id en `leerStockDeposito` | 5 |
| Tests (componente + hook, mismo patron que suite actual) | 100-150 |
| **Total** | **~160-245** |

Muy por debajo del presupuesto de revision de 400 lineas — no se requiere PR encadenado.

## Riesgos

| Riesgo | Prob. | Mitigacion |
|---|---|---|
| Lock de origen rompe flujo de plantilla (carga reemplaza lineas) | Baja | Reusar el mismo `useEffect` que ya gobierna carga de plantilla; lock se deriva de `lineas.some(l => l.producto_id)` |
| Boton disabled demasiado agresivo bloquea casos validos | Media | Cubrir con tests de componente existente (`traspaso-form.test.tsx`) antes/despues |
| Guarda is_active introduce falso-negativo si deposito se desactiva mid-tx | Baja | Espejar exactamente el patron probado de `use-ventas.ts` |

## Rollback Plan
Cada item es independiente y acotado a `traspaso-form.tsx` / `use-traspasos.ts` / `stock-deposito.ts`. Revert via `git revert` del commit de Change A; no hay migracion de DB nueva.

## Success Criteria
- [ ] Elegir deposito en un select lo remueve de las opciones del otro.
- [ ] Origen se bloquea al agregar el primer articulo o cargar plantilla; se desbloquea al vaciar la tabla.
- [ ] Boton desactivado si: origen=destino, falta origen/destino, o alguna linea excede stock disponible (incluye cambios reactivos por sync).
- [ ] `crearTraspaso` rechaza deposito inactivo (origen o destino).
- [ ] `leerStockDeposito` filtra por `empresa_id`.
- [ ] Suite existente (7 tests puros + component/hook tests) sigue en verde; nuevos tests cubren los items de arriba.
