# Tasks: Gastos — Registro QoL (Comisiones Bancarias N-conceptos)

> Change: `gastos-registro-qol` | Implements design.md (Migración 0080 + cleanup + Slices 2-4) against spec.md capabilities `gastos-comisiones-bancarias-seed`, `metodo-cobro-deducciones`, `caja` (modificada)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR-1a (migración 0080 + schema.ts/types.ts) ~180-260 · PR-1b (cleanup script, separado) ~150-230 · PR-2 ~100-180 · PR-3 ~150-250 · PR-4 ~150-220 · Total ~730-1140 |
| 400-line budget risk | PR-1a Medium · PR-1b Medium (script grande pero SQL denso, no reusa lógica de negocio) · PR-2 Low-Medium · PR-3 Medium · PR-4 Low-Medium · Overall High si PR-1 no se separa |
| Chained PRs recommended | Yes |
| Suggested split | PR-1a (migración 0080 estructura + schema/types) → PR-1b (cleanup script, revisado por separado, ejecución manual) → PR-2 → PR-3 → PR-4 |
| Delivery strategy | ask-on-risk (inferido: cambio toca cuenta contable inmutable y borrado destructivo — decisión de riesgo requiere confirmación del usuario) |
| Chain strategy | pending — preguntar al usuario |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

**Nota crítica de PR-1**: el diseño agrupa migración 0080 + cleanup script bajo un solo "PR-1" en la tabla de Migration/Rollout, pero son dos archivos SQL grandes e independientes (0080 es aditivo/estructura; cleanup es destructivo/manual). Combinados exceden holgadamente 400 líneas. Se recomienda dividir en **PR-1a** (0080 + `schema.ts` + `types.ts`, deployable) y **PR-1b** (`cleanup_gastos_cxp_qol.sql`, revisión separada dado su naturaleza destructiva y no-deployada — se ejecuta manualmente por el usuario tras `pg_dump`).

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Migración 0080: seed 6.2.05, tabla `metodo_cobro_deducciones`, columna vínculo, backfills, schema.ts/types.ts | PR-1a | Independiente, aditivo, ~180-260 líneas |
| 2 | Script `cleanup_gastos_cxp_qol.sql`, manual, post-`pg_dump` | PR-1b | Depende de PR-1a mergeado (tabla/columna deben existir); revisión separada por ser destructivo |
| 3 | `banco-form.tsx` auto-crea + auto-vincula cuenta de comisión | PR-2 | Depende de PR-1a mergeado |
| 4 | `payment-method-form.tsx` + schema, UI N-deducciones | PR-3 | Depende de PR-1a mergeado |
| 5 | `use-gastos.ts` firma + `use-sesiones-caja.ts` loop de cierre | PR-4 | Depende de PR-1a y PR-3 mergeados (necesita filas de deducciones pobladas) |

---

## Phase 1: PR-1a — Migración 0080 (Estructura, aditiva)

- [x] 1.1 `migrations/0080_gastos_comisiones_bancarias_estructura.sql` — `CREATE OR REPLACE FUNCTION seed_plan_cuentas` agrega INSERT de `6.2.05 COMISIONES BANCARIAS` (nivel 3, `es_cuenta_detalle=false`, hija de `6.2`) con `ON CONFLICT (empresa_id,codigo) DO NOTHING` (mismo patrón que 0064). Satisface SC-01, SC-03.
- [x] 1.2 Mismo archivo — backfill `SELECT seed_plan_cuentas(id, NULL) FROM empresas` para empresas existentes, sin alterar `6.2.01`/`6.2.03`. Satisface SC-02, SC-04.
- [x] 1.3 Mismo archivo — `CREATE TABLE metodo_cobro_deducciones` con el DDL exacto de design.md (columnas, `CHECK (porcentaje >= 0 AND porcentaje <= 100)`, `CHECK (tipo IN ('COMISION','ISLR','OTRO'))`, índices, trigger `trg_metodo_cobro_deducciones_updated`, RLS SELECT/INSERT/UPDATE vía `public.current_empresa_id()`, sin trigger anti-UPDATE/DELETE). Satisface SC-05, SC-06.
- [x] 1.4 Mismo archivo — `ALTER TABLE bancos_empresa ADD COLUMN IF NOT EXISTS cuenta_gasto_comision_id UUID REFERENCES plan_cuentas(id)`.
- [x] 1.5 Mismo archivo — backfill por banco existente: por cada fila de `bancos_empresa`, `INSERT INTO plan_cuentas` leaf `6.2.05.NN COMISION BANCO {nombre_banco}` bajo `6.2.05`, luego `UPDATE bancos_empresa SET cuenta_gasto_comision_id`.
- [x] 1.6 Mismo archivo — backfill de deducciones: `INSERT INTO metodo_cobro_deducciones (concepto='Comision bancaria', tipo='COMISION', porcentaje=comision_pct, cuenta_gasto_id=<leaf del banco>)` desde `metodos_cobro WHERE banco_empresa_id IS NOT NULL AND comision_pct > 0`. Satisface SC-10. Nota: si >1 método apunta al mismo `bancos_empresa`, se crean múltiples filas apuntando a la misma leaf — comportamiento esperado, sin manejo especial (residual anotado en design.md).
- [x] 1.7 Confirmar en el mismo archivo que `metodos_cobro.comision_pct` NO se toca ni se dropea (queda deprecado, agregar comentario en la columna vía `COMMENT ON COLUMN`).
- [x] 1.8 `src/core/db/powersync/schema.ts` — Agregar `Table` `metodo_cobro_deducciones` (mapping `porcentaje: column.text`, `is_active`/`orden: column.integer`, resto según convención) y columna `cuenta_gasto_comision_id` en `bancos_empresa`.
- [x] 1.9 `src/core/db/kysely/types.ts` — Mirror `MetodoCobroDeducciones` (`porcentaje: string`, `is_active: number`, `orden: number`, `created_by: string | null`) y agregar `cuenta_gasto_comision_id` a `BancosEmpresa`.
- [x] 1.10 Verify: `yarn type-check && yarn lint` limpio en `schema.ts` y `types.ts` (sin errores nuevos respecto al baseline existente).
- [ ] 1.11 Manual QA — SC-01/02/03/04: aplicar 0080 en empresa nueva y existente; `6.2.05` creada, `6.2.01`/`6.2.03` intactas, re-ejecución no duplica.
- [ ] 1.12 Manual QA — SC-05/06: insertar deducción válida ($ok) y con `porcentaje` fuera de rango (rechazo por CHECK).
- [ ] 1.13 Manual QA — SC-10: método con `comision_pct=2.5` y banco asociado backfillea fila con `porcentaje=2.5` apuntando a la leaf de ese banco.
- [ ] 1.14 ⚠️ Financiero/inmutabilidad: 1.1-1.7 tocan `plan_cuentas` (regla de negocio #5, códigos inmutables) y `bancos_empresa` — aplicar con cuidado extra en `sdd-apply`, verificar `ON CONFLICT DO NOTHING` antes de cada INSERT.

## Phase 2: PR-1b — Script de limpieza manual (destructivo, post-`pg_dump`)

> Depende de PR-1a mergeado (requiere tabla `metodo_cobro_deducciones` y columna `cuenta_gasto_comision_id`).

- [ ] 2.1 `migrations/cleanup_gastos_cxp_qol.sql` (nuevo) — Cabecera con instrucción explícita de `pg_dump --table=gastos,gasto_pagos,facturas_compra,facturas_compra_det,notas_fiscales_compra,notas_fiscales_compra_det,retenciones_iva,retenciones_islr,movimientos_cuenta_proveedor,vencimientos_pagar,libro_contable,movimientos_metodo_cobro,movimientos_bancarios,proveedores,bancos_empresa,metodos_cobro` antes de ejecutar. Satisface SC-27.
- [ ] 2.2 Mismo archivo — `ALTER TABLE ... DISABLE TRIGGER` en los 11 triggers de inmutabilidad mapeados (obs #633): `trg_gasto_protect`, `trg_fact_compra_protect`, `trg_fact_compra_det_no_update/delete`, `trg_nf_compra_no_update/delete`, `trg_nf_compra_det_no_update/delete`, `trg_ret_iva_compra_protect`, `trg_ret_islr_compra_protect`, `trg_mov_cuenta_prov_no_update/delete`, `trg_libro_contable_protect`, `trg_mov_bancario_protect`, `trg_mov_metodo_cobro_no_update/delete`.
- [ ] 2.3 Mismo archivo — DELETE hijos→padres en orden exacto: `gasto_pagos` → `facturas_compra_det` → `retenciones_iva` → `retenciones_islr` → `notas_fiscales_compra_det` → `notas_fiscales_compra` → `movimientos_cuenta_proveedor` → `vencimientos_pagar` → `facturas_compra` → `gastos`.
- [ ] 2.4 Mismo archivo — tablas compartidas con discriminador: `DELETE FROM movimientos_metodo_cobro WHERE origen='PAGO_PROVEEDOR'`; `DELETE FROM movimientos_bancarios WHERE origen IN ('GASTO','PAGO_PROVEEDOR')` (excluye `'MANUAL'`); `UPDATE libro_contable SET parent_id=NULL WHERE modulo_origen IN ('GASTO','COMPRA','PAGO_CXP','NCR_COMPRA')` luego `DELETE ... WHERE modulo_origen IN (...)`. Satisface SC-23.
- [ ] 2.5 Mismo archivo — recompute `bancos_empresa.saldo_actual` y `metodos_cobro.saldo_actual` como `SUM` sobre filas remanentes (nunca reset a 0), exacto SQL de design.md.
- [ ] 2.6 Mismo archivo — `UPDATE proveedores SET saldo_actual = 0` (100% derivado de CxP, seguro resetear).
- [ ] 2.7 Mismo archivo — `DELETE FROM cuentas_config WHERE clave='COMISION_BANCARIA'` (libera el trigger `protect_plan_cuentas` para el paso siguiente).
- [ ] 2.8 Mismo archivo — `UPDATE plan_cuentas SET is_active=FALSE WHERE codigo IN ('6.2.01','6.2.03')` (después de 2.7, sin `DISABLE TRIGGER` necesario).
- [ ] 2.9 Mismo archivo — `ALTER TABLE ... ENABLE TRIGGER` revirtiendo 2.2, en el mismo orden.
- [ ] 2.10 Manual QA — SC-22: confirmar triggers deshabilitados durante el borrado y rehabilitados al final, mismo orden documentado.
- [ ] 2.11 Manual QA — SC-24: `bancos_empresa.saldo_actual`/`metodos_cobro.saldo_actual` post-script coinciden exactamente con `SUM` manual sobre movimientos remanentes.
- [ ] 2.12 Manual QA — SC-25: ventas, inventario, Kardex, CxC, usuarios, configuración sin cambios tras el script.
- [ ] 2.13 Manual QA — SC-26: `6.2.01`/`6.2.03` quedan `is_active=false` sin ser bloqueadas por `protect_plan_cuentas`.
- [ ] 2.14 ⚠️ Financiero/destructivo: TODO este script requiere `pg_dump` verificado antes de correr en `sabroqueso2` (empresa real con datos de prueba); no reversible sin ese respaldo. Ejecución manual por el usuario, NO por `sdd-apply`.

## Phase 3: PR-2 — `banco-form.tsx` auto-crea cuenta de comisión (Slice 2)

> Depende de PR-1a mergeado (necesita `6.2.05` y columna `cuenta_gasto_comision_id`).

- [x] 3.1 `src/features/contabilidad/hooks/use-plan-cuentas.ts` — Nuevo hook `useSubgrupoComisionesBancarias()` retornando `{ id, codigo: '6.2.05', nivel: 3 } | undefined`, filtrado por `empresa_id`. NO modificar `agregarSubcuentaAGrupo`/`crearGrupoGastoConSubcuentas`.
- [x] 3.2 `src/features/configuracion/components/banco-form.tsx` (~L334-401) — Extender `handleCrearCuentaContable` para, además de la cuenta de activo existente, disparar `agregarSubcuentaAGrupo` creando la leaf `6.2.05.NN COMISION BANCO {nombre}` bajo `useSubgrupoComisionesBancarias()` y setear `cuentaGastoComisionId` en el insert/update de `bancos_empresa`. Satisface SC-13, SC-16.
- [x] 3.3 Mismo archivo — UI para mostrar la cuenta de comisión vinculada y permitir reasignarla vía `useCuentasDetallePorTipo('GASTO')`; on-select, `UPDATE bancos_empresa.cuenta_gasto_comision_id` sin afectar deducciones ya configuradas. Satisface SC-15.
- [x] 3.4 Verify: `yarn type-check && yarn lint` limpio en `use-plan-cuentas.ts` y `banco-form.tsx`.
- [ ] 3.5 Manual QA — SC-13: crear banco "Mercantil" nuevo → cuenta activo `1.1.xx` Y `6.2.05.NN COMISION BANCO MERCANTIL` creadas, ambas vinculadas sin pasos manuales.
- [ ] 3.6 Manual QA — SC-14: configurar método de pago de ese banco → solo pide el porcentaje, cuenta destino ya resuelta.
- [ ] 3.7 Manual QA — SC-15: reasignar cuenta de comisión de un banco existente a otra cuenta de gasto → se actualiza sin afectar deducciones existentes.
- [ ] 3.8 Manual QA — SC-16: dos empresas creando bancos con el mismo nombre → cada una obtiene su propia leaf `6.2.05.NN` scoped por `empresa_id`, sin colisión.

---

## Review Workload Forecast — PR-2b (2026-07-30 addendum, supersede Phase 3/PR-2)

> `6.2.05` plano queda superado por una jerarquía de 4 niveles. Ver obs Engram #706/#713/#705/#703 y `design.md` líneas 29-147.

| Field | Value |
|-------|-------|
| Estimated changed lines | Migración 0081 ~400-500 (nuevo archivo; duplica el cuerpo completo de `seed_plan_cuentas`, inevitable en `CREATE OR REPLACE FUNCTION`) · `use-plan-cuentas.ts` ~70-90 · `use-bancos.ts` ~20-25 · `banco-form.tsx` ~180-230 · `schema.ts`/`types.ts` ~2-4 · Total ~675-850 |
| 400-line budget risk | 3b.1 (migración+schema/types) High en solitario, pero mayormente SQL duplicado (bajo esfuerzo cognitivo real) · 3b.2 Low · 3b.3 Medium-High · Overall High |
| Chained PRs recommended | Yes |
| Suggested split | 3b.1 (migración 0081 + schema.ts + types.ts) → 3b.2 (`use-plan-cuentas.ts`) → 3b.3 (`use-bancos.ts` + `banco-form.tsx`) |
| Delivery strategy | ask-on-risk (recibido de sesión) |
| Chain strategy | feature-branch-chain (recibido de sesión, tracker `feat/gastos-registro-qol`) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units — PR-2b

| Unit | Goal | Likely PR | Base branch | Notes |
|------|------|-----------|--------------|-------|
| 3b.1 | Migración 0081 (4 niveles + `cuentas_config` x2 + columna `cuenta_gasto_pasarela_id`) + `schema.ts` + `types.ts` | PR-2b.1 | `feat/gastos-registro-qol` (tracker) | ~400-500 líneas, mayormente copia del cuerpo de `seed_plan_cuentas` — señalar al reviewer que el diff es de bajo esfuerzo cognitivo real pese al conteo alto |
| 3b.2 | `use-plan-cuentas.ts`: resolvers vía `cuentas_config` + fix N-niveles de `useGruposGastoConSubcuentas` | PR-2b.2 | rama de PR-2b.1 | Depende de 3b.1 mergeada (necesita columnas/claves) |
| 3b.3 | `use-bancos.ts` + `banco-form.tsx`: 3 cuentas por banco + invariante "ningún método huérfano" + UI | PR-2b.3 | rama de PR-2b.2 | Depende de 3b.2 mergeada; unidad con más lógica real, no solo copy-paste |

**Nota crítica**: PR-2b MUST mergearse ANTES de Phase 4 (PR-3) — PR-3 lee `bancos_empresa.cuenta_gasto_pasarela_id` asumiendo que siempre existe (contrato PR-2b→PR-3, design.md línea 25).

## Phase 3b: PR-2b — Reestructuración 4 niveles GASTOS + 3 cuentas por banco (supersede Phase 3/PR-2)

> Depende de Phase 3 (PR-2, `16a0e3e`) mergeado. Debe mergearse ANTES de Phase 4 (PR-3). Zonas prohibidas (obs #705): solo tocar subárbol GASTOS de `plan_cuentas`, `bancos_empresa`, `metodo_cobro_deducciones`, `banco-form.tsx`, hooks de gasto/banco listados abajo.

### 3b.1 — Migración 0081 + `schema.ts` + `types.ts`

- [ ] 3b.1.1 `migrations/0081_gastos_comisiones_4niveles.sql` (nuevo) — `CREATE OR REPLACE FUNCTION seed_plan_cuentas`: mismo cuerpo de 0080 MENOS el INSERT de `6.2.05`, MÁS 4 bloques nuevos `ON CONFLICT (empresa_id,codigo) DO NOTHING`: `6.1.25 GASTOS DE VENTA`, `6.1.25.01 COMISIONES DE PASARELAS DE PAGO`, `6.2.06 GASTOS FINANCIEROS`, `6.2.06.01 COMISIONES BANCARIAS`. Satisface SC-01, SC-03.
- [ ] 3b.1.2 Mismo archivo — `SELECT seed_plan_cuentas(id, NULL) FROM empresas` backfill idempotente. Satisface SC-02, SC-04.
- [ ] 3b.1.3 Mismo archivo — `INSERT INTO cuentas_config (...) SELECT ... FROM plan_cuentas WHERE codigo IN ('6.1.25.01','6.2.06.01') ON CONFLICT (empresa_id,clave) DO NOTHING` con claves `GRUPO_COMISIONES_PASARELA`/`GRUPO_COMISIONES_BANCARIAS`.
- [ ] 3b.1.4 Mismo archivo — `ALTER TABLE bancos_empresa ADD COLUMN IF NOT EXISTS cuenta_gasto_pasarela_id UUID REFERENCES plan_cuentas(id)`.
- [ ] 3b.1.5 Mismo archivo — bloque `DO $$ ... $$`: por cada `bancos_empresa` existente, crear leaf bajo `6.2.06.01` (nombre `{Banco} {Tipo} {últ4}`) y actualizar `cuenta_gasto_comision_id`; crear leaf bajo `6.1.25.01` y setear `cuenta_gasto_pasarela_id`. Mismo patrón de numeración por conteo de hijos que 0080. Satisface SC-13 (backfill), SC-28.
- [ ] 3b.1.6 Mismo archivo — `UPDATE metodo_cobro_deducciones SET cuenta_gasto_id = be.cuenta_gasto_comision_id ... WHERE cuenta_gasto_id IN (SELECT id FROM plan_cuentas WHERE codigo LIKE '6.2.05.%')`, re-apuntando el backfill de SC-10 a la leaf nueva de "Comisiones Bancarias". Satisface SC-10 (actualizado).
- [ ] 3b.1.7 Mismo archivo — `UPDATE plan_cuentas SET is_active=FALSE WHERE codigo = '6.2.05' OR codigo LIKE '6.2.05.%'`, ejecutado DESPUÉS de 3b.1.6 (orden crítico — repuntar antes de desactivar, design.md líneas 61-69).
- [ ] 3b.1.8 `src/core/db/powersync/schema.ts` — Agregar columna `cuenta_gasto_pasarela_id: column.text` en `bancos_empresa`.
- [ ] 3b.1.9 `src/core/db/kysely/types.ts` — Agregar `cuenta_gasto_pasarela_id: string | null` en `BancosEmpresa`.
- [ ] 3b.1.10 Verify: `yarn type-check` limpio en `schema.ts`/`types.ts` (0 errores nuevos vs baseline ~308 preexistentes de `*.test.ts`; `yarn lint` no aplica, ESLint no instalado).
- [ ] 3b.1.11 Manual QA — SC-01/02/03/04: aplicar 0081 en empresa nueva (ambas ramas creadas) y empresa existente (backfill: `6.2.05`/`6.2.05.NN` quedan `is_active=false`, re-ejecución no duplica).
- [ ] 3b.1.12 Manual QA — SC-10: método con backfill previo de 0080 ahora apunta a la leaf de "Comisiones Bancarias" (no a la leaf plana desactivada).
- [ ] 3b.1.13 ⚠️ Financiero/inmutabilidad: orden 3b.1.6 ANTES de 3b.1.7 es crítico — desactivar `6.2.05` antes de repuntar dejaría FKs colgando de filas inactivas. Aplicar con cuidado extra en `sdd-apply`.

### 3b.2 — `use-plan-cuentas.ts`: resolvers + fix N-niveles

> Depende de 3b.1 mergeada (necesita `cuentas_config` con las 2 claves nuevas).

- [ ] 3b.2.1 `src/features/contabilidad/hooks/use-plan-cuentas.ts` — Eliminar `useSubgrupoComisionesBancarias()` (hardcode `6.2.05`, superado).
- [ ] 3b.2.2 Mismo archivo — Agregar `useGrupoComisionesBancarias()`: resuelve `{ id, codigo, nivel }` vía `cuentas_config WHERE clave='GRUPO_COMISIONES_BANCARIAS' AND empresa_id=?` (join a `plan_cuentas`).
- [ ] 3b.2.3 Mismo archivo — Agregar `useGrupoComisionesPasarela()`: mismo patrón con clave `GRUPO_COMISIONES_PASARELA`.
- [ ] 3b.2.4 Mismo archivo — `useGruposGastoConSubcuentas()`: cambiar el match de `subcuentas` de "hijos directos por `parent_id`" a "todos los descendientes con `es_cuenta_detalle=1`" (recursión N-niveles), preservando la forma `GrupoConSubcuentas = CuentaContable & { subcuentas: CuentaContable[] }` para no romper consumidores. Satisface la decisión #713 (opción A).
- [ ] 3b.2.5 Verify: `yarn type-check` limpio en `use-plan-cuentas.ts` (0 errores nuevos).
- [ ] 3b.2.6 Manual QA — `gastos-dashboard.tsx`, `gasto-list.tsx`, `cuenta-gasto-modal.tsx`: confirmar que las leaves por banco (`6.1.25.01.NN`/`6.2.06.01.NN`) aparecen agrupadas correctamente en los selectores de gasto manual, sin cambios de props/shape en los 3 componentes.
- [ ] 3b.2.7 Manual QA — Confirmar que `6.1.25`/`6.2.06` (grupos intermedios sin leaves propias directas) no generan entradas fantasma que rompan la selección en la UI de los 3 consumidores.

### 3b.3 — `use-bancos.ts` + `banco-form.tsx`: 3 cuentas por banco + invariante de métodos

> Depende de 3b.2 mergeada.

- [ ] 3b.3.1 `src/features/configuracion/hooks/use-bancos.ts` — Agregar `cuenta_gasto_pasarela_id: string | null` a `interface Banco`.
- [ ] 3b.3.2 Mismo archivo — `createBanco`: agregar param `cuenta_gasto_pasarela_id?: string`, incluir columna en el INSERT.
- [ ] 3b.3.3 Mismo archivo — `updateBanco`: agregar param `cuenta_gasto_pasarela_id?: string | null`, agregar al `SET` condicional (mismo patrón que `cuenta_gasto_comision_id`).
- [ ] 3b.3.4 `src/features/configuracion/components/banco-form.tsx` — Rewrite `crearCuentasDelBanco`: firma `opts: { crearActivo, crearComisionBancaria, crearComisionPasarela }`, retorna `{ cuentaContableId?, cuentaGastoComisionId?, cuentaGastoPasarelaId?, comisionBancariaOmitida, comisionPasarelaOmitida }`. Usa `useGrupoComisionesBancarias()`/`useGrupoComisionesPasarela()` (reemplaza `useSubgrupoComisionesBancarias`). Nombre dinámico de leaf: `{Banco} {Tipo} {últ4 de numero_cuenta}` (sin prefijo "COMISION BANCO"). Satisface SC-13, SC-28.
- [ ] 3b.3.5 Mismo archivo — `handleCrearCuentaContable`: extender a 3 cuentas faltantes (activo/bancaria/pasarela), actualizar estado y toasts para 3 resultados posibles, actualizar condición `disabled` del botón (las 3 deben existir para deshabilitar).
- [ ] 3b.3.6 Mismo archivo — `handleSubmit` (rama CREATE): auto-crear las 3 cuentas faltantes antes de `createBanco`, pasar `cuenta_gasto_pasarela_id` al payload.
- [ ] 3b.3.7 Mismo archivo — `handleSubmit` (rama EDIT): mismo patrón de auto-completar solo lo que falta (sin tocar cuentas ya vinculadas), agregar `cuenta_gasto_pasarela_id` a `updateBanco`. Satisface SC-15 (reasignar 1 sin afectar la otra).
- [ ] 3b.3.8 Mismo archivo — UI: agregar segundo `NativeSelect` independiente para "Cuenta de Comisión de Pasarela de Pago" (filtrado `useCuentasDetallePorTipo('GASTO')`, mismo patrón que el select de comisión bancaria existente), con su propio texto de ayuda. Satisface la parte UI de SC-13/SC-15.
- [ ] 3b.3.9 Mismo archivo — Invariante "ningún método queda huérfano" (SC-29/30): en el loop de `metodoDrafts` al guardar, garantizar que `bancos_empresa.cuenta_gasto_pasarela_id` esté disponible para que el default-seeding de `createPaymentMethod` (PR-3) vincule métodos sin cuenta propia — este archivo NO duplica el insert en `metodo_cobro_deducciones`, solo garantiza la precondición (contrato PR-2b→PR-3).
- [ ] 3b.3.10 Verify: `yarn type-check` limpio en `use-bancos.ts` y `banco-form.tsx` (0 errores nuevos).
- [ ] 3b.3.11 Manual QA — SC-13/SC-28: crear banco "Venezuela" Corriente terminado en 5546 → 3 cuentas creadas (activo, "Venezuela Corriente 5546" bajo Comisiones Bancarias, "Venezuela Corriente 5546" bajo Comisiones de Pasarelas), sin colisión con una 2da cuenta Ahorro del mismo banco terminada en 5546.
- [ ] 3b.3.12 Manual QA — SC-29: crear banco + 2 métodos POS sin cuenta propia en el mismo flujo → ambos comparten la misma cuenta base de pasarela.
- [ ] 3b.3.13 Manual QA — SC-30: método nuevo sin cuenta de pasarela especificada → queda vinculado automáticamente a la base del banco, nunca huérfano.
- [ ] 3b.3.14 Manual QA — SC-15: editar banco, reasignar solo la cuenta bancaria → solo esa cambia; pasarela y deducciones existentes intactas.
- [ ] 3b.3.15 Manual QA — SC-16: dos empresas con bancos de mismo nombre/últ4 → cada una obtiene sus propias leaves, sin colisión entre empresas.
- [ ] 3b.3.16 ⚠️ Riesgo preexistente (sin mitigación nueva): cuentas huérfanas si `createBanco` falla tras crear las 3 leaves — igual a PR-2, solo anotado (design.md Open Questions).

---

## Phase 4: PR-3 — `payment-method-form.tsx` N-deducciones (Slice 3)

> Depende de PR-1a mergeado (requiere tabla `metodo_cobro_deducciones`) Y de Phase 3b/PR-2b mergeado (requiere `bancos_empresa.cuenta_gasto_pasarela_id` garantizado no-null, contrato PR-2b→PR-3).

- [ ] 4.1 `src/features/configuracion/schemas/payment-method-schema.ts` — Agregar schema Zod para array de deducciones: `{ concepto: z.string().min(1), porcentaje: z.number().min(0).max(100), cuenta_gasto_id: z.string().uuid(), tipo: z.enum(['COMISION','ISLR','OTRO']) }[]`.
- [ ] 4.2 `src/features/configuracion/components/payment-method-form.tsx` — UI de N filas de deducción (agregar/editar/desactivar), reusando patrón de formularios array existentes en el proyecto.
- [ ] 4.3 Mismo archivo — Defaults al crear según `tipo`: `PUNTO` → 2 slots `porcentaje=0`; transferencia/otros bancarios → 1 slot `porcentaje=0`; `TARJETA_CREDITO` → 1 slot `tipo='ISLR'`, `porcentaje=5`. Todos editables antes/después de guardar. Satisface SC-07, SC-08.
- [ ] 4.4 Mismo archivo — Si el método no tiene `banco_empresa_id` (ej. EFECTIVO), no ofrecer la sección de deducciones bancarias. Satisface SC-09.
- [ ] 4.5 Mismo archivo — Acción "desactivar" concepto ejecuta `UPDATE ... SET is_active=0` (soft-deactivate); NO ofrecer ni ejecutar DELETE físico de filas de `metodo_cobro_deducciones`. Satisface SC-11.
- [ ] 4.6 Confirmar que toda query/insert de deducciones filtra por `empresa_id` del usuario actual (multi-tenant). Satisface SC-12.
- [ ] 4.7 Verify: `yarn type-check && yarn lint` limpio en `payment-method-schema.ts` y `payment-method-form.tsx`.
- [ ] 4.8 Manual QA — SC-07: crear método `PUNTO` → 2 filas con `porcentaje=0`.
- [ ] 4.9 Manual QA — SC-08: crear tarjeta de crédito → 1 fila `tipo='ISLR'`, `porcentaje=5` precargada.
- [ ] 4.10 Manual QA — SC-09: método EFECTIVO no ofrece agregar deducciones bancarias.
- [ ] 4.11 Manual QA — SC-11: desactivar una deducción → `is_active=0`, deja de aplicarse en cierres futuros pero sigue en la tabla.
- [ ] 4.12 Manual QA — SC-12: usuario de Empresa A solo ve deducciones de sus propios métodos, nunca las de Empresa B.

## Phase 5: PR-4 — Cierre aplica N deducciones (Slice 4)

> Depende de PR-1a y PR-3 mergeados (necesita filas de `metodo_cobro_deducciones` pobladas).

- [ ] 5.1 `src/features/contabilidad/hooks/use-gastos.ts` (`insertarGastoComisionEnTx` L505-645) — Cambiar firma: `cuentaComisionId` → `cuentaGastoId` (mismo tipo); agregar `concepto: string` (reemplaza el literal `'Comision bancaria'` hardcodeado en la descripción, línea 566) y `tipo: string` (solo trazabilidad en `observaciones`, sin cambiar lógica contable).
- [ ] 5.2 `src/features/caja/hooks/use-sesiones-caja.ts` (`aplicarComisionSiCorresponde` ~L1138-1179) — Reemplazar el único `comisionPct`/`cuentasConfig['COMISION_BANCARIA']` por: `SELECT * FROM metodo_cobro_deducciones WHERE metodo_cobro_id=? AND is_active=1 ORDER BY orden`, iterando cada concepto dentro de la misma `writeTransaction`.
- [ ] 5.3 Mismo archivo — Para cada deducción: `montoConceptoNativo = montoBaseD * deduccion.porcentaje / 100` calculado de forma independiente (NO en cascada, siempre sobre el monto base original), llamando `insertarGastoComisionEnTx` con `cuentaGastoId: deduccion.cuenta_gasto_id`, `concepto: deduccion.concepto`, `tipo: deduccion.tipo`. Satisface SC-17.
- [ ] 5.4 Mismo archivo — Si un método sin banco/deducciones válidas tiene una fila activa mal configurada (ej. EFECTIVO), ignorar la deducción y emitir el warning W5 existente, sin crear gasto ni bloquear el cierre. Satisface SC-18.
- [ ] 5.5 Confirmar que los N gastos se insertan dentro de la misma `writeTransaction` de `cerrarSesionCaja`; si falla cualquier paso, TODO el cierre revierte (incluidas deducciones ya insertadas) y `status` permanece `ABIERTA`. Satisface SC-19.
- [ ] 5.6 Confirmar que el monto en Bs de cada deducción usa la tasa vigente ya resuelta en el Paso 1 del cierre (fix `tasaDelDia` ya corregido, fuera de este alcance). Satisface SC-20.
- [ ] 5.7 Confirmar que Tesorería sigue mostrando la misma escritura (`gastos`+`gasto_pagos`+`movimientos_bancarios`+`libro_contable`), ahora N veces en vez de 1, sin cambios de visibilidad. Satisface SC-21.
- [ ] 5.8 Verify: `yarn type-check && yarn lint` limpio en `use-gastos.ts` y `use-sesiones-caja.ts`.
- [ ] 5.9 Manual QA — SC-17: método con 2 deducciones activas (Comisión 3% + ISLR 5%), cierre con $1000 → 2 gastos ($30 y $50), cada uno en su cuenta, ambos calculados sobre los $1000 originales.
- [ ] 5.10 Manual QA — SC-18: método EFECTIVO con deducción mal configurada → se ignora con warning W5, sin bloquear el cierre.
- [ ] 5.11 Manual QA — SC-19: cierre con un método sin destino de banco configurado → ningún gasto de deducciones persiste, sesión permanece `ABIERTA`.
- [ ] 5.12 Manual QA — SC-20: deducciones convertidas a Bs usan la tasa vigente sin fallar.
- [ ] 5.13 Manual QA — SC-21: Tesorería muestra 2 registros de deducción distintos tras un cierre con 2 conceptos.
- [ ] 5.14 ⚠️ Financiero/inmutabilidad: 5.1-5.3 tocan el flujo transaccional de `cerrarSesionCaja` (atomicidad, `movimientos_bancarios`, `libro_contable`) — aplicar con cuidado extra en `sdd-apply`, no reordenar pasos existentes del cierre.

---

## Cross-Cutting Notes

- **Ejecución de limpieza (Phase 2 / PR-1b)**: es manual, por el usuario, DESPUÉS de PR-1a mergeado y ANTES de validar PR-4 (Phase 5) end-to-end — los datos deben quedar consistentes antes de probar el loop de N-deducciones. `pg_dump` es salvaguarda obligatoria, no opcional.
- **Phase 3b/PR-2b supera el mapeo plano de Phase 3/PR-2**: `6.2.05` queda desactivado por la migración 0081. Orden de merge obligatorio: Phase 3 (PR-2) → Phase 3b (PR-2b, 3 sub-unidades 3b.1→3b.2→3b.3) → Phase 4 (PR-3). PR-2b usa `feature-branch-chain` sobre el tracker `feat/gastos-registro-qol` dado su tamaño (~675-850 líneas estimadas, ver forecast dedicado antes de Phase 3b).
- No existe test runner ni ESLint script de cobertura automática en este proyecto; verificación por fase es `yarn type-check && yarn lint` en los archivos tocados, más el checklist de QA manual de cada fase.
- Chain strategy (stacked-to-main vs feature-branch-chain vs size:exception) no está decidida — preguntar al usuario antes de iniciar PR-1a, dado que PR-1a+PR-1b combinados exceden el presupuesto de 400 líneas y el script de limpieza es destructivo por diseño.
- Fix de `tasaDelDia` (bloqueador histórico de Slice 4) YA RESUELTO en el Paso 1 previo (commits `db0417b`, `1e3a603`, `4fc9808`) — Phase 5 puede validarse end-to-end sin bloqueo pendiente.
