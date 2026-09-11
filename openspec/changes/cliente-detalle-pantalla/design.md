# Design: Cliente detalle — pantalla dedicada con historial completo de facturas

## Technical Approach

Reemplazo completo del panel inline por una ruta TanStack Router (`gestion.$clienteId.tsx`, hija plana de `gestion.tsx`, sin convertirlo en carpeta). El contenido de `cliente-detalle.tsx` se conserva como componente presentacional (renombra `onClose`→`onVolver`), pero la resolucion de `clienteId`→`Cliente` se extrae a un componente nuevo y testeable (`ClienteDetalleResolver`) para no acoplar tests a `Route.useParams()`. `buildFacturasEmpresaFiltro`/`FiltroFacturasEmpresa` (compartido con `notas-credito-admin`) gana un campo `clienteId?: string` puramente aditivo. `cliente-list.tsx` navega en vez de mutar estado local y pierde el grid-shrink.

## Architecture Decisions

### Decision: Extension aditiva de `buildFacturasEmpresaFiltro`

**Choice**: agregar `clienteId?: string` a `FiltroFacturasEmpresa` y `FiltroFacturasEmpresaHook`. Cuando esta presente, el builder inserta `AND v.cliente_id = ?` en el `WHERE`, **despues** del rango de fecha y **antes** de la clausula de `busqueda`. El param se agrega en esa misma posicion: `[empresaId, fechaDesde, fechaHasta, clienteId?, ...busquedaParams?]`.

**Alternativas consideradas**: (a) hook separado `useFacturasPorCliente` standalone (ya existe en `use-ventas-reportes.ts`, pero usa columnas/estado simples ACTIVA/ANULADA, no los badges CONTADO/CREDITO/ABONADA+reverso pedidos) — descartado, el proposal ya fijo la tabla rica. (b) filtrar client-side sobre `facturas` ya cargadas — descartado, no escala y date-range quedaria acoplado al admin.

**Rationale**: cuando `clienteId` es `undefined` (TODOS los llamadores actuales: `FacturasEmpresaTab`), el `if (f.clienteId)` no se ejecuta — SQL y `params` identicos byte-a-byte al comportamiento actual. Los 228 tests de `notas-credito-admin-filters.test.ts` no cambian.

```ts
// notas-credito-admin-filters.ts — delta exacto
export interface FiltroFacturasEmpresa {
  empresaId: string
  fechaDesde: string
  fechaHasta: string
  busqueda?: string
  /** NUEVO — aditivo. undefined = comportamiento actual sin cambios. */
  clienteId?: string
}

export function buildFacturasEmpresaFiltro(f: FiltroFacturasEmpresa): SqlFiltroResult {
  const params: unknown[] = [f.empresaId, f.fechaDesde, f.fechaHasta]
  let sql = `SELECT ... WHERE v.empresa_id = ?
       AND datetime(v.fecha) >= datetime(? || 'T00:00:00${'${VE_OFFSET}'}')
       AND datetime(v.fecha) <= datetime(? || 'T23:59:59${'${VE_OFFSET}'}')`

  if (f.clienteId) {                       // <- NUEVO bloque
    sql += `\n       AND v.cliente_id = ?`
    params.push(f.clienteId)
  }

  const busqueda = f.busqueda?.trim()
  if (busqueda) { /* sin cambios */ }
  sql += `\n     ORDER BY v.fecha DESC`
  return { sql, params }
}
```

`useFacturasEmpresa(filtros?: FiltroFacturasEmpresaHook)` gana el mismo campo opcional y lo pasa tal cual al builder — `empresaId` sigue resolviendose via `useCurrentUser()` (Regla #11 intacta, es el primer `AND` del `WHERE`, nunca removido).

### Decision: Resolucion de ruta separada del route file (testabilidad)

**Choice**: `gestion.$clienteId.tsx` exporta **solo** `Route` (convencion ya usada por `$usuarioId.editar.tsx` y requerida por el plugin de code-splitting de TanStack Router — exportar el componente ademas de `Route` genera warning de bundle). El componente local (no exportado) llama `Route.useParams()` + `useNavigate()` y delega todo el resto a un componente nuevo y exportado, `ClienteDetalleResolver` (props `{ clienteId, onVolver }`), que vive en `src/features/clientes/components/cliente-detalle-resolver.tsx`.

**Alternativas consideradas**: probar el route file directamente montando un `RouterProvider`+`createMemoryHistory` real — descartado como default: no hay precedente en el repo (ningun `*.route.test.tsx` existe hoy), y es mas pesado que necesario cuando la logica de negocio (loading/not-found/empresa_id) puede vivir en un componente puro por props.

**Rationale**: `ClienteDetalleResolver` se testea con los mismos mocks shallow ya usados en `cliente-detalle.test.tsx` (`useQuery`, `useCurrentUser`) SIN tocar `@tanstack/react-router` en absoluto — cero riesgo de acoplar el test a la maquinaria interna del router.

```ts
// cliente-detalle-resolver.tsx
export interface ClienteDetalleResolverProps {
  clienteId: string
  onVolver: () => void
}
export function ClienteDetalleResolver({ clienteId, onVolver }: ClienteDetalleResolverProps) {
  const { user, loading: userLoading } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { data, isLoading } = useQuery(
    'SELECT * FROM clientes WHERE id = ? AND empresa_id = ?',
    [clienteId, empresaId]
  )
  if (userLoading || isLoading) return <Spinner />
  const cliente = (data?.[0] as Cliente) ?? null
  if (!cliente) return <NoEncontrado onVolver={onVolver} />
  return <ClienteDetalle cliente={cliente} onVolver={onVolver} />
}

// gestion.$clienteId.tsx — SOLO exporta Route
export const Route = createFileRoute('/_app/clientes/gestion/$clienteId')({ component: ClienteDetallePage })
function ClienteDetallePage() {                       // no exportado
  const { clienteId } = Route.useParams()
  const navigate = useNavigate()
  return (
    <ClienteDetalleResolver
      clienteId={clienteId}
      onVolver={() => navigate({ to: '/clientes/gestion' })}
    />
  )
}
```

### Decision: `cliente-detalle.tsx` permanece presentacional, solo cambia `onClose`→`onVolver`

**Choice**: se conserva el archivo tal cual (header, saldo, filtro de fechas, Estado de Cuenta, reverso de abono con PIN+dialogs) — el unico cambio de contrato es renombrar el prop `onClose: () => void` a `onVolver: () => void` y reemplazar el boton `X` (icono `X` de phosphor) por un boton/enlace "Volver" que invoca `onVolver`. Se retira `lg:sticky lg:top-6` (ya no vive al lado de una tabla). En PR3 se agrega la seccion "Facturas" al final del mismo archivo.

**Alternativas consideradas**: crear un componente nuevo desde cero — descartado, duplicaria 600+ lineas de logica de reverso de abono ya probada (Regla de inmutabilidad: el reverso INSERTA un registro `REV`, nunca edita/borra el `PAG` original — `registrarReversoAbono` no se toca).

**Rationale**: minimiza el diff y el riesgo sobre el flujo de reverso (PIN de supervisor sin `CXC_REVERSE`, dialog de razon obligatoria) — exactamente lo que pide el proposal ("migrar como unidad").

## Data Flow

    cliente-list.tsx (click fila / "Ver detalle" / menu)
         │ navigate({ to: '/clientes/gestion/$clienteId', params })
         ▼
    gestion.$clienteId.tsx (Route.useParams -> clienteId)
         │ onVolver = () => navigate({ to: '/clientes/gestion' })
         ▼
    ClienteDetalleResolver (useQuery clientes WHERE id=? AND empresa_id=?)
         │ loading -> spinner | null -> "no encontrado" | cliente resuelto
         ▼
    ClienteDetalle (cliente, onVolver)
         ├── Saldo Actual (useQuery clientes.saldo_actual, ya existente)
         ├── Estado de Cuenta (useMovimientosClienteFiltrados, ya existente)
         ├── Reverso de abono (usePagosCliente + registrarReversoAbono, ya existente)
         └── [PR3] Facturas (useFacturasEmpresa({ clienteId: cliente.id }) -> FacturasEmpresaTable)

## File Changes

| File | Action | Slice | Description |
|------|--------|-------|-------------|
| `src/features/ventas/utils/notas-credito-admin-filters.ts` | Modify | PR1 | `clienteId?: string` aditivo en `FiltroFacturasEmpresa` + `buildFacturasEmpresaFiltro` |
| `src/features/ventas/hooks/use-facturas-empresa.ts` | Modify | PR1 | `clienteId?: string` aditivo en `FiltroFacturasEmpresaHook`, pasado al builder |
| `src/features/ventas/utils/__tests__/notas-credito-admin-filters.test.ts` | Modify | PR1 | Nuevos `it()` para `clienteId` (presente/ausente/orden de params); tests existentes intactos |
| `src/routes/_app/clientes/gestion.$clienteId.tsx` | Create | PR2 | Ruta nueva, solo exporta `Route` |
| `src/features/clientes/components/cliente-detalle-resolver.tsx` | Create | PR2 | Resuelve `clienteId`→`Cliente`, loading/not-found, `empresa_id` en WHERE |
| `src/features/clientes/components/cliente-detalle.tsx` | Modify | PR2 | `onClose`→`onVolver`, boton Volver, retira `lg:sticky` |
| `src/features/clientes/components/cliente-list.tsx` | Modify | PR2 | `handleVerDetalle` usa `navigate()`; retira grid-shrink y columnas condicionales; retira `<ClienteDetalle>` inline |
| `src/features/clientes/components/__tests__/cliente-detalle-resolver.test.tsx` | Create | PR2 | Loading / no-encontrado / resuelto, `empresa_id` en WHERE |
| `src/features/clientes/components/__tests__/cliente-detalle.test.tsx` | Modify | PR2 | Renombra `onClose`→`onVolver` en las llamadas a `render()` |
| `src/features/clientes/components/__tests__/cliente-list.test.tsx` | Modify | PR2 | Mock de `useNavigate`, asserts de `navigate()` en click/"Ver detalle"/menu |
| `src/features/clientes/components/cliente-detalle.tsx` | Modify | PR3 | Agrega seccion "Facturas" con `FacturasEmpresaTable` |
| `src/features/clientes/components/__tests__/cliente-detalle.test.tsx` | Modify | PR3 | Tests de la seccion Facturas (badges, vacio) |

## Interfaces / Contracts

```ts
// cliente-detalle.tsx
export interface ClienteDetalleProps {
  cliente: Cliente
  onVolver: () => void   // antes: onClose
}
```

## Testing Strategy

| Layer | Que testear | Approach |
|-------|-------------|----------|
| Unit (pure) | `buildFacturasEmpresaFiltro` con/sin `clienteId`, orden de params, combinado con `busqueda` | Extiende `notas-credito-admin-filters.test.ts`, sin tocar los `it()` existentes |
| Unit (component) | `ClienteDetalleResolver`: loading, cliente encontrado, `clienteId` de otra empresa → "no encontrado" | Mock `useQuery`+`useCurrentUser`, mismo patron shallow que `cliente-detalle.test.tsx` |
| Unit (component) | `ClienteDetalle`: reverso de abono, saldo 3-estados, Estado de Cuenta — SIN CAMBIOS funcionales | Migrar `cliente-detalle.test.tsx` renombrando el prop en las llamadas a `render` |
| Unit (component) | `ClienteList`: click/"Ver detalle"/menu llaman `navigate({ to: '/clientes/gestion/$clienteId', params: { clienteId } })` | `vi.mock('@tanstack/react-router', () => ({ useNavigate: vi.fn() }))` — primer precedente de este mock en el repo, consistente con el resto de mocks shallow por hook |
| Unit (component) | Seccion Facturas: reusa `FacturasEmpresaTable` filtrada, badges correctos, estado vacio | Mock `useFacturasEmpresa` devolviendo `FacturaParaAnular[]` fijas |

## Migration / Rollout

No requiere migracion de datos. Corte limpio: no coexisten panel y ruta. `git revert` de PR2 restaura el panel; la extension aditiva de PR1 es segura de dejar sin uso si se revierte solo PR2/PR3.

## Slice Boundaries (chained PRs)

- **PR1** (~120 lin.): `notas-credito-admin-filters.ts` + `use-facturas-empresa.ts` + tests nuevos. Cero riesgo sobre `notas-credito-admin` (tests existentes no cambian).
- **PR2** (~350-400 lin.): ruta nueva + `cliente-detalle-resolver.tsx` + `cliente-detalle.tsx` (rename prop) + `cliente-list.tsx` (navigate) + migracion de 2 test files existentes + 1 test file nuevo. Pantalla funcional SIN Facturas (Estado de Cuenta + reverso completos).
- **PR3** (~150-200 lin.): seccion Facturas en `cliente-detalle.tsx` consumiendo PR1, + tests de esa seccion.

## Open Questions

- [ ] `FacturasEmpresaTable` incluye columna "Aplicar nota de credito" con boton `onClick={() => onAplicarNc?.(f)}`. La spec de este cambio NO pide esa accion desde la pantalla de cliente; se deja `onAplicarNc` sin pasar (boton visible pero inerte) en vez de expandir el scope importando `CrearNcrModal`. A confirmar en tasks/verify si esto es aceptable o si se prefiere ocultar la columna (requeriria tocar `FacturasEmpresaTable` para aceptar columnas opcionales — fuera del alcance aditivo actual).
