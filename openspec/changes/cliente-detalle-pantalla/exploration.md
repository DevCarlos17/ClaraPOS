# Exploration: Cliente detalle — de panel inline a pantalla dedicada con facturas

## Current State

### 1. Wiring actual de "Gestion de Clientes"

- `src/features/clientes/components/cliente-list.tsx`
  - Mantiene estado local `detalleCliente: Cliente | undefined` (linea 22).
  - `handleVerDetalle(cliente)` (linea 63) simplemente hace `setDetalleCliente(cliente)` — se dispara por click en la fila (`onClick` en `<tr>`, linea 235), por boton "Ver detalle" (Eye icon, linea 274) y por el item de context-menu (linea 213-216).
  - Cuando `detalleCliente` no es `undefined`, el layout cambia a grid `xl:grid-cols-[2fr_3fr]` (linea 137) — la tabla se "encoge" y aparece `<ClienteDetalle>` al costado (linea 306-309), ademas de ocultar columnas (`Limite`, `Estado`) via clases condicionales `detalleCliente ? 'hidden' : ''`.
  - No hay navegacion de router involucrada — todo es estado de componente en memoria.

- `src/features/clientes/components/cliente-detalle.tsx` (634 lineas)
  - Recibe `cliente: Cliente` y `onClose: () => void` como props (no via route params).
  - Muestra: header (identificacion + badge activo/inactivo + nombre), telefono/direccion/limite, card de **Saldo Actual** (usa `useQuery` de PowerSync directo a `clientes` para el saldo mas fresco, con fallback a `cliente.saldo_actual`), filtro de fechas (`fechaDesde`/`fechaHasta`, default mes actual via `startOfMonth()`/`todayStr()`), boton "Generar reporte" (abre ventana nueva con HTML imprimible via `generarReporteEstadoCuenta()`), y la tabla **"Estado de Cuenta"** (movimientos de `movimientos_cuenta` filtrados por rango).
  - Hooks usados: `useMovimientosClienteFiltrados(cliente.id, { fechaDesde, fechaHasta })` y `useTasaActual()` de `use-clientes.ts`/`use-tasas.ts`; `usePagosCliente(cliente.id)` y `registrarReversoAbono` de `@/features/cxc/hooks/use-cxc`; `useCurrentUser()`, `usePermissions()`.
  - Tiene logica no trivial de reverso de abonos (PIN de supervisor, dialog de razon) atada a los movimientos tipo `PAG`.
  - **No muestra facturas** — solo movimientos de cuenta (que incluyen tipo `FAC` como una linea de movimiento, sin detalle de items ni status ACTIVA/ANULADA explicito por factura).

### 2. Routing (TanStack Router file-based)

- `src/routes/_app/clientes/` hoy tiene 4 archivos planos: `index.tsx`, `gestion.tsx`, `cuentas-por-cobrar.tsx`, `reportes.tsx`. `gestion.tsx` es un archivo plano (no carpeta) que registra la ruta `/_app/clientes/gestion` y monta `<ClienteList />` (unico consumidor de todo el flujo actual).
- **Convencion de rutas dinamicas confirmada en el repo**: `src/routes/_app/configuracion/usuarios/$usuarioId.editar.tsx` genera la ruta `/_app/configuracion/usuarios/$usuarioId/editar` (confirmado en `src/routeTree.gen.ts` linea 641/1326). Esa carpeta tambien tiene `index.tsx` (lista) y `nuevo.tsx` (crear) — patron lista + crear + editar-por-id con el plugin `@tanstack/router-plugin/vite` (`tanstackRouter(...)` en `vite.config.ts`).
  - El componente consume el param con `Route.useParams()` (ver `$usuarioId.editar.tsx` linea 12: `const { usuarioId } = Route.useParams()`), y resuelve el registro con un `useQuery` directo (`SELECT * FROM usuarios WHERE id = ?`) manejando loading/not-found inline.
  - La navegacion hacia esas rutas usa `useNavigate()` de `@tanstack/react-router` (`src/features/configuracion/components/usuario-list.tsx` linea 79: `navigate({ to: '/configuracion/usuarios/nuevo' })`).
- **Conclusion para el nuevo cambio**: dado que `gestion.tsx` es un archivo plano (no carpeta), la forma exacta y minima de agregar un hijo con param sin reestructurar nada existente es crear `src/routes/_app/clientes/gestion.$clienteId.tsx` en el MISMO directorio (sin convertir `gestion.tsx` en carpeta). El plugin de TanStack Router interpreta el punto como separador de segmento igual que en `$usuarioId.editar.tsx`, generando la ruta `/_app/clientes/gestion/$clienteId`. No se encontro ningun archivo `$clienteId` existente bajo `clientes/` — es una ruta nueva.

### 3. La query "Por Cliente" de Consultas de Ventas (a reusar)

Ubicacion exacta:
- Hook: `useFacturasPorCliente(clienteId: string)` en `src/features/reportes/hooks/use-ventas-reportes.ts` (lineas 507-546).
  - SQL: `SELECT v.id, v.nro_factura, v.fecha, v.tasa, CAST(v.total_usd AS REAL) as total_usd, CAST(v.total_bs AS REAL) as total_bs, CAST(v.saldo_pend_usd AS REAL) as saldo_pend_usd, v.tipo, v.status, COALESCE(c.nombre,'Sin cliente') as cliente_nombre, COALESCE(c.identificacion,'') as cliente_identificacion FROM ventas v LEFT JOIN clientes c ON v.cliente_id = c.id WHERE v.empresa_id = ? AND v.cliente_id = ? ORDER BY v.fecha DESC LIMIT 50`.
  - **Filtra por `v.empresa_id = ?` usando `useCurrentUser()`** (linea 508-509: `const { user } = useCurrentUser(); const empresaId = user?.empresa_id ?? ''`) — cumple la regla de negocio #11. `enabled = !!clienteId && !!empresaId` evita ejecutar la query con params vacios.
  - Retorna `{ facturas: FacturaBusqueda[], isLoading }`. El tipo `FacturaBusqueda` (export, linea 449-461 del mismo archivo) tiene: `id, nroFactura, clienteNombre, clienteIdentificacion, fecha, totalUsd, totalBs, tasa, tipo, status, saldoPendUsd`.
  - **Nota de tope**: `LIMIT 50` — el caso de "30 facturas para Carlos Barreto" cabe, pero para clientes con mucho mas historial esto trunca silenciosamente (sin paginacion). A anotar como riesgo/decision de la propuesta.
  - Nota de precision: usa `CAST(... AS REAL)` para USD/Bs — esto castea a float de SQLite antes de llegar a JS. Es el mismo patron ya usado por `useBuscarFacturas` (hermano, linea 463 del mismo archivo) y no introducido por este exploration; se mantiene consistencia si se reusa tal cual, pero **no es apto para computo financiero** segun Regla #10 del CLAUDE.md (solo se usa para *mostrar*, no para logica de negocio aqui, asi que es aceptable en este contexto de solo-lectura/reporte).
- Componente de tabla: la funcion `FacturasList` dentro de `src/features/reportes/components/ventas-consultas-modal.tsx` (lineas 339-381) — **NO esta exportada**, es una funcion interna del archivo. Columnas exactas: `Nro` (nroFactura), `Fecha`, `Cliente`, `Total USD`, `Status` (via `StatusBadge`).
  - `StatusBadge` (lineas 707-721, tampoco exportado) deriva el color por `status.toUpperCase()`: `ANULADA` -> rojo (`bg-red-100 text-red-700`), `PAGADA` -> verde, cualquier otro (incluye `ACTIVA`) -> ambar (`bg-amber-100 text-amber-700`).
  - El tab "Por Cliente" (`BuscarPorCliente`, lineas 129-211) es el consumidor real: busca cliente con `useBuscarClientes` (de `@/features/clientes/hooks/use-clientes`), al seleccionar uno llama `useFacturasPorCliente(selectedCliente.id)` y renderiza `<FacturasList facturas={facturas} onSelect={onSelect} />`. El click en una fila abre `<FacturaDetalle>` (detalle completo con PDF) dentro del mismo modal — pantalla completa, no aplica al nuevo caso pero confirma el patron de "click en fila factura -> detalle".

### 4. Estrategia de reuso

- El **hook `useFacturasPorCliente`** es standalone: solo depende de `@powersync/react` y `useCurrentUser()`. **Se puede importar directamente** desde `src/features/clientes/` sin ningun acoplamiento al modal de ventas. No requiere extraccion.
- El **componente `FacturasList`/`StatusBadge`** SI requiere trabajo porque hoy son funciones privadas (no exportadas) de `ventas-consultas-modal.tsx`, ademas de estar co-localizadas con logica de PDF/detalle de factura que no aplica a la pantalla de cliente. Se necesita: (a) exportarlas del archivo actual, o (b) extraerlas a un archivo compartido (ej. `src/features/ventas/components/facturas-list-table.tsx` o algo en `src/components/shared/`), o (c) reimplementar una tabla nueva ad-hoc para la pantalla de cliente (posiblemente usando `DataTable`/`ColumnDef` como hace `FacturasEmpresaTable` en `facturas-empresa-tab.tsx`, que es el patron mas "moderno" del repo para listados de facturas con badges de estado — pero esa usa columnas distintas: incluye Total Bs, badges de estado de pago CONTADO/CREDITO/ABONADA + reverso, mas rica que el pedido literal del usuario).
- Cruzando fuente: `notas-credito-ui.ts` (`derivarEstadoPago`, `resolverBadgesFactura`) ya tiene logica de badges mas rica (CONTADO/CREDITO/ABONADA + reverso TOTAL/PARCIAL) reusada en `FacturasEmpresaTable`. El pedido del usuario es replicar EXACTAMENTE lo que hoy ve en "Por Cliente" (columnas Nro/Fecha/Cliente/Total USD/Status simple ACTIVA-ANULADA), que es el patron mas simple de `FacturasList`+`StatusBadge`, no el de `FacturasEmpresaTable`. Esta es una decision a confirmar explicitamente en la propuesta: ¿reusar el simple (`FacturasList`) o el mas rico (`FacturasEmpresaTable`, que ya usa `DataTable` de TanStack Table y seria mas consistente con el resto del admin)?

### 5. empresa_id / multi-tenant

Confirmado: `useFacturasPorCliente` filtra `WHERE v.empresa_id = ? AND v.cliente_id = ?` resolviendo `empresaId` via `useCurrentUser()` (Regla de negocio #11 del CLAUDE.md). Mismo patron que el resto del repo (`useClientes`, `useMovimientosCliente`, etc. en `use-clientes.ts`).

### 6. Que pasa con el panel lateral actual (`cliente-detalle.tsx`)

El pedido del usuario es que el click en la fila **navegue** a una pantalla nueva en vez de abrir el panel inline. Contenido a decidir en la propuesta:
- **Debe migrar** a la nueva pantalla: header (identificacion, nombre, activo/inactivo), card de Saldo Actual, filtro de fechas + boton "Generar reporte", tabla "Estado de Cuenta" (movimientos) — es decir, prácticamente todo el contenido actual de `cliente-detalle.tsx`, SIN el grid-shrink de la tabla (porque ahora vive en su propia ruta, no al lado de la lista).
- **Se agrega**: una nueva seccion/tab con la tabla de "Todas las facturas del cliente" (Nro/Fecha/Cliente/Total USD/Status), usando `useFacturasPorCliente`.
- El componente `cliente-detalle.tsx` como PANEL INLINE debe dejar de montarse desde `cliente-list.tsx` (el layout `xl:grid-cols-[2fr_3fr]` y las columnas condicionalmente ocultas se retiran). Si se conserva el archivo, pasa a ser el cuerpo de la nueva ruta (renombrado/adaptado) en lugar de un panel condicional — no tiene sentido mantener ambos modos (panel Y pantalla) simultaneamente, séria duplicación de UI para el mismo dato. **Recomendacion**: reemplazar completamente el panel inline por la navegacion; no mantener ambos.
- `handleVerDetalle` en `cliente-list.tsx` cambia de `setDetalleCliente(cliente)` a `navigate({ to: '/clientes/gestion/$clienteId', params: { clienteId: cliente.id } })` (patron ya usado en `usuario-list.tsx`).

### 7. Tests impactados

- `src/features/clientes/components/__tests__/cliente-list.test.tsx`: ya mockea `../cliente-detalle` a `null` (linea 21) porque no testea el click-to-detail hoy. Si `handleVerDetalle` pasa a usar `useNavigate()`, los tests actuales (que no envuelven `<ClienteList />` en un router) **probablemente van a fallar** al montar `useNavigate()` sin `RouterProvider`/contexto de test — hay que revisar el patron de test usado para otras rutas con `useNavigate` en este repo (ej. `usuario-list.tsx` — buscar su archivo de test hermano) para replicar el mock/wrapper correcto.
- `src/features/clientes/components/__tests__/cliente-detalle.test.tsx` (212 lineas): testea `<ClienteDetalle cliente={...} onClose={...}>` como componente standalone con props. Si el contenido se traslada a una ruta, estos tests deben migrar a testear el nuevo componente de pantalla (posiblemente renombrado) en vez de (o ademas de) `ClienteDetalle`; si se decide mantener `ClienteDetalle` como sub-componente presentacional dentro de la nueva ruta (recibiendo `cliente` ya resuelto por la ruta), estos tests podrian sobrevivir casi intactos.
- Nueva cobertura necesaria: tests para el nuevo route file (resolver `clienteId` -> `cliente` via query, loading/not-found), y para la tabla de facturas del cliente (reuso de `useFacturasPorCliente`, ya cubierto por tests existentes de `use-ventas-reportes.ts` si existen — revisar en fase de tasks).

## Affected Areas

- `src/features/clientes/components/cliente-list.tsx` — cambia `handleVerDetalle` de estado local a `navigate()`; se retira el layout grid-shrink y las columnas condicionales.
- `src/features/clientes/components/cliente-detalle.tsx` — se convierte en (o es reemplazado por) el cuerpo de la nueva pantalla; pierde el prop `onClose` (ya no hay boton "cerrar", hay navegacion "volver").
- `src/routes/_app/clientes/gestion.$clienteId.tsx` — **archivo nuevo**, ruta de detalle.
- `src/features/reportes/hooks/use-ventas-reportes.ts` — `useFacturasPorCliente` se reusa tal cual (sin cambios) o se mueve; `FacturaBusqueda` type se reusa.
- `src/features/reportes/components/ventas-consultas-modal.tsx` — si se decide extraer `FacturasList`/`StatusBadge`, este archivo pierde esas funciones privadas a favor de un import compartido.
- `src/features/clientes/components/__tests__/cliente-list.test.tsx` y `cliente-detalle.test.tsx` — requieren actualizacion/migracion.
- Posible archivo nuevo compartido para la tabla de facturas (ubicacion a decidir en propuesta/design): candidatos `src/features/ventas/components/facturas-list-table.tsx` o `src/features/clientes/components/cliente-facturas-tab.tsx` (este ultimo mas alineado a "feature-based organization" del CLAUDE.md, ya que el consumo primario es dentro de `clientes`).

## Approaches

1. **A — Ruta nueva que importa el hook de ventas directo + reimplementa una tabla simple propia** (sin tocar `ventas-consultas-modal.tsx`)
   - Crear `gestion.$clienteId.tsx` que resuelve el cliente via query, renderiza el contenido migrado de `cliente-detalle.tsx` (saldo, filtro fechas, estado de cuenta) + una tabla nueva y pequeña (columnas Nro/Fecha/Cliente/Total USD/Status) que consume `useFacturasPorCliente` importado directamente desde `@/features/reportes/hooks/use-ventas-reportes`.
   - Pros: cero riesgo de romper `ventas-consultas-modal.tsx` (no se toca); rapido de implementar; el hook ya filtra por empresa_id y esta probado indirectamente por el modal existente.
   - Cons: duplica el JSX de `FacturasList`/`StatusBadge` (aunque son ~40 lineas triviales) en dos lugares; si mañana cambia el diseño de esa tabla, hay que actualizar 2 sitios.
   - Effort: Low.

2. **B — Extraer `FacturasList` + `StatusBadge` a un componente compartido primero, luego usarlo en ambos lados**
   - Mover esas 2 funciones a un archivo nuevo (ej. `src/features/ventas/components/facturas-simple-list.tsx`), exportarlas, actualizar `ventas-consultas-modal.tsx` para importarlas, y consumir el mismo componente en la nueva pantalla de cliente.
   - Pros: una sola fuente de verdad para esa tabla simple; evita duplicacion; mas alineado con DRY si se anticipan mas puntos de reuso.
   - Cons: toca un archivo de 731 lineas ya funcionando y con tests (`ventas-consultas-modal.tsx` no tiene test file listado en la exploracion — a verificar en fase tasks) — riesgo de regresion en el modal de Consultas de Ventas por un cambio que no era su objetivo; mas trabajo de refactor antes de entregar la feature pedida.
   - Effort: Medium.

3. **C — Reusar `FacturasEmpresaTable` (el patron mas rico, ya con `DataTable`/badges de estado de pago) filtrado por cliente**
   - En vez de replicar la tabla simple `FacturasList`, usar `useFacturasEmpresa({ busqueda: cliente.identificacion })` o extender el hook/builder (`buildFacturasEmpresaFiltro`) para aceptar `clienteId` explicito, y reusar `FacturasEmpresaTable` (ya exportado, ya usa `DataTable` + badges CONTADO/CREDITO/ABONADA + reverso).
   - Pros: consistencia visual con el resto de listados admin de facturas; badges mas informativos que un simple ACTIVA/ANULADA; componente ya exportado (no requiere refactor de un archivo ajeno).
   - Cons: **no es lo que el usuario pidio explicitamente** ("exactamente como... Por Cliente... Nro/Fecha/Cliente/Total USD/Status ACTIVA/ANULADA") — cambia el contrato visual pedido; `buildFacturasEmpresaFiltro` tendria que aceptar un filtro por `clienteId` que hoy no soporta (haria falta tocar `notas-credito-admin-filters.ts`, usado por otra feature ya estabilizada).
   - Effort: Medium-High.

## Recommendation

**Approach A** para la primera entrega: importar `useFacturasPorCliente` directo (ya filtra por empresa_id, ya esta en produccion via el modal de ventas) y construir una tabla pequeña propia dentro de la nueva pantalla de clientes (mismas 5 columnas: Nro/Fecha/Cliente/Total USD/Status, mismo criterio de badge ACTIVA=ambar/ANULADA=rojo que `StatusBadge`). Es el approach que cumple literalmente lo pedido por el usuario con menor riesgo de tocar codigo de ventas que ya funciona. Si en el futuro se detecta duplicacion real (un tercer consumidor de esa tabla simple), recien ahi vale la pena el Approach B (extraccion). Approach C se descarta para esta entrega porque cambia el contrato visual pedido explicitamente.

Sobre el panel inline: reemplazar completamente `cliente-detalle.tsx`-como-panel por la nueva pantalla (no mantener los dos modos). El contenido de saldo/estado-de-cuenta se traslada tal cual; se agrega una seccion nueva "Facturas" con la tabla de Approach A.

## Risks

- **Falta de paginacion en `useFacturasPorCliente`** (`LIMIT 50` fijo): un cliente con mas de 50 facturas historicas no vera todas — a decidir si se sube el limite, se agrega paginacion, o se acepta el limite para esta entrega (igual que ya lo acepta el modal de ventas hoy).
- **Migracion de tests con `useNavigate`**: `cliente-list.test.tsx` no envuelve el componente en un router hoy; agregar `navigate()` real requiere replicar el patron de mock/test-router ya usado en otro test con `useNavigate` (ej. buscar el test hermano de `usuario-list.tsx`) para no romper la suite existente.
- **Duplicacion de UI mientras se pueda tener ambos modos activos a mitad de migracion**: si la propuesta decide un rollout incremental (panel Y pantalla coexistiendo temporalmente), hay que definir explicitamente cual gana en caso de conflicto — se recomienda un corte limpio (feature flag no parece necesario dado que no hay usuarios en produccion multi-tenant reales todavia segun el estado del proyecto, pero esto se debe confirmar con el usuario en la fase de propuesta).
- **Decision de reuso simple vs. rico (Approach A vs. C) debe ser explicita en la propuesta** — el usuario especifico columnas exactas, pero podria preferir los badges mas ricos de `FacturasEmpresaTable` al verlos comparados; vale la pena preguntar antes de cerrar el proposal si hay ambiguedad.
- **`cliente-detalle.tsx` (634 lineas) tiene logica de reverso de abonos con PIN de supervisor** acoplada al estado de cuenta — al migrar hay que preservar ese flujo completo (no es solo mover JSX, hay 3 dialogs y permisos involucrados).

## Ready for Proposal

Yes. Hay suficiente informacion de codigo real (archivos, hooks, tipos, convencion de rutas confirmada con un ejemplo existente en el repo) para que `sdd-propose` defina alcance y decisiones (especialmente: Approach A vs B para la tabla de facturas, y que hacer exactamente con `cliente-detalle.tsx` como archivo). Recomendado preguntarle al usuario explicitamente en el proposal: (1) confirmar Approach A (tabla simple propia) vs. reusar `FacturasEmpresaTable` con badges mas ricos, y (2) confirmar que el panel lateral se elimina por completo (no coexiste con la nueva pantalla).
