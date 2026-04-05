# PowerSync - Sincronizacion Offline-First en Nexo21

## Que es PowerSync

PowerSync es el motor de sincronizacion que permite que Nexo21 funcione **sin conexion a internet**. Mantiene una copia completa de la base de datos dentro del navegador usando **SQLite** (via WebAssembly), y sincroniza automaticamente los cambios con **Supabase PostgreSQL** en la nube cuando hay conexion.

El usuario nunca espera por la red: todas las lecturas y escrituras ocurren contra la base de datos local. La sincronizacion es transparente y ocurre en segundo plano.

---

## Arquitectura General

```
┌──────────────────────────────────────────────────┐
│                   NAVEGADOR                       │
│                                                   │
│  ┌───────────┐    ┌──────────────────────────┐   │
│  │  React    │───>│  PowerSync Web Database   │   │
│  │  App      │<───│  (SQLite via wa-sqlite)   │   │
│  │           │    │                           │   │
│  │ useQuery  │    │  Archivo: nexo21.db       │   │
│  │ kysely    │    │  Almacenado en: OPFS /    │   │
│  │ hooks     │    │  IndexedDB del navegador  │   │
│  └───────────┘    └────────────┬──────────────┘   │
│                                │                  │
│                    ┌───────────▼───────────┐      │
│                    │  Supabase Connector   │      │
│                    │  (uploadData +        │      │
│                    │   fetchCredentials)   │      │
│                    └───────────┬───────────┘      │
└────────────────────────────────┼──────────────────┘
                                 │ HTTPS (JWT auth)
                    ┌────────────▼────────────┐
                    │   PowerSync Cloud       │
                    │   (Servicio intermedio)  │
                    │                         │
                    │   Sync Rules (YAML)     │
                    │   Bucket: "global"      │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Supabase PostgreSQL   │
                    │   (Fuente de verdad)    │
                    │                         │
                    │   RLS + Triggers        │
                    │   Inmutabilidad         │
                    └─────────────────────────┘
```

**Tres capas de almacenamiento**:

| Capa | Donde vive | Que almacena | Latencia |
|------|-----------|-------------|----------|
| **SQLite local** | Navegador (OPFS/IndexedDB) | Copia completa de todas las tablas | ~1ms (instantaneo) |
| **PowerSync Cloud** | Nube (servicio gestionado) | Estado de sync, buckets, changelog | N/A (intermediario) |
| **Supabase PostgreSQL** | Nube (Supabase) | Fuente de verdad con RLS y triggers | ~100-500ms |

---

## Donde se Guarda la Informacion

### En el Navegador (SQLite local)

PowerSync usa **wa-sqlite**, una compilacion de SQLite a WebAssembly, para crear una base de datos real dentro del navegador.

```typescript
// src/core/db/powersync/db.ts
export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'nexo21.db',  // Nombre del archivo SQLite
  },
})
```

**Donde se almacena fisicamente**:

- **OPFS (Origin Private File System)**: Metodo preferido en navegadores modernos. Es un sistema de archivos privado por origen que el navegador gestiona. No es visible en el explorador de archivos del sistema operativo.
- **IndexedDB (fallback)**: Si OPFS no esta disponible, PowerSync usa IndexedDB como almacenamiento alternativo.

El provider solicita almacenamiento persistente al navegador para evitar que el SO lo borre:

```typescript
// src/core/db/powersync/provider.tsx
if (navigator.storage && navigator.storage.persist) {
  const isPersisted = await navigator.storage.persist()
  // Si true, el navegador no borrara los datos automaticamente
}
```

**Que contiene la SQLite local**:

Las mismas 14 tablas que existen en PostgreSQL, definidas en el schema:

| Tabla | Tipo de dato especial |
|-------|----------------------|
| `usuarios` | `activo`: integer (0/1 en vez de boolean) |
| `tasas_cambio` | `valor`: text (decimal como string) |
| `departamentos` | `activo`: integer |
| `productos` | `stock`, `costo_usd`, `precio_venta_usd`: text |
| `recetas` | `cantidad`: text |
| `movimientos_inventario` | `cantidad`, `stock_antes`, `stock_despues`: text |
| `metodos_pago` | `activo`: integer |
| `clientes` | `saldo_actual`: text |
| `movimientos_cuenta` | `monto`, `saldo_antes`, `saldo_despues`: text |
| `ventas` | `subtotal_usd`, `total_usd`, `tasa_cambio`: text |
| `detalle_venta` | `cantidad`, `precio_unitario_usd`: text |
| `pagos` | `monto_usd`, `monto_moneda`: text |
| `notas_credito` | `monto_usd`: text |
| `proveedores` | `activo`: integer |

**Adaptaciones de tipos para SQLite**:

SQLite no tiene tipos `BOOLEAN` ni `NUMERIC` nativos, asi que PowerSync los adapta:

```
PostgreSQL              →    SQLite (PowerSync)
─────────────────────────────────────────────
BOOLEAN                 →    INTEGER (0 o 1)
NUMERIC(10,2)           →    TEXT ("1234.56")
NUMERIC(10,4)           →    TEXT ("45.7800")
TIMESTAMPTZ             →    TEXT (ISO 8601)
UUID                    →    TEXT
```

Los valores decimales se almacenan como texto para **preservar precision**. Al leerlos se convierten con `parseFloat()`, y al escribirlos se formatean con `.toFixed(N)`.

### En la Nube (Supabase PostgreSQL)

Es la **fuente de verdad**. Tiene:
- Tipos nativos (`NUMERIC`, `BOOLEAN`, `TIMESTAMPTZ`)
- Row Level Security (RLS)
- Triggers de inmutabilidad
- Indices para consultas frecuentes

### En PowerSync Cloud (Intermediario)

PowerSync Cloud es un servicio que:
1. Se conecta a Supabase PostgreSQL
2. Detecta cambios en las tablas
3. Los empaqueta en "buckets" segun las sync rules
4. Los envia a los clientes conectados via streaming

No almacena datos de negocio permanentemente, solo el changelog para sincronizacion.

---

## Archivos Clave y Que Hace Cada Uno

### `src/core/db/powersync/schema.ts` - Esquema Local

Define la estructura de todas las tablas en SQLite. PowerSync usa este schema para crear las tablas locales y saber que columnas sincronizar.

```typescript
import { column, Schema, Table } from '@powersync/web'

const productos = new Table({
  codigo: column.text,
  tipo: column.text,
  nombre: column.text,
  departamento_id: column.text,
  costo_usd: column.text,         // NUMERIC → text
  precio_venta_usd: column.text,  // NUMERIC → text
  precio_mayor_usd: column.text,
  stock: column.text,             // NUMERIC → text
  stock_minimo: column.text,
  medida: column.text,
  activo: column.integer,         // BOOLEAN → integer
  created_at: column.text,
  updated_at: column.text,
}, { indexes: {} })

// ... todas las demas tablas

export const AppSchema = new Schema({
  usuarios,
  tasas_cambio,
  departamentos,
  productos,
  recetas,
  movimientos_inventario,
  metodos_pago,
  clientes,
  movimientos_cuenta,
  ventas,
  detalle_venta,
  pagos,
  notas_credito,
  proveedores,
})
```

**Nota**: La columna `id` (UUID) no se declara porque PowerSync la agrega automaticamente a todas las tablas.

---

### `src/core/db/powersync/db.ts` - Instancia de la Base de Datos

Crea la instancia singleton de la base de datos SQLite local.

```typescript
import { PowerSyncDatabase } from '@powersync/web'
import { AppSchema } from './schema'

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'nexo21.db',
  },
})
```

Esta instancia `db` es la que se usa en toda la app para:
- `db.execute()` - Ejecutar SQL directamente
- `db.writeTransaction()` - Transacciones atomicas
- `db.connect(connector)` - Iniciar sincronizacion
- `db.disconnect()` - Detener sincronizacion

---

### `src/core/db/powersync/connector.ts` - El Puente con Supabase

Es el archivo mas critico. Implementa la interfaz `PowerSyncBackendConnector` que PowerSync necesita para:

1. **Autenticarse** con Supabase
2. **Subir cambios** locales a la nube
3. **Obtener credenciales** para el streaming de bajada

#### Autenticacion: `login()` y `fetchCredentials()`

```typescript
// Login: el usuario inicia sesion con Supabase
async login(username: string, password: string) {
  const { data: { session }, error } = await this.client.auth.signInWithPassword({
    email: username,
    password: password,
  })
  if (error) throw error
  this.updateSession(session)
  // PowerSync escucha este evento y empieza a sincronizar
}
```

```typescript
// Credenciales: PowerSync las pide en cada ciclo de sync
async fetchCredentials() {
  // Si estamos offline, usamos el token cacheado
  if (!navigator.onLine) {
    if (this.currentSession) {
      return {
        endpoint: this.config.powersyncUrl,
        token: this.currentSession.access_token ?? '',
      }
    }
    throw new Error('Sin sesion disponible')
  }

  // Si estamos online, refrescamos el token
  const { data: { session }, error } = await this.client.auth.getSession()
  return {
    endpoint: this.config.powersyncUrl,
    token: session.access_token ?? '',
  }
}
```

#### Subida de cambios: `uploadData()`

Este metodo es llamado automaticamente por PowerSync cuando hay cambios locales pendientes:

```typescript
async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
  // 1. Obtener la siguiente transaccion CRUD pendiente
  const transaction = await database.getNextCrudTransaction()
  if (!transaction) return  // Nada que subir

  let lastOp: CrudEntry | null = null
  try {
    // 2. Iterar sobre cada operacion pendiente
    for (const op of transaction.crud) {
      lastOp = op
      const table = this.client.from(op.table)

      switch (op.op) {
        case UpdateType.PUT:
          // INSERT local → upsert en Supabase
          await table.upsert({ ...op.opData, id: op.id })
          break

        case UpdateType.PATCH:
          // UPDATE local → update en Supabase
          await table.update(op.opData).eq('id', op.id)
          break

        case UpdateType.DELETE:
          // DELETE local → delete en Supabase
          await table.delete().eq('id', op.id)
          break
      }
    }

    // 3. Marcar transaccion como completada
    await transaction.complete()

  } catch (ex) {
    // Errores fatales (RLS, integridad): descartar cambio
    // Errores temporales (red): reintentar despues
    if (esFatal(ex)) {
      await transaction.complete()  // Descarta
    } else {
      throw ex  // PowerSync reintentara
    }
  }
}
```

**Codigos de error fatales** (cambio se descarta):

| Rango | Significado |
|-------|-------------|
| `22xxx` | Error de datos (formato invalido) |
| `23xxx` | Violacion de integridad (clave duplicada, constraint) |
| `42501` | Violacion de RLS (sin permisos) |

Cualquier otro error (timeout, red) se reintenta automaticamente.

---

### `src/core/db/powersync/provider.tsx` - Inicializacion en React

Envuelve toda la app en un contexto de React que:

1. Solicita almacenamiento persistente al navegador
2. Inicializa la base de datos SQLite local
3. Carga la sesion del usuario desde `localStorage`
4. Si hay sesion, conecta la sincronizacion

```
App inicia
  │
  ▼
navigator.storage.persist()     ← Pedir al navegador que no borre datos
  │
  ▼
db.init()                       ← Crear/abrir nexo21.db en SQLite local
  │
  ▼
connector.init()                ← Leer sesion de localStorage
  │
  ├── Hay sesion? ──SI──> db.connect(connector)  ← Iniciar sync
  │
  └── No hay sesion? ──> Esperar login
  │
  ▼
Renderizar app (isInitialized = true)
```

**Sesion persistente**: El connector almacena la sesion de Supabase en `localStorage` con la clave `sb-{projectId}-auth-token`. Esto permite que al reabrir el navegador, la app restaure la sesion sin pedir login de nuevo (incluso offline).

---

### `src/core/db/kysely/` - Query Builder Tipado

Kysely es una capa sobre PowerSync que agrega **autocompletado TypeScript** a las queries SQL.

```typescript
// kysely.ts - Crea la instancia tipada
import { wrapPowerSyncWithKysely } from '@powersync/kysely-driver'
import { db as powerSyncDb } from '../powersync/db'
import type { DB } from './types'

export const kysely = wrapPowerSyncWithKysely<DB>(powerSyncDb)
```

```typescript
// types.ts - Define los tipos de cada tabla
export interface Productos {
  id: string
  codigo: string
  tipo: string
  nombre: string
  costo_usd: string
  precio_venta_usd: string
  stock: string
  activo: number
  // ...
}

export interface DB {
  productos: Productos
  departamentos: Departamentos
  tasas_cambio: TasasCambio
  // ... todas las tablas
}
```

**Uso en la app**:

```typescript
// En vez de SQL crudo:
db.execute('SELECT * FROM productos WHERE tipo = ? AND activo = 1', ['P'])

// Usas Kysely con autocompletado:
kysely
  .selectFrom('productos')       // ← autocompletado de tablas
  .where('tipo', '=', 'P')      // ← autocompletado de columnas
  .where('activo', '=', 1)
  .orderBy('nombre', 'asc')
  .selectAll()
  .execute()
```

Ambos generan el mismo SQL. Kysely solo agrega tipado; la ejecucion real siempre pasa por PowerSync SQLite.

---

### `powersync-sync-rules.yaml` - Reglas de Sincronizacion

Este archivo se configura en **PowerSync Cloud** (el servicio intermedio). Define que datos se sincronizan a que clientes.

```yaml
bucket_definitions:
  global:
    data:
      - SELECT * FROM usuarios
      - SELECT * FROM tasas_cambio
      - SELECT * FROM departamentos
      - SELECT * FROM productos
      - SELECT * FROM recetas
      - SELECT * FROM movimientos_inventario
      - SELECT * FROM metodos_pago
      - SELECT * FROM clientes
      - SELECT * FROM movimientos_cuenta
      - SELECT * FROM ventas
      - SELECT * FROM detalle_venta
      - SELECT * FROM pagos
      - SELECT * FROM notas_credito
```

**Bucket "global"**: Todos los usuarios autenticados reciben todas las tablas completas. En el futuro se podria particionar por sucursal o por rol.

**Que hace PowerSync Cloud con esto**:
1. Lee los `SELECT` del YAML
2. Los ejecuta contra Supabase PostgreSQL periodicamente
3. Detecta filas nuevas/modificadas/eliminadas
4. Empaqueta los cambios en el bucket "global"
5. Los envia via streaming a todos los clientes conectados

---

## Flujos de Sincronizacion

### Flujo de Escritura (Local → Nube)

```
Usuario crea un producto en el formulario
  │
  ▼
1. Zod valida los datos del formulario
  │
  ▼
2. Hook llama a kysely.insertInto('productos').values({...}).execute()
  │
  ▼
3. Kysely genera SQL: INSERT INTO productos (id, codigo, ...) VALUES (?, ?, ...)
  │
  ▼
4. PowerSync ejecuta el INSERT en SQLite local
   ├── Dato guardado inmediatamente (~1ms)
   ├── Cambio agregado a la cola de sync (CRUD queue)
   └── useQuery() detecta el cambio y re-renderiza la tabla
  │
  ▼
5. Toast: "Producto creado exitosamente" (el usuario ya ve el dato)
  │
  ▼
  === En background (invisible para el usuario) ===
  │
  ▼
6. PowerSync llama a connector.uploadData(db)
  │
  ▼
7. Connector lee la siguiente transaccion pendiente
   const transaction = await database.getNextCrudTransaction()
  │
  ▼
8. Para cada operacion en la transaccion:
   op.op === PUT → supabase.from('productos').upsert(record)
  │
  ▼
9. Supabase recibe el registro:
   ├── RLS verifica permisos (usuario autenticado puede INSERT)
   ├── Trigger actualiza updated_at
   └── Dato almacenado en PostgreSQL
  │
  ▼
10. Connector marca la transaccion como completada
    await transaction.complete()
  │
  ▼
11. Indicador de sync cambia a "EN LINEA" (todo sincronizado)
```

### Flujo de Lectura (Nube → Local)

```
Otro usuario (o un trigger) modifica datos en Supabase
  │
  ▼
1. PowerSync Cloud detecta el cambio en PostgreSQL
   (monitorea las tablas definidas en sync-rules.yaml)
  │
  ▼
2. PowerSync Cloud empaqueta el cambio en el bucket "global"
  │
  ▼
3. PowerSync Cloud envia el cambio via streaming a todos los clientes
  │
  ▼
4. El cliente recibe el cambio y lo aplica a SQLite local
  │
  ▼
5. useQuery() detecta que la tabla cambio y re-renderiza
   (El componente se actualiza automaticamente)
  │
  ▼
6. El usuario ve el dato nuevo sin haber hecho nada
```

### Flujo Offline (Sin Conexion)

```
La red se cae
  │
  ▼
1. PowerSync detecta la desconexion
   ├── uploadData() falla al conectar con Supabase
   ├── Streaming de bajada se interrumpe
   └── useStatus() reporta: connected = false
  │
  ▼
2. Indicador: "DESCONECTADO" (icono amber)
  │
  ▼
3. El usuario sigue trabajando normalmente:
   ├── useQuery() sigue leyendo de SQLite local
   ├── Escrituras se guardan en SQLite local
   ├── Los cambios se acumulan en la cola CRUD
   └── Indicador: "PENDIENTE" si hay cambios locales
  │
  ▼
  === La red vuelve ===
  │
  ▼
4. PowerSync detecta reconexion
  │
  ▼
5. Indicador: "SINCRONIZANDO" (icono azul animado)
  │
  ▼
6. Subida: Todos los cambios acumulados se envian a Supabase
   (en orden, uno por uno, via uploadData)
  │
  ▼
7. Bajada: Se descargan todos los cambios que ocurrieron
   mientras estaba offline
  │
  ▼
8. Indicador: "EN LINEA" (icono verde)
```

### Flujo de Transaccion Atomica (Kardex)

Para operaciones que tocan multiples tablas y deben ser todo-o-nada:

```
Usuario registra salida de inventario: 5 unidades del Producto X
  │
  ▼
1. Hook llama a db.writeTransaction()
  │
  ▼
2. DENTRO DE LA TRANSACCION (atomica en SQLite):
   │
   ├── a) Leer stock actual del producto
   │      SELECT stock FROM productos WHERE id = ?
   │      → stock_actual = 20
   │
   ├── b) Calcular nuevo stock
   │      stock_nuevo = 20 - 5 = 15
   │
   ├── c) Validar que no quede negativo
   │      15 >= 0 → OK (si fuera < 0, throw Error y todo se revierte)
   │
   ├── d) Crear registro de kardex (inmutable)
   │      INSERT INTO movimientos_inventario
   │        (tipo='S', cantidad=5, stock_antes=20, stock_despues=15)
   │
   └── e) Actualizar stock del producto
          UPDATE productos SET stock = 15 WHERE id = ?
  │
  ▼
3. Si todo salio bien: COMMIT (ambos cambios se guardan juntos)
   Si algo fallo: ROLLBACK (ninguno se guarda)
  │
  ▼
4. PowerSync sincroniza ambos cambios a Supabase en background
```

---

## Indicador de Sincronizacion

El componente `sync-status-indicator.tsx` muestra el estado de sync en tiempo real usando el hook `useStatus()` de PowerSync.

### Estados Posibles

| Estado | Color | Icono | Animacion | Significado |
|--------|-------|-------|-----------|-------------|
| **EN LINEA** | Verde | Wifi | No | Todo sincronizado, conexion activa |
| **SINCRONIZANDO** | Azul | RefreshCw | Si (gira) | Subiendo o bajando datos |
| **PENDIENTE** | Amarillo | Upload | Si (pulsa) | Hay cambios locales sin sincronizar |
| **DESCONECTADO** | Ambar | WifiOff | No | Sin internet, trabajando offline |
| **ERROR** | Rojo | AlertCircle | No | Fallo en la ultima sincronizacion |

```typescript
const status = useStatus()

// Propiedades del status:
status.connected              // boolean: esta conectado al servicio?
status.hasSynced              // boolean: se ha completado al menos un sync?
status.dataFlowStatus?.uploading    // boolean: esta subiendo datos?
status.dataFlowStatus?.downloading  // boolean: esta bajando datos?
status.dataFlowStatus?.uploadError  // Error | null
status.dataFlowStatus?.downloadError // Error | null
```

---

## Resolucion de Conflictos

Cuando dos usuarios modifican el mismo registro offline y luego ambos sincronizan:

```
Usuario A (offline): Cambia precio de Producto X a $10
Usuario B (offline): Cambia precio de Producto X a $15

Ambos reconectan...

PowerSync aplica: Last-Write-Wins (ultimo en sincronizar gana)

Si B sincroniza despues de A → Precio final = $15
Si A sincroniza despues de B → Precio final = $10
```

**Last-Write-Wins** es la estrategia por defecto de PowerSync. Para Fase 1 es suficiente porque:
- Pocos usuarios concurrentes
- Los registros inmutables (kardex, tasas) no se editan, solo se crean
- Los conflictos reales son poco probables en un POS de una sola clinica

---

## Dependencias del Sistema

```
package.json (dependencias PowerSync):

@powersync/web          v1.30.0   # Cliente principal (SQLite + sync engine)
@powersync/react        v1.8.2    # Hooks React (useQuery, useStatus)
@powersync/common       v1.44.0   # Tipos compartidos
@powersync/kysely-driver v1.3.1   # Integracion Kysely ↔ PowerSync
@journeyapps/wa-sqlite  v1.4.1    # SQLite compilado a WebAssembly
kysely                  v0.28.8   # Query builder tipado
@supabase/supabase-js   v2.86.0   # Cliente Supabase (auth + API)
uuid                    v13.0.0   # Generacion de UUIDs para registros
```

### Plugins de Vite para WASM

wa-sqlite es un modulo WebAssembly que necesita configuracion especial en Vite:

```typescript
// vite.config.ts
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  plugins: [
    wasm(),            // Permite importar modulos .wasm
    topLevelAwait(),   // Permite await a nivel raiz (necesario para inicializar WASM)
  ],

  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],  // Tambien en Web Workers
  },

  optimizeDeps: {
    // Excluir de pre-bundling (tienen WASM interno)
    exclude: ['@journeyapps/wa-sqlite', '@powersync/web'],
    // Incluir subdependencias que si necesitan pre-bundling
    include: ['@powersync/web > uuid', '@powersync/web > event-iterator'],
  },
})
```

---

## Variables de Entorno

```env
VITE_SUPABASE_URL=https://xxx.supabase.co        # URL del proyecto Supabase
VITE_SUPABASE_ANON_KEY=eyJ...                     # Clave publica de Supabase
VITE_POWERSYNC_URL=https://xxx.powersync.journeyapps.com  # URL de PowerSync Cloud
```

- **SUPABASE_URL**: Donde estan la base de datos y la autenticacion
- **SUPABASE_ANON_KEY**: Clave publica (safe for frontend) para acceder a Supabase
- **POWERSYNC_URL**: Endpoint del servicio de sincronizacion de PowerSync Cloud

---

## Patrones de Uso en el Codigo

### Patron 1: Lectura reactiva con `useQuery()`

```typescript
// src/features/inventario/hooks/use-productos.ts
import { useQuery } from '@powersync/react'

export function useProductos() {
  const { data, isLoading } = useQuery(
    'SELECT * FROM productos ORDER BY nombre ASC'
  )
  return { productos: (data ?? []) as Producto[], isLoading }
}
```

`useQuery()` es reactivo: si alguien (local o remoto via sync) modifica la tabla `productos`, el hook automaticamente re-ejecuta la query y el componente se re-renderiza con los datos nuevos.

### Patron 2: Escritura simple con Kysely

```typescript
export async function crearDepartamento(nombre: string, codigo: string) {
  const id = uuidv4()
  const now = new Date().toISOString()

  await kysely
    .insertInto('departamentos')
    .values({
      id,
      nombre: nombre.toUpperCase(),
      codigo: codigo.toUpperCase(),
      activo: 1,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
  // PowerSync sincroniza automaticamente en background
}
```

### Patron 3: Transaccion atomica con `db.writeTransaction()`

```typescript
export async function registrarMovimiento(params: {
  producto_id: string
  tipo: 'E' | 'S'    // Entrada o Salida
  cantidad: number
}) {
  await db.writeTransaction(async (tx) => {
    // Todo dentro de esta funcion es atomico:
    // si cualquier paso falla, NADA se guarda

    const result = await tx.execute(
      'SELECT stock FROM productos WHERE id = ?',
      [params.producto_id]
    )
    const stockActual = parseFloat(result.rows.item(0).stock)
    const stockNuevo = params.tipo === 'E'
      ? stockActual + params.cantidad
      : stockActual - params.cantidad

    if (stockNuevo < 0) {
      throw new Error(`Stock insuficiente. Actual: ${stockActual}`)
    }

    // Crear movimiento inmutable
    await tx.execute(
      'INSERT INTO movimientos_inventario (...) VALUES (...)',
      [uuidv4(), params.producto_id, params.tipo, params.cantidad,
       stockActual.toFixed(3), stockNuevo.toFixed(3)]
    )

    // Actualizar stock del producto
    await tx.execute(
      'UPDATE productos SET stock = ? WHERE id = ?',
      [stockNuevo.toFixed(3), params.producto_id]
    )
  })
}
```

### Patron 4: Seeding desde Supabase

Para tablas que se pre-cargan desde el servidor (como metodos de pago):

```typescript
// src/features/ventas/hooks/use-metodos-pago.ts
export function useMetodosPagoActivos() {
  const { data, isLoading } = useQuery(
    'SELECT * FROM metodos_pago WHERE activo = 1'
  )
  const seeded = useRef(false)
  const metodos = (data ?? []) as MetodoPago[]

  useEffect(() => {
    // Si la tabla local esta vacia, cargar desde Supabase
    if (isLoading || metodos.length > 0 || seeded.current) return
    seeded.current = true

    connector.client
      .from('metodos_pago')
      .select('*')
      .eq('activo', true)
      .then(async ({ data: remote }) => {
        if (!remote?.length) return
        await db.writeTransaction(async (tx) => {
          for (const m of remote) {
            await tx.execute(
              'INSERT INTO metodos_pago (...) VALUES (...)',
              [m.id, m.nombre, m.moneda, 1, m.created_at]
            )
          }
        })
      })
  }, [isLoading, metodos.length])

  return { metodos, isLoading }
}
```

---

## Precision Decimal: Como se Preserva

Uno de los problemas mas importantes en un sistema financiero es la precision de los numeros decimales. JavaScript usa `float64` que puede perder precision (`0.1 + 0.2 = 0.30000000000000004`).

**Solucion en Nexo21**:

```
PostgreSQL (NUMERIC)  →  PowerSync (TEXT)  →  JavaScript (string)
    1234.56           →     "1234.56"      →     "1234.56"

Al calcular: parseFloat("1234.56") = 1234.56
Al guardar:  (1234.56).toFixed(2)  = "1234.56"
```

| Campo | Precision | Ejemplo |
|-------|-----------|---------|
| Precios (USD) | 2 decimales | `"45.99"` |
| Tasas de cambio | 4 decimales | `"36.5000"` |
| Stock / cantidades | 3 decimales | `"150.000"` |

---

## Resumen: El Ciclo Completo

```
┌─────────────────────────────────────────────────────────────┐
│                         NAVEGADOR                            │
│                                                              │
│   ┌──────────┐   useQuery()   ┌──────────────┐              │
│   │ React    │◄──────────────│  SQLite       │              │
│   │ Component│               │  (nexo21.db)  │              │
│   │          │──────────────>│               │              │
│   └──────────┘   insert/     │  14 tablas    │              │
│                  update/     │  completas    │              │
│                  delete      └──────┬───────┘              │
│                                     │                       │
│                              ┌──────▼───────┐              │
│                              │  Cola CRUD   │              │
│                              │  (cambios    │              │
│                              │  pendientes) │              │
│                              └──────┬───────┘              │
│                                     │                       │
│                              ┌──────▼───────┐              │
│                              │  Connector   │              │
│                              │ uploadData() │              │
│                              └──────┬───────┘              │
└─────────────────────────────────────┼───────────────────────┘
                                      │ HTTPS
                               ┌──────▼───────┐
                               │  PowerSync   │
                               │  Cloud       │◄──── sync-rules.yaml
                               └──────┬───────┘      (bucket "global")
                                      │
                               ┌──────▼───────┐
                               │  Supabase    │
                               │  PostgreSQL  │
                               │              │
                               │  RLS ✓       │
                               │  Triggers ✓  │
                               │  NUMERIC ✓   │
                               └──────────────┘
```

**En una frase**: PowerSync mantiene una copia SQLite de toda la base de datos dentro del navegador, la app lee y escribe contra esa copia local (instantaneo), y PowerSync sincroniza los cambios con Supabase en background (eventual).
