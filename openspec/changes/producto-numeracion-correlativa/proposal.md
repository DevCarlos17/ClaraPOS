# Proposal: Numeración configurable de código de producto (`libre` vs `correlativo`)

## Intent

El código de producto es hoy texto libre sin garantías (`producto-schema.ts:5` solo exige no-vacío). Para negocios de alto volumen esto obliga a numerar manualmente y es propenso a error. Además, la ayuda visual "Último código creado" (`producto-form.tsx:544-551`) muestra un valor arbitrario tras un import masivo: `import-productos-modal.tsx:633` llama `localNow()` una sola vez fuera del loop, así que todas las filas importadas comparten `created_at` y el `ORDER BY created_at DESC LIMIT 1` desempata sin criterio.

Se introduce una config por empresa con dos modos — `libre` (actual, corregido) y `correlativo` (nuevo, asignación server-side) — para que cada tenant elija su nivel de control sobre la numeración, sin imponer un único comportamiento a todos los negocios del SaaS.

## Scope

### In Scope
- Config por empresa `inventario.numeracion_modo: 'libre' | 'correlativo'` en `empresas.config` (JSONB), vía `readConfigNamespace`/`serializeConfigNamespace` (`use-company.ts`). Default `'libre'` (sin cambio de comportamiento para tenants existentes).
- Modo `correlativo`: input de código READ-ONLY en el form; servidor asigna el **primer entero ≥ 1 que no existe todavía** (gap-fill) por `empresa_id` vía trigger Postgres `BEFORE INSERT` en `productos`. Ej: existen `1,2,5` → asigna `3`, luego `4`, luego `6`. Solo cuentan códigos puramente enteros (`/^\d+$/`); códigos mixtos (`PRO-1`) se ignoran y quedan intactos. Se reutiliza la ESTRUCTURA del patrón probado `assign_nro_caja()` (`migrations/0040_nro_caja.sql`, trigger `BEFORE INSERT` sin `UPDATE` separado → sin loop de sync), pero el cálculo cambia de `MAX+1` a gap-fill, lo que exige lock explícito por empresa (ver Riesgos).
- Estado PENDIENTE: productos creados offline en modo `correlativo` no son usables (POS, recetas, ajustes, búsquedas) hasta que el round-trip de sync confirme el código asignado por el servidor. Se acepta explícitamente este tradeoff.
- **Fix del bug de "último código creado" en modo `libre`**: corregir `localNow()` dentro del loop de `import-productos-modal.tsx` para que cada fila tenga su propio `created_at`, y ajustar la query/semántica de "último" para que sea determinística. Se incluye en este change porque vive en el mismo formulario, es la misma área de código, y sin el fix el mensaje "Último código creado" sigue siendo engañoso también en modo `libre` (que seguirá siendo el modo por defecto de la mayoría de tenants).
- UI de toggle del modo en Configuración (sección a definir en diseño).

### Out of Scope
- Migrar `nro_factura`/`nro_ncr`/`nro_ndb` al mismo patrón de trigger server-side (precedente que este change sienta, pero no ejecuta — ver regla de negocio #12).
- Migración/normalización/renombrado retroactivo de códigos existentes al activar `correlativo` (los viejos quedan intactos; el gap-fill convive con ellos rellenando los huevos enteros libres). El relleno de huecos NO renombra nada: solo elige, para productos NUEVOS, el primer entero disponible.
- Cambiar el mecanismo client-side `MAX+1` de `departamentos` (bajo volumen, sin problema reportado).

## Capabilities

### New Capabilities
- `producto-numeracion`: config por empresa de modo de numeración de código de producto (`libre`/`correlativo`), comportamiento del form por modo, asignación server-side vía trigger, y estado PENDIENTE para productos sin código asignado.

### Modified Capabilities
- None (no existe spec previa de código de producto; el fix del bug de `libre` es un bugfix dentro de la nueva capability, no una capability existente).

## Approach

Reutilizar la ESTRUCTURA del patrón ya probado en producción (`assign_nro_caja`): trigger `BEFORE INSERT` que sobrescribe `NEW.codigo` antes de que exista la fila, evitando un `UPDATE` separado y por lo tanto cualquier loop de sync en PowerSync (confirmado en exploración). El cliente en modo `correlativo` nunca envía `codigo`; el servidor es la única fuente de verdad. A diferencia de `nro_caja` (que es `MAX+1` trivialmente atómico), el cálculo aquí es **gap-fill** (primer entero libre desde 1), que NO es atómico por sí solo y requiere lock explícito por empresa. Preguntas de diseño a resolver en `sdd-design` (no en este proposal):
1. Representación concreta del estado PENDIENTE (`codigo_status` explícito vs. sentinel vs. `codigo` nullable) — impacta tipo `Producto`, schema PowerSync y todos los selectores.
2. **Mecanismo gap-fill atómico**: cómo encontrar el primer entero libre (`generate_series` / `NOT EXISTS` / `LEFT JOIN`) con lock por empresa (`pg_advisory_xact_lock(empresa_id)` o `SELECT ... FOR UPDATE`) para que dos inserts concurrentes no elijan el mismo hueco. Este es el punto más delicado del change.
3. Dónde y cómo se enforce "no usable hasta asignar" (filtro de aplicación en cada selector/buscador, dado que las FKs son por `id` no por `codigo`).
4. Semántica final de "último código" en modo `libre` tras el fix (cronológico vs. numéricamente más alto).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/inventario/components/productos/producto-form.tsx:544-551,2019-2042` | Modified | Input read-only en modo `correlativo`; fix de query "último código" |
| `src/features/inventario/components/productos/import-productos-modal.tsx:633,668` | Modified | `localNow()` movido dentro del loop (causa raíz del bug) |
| `src/features/inventario/schemas/producto-schema.ts` | Modified | `codigo` opcional/no requerido en modo `correlativo` |
| `src/features/inventario/hooks/use-productos.ts` | Modified | No enviar `codigo` en modo `correlativo`; filtrar PENDIENTE en selectores de venta |
| `src/features/configuracion/hooks/use-company.ts` | Modified | Nuevo namespace `inventario.numeracion_modo` |
| `src/features/configuracion/components/company-data-form.tsx` (o nueva sección) | Modified | UI de toggle del modo |
| `migrations/00XX_producto_numeracion_correlativa.sql` | New | Trigger `assign_codigo_producto()` BEFORE INSERT + manejo de estado PENDIENTE |
| `src/core/db/powersync/schema.ts` | Possibly Modified | Dependiendo de la representación de PENDIENTE elegida en diseño |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Carrera del gap-fill entre INSERTs concurrentes de la misma empresa (dos eligen el mismo hueco) | Medium-High | Lock explícito por empresa (`pg_advisory_xact_lock`/`FOR UPDATE`) + constraint `UNIQUE(empresa_id, codigo)` como red dura. MÁS delicado que `nro_caja` porque gap-fill no es atómico por naturaleza. Resolver en diseño. |
| Reintento del conector PowerSync duplica asignación | Low-Medium | Revisar idempotencia del trigger (precedente: `0096_pago_reversal_idempotente.sql`) |
| Cambio de tipo `codigo`/estado PENDIENTE rompe consumidores existentes de `Producto` | Medium | Mapear blast radius completo en diseño antes de tocar el schema |
| Fix del bug de `libre` introduce regresión en flujo de import masivo | Low | Cubrir con prueba manual de import con >1 fila antes de merge |

## Rollback Plan

- Config default `'libre'` — si se revierte el change, ningún tenant queda afectado (comportamiento idéntico al actual, salvo el fix del bug que es deseable mantener).
- El trigger `BEFORE INSERT` es aditivo: un `DROP TRIGGER` revierte limpiamente sin tocar datos ni códigos ya asignados.
- Si el estado PENDIENTE requiere columna nueva, debe ser nullable/con default para permitir rollback sin migración destructiva.

## Dependencies

- Ninguna externa. Depende del mecanismo ya existente `empresas.config` + `readConfigNamespace`/`serializeConfigNamespace`.

## Success Criteria

- [ ] Una empresa puede alternar entre `libre` y `correlativo` desde Configuración; el default no afecta tenants existentes.
- [ ] En modo `correlativo`, el input de código es read-only y el servidor asigna el primer entero libre desde 1 (gap-fill) por empresa de forma atómica (sin colisión bajo concurrencia), ignorando códigos mixtos. Ej: con `1,2,5` existentes → asigna `3`, luego `4`, luego `6`.
- [ ] Un producto creado offline en modo `correlativo` queda en estado PENDIENTE y no aparece en POS/recetas/ajustes hasta sincronizar.
- [ ] En modo `libre`, "Último código creado" muestra el valor correcto tras un import masivo de >1 fila (sin empate de `created_at`).
