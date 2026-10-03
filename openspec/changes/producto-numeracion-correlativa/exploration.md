# Exploration: Numeración configurable de código de producto (`libre` vs `correlativo`)

## 1. Cómo funciona hoy el código de producto (end to end)

- **Input libre**: `src/features/inventario/components/productos/producto-form.tsx:2019-2030` — `<input>` de texto plano. `onChange` solo fuerza `toUpperCase()`. Se deshabilita (`disabled={isEditing}`) cuando se edita (línea 2024) porque el código es inmutable tras creación (regla de negocio #5).
- **Validación Zod**: `src/features/inventario/schemas/producto-schema.ts:5` — `codigo: z.string().min(1).transform(toUpperCase())`. No hay regex, no hay chequeo de unicidad client-side; solo "no vacío".
- **Persistencia**: `src/features/inventario/hooks/use-productos.ts:93-158` (`crearProducto`) — recibe `data.codigo` tal cual (ya uppercased por el schema) y lo inserta sin transformación adicional (línea 127: `codigo: data.codigo.toUpperCase()`).
- **Constraint real de unicidad**: vive solo en Postgres — `migrations/0004_inventario.sql:169` → `CONSTRAINT uq_productos_empresa_codigo UNIQUE(empresa_id, codigo)`. El cliente SQLite local (PowerSync) **no** replica este constraint (`schema.ts:351` define `codigo: column.text` sin índice único), así que un duplicado offline no se detecta hasta que el INSERT sube a Supabase y falla ahí.
- **Inmutabilidad real**: `migrations/0004_inventario.sql:184-198` (`validate_producto_update()`) — `BEFORE UPDATE` que revierte/rechaza cualquier intento de `UPDATE productos SET codigo = ...` (`RAISE EXCEPTION 'El codigo de producto no se puede cambiar'`). Este trigger es el que hace viable (o no) la asignación server-side — ver sección 3.

### El bug de "Último código creado" — causa raíz confirmada

- Query actual: `producto-form.tsx:544-551`:
  ```sql
  SELECT codigo, nombre FROM productos WHERE empresa_id = ? ORDER BY created_at DESC LIMIT 1
  ```
  Mostrado en el JSX en líneas 2035-2042 como ayuda visual ("Último código creado: **{codigo}** — {nombre}").
- **Causa raíz exacta**: `import-productos-modal.tsx:633` — `const now = localNow()` se llama **UNA SOLA VEZ, antes del `.map()`** que arma el batch de inserts (línea 637-678), y el mismo valor `now` se escribe en **todas** las filas del Excel como `created_at` (línea 668). Resultado: tras importar, por ejemplo, 500 productos, los 500 comparten el mismo `created_at` exacto.
- `ORDER BY created_at DESC LIMIT 1` sobre un grupo de filas con timestamp idéntico no tiene desempate explícito — ni SQLite ni Postgres garantizan un orden determinístico entre filas con la misma clave de orden. El row que "gana" depende del orden físico de inserción/rowid, que no tiene relación alguna con cuál código es el "más alto" o "el último que el usuario espera ver". Por eso aparece 186 en vez de 728: ambos fueron importados en el mismo batch con el mismo `created_at`, y 186 simplemente quedó primero en el orden físico que SQLite usó para desempatar.
- **Qué debería significar "último" realmente**: dado que hoy el código es texto libre (no necesariamente numérico/secuencial), "último" tiene dos lecturas posibles y la UI actual conflacionaba ambas sin saberlo:
  1. *Más reciente por tiempo de creación* (lo que la query intenta, pero falla por el empate).
  2. *Más alto en la convención numérica del usuario* (lo que el usuario realmente quiere para saber "qué número sigue") — análogo a `getSiguienteCodigoDepartamento` (ver sección 2): `MAX(CAST(codigo AS INTEGER))` filtrando solo códigos puramente numéricos.
  - Esta distinción es exactamente el fork que el modo `correlativo` resuelve de raíz (ya no hay ambigüedad: el servidor asigna el siguiente entero). Para el modo `libre`, el fix del bug (orden determinístico, p.ej. desempatar por un id secuencial o por `MAX` numérico) queda para la fase de diseño — aquí solo se documenta la causa y las dos semánticas en pugna.

## 2. Patrón de correlativo cliente-side ya existente (`use-departamentos.ts`)

`src/features/inventario/hooks/use-departamentos.ts:51-66`:
```ts
export async function getSiguienteCodigoDepartamento(empresaId: string): Promise<string> {
  const rows = await kysely.selectFrom('departamentos').select('codigo').where('empresa_id', '=', empresaId).execute()
  let maxNum = 0
  for (const r of rows) {
    if (/^\d+$/.test(r.codigo)) {
      const n = parseInt(r.codigo, 10)
      if (n > maxNum) maxNum = n
    }
  }
  return String(maxNum + 1)
}
```
- Lee **todas** las filas vía Kysely (que opera sobre la copia local SQLite de PowerSync), filtra solo códigos puramente enteros (`/^\d+$/`), calcula `max + 1` **en el cliente**, y lo usa de inmediato en `crearDepartamento` (línea 71) para el INSERT.
- Es el patrón de referencia exacto que pedía el dueño del producto para `productos` — **pero el dueño ya decidió explícitamente NO replicarlo para productos**, porque:
  - `departamentos` es un catálogo de bajo volumen/baja concurrencia (pocas creaciones, normalmente un único admin configurando).
  - `productos` es alto volumen y multi-usuario offline simultáneo — dos cajeros offline en sucursales distintas pueden leer `max=728` en sus copias locales SQLite (desactualizadas entre sí) y ambos generar `729`, produciendo una colisión real que solo se descubre cuando ambos INSERTs llegan a Postgres y el segundo choca contra `uq_productos_empresa_codigo` (y para colmo, el primero en llegar "gana" silenciosamente mientras el segundo queda con un INSERT fallido que PowerSync debe reintentar/descartar).
  - Esta es la razón de negocio detrás de la decisión arquitectónica ya tomada: **el máximo debe calcularse sobre la fuente de verdad única (Postgres), no sobre una réplica local potencialmente desactualizada.**

## 3. Factibilidad de asignación server-side (trigger `BEFORE INSERT`)

### Patrón ya probado en este mismo repo: `assign_nro_caja()`

`migrations/0040_nro_caja.sql:38-51`:
```sql
CREATE OR REPLACE FUNCTION assign_nro_caja()
RETURNS TRIGGER AS $$
BEGIN
  NEW.nro_caja := COALESCE(
    (SELECT MAX(nro_caja) + 1 FROM cajas WHERE empresa_id = NEW.empresa_id),
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_nro_caja BEFORE INSERT ON cajas FOR EACH ROW EXECUTE FUNCTION assign_nro_caja();
```
Y la mutación cliente correspondiente, `src/features/configuracion/hooks/use-cajas.ts:64-88` (`crearCaja`) — **nunca** incluye `nro_caja` en el `.values({...})` del INSERT. El cliente no lo calcula, no lo envía, no lo conoce hasta que la fila sincroniza de vuelta.

Esto es la prueba en vivo de que el mecanismo que el dueño quiere para `productos.codigo` **ya existe y ya funciona en producción** para `cajas.nro_caja`. Consumidores que necesitan el valor real toleran que pueda ser `NULL` hasta que el round-trip de sync complete: `src/features/ventas/hooks/use-ventas.ts:502-525` lee `nro_caja` de la caja local y hace `if (nroCaja !== null) { ... } else { /* fallback a correlativo global */ }` — es decir, ya hay un precedente de "degradar con gracia" mientras el valor server-side no haya llegado.

### Por qué esto NO genera un loop de sync (con una condición)

El mecanismo de PowerSync separa dos caminos de escritura:
1. **CRUD upload queue**: operaciones que el cliente origina localmente (INSERT/UPDATE/DELETE vía Kysely) se encolan y se suben una vez al conector, que las traduce a `INSERT`/`UPDATE`/`DELETE` reales contra Supabase/Postgres. Una vez el conector confirma el upload, la operación se remueve de la cola — **no vuelve a subirse**.
2. **Sync download path**: los datos que bajan desde los `bucket_definitions` (`backend/powersync-sync-rules.yaml`) escriben directo en la copia local SQLite **sin pasar por la cola de CRUD**, por diseño de PowerSync.
- Como el trigger `BEFORE INSERT` modifica `NEW` **antes de que la fila exista en Postgres**, no hay un `UPDATE` real en Postgres — solo hubo **un único INSERT** (el que subió el cliente, con el valor final ya corregido por el trigger). Cuando esa fila corregida sincroniza de vuelta y sobrescribe la copia local (vía el *sync download path*), no se genera una nueva operación de CRUD local, por lo tanto no hay nada que re-subir. **No hay loop**, siempre que:
  - El trigger sea `BEFORE INSERT` (nunca `AFTER INSERT` + `UPDATE` separado, que sí generaría una segunda escritura real en Postgres).
  - El cliente nunca reaccione al cambio de `codigo` sincronizado disparando una nueva escritura local (p. ej., un `useEffect` que "reconcilie" el código viejo con el nuevo no debe hacer un `UPDATE` — debe ser pasivo, solo lectura).
- El riesgo real a vigilar (no resuelto aquí, es tarea de diseño): si el conector de PowerSync trata un rechazo del INSERT (p. ej. por el `UNIQUE` constraint, si dos clientes offline enviaran *el mismo* valor pre-trigger y algo fallara) como error fatal que descarta el batch completo — igual que `migrations/0096_pago_reversal_idempotente.sql` documenta para otro trigger (`allow_pago_reversal`) que tuvo que hacerse idempotente porque el conector trataba una excepción como fatal. El trigger de correlativo debe diseñarse para **nunca lanzar excepción por motivos de concurrencia** (el `COALESCE(MAX+1, 1)` de `assign_nro_caja` ya es inherentemente serializable fila por fila dentro de una transacción, pero dos INSERTs concurrentes en transacciones separadas SÍ pueden leer el mismo `MAX` antes de que el otro haga commit — mismo riesgo de carrera que un trigger de secuencia ingenuo. `nro_caja` lo tolera porque el volumen de creación de cajas es bajísimo; `productos` en alto volumen concurrente necesita evaluarse con más cuidado — ver `SELECT ... FOR UPDATE` / advisory locks / `GENERATED ALWAYS AS IDENTITY` por partición como alternativas a explorar en diseño).

## 4. Diseño del estado PENDIENTE

### Referencias por `id`, no por `codigo` — confirmado

Todas las FKs hacia `productos` usan el UUID `id`, nunca `codigo`:
- `migrations/0006_ventas.sql:240` — `ventas_det.producto_id UUID NOT NULL REFERENCES productos(id)`
- `migrations/0004_inventario.sql:211,246,406,441` — `inventario_stock`, `movimientos_inventario`, `lotes`, `recetas` — todas vía `producto_id UUID REFERENCES productos(id)`

**Implicación clave**: el estado PENDIENTE no rompe ninguna integridad referencial — un producto puede existir con `id` válido y ser referenciado en teoría por otras tablas aunque su `codigo` todavía no tenga el valor final. El `codigo` es puramente un identificador de negocio/display, no una clave relacional.

### El conflicto a resolver en diseño: `UNIQUE(empresa_id, codigo)` + `codigo TEXT NOT NULL`

`migrations/0004_inventario.sql:142,169` — `codigo TEXT NOT NULL` + `UNIQUE(empresa_id, codigo)`. Esto significa que **no se puede** insertar el placeholder con un valor vacío (`''`) repetido para múltiples productos pendientes simultáneos sin violar la unicidad en el servidor — a menos que el trigger `BEFORE INSERT` sobrescriba `NEW.codigo` (igual que hace con `nro_caja`) ANTES de que el constraint se evalúe, lo cual Postgres sí permite (los triggers `BEFORE` corren antes de la validación de constraints de la fila). Esto es consistente con el mecanismo de §3, pero dejo explícito que el valor placeholder que el CLIENTE manda en el INSERT (antes de que el trigger lo pise) debe:
- Ser único por sí mismo a nivel local (para no romper ninguna UI que liste productos antes de que sincronicen), o
- No importar su valor en absoluto porque el trigger SIEMPRE lo reemplaza — en cuyo caso cualquier placeholder fijo serviría (p. ej. `''`) **porque Postgres nunca llega a validar el valor placeholder contra el UNIQUE, solo el valor final post-trigger**.

Preguntas abiertas para diseño (no resueltas aquí a propósito):
1. ¿Cómo distingue la UI "este producto está pendiente de numeración" de "este producto ya tiene su código final"? Opciones a comparar en diseño:
   - Columna nueva `codigo_status` (`'PENDIENTE' | 'ASIGNADO'`), explícita y queryable — consistente con el patrón de `status` ya usado en `ventas.status` (`ACTIVA`), `lotes.status`, `ajustes.status` en el schema.
   - Sentinel de valor en `codigo` (p. ej. placeholder detectable por regex) — más frágil, acopla lógica de negocio a un string mágico.
   - Columna nullable `codigo` (cambiaría `NOT NULL`) + `NULL`s múltiples son válidos bajo `UNIQUE` en Postgres (NULL no colisiona con NULL) — viable técnicamente pero requiere migrar el constraint y tocar el schema de PowerSync (`column.text` ya permite null, pero el tipo TS `Producto.codigo: string` en `use-productos.ts:9` tendría que volverse `string | null` en todos los consumidores).
2. ¿Cómo se bloquea el uso del producto pendiente en POS/ventas, recetas, ajustes, etc.? Dado que la referencia es por `id` (no por `codigo`), el bloqueo debe ser una validación de aplicación (p. ej. filtrar `WHERE codigo_status = 'ASIGNADO'` en los hooks que alimentan selectors de venta) — no puede apoyarse en la ausencia de FK porque el `id` siempre existe y es válido desde el primer INSERT local.
3. ¿Qué pasa con flujos que hoy buscan productos por código (barcode scanner, búsqueda en POS) mientras el producto está pendiente? Necesita definirse si debe ser simplemente invisible en esos buscadores hasta asignarse.

## 5. Dónde vive la configuración por empresa

- **`system_settings` es GLOBAL, no por tenant** — confirmado en `migrations/0058_decimal_precision.sql:442-461` y `backend/powersync-sync-rules.yaml:46-55` (bucket `global`, sin filtro `empresa_id`). **No es el lugar correcto** para `producto_numeracion_modo` (eso requeriría una fila por empresa o una nueva tabla, perdiendo el mecanismo ya existente de config por tenant).
- **El mecanismo correcto ya existe**: `empresas.config` es una columna `JSONB NOT NULL DEFAULT '{}'` (`migrations/0001_foundation_saas.sql:181`), sincronizada por tenant (`backend/powersync-sync-rules.yaml:65` — `SELECT * FROM empresas WHERE id = bucket.empresa_id`), con RLS de UPDATE ya habilitado para el propio tenant (`migrations/0002_fix_rls_recursion.sql:56` — `update_own_empresa`).
- **Namespace helpers ya existen y son exactamente el patrón a reutilizar**: `src/features/configuracion/hooks/use-company.ts`:
  - `readConfigNamespace<T>(configJson, namespace, defaults)` (línea 136-145) y `serializeConfigNamespace(configJson, namespace, updates)` (línea 156-166) — genéricos, ya usados para el namespace `agenda` (mencionado en comentarios línea 54, 114, 133). Agregar `producto_numeracion_modo` sería un namespace nuevo (p. ej. `inventario: { numeracion_modo: 'libre' | 'correlativo' }`) leído/escrito con estos mismos helpers, sin tocar el schema de Postgres ni de PowerSync.
  - Ya resuelven un bug de corrupción conocido (`isCharIndexedObject`/`normalizeConfigRecord`, líneas 26-83) — cualquier escritura nueva hereda automáticamente esa protección.
- **Dónde engancharía la UI**: `src/features/configuracion/components/company-data-form.tsx` (donde ya se edita `empresas.config` para otros namespaces) sería el lugar natural para el toggle `libre`/`correlativo`, o una sección nueva dentro de Configuración > Inventario si existiera (no se encontró una sección de configuración específica de inventario hoy — hoy Configuración cubre tasas, métodos de pago, bancos, cajas, impuestos, niveles de precio, datos empresa, usuarios).

## 6. Relación con la regla de negocio #12 (CLAUDE.md)

La regla #12 dice: "Los consecutivos (`nro_factura`, `nro_ncr`, `nro_ndb`) son **por empresa**, no globales." Hoy esos correlativos de venta/notas se calculan con `SELECT COUNT(*) ... WHERE empresa_id = ?` **en el cliente** (`src/features/ventas/hooks/use-ventas.ts:488-536` — ver el propio comentario en línea 490: "Esto elimina colisiones entre cajas en escenarios multi-caja offline", mitigado por el prefijo `C01-`/`C02-` que particiona el conteo por caja, no por un correlativo global verdadero).

Esto es relevante porque **este mismo tipo de COUNT/MAX client-side ya es la fuente de un riesgo de colisión conocido y parcialmente mitigado** (mitigado solo porque cada caja tiene su propio prefijo, reduciendo la ventana de colisión a "misma caja, mismo instante offline" en vez de "toda la empresa"). El cambio propuesto para `productos.codigo` en modo `correlativo` **extiende la regla #12 un paso más allá**: en vez de mitigar la colisión particionando (como hace `nro_factura` con el prefijo de caja), la **elimina de raíz** moviendo el cálculo del máximo a Postgres vía trigger `BEFORE INSERT` — el mismo patrón que `nro_caja` ya prueba que funciona, pero que `nro_factura` todavía NO usa. Vale la pena señalar en el proposal que este cambio sienta un precedente que podría aplicarse después a `nro_factura`/`nro_ncr`/`nro_ndb` si se decide cerrar ese riesgo residual también (fuera de alcance de este change).

## 7. Comparación de enfoques

| Enfoque | Descripción | Pros | Contras | Precedente en el repo |
|---|---|---|---|---|
| **A. Client-side `MAX+1` sobre SQLite local** (rechazado por el dueño) | Igual que `getSiguienteCodigoDepartamento` | Simple, sin latencia, sin dependencia de sync | Colisión real bajo concurrencia offline multi-usuario (dos clientes leen el mismo `max` desactualizado); el dueño ya lo descartó explícitamente para este caso de uso de alto volumen | `use-departamentos.ts:51-66` |
| **B. Trigger `BEFORE INSERT` en Postgres** (elegido por el dueño) | `COALESCE(MAX(codigo_int)+1, 1)` filtrando `/^\d+$/`, análogo a `assign_nro_caja` | Fuente de verdad única, sin colisión entre tenants concurrentes (salvo carrera intra-empresa, ver abajo), reutiliza patrón ya probado en producción (`nro_caja`), no requiere tocar el conector PowerSync | Requiere aceptar el estado PENDIENTE mientras el round-trip de sync no complete; posible carrera de `MAX` entre dos INSERTs concurrentes de la MISMA empresa en transacciones separadas (mismo riesgo latente que ya existe hoy en `assign_nro_caja`, nunca estresado en producción por el bajo volumen de creación de cajas) — a evaluar en diseño: `SELECT ... FOR UPDATE` sobre una fila de "contador" dedicada, o una secuencia Postgres nativa por empresa, en vez de `MAX` recalculado cada vez | `migrations/0040_nro_caja.sql` |
| **C. Supabase Edge Function / RPC que asigna al commit** | Una función Postgres `SECURITY DEFINER` o Edge Function invocada explícitamente por el cliente tras detectar conectividad, en vez de un trigger pasivo | Permite lógica más compleja (p. ej. validar permisos adicionales, side-effects, notificar al usuario cuando se asigna), más fácil de testear unitariamente que un trigger | Rompe el modelo offline-first: requiere que el cliente haga una llamada activa post-sync (no encaja con el flujo pasivo de PowerSync, que no notifica "tu INSERT ya syncó, ahora llama a esta función"); introduce una ventana adicional entre "INSERT syncó" y "RPC asignó código" donde el producto sigue en estado aún más ambiguo que con el trigger; no hay precedente de este patrón en el repo para numeración (las Edge Functions existentes — `register-owner`, `create-employee`, `update-employee` — son invocadas directamente por el cliente online, no como reacción a un sync) | Ninguno en este repo |

**Nota de alcance**: esta tabla compara los enfoques tal como fueron pedidos por el dueño; la sección "Recomendación" de un approach concreto (con su diseño de contador, columnas de estado y validaciones) es trabajo de la fase `sdd-design`, no de esta exploración.

## Riesgos / preguntas abiertas para diseño

1. **Carrera de `MAX` intra-empresa**: dos INSERTs concurrentes de la misma empresa en transacciones Postgres separadas pueden leer el mismo `MAX` antes del commit del otro. `assign_nro_caja` tiene este mismo riesgo teórico, nunca estresado en producción. Con `productos` en alto volumen (import masivo + ventas) esto sí puede estresarse — evaluar lock explícito o secuencia dedicada.
2. **Representación del estado PENDIENTE**: columna de status explícita vs. sentinel en `codigo` vs. `codigo` nullable — cada una con distinto blast radius sobre `Producto` (tipo TS), schema de PowerSync, y todos los hooks que hacen `SELECT * FROM productos`.
3. **Enforcement de "no usable hasta asignar"**: debe implementarse como filtro de aplicación en cada selector/buscador de productos (POS, recetas, ajustes, lotes), no vía FK, porque la referencia es por `id` y el `id` siempre es válido desde el primer INSERT local.
4. **Bug de "último código" en modo `libre`**: la causa raíz (timestamp idéntico en bulk import) necesita un fix independiente del modo `correlativo` — no alcanza con cambiar el `ORDER BY`, hay que decidir la semántica real de "último" (cronológico vs. numéricamente más alto) antes de elegir el desempate.
5. **Migración de productos existentes** al activar `correlativo` por primera vez: ¿qué pasa con los códigos libres ya creados (mixtos, no numéricos)? El trigger los ignora para el cálculo de `MAX` (coherente con el filtro `/^\d+$/`), pero conviene decidir si se migran/normalizan o conviven indefinidamente con los nuevos correlativos.
6. **Idempotencia del trigger ante reintentos del conector PowerSync**: si el conector reintenta un INSERT que ya fue aplicado (por un error transitorio de red tras el commit), ¿el trigger podría asignar un segundo número al mismo producto? Mismo tipo de problema que `migrations/0096_pago_reversal_idempotente.sql` resolvió para otro trigger — revisar si el conector garantiza exactly-once o si hace falta una guarda adicional (p. ej. chequear si el `id` ya existe antes de re-ejecutar lógica de asignación).

## Ready for Proposal

**Sí.** Hay suficiente evidencia concreta (bug root-caused con línea exacta, patrón de trigger server-side ya probado en producción vía `nro_caja`, mecanismo de config por tenant ya existente vía `empresas.config` + `readConfigNamespace`/`serializeConfigNamespace`, y confirmación de que las FKs son por `id` no por `codigo`) para avanzar a `sdd-propose`. Los puntos abiertos de la sección anterior deben resolverse explícitamente en `sdd-design`, en particular: (a) mecanismo anti-carrera del `MAX` en el trigger, (b) representación concreta del estado PENDIENTE, y (c) el fix de causa raíz del bug de "último código" en modo `libre` (independiente del modo `correlativo`, pero parte del mismo change por estar en el mismo formulario).
