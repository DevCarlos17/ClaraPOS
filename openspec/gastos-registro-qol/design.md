
# Design: Gastos — Registro QoL (Comisiones Bancarias N-conceptos)

> Change: `gastos-registro-qol` | Implementa capacidades `gastos-comisiones-bancarias-seed`, `metodo-cobro-deducciones` | Modifica `caja`, `configuracion` (bancos)

## Technical Approach

Resuelve la tensión detectada en la exploración (obs #627/#632): `6.2.01 GASTOS FINANCIEROS` y `6.2.03 COMISION BANCARIA` son leaves hermanas de `6.2 GASTOS NO OPERACIONALES`, no hay grupo intermedio, y `codigo` es inmutable. En vez de reconvertir esas leaves, se crea un **subgrupo nuevo** `6.2.05 COMISIONES BANCARIAS` bajo el `6.2` YA EXISTENTE (que cumple el rol de "Gastos Financieros" del modelo de 3 niveles pedido), y las cuentas por banco nacen como hijas de ese subgrupo. Las leaves viejas quedan intactas hasta que el script de limpieza (separado, manual) las desactiva. `metodo_cobro_deducciones` reemplaza `metodos_cobro.comision_pct` (columna única) por N filas por método, cada una con su propia cuenta de gasto — elimina la dependencia de la clave global `cuentas_config['COMISION_BANCARIA']`.

## Architecture Decisions

| Decisión | Elección | Alternativas | Racional |
|---|---|---|---|
| **Ubicación del subgrupo (mayor riesgo, obs #632)** | Nodo nuevo `6.2.05 COMISIONES BANCARIAS` (grupo, `es_cuenta_detalle=0`) hijo de `6.2` existente | Convertir `6.2.01` de leaf a grupo | `codigo` inmutable + `6.2.01` puede tener gastos históricos posteados; crear nodo nuevo es 100% aditivo, cero riesgo de romper FKs existentes |
| Cuentas por banco | Hijas de `6.2.05`: `6.2.05.01`, `6.2.05.02`... vía `agregarSubcuentaAGrupo` (ya genérico, sin modificar) | Extender `crearGrupoGastoConSubcuentas` para nesting | Esa función solo crea grupos top-level `6.{n}` nuevos (2 niveles); `agregarSubcuentaAGrupo` ya acepta cualquier `parent_id/codigo/nivel` existente — cero código nuevo de escritura |
| Fuente de verdad de la cuenta a debitar | `metodo_cobro_deducciones.cuenta_gasto_id` (por fila) | Resolver por banco en el momento del cierre | La cuenta por banco (`bancos_empresa.cuenta_gasto_comision_id`) es solo el **default** al crear una deducción; queda copiada en la fila para permitir redirigir un concepto puntual sin afectar los demás |
| `metodos_cobro.comision_pct` | Se **mantiene** (deprecado, comentario en schema), no se dropea en 0080 | Drop inmediato | El código actual (`use-sesiones-caja.ts`) todavía lo lee hasta que el Slice 4 (PR encadenado) reemplace el path; dropearlo antes rompe producción entre PRs |
| Eliminar vs. desactivar concepto de deducción (open question #2 del proposal) | **Soft-deactivate** (`is_active` integer 0/1) | Hard DELETE | `insertarGastoComisionEnTx` NO guarda FK hacia la fila de deducción (solo copia `cuentaComisionId`/`comisionPct` al momento del cierre) — no hay integridad referencial que lo exija, pero **todas** las tablas catálogo del proyecto (`departamentos`, `productos`, `marcas`, `metodos_cobro`, etc.) usan `is_active`, nunca DELETE físico; mantiene consistencia de convención y trazabilidad de auditoría |
| Repuntar `cuentas_config['COMISION_BANCARIA']` | **Se elimina la fila** (clave queda libre) en el script de limpieza, no se repunta a un fallback | Repuntar a `6.2.05` | **Regla de dominio confirmada por el usuario**: por diseño, todo método de pago bancario SIEMPRE tiene banco asociado (no existe método bancario huérfano). EFECTIVO no es bancario pero tiene destino propio (caja fuerte en tesorería) y nunca cobra comisión (W5). Métodos NO monetarios futuros (cortesías, permuta) no son bancarios, no tienen estado de cuenta ni generan comisiones bancarias — su cuadre rutearía a una cuenta de gasto por otra vía, nunca por `COMISION_BANCARIA`. Por lo tanto la clave global no tiene consumidor legítimo tras resolver comisiones por banco. Además, mantenerla apuntando a `6.2.03` (leaf vieja) la dejaría bloqueada por el trigger `protect_plan_cuentas` Regla 2 al querer desactivar `6.2.03` |
| Validación de `cuenta_gasto_id` en el nuevo campo | Sin trigger DB nuevo; UI restringe a `useCuentasDetallePorTipo('GASTO')` | Trigger tipo `validate_gasto_insert` | `metodo_cobro_deducciones` es config, no ledger; el patrón existente en todo el proyecto para selects de cuenta es filtrar en la UI, no en DB |

## Estructura del plan de cuentas (resultado)

```
6      GASTOS (grupo, existente)
6.2      GASTOS NO OPERACIONALES (grupo, existente) ── cumple rol de "Gastos Financieros"
6.2.01     GASTOS FINANCIEROS (leaf, existente)       ── SIN TOCAR en 0080; desactivada por limpieza
6.2.02     PERDIDA POR DIFERENCIAL CAMBIARIO (leaf, existente, intacta)
6.2.03     COMISION BANCARIA (leaf, existente)        ── SIN TOCAR en 0080; desactivada por limpieza
6.2.04     PERDIDA EN VUELTO (leaf, existente, intacta)
6.2.05     COMISIONES BANCARIAS (grupo, NUEVO)         ── es_cuenta_detalle=0
6.2.05.01    COMISION BANCO {NOMBRE} (leaf, NUEVO)     ── una por banco, auto-creada
6.2.05.02    COMISION BANCO {NOMBRE} (leaf, NUEVO)
```

## Data Flow — Cierre (`aplicarComisionSiCorresponde`, dentro del `writeTransaction` existente)

    hoy:    1 comisionPct (config.comision_pct) → cuentasConfig['COMISION_BANCARIA'] → 1 insertarGastoComisionEnTx
    nuevo:  SELECT * FROM metodo_cobro_deducciones WHERE metodo_cobro_id=? AND is_active=1 ORDER BY orden
            for each deduccion (N conceptos, ej. Comision + ISLR):
              montoConceptoNativo = montoBaseD * deduccion.porcentaje / 100   (independiente, no en cascada)
              insertarGastoComisionEnTx(tx, { ...campos existentes, cuentaGastoId: deduccion.cuenta_gasto_id,
                                               concepto: deduccion.concepto, tipo: deduccion.tipo })
            -- sigue en la MISMA tx de cerrarSesionCaja; Tesoreria visibility unchanged (misma escritura
            -- gastos+gasto_pagos+movimientos_bancarios+libro_contable, solo N veces en vez de 1)

`insertarGastoComisionEnTx` cambia de firma: `cuentaComisionId` → `cuentaGastoId` (mismo tipo), agrega `concepto: string` (reemplaza el literal `'Comision bancaria'` hardcodeado en la descripción, línea 566 de `use-gastos.ts`) y `tipo: string` (solo para trazabilidad en `observaciones`, no cambia lógica contable).

## `metodo_cobro_deducciones` — DDL

```sql
CREATE TABLE metodo_cobro_deducciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  metodo_cobro_id UUID NOT NULL REFERENCES metodos_cobro(id),
  cuenta_gasto_id UUID NOT NULL REFERENCES plan_cuentas(id),
  concepto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('COMISION','ISLR','OTRO')),
  porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (porcentaje >= 0 AND porcentaje <= 100),
  orden INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);
CREATE INDEX idx_metodo_cobro_deducciones_metodo ON metodo_cobro_deducciones(metodo_cobro_id);
CREATE INDEX idx_metodo_cobro_deducciones_empresa ON metodo_cobro_deducciones(empresa_id);
CREATE TRIGGER trg_metodo_cobro_deducciones_updated BEFORE UPDATE ON metodo_cobro_deducciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Sin trigger anti-UPDATE/DELETE: config editable, no ledger.

ALTER TABLE metodo_cobro_deducciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_empresa" ON metodo_cobro_deducciones FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
CREATE POLICY "insert_own_empresa" ON metodo_cobro_deducciones FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "update_own_empresa" ON metodo_cobro_deducciones FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id());
```

PowerSync `schema.ts`: mismo mapping que otras tablas (`porcentaje: column.text`, `is_active/orden: column.integer`). Kysely `types.ts`: `MetodoCobroDeducciones { id, empresa_id, metodo_cobro_id, cuenta_gasto_id, concepto, tipo, porcentaje: string, orden: number, is_active: number, created_at, updated_at, created_by: string | null }`.

## `bancos_empresa` — columna de vínculo

```sql
ALTER TABLE bancos_empresa ADD COLUMN IF NOT EXISTS cuenta_gasto_comision_id UUID REFERENCES plan_cuentas(id);
```

Fuente de verdad para el **default** al crear una deducción (Slice 2 extiende `handleCrearCuentaContable` en `banco-form.tsx` para además crear+vincular la leaf de comisión vía `agregarSubcuentaAGrupo`). No se lee en el cierre (Slice 4 lee `metodo_cobro_deducciones.cuenta_gasto_id` directamente).

## Migración 0080 — estructura + backfill (sin DELETE)

1. `seed_plan_cuentas`: `CREATE OR REPLACE FUNCTION` agrega el INSERT de `6.2.05` (mismo patrón `ON CONFLICT (empresa_id,codigo) DO NOTHING` de 0064) + backfill `SELECT seed_plan_cuentas(id, NULL) FROM empresas`.
2. `CREATE TABLE metodo_cobro_deducciones` (arriba).
3. `ALTER TABLE bancos_empresa ADD COLUMN cuenta_gasto_comision_id`.
4. Backfill por banco existente: por cada fila de `bancos_empresa`, `INSERT INTO plan_cuentas` una leaf `6.2.05.NN COMISION BANCO {nombre_banco}` bajo `6.2.05`, luego `UPDATE bancos_empresa SET cuenta_gasto_comision_id = <nueva_id>`.
5. Backfill de deducciones: `INSERT INTO metodo_cobro_deducciones (..., concepto='Comision bancaria', tipo='COMISION', porcentaje=comision_pct, cuenta_gasto_id=<leaf del banco de ese metodo>) SELECT ... FROM metodos_cobro WHERE banco_empresa_id IS NOT NULL AND comision_pct > 0`.
6. `metodos_cobro.comision_pct` NO se toca (se deja, deprecado).

## Script de limpieza — `migrations/cleanup_gastos_cxp_qol.sql` (separado, manual, post-`pg_dump`)

Orden dentro de una transacción:

1. `pg_dump --table=gastos,gasto_pagos,facturas_compra,facturas_compra_det,notas_fiscales_compra,notas_fiscales_compra_det,retenciones_iva,retenciones_islr,movimientos_cuenta_proveedor,vencimientos_pagar,libro_contable,movimientos_metodo_cobro,movimientos_bancarios,proveedores,bancos_empresa,metodos_cobro` (comentario de cabecera, ejecutado por el usuario antes de correr el script).
2. `ALTER TABLE ... DISABLE TRIGGER` en las 11 tablas/triggers mapeados en obs #633 (`trg_gasto_protect`, `trg_fact_compra_protect`, `trg_fact_compra_det_no_update/delete`, `trg_nf_compra_no_update/delete`, `trg_nf_compra_det_no_update/delete`, `trg_ret_iva_compra_protect`, `trg_ret_islr_compra_protect`, `trg_mov_cuenta_prov_no_update/delete`, `trg_libro_contable_protect`, `trg_mov_bancario_protect`, `trg_mov_metodo_cobro_no_update/delete`).
3. DELETE hijos→padres (orden exacto obs #633): `gasto_pagos` → `facturas_compra_det` → `retenciones_iva` → `retenciones_islr` → `notas_fiscales_compra_det` → `notas_fiscales_compra` → `movimientos_cuenta_proveedor` → `vencimientos_pagar` → `facturas_compra` → `gastos`.
4. Tablas compartidas con discriminador: `DELETE FROM movimientos_metodo_cobro WHERE origen='PAGO_PROVEEDOR'`; `DELETE FROM movimientos_bancarios WHERE origen IN ('GASTO','PAGO_PROVEEDOR')` (excluye `'MANUAL'`); `UPDATE libro_contable SET parent_id=NULL WHERE modulo_origen IN ('GASTO','COMPRA','PAGO_CXP','NCR_COMPRA')` luego `DELETE ... WHERE modulo_origen IN (...)`.
5. Recompute (nunca reset a 0):
   ```sql
   UPDATE bancos_empresa be SET saldo_actual = be.saldo_inicial + COALESCE((
     SELECT SUM(CASE WHEN mb.tipo='INGRESO' THEN mb.monto ELSE -mb.monto END)
     FROM movimientos_bancarios mb WHERE mb.banco_empresa_id = be.id), 0), updated_at = NOW();

   UPDATE metodos_cobro mc SET saldo_actual = COALESCE((
     SELECT SUM(CASE WHEN mmc.tipo='INGRESO' THEN mmc.monto ELSE -mmc.monto END)
     FROM movimientos_metodo_cobro mmc WHERE mmc.metodo_cobro_id = mc.id), 0), updated_at = NOW();
   ```
6. `UPDATE proveedores SET saldo_actual = 0` (100% derivado de CxP, seguro resetear).
7. `DELETE FROM cuentas_config WHERE clave='COMISION_BANCARIA'` (libera `6.2.03` del bloqueo de desactivación).
8. `UPDATE plan_cuentas SET is_active=FALSE WHERE codigo IN ('6.2.01','6.2.03')` (sin `DISABLE TRIGGER`: ya no está bloqueado tras el paso 7).
9. `ALTER TABLE ... ENABLE TRIGGER` (revertir paso 2).

`mov_caja_fuerte`: sin acción (cero escrituras GASTO-origin confirmadas en el código actual).

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `migrations/0080_gastos_comisiones_bancarias_estructura.sql` | Create | Seed `6.2.05` + backfill, tabla `metodo_cobro_deducciones`, columna `bancos_empresa.cuenta_gasto_comision_id`, backfill por banco/método |
| `migrations/cleanup_gastos_cxp_qol.sql` | Create | Limpieza manual, algoritmo arriba |
| `src/core/db/powersync/schema.ts` | Modify | `metodo_cobro_deducciones` Table; `cuenta_gasto_comision_id` en `bancos_empresa` |
| `src/core/db/kysely/types.ts` | Modify | Mirror ambos |
| `src/features/contabilidad/hooks/use-plan-cuentas.ts` | Modify (add) | Nuevo hook `useSubgrupoComisionesBancarias()` (id/codigo/nivel de `6.2.05`); NO se toca `agregarSubcuentaAGrupo`/`crearGrupoGastoConSubcuentas` |
| `src/features/configuracion/components/banco-form.tsx` (~L334-401) | Modify | `handleCrearCuentaContable` dispara también `agregarSubcuentaAGrupo` para la leaf de comisión + set `cuentaGastoComisionId`; UI de vínculo visible/reasignable |
| `src/features/contabilidad/hooks/use-gastos.ts` (`insertarGastoComisionEnTx` L505-645) | Modify | `cuentaComisionId`→`cuentaGastoId`, agrega `concepto`/`tipo`, descripción usa `concepto` en vez de literal |
| `src/features/caja/hooks/use-sesiones-caja.ts` (`aplicarComisionSiCorresponde` ~L1138-1179) | Modify | Loop sobre `metodo_cobro_deducciones` en vez de `comisionPct` único |
| `src/features/configuracion/components/payment-method-form.tsx` + `schemas/payment-method-schema.ts` | Modify | UI de N deducciones, defaults por tipo (PUNTO=2@0%, transferencia/otros=1@0%, tarjeta crédito=ISLR 5%) |
| `src/features/tesoreria/*` | None (verificar) | Confirmar que la visibilidad no cambia (N gastos en vez de 1) |

## Interfaces / Contracts

```ts
// use-gastos.ts — firma actualizada
export async function insertarGastoComisionEnTx(tx: Transaction, p: {
  empresaId: string; metodoCobroId: string; bancoEmpresaId: string
  montoComisionNativo: string; monedaCodigo: 'USD' | 'VES'; tasa: number
  cuentaGastoId: string        // antes: cuentaComisionId
  concepto: string             // nuevo — reemplaza literal 'Comision bancaria'
  tipo: string                 // nuevo — solo trazabilidad
  sesionCajaId: string; comisionPct: string; usuarioId: string
}): Promise<{ gastoId: string }>

// use-plan-cuentas.ts — nuevo hook
export function useSubgrupoComisionesBancarias(): { id: string; codigo: '6.2.05'; nivel: 3 } | undefined
```

## Testing Strategy (sin test runner — checklist manual)

| Capa | Qué | Cómo |
|---|---|---|
| Tipo/lint | Todo archivo nuevo/modificado | `yarn type-check && yarn lint` |
| Manual — Slice 1 | Migración 0080 en empresa nueva y existente | `6.2.05` + leaves por banco creadas; `metodo_cobro_deducciones` backfillada desde `comision_pct` |
| Manual — Slice 2 | Crear banco nuevo | Cuenta activo (1.1.xx) Y cuenta comisión (6.2.05.NN) creadas y vinculadas sin pasos manuales |
| Manual — Slice 3 | Tarjeta de crédito nueva | 1 slot ISLR 5% precargado; agregar concepto manual funciona |
| Manual — Slice 4 | Cierre con método de 2 conceptos (comisión + ISLR) | 2 gastos creados, cada uno en su cuenta; Tesorería muestra ambos |
| Manual — limpieza | Ejecutar `cleanup_gastos_cxp_qol.sql` en copia de `pg_dump` | `bancos_empresa.saldo_actual`/`metodos_cobro.saldo_actual` coinciden con SUM manual sobre movimientos remanentes; `6.2.01`/`6.2.03` quedan `is_active=false` |

## Migration / Rollout

| PR | Contenido | Dependencia |
|---|---|---|
| **PR-1 (Slice 1)** | Migración 0080 + `schema.ts`/`types.ts` | Ninguna |
| **PR-2 (Slice 2)** | `banco-form.tsx`, `useSubgrupoComisionesBancarias` | PR-1 mergeado (necesita `6.2.05` y columna) |
| **PR-3 (Slice 3)** | `payment-method-form.tsx` + schema, UI N-deducciones | PR-1 mergeado |
| **PR-4 (Slice 4)** | `use-gastos.ts` + `use-sesiones-caja.ts` loop | PR-1, PR-3 mergeados (necesita filas de deducciones pobladas) |
| **Limpieza** | `cleanup_gastos_cxp_qol.sql`, ejecución manual | Después de PR-1, ANTES de validar PR-4 end-to-end (datos consistentes) |

Rollback: PR-1 es aditivo puro (`DROP TABLE`/`DROP COLUMN` sin tocar datos); PR-2/3/4 son `git revert` de frontend. La limpieza **no es reversible** sin el `pg_dump` — salvaguarda obligatoria, no opcional.

## Open Questions

- [x] Numeración exacta de códigos → `6.2.05` (subgrupo), `6.2.05.NN` (por banco) — resuelto arriba.
- [x] ¿Eliminar o desactivar un concepto de deducción? → soft-deactivate (`is_active`), por convención del proyecto.
- [ ] **Residual**: si una empresa tiene >1 método bancario apuntando al MISMO `bancos_empresa` (poco común pero posible), el backfill de deducciones (paso 5 de 0080) crea una fila por método, todas apuntando a la misma leaf del banco — correcto, sin acción adicional necesaria, solo se deja anotado para `sdd-tasks`.
