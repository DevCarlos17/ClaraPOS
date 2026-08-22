# Exploration: Depósito único forzado como principal

## Decisión ya tomada (no se relitiga)

Defensa en 2 capas, ya acordada por el usuario:
1. **UI (UX only)**: checkbox `es_principal` bloqueado y forzado a `checked` en `deposito-form.tsx` cuando la empresa tiene un solo depósito.
2. **DB (fuente de verdad, "ni vía consola")**: invariante enforced con TRIGGER en Postgres sobre `depositos`, más validación en el write-path del hook (`use-depositos.ts`). El frontend nunca es la fuente de verdad.

Esta exploración cubre CÓMO implementar cada capa y qué tensiones de diseño hay que resolver en propose/design — no vuelve a discutir SI hacerlo en 2 capas.

## Current State

### Tabla `depositos` (verificado)
- `migrations/0004_inventario.sql:121` — `es_principal BOOLEAN NOT NULL DEFAULT FALSE`.
- **No existe ningún trigger sobre `depositos`** hoy. Grep de `CREATE TRIGGER` en `migrations/` confirma que los únicos triggers de invariante-tipo (`trg_kardex_no_update`, `trg_tasa_no_update`, `trg_validate_venta_*`) están en `movimientos_inventario`, `tasas_cambio` y `ventas`. Hoy TODA la invariante de `es_principal` vive solo en TypeScript (`deposito-principal.ts` + `use-depositos.ts`). Confirmado.
- Migración `0083_deposito_multitenant.sql` ya asume `es_principal` como fuente para resolver el depósito de un producto/caja (`WHERE empresa_id = ? AND es_principal = TRUE LIMIT 1`), reforzando que corromper esta invariante tiene impacto financiero (kardex).
- **Próxima migración libre: `0086_*.sql`** (última existente es `0085_traspaso_plantillas.sql`; `0084_traspasos_inventario.sql` ya está tomada, no libre como sugería el contexto previo — verificado por `ls migrations/`).

### Invariantes TS ya mergeadas (esta feature las EXTIENDE, no las reemplaza)
- `buildUnsetOtrosPrincipalesQuery` (at-most-one): dentro de la misma `writeTransaction`, desmarca cualquier OTRO `es_principal=1` de la empresa antes de insertar/actualizar el nuevo principal.
- `debeBloquearQuitarUltimoPrincipal` (at-least-one): bloquea SOLO cuando las 3 condiciones se cumplen a la vez — el depósito es actualmente el principal activo (`es_principal=1 AND is_active=1`), la operación se lo está quitando, y no hay OTRO principal activo. Aplicado en `actualizarDeposito` como pre-check fail-fast fuera de la tx.
- Patrón de trigger Postgres a imitar: `migrations/0001_initial_schema.sql:438-458` (`validate_venta_insert` + `trg_validate_venta_insert`) — `RAISE EXCEPTION` en `BEFORE INSERT/UPDATE`, Postgres devuelve 23xxx, PowerSync descarta sin reintentar.

### Formulario (`deposito-form.tsx`)
- Checkbox `es_principal` en líneas 159-170: `checked={esPrincipal} onChange={...}`, sin lógica de disable.
- El form **no conoce** cuántos depósitos tiene la empresa — es "count-blind" hoy. Pero su único caller, `deposito-list.tsx`, YA ejecuta `useDepositos()` (línea 22) y tiene la lista completa disponible antes de montar `<DepositoForm>` (línea 270-274). **Verificado: pasar `depositos.length` (o el array) como prop es gratis — no hace falta una query nueva en el form.**

## Affected Areas

- `src/features/inventario/lib/deposito-principal.ts` — agregar función pura nueva (ver Approaches), hermana de las 2 existentes.
- `src/features/inventario/lib/__tests__/deposito-principal.test.ts` — tests de la función nueva.
- `src/features/inventario/hooks/use-depositos.ts` — `crearDeposito`/`actualizarDeposito` deben aplicar la nueva invariante en el write-path (fail-fast, mismo patrón que el pre-check de at-least-one).
- `src/features/inventario/hooks/__tests__/use-depositos.test.ts` — tests del write-path nuevo.
- `src/features/inventario/components/depositos/deposito-form.tsx` — recibir count/lista como prop, disable + forzar `checked` en el checkbox.
- `src/features/inventario/components/depositos/deposito-list.tsx` — pasar `depositos.length` (o `depositos`) como prop nueva a `<DepositoForm>`.
- `migrations/0086_deposito_unico_principal.sql` (nombre tentativo) — función + trigger Postgres `BEFORE INSERT/UPDATE ON depositos`.
- Posiblemente `src/features/inventario/schemas/deposito-schema.ts` — evaluar en design si el schema Zod necesita saber el count (probablemente NO: el count es contexto de la UI, no del shape del dato).

## Design Tensions (para propose/design — no resueltas acá)

### 1. CHECK vs TRIGGER — confirmado: debe ser TRIGGER
La condición "si la empresa tiene un solo depósito, ese depósito debe tener `es_principal=1`" es un invariante que depende de **contar filas hermanas** (`COUNT(*) FROM depositos WHERE empresa_id = ?`). Un `CHECK` constraint en Postgres solo puede evaluar columnas de la MISMA fila — no puede hacer subqueries ni ver otras filas. **Confirmado: esto requiere un TRIGGER** (`BEFORE INSERT OR UPDATE`), igual que `validate_venta_insert`, no un `CHECK`. No hay ambigüedad acá.

### 2. Definición precisa del invariante — ABIERTA, necesita decisión en propose/spec
Dos lecturas posibles, y hoy el código NO es consistente entre sí sobre cuál usar:
- **(A) Conteo total**: "si `COUNT(*) FROM depositos WHERE empresa_id=?` (sin filtrar `is_active`) = 1, ese único depósito debe tener `es_principal=1`."
- **(B) Conteo de activos**: "si `COUNT(*) FROM depositos WHERE empresa_id=? AND is_active=1` = 1, ese depósito activo debe tener `es_principal=1`."

`debeBloquearQuitarUltimoPrincipal` (at-least-one) ya usa `is_active=1` en su condición (`esPrincipalActivoActual = es_principal=1 AND is_active=1`), y `resolveDepositoIngreso`/`resolveDepositoEgresoVenta` filtran `is_active=1` en el `WHERE`. Eso sugiere que la lectura consistente con el resto del sistema es **(B)** — lo que importa para el negocio es "el único depósito ACTIVO", no el total histórico (un depósito desactivado no participa en la resolución de kardex de todos modos). Pero la redacción del feature request dice literalmente "cuando la empresa tiene UN SOLO depósito", sin calificar "activo". **Debe decidirse explícitamente en spec/propose, no asumirse.** Recomendación de esta exploración: usar (B) por consistencia con el resto de la invariante existente, pero dejarlo como decisión explícita a confirmar con el usuario.

### 3. Trigger server-side vs escritura local optimista (PowerSync) — flag, no resolver acá
El trigger corre en el SERVOR (Supabase Postgres) DESPUÉS de que PowerSync sincroniza el write local. El flujo real:
1. Usuario intenta, vía consola/API directa (bypasseando el frontend), desmarcar `es_principal` del único depósito → esto NO pasa por `db.writeTransaction()` local, va directo a Postgres, el trigger lo rechaza ahí mismo síncronamente. Este caso está cubierto limpio.
2. Usuario pasa por el frontend normal → el hook TS (capa 2) ya debería bloquear ANTES de llegar a PowerSync, por lo que el trigger del servidor casi nunca debería dispararse en el flujo feliz. Es defensa en profundidad.
3. Caso raro pero real: el hook TS deja pasar la escritura local (ej. bug futuro, o carrera entre pestañas/dispositivos offline que localmente no ven el mismo estado), PowerSync sube el cambio, el trigger del servidor lo rechaza con `RAISE EXCEPTION` → Postgres devuelve 23xxx → **PowerSync descarta el upload sin reintentar** (comportamiento documentado en el comentario de `0001_initial_schema.sql`). **Pregunta de diseño para más adelante**: ¿qué le pasa a la escritura optimista local en SQLite? Si el registro local ya quedó con `es_principal=0` (o el estado inconsistente) pero el server lo rechazó, hay una divergencia local/servidor hasta que algo la reconcilie. Esto es una pregunta de UX/sync-rollback genuina — se deja marcada para `design.md`, no se resuelve en explore.

### 4. Edge cases a enumerar para spec
- **Crear el PRIMER depósito de la empresa**: ¿debe forzarse `es_principal=1` automáticamente (sin que el usuario lo tilde), o alcanza con que el checkbox aparezca bloqueado+marcado? Comportamiento actual de `crearDeposito` no fuerza nada — si el usuario no tilda el checkbox, se crea con `es_principal=0`. Con 2a: la empresa quedaría con 1 depósito y NINGÚN principal, violando el invariante nuevo desde el primer segundo. Esto debe resolverse: o el form fuerza `checked=true` sin permitir destildar (ya está en el alcance acordado — "forzado a checked"), o el trigger en INSERT lo corrige.
- **Crear el SEGUNDO depósito**: el primero deja de estar solo → el checkbox del PRIMERO debería "liberarse" (dejar de estar bloqueado) la próxima vez que se edite. Como el form recibe el count como prop desde `deposito-list.tsx` (que ya re-renderiza reactivamente via PowerSync `useQuery`), esto debería resolverse solo sin lógica adicional — a confirmar en design.
- **Desactivar (`is_active=false`) o "eliminar" depósitos hasta quedar en 1**: si la definición usa conteo de activos (opción B arriba), desactivar el segundo depósito debe re-disparar el forzado sobre el que queda. Si se usa conteo total (opción A), desactivar NO cambia nada porque el total sigue siendo 2.
- **Interacción con at-most-one y at-least-one existentes**: ¿se solapa o entra en conflicto la nueva invariante con `debeBloquearQuitarUltimoPrincipal`? Análisis: NO hay conflicto — son ortogonales. At-least-one bloquea "quitarle principal al único activo si no hay otro que lo reemplace". La nueva invariante bloquea (o auto-corrige) "el único depósito de la empresa NO es principal". En el caso de una empresa con exactamente 1 depósito, at-least-one YA cubre el caso de "quitarle principal" (no hay otro que lo reemplace → bloquea). Lo que at-least-one NO cubre es el caso de **crear** ese primer depósito sin marcarlo principal desde el vamos (ahí no hay "quitar", hay "nunca tener"). La nueva invariante es estrictamente sobre ese hueco: fuerza en CREATE (y re-fuerza si por algún cambio de conteo la empresa vuelve a tener 1 solo depósito sin principal).

### 5. UI count-blindness — confirmado, solución barata
El form no sabe el count hoy. `deposito-list.tsx` ya tiene `depositos` completo antes de montar el form (línea 22, `useDepositos()`). Pasar `depositos.length` (o filtrar por activos según la decisión del punto 2) como prop nuevo a `<DepositoForm>` no agrega queries — es la opción más barata. Alternativa (el form llama `useDepositos()` él mismo) duplicaría la query sin necesidad; se descarta.

## Approaches (cómo implementar cada capa — la decisión de 2 capas ya está tomada)

### Capa UI: dónde vive la decisión "¿debo forzar/bloquear el checkbox?"
1. **Lógica inline en `deposito-form.tsx`** — comparar `count === 1` directo en el componente.
   - Pros: cero archivos nuevos.
   - Cons: rompe el patrón existente del feature, donde toda decisión de invariante vive en una función PURA testeable en `deposito-principal.ts` (`buildUnsetOtrosPrincipalesQuery`, `debeBloquearQuitarUltimoPrincipal`). Inconsistente y sin test unitario aislado.
   - Effort: Low.
2. **Función pura nueva en `deposito-principal.ts`** (recomendado) — ej. `debeForzarPrincipalUnico({ totalDepositos, esteEsElUnico, ... })` que retorna si el checkbox debe estar bloqueado+forzado. Consumida tanto por el form (UI) como potencialmente reusada en el hook (write-path) para el mismo cálculo, evitando 2 implementaciones divergentes del mismo criterio.
   - Pros: consistente con el patrón ya establecido, testeable sin mocks, una sola fuente de verdad para el criterio "único depósito" (resuelve también la ambigüedad del punto 2 en un solo lugar).
   - Cons: ninguno relevante.
   - Effort: Low.

**Recomendación**: opción 2, nombrada siguiendo la convención existente (`debeXxx` para predicados booleanos, como `debeBloquearQuitarUltimoPrincipal`).

### Capa DB: dónde vive el trigger
1. **Un solo trigger `BEFORE INSERT OR UPDATE ON depositos`** que en cada INSERT/UPDATE recalcula `COUNT(*)` para la empresa y aplica la regla (auto-corrige `NEW.es_principal := TRUE` si es el único, o `RAISE EXCEPTION` si se intenta dejar el único sin principal).
   - Pros: un solo lugar, sigue el patrón `validate_venta_insert`/`validate_venta_update` (2 funciones separadas INSERT/UPDATE es el patrón real usado en el codebase — no una función combinada).
   - Cons: hay que decidir auto-corregir (silencioso) vs rechazar (`RAISE EXCEPTION`) cuando el INSERT llega con `es_principal=0` siendo el primer depósito. Los triggers existentes (`validate_venta_*`) SIEMPRE rechazan con excepción, nunca auto-corrigen `NEW.*`. Auto-corregir sería un patrón nuevo en el codebase — flag para design.
   - Effort: Medium (2 funciones, replicando el patrón split INSERT/UPDATE existente).
2. **Trigger que solo rechaza (nunca auto-corrige)**, simétrico a los triggers de inmutabilidad (`trg_tasa_no_update`, `trg_kardex_no_update`) y a `validate_venta_*`. Si el INSERT del primer depósito llega con `es_principal=0`, el trigger lo rechaza — la UI (capa 1, forzada) es la que garantiza que nunca se envíe así en el flujo normal.
   - Pros: consistente 100% con el patrón existente en el codebase (siempre "rechazar", nunca "mutar NEW silenciosamente" salvo los `trg_*_updated` de `updated_at`, que es un caso distinto). Comportamiento predecible: la capa 2 (hook TS) ya debería prevenir que esto llegue a pasar en el flujo normal.
   - Cons: si algo bypassea la capa 1 y 2 (ej. script de importación directo a Postgres) el INSERT del primer depósito con `es_principal=0` simplemente falla en vez de auto-corregirse — hay que decidir si es el comportamiento deseado.
   - Effort: Medium, igual al anterior.

**Recomendación preliminar**: opción 2 (rechazar, no auto-corregir) por consistencia con TODOS los triggers de validación existentes en el codebase — ninguno muta `NEW` silenciosamente salvo los de `updated_at`. Confirmar en design.md.

### Capa hook (write-path, `use-depositos.ts`)
Mismo patrón que el pre-check fail-fast de `debeBloquearQuitarUltimoPrincipal` en `actualizarDeposito`: antes de abrir la `writeTransaction`, consultar el count de depósitos de la empresa (`crearDeposito` ya tiene `empresa_id` en el payload; `actualizarDeposito` necesita el mismo pre-read de `empresa_id` que ya hace para at-least-one) y aplicar `debeForzarPrincipalUnico` (la misma función pura de la capa UI) para decidir si hay que rechazar o forzar `es_principal=1` antes del INSERT/UPDATE local.

## Rough Scope Estimate

| Archivo | Tipo de cambio | Líneas aprox. |
|---|---|---|
| `deposito-principal.ts` | +1 función pura + JSDoc | +25 |
| `deposito-principal.test.ts` | +1 describe block, ~4-6 casos | +50 |
| `use-depositos.ts` | pre-check en `crearDeposito` + `actualizarDeposito` | +25 |
| `use-depositos.test.ts` | casos nuevos de invariante | +40 |
| `deposito-form.tsx` | prop nueva + disable/forced-checked en checkbox | +10 |
| `deposito-list.tsx` | pasar prop nueva a `<DepositoForm>` | +2 |
| `migrations/0086_*.sql` | función(es) + trigger(s) Postgres | +40-60 |
| **Total** | | **~190-215 líneas** |

Bien por debajo del budget de revisión de 400 líneas — no se anticipa necesidad de chained PRs para este cambio, sujeto a confirmación en `sdd-tasks`.

## Recommendation

Proceder a `sdd-propose` con:
- Capa UI: función pura nueva `debeForzarPrincipalUnico` en `deposito-principal.ts`, consumida por `deposito-form.tsx` vía prop de count pasado desde `deposito-list.tsx` (sin query nueva).
- Capa DB: 2 funciones trigger (`BEFORE INSERT`, `BEFORE UPDATE`) sobre `depositos`, patrón `validate_venta_insert`/`validate_venta_update`, que RECHAZAN (no auto-corrigen) — a confirmar en design.
- Capa hook: pre-check fail-fast reusando la misma función pura, mismo patrón que el pre-check de `debeBloquearQuitarUltimoPrincipal`.
- **Decisión pendiente explícita para propose/spec**: ¿el conteo "single depósito" es sobre TODOS los depósitos o solo los ACTIVOS (`is_active=1`)? Recomendación de esta exploración: activos, por consistencia con el resto de la invariante — pero debe confirmarse con el usuario antes de escribir la spec.
- **Nota para design.md**: dejar explícitamente documentada la pregunta de sync-rollback (tensión #3) aunque no se resuelva en esta iteración.

## Risks

- **Riesgo financiero si la invariante se corrompe**: `es_principal=1 AND is_active=1` alimenta `resolveDepositoIngreso`/`resolveDepositoEgresoVenta` (`LIMIT 1` sin `ORDER BY`) — determina dónde caen los movimientos de kardex. Ya mitigado por el diseño de 2 capas acordado; el riesgo real está en la CONSISTENCIA entre las 3 capas (UI, hook, trigger) si usan definiciones distintas de "único" (total vs activo) — de ahí la importancia de resolver la tensión #2 antes de implementar.
- **Riesgo de UX/sync**: escritura local optimista vs rechazo del trigger server-side (tensión #3) puede dejar estado divergente local/servidor en escenarios raros (multi-dispositivo offline). No es bloqueante para propose, pero debe quedar documentado en design.md para que no se pierda.
- **Precedente de auto-corrección vs rechazo en triggers**: si se elige auto-corregir `NEW.es_principal` en el trigger, seria el PRIMER trigger del codebase que muta `NEW` con lógica de negocio (los únicos que tocan `NEW` hoy son los de `updated_at`). Vale la pena que design.md lo señale explícitamente como una desviación de convención si se termina eligiendo esa opción.

## Ready for Proposal

**Sí**, con una condición: `sdd-propose` (o el propio usuario) debe confirmar la definición exacta del invariante (conteo total vs conteo de activos, tensión #2) antes de que `sdd-spec` escriba escenarios Given/When/Then — de lo contrario los escenarios de spec quedarían ambiguos entre sí. Todo lo demás (ubicación de archivos, patrón de trigger, patrón de función pura, scope) está claro para avanzar.
