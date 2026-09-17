# NC Lifecycle Map — Part B: Efectos + Integraciones

> Continúa `exploration.md` (Part A, arquitectura interna de `crearNotaCredito`).
> Esta parte mapea lo que YA EXISTE en producción alrededor de la NC: stock,
> CxC/saldo, tesorería (bancos + caja fuerte), conversión bimonetaria y
> reporting. Objetivo explícito: no declarar nada "NEW" sin grep exhaustivo
> que lo pruebe — en particular la regla de sobregiro bancario, que el
> usuario insiste que ya existe en algún lado.

## 1. Efecto STOCK / KARDEX de una NC

`crearNotaCredito` (`src/features/ventas/hooks/use-notas-credito.ts`) reintegra
stock dentro de la MISMA `db.writeTransaction`, antes de tocar CxC:

- **Resolución de depósito de reingreso** (L459-503): por defecto vuelve al
  `venta.deposito_id` (depósito de ORIGEN de la venta original), NUNCA al
  principal por defecto. Si ese depósito fue desactivado desde la venta,
  cae automáticamente al depósito `es_principal=1` ACTIVO de la empresa
  (`resolveDepositoReingresoNcr`, `src/features/inventario/lib/deposito-inactivo.ts`).
  Existe también un override explícito `depositoReingresoId` (L460-470,
  validado contra `is_active=1` y `empresa_id` antes de usarse).
- **Producto tipo 'P'** (L678-729): INSERT en `movimientos_inventario` con
  `tipo='E'`, `origen='NCR'`, `doc_origen_id=ncrId`, `doc_origen_ref='NCR-{nroNcr}'`
  (L684-703), seguido de `upsertStockDeposito(tx, {...})`
  (`src/features/inventario/lib/stock-deposito.ts` L165) que hace
  UPSERT en `inventario_stock.cantidad_actual` (por depósito, `WHERE NOT EXISTS`
  para evitar duplicados de PowerSync, L208-228) y luego
  `UPDATE productos SET stock = ...` (total cross-depósito, L262/L400). Si
  la línea tenía `lote_id`, también repone `lotes.cantidad_actual` y
  reactiva `status='ACTIVO'` (L716-729).
- **Producto tipo 'S' (servicio)**: NO tiene stock propio (regla de negocio
  #6 de CLAUDE.md); reintegra sus INGREDIENTES vía `recetas`, escalando la
  cantidad de receta × `cantidadDevolver` (PARCIAL-aware, L730-782), con el
  mismo patrón `movimientos_inventario` + `upsertStockDeposito` por
  ingrediente.
- **Quote clave** (`use-notas-credito.ts` L684-703):
  ```ts
  await tx.execute(
    `INSERT INTO movimientos_inventario (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, lote_id, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, empresa_id, created_at)
     VALUES (?, ?, ?, 'E', 'NCR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [movId, ventaDetRow.producto_id, depositoId, cantidadDevolver.toFixed(3),
     stockActual.toFixed(3), stockNuevo.toFixed(3), ventaDetRow.lote_id ?? null,
     ncrId, `NCR-${nroNcr}`, `${nroNcr} - Reintegro ${producto.nombre}`,
     usuario_id, now, empresa_id, now]
  )
  ```

## 2. Efecto CxC / saldo de una NC

- **Cancelación de deuda** (L786-834, "Step A"): calcula
  `montoAplicadoAPendiente = min(venta.saldo_pend_usd, totalUsdNc)`, lee
  `clientes.saldo_actual`, computa `saldoNuevo = max(0, saldoActual - montoAplicadoAPendiente)`
  EN APLICACIÓN (Decimal.js, no SQL), inserta `movimientos_cuenta` tipo `'NCR'`
  con `saldo_anterior`/`saldo_nuevo` ya resueltos (L810-827), y — dato
  IMPORTANTE — hace un `UPDATE clientes SET saldo_actual = ...` EXPLÍCITO
  inmediatamente después (L829-833):
  ```ts
  await tx.execute('UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?', [
    toStorageString(saldoNuevo), now, venta.cliente_id,
  ])
  ```
- **Trigger Postgres `actualizar_saldo_cliente`** (`migrations/0006_ventas.sql`
  L119-144, con fixes de idempotencia en 0060/0061/0088): `BEFORE INSERT ON
  movimientos_cuenta`. Lógica: `FAC/NDB` suman deuda, `PAG/NCR` restan deuda
  (`NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto` para NCR), y hace su
  propio `UPDATE clientes SET saldo_actual = NEW.saldo_nuevo`.
  **Gotcha confirmado**: el cliente PowerSync/SQLite local NO ejecuta triggers
  Postgres — por eso `crearNotaCredito` REPLICA la lógica del trigger en
  TypeScript (Decimal.js) para que el saldo quede correcto offline-first de
  inmediato; el trigger Postgres es la segunda capa que corre cuando el
  cambio sincroniza al servidor (defensa en profundidad, mismo patrón que el
  trigger anti-UPDATE de `movimientos_inventario`).
- **Saldo a favor (saldo_actual negativo)**: se lee crudo en
  `src/features/cxc/hooks/use-cxc.ts` (`c.saldo_actual` en el SELECT de
  listado L84) y se muestra/consume en pantallas de CxC (`cxc-list.tsx`,
  `cxc-cliente-detalle.tsx`) y en el flujo de aplicar SAF a facturas
  (`aplicarSafAFacturasEnTx`, comentarios L1669/L1999-2019 del mismo
  archivo: "Aplica el saldo a favor de un cliente (saldo_actual negativo) a
  sus facturas pendientes").

## 3. TESORERÍA — mapa exhaustivo

### 3.1 Saldo disponible — caja fuerte (HOY)

**NO es una agregación** — es una **columna directa** `caja_fuerte.saldo_actual`
(`migrations/0035_conciliacion_tesoreria.sql` L10; `schema.ts` L938-952),
mantenida por CADA mutación (INSERT+UPDATE en la misma tx, nunca recalculada
por SUM). Expuesta por `useCajasFuerteActivas()`
(`src/features/tesoreria/hooks/use-caja-fuerte.ts`) y por
`useCuentasTesoreria()` (`src/features/tesoreria/hooks/use-cuentas-tesoreria.ts`
L86, L138). Todo escritor sigue el mismo patrón read-then-write dentro de la
tx: `SELECT saldo_actual ... → UPDATE caja_fuerte SET saldo_actual = ?`
(ejemplos: `use-traspasos.ts` L190-214, L437-459, L703-733,
`use-conciliacion-tesoreria.ts` L195-233/L318-358).

### 3.2 Saldo disponible — banco (HOY)

Mismo patrón: **columna directa** `bancos_empresa.saldo_actual`
(`migrations/0005_caja_tesoreria.sql` L19; `schema.ts` L208-229), NO una
suma de `movimientos_bancarios`. Cada egreso/ingreso hace
`SELECT saldo_actual → calcula nuevo saldo en Decimal.js → INSERT
movimientos_bancarios (saldo_anterior, saldo_nuevo) → UPDATE bancos_empresa
SET saldo_actual`. Ejemplos confirmados en 4 flujos distintos:
`use-traspasos.ts` L738-769 (traspaso ingreso), `use-cxc.ts` L605-646 (cobro
CxC vía banco, INGRESO), `use-cxp.ts` L280-338 (pago a proveedor vía banco,
EGRESO), `use-gastos.ts` L619-650 (deducción de cierre de caja, EGRESO).

### 3.3 Guard "no retirar más del disponible" — caja fuerte

Confirmado real y REUTILIZABLE tal cual dijo Part A, pero AÚN embebido
inline, no extraído a función pura. Ejemplo canónico
(`use-traspasos.ts` L859-871, `consolidarMetodoATesoreriaEnTx`):
```ts
const saldoCajaAnt = parseFloat(
  (cajaRes.rows.item(0) as { saldo_actual: string }).saldo_actual
)
if (montoNum > saldoCajaAnt + 0.001) {
  throw new Error(`Saldo insuficiente en Tesoreria. Disponible: ${saldoCajaAnt.toFixed(2)}, Solicitado: ${params.monto}`)
}
```
Duplicado en `crearTraspasoTesoreriaASesion` (mismo archivo, mismo rango) y
en la UI `enviar-efectivo-a-caja-modal.tsx` L88 (chequeo de formulario,
duplicado del de negocio). **Caja fuerte SIEMPRE bloquea el sobregiro** —
no hay ningún camino que lo permita, en ningún flujo del repo.

### 3.4 OVERDRAFT / SOBREGIRO — veredicto definitivo

**NO EXISTE ninguna regla de sobregiro bancario, ni por usuario ni por
cuenta, en ningún punto del código.** Búsqueda exhaustiva realizada en ESTA
sesión (re-verificación escéptica, no solo repetir Part A):

- `grep -r "sobregir|overdraft|permite_negativo|saldo_negativo|permitir_sobregiro|permite_sobregiro"` en TODO `src/` → **0 resultados de código real** (los únicos matches son el propio `exploration.md` de Part A citándose a sí mismo).
- `bancos_empresa` — columnas completas revisadas en las 5 migraciones que la tocan (`0005_caja_tesoreria.sql` CREATE original, `0058_decimal_precision.sql` cambio de tipo, `0069_bancos_metodos_pago_v2.sql` agrega `saldo_inicial`, `0080`/`0081_gastos_comisiones_*` agregan `cuenta_gasto_comision_id`/`cuenta_gasto_pasarela_id`). Ninguna migración agrega un booleano de sobregiro.
- `usuarios`, `roles`, `rol_permisos`, `tenant_permisos` — sin columna relacionada (`0001_initial_schema.sql`, `0002_auth_rbac.sql`).
- `permisos` — los 8 archivos de migración que hacen `INSERT INTO permisos` (`0002`, `0014`, `0015`, `0024`, `0030`, `0047`, `0048`, `0091`) fueron leídos por slug: ninguno define `tesoreria.sobregiro*` ni equivalente.
- `system_settings` (`0058_decimal_precision.sql` L442-458) — solo guarda `precision_calc`/`precision_view`, nada de tesorería.
- **Flujos de egreso bancario de COMPRAS/CxP revisados explícitamente** (pedido específico del usuario): `use-cxp.ts` L280-338 (`pagarFacturaCxP`, pago a proveedor vía banco) y `use-gastos.ts` L619-650 (deducción de cierre de caja hacia banco) — **ninguno de los dos valida `saldo_actual` antes de restar**. Ambos hacen `saldoBancoNuevo = saldoBancoAnt.minus(montoNativo)` (o `- _montoNativo`) sin ningún `if`/guard previo, y persisten el resultado tal cual, incluso si queda negativo.

**Conclusión**: lo que el usuario recuerda como "los bancos permiten
sobregiro" es 100% real como COMPORTAMIENTO OBSERVADO (los bancos SÍ pueden
quedar en negativo hoy, en al menos 2 módulos distintos: CxP y Gastos/cierre
de caja), pero es la AUSENCIA TOTAL de una validación, no una regla de
negocio deliberada, configurable, ni diferenciada por usuario/cuenta. No hay
ningún `if (permiteSobregiro)`, ningún flag, ningún permiso. La caja fuerte,
en cambio, SIEMPRE bloquea (sección 3.3) — la asimetría banco-vs-caja-fuerte
existe, pero es un accidente de cobertura de guards, no una política
codificada en ningún lado.

### 3.5 Patrón `validado=0` / conciliación

Ambas tablas de ledger tesorería nacen con `validado=0` en cada INSERT visto
en esta sesión (CxP L322, Gastos L635, CxC L632, traspasos) — ninguna
inserta `validado=1` directamente. La conciliación
(`src/features/tesoreria/hooks/use-conciliacion-tesoreria.ts` L39/L63) es la
ÚNICA que hace `UPDATE ... SET validado = 1, validado_por = ?, validado_at = ?`,
consumida por las UIs `src/features/tesoreria/components/conciliacion-tesoreria.tsx`,
`src/features/bancos/components/conciliacion-bancaria.tsx` y la ruta
`src/routes/_app/bancos/conciliacion.tsx`. `reversado`/`reverso_de` existen en
schema pero no se usaron en ningún flujo de NC/CxP/Gastos revisado — quedan
disponibles para reversos futuros.

## 4. Machinery de conversión bimonetaria (template reusable)

`src/lib/currency.ts` — todo devuelve `Decimal` (nunca `number` crudo) salvo
las funciones de DISPLAY:
- `usdToBs(usd, tasa): Decimal` — `usd × tasa` (L60-62)
- `bsToUsd(bs, tasa): Decimal` — `bs ÷ tasa`, retorna `Decimal(0)` si `tasa`
  es cero (guard defensivo, L64-68)
- `formatUsd`/`formatBs`/`formatTasa`: `string` con máscara de display
  (`CFG.view` = 2 decimales, locale venezolano para Bs)
- `toStorageString(val): string` — `toFixed(CFG.calc)` = 8 decimales fijos,
  el ÚNICO formato que debe llegar a un `INSERT`/`UPDATE` de columna
  financiera (regla de negocio #10 de CLAUDE.md)

**Template de conversión cuenta-consciente** (idéntico en `use-cxc.ts`
L605-646, `use-cxp.ts` L293-338 — la misma rama `_esBancoBS` aparece en
AMBOS módulos, no solo en CxC como sugería Part A):
```ts
const _esBancoBS = _bancoMonedaCodigo === 'VES'
const _montoNativo = _esBancoBS
  ? (moneda === 'BS' ? monto : usdToBs(montoUsd, tasaD).toNumber())
  : (moneda === 'BS' ? bsToUsd(monto, tasaD).toNumber() : montoUsd.toNumber())
```
`tasaD` en ambos casos es la tasa del **pago/movimiento actual**
(`params.tasa`), NUNCA una tasa histórica de otro documento — para el
refund de NC, la fuente de tasa a usar debe ser `notas_credito.tasa_historica`
en vez de `tasaD`, aplicando el MISMO patrón de rama `_esBancoBS`.

## 5. Cuadre de caja / reporting — cómo surgen las NC hoy

- `src/features/reportes/hooks/use-cuadre.ts` L1136-1148 (`useTotalesFiscales`):
  ```sql
  SELECT COALESCE(SUM(CAST(total_usd AS REAL)), 0) as total_ncr,
         COALESCE(SUM(CAST(total_bs AS REAL)), 0) as total_ncr_bs
  FROM notas_credito
  WHERE empresa_id = ? AND DATE(fecha, 'localtime') = ?
  ```
  Agrega por **`fecha` (día calendario) + `empresa_id`**, NO por
  `sesion_caja_id`. Expuesto como `totalNcrUsd`/`totalNcrBs` en
  `TotalesFiscales`.
- `src/features/reportes/hooks/use-ventas-reportes.ts` L421-445
  (`useDevolucionesRango`): mismo patrón, `SUM(total_usd)`/`SUM(total_bs)`
  agregado por **rango de fechas + `empresa_id`** (`SUBSTR(fecha,1,10) BETWEEN`),
  tampoco por sesión.
- Implicación para el refund por tesorería: el egreso hacia
  `movimientos_bancarios`/`mov_caja_fuerte` NO pasa por ninguna de estas dos
  queries (ninguna las toca) — es un flujo completamente separado del cuadre
  de sesión de caja, consistente con la Regla de Oro ($0.00 en el cajón
  activo). El cuadre de caja de sesión seguiría mostrando el `total_ncr`
  agregado (reversa contable de la venta), mientras el movimiento de
  tesorería real vive y se concilia en su propio módulo.

## 6. Tabla de schema — ledgers de tesorería

| Tabla | Columnas clave | Notas |
|---|---|---|
| `bancos_empresa` (`schema.ts` L208-229) | `empresa_id`, `moneda_id`, `saldo_actual`, `saldo_inicial`, `cuenta_contable_id`, `cuenta_gasto_comision_id`, `cuenta_gasto_pasarela_id`, `is_active` | Columna directa de saldo, sin sobregiro. Moneda por cuenta (VES o USD). |
| `caja_fuerte` (`schema.ts` L938-952) | `empresa_id`, `moneda_id`, `saldo_actual`, `is_active` | Igual patrón, sin moneda mixta por línea. |
| `movimientos_bancarios` (`schema.ts` L907-932) | `banco_empresa_id`, `tipo` (INGRESO/EGRESO), `origen` (DEPOSITO_CAJA\|TRANSFERENCIA_CLIENTE\|PAGO_PROVEEDOR\|GASTO\|MANUAL\|TRASPASO\|REVERSO\|CIERRE_CONSOLIDACION), `monto`, `saldo_anterior`, `saldo_nuevo`, `doc_origen_id`, `doc_origen_tipo`, `referencia`, `validado`, `validado_por`, `validado_at`, `reversado`, `reverso_de` | **Sin columna `moneda_id`** — implícita de `bancos_empresa.moneda_id`. `doc_origen_tipo` ya es texto libre (`'PAGO_CXP'`, `'GASTO'`, `'PAGO_CXC'` vistos en uso) — un valor nuevo `'NOTA_CREDITO'` encaja sin migración. |
| `mov_caja_fuerte` (`schema.ts` L954-977) | Mismas columnas que `movimientos_bancarios` + `caja_fuerte_id` | Mismo razonamiento — `doc_origen_tipo='NOTA_CREDITO'` no requiere schema nuevo. |

**Veredicto schema**: **NO se necesita ninguna columna ni tabla nueva** para
que un egreso de banco o caja fuerte quede enlazado a una NC — el patrón
`doc_origen_id` (UUID de la NC) + `doc_origen_tipo` (string libre, valor
nuevo `'NOTA_CREDITO'`) ya existe y ya se usa exactamente así para
`PAGO_CXP`/`GASTO`/`PAGO_CXC`/`TRASPASO`.

## Resumen ejecutivo (para el usuario)

**Estado**: exploración read-only completada, sin tocar código de app.

**Artefactos**: `openspec/changes/nc-refund-tesoreria/nc-full-map-B-efectos-integraciones.md`
(este archivo) + engram `sdd/nc-full-map/efectos-integraciones`.

1. **¿Existe ya una regla de sobregiro bancario?** — **NO.** Re-verifiqué con
   grep exhaustivo (términos, columnas de `usuarios`/`roles`/`permisos`/
   `bancos_empresa`/`system_settings`) y revisando explícitamente los flujos
   de pago a proveedor (CxP) y cierre de caja (Gastos) que vos mencionaste.
   Lo que SÍ existe es que los bancos hoy pueden quedar en negativo por pura
   AUSENCIA de validación en 2 módulos (`use-cxp.ts`, `use-gastos.ts`) — no
   hay ningún flag, permiso, ni columna que lo gobierne. La caja fuerte, en
   cambio, siempre bloquea el sobregiro (guard real, aunque duplicado 3
   veces sin extraer). Si tenías en mente otro lugar del sistema, decime
   cuál y lo reviso puntualmente — pero por ahora la evidencia dice que hay
   que DISEÑAR esa regla desde cero, no reutilizarla.
2. **¿Cómo se calcula el saldo disponible de caja fuerte hoy?** — Es una
   columna directa (`caja_fuerte.saldo_actual`), mantenida en cada
   INSERT+UPDATE dentro de la misma transacción — nunca un `SUM()` sobre
   `mov_caja_fuerte`. Mismo patrón exacto para bancos.
3. **¿Hace falta schema nuevo para enlazar un egreso de tesorería a una NC?**
   — No. `movimientos_bancarios`/`mov_caja_fuerte` ya tienen
   `doc_origen_id`/`doc_origen_tipo`, usados hoy para `PAGO_CXP`/`GASTO`/
   `PAGO_CXC`; un valor nuevo `'NOTA_CREDITO'` es suficiente.

**Next recommended**: con Part A + Part B completos, el siguiente paso es
`sdd-design` para resolver los forks abiertos en Part A (forma de
`egresoParams`, multi-fuente, DÓNDE vive la regla de sobregiro nueva) — el
sobregiro ahora se diseña desde cero, con evidencia sólida de que no hay
nada que reutilizar salvo el patrón de permisos por rol (`ventas.nota_credito`)
como precedente estructural.

**Riesgos**: los 2 módulos donde el banco puede sobregirarse hoy sin guard
(CxP, Gastos/cierre) NO forman parte del scope de este change — si la NUEVA
regla de sobregiro se implementa solo dentro de `crearNotaCredito`
(REFUND_TESORERIA), quedaría inconsistente con esos otros 2 flujos que
seguirían sin validar nada. Vale la pena decidir explícitamente si el guard
nuevo se centraliza (una función pura reusada por los 3 flujos) o si el
refund de NC es la ÚNICA vía que lo respeta por ahora.

**Skill resolution**: paths-injected — `sdd-explore/SKILL.md` +
`_shared/SKILL.md` (que a su vez referencia `sdd-phase-common.md`,
`openspec-convention.md`, `engram-convention.md`, todos leídos).
