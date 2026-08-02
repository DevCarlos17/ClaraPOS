
# Design: Gastos — Registro QoL (Comisiones Bancarias N-conceptos)

> Change: `gastos-registro-qol` | Implementa capacidades `gastos-comisiones-bancarias-seed`, `metodo-cobro-deducciones` | Modifica `caja`, `configuracion` (bancos)

> **PR-2b (2026-07-30, mergeado `159cb88`)**: Supera el diseño plano `6.2.05 COMISIONES BANCARIAS` de PR-2 (`16a0e3e`). Ver obs Engram `#706` (diseño final), `#703` (rewrite opción C permitido, gastos en desarrollo), `#705` (zonas prohibidas). Secciones marcadas `(PR-2b)` reemplazan el contenido anterior.
>
> **PR-3 (2026-07-31, corregido 2026-08-02)**: Ver sección dedicada "PR-3 — Deducciones N-conceptos en `payment-method-form.tsx`" más abajo. Reemplaza el entendimiento original de "cuenta especial por `tipo`" (tasks.md 4.3 viejo) por la regla unificada confirmada en obs Engram `#753` (revisión final: SIN defaults por `tipo`, un único slot base). El resto del documento (metodo_cobro_deducciones DDL, script de limpieza, PR-4) sigue vigente sin cambios.

## Technical Approach

PR-2 resolvía la tensión de `codigo` inmutable creando un único subgrupo plano `6.2.05` bajo `6.2`. El usuario confirmó (obs #703) que gastos está en desarrollo sin data real, habilitando un **rewrite limpio (opción C)**: se reemplaza `6.2.05` por una jerarquía de 4 niveles que separa dos naturalezas de comisión:

- **Comisión de pasarela de pago** (gasto de venta, nace con cada transacción POS/tarjeta) → `6.1 Gastos Operacionales > Gastos de Venta > Comisiones de Pasarelas de Pago`.
- **Comisión bancaria** (gasto financiero, ej. mantenimiento/transferencia) → `6.2 Gastos No Operacionales > Gastos Financieros > Comisiones Bancarias`.

Cada banco auto-genera SIEMPRE 3 cuentas (activo + 1 leaf por rama), y el invariante nuevo garantiza que ningún método de pago queda sin cuenta de pasarela resuelta (comparte la base del banco si no especifica una propia).

## Architecture Decisions

| Decisión | Elección | Alternativas | Racional |
|---|---|---|---|
| **Códigos del nuevo subárbol (PR-2b)** | `6.1.25 GASTOS DE VENTA` → `6.1.25.01 COMISIONES DE PASARELAS DE PAGO`; `6.2.06 GASTOS FINANCIEROS` → `6.2.06.01 COMISIONES BANCARIAS` (ambos grupos nuevos, `es_cuenta_detalle=false`) | Reutilizar `6.2.01`/reconvertir leaves viejas | `6.1` termina en `.24`, `6.2` en `.05` → siguientes libres son `.25`/`.06`. `6.2.06` reusa el nombre "GASTOS FINANCIEROS" de la leaf vieja `6.2.01` pero con código distinto — sin colisión (unique key es `empresa_id+codigo`, no nombre). Rewrite 100% limpio, sin necesidad de reconvertir nada (obs #703) |
| **`6.2.05` superado (PR-2b)** | 0081 desactiva (`is_active=false`) el grupo `6.2.05` y sus leaves `6.2.05.NN` tras re-apuntar sus consumidores | Mantenerlo como alias | Sin preservación histórica exigida (obs #703, SC-04). `protect_plan_cuentas` (0065) solo bloquea desactivar cuentas referenciadas en `cuentas_config` — `6.2.05` nunca tuvo entrada ahí, así que la desactivación no está bloqueada, pero SÍ debe ir DESPUÉS de repuntar `bancos_empresa`/`metodo_cobro_deducciones` a las leaves nuevas (orden en la migración) |
| **Resolución de los 2 grupos-padre (PR-2b, reemplaza `useSubgrupoComisionesBancarias`)** | `cuentas_config` con 2 claves nuevas por empresa: `GRUPO_COMISIONES_PASARELA` → id de `6.1.25.01`; `GRUPO_COMISIONES_BANCARIAS` → id de `6.2.06.01` | Hardcodear código (como hacía `6.2.05`); resolver por `nombre` | Los códigos son ilustrativos (podrían recalcularse si cambia el layout de `6.1`/`6.2`). `cuentas_config(empresa_id,clave)` es el mecanismo YA EXISTENTE en el proyecto para este propósito exacto (ej. `COMISION_BANCARIA` de 0064). Bonus: `protect_plan_cuentas` Regla 2 automáticamente impide desactivar por error estos 2 grupos nuevos, al quedar referenciados en `cuentas_config` |
| **`bancos_empresa` — 2 cuentas de comisión (PR-2b)** | Se **reutiliza** `cuenta_gasto_comision_id` (ya existente) para la cuenta BANCARIA; se **agrega** `cuenta_gasto_pasarela_id` (nueva) para la cuenta BASE de pasarela | Renombrar la columna existente | Renombrar tocaría `Banco` type, `use-bancos.ts`, `banco-form.tsx` y el backfill de 0080 ya aplicado — puro riesgo sin beneficio. El nombre actual sigue siendo válido semánticamente (es una cuenta de comisión, ahora específicamente la bancaria) |
| **Link método→cuenta de pasarela (invariante SC-29/30)** | Vive en `metodo_cobro_deducciones` (fila `tipo='COMISION'`, `cuenta_gasto_id = bancos_empresa.cuenta_gasto_pasarela_id`), creada por el default-seeding de **PR-3** dentro de `createPaymentMethod` (no una columna/tabla nueva) | Nueva columna `metodos_cobro.cuenta_pasarela_id` | El default-seeding de deducciones ya es responsabilidad de PR-3 (Slice 3) y ya vive en `createPaymentMethod` (compartido por `banco-form.tsx` y `payment-method-form.tsx`) — reusar ese único punto de entrada evita 2 mecanismos de auto-link divergentes. **Contrato PR-2b→PR-3**: PR-2b garantiza que `bancos_empresa.cuenta_gasto_pasarela_id` SIEMPRE existe cuando el banco existe (las 3 cuentas nacen juntas); PR-3 puede leerla como default sin verificar null |
| Cuentas por banco (grupo→leaf) | Sigue usando `agregarSubcuentaAGrupo` genérica (sin modificar), ahora invocada 2 veces por banco (una por rama) | Función nueva de escritura | Ya acepta cualquier `parent_id/codigo/nivel` — cero código nuevo de escritura, solo el nombre dinámico cambia (ver abajo) |
| Nombre dinámico de leaf (PR-2b) | `{BANCO} {TIPO} {ÚLTIMOS4}` (ej. "VENEZUELA CORRIENTE 5546"), sin prefijo "COMISION BANCO" | Mantener `COMISION BANCO {nombre}` (PR-2 original) | El grupo padre ya dice "Comisiones Bancarias"/"Comisiones de Pasarelas" — repetir "comisión" en la leaf es redundante. Se agrega `Tipo` porque una empresa puede tener 2 cuentas del mismo banco con los mismos últimos 4 dígitos (SC-28) |

## Estructura del plan de cuentas (resultado, PR-2b)

```
6.1      GASTOS OPERACIONALES (grupo, existente)
6.1.01..24  (leaves existentes, sin tocar)
6.1.25      GASTOS DE VENTA (grupo, NUEVO)
6.1.25.01     COMISIONES DE PASARELAS DE PAGO (grupo, NUEVO) ── cuentas_config['GRUPO_COMISIONES_PASARELA']
6.1.25.01.01    <BANCO TIPO ULT4> (leaf, NUEVO, auto-creada) ── una por banco
6.2      GASTOS NO OPERACIONALES (grupo, existente)
6.2.01      GASTOS FINANCIEROS (leaf vieja) ── desactivada por script de limpieza (sin cambios, Slice 1)
6.2.02      PERDIDA POR DIFERENCIAL CAMBIARIO (leaf, intacta)
6.2.03      COMISION BANCARIA (leaf vieja) ── desactivada por script de limpieza (sin cambios, Slice 1)
6.2.04      PERDIDA EN VUELTO (leaf, intacta)
6.2.05      COMISIONES BANCARIAS (grupo, de 0080) ── SUPERADO, desactivado por 0081 (PR-2b)
6.2.05.NN     (leaves de 0080) ── SUPERADAS, desactivadas por 0081 (PR-2b)
6.2.06      GASTOS FINANCIEROS (grupo, NUEVO — distinto código de 6.2.01)
6.2.06.01     COMISIONES BANCARIAS (grupo, NUEVO) ── cuentas_config['GRUPO_COMISIONES_BANCARIAS']
6.2.06.01.01    <BANCO TIPO ULT4> (leaf, NUEVO, auto-creada) ── una por banco
```

## `bancos_empresa` — columnas de vínculo (PR-2b, extiende 0080)

```sql
-- 0080 (ya aplicada): ALTER TABLE bancos_empresa ADD COLUMN cuenta_gasto_comision_id UUID REFERENCES plan_cuentas(id);
-- 0081 (PR-2b, nueva):
ALTER TABLE bancos_empresa ADD COLUMN IF NOT EXISTS cuenta_gasto_pasarela_id UUID REFERENCES plan_cuentas(id);
```

`cuenta_gasto_comision_id` = cuenta BANCARIA (leaf bajo `6.2.06.01`). `cuenta_gasto_pasarela_id` = cuenta BASE de PASARELA (leaf bajo `6.1.25.01`), fuente de default para `metodo_cobro_deducciones` de métodos sin cuenta propia.

## Migración 0081 — reestructuración 4 niveles (PR-2b)

Orden exacto (crítico: repuntar antes de desactivar):

1. `CREATE OR REPLACE FUNCTION seed_plan_cuentas`: mismo cuerpo de 0080 MENOS el bloque INSERT de `6.2.05` (se remueve, superado) MÁS 4 bloques nuevos `ON CONFLICT (empresa_id,codigo) DO NOTHING`: `6.1.25`, `6.1.25.01`, `6.2.06`, `6.2.06.01`.
2. `SELECT seed_plan_cuentas(id, NULL) FROM empresas;` — backfill idempotente (SC-01/02/03).
3. `INSERT INTO cuentas_config (...) SELECT ... FROM plan_cuentas WHERE codigo IN ('6.1.25.01','6.2.06.01') ON CONFLICT (empresa_id,clave) DO NOTHING` — claves `GRUPO_COMISIONES_PASARELA`/`GRUPO_COMISIONES_BANCARIAS`.
4. `ALTER TABLE bancos_empresa ADD COLUMN IF NOT EXISTS cuenta_gasto_pasarela_id ...`.
5. `DO $$ ... $$` — por cada `bancos_empresa` existente: crear leaf bajo `6.2.06.01` (nombre dinámico) y actualizar `cuenta_gasto_comision_id`; crear leaf bajo `6.1.25.01` y setear `cuenta_gasto_pasarela_id`. Mismo patrón de numeración por conteo de hijos que 0080.
6. `UPDATE metodo_cobro_deducciones SET cuenta_gasto_id = be.cuenta_gasto_comision_id ... WHERE cuenta_gasto_id IN (SELECT id FROM plan_cuentas WHERE codigo LIKE '6.2.05.%')` — re-apunta backfill de SC-10 a la leaf nueva de "Comisiones Bancarias" (no a pasarela — el backfill original de 0080 era 100% "Comision bancaria").
7. `UPDATE plan_cuentas SET is_active=FALSE WHERE codigo = '6.2.05' OR codigo LIKE '6.2.05.%'` — ahora seguro, nada referencia ya esas filas.

`6.2.01`/`6.2.03` (leaves viejas de 0021/0064) **NO** se tocan aquí — su desactivación sigue siendo responsabilidad del script de limpieza manual (Slice 1, sin cambios, ver más abajo).

## `metodo_cobro_deducciones` — DDL (sin cambios, ya aplicada en 0080)

Tabla, índices, RLS y comentarios de deprecación de `comision_pct` sin cambios respecto a 0080 (ver commit histórico). Único cambio PR-2b: el backfill de `cuenta_gasto_id` se re-apunta en el paso 6 de 0081, arriba.

## Script de limpieza (sin cambios, Slice 1)

`migrations/cleanup_gastos_cxp_qol.sql` — orden hijo→padre, exclusión `movimientos_bancarios WHERE origen='MANUAL'`, recompute de saldos, eliminación de `cuentas_config['COMISION_BANCARIA']` + desactivación de `6.2.01`/`6.2.03`, respaldo obligatorio `pg_dump`. Sin cambios respecto al diseño original — ver commit histórico de este archivo.

## File Changes (PR-2b)

| Archivo | Acción | Descripción |
|---|---|---|
| `migrations/0081_gastos_comisiones_4niveles.sql` | Create | Outline arriba: seed 4 nodos nuevos, `cuentas_config` x2, columna `cuenta_gasto_pasarela_id`, backfill 2 leaves/banco, repunte de deducciones, desactivación de `6.2.05` |
| `src/core/db/powersync/schema.ts` | Modify | `bancos_empresa.cuenta_gasto_pasarela_id: column.text` |
| `src/core/db/kysely/types.ts` | Modify | `BancosEmpresa.cuenta_gasto_pasarela_id: string \| null` |
| `src/features/contabilidad/hooks/use-plan-cuentas.ts` | Modify | Elimina `useSubgrupoComisionesBancarias` (hardcode `6.2.05`); agrega `useGrupoComisionesBancarias()` y `useGrupoComisionesPasarela()` vía `cuentas_config` |
| `src/features/configuracion/hooks/use-bancos.ts` | Modify | `Banco.cuenta_gasto_pasarela_id`; `createBanco`/`updateBanco` aceptan y persisten el nuevo campo |
| `src/features/configuracion/components/banco-form.tsx` | Modify | `crearCuentasDelBanco` crea 3 cuentas (firma abajo); UI con 2 selects independientes (bancaria/pasarela) + botón "Crear Cuenta" cubre 3 faltantes; `handleSubmit` CREATE/EDIT actualizados |

## Interfaces / Contracts (PR-2b)

```ts
// use-plan-cuentas.ts — reemplaza useSubgrupoComisionesBancarias
export function useGrupoComisionesBancarias(): { id: string; codigo: string; nivel: number } | undefined
export function useGrupoComisionesPasarela(): { id: string; codigo: string; nivel: number } | undefined
// ambos resuelven via cuentas_config (clave 'GRUPO_COMISIONES_BANCARIAS'/'GRUPO_COMISIONES_PASARELA'), no por codigo hardcoded

// banco-form.tsx — crearCuentasDelBanco, firma actualizada
async function crearCuentasDelBanco(
  datos: { nombreBanco: string; nroCuenta: string; tipoCuenta?: string },
  opts: { crearActivo: boolean; crearComisionBancaria: boolean; crearComisionPasarela: boolean }
): Promise<{
  cuentaContableId?: string
  cuentaGastoComisionId?: string     // bancaria, bajo 6.2.06.01
  cuentaGastoPasarelaId?: string     // pasarela base, bajo 6.1.25.01
  comisionBancariaOmitida: boolean   // true si useGrupoComisionesBancarias() no resolvio (falta migracion 0081)
  comisionPasarelaOmitida: boolean
}>

// use-bancos.ts — createBanco/updateBanco agregan:
cuenta_gasto_pasarela_id?: string | null
```

`crearCuentasDelBanco` mantiene el mismo patrón idempotente (el llamador decide qué falta vía `opts`, la función nunca asume). Riesgo de cuentas huérfanas si `createBanco` falla tras crear las leaves: **sin cambios respecto a PR-2** (riesgo preexistente, no introducido por PR-2b — aceptado, ver Open Questions).

## Testing Strategy (PR-2b, sin test runner)

| Capa | Qué | Cómo |
|---|---|---|
| Tipo | Todo archivo nuevo/modificado | `yarn type-check` (`yarn lint` roto — ESLint no instalado, no es red de seguridad) |
| Manual — 0081 empresa nueva | `seed_plan_cuentas` en empresa nueva | `6.1.25.01` y `6.2.06.01` existen, `cuentas_config` tiene ambas claves, `6.2.05` NO existe |
| Manual — 0081 empresa existente | Backfill sobre empresa con bancos ya migrados por 0080 | `6.2.05`/`6.2.05.NN` quedan `is_active=false`; `bancos_empresa` de cada banco apunta a 2 leaves nuevas; `metodo_cobro_deducciones` re-apunta a la leaf bancaria nueva |
| Manual — banco nuevo | Crear banco con `nombreBanco="Venezuela"`, `tipoCuenta="CORRIENTE"`, `nroCuenta` term. en 5546 | 3 cuentas creadas: activo `1.1.xx`, leaf "VENEZUELA CORRIENTE 5546" bajo `6.2.06.01`, misma leaf bajo `6.1.25.01`; ambas vinculadas en `bancos_empresa` |
| Manual — desambiguación (SC-28) | Mismo banco, 2 cuentas propias term. en 5546 (una Corriente, otra Ahorro) | Leaves resultantes "VENEZUELA CORRIENTE 5546" y "VENEZUELA AHORRO 5546", sin colisión |
| Manual — reasignar 1 de 2 (SC-15) | Editar banco, cambiar solo la cuenta bancaria | Solo esa cuenta cambia; pasarela y deducciones existentes intactas |

## Migration / Rollout (actualizado PR-2b)

| PR | Contenido | Dependencia |
|---|---|---|
| **PR-1 (Slice 1)** | Migración 0080 + `schema.ts`/`types.ts` — YA MERGEADO | Ninguna |
| **PR-2 (Slice 2, `16a0e3e`)** | `banco-form.tsx` v1 (2 cuentas, `6.2.05` plano) — **SUPERADO por PR-2b** | PR-1 |
| **PR-2b (este documento)** | Migración 0081 + `use-plan-cuentas.ts` (nuevos resolvers) + `use-bancos.ts` + `banco-form.tsx` (3 cuentas) | PR-1 mergeado. Debe mergearse ANTES de PR-3, ya que PR-3 lee `bancos_empresa.cuenta_gasto_pasarela_id` |
| **PR-3 (Slice 3)** | `payment-method-form.tsx` + `use-payment-methods.ts` (default-seeding en `createPaymentMethod`, lee `cuenta_gasto_pasarela_id` del banco) | PR-2b mergeado (necesita la columna y garantía de no-null) |
| **PR-4 (Slice 4)** | `use-gastos.ts` + `use-sesiones-caja.ts` loop | PR-1, PR-3 mergeados |
| **Limpieza** | `cleanup_gastos_cxp_qol.sql` (sin cambios) | Después de PR-1/PR-2b, antes de validar PR-4 end-to-end |

Rollback: 0081 es mayormente aditiva; el único paso destructivo es desactivar `6.2.05` (paso 7) — reversible con `UPDATE ... SET is_active=TRUE` manual si algo sale mal, ya que no hay DELETE. PR-2b frontend es `git revert`.

## PR-3 — Deducciones N-conceptos en `payment-method-form.tsx` (Slice 3, actualizado 2026-07-31)

> Diseñado originalmente ANTES de PR-2b (asumía cuenta especial por `tipo`, ej. ISLR en tarjeta de crédito). El usuario aclaró y UNIFICÓ la regla (obs Engram `#753`) y confirmó el propósito real del feature. En su revisión final, `#753` fue MÁS ALLÁ de la unificación de cuenta: eliminó también los conteos de slots por `tipo` (ej. "PUNTO → 2 slots") — el default es SIEMPRE 1 slot de comisión base, sin importar el `tipo` del método. Esta sección REEMPLAZA por completo el entendimiento de `tasks.md` 4.3 / `spec.md` SC-07/SC-08 (ya corregidos por `sdd-spec`, ver spec.md). **PR-2b ya mergeado** (`159cb88`) — la precondición que esta sección asume (`bancos_empresa.cuenta_gasto_pasarela_id` siempre no-null cuando hay banco) está satisfecha.

### Decisión: Regla unificada de cuenta default (opción A)

| Elección | Alternativas | Racional |
|---|---|---|
| TODO concepto de deducción (1º o N-ésimo, en creación o agregado después) nace con `cuenta_gasto_id` PRE-SELECCIONADA = `bancos_empresa.cuenta_gasto_pasarela_id` del banco del método, mostrada en el select y editable por el usuario | Cuenta especial por `tipo` (ej. ISLR siempre a una cuenta ISLR distinta, tasks.md 4.3 original) | El "ISLR 5%" del tasks.md 4.3 original era solo un EJEMPLO ilustrativo de "2º concepto con otra cuenta", NO una regla de negocio (obs #753). Unificar evita 2 caminos de código (default especial vs. genérico) y elimina el riesgo de concepto huérfano — un usuario avanzado sigue pudiendo re-apuntar manualmente cualquier fila a una cuenta de gasto separada |
| Cantidad de slots default = SIEMPRE 1 (comisión, `porcentaje=0`), sin importar `tipo` del método | Conteos variables por `tipo` (`PUNTO` → 2, transferencia/otros → 1, tarjeta de crédito → 1 ISLR) | Revisión final de obs #753: los conteos por `tipo` eran conveniencia de UX especulativa, no un requisito confirmado. El usuario prefiere UN solo default simple y agregar manualmente lo que necesite (ej. un 2º slot si separa débito/crédito en el mismo método, o ISLR si aplica) — menos lógica condicional, menos superficie de bugs |

**Propósito real (nota de trazabilidad para PR-4)**: esto NO es contabilidad de partida doble real — EMULA el cálculo del banco. El banco cobra Bs X al cliente pero deposita X menos sus comisiones; ClaraPOS replica ese descuento para comparar saldo-banco vs. saldo-tesorería. Por eso TODAS las deducciones activas de un método DEBEN fluir al pase de tesorería en el cierre. Esto no cambia el diseño de PR-4 ya vigente (`aplicarComisionSiCorresponde` iterando `metodo_cobro_deducciones WHERE is_active=1 ORDER BY orden`, Migration/Rollout arriba) — solo confirma que ninguna deducción activa puede quedar fuera del loop.

### `createPaymentMethod` — default-seeding (contrato PR-2b→PR-3 cumplido)

Confirmado por lectura de código: `createPaymentMethod` (`use-payment-methods.ts:110-176`) HOY solo inserta en `metodos_cobro`, dentro de un único `db.writeTransaction`. NO toca `metodo_cobro_deducciones`. PR-3 lo extiende:

```ts
// use-payment-methods.ts — nuevo param, misma writeTransaction existente
export async function createPaymentMethod(params: {
  // ...params existentes sin cambios
  deducciones?: {
    concepto: string
    tipo: 'COMISION' | 'ISLR' | 'OTRO'
    porcentaje: string        // Decimal string, igual patrón que comision_pct
    cuenta_gasto_id: string
  }[]
}) {
  await db.writeTransaction(async (tx) => {
    // ... INSERT INTO metodos_cobro (sin cambios)
    for (const [i, d] of (params.deducciones ?? []).entries()) {
      await tx.execute(
        `INSERT INTO metodo_cobro_deducciones
           (id, empresa_id, metodo_cobro_id, cuenta_gasto_id, concepto, tipo, porcentaje, orden, is_active, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [uuidv4(), params.empresa_id, id, d.cuenta_gasto_id, d.concepto, d.tipo,
         new Decimal(d.porcentaje || '0').toFixed(2), i, now, now, params.usuario_id]
      )
    }
  })
}
```

- **Un solo `writeTransaction`** (el que ya existe) — el método y sus filas de deducción se crean o fallan juntos. Ningún `metodo_cobro_deducciones` puede existir sin su `metodos_cobro` padre.
- `createPaymentMethod` **NO resuelve** `cuenta_gasto_pasarela_id` por su cuenta — el **caller** (`payment-method-form.tsx`, que ya carga `useBancosActivos()`) arma el array `deducciones` con la cuenta base del banco seleccionado y lo pasa. Mantiene la función pura y evita una 2ª fuente de verdad para "cuál es la cuenta default".
- Método sin `banco_empresa_id` (EFECTIVO, o cualquier tipo sin banco seleccionado): el form nunca arma `deducciones` — sin sección de deducciones bancarias (SC-09).

### Default único de comisión (SIN defaults por tipo — cuenta siempre = base pasarela)

`TIPOS_METODO` real en el código (`use-payment-methods.ts:34-42`) es `EFECTIVO | TRANSFERENCIA | PUNTO | PAGO_MOVIL | ZELLE | DIVISA_DIGITAL | OTRO` — el CHECK de la tabla `metodos_cobro` (`0005_caja_tesoreria.sql:41`) coincide exactamente. **No existe `tipo='TARJETA_CREDITO'`** en el schema. Débito y crédito son ambos `tipo='PUNTO'` (se diferencian por `nombre`, ej. "Tarjeta Débito Banesco" vs. "Tarjeta Crédito Banesco" — confirma el ejemplo de obs #753). Esto ya está corregido en `spec.md` SC-07/SC-08 por `sdd-spec` (ver header de este documento).

| `banco_empresa_id` asociado | Slots default | `porcentaje` sugerido | Cuenta (el slot) |
|---|---|---|---|
| Sí (cualquier `tipo` — `PUNTO`, `TRANSFERENCIA`, `PAGO_MOVIL`, `ZELLE`, `DIVISA_DIGITAL`, `OTRO`) | 1 (`tipo='COMISION'`) | `0` | pasarela base |
| No (`EFECTIVO` o sin banco elegido) | 0 (sin sección) | — | — |

Sin excepciones por `tipo`: NO hay conteo especial de 2 slots para `PUNTO` ni un slot `ISLR` para tarjeta de crédito (ambos existían en el diseño previo a la revisión final de obs #753 y quedan eliminados). Si el usuario necesita separar débito/crédito, retención ISLR, u otro concepto, los agrega manualmente desde el slot base — cada concepto nuevo también nace apuntando a la pasarela base (re-apuntable).

### Schema Zod (`payment-method-schema.ts`)

```ts
export const metodoCobroDeduccionSchema = z.object({
  id: z.string().uuid().optional(),      // undefined = fila nueva, no persistida aun
  concepto: z.string().min(1, 'Requerido'),
  tipo: z.enum(['COMISION', 'ISLR', 'OTRO']),
  porcentaje: z.string().refine(
    (v) => { const n = Number(v); return !isNaN(n) && n >= 0 && n <= 100 },
    'Debe estar entre 0 y 100'
  ),
  cuenta_gasto_id: z.string().uuid('Seleccione una cuenta'),
  is_active: z.boolean().default(true),
})

// paymentMethodSchema agrega:
deducciones: z.array(metodoCobroDeduccionSchema).default([]),
```

### Flujos UI (`payment-method-form.tsx`)

| Flujo | Comportamiento |
|---|---|
| **Crear**, banco seleccionado | Al elegir banco, precarga 1 slot (tabla arriba) con `cuenta_gasto_id = banco.cuenta_gasto_pasarela_id` (de `useBancosActivos()`), editable antes de guardar |
| **Agregar concepto** (crear o editar) | Botón "+ Agregar deducción" añade fila con `cuenta_gasto_id` default = pasarela base del banco actual, `tipo='COMISION'`, `porcentaje='0'`, reutilizando el mismo `NativeSelect` filtrado por `useCuentasDetallePorTipo('GASTO')` que ya usa `banco-form.tsx` |
| **Editar existente** | Nuevo hook `use-metodo-cobro-deducciones.ts`: `useDeduccionesDeMetodo(metodoCobroId)` — `SELECT * FROM metodo_cobro_deducciones WHERE metodo_cobro_id=? AND empresa_id=? ORDER BY orden`; `updateDeduccion(id, data)` vía `db.execute` (mismo patrón no-transaccional que `updatePaymentMethod`, fila suelta no ledger) |
| **Desactivar** | Toggle por fila → `updateDeduccion(id, { is_active: false })`. Nunca DELETE físico (SC-11) — sin botón de borrado en la UI |
| **Multi-tenant** | Todo `SELECT`/`INSERT`/`UPDATE` de `metodo_cobro_deducciones` filtra por `empresa_id` de `useCurrentUser()`, igual patrón que el resto del proyecto (SC-12) |

### File Changes (PR-3)

| Archivo | Acción | Descripción |
|---|---|---|
| `src/features/configuracion/schemas/payment-method-schema.ts` | Modify | Agrega `metodoCobroDeduccionSchema` + campo `deducciones` |
| `src/features/configuracion/hooks/use-payment-methods.ts` | Modify | `createPaymentMethod` acepta `deducciones[]`, inserta en la misma `writeTransaction` |
| `src/features/configuracion/hooks/use-metodo-cobro-deducciones.ts` | Create | `useDeduccionesDeMetodo`, `createDeduccion` (agregar concepto a método ya existente), `updateDeduccion` |
| `src/features/configuracion/components/payment-method-form.tsx` | Modify | UI de N filas: precarga 1 slot default (comisión, base pasarela), agregar/editar/desactivar, oculta sección si no hay banco |

## Open Questions

- [x] Códigos exactos → `6.1.25`/`6.1.25.01` y `6.2.06`/`6.2.06.01` — resuelto arriba.
- [x] Mecanismo de resolución de grupos-padre → `cuentas_config`, no código hardcoded — resuelto arriba.
- [x] Regla de cuenta default por `tipo` en deducciones de PR-3 → UNIFICADA a opción A (siempre pasarela base, editable), obs #753 — resuelto arriba.
- [x] `spec.md` SC-07/SC-08 referenciaban `tipo='TARJETA_CREDITO'`, valor inexistente en el CHECK de `metodos_cobro` — corregido por `sdd-spec` (2026-08-02): SC-07 ahora describe el default único de comisión para cualquier método bancario; SC-08 ahora cubre el invariante "nunca huérfano". `tasks.md` 4.3/4.9 y `proposal.md` (referencias a slots por tipo) quedan pendientes de una pasada de `sdd-tasks` para alinearse — no bloqueante para este documento.
- [ ] **`useGruposGastoConSubcuentas`** (usado en `gastos-dashboard.tsx`, `gasto-list.tsx`, `cuenta-gasto-modal.tsx`) asume 2 niveles planos (grupo es_cuenta_detalle=0 → subcuentas es_cuenta_detalle=1 directas). Con la nueva jerarquía de 4 niveles, las leaves reales (`6.1.25.01.NN`/`6.2.06.01.NN`) NO aparecerán como subcuentas de `6.1.25`/`6.2.06` (sus hijos directos son grupos, no leaves) — quedan invisibles en los selectores de gasto manual. **Necesita decisión del usuario**: ¿extender el hook a recursión N-niveles ahora (dentro de PR-2b, ampliaría el scope guard sobre esos 3 componentes) o diferir a un PR aparte? No bloqueante para las 3 cuentas auto-creadas por banco (que no pasan por este hook), pero SÍ afecta el registro manual de gastos contra esas cuentas. **Nota**: PR-2b ya mergeado (`159cb88`) — confirmar si esto quedó resuelto en 3b.2.4 (`useGruposGastoConSubcuentas` reescrito con mapa `Map<parent_id, hojas[]>`) o sigue abierto.
- [ ] Riesgo de cuentas huérfanas en `crearCuentasDelBanco` si `createBanco` falla después de crear las leaves — preexistente de PR-2, sin mitigación nueva, solo anotado.
