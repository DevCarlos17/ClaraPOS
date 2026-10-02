# Design: Numeración configurable de código de producto (`libre` vs `correlativo`)

## Technical Approach

Trigger `BEFORE INSERT` en `productos` (estructura de `assign_nro_caja`, migración 0040) decide: si `NEW.codigo` llega vacío, calcula gap-fill bajo `pg_advisory_xact_lock` por empresa; si llega con valor (modo `libre`), no lo toca. Un único INSERT real en Postgres — sin `UPDATE` separado, sin loop de sync. Config por empresa vía `empresas.config` (namespace `inventario`, patrón `readConfigNamespace`/`serializeConfigNamespace` ya probado).

## Architecture Decisions

### Q1 — Representación de PENDIENTE: `codigo=''` + `codigo_status` (variante de Opción A, SIN nullable)

| Opción | Tradeoff |
|---|---|
| A clásica (`codigo` nullable + `codigo_status`) | Correcta, pero `Producto.codigo: string\|null` se propaga a **245 call-sites** (`grep '\.codigo\b'` en `src/features`) — la mayoría leen `.codigo` de ventas/compras/reportes históricos que NUNCA son PENDIENTE |
| B (sentinel string) | Magic string filtrable por accidente en búsquedas/exports |
| C (`codigo` nullable, sin status) | Mismo blast radius que A sin ganar claridad de negocio |
| **Elegida: `codigo=''` transitorio + `codigo_status TEXT` nuevo** | `Producto.codigo` SIGUE siendo `string` (cero cambios de tipo en los 245 sitios); solo se agrega 1 campo nuevo. Postgres NO necesita `DROP NOT NULL` en `codigo` — el trigger `BEFORE INSERT` siempre reescribe `NEW.codigo` antes de que Postgres valide el constraint `NOT NULL` (mismo orden de evaluación que ya usa `assign_nro_caja`), así que `''` NUNCA persiste en Postgres |

`codigo_status TEXT NOT NULL DEFAULT 'asignado' CHECK (codigo_status IN ('pendiente','asignado'))` es la ÚNICA fuente de verdad para "¿es usable?" — nunca comparar `codigo === ''` en lógica de negocio, eso es solo el valor cosmético transitorio local antes del primer sync.

### Q2 — Atomicidad del gap-fill: `pg_advisory_xact_lock(hashtext(empresa_id::text))`

| Opción | Tradeoff |
|---|---|
| **Elegida: advisory lock por empresa** | Serializa inserts de la MISMA empresa; se libera solo al commit/rollback (`_xact`); extiende el patrón 0040 sin tabla nueva |
| `SELECT...FOR UPDATE` | Frágil con tabla vacía o hueco antes de la primera fila (nada que lockear) |
| Tabla `producto_correlativo_seq` | Añade una tabla y una fuente de verdad más para mantener sincronizada; innecesaria para gap-fill (no es un contador simple) |

```sql
CREATE OR REPLACE FUNCTION assign_codigo_producto()
RETURNS TRIGGER AS $$
DECLARE v_gap INTEGER;
BEGIN
  IF NEW.codigo IS NOT NULL AND NEW.codigo <> '' THEN
    RETURN NEW; -- modo libre: cliente ya definio codigo
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.empresa_id::text));

  SELECT gs.n INTO v_gap
  FROM generate_series(1, COALESCE((
    SELECT MAX(codigo::INTEGER) FROM productos
    WHERE empresa_id = NEW.empresa_id AND codigo ~ '^\d+$'
  ), 0) + 1) AS gs(n)
  LEFT JOIN productos p ON p.empresa_id = NEW.empresa_id AND p.codigo = gs.n::TEXT
  WHERE p.codigo IS NULL
  ORDER BY gs.n LIMIT 1;

  NEW.codigo := v_gap::TEXT;
  NEW.codigo_status := 'asignado';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_codigo_producto
  BEFORE INSERT ON productos
  FOR EACH ROW EXECUTE FUNCTION assign_codigo_producto();
```

`generate_series(1, MAX+1)` garantiza candidato siempre (el valor `MAX+1` nunca tiene fila, el `LEFT JOIN` lo detecta) — termina siempre, sin loop infinito.

### D3 — Config UI: "Datos de la Empresa" (no sección nueva)

`company-data-form.tsx` ya tiene el patrón exacto a replicar (`moneda_presentacion_documentos` vía `parseEmpresaConfig`/`serializeEmpresaConfig`). Se agrega un `Select` nuevo usando `readConfigNamespace(company.config, 'inventario', { numeracion_modo: 'libre' })` / `serializeConfigNamespace(..., 'inventario', { numeracion_modo })`. No existe sección "Inventario" en Configuración hoy — crear una solo para este toggle sería sobre-ingeniería.

### D4 — "Último código": cronológico, confirmado

`ORDER BY created_at DESC, id DESC LIMIT 1` (se agrega `id DESC` como tiebreaker defensivo adicional al fix de causa raíz). Esta ayuda SOLO renderiza en modo `libre` (SC-F1); en `correlativo` se reemplaza por el texto de D5.

### D5 — Copy en formulario (modo `correlativo`, alta nueva)

- Input: `disabled`, `value=""`, sin placeholder "Ej: PROD-001".
- Texto bajo el input (reemplaza "Último código creado"): `Siguiente código: PENDIENTE (asignado por el servidor)`.
- Toast al guardar (online u offline, mismo mensaje — honesto en ambos casos porque el round-trip siempre es async): `Producto guardado. El código se asignará al sincronizar.`
- `producto-list.tsx`: si `codigo_status === 'pendiente'`, badge `PENDIENTE` (mismo estilo `bg-amber-50 text-amber-700 ring-amber-600/20` ya usado en la lista) en la columna código, en vez del valor vacío.

### D6 — PowerSync: sin cambios de sync rules, 1 columna nueva en schema local

`backend/powersync-sync-rules.yaml` ya sincroniza `productos` completo (`SELECT * FROM productos WHERE empresa_id = bucket.empresa_id`) — `codigo_status` viaja gratis, sin tocar el YAML. Sí se requiere `ALTER PUBLICATION powersync ADD COLUMN` no existe en Postgres (las columnas nuevas de una tabla ya publicada se replican automáticamente). `schema.ts` (PowerSync local) agrega `codigo_status: column.text` a la `Table` de `productos` — sin NOT NULL real (SQLite local vía PowerSync no impone constraints de columna).

## Data Model Changes

**`migrations/0099_producto_numeracion_correlativa.sql`** (nuevo):
1. `ALTER TABLE productos ADD COLUMN codigo_status TEXT NOT NULL DEFAULT 'asignado' CHECK (codigo_status IN ('pendiente','asignado'));` — metadata-only, filas existentes quedan `'asignado'`.
2. `CREATE OR REPLACE FUNCTION assign_codigo_producto()` + `CREATE TRIGGER trg_assign_codigo_producto BEFORE INSERT` (pseudocódigo arriba).
3. `codigo` permanece `NOT NULL` — SIN `ALTER COLUMN ... DROP NOT NULL` (ver Q1).

**`src/core/db/powersync/schema.ts`**: agregar `codigo_status: column.text` a `productos` (línea ~348-383).

## Frontend Design

**`producto-form.tsx`**:
- Nuevo: `const { company } = useCompany(); const { numeracion_modo } = readConfigNamespace(company?.config, 'inventario', { numeracion_modo: 'libre' as 'libre' | 'correlativo' })`.
- Input código: `disabled={isEditing || (!isEditing && numeracion_modo === 'correlativo')}`.
- Helper (líneas 2035-2042): condicional por modo — `libre` muestra "Último código creado" (query existente, fix D4); `correlativo` muestra copy D5.
- Submit (línea ~1658): si `correlativo` y `!isEditing`, enviar `codigo: '', codigo_status: 'pendiente'` a `crearProducto`; si `libre`, `codigo: parsed.data.codigo, codigo_status: 'asignado'`.
- `producto-schema.ts`: `codigo` pasa a `z.string().transform(v => v.toUpperCase())` sin `.min(1)` obligatorio — la validación de "requerido" se mueve a nivel de formulario (solo exigir no-vacío cuando `numeracion_modo === 'libre'`).

**`use-productos.ts`**:
- `Producto.codigo_status: string` nuevo campo (tipo no cambia, `codigo` sigue `string`).
- `crearProducto()`: acepta `codigo_status?: 'pendiente' | 'asignado'` (default `'asignado'`, backward-compatible).
- **Filtro de exclusión operativa (Req 5)**: agregar `AND codigo_status = 'asignado'` al WHERE de `useProductosActivos` y `useProductosTipo` — son los dos hooks consumidos por POS (`pos-terminal.tsx`/`use-ventas.ts` vía `producto-buscador.tsx`), recetas, ajustes, compras y kardex. `useProductos()` (usado solo por `producto-list.tsx`, inventario) NO filtra — debe mostrar PENDIENTE con indicador (SC-E4).
- `use-ventas.ts` línea 224-235 (búsqueda POS con `LIKE` directo, no usa `use-productos.ts`): agregar el mismo `AND codigo_status = 'asignado'`.

**`import-productos-modal.tsx`** (fix D4, independiente del modo):
- Línea 633: mover `const now = localNow()` DENTRO del `.map()` de `productoInserts` (línea ~637) y del de `productoUpdates` (línea ~682) — cada fila obtiene su propio timestamp.
- Import masivo siempre inserta en modo `libre` explícito (`codigo_status: 'asignado'`), nunca dispara el flujo PENDIENTE — coherente con que el import ya trae códigos definidos por archivo.

## File-by-File Change Map

| File | Action | Change |
|---|---|---|
| `migrations/0099_producto_numeracion_correlativa.sql` | Create | Columna `codigo_status` + trigger `assign_codigo_producto` |
| `src/core/db/powersync/schema.ts` | Modify | `codigo_status: column.text` en tabla `productos` |
| `src/features/inventario/hooks/use-productos.ts` | Modify | `Producto.codigo_status`, `crearProducto()` param, filtro en `useProductosActivos`/`useProductosTipo` |
| `src/features/ventas/hooks/use-ventas.ts` | Modify | Filtro `codigo_status='asignado'` en búsqueda POS (línea ~224-235) |
| `src/features/inventario/schemas/producto-schema.ts` | Modify | `codigo` sin `.min(1)` fijo; validación condicional por modo en el form |
| `src/features/inventario/components/productos/producto-form.tsx` | Modify | Lectura de `numeracion_modo`, input read-only condicional, helper D4/D5, submit condicional |
| `src/features/inventario/components/productos/producto-list.tsx` | Modify | Badge `PENDIENTE` cuando `codigo_status==='pendiente'` |
| `src/features/inventario/components/productos/import-productos-modal.tsx` | Modify | `localNow()` dentro de cada loop (líneas 633/637, 682) |
| `src/features/configuracion/components/company-data-form.tsx` | Modify | Select `numeracion_modo` vía `readConfigNamespace`/`serializeConfigNamespace`, namespace `inventario` |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `producto-schema.ts` validación condicional; `import-productos-modal` timestamps únicos por fila | Vitest (patrón existente en `schemas/__tests__`) |
| Integration DB | SC-C1/C2/C4/C3 (gap-fill, modo mixto, cambio de modo) | SQL manual contra Supabase staging — proyecto no tiene harness de integración DB |
| Manual | SC-X1 (concurrencia), SC-X2 (idempotencia PowerSync), SC-F3/F4 (offline→sync) | Checklist pre-merge (sin infraestructura de testing automatizado, confirmado en spec #4716) |

## Migration / Rollout

- `codigo_status DEFAULT 'asignado'` — tenants existentes sin cambio de comportamiento.
- Trigger es aditivo: `DROP TRIGGER trg_assign_codigo_producto` revierte limpio sin tocar datos.
- `numeracion_modo` default `'libre'` — ningún tenant queda en `correlativo` sin elegirlo explícitamente.

## Open Questions

None — todas las preguntas del proposal (Q1, Q2, D3-D6) quedaron resueltas arriba.
