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
| 0055 | `0055_compras_security_constraints.sql` | Agrega CHECK constraints de seguridad en `facturas_compra` y `facturas_compra_det`: formato y longitud de `nro_factura`/`nro_control` (previene XSS persistente), rango valido de `fecha_factura`, y corrige `costo_unitario_usd >= 0` a `> 0`. Los constraints de formato usan `NOT VALID` para no bloquear datos historicos. |
| 0095 | `0095_fix_nota_credito_precision_compare.sql` | Corrige fuga de precision en `validate_nota_credito_insert()`: las variables locales eran `NUMERIC(12,2)` (redondeaban el total de la venta a 2 decimales) mientras `NEW.total_usd` entra a 8 decimales, rechazando NC legitimas con `P0001 'La suma de notas de credito excede el total de la venta'`. Se declaran `NUMERIC(20,8)` para igualar la precision de las columnas reales (ampliadas en 0058). Preserva el fix de 0094. Idempotente (`CREATE OR REPLACE FUNCTION`). |
| 0096 | `0096_pago_reversal_idempotente.sql` | Hace idempotente `allow_pago_reversal()`: cuando un pago YA reversado recibe otro PATCH `is_reversed=1` (reenvio de PowerSync tras reintento/reconexion), en vez de `RAISE EXCEPTION 'Este pago ya fue reversado anteriormente.'` (que el connector trataba como FATAL y descartaba, arriesgando perder otras ops del batch) retorna un NO-OP silencioso preservando los campos de auditoria originales (`reversed_at`/`reversed_by`/`reversed_reason`). Preserva la inmutabilidad financiera de 0015 sin cambios. Idempotente (`CREATE OR REPLACE FUNCTION`). |
| 0104 | `0104_saf_creditos_lotes.sql` | Slice 2 de `saf-snapshot-y-trazabilidad` (PR1/5, design-v2.md §3). Crea `saf_creditos_lotes`: cada fila es un credito SAF individual con saldo remanente propio, pareado 1:1 con su fila SAFC en `movimientos_cuenta` (`movimiento_cuenta_id UNIQUE`). `saldo_disponible_usd`/`status` son mutables SOLO via trigger `validate_saf_lote_update()` (BEFORE UPDATE), nunca por la app directamente — mismo mecanismo que protege `clientes.saldo_actual`/`saf_disponible`. RLS usa `current_empresa_id()` (desviacion documentada de design-v2.md, que proponia `USING(true)`). Sin backfill. |
| 0105 | `0105_saf_creditos_aplicaciones.sql` | Capa 2 del modelo (design-v2.md §4, mismo PR que 0104). Crea `saf_creditos_aplicaciones`: evento 100% append-only (sin UPDATE/DELETE, precedente `import_log_det`) que registra cada aplicacion lote→factura con snapshot `lote_saldo_antes_usd`/`lote_saldo_despues_usd` calculado por el trigger `consumir_saf_lote()` (BEFORE INSERT) — unico lugar que muta `saf_creditos_lotes.saldo_disponible_usd`. Rechaza sobregiro con `RAISE EXCEPTION P0001`. RLS usa `current_empresa_id()` (misma desviacion documentada que 0104). |
| 0106 | `0106_ventas_estado_column.sql` | `cxc-sync-snapshot-redesign` (Fase 1). Agrega `ventas.estado` (TEXT NOT NULL DEFAULT 'pendiente', CHECK IN pendiente/parcial/pago/reversado) — estado de COBRANZA trigger-derivado, distinto de `status` (validez fiscal ACTIVA/ANULADA). Crea el indice `idx_mov_cuenta_venta` sobre `movimientos_cuenta(venta_id, fecha DESC, created_at DESC)` para el lookup de "ultimo movimiento". Extiende `prevent_venta_mutation()` (BEFORE UPDATE OR DELETE, guards existentes byte-identicos a 0097) para derivar `estado` cuando `saldo_pend_usd` cambia. Agrega una funcion/trigger NUEVA y SEPARADA, `derive_venta_estado_insert()` + `trg_venta_estado_insert` (BEFORE INSERT), magnitud-only — sin esto toda venta CONTADO quedaba atascada en `DEFAULT 'pendiente'` porque el trigger de UPDATE nunca corre en INSERT (fix CRITICAL-1 post-verify). Reemplaza en el codigo cliente (`use-cxc.ts`) el filtro muerto `status NOT IN ('ANULADA', 'REVERSADA')` ('REVERSADA' nunca fue un valor real de `status`). |
| 0107 | `0107_backfill_ventas_estado.sql` | Backfill read-only de `0106` (design.md §7): re-deriva `estado` para filas `ventas` existentes a partir de su historial real en `movimientos_cuenta` (SELECT/JOIN unicamente — nunca escribe en el ledger), via `UPDATE ventas ... WHERE estado IS DISTINCT FROM sub.estado_calc` (idempotente). Usa tolerancia 0 exacta (misma formula que `0108`, alineada con `estado-venta.ts`) — no la tolerancia original 0.005 de `0106`. `0107` y `0108` estan en PARIDAD: aplicar en cualquier orden produce el mismo resultado final, no hay mismatch de formulas entre ambas. |
| 0108 | `0108_ventas_estado_tolerancia_cero.sql` | Correctiva de `0106`: baja la tolerancia de redondeo de `estado` de 0.005 USD a 0 exacto — una factura es `'pago'` SOLO cuando `saldo_pend_usd` es EXACTAMENTE 0 (decision del owner: ClaraPOS cobra en Bs con tasa variable, 0.005 USD podia dejar Bs reales sin cobrar). Solo `CREATE OR REPLACE FUNCTION` sobre `prevent_venta_mutation()` y `derive_venta_estado_insert()` — NO re-crea columna/indice/triggers (ya existen por 0106). Todos los demas guards quedan byte-identicos a 0106/0097. **Decision interina**: residuos de redondeo en cascadas de pago complejas quedan pendientes de un cambio futuro (ruteo por diferencial-cambiario-a-gasto) — ver cabecera del archivo y `src/features/cxc/lib/estado-venta.ts`. |

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
