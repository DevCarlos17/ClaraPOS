# Design: Validaciones y Redes de Seguridad — Traspaso de Inventario

## Enfoque Tecnico

Todo el trabajo se concentra en 4 funciones puras nuevas en `src/features/inventario/lib/traspasos.ts` (testeables sin PowerSync) mas su wiring delgado en `traspaso-form.tsx` y dos guardas chicas en `use-traspasos.ts`/`stock-deposito.ts`. No se toca el `writeTransaction` atomico existente ni el guard de 4 capas de mismo-deposito (schema/hook/DB/UI-banner) — se agrega la exclusion mutua de OPCIONES en los selects como capa adicional, no un reemplazo.

## Decisiones de Arquitectura

| Decision | Alternativa descartada | Justificacion |
|---|---|---|
| 4 helpers puros nuevos en `lib/traspasos.ts` (no en el componente) | Logica inline en `traspaso-form.tsx` | Mismo patron ya usado en el archivo (`computeCorrelativoUsuario`, `buildTraspasoKardexPair`); habilita TDD real sin mockear React/PowerSync |
| Guardia `is_active` via `db.getAll` ANTES de `db.writeTransaction` | Guardia `tx.execute` dentro de la tx (como `use-ventas.ts:313-341`) | El spec (`deposito-inactivo-guard/spec.md:7`) exige explicitamente "antes de abrir la writeTransaction"; a diferencia de ventas, origen/destino ya son conocidos como params (no se resuelven dinamicamente dentro de la tx), asi que el pre-check fail-fast es viable y evita abrir tx para nada |
| `leerStockDeposito` gana `empresa_id` como **4to parametro, al final** | Reordenar a `(tx, empresa_id, producto_id, deposito_id)` | Minimiza el diff: los 2 call sites de `use-ventas.ts` (561, 718) solo agregan un argumento; sus tests destructuran `params` posicionalmente e ignoran el elemento extra — cero cambios ahi |
| Boton "Registrar Traspaso" gobernado por un unico predicado `puedeProcesarTraspaso` | Multiples `disabled={a || b || c || d}` inline | Es exactamente la matriz de 4 condiciones del REQ3 — un predicado unico es la unidad de test natural (5 escenarios del spec = 5+ tests directos) |

## Cambios de Archivo

| Archivo | Accion | Descripcion |
|---|---|---|
| `src/features/inventario/lib/traspasos.ts` | Modificar | +4 funciones puras: `filtrarDepositosDisponibles`, `hayArticulosCargados`, `puedeProcesarTraspaso`, `evaluarGuardiaDepositosActivos` |
| `src/features/inventario/lib/__tests__/traspasos.test.ts` | Modificar | Tests RED-first para las 4 funciones nuevas |
| `src/features/inventario/lib/stock-deposito.ts` | Modificar | `leerStockDeposito` gana param `empresa_id` + `AND empresa_id = ?` en el WHERE |
| `src/features/inventario/lib/__tests__/stock-deposito.test.ts` | Modificar | Actualiza 2 llamadas existentes + 1 test nuevo de aislamiento por empresa |
| `src/features/inventario/hooks/use-traspasos.ts` | Modificar | Guardia `is_active` pre-tx (nuevo bloque `db.getAll`); 2 llamadas a `leerStockDeposito` agregan `empresa_id` |
| `src/features/inventario/hooks/__tests__/use-traspasos.test.ts` | Modificar | Extiende el mock de `db` con `getAll` (default: ambos depositos activos); +3 tests para el guard |
| `src/features/ventas/hooks/use-ventas.ts` | Modificar | 2 llamadas a `leerStockDeposito` agregan `empresa_id` (ya en scope como param de `crearVenta`) |
| `src/features/inventario/components/traspasos/traspaso-form.tsx` | Modificar | Exclusion mutua en options de selects; bloqueo de origen; predicado en el boton submit |

## Interfaces Nuevas (`lib/traspasos.ts`)

```ts
export function filtrarDepositosDisponibles<T extends { id: string }>(depositos: T[], idExcluido: string): T[]

export function hayArticulosCargados(lineas: Array<{ producto_id: string }>): boolean

export interface EstadoTraspasoForm {
  depositoOrigenId: string
  depositoDestinoId: string
  lineas: Array<{ producto_id: string; cantidad: string }>
  stockDisponiblePorProducto: Map<string, string> // producto_id -> cantidad_actual en origen
  productosValidosIds: Set<string> // productos activos tipo 'P' conocidos por el form
}
export interface ResultadoPuedeProcesar { habilitado: boolean; motivo?: string }
export function puedeProcesarTraspaso(estado: EstadoTraspasoForm): ResultadoPuedeProcesar

export type GuardiaDepositoInactivoResultado =
  | { bloqueado: false }
  | { bloqueado: true; lado: 'origen' | 'destino' }
export function evaluarGuardiaDepositosActivos(
  origenIsActive: number | undefined,
  destinoIsActive: number | undefined
): GuardiaDepositoInactivoResultado
```

`puedeProcesarTraspaso` cubre, en orden: `lineas.length === 0` -> deshabilita; falta origen/destino -> deshabilita; `origen === destino` -> deshabilita; por cada linea, `producto_id` vacio o ausente en `productosValidosIds` -> deshabilita (cubre "inexistente en BD" y linea sin producto); ausente en `stockDisponiblePorProducto` -> deshabilita ("sin stock en origen"); `cantidad` finita y mayor al disponible -> deshabilita. Cantidad invalida/NaN NO se agrega como condicion nueva: la cubre el `parsed.success` de Zod en `handleSubmit` (REQ4 ya mantiene el modal abierto con el error) — evita duplicar validacion de forma.

## Integracion en `traspaso-form.tsx`

- **Exclusion mutua (REQ1)** — l.355-357 (origen) y l.375-377 (destino): reemplazar `depositos.map(...)` por `filtrarDepositosDisponibles(depositos, depositoDestinoId).map(...)` y `filtrarDepositosDisponibles(depositos, depositoOrigenId).map(...)` respectivamente, via `useMemo`.
- **Bloqueo de origen (REQ2)** — l.348-358: agregar `disabled={hayArticulosCargados(lineas)}` al `<select id="traspaso-origen">`. Sin cambios al `useEffect` de plantilla (l.212-250): al popular `lineas` con productos, `hayArticulosCargados` se vuelve `true` automaticamente (deriva de `lineas`, no de un flag nuevo). Al vaciar la tabla hasta la unica linea residual con `producto_id === ''`, se desbloquea solo.
- **Filtro de busqueda por stock en origen (REQ2)** — YA implementado en `ProductoBuscador` (l.59-65, `conStockEnOrigen`) y en `origenSeleccionado` (l.42-43, 130-132). Sin cambios.
- **Stock reactivo (REQ3a)** — `stockDisponiblePorProducto` (l.176-181) ya viene de `useStockPorDeposito` (`@powersync/react` `useQuery`, reactivo). Se pasa TAL CUAL al predicado; el highlight rojo por linea (`stockExcedido`, l.442-446) sigue reaccionando sin cambios.
- **Boton condicional (REQ3)** — l.519-525: computar `productosValidosIds = useMemo(() => new Set(productosActivos.map(p => p.id)), [productosActivos])` y `resultado = useMemo(() => puedeProcesarTraspaso({...}), [...])`; cambiar `disabled={submitting || mismoDeposito}` a `disabled={submitting || !resultado.habilitado}` (opcional: `title={resultado.motivo}`). `mismoDeposito` se conserva para el banner de error (l.382-386), ambos derivan del mismo estado.
- **Modal no cierra en error (REQ4)** — YA satisfecho: el `catch` de `handleSubmit` (l.318-320) solo hace `toast.error`, nunca `onClose()`. Sin cambios de codigo; se verifica en QA manual/verify.

## Guardas de Seguridad (Redes de Seguridad)

**`is_active` en `crearTraspaso`** (mirror de `use-ventas.ts:313-341`): antes de `db.writeTransaction` (tras los early-throws de `origen===destino` y `lineas.length===0`), `db.getAll<{id,is_active}>('SELECT id, is_active FROM depositos WHERE empresa_id = ? AND id IN (?, ?)', [empresa_id, deposito_origen_id, deposito_destino_id])`, arma un `Map`, y llama `evaluarGuardiaDepositosActivos(map.get(origen), map.get(destino))`; si `bloqueado`, lanza error en espanol segun `lado`.

**`empresa_id` en `leerStockDeposito`**: firma pasa a `(tx, producto_id, deposito_id, empresa_id)`; WHERE agrega `AND empresa_id = ?`. 4 call sites actualizados (2 en `use-traspasos.ts`, 2 en `use-ventas.ts`).

## Estrategia de Test (TDD RED primero)

| Capa | Que testear | Enfoque |
|---|---|---|
| Unit (`lib/traspasos.ts`) | `filtrarDepositosDisponibles` (excluye id, no-op si id vacio) | Puro, sin mocks |
| Unit | `hayArticulosCargados` (vacio, 1 linea con producto, plantilla cargada, vaciado) | Puro, sin mocks |
| Unit | `puedeProcesarTraspaso` — matriz completa: sin origen/destino, origen==destino, linea sin producto, producto sin stock en origen, cantidad excede disponible, todo valido | Puro, sin mocks — es el nucleo del REQ3 |
| Unit | `evaluarGuardiaDepositosActivos` — origen inactivo, destino inactivo, ambos activos | Puro, sin mocks — 3 escenarios exactos del spec |
| Unit (`lib/stock-deposito.ts`) | `leerStockDeposito` filtra por `empresa_id` (fila de otra empresa no debe aparecer) | Mock de `tx.execute`, patron existente en el archivo |
| Hook (`use-traspasos.test.ts`) | Guardia `is_active` rechaza antes de `writeTransaction` (origen/destino inactivo), permite si ambos activos | Extender mock de `db` con `getAll`, default ambos activos |
| Componente/manual QA | Boton disabled realmente refleja `resultado.habilitado`; bloqueo visual del select origen; modal permanece abierto tras error de submit | Fuera del unit suite (gap de mocking PowerSync/React en este repo) — cubierto por `sdd-verify` + smoke manual, NO nuevo unit test |

## Pronostico de Lineas Modificadas

~110 (`lib/traspasos.ts`) + ~140 (sus tests) + ~6 (`stock-deposito.ts`) + ~20 (sus tests) + ~20 (guard en `use-traspasos.ts`) + ~70 (sus tests, incl. extension del mock) + ~2 (`use-ventas.ts`) + ~50 (`traspaso-form.tsx`) ≈ **~415 lineas**, por encima del presupuesto de revision de 400 lineas de la sesion. El exceso viene integramente de la propagacion de `empresa_id` en `leerStockDeposito` (spec explicito) y del mock-setup del guard `is_active` — ambos son requisitos de spec, no scope creep. Ver Riesgos.

## Migracion / Rollout

No requiere migracion de datos ni feature flag. Cambio de firma de `leerStockDeposito` es interno (no exportado fuera de `features/inventario`), sin impacto en otros modulos mas alla de `use-ventas.ts`.

## Preguntas Abiertas

- [ ] El pronostico (~415 lineas) excede el presupuesto de 400 — decidir si se acepta en un solo PR (cohesion tematica "redes de seguridad") o se separa la propagacion de `empresa_id` en `leerStockDeposito` (+ventas) como su propio commit/PR chico dentro del mismo change.
