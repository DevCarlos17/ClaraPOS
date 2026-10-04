# Design: Asignación server-side de `departamentos.codigo`

## Technical Approach

Replicar exactamente el mecanismo de `assign_codigo_producto` (0099) sin la pieza que no aplica (`codigo_status`), per Decisión 1 del proposal. Trigger `BEFORE INSERT` en Postgres calcula `codigo` via gap-fill bajo `pg_advisory_xact_lock` con namespace propio y reescribe `NEW.codigo` antes de que el CHECK `'^[A-Z0-9-]+$'` y el `NOT NULL` se evalúen. Cliente deja de calcular nada: envía `codigo: ''`. PowerSync no cambia (sin columnas nuevas, sin cambios de sync rules).

## Architecture Decisions

| Decisión | Elegido | Alternativa descartada | Por qué |
|---|---|---|---|
| Columna `codigo_status` | No agregar | Replicar 0099 completo | `departamentos` no tiene modo "libre"; `codigo=''` es sentinel sin ambigüedad (ya decidido en proposal, Decisión 1) |
| Namespace advisory lock | `hashtext(empresa_id \|\| ':departamento')` | Compartir `hashtext(empresa_id)` con productos | Aísla contadores independientes sin costo real (ya decidido, Decisión 2) |
| Idempotencia del trigger | `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` | `CREATE TRIGGER` directo (como hizo 0099) | `migrations/README.md:15-17` exige idempotencia; patrón confirmado en 0087, 0086, 0065, 0060, 0041, 0015 — 0099 es la excepción, no la regla a seguir |
| Guard de `v_gap IS NULL` | `RAISE EXCEPTION` explícito | Dejar que el `NOT NULL`/CHECK de la tabla lo capture | Falla antes y con mensaje claro; el gap-fill matemáticamente siempre encuentra hueco (pigeonhole), pero es defensa barata contra un bug futuro en la query |

## Migración 0100 (SQL completo)

```sql
-- ============================================================
-- 0100_departamento_codigo_server_side.sql
-- Asignacion server-side de departamentos.codigo (gap-fill + advisory lock)
--
-- Replica el patron de 0099 (productos) SIN columna codigo_status:
-- departamentos nunca tuvo modo "libre" configurable, por lo que
-- codigo = '' (o NULL) es sentinel suficiente de "pendiente de
-- asignacion". El trigger BEFORE INSERT calcula el primer entero
-- >=1 libre por empresa_id (gap-fill, no MAX+1) bajo un advisory
-- lock con namespace PROPIO (':departamento', separado del
-- namespace de productos para evitar contencion cruzada sin
-- motivo) y reescribe NEW.codigo antes de que Postgres valide
-- NOT NULL / CHECK '^[A-Z0-9-]+$' (mismo orden de evaluacion que
-- assign_codigo_producto, 0099, y assign_nro_caja, 0040: los
-- triggers BEFORE INSERT corren antes de que los constraints se
-- evaluen sobre la fila final).
--
-- codigo permanece NOT NULL + CHECK: nunca se persiste '' en
-- Postgres. Codigos legacy alfabeticos (FAC/COR/CAP) no participan
-- del gap-fill (filtro '^\d+$') y siguen existiendo sin conflicto.
-- ============================================================

CREATE OR REPLACE FUNCTION assign_codigo_departamento()
RETURNS TRIGGER AS $$
DECLARE v_gap INTEGER;
BEGIN
  IF NEW.codigo IS NOT NULL AND NEW.codigo <> '' THEN
    RETURN NEW; -- defensivo: la UI actual nunca envia codigo propio
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.empresa_id::text || ':departamento'));

  SELECT gs.n INTO v_gap
  FROM generate_series(1, COALESCE((
    SELECT MAX(codigo::INTEGER) FROM departamentos
    WHERE empresa_id = NEW.empresa_id AND codigo ~ '^\d+$'
  ), 0) + 1) AS gs(n)
  LEFT JOIN departamentos d ON d.empresa_id = NEW.empresa_id AND d.codigo = gs.n::TEXT
  WHERE d.codigo IS NULL
  ORDER BY gs.n LIMIT 1;

  IF v_gap IS NULL THEN
    RAISE EXCEPTION 'No se pudo calcular codigo de departamento para empresa %', NEW.empresa_id;
  END IF;

  NEW.codigo := v_gap::TEXT;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_codigo_departamento ON departamentos;

CREATE TRIGGER trg_assign_codigo_departamento
  BEFORE INSERT ON departamentos
  FOR EACH ROW EXECUTE FUNCTION assign_codigo_departamento();
```

**Conflicto con `validate_departamento_update()`**: ninguno. Ese trigger es `BEFORE UPDATE` (`0004_inventario.sql:35-47`), rechaza `UPDATE ... SET codigo = X`. El nuevo trigger es `BEFORE INSERT` — reescribe `NEW.codigo` antes de que la fila exista; no es un `UPDATE`, nunca lo dispara. Mismo razonamiento documentado en proposal §Approach.

**Edge case CHECK regex**: `codigo ~ '^[A-Z0-9-]+$'` exige 1+ caracteres — una fila con `codigo=''` fallaría ese CHECK. Esto nunca ocurre porque el trigger `BEFORE INSERT` reescribe `NEW.codigo` a un entero no vacío ANTES de que Postgres evalúe el CHECK (los constraints se validan sobre la fila final post-triggers `BEFORE INSERT`, no sobre el valor original enviado por el cliente). Si `v_gap` fuera `NULL` por algún bug futuro, el `RAISE EXCEPTION` explícito falla primero con mensaje claro, nunca llega a probar el CHECK con `''`.

## Client Changes

| Archivo | Cambio |
|---|---|
| `use-departamentos.ts` | `crearDepartamento` ya no llama `getSiguienteCodigoDepartamento`; INSERT envía `codigo: ''`. **Eliminar `getSiguienteCodigoDepartamento` por completo** (único consumidor confirmado: `departamento-form.tsx:36-40`, exploration §1). |
| `departamento-form.tsx` | Quitar `import { getSiguienteCodigoDepartamento }`, quitar el `.then/.catch` del `useEffect` (líneas 36-40). El `useEffect` para "Nuevo Departamento" solo hace `setCodigo('')`. Input ya es `readOnly disabled`; cambiar texto de ayuda de `"El codigo se asigna automaticamente"` a `"PENDIENTE (asignado por el servidor)"` — copy idéntico al precedente de `producto-form.tsx:2065` para consistencia UX entre formularios. |
| `departamento-schema.ts` | `codigo` pasa a `z.string().optional().default('')` SIN el `.regex(/^[1-9]\d*$/)` en el schema usado al crear. El regex numérico ya no tiene sentido validar client-side: el servidor es la única fuente de verdad del valor. Si `departamentoSchema` se reutiliza para editar (no aplica hoy — `actualizarDepartamento` no toca `codigo`), no hay conflicto. `handleSubmit` en el form pasa a `safeParse({ nombre, is_active: true })` sin `codigo` en el payload. |
| `use-departamentos.test.ts` | No requiere cambios obligatorios: el `describe` existente no cubre `getSiguienteCodigoDepartamento` ni asserta el valor de `codigo` en el INSERT. Opcional: agregar un test que asserte `values.codigo === ''` en el payload de `crearDepartamento` (ver Testing Strategy). |

## PowerSync `schema.ts`

**Confirmado: NO requiere cambio.** `schema.ts:272-289` (tabla `departamentos`) ya declara solo `codigo: column.text` — no tiene `codigo_status` (a diferencia de `productos`, línea 381). Decisión 1 del proposal (sin columna nueva) hace que este archivo quede intacto. Sync rules (`powersync-sync-rules.yaml:82`, `SELECT * ... WHERE empresa_id = bucket.empresa_id`) tampoco cambian.

## Immutability & Offline-First Interplay

Orden de evaluación en Postgres: trigger `BEFORE INSERT` → constraints (`NOT NULL`, `CHECK`, `UNIQUE`) sobre la fila ya reescrita. El INSERT local en SQLite (sin triggers, sin CHECK) persiste `codigo=''` instantáneamente — el departamento es usable de inmediato. Cuando PowerSync sube esa operación, el trigger reescribe `codigo` a un entero antes de cualquier validación; el valor final llega de vuelta al cliente vía *sync download* y sobrescribe la fila local. Esto NO es un `UPDATE` real desde la perspectiva de Postgres (es la primera y única escritura de esa fila), por lo que `trg_validate_departamento_update` (inmutabilidad de `codigo` post-creación) nunca se dispara — coherente con el mismo patrón ya en producción para `productos` desde 0099.

## Testing Strategy

| Capa | Qué se puede probar en Vitest | Qué NO (requiere Postgres real) |
|---|---|---|
| `crearDepartamento` | Payload del INSERT: assert `values.codigo === ''` (mock de `kysely`, mismo patrón que tests existentes) | — |
| `departamentoSchema` | `safeParse({ nombre, is_active: true })` sin `codigo` pasa; `codigo` opcional no rompe validación | — |
| `assign_codigo_departamento()` (gap-fill, advisory lock, reescritura de `NEW.codigo`) | **Nada.** SQLite local no tiene triggers ni `pg_advisory_xact_lock` | Todo: gap-fill correcto, exclusión de códigos alfabéticos (`FAC`/`COR`/`CAP`), atomicidad bajo concurrencia, interacción con el CHECK regex. Verificar manualmente contra el proyecto Supabase de pruebas (SQL Editor) antes de desplegar a producción — **no hay cobertura automatizada de este trigger en el repo, igual que 0099 no la tiene**. |

`sdd-apply`/`sdd-verify` no deben reportar el trigger como "cubierto por tests" — es verificación manual explícita, documentada aquí para que no se asuma falsamente TDD completo.

## Deployment Order (crítico)

1. **Aplicar `migrations/0100_...sql` en Supabase PRIMERO.**
2. Desplegar el cambio de frontend después.

Si el frontend se despliega antes de que el trigger exista en Postgres, un cliente que envíe `codigo=''` haría que Postgres intente persistir `''` contra `CHECK (codigo ~ '^[A-Z0-9-]+$')` sin el trigger que lo reescriba → rechazo `23514`, mismo failure mode silencioso que esta propuesta busca eliminar (PowerSync descarta la operación FATAL). Mismo gotcha ya documentado para 0099.

## Rollback

```sql
DROP TRIGGER IF EXISTS trg_assign_codigo_departamento ON departamentos;
DROP FUNCTION IF EXISTS assign_codigo_departamento();
```
Sin migración de columna, sin dato destructivo (Decisión 1). Revertir el frontend = revertir el commit (vuelve a pre-rellenar vía `getSiguienteCodigoDepartamento`). Orden de rollback: revertir frontend primero si aún envía `codigo=''` sin el trigger causaría el mismo `23514` — o dejar ambos desplegados consistentemente y revertir juntos.

## Open Questions

Ninguna bloqueante. El único punto no automatizable (cobertura del trigger) queda documentado explícitamente arriba, no es una pregunta abierta sino una limitación aceptada y declarada (igual que 0099).
