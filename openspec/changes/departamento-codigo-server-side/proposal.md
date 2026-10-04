# Proposal: Asignación server-side de `departamentos.codigo`

## Intent

`getSiguienteCodigoDepartamento` (`use-departamentos.ts:51-66`) calcula `codigo` como `MAX+1` sobre la copia LOCAL de SQLite (réplica eventual, no fuente de verdad). El INSERT local siempre "funciona", pero al subir vía PowerSync, Postgres rechaza con `23505` (`uq_departamentos_empresa_codigo`) y PowerSync descarta la operación en silencio. Cualquier producto creado contra ese `departamento_id` muere después con `23503` FK violation (`productos_departamento_id_fkey`). Caso real confirmado: departamento huérfano `7cac7b70-590f-4255-91d6-d91aedb1022e` + producto huérfano asociado, ninguno existe en Postgres.

Mover la asignación al servidor vía trigger `BEFORE INSERT`, replicando el patrón ya probado en producción `assign_codigo_producto` (`migrations/0099`).

## Scope

### In Scope
- Migración `migrations/0100_departamento_codigo_server_side.sql`: función `assign_codigo_departamento()` + trigger `BEFORE INSERT ON departamentos`, gap-fill + `pg_advisory_xact_lock` con namespace propio.
- `use-departamentos.ts`: `crearDepartamento` deja de calcular/enviar `codigo` (envía `''` o se omite); se elimina o se deja sin uso `getSiguienteCodigoDepartamento` si ya no tiene consumidores.
- `departamento-form.tsx`: deja de pre-rellenar el input con un código adivinado; muestra estado "PENDIENTE (asignado por el servidor)" como ya hace `producto-form.tsx`.
- `departamento-schema.ts`: ajuste mínimo si el submit ya no necesita un `codigo` numérico sintético para pasar `safeParse`.
- Remediación del dato huérfano existente (ver Decisión 3).
- `sdd-apply` es TDD estricto (Vitest, `yarn test:run`) — se documenta aquí como expectativa, no se diseña.

### Out of Scope
- Visibilidad general de errores de sync de PowerSync / UI de "estado de sincronización" por registro / bloqueo de operaciones sobre registros en conflicto ("Problema B"). Es un change futuro separado; esta propuesta solo elimina la causa raíz puntual de `departamentos.codigo`.
- Tocar el mecanismo de `productos` (`numeracion_modo`, `codigo_status`) — se reutiliza como referencia, no se modifica.
- Migrar `nro_factura`/`nro_ncr`/`nro_ndb` al mismo patrón (precedente que sienta, no ejecuta).

## Capabilities

### New Capabilities
- None (no es una capability nueva; es un fix de integridad sobre un flujo de creación ya existente).

### Modified Capabilities
- `departamento-gestion` (o nombre equivalente si existe spec previa en `openspec/specs/`; no se encontró spec file para este dominio todavía — si `sdd-spec` determina que corresponde crear una capability nueva en vez de delta, ajustar en esa fase): cambia el requisito de "quién asigna `codigo`" de cliente a servidor, y el contrato de UI de "mostrar código previo" a "mostrar estado pendiente".

## Approach

Trigger `BEFORE INSERT` en Postgres, mismo mecanismo que `assign_codigo_producto` (0099): reescribe `NEW.codigo` antes de que la fila exista, por lo que NO dispara el trigger de inmutabilidad `validate_departamento_update()` (ese es `BEFORE UPDATE`, no interfiere). Gap-fill (`generate_series` + `LEFT JOIN`) en vez de `MAX+1` simple, igual criterio que productos. El filtro `codigo ~ '^\d+$'` en el cálculo del gap-fill convive sin conflicto con el CHECK alfanumérico real de la tabla (`'^[A-Z0-9-]+$'`, confirmado en `migrations/0004`) — los códigos legacy alfabéticos (`FAC`/`COR`/`CAP`, ver `seed_test_products.sql`) simplemente no participan del cálculo, igual que ya ocurre con productos.

### Decisión 1 — ¿Columna `codigo_status` nueva? → **NO.**
`departamentos` nunca tuvo modo "libre" configurable (a diferencia de `productos`, donde `codigo_status` existe porque coexisten dos modos). El Zod schema de departamentos ya fuerza `^[1-9]\d*$` para todo código nuevo desde la UI — no hay ambigüedad posible entre "pendiente" y "código libre legítimo". Se usa `codigo = ''` como único sentinel de "pendiente de asignación server-side". Agregar `codigo_status` sería sobre-ingeniería (YAGNI): no resuelve ningún caso real hoy y duplica el blast radius (migración de columna + `schema.ts` + tipo `Departamento` + todos los `SELECT *`) sin beneficio, porque no existe (ni se proyecta) un segundo modo que la columna necesite distinguir.

### Decisión 2 — Namespace del advisory lock → **namespace propio: `hashtext(empresa_id || ':departamento')`.**
Compartir el namespace de `productos` (`hashtext(empresa_id)`) serializaría INSERTs de `productos` y `departamentos` de la misma empresa dentro de la misma transacción sin ninguna razón real: son contadores independientes sobre tablas distintas. El costo de un namespace separado es cero (un string literal más en el `hashtext`) y elimina por completo cualquier contención cruzada entre ambos triggers, presente o futura. No hay tradeoff real a favor de compartir el namespace — se descarta esa opción.

### Decisión 3 — Remediación del huérfano → **Opción A: recreación manual por el usuario.**
Entorno single-user confirmado por el dueño. El registro huérfano (`7cac7b70-590f-4255-91d6-d91aedb1022e` + producto asociado) vive solo en SQLite local y nunca existió en Postgres; la operación FATAL que lo habría subido ya fue descartada de la cola de PowerSync y no es recuperable automáticamente sin tooling nuevo. Construir un script de reparación (Opción B) exige lógica ad-hoc para distinguir "fila pendiente de sync" de "fila realmente rechazada" — no justificable para un caso de un solo usuario con una sola fila conocida. La Opción C (UI de estado de sync) es explícitamente Problema B, fuera de alcance. Se documenta como instrucción operativa post-deploy: el usuario borra/ignora el departamento fantasma local y recrea el departamento (y el producto, si aplica) una vez desplegado el fix; se acepta la pérdida de los datos ya cargados en el producto huérfano como costo aceptado y acotado.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `migrations/0100_departamento_codigo_server_side.sql` | New | Función `assign_codigo_departamento()` + trigger `BEFORE INSERT` |
| `src/features/inventario/hooks/use-departamentos.ts` | Modified | `crearDepartamento` no envía `codigo` calculado; retirar/dejar sin uso `getSiguienteCodigoDepartamento` |
| `src/features/inventario/components/departamentos/departamento-form.tsx` | Modified | Dejar de pre-rellenar código; mostrar estado "PENDIENTE (asignado por el servidor)" |
| `src/features/inventario/schemas/departamento-schema.ts` | Possibly Modified | Ajustar validación de `codigo` si el submit ya no sintetiza un valor numérico |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Carrera de gap-fill entre INSERTs concurrentes de `departamentos` de la misma empresa | Low | `pg_advisory_xact_lock` con namespace propio + constraint `UNIQUE(empresa_id, codigo)` como red dura; bajo volumen real de creación de departamentos |
| Usuario pierde datos ya cargados en el producto huérfano al recrear manualmente (Decisión 3) | Low (acotado a 1 caso conocido) | Comunicarlo explícitamente como instrucción post-deploy; alcance limitado por ser single-user |
| Cambio de UX visible en `departamento-form.tsx` (ya no se muestra un número) sorprende al usuario | Low | Mismo patrón ya validado en `producto-form.tsx` para modo correlativo, mensaje consistente |
| Tamaño del diff | Low-Medium | Estimado ~120-180 líneas (migración ~50 + hook ~15 + form ~30-50 + schema ~5-10 + tests). Bien debajo del presupuesto de revisión de 400 líneas; no se anticipa necesidad de chained-pr |

## Rollback Plan

El trigger es aditivo: `DROP TRIGGER trg_assign_codigo_departamento; DROP FUNCTION assign_codigo_departamento();` revierte limpiamente sin tocar datos ni códigos ya asignados por el servidor. Los cambios de frontend (dejar de pre-rellenar) son reversibles revirtiendo el commit; no hay migración de columna ni dato destructivo involucrado (Decisión 1 descarta `codigo_status`).

## Dependencies

- Ninguna externa. Reutiliza el mecanismo ya probado de `assign_codigo_producto` (`migrations/0099`) como referencia estructural directa.

## Success Criteria

- [ ] Un INSERT de `departamentos` sin `codigo` (o con `codigo = ''`) recibe del servidor el primer entero libre vía gap-fill, atómico bajo concurrencia dentro de la misma empresa.
- [ ] El INSERT ya no colisiona con `uq_departamentos_empresa_codigo`; PowerSync ya no descarta la operación con `23505`.
- [ ] `departamento-form.tsx` muestra estado "pendiente" en vez de un código adivinado client-side.
- [ ] Códigos legacy alfanuméricos (`FAC`/`COR`/`CAP`) siguen existiendo sin conflicto y no participan del gap-fill numérico.
- [ ] El departamento y producto huérfanos conocidos quedan resueltos (recreados por el usuario) tras el despliegue, sin requerir tooling nuevo.
