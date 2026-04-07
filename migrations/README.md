# Migraciones SQL - ClaraPOS

Esta carpeta contiene todas las migraciones de base de datos del proyecto, ordenadas
secuencialmente. Se aplican sobre el proyecto de Supabase desde el SQL Editor.

## Convencion

```
NNNN_descripcion_corta.sql
```

- **NNNN**: Numero de 4 digitos, secuencial, comenzando en `0001`. Define el orden
  obligatorio de aplicacion. Nunca se reutiliza.
- **descripcion_corta**: snake_case en ingles o espanol, descriptivo.
- **Idempotente**: Toda migracion debe poder ejecutarse mas de una vez sin romper
  nada (usar `IF NOT EXISTS`, `DROP POLICY IF EXISTS`, bloques `DO $$ ... END $$`
  con `to_regclass()`, etc.).

## Migraciones actuales

| # | Archivo | Proposito |
|---|---------|-----------|
| 0001 | `0001_initial_schema.sql` | Schema base completo: tablas, indices, triggers de inmutabilidad, RLS policies, funcion `current_empresa_id()`, edge functions stubs. Es el setup fundacional del proyecto. |
| 0002 | `0002_fix_rls_recursion.sql` | Patch idempotente que arregla la recursion infinita en RLS (PostgreSQL error `42P17`) reemplazando subqueries recursivas por la funcion `current_empresa_id()`. **Solo necesario en bases de datos creadas antes de incorporar el fix a `0001_initial_schema.sql`**. En instalaciones nuevas es un no-op (no rompe nada al ejecutarse). |

## Como aplicar

### Instalacion nueva (proyecto Supabase recien creado)

1. Abrir el SQL Editor del Dashboard de Supabase.
2. Pegar y ejecutar `0001_initial_schema.sql` completo.
3. Listo. (Opcionalmente puedes correr `0002` para verificar; no rompe nada.)

### Base de datos existente con bug de RLS recursion

1. Abrir el SQL Editor del Dashboard de Supabase.
2. Pegar y ejecutar `0002_fix_rls_recursion.sql` completo.
3. Verificar con: `SELECT public.current_empresa_id();` - debe devolver el UUID
   de tu empresa, no error 42P17.

### Agregar una nueva migracion

1. Identificar el siguiente numero disponible (`ls migrations/` y mirar el ultimo).
2. Crear el archivo: `0003_descripcion.sql`.
3. Escribirla idempotente.
4. Probarla en un proyecto Supabase de pruebas antes de aplicarla en produccion.
5. Al hacer commit, incluir el archivo en el mismo commit que el codigo de la
   feature que la requiere.

## Reglas

- **Nunca editar una migracion ya aplicada** en produccion. Si necesitas cambiarla,
  crea una nueva migracion correctiva con el siguiente numero.
- **Nunca borrar una migracion** del historial. Si quedo obsoleta, crea una nueva
  que la revierta.
- **Las migraciones son append-only**, igual que un kardex.
- **Los nombres de tabla, columnas, RLS policies y funciones deben coincidir**
  con lo que el frontend espera (ver `src/core/db/powersync/schema.ts` y
  `src/core/db/kysely/types.ts`).
