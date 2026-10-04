# Exploration: Asignación server-side de `departamentos.codigo`

## Contexto confirmado (no se re-litiga)

Escenario single-user offline-first. `getSiguienteCodigoDepartamento` (`src/features/inventario/hooks/use-departamentos.ts:51-66`) calcula el siguiente código como `MAX+1` leyendo la copia LOCAL de SQLite (réplica eventualmente consistente de PowerSync, no la fuente de verdad). El INSERT local siempre tiene éxito (el usuario ve el departamento y puede adjuntarle productos de inmediato), pero al subir vía PowerSync, Postgres rechaza con `23505 duplicate key value violates unique constraint uq_departamentos_empresa_codigo`. PowerSync marca la operación como FATAL y la **descarta silenciosamente**. Cualquier producto creado contra ese `departamento_id` falla después con `23503` (FK violation `productos_departamento_id_fkey`) y también se descarta. Confirmado con logs reales: departamento descartado `id = 7cac7b70-590f-4255-91d6-d91aedb1022e`, producto huérfano con `departamento_id: '7cac7b70-590f-4255-91d6-d91aedb1022e'` en su PATCH.

Dirección de solución ya decidida por el dueño: mover la asignación de `codigo` al servidor vía trigger `BEFORE INSERT`, replicando el patrón ya implementado para `productos` en `migrations/0099_producto_numeracion_correlativa.sql`. Esta exploración cubre el CÓMO, no el SI.

---

## 1. Mapa exacto del camino de creación actual de `departamentos`

| Pieza | Ubicación | Rol |
|---|---|---|
| Cálculo client-side del código | `src/features/inventario/hooks/use-departamentos.ts:51-66` (`getSiguienteCodigoDepartamento`) | `SELECT codigo FROM departamentos WHERE empresa_id = ?` vía Kysely (SQLite local), filtra `/^\d+$/`, devuelve `String(maxNum + 1)` — **sin lock, sin fuente de verdad única** |
| Insert | `src/features/inventario/hooks/use-departamentos.ts:68-88` (`crearDepartamento(nombre, empresaId)`) | Llama a `getSiguienteCodigoDepartamento` en la línea 71 y lo escribe directo en el INSERT (línea 77: `codigo`) |
| UI — precarga del código | `src/features/inventario/components/departamentos/departamento-form.tsx:36-40` | En `useEffect`, al abrir el form para "Nuevo Departamento", llama `getSiguienteCodigoDepartamento(user.empresa_id)` y lo pre-rellena en un `<input readOnly disabled>` (líneas 109-127) con placeholder "El codigo se asigna automaticamente" |
| UI — submit | `src/features/inventario/components/departamentos/departamento-form.tsx:57,77` | Valida con `departamentoSchema.safeParse({ codigo, nombre, is_active: true })` y luego llama `crearDepartamento(parsed.data.nombre, user!.empresa_id!)` — el `codigo` validado por Zod **no se usa** en la llamada real (crearDepartamento lo recalcula internamente), es puramente para que el `safeParse` no falle |
| Validación Zod | `src/features/inventario/schemas/departamento-schema.ts:4-7` | `codigo: z.string().min(1).regex(/^[1-9]\d*$/, 'Solo numeros enteros positivos, sin ceros iniciales')` — **ya exige numérico puro**, sin modo "libre" configurable (a diferencia de `productos`) |
| Schema PowerSync | `src/core/db/powersync/schema.ts:272-289` (`departamentos`) | `codigo: column.text` — sin índice único, sin CHECK, replica el `NOT NULL`/regex/UNIQUE de Postgres tal como lo hace `productos` hoy |
| Orden visual | `use-departamentos.ts:34,45` y `departamento-list.tsx:36-44` | `ORDER BY CAST(d.codigo AS INTEGER) ASC` en SQL, y en JS un `parseInt` con fallback a `localeCompare` para códigos no numéricos (alfanuméricos legacy como `FAC`/`COR`/`CAP` caen al final, ordenados alfabéticamente) |

**Confirmado por lectura directa de código**: el único punto donde el cliente decide el valor final de `codigo` es `getSiguienteCodigoDepartamento`. No hay otro call site de `crearDepartamento` en el repo (único consumidor: `departamento-form.tsx:77`).

---

## 2. Adaptación del patrón 0099 a `departamentos`

### Constraint real de la tabla — confirmado 0004, NO 0001

- `migrations/0004_inventario.sql:10-26` es la definición REAL vigente: `codigo TEXT NOT NULL CHECK (codigo ~ '^[A-Z0-9-]+$')` + `CONSTRAINT uq_departamentos_empresa_codigo UNIQUE(empresa_id, codigo)` (unicidad **por empresa**, multi-tenant correcta).
- `migrations/0001_initial_schema.sql:30-32` define una versión **anterior y superada** con `codigo TEXT UNIQUE NOT NULL` (unicidad **global**, pre-multitenant) — esta es la tabla original de un esquema que luego fue reemplazado. `0004` es la que importa (coincide con lo que confirma `seed_test_products.sql`, que inserta departamentos con `codigo` repetible entre empresas distintas sin problema, y con el propio comentario del dueño en el prompt).
- Trigger de inmutabilidad ya existe: `validate_departamento_update()` (`migrations/0004_inventario.sql:35-47`) — `BEFORE UPDATE`, revierte cualquier `UPDATE ... SET codigo = ...` con `RAISE EXCEPTION`. Esto es exactamente lo que hace viable (igual que en `productos`) que el trigger `BEFORE INSERT` reescriba `NEW.codigo` **antes** de que exista la fila — no es un `UPDATE` real, así que no dispara `validate_departamento_update()`.

### La diferencia clave: CHECK alfanumérico (`[A-Z0-9-]+`) vs. productos puramente numérico

- `productos.codigo` NO tiene CHECK de formato en Postgres (`migrations/0004_inventario.sql` tabla `productos`, sin regex) — la restricción numérica en modo `libre` vive solo en el frontend (`producto-schema.ts:17` no tiene regex, acepta cualquier string). El trigger `assign_codigo_producto` (`migrations/0099...sql:34-41`) filtra `codigo ~ '^\d+$'` sobre el `MAX`/gap-fill precisamente porque productos puede tener códigos libres no numéricos conviviendo con los correlativos.
- `departamentos.codigo` SÍ tiene CHECK `'^[A-Z0-9-]+$'` en Postgres. Esto es MÁS permisivo que el filtro numérico del trigger (acepta letras y guiones), pero el filtro `codigo ~ '^\d+$'` (o el equivalente `~ '^[0-9]+$'`, igual en Postgres) en la query de gap-fill **sigue funcionando correctamente**: solo extrae del cálculo los códigos que son puramente dígitos, e **ignora** cualquier alfanumérico (`FAC`, `COR`, `CAP`, o cualquier código con guión) sin romperse — el regex no valida el valor completo de la tabla, solo filtra qué filas participan en el `MAX`/gap-fill.
- **Confirmado con datos reales**: `migrations/seed_test_products.sql:81-93` crea departamentos semilla con `codigo = 'FAC'`, `'COR'`, `'CAP'` (puramente alfabéticos, pasan el CHECK de Postgres `[A-Z0-9-]+` pero NO el regex `^\d+$` del gap-fill). Esto es la prueba viva de que el trigger adaptado coexistiría sin conflicto: esas filas simplemente no participan en el cálculo de "primer entero libre", exactamente como sucede ya en `productos` con el precedente documentado en la exploración 0099 (sección 7, fila A).
- **Dato adicional no previsto en el problema pero relevante**: `departamentoSchema` (frontend) ya fuerza numérico puro (`^[1-9]\d*$`) para TODO departamento nuevo creado desde la UI actual — no existe modo "libre" configurable como en productos (no hay toggle en `company-data-form.tsx` para departamentos, solo existe `inventario.numeracion_modo` para `productos`). Esto significa que, a diferencia de productos, **no hay una decisión de "libre vs. correlativo" que tomar para departamentos** — hoy SIEMPRE es correlativo a nivel de intención de producto, solo que mal implementado (client-side). Los códigos alfanuméricos (`FAC`/`COR`/`CAP`) son datos legacy de seed/importación que preceden a esta regla de UI, no un modo soportado activamente.

### Gap-fill vs. MAX+1 — mismo criterio que productos

El trigger de 0099 usa gap-fill (`generate_series` + `LEFT JOIN ... WHERE p.codigo IS NULL ... LIMIT 1`), NO `MAX+1` simple. Esto aplica igual de bien a `departamentos`: si se borran/desactivan departamentos con código bajo, el próximo nuevo reutiliza el primer hueco libre en vez de crecer indefinidamente. No hay ninguna razón específica de `departamentos` para preferir `MAX+1` sobre gap-fill — mismo criterio de diseño, mismo mecanismo anti-colisión (`pg_advisory_xact_lock(hashtext(empresa_id))`).

### Propuesta de adaptación (para que `sdd-design` la desarrolle, no decidida aquí)

```sql
CREATE OR REPLACE FUNCTION assign_codigo_departamento()
RETURNS TRIGGER AS $$
DECLARE v_gap INTEGER;
BEGIN
  IF NEW.codigo IS NOT NULL AND NEW.codigo <> '' THEN
    RETURN NEW; -- ya trae codigo (no deberia pasar en el flujo normal, pero no rompe nada)
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.empresa_id::text));

  SELECT gs.n INTO v_gap
  FROM generate_series(1, COALESCE((
    SELECT MAX(codigo::INTEGER) FROM departamentos
    WHERE empresa_id = NEW.empresa_id AND codigo ~ '^\d+$'
  ), 0) + 1) AS gs(n)
  LEFT JOIN departamentos d ON d.empresa_id = NEW.empresa_id AND d.codigo = gs.n::TEXT
  WHERE d.codigo IS NULL
  ORDER BY gs.n LIMIT 1;

  NEW.codigo := v_gap::TEXT;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_codigo_departamento
  BEFORE INSERT ON departamentos
  FOR EACH ROW EXECUTE FUNCTION assign_codigo_departamento();
```

Nota: el `pg_advisory_xact_lock` usa el mismo `hashtext(empresa_id)` que `assign_codigo_producto` — comparten el mismo "namespace" de lock. Esto es aceptable porque los locks son por transacción (`_xact_lock`, se liberan al commit) y el riesgo de contención cruzada producto↔departamento de la MISMA empresa en la MISMA transacción es bajísimo (son INSERTs en tablas distintas, normalmente no concurrentes en el mismo instante exacto) — pero es una pregunta abierta válida para diseño: ¿conviene un namespace de hash distinto (p. ej. `hashtext(empresa_id || ':departamento')`) para aislar completamente los dos contadores?

---

## 3. Implicaciones del lado PowerSync

- **Confirmado**: `src/core/db/powersync/schema.ts:272-289` — la tabla `departamentos` en PowerSync NO tiene columna `codigo_status` (a diferencia de `productos`, que sí la tiene desde 0099 — `use-productos.ts:37`). Añadirla (si se decide necesaria) requeriría: (a) migración SQL (`ALTER TABLE departamentos ADD COLUMN codigo_status ...`), y (b) editar `schema.ts` para declarar la nueva columna como `column.text`.
- **Diferencia arquitectónica relevante vs. productos**: `productos` necesita `codigo_status` porque coexisten DOS modos (`libre`/`correlativo`) configurables por tenant (`inventario.numeracion_modo` en `empresas.config`), y la UI necesita distinguir "este producto está pendiente de numeración" de "código ya asignado" para filtrar selectores de venta (`use-productos.ts:56,67` — `WHERE codigo_status = 'asignado'`). **`departamentos` no tiene ese segundo modo**: siempre es correlativo (la UI ya fuerza `^[1-9]\d*$`, nunca deja que el usuario escriba un código). Esto abre una pregunta de diseño genuina: ¿es necesaria una columna `codigo_status` separada, o alcanza con tratar `codigo = ''` como el único sentinel de "pendiente" (sin ambigüedad posible, porque no existe un modo donde `codigo=''` podría ser un valor "libre" legítimo escrito por el usuario)? Esto es MÁS simple que el caso de productos — se documenta como opción a comparar en diseño, no se decide aquí.
- **Gotcha offline-first a documentar explícitamente**: el INSERT local SIEMPRE tiene éxito instantáneamente (SQLite no tiene el trigger ni el CHECK regex de Postgres). El trigger server-side SOLO corre cuando PowerSync sube el INSERT al conector y este llega a Postgres. Entre esos dos momentos, el departamento existe localmente con `codigo = ''` (o lo que se envíe como placeholder) y es completamente usable — incluyendo que un usuario podría intentar asignarle un producto antes de que el código final llegue de vuelta por el sync download path. Esto es idéntico al comportamiento ya aceptado para `productos` en modo `correlativo` (ver `producto-form.tsx:1733-1737`, mensaje "El código se asignará al sincronizar").
- **Efecto directo en UI existente que hay que tocar**: `departamento-form.tsx:36-40` hoy PRE-RELLENA el input con el resultado de `getSiguienteCodigoDepartamento` ANTES de que el usuario guarde — eso deja de tener sentido si el servidor decide el código real (el valor mostrado sería una preview potencialmente incorrecta bajo concurrencia). El patrón de productos (`producto-form.tsx:2065`: "Siguiente código: PENDIENTE (asignado por el servidor)") es el precedente UX a replicar: mostrar un mensaje de estado, no un número adivinado.
- **Orden/visualización ya tolera el estado pendiente sin crash**: `CAST('' AS INTEGER)` en SQLite no lanza error (devuelve `0`), así que un departamento con `codigo=''` temporalmente simplemente ordena primero en `ORDER BY CAST(d.codigo AS INTEGER) ASC` — comportamiento tolerable pero vale la pena decidir en diseño si se quiere una UI que distinga visualmente "pendiente" (badge) igual que hace la lista de productos.
- **Sync rules**: confirmado en `backend/powersync-sync-rules.yaml:82` — `departamentos` sincroniza vía `SELECT * FROM departamentos WHERE empresa_id = bucket.empresa_id` (bucket `empresa[]` estándar, mismo mecanismo que ya usa `productos`). Agregar una columna nueva (si se decide) **no requiere tocar las sync rules** — el `SELECT *` la incluye automáticamente, solo hace falta declararla en `schema.ts`.

---

## 4. Remediación de datos huérfanos existentes

Hoy existe en producción (confirmado por logs del reporte) al menos:
- 1 departamento descartado del lado servidor que sigue vivo solo en SQLite local (`id = 7cac7b70-590f-4255-91d6-d91aedb1022e`), nunca llegó a existir en Postgres.
- Al menos 1 producto cuyo `departamento_id` apunta a ese UUID — ese producto también fue descartado al sincronizar (FK violation `23503`), por lo que tampoco existe en Postgres.

No se encontró en el repo ningún script de limpieza, migración de reparación, ni mención de este UUID específico (`grep` sobre `src/` y `migrations/` no arrojó coincidencias) — es un caso vivo solo en el entorno real, no documentado en código.

**Opciones a comparar en `sdd-design` (no se elige aquí):**

| Opción | Descripción | Pros | Contras |
|---|---|---|---|
| A. Dejar que el usuario vuelva a crear manualmente | Sin automatización: el usuario borra/ignora el departamento huérfano local (invisible para el servidor) y recrea el departamento y producto desde cero una vez el fix esté desplegado | Cero código adicional, cero riesgo de tocar datos en producción | Pérdida de cualquier dato ya cargado en el producto huérfano (precios, stock, etc.); requiere que el usuario sepa qué registro es "fantasma" — no hay indicador visual hoy que distinga "sincronizado" de "solo local" |
| B. Script de reparación one-shot (SQL o utilitario) que detecta filas locales nunca confirmadas en servidor y las re-emite con un nuevo INSERT (nuevo `id`, o el mismo `id` reenviado tras el fix) | Recupera el dato ya cargado sin pedirle al usuario que recuerde/recree manualmente | Requiere lógica para distinguir "fila local pendiente de sync" vs. "fila realmente huérfana rechazada" — PowerSync no expone nativamente un log de operaciones FATAL descartadas al cliente, así que la detección tendría que ser manual/ad-hoc (comparar IDs locales contra una query a Postgres) |
| C. UI de "estado de sincronización" por registro que marca visualmente los que nunca confirmaron, dejando que el propio fix (una vez desplegado) los re-intente de forma transparente | Resuelve el problema de raíz para CUALQUIER registro futuro que falle silenciosamente, no solo este caso puntual | Es exactamente el alcance de "Problema B" (ver sección 6) — EXPLÍCITAMENTE fuera de alcance de este change; mencionarlo aquí es solo para que `sdd-design` sepa que no debe intentar resolverlo de pasada |

Nota importante para diseño: una vez el trigger server-side esté desplegado, el departamento huérfano actual NO se autorepara solo porque el código ahora se asigne en el servidor — ese INSERT específico ya fue intentado y descartado por PowerSync (operación FATAL removida de la cola de upload). Hace falta una acción explícita (alguna de las opciones arriba) para que ese registro puntual llegue a existir en Postgres.

---

## 5. Próximo número de migración

- Última migración confirmada en el directorio: `migrations/0099_producto_numeracion_correlativa.sql`.
- No existe ningún archivo `0100_*` todavía (`Glob` sobre `migrations/01*.sql` no arrojó resultados).
- **Siguiente número libre: `0100`.** Sin colisión.

---

## 6. Explícitamente fuera de alcance

El trabajo más amplio de "visibilidad de errores de sync de PowerSync / bloquear operaciones sobre registros en conflicto" (p. ej. mostrar al usuario qué registros nunca confirmaron en el servidor, reintentar automáticamente, o impedir nuevas operaciones sobre un registro con upload pendiente/fallido) es un **change futuro separado** ("Problema B"). Este change NO debe intentar resolver esa resiliencia general — solo debe eliminar la causa raíz puntual (asignación client-side de `codigo` para `departamentos`) usando el mismo mecanismo ya validado para `productos`.

---

## Approaches

1. **Trigger `BEFORE INSERT` con gap-fill + advisory lock, sin columna `codigo_status` nueva** (sentinel `codigo = ''`)
   - Pros: más simple que el caso productos (no hay modo "libre" que desambiguar), no toca `schema.ts` ni requiere migración de columna nueva, menor blast radius
   - Cons: la UI debe tratar `codigo === ''` como sentinel mágico en vez de un estado explícito y queryable; si en el futuro `departamentos` adopta un modo "libre" configurable (hoy no existe, pero no se puede descartar), este sentinel se volvería ambiguo igual que productos tuvo que resolver con `codigo_status`
   - Esfuerzo: Bajo

2. **Trigger `BEFORE INSERT` con gap-fill + advisory lock + columna `codigo_status` nueva (replica exacta del patrón 0099)**
   - Pros: consistencia total con el patrón ya establecido para `productos`; estado explícito y queryable; a prueba de futuro si `departamentos` alguna vez necesita un modo "libre"
   - Cons: requiere migración de columna + cambio en `schema.ts` + actualizar todos los `SELECT *` / tipos TS (`Departamento` interface en `use-departamentos.ts:7-17`) que hoy no esperan ese campo; sobre-ingeniería si nunca va a existir un modo "libre" para departamentos
   - Esfuerzo: Medio

## Recomendación

Preliminar (a confirmar/decidir formalmente en `sdd-design`): la Opción 1 (sentinel `codigo=''`, sin `codigo_status`) parece más alineada con el principio YAGNI dado que `departamentos` no tiene ni ha tenido nunca un modo "libre" — a diferencia de `productos`, donde el toggle `libre`/`correlativo` ya existe y es la razón de ser de `codigo_status`. Esta exploración NO cierra la decisión; solo documenta ambas opciones con evidencia concreta para que diseño elija con criterio.

## Risks

- Carrera de gap-fill intra-empresa entre INSERTs concurrentes de `departamentos` (mismo riesgo teórico ya aceptado en `assign_codigo_producto` y `assign_nro_caja`, mitigado por `pg_advisory_xact_lock`, nunca estresado en producción por bajo volumen de creación de departamentos).
- Reusar el mismo namespace de advisory lock (`hashtext(empresa_id)`) entre el trigger de productos y el de departamentos podría serializar INSERTs de ambas tablas en la misma transacción/empresa sin necesidad real — evaluar namespace separado en diseño.
- Dato huérfano ya existente en producción (departamento + producto) no se autorepara con el fix — requiere decisión explícita de remediación (sección 4) antes o junto con el despliegue.
- Cambiar `departamento-form.tsx` para dejar de pre-rellenar el código visualmente es un cambio de UX visible que debe comunicarse/validarse, no solo un cambio de backend transparente.
- Si se elige la Opción 2 (columna `codigo_status`), el blast radius toca `Departamento` (tipo TS), `schema.ts`, y cualquier otro lugar que haga `SELECT *` o destructure del objeto — auditar todos los consumidores antes de implementar.

## Ready for Proposal

**Sí.** Hay evidencia concreta y verificada por lectura directa de código para avanzar a `sdd-propose`: la causa raíz ya estaba confirmada por el dueño, el patrón server-side (0099) fue mapeado línea por línea, se confirmó que el CHECK alfanumérico de Postgres (`0004`, no `0001`) convive sin conflicto con un filtro numérico de gap-fill (datos reales `FAC`/`COR`/`CAP` como prueba), se identificó la diferencia arquitectónica real con productos (sin modo "libre", por lo que `codigo_status` podría no ser necesario), se listaron opciones de remediación del dato huérfano sin elegir una, y se confirmó `0100` como siguiente número de migración libre. Las preguntas abiertas (necesidad real de `codigo_status`, namespace del advisory lock, opción concreta de remediación del huérfano) deben resolverse explícitamente en `sdd-design`.
