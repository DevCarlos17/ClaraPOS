# NC Lifecycle Map — Part A: Emisión + Liquidación

> Alcance: mapear EXHAUSTIVAMENTE lo que YA EXISTE en producción para la emisión y liquidación de Notas de Crédito. No se declara nada "faltante" salvo verificación explícita (grep/lectura completa). Basado en lectura completa de `use-notas-credito.ts` (1051 líneas), ambos modales, schema, migración 0091, permisos y suites de test.

## 1. Entry-point matrix

| Entry point | Archivo | entryPoint param | Modalidades ofrecidas en UI | TOTAL/PARCIAL | Selector de depósito | PIN |
|---|---|---|---|---|---|---|
| **POS-express** | `src/features/ventas/components/nota-credito-pos-modal.tsx` | `'POS'` | `EFECTIVO_REAL`, `SALDO_FAVOR`, `AJUSTE_CXC`, `COMPENSACION_VENTA` (const `MODALIDADES_POS` L59-64). `REFUND_TESORERIA` deliberadamente excluida (comentario L55-58: reservada al módulo Tradicional) | Ambos, elegidos explícitamente, SIN preselección (L156-161, Item 5 QA) | Riel automático por defecto; override requiere **PIN B** independiente (L152-155, L622-648) | **PIN A** (`SALES_NOTA_CREDITO`) si el usuario no tiene el permiso (L379, L395); **PIN B** separado para cambiar depósito (L629, L816-823). Dos PINs independientes, pueden coexistir (L639 test) |
| **Admin/Tradicional** | `src/features/ventas/components/crear-ncr-modal.tsx` | `'TRADICIONAL'` | Selector "Origen del reverso" (`OrigenReverso`, L47): `'CREDITO_A_FAVOR'` (única opción habilitada) → `modalidad: 'SALDO_FAVOR'`. `'DEVOLVER_DINERO'` (REFUND_TESORERIA) existe como botón **`disabled`** con tooltip "Próximamente" (L264-271) — nunca puede seleccionarse | Ambos, TOTAL preseleccionado si no hay reverso previo (L77) | Selector libre, SIN PIN (L286-305) — comentario L60-61: "la ruta ya está gateada por `PERMISSIONS.SALES_VOID` a nivel de acceso, pedir PIN encima sería fricción redundante" | **CERO PIN** — test explícito L114 "nunca monta SupervisorPinDialog" |
| Otros callers de `crearNotaCredito` | — | — | — | — | — | Ninguno encontrado (grep exhaustivo, ver §1.1) |

### 1.1 Grep exhaustivo de callers de `crearNotaCredito`
Único resultado fuera de definición/comentarios/tests: `nota-credito-pos-modal.tsx:325` y `crear-ncr-modal.tsx:154`. **No existen más entry points de escritura.** (Comentarios en `kardex-list.tsx:95` y `deposito-inactivo.ts:84` son referencias de documentación, no llamadas.)

### 1.2 Nota sobre `origenReverso === 'AJUSTE_CXC'`
`crear-ncr-modal.tsx` L168 mapea `DEVOLVER_DINERO` (inalcanzable en UI) a `modalidad: 'AJUSTE_CXC'`, NO a `REFUND_TESORERIA`. Es dead code defensivo (el botón está `disabled`, ese branch del ternario nunca se ejecuta en producción) — el comentario L163-167 lo confirma: "el selector nunca permite alcanzarlo, pero se mapea igual por completitud del tipo".

---

## 2. `crearNotaCredito` — mapa paso a paso (use-notas-credito.ts L346-1051)

Firma: `crearNotaCredito(params: CrearNotaCreditoParams): Promise<CrearNotaCreditoResult>` (L346-348, interfaz completa L141-197).

### Paso 0 — Antes de abrir la transacción (L363-372)
- **0b.** `assertGateAntiFraudeNoDesembolso(modalidad, egresoParams)` (L365) — ver §4.
- Si `modalidad === 'REFUND_TESORERIA'` → `throw new Error('REFUND_TESORERIA aun no esta implementado (ver Slice 6)')` (L370-372). Este es el ÚNICO punto donde REFUND_TESORERIA está bloqueado; el resto del código (schema, tipo, CHECK constraint) ya lo contempla.

### Dentro de `db.writeTransaction` (L377-1048)

| Paso | Líneas | Qué hace |
|---|---|---|
| 1 | 385-503 | Lee `ventas` por `venta_id`; valida `status !== 'ANULADA'`; resuelve `depositoOrigenId = venta.deposito_id`; calcula `sesionCajaIdParaNc` (solo si `entryPoint==='POS'`, L408); calcula `tipoNc` (default `'TOTAL'`, L416); calcula `aplicaReglaDeOro` (condición completa: POS + EFECTIVO_REAL + sesión activa coincide con `venta.sesion_caja_id`, L425-429); calcula `noDesembolso` via `esModalidadNoDesembolso` (L435); **resuelve depósito de reingreso** — override explícito validado (`depositoReingresoId`, L460-470) o riel automático (`resolveDepositoReingresoNcr`, origen si activo, si no principal de la empresa, L472-498) |
| 2 | 505-511 | Genera `nro_ncr` = `NCR-` + `COUNT(*) WHERE empresa_id=?` (consecutivo **por empresa**, cumple regla #12 de CLAUDE.md) |
| 3 | 513-592 | Lee TODAS las líneas de `ventas_det`; deriva `lineasAProcesar` (TOTAL = todas con cantidad completa; PARCIAL = solo las líneas del parámetro `lineas`, validando pertenencia a la factura, L538-547); por cada línea: guard de doble-crédito (`validarTopeDobleCredito`, consulta `SUM` de lo ya acreditado, L563-579) + `calcularDesgloseLineaNC(..., venta.tasa)` (desglose fiscal exento/base/IVA a la **tasa histórica de la venta**, L581-590) |
| 4 | 594-636 | Agrega totales de header: TOTAL preserva `venta.total_usd`/`total_bs` **verbatim** (incluye cargos especiales/descuento comercial que no viven en `ventas_det`, comentario L594-599); PARCIAL usa la suma de líneas seleccionadas (`totalUsdNc`, L604). `INSERT INTO notas_credito` con `tasa_historica = venta.tasa` (L620, ver §4 tasa histórica) |
| 5 | 638-784 | Por cada línea: `INSERT notas_credito_det` (con `venta_det_id` para trazabilidad de doble-crédito); si producto tipo `'P'`: `INSERT movimientos_inventario` (E/NCR) + `upsertStockDeposito` + restaurar lote si aplica; si tipo `'S'` (servicio): itera `recetas`, reintegra CADA ingrediente escalado a `cantidadDevolver` |
| 6 (Step A) | 786-834 | Aplica el monto de la NC contra la deuda YA pendiente de la factura: `montoAplicadoAPendiente = MIN(saldoPendVenta, totalUsdNc)`. Si > 0.01: reduce `clientes.saldo_actual` (tope en 0) e inserta `movimientos_cuenta` tipo `'NCR'` |
| 6b | 836-847 | Reversa diferencial cambiario si existía (`reversarDiferencialEnTx`, try/catch no bloqueante) |
| 6c (Regla de Oro) | 849-904 | **Solo si `tipoNc==='TOTAL'`**: lee pagos no reversados; si `aplicaReglaDeOro` inserta `movimientos_metodo_cobro` EGRESO/NCR **por cada método de pago** (per-method, L578 test); SIEMPRE marca `pagos.is_reversed=1` para TOTAL (independiente de si aplica la Regla de Oro) |
| 7 (Step B) | 906-1012 | `remanenteALiquidar = totalUsdNc - montoAplicadoAPendiente`. Si > 0.01, switch por `modalidad` — ver §3 tabla completa |
| 8 | 1014-1029 | TOTAL: `UPDATE ventas SET status='ANULADA', saldo_pend_usd='0.00'`. PARCIAL: solo actualiza `saldo_pend_usd` (nunca cambia status) |
| 9 | 1031-1047 | Genera asientos contables NCR (`generarAsientosNCR`, try/catch no bloqueante — fallo contable NUNCA bloquea la NCR) |

**TOTAL vs PARCIAL — dónde vive `totalUsdNc`:** L604-607. TOTAL = `venta.total_usd`/`venta.total_bs` sin recalcular (preserva cargos especiales/préstamo que ya están sumados ahí, fuera de `ventas_det`). PARCIAL = suma de los desgloses de las líneas seleccionadas (`totalLineasUsd`, L603) — nunca incluye cargos especiales porque esos no tienen línea propia en `ventas_det`.

---

## 3. Switch de modalidad de liquidación (Step B, L916-1012)

| Modalidad | Implementada | Tablas escritas | Detalle |
|---|---|---|---|
| `EFECTIVO_REAL` | ✅ Sí (fuera del switch de Step B) | `movimientos_metodo_cobro` (EGRESO/NCR), `pagos.is_reversed` | No es una rama del switch de remanente — se resuelve en el paso 6c (Regla de Oro). Solo dispara si `entryPoint==='POS'` + sesión activa coincide con `venta.sesion_caja_id` |
| `SALDO_FAVOR` | ✅ Sí | `movimientos_cuenta` (tipo `'SAFC'`), `clientes.saldo_actual` | L916-971. `doc_origen_id=ncrId`, `doc_origen_tipo='NOTA_CREDITO'` — trazable hasta la NC de origen. Reusa el PATRÓN de `registrarSafExcedente` (use-cxc.ts:2004) pero **inline** dentro de la misma tx (nunca invoca esa función standalone — anidar `db.writeTransaction` rompería la atomicidad, comentario L926-930) |
| `COMPENSACION_VENTA` | ✅ Sí (rama COMPARTIDA con SALDO_FAVOR) | Idéntico a `SALDO_FAVOR` | L917 condición `modalidad === 'SALDO_FAVOR' || modalidad === 'COMPENSACION_VENTA'` — mismo código exacto. La diferencia vive en el LLAMADOR (comentario L918-923): un `crearVenta()` separado consumiría el SAFC vía `safEntry` — `crearNotaCredito` nunca invoca `crearVenta()` internamente (tradeoff aceptado) |
| `AJUSTE_CXC` | ✅ Sí | `movimientos_cuenta` (tipo `'NCR'`, referencia `${nroNcr}-AJUSTE`), `clientes.saldo_actual` | L972-1011. Reusa el mismo patrón de reducción que Step A — nunca crea crédito, solo cancela deuda EXISTENTE (tope en 0, `Decimal.max(0, ...)` L986) |
| `REFUND_TESORERIA` | ❌ **NO implementada** | — | Único `throw` explícito ANTES de abrir la transacción (L370-372: `'REFUND_TESORERIA aun no esta implementado (ver Slice 6)'`). Validada por el tipo TypeScript (`LiquidacionModalidad` union L89-94) y por el CHECK constraint SQL (migración 0091 L61), pero CERO lógica de escritura existe. Este es el objeto real del change `nc-refund-tesoreria` (ver exploración previa #3647) |

**Condición "remanente cero" (L916):** si `remanenteALiquidar <= 0.01` (factura nunca cobrada, `saldoPend == total_usd`), NINGUNA modalidad no-efectivo escribe Step B — cubierto explícitamente por test (`use-notas-credito.test.ts:802`).

---

## 4. Gate anti-fraude (`assertGateAntiFraudeNoDesembolso`, L122-131)

```ts
export function assertGateAntiFraudeNoDesembolso(
  modalidad: LiquidacionModalidad,
  egresoParams: EgresoCajaParams | undefined
): void {
  if (egresoParams && esModalidadNoDesembolso(modalidad)) {
    throw new Error(
      `Comprobante de no-desembolso violado: la modalidad '${modalidad}' no admite una salida de efectivo/tarjeta. El bloqueo se aplica a nivel de funcion, no de UI.`
    )
  }
}
```

- `MODALIDADES_NO_DESEMBOLSO` (L97-101) = `['SALDO_FAVOR', 'COMPENSACION_VENTA', 'AJUSTE_CXC']`.
- **Modalidades que SÍ admiten `egresoParams`** (i.e. NO bloqueadas por el gate): `EFECTIVO_REAL` y `REFUND_TESORERIA` — confirmado por tests explícitos (`use-notas-credito.test.ts:665` "permite egresoParams cuando la modalidad es EFECTIVO_REAL", `:671` "...REFUND_TESORERIA").
- Se evalúa **ANTES de abrir la transacción** (L363-365, comentario L117-121: "ni siquiera toca la DB") — protege contra una llamada directa que bypasee la UI (test L682 "el gate rechaza ANTES de abrir la transaccion").
- `EgresoCajaParams` (L108-111) es solo `{ metodoCobroId: string; monto: number }` — **nunca dispara el egreso real** de la Regla de Oro (ese se calcula internamente vía `aplicaReglaDeOro`, comentario L107). Es un parámetro de defensa en profundidad para que el gate tenga algo explícito que rechazar en tests directos; el flujo normal de UI nunca lo envía.
- Persistido en DB: `notas_credito.no_desembolso` (`esModalidadNoDesembolso(modalidad) ? 1 : 0`, L435, L634) — `TRUE` para las 3 modalidades sin efectivo, `FALSE` para `EFECTIVO_REAL`/`REFUND_TESORERIA`.

---

## 5. SALDO A FAVOR (SAFC) — flujo operacional completo

### 5.1 Cómo se representa
- **Tabla:** `movimientos_cuenta`, columna `tipo`. Dos valores relevantes: `'SAFC'` (creación de crédito) y `'SAF'` (consumo de crédito).
- **NUNCA** un campo booleano ni saldo negativo aislado — se deriva SIEMPRE por agregación: `credito_disponible_usd = MAX(0, SUM(SAFC) - SUM(SAF))` (use-cxc.ts L86-90, repetido L1705 y comentario L1998-2002).
- `clientes.saldo_actual` se mueve en la MISMA transacción como efecto colateral (nunca se lee como fuente de verdad para el saldo a favor — el comentario L1687 explícito: "la fuente confiable SUM(SAFC)-SUM(SAF) — saldo_actual mezcla deuda y [crédito]").

### 5.2 Dónde se crea un SAFC (dos generadores)
1. **`registrarSafExcedente`** (`use-cxc.ts` L2004-2046) — cuando un pago de factura excede lo debido (excedente de pago CxC). `INSERT movimientos_cuenta (tipo='SAFC', referencia='SAF-CXC-{nro_factura}', ...)`.
2. **Inline en `crearNotaCredito`** (`use-notas-credito.ts` L916-971) — cuando una NC (`SALDO_FAVOR`/`COMPENSACION_VENTA`) deja remanente sin aplicar a deuda. `referencia='SAF-NCR-{nroNcr}'`, `doc_origen_id=ncrId`, `doc_origen_tipo='NOTA_CREDITO'`. Deliberadamente NO reusa la función #1 (evita anidar transacciones).

### 5.3 Dónde surge al usuario (consumidores de `useSaldoAFavor`)
Grep exhaustivo confirma 6 consumidores en producción:
- `src/features/clientes/components/cliente-form.tsx:28`
- `src/features/cxc/components/abono-global-modal.tsx:44`
- `src/features/cxc/components/pago-factura-modal.tsx:61`
- `src/features/ventas/components/cliente-selector.tsx:31`
- `src/features/ventas/components/cobro-modal.tsx:101`
- `src/features/ventas/lib/clamp-saf-monto.ts:11` (util pura, clamping de redondeo)

Es decir: el SAFC generado por una NC es **inmediatamente visible y aplicable** en el checkout de una venta nueva (`cobro-modal.tsx`), en el pago de una factura CxC (`pago-factura-modal.tsx`, `abono-global-modal.tsx`) y en la ficha del cliente (`cliente-form.tsx`). Este flujo está en producción — no es hipotético.

### 5.4 Nota sobre `FacturaDetallePanel`
`nota-credito-pos-modal.tsx` NUNCA muestra la sección de "afectación a cuentas por cobrar" en el panel de detalle (test L1177: "dato no confiable en flujo SAF, obs #2896/#2897") — decisión deliberada de UX, no bug.

---

## 6. TASA HISTÓRICA — mecanismo exacto (YA RESUELTO, no es pregunta abierta)

**Respuesta corta: `notas_credito.tasa_historica` = `venta.tasa` copiado VERBATIM al emitir la NC — nunca se lee `tasas_cambio` (tasa vigente) en ningún punto del flujo de NC.**

### Código exacto

`use-notas-credito.ts` L610-636 (INSERT de `notas_credito`):
```ts
await tx.execute(
  `INSERT INTO notas_credito (id, nro_ncr, venta_id, cliente_id, tipo, motivo, tasa_historica, ...)
   VALUES (?, ?, ?, ?, ?, ?, ?, ...)`,
  [
    ncrId, nroNcr, venta_id, venta.cliente_id, tipoNc, motivo,
    venta.tasa,   // <-- L620: tasa_historica = venta.tasa, sin transformación
    ...
  ]
)
```

`venta.tasa` se lee directo de la fila de `ventas` en el paso 1 (L389-401, `SELECT * FROM ventas WHERE id = ?`) — es la tasa que la venta "fotografió" al momento de facturar (regla de negocio #1 de CLAUDE.md).

### Uso de esa tasa dentro del cálculo fiscal por línea

`notas-credito-fiscal.ts` (comentario L9-16, función `calcularDesgloseLineaNC` L68):
```
`ventas.tasa` es un campo a nivel de FACTURA (no existe tasa por linea), por
lo que "tasa historica" = `venta.tasa` verbatim, sin importar la tasa
[vigente al momento de la NC]
```
`calcularDesgloseLineaNC(linea, ventaTasa)` (llamada en `use-notas-credito.ts` L581-590) recibe `venta.tasa` como parámetro y lo usa para calcular `subtotalBs` de cada línea de la NC (`toStorageString(usdToBs(totalUsdNc, venta.tasa))`, L607).

### Uso en la conversión bimonetaria de los modales
`recibo-desde-factura.ts` L83-84:
```ts
// SIEMPRE la tasa historica de la factura — nunca la tasa vigente del sistema.
tasa: factura.tasa,
```
Ambos modales (`nota-credito-pos-modal.tsx` L678-681, `crear-ncr-modal.tsx` L324-326) pasan `factura.tasa` (la tasa histórica ya resuelta) a `SeleccionLineasNc`/`buildReciboDataDesdeFacturaGuardada` — nunca consultan `tasas_cambio` vigente.

### Display en el listado
`nota-credito-pos-modal.tsx` L520-523 (Item 3, ajustes QA): cada tarjeta de factura en el listado de sesión muestra `Tasa: {formatTasa(f.tasa)}` — la tasa histórica de ESA factura específica, no la global vigente.

**Conclusión:** este mecanismo está completo, probado (test suite completa en `notas-credito-fiscal.test.ts`) y en producción. No requiere decisión de diseño para el change `nc-refund-tesoreria` — cuando ese change implemente `REFUND_TESORERIA`, la conversión multi-moneda debe usar `notas_credito.tasa_historica` (ya persistida), replicando el patrón de `use-cxc.ts` L605-646 (`aplicarPagoFacturaEnTx`) pero con la fuente de tasa corregida (ver exploración #3647, punto "Design forks e)": "CONFIRMADO sin ambigüedad").

---

## 7. Permisos y PIN

| Slug | Constante | Dónde se usa |
|---|---|---|
| `ventas.nota_credito` | `PERMISSIONS.SALES_NOTA_CREDITO` (`use-permissions.ts:10`) | Gate de **PIN A** en `nota-credito-pos-modal.tsx` (L379, L395, L416) — determina si el cajero necesita PIN para emitir. Introducido por migración 0091 (L106-127), otorgado por defecto a roles `Supervisor` y `Administrador` |
| `ventas.anular` | `PERMISSIONS.SALES_VOID` (`use-permissions.ts:8`) | Gate de **acceso** a la ruta administrativa completa (no un PIN inline) — `crear-ncr-modal.tsx` nunca pide PIN porque asume que llegar a esa pantalla ya requirió este permiso a nivel de ruta |

### PIN A vs PIN B (solo en POS-express)
- **PIN A** (emisión): `SupervisorPinDialog` con `requiredPermission={PERMISSIONS.SALES_NOTA_CREDITO}` (L789-811). Se pide SOLO si `!hasPermission(PERMISSIONS.SALES_NOTA_CREDITO)`. Un supervisor con el permiso emite directo sin fricción.
- **PIN B** (override de depósito de reingreso): `SupervisorPinDialog` SEPARADO, mismo `requiredPermission` pero estado (`showPinDeposito`) y callback (`onAuthorized={() => setPinDepositoAutorizado(true)}`) independientes (L816-823). Gatea únicamente el cambio de depósito, nunca la emisión de la NC en sí.
- Ambos PINs son **efímeros**, escopeados a un único proceso de NC sobre una factura — se limpian al cerrar el modal, deseleccionar factura o elegir otra (`resetAutorizacionesPin`, L206-213).
- Test explícito de independencia: `nota-credito-pos-modal.test.tsx:639` "PIN A y PIN B son independientes: sin permiso de emisión, autorizar PIN B para el depósito NO exime del PIN A al confirmar".
- Supervisor bypass: no existe un "bypass" separado — el mecanismo ES que un usuario con el permiso `ventas.nota_credito` (típicamente Supervisor/Administrador por la migración 0091) simplemente nunca ve el diálogo de PIN.

### Admin/Tradicional
CERO PIN inline — confirmado por test (`crear-ncr-modal.test.tsx:114`: "nunca monta SupervisorPinDialog, ni antes ni después de confirmar"). El gate vive 100% en el nivel de acceso a la ruta (`PERMISSIONS.SALES_VOID`).

---

## 8. Schema — emisión/liquidación

### 8.1 `notas_credito` (schema.ts L755-780, tipos + migración 0091)

| Columna | Tipo PowerSync | Origen | Notas |
|---|---|---|---|
| `empresa_id` | text | 0006 | Multi-tenant |
| `nro_ncr` | text | 0006 | Consecutivo por empresa |
| `venta_id` | text | 0006 | FK factura |
| `cliente_id` | text | 0006 | |
| `tipo` | text | 0006 | `'TOTAL'` / `'PARCIAL'` |
| `motivo` | text | 0006 | |
| `moneda_id` | text | 0006 | (no usada por `crearNotaCredito`, legado) |
| `tasa_historica` | text | 0006 | **= `venta.tasa` verbatim** (ver §6) |
| `total_exento_usd` / `total_base_usd` / `total_iva_usd` | text | Slice 4a | Desglose fiscal agregado de header |
| `total_usd` / `total_bs` | text | 0006 | TOTAL=venta verbatim, PARCIAL=suma de líneas |
| `afecta_inventario` | integer | 0006 | Siempre `1` en `crearNotaCredito` |
| `usuario_id` | text | 0006 | |
| `fecha` | text | 0006 | |
| `created_at` / `created_by` | text | **0091** | `created_by` era un bug pre-0091: se insertaba sin existir la columna |
| `sesion_caja_id` | text (FK `sesiones_caja`) | **0091** | Solo poblado si `entryPoint==='POS'` |
| `liquidacion_modalidad` | text, CHECK 5 valores | **0091** | `SALDO_FAVOR, COMPENSACION_VENTA, AJUSTE_CXC, REFUND_TESORERIA, EFECTIVO_REAL` — el CHECK YA incluye REFUND_TESORERIA aunque el write core la rechace |
| `no_desembolso` | integer (boolean) | **0091** | Ver §4 |

### 8.2 `notas_credito_det` (schema.ts L782-801)

| Columna | Origen | Notas |
|---|---|---|
| `empresa_id`, `nota_credito_id`, `producto_id`, `deposito_id`, `cantidad`, `precio_unitario_usd`, `tipo_impuesto`, `impuesto_pct`, `subtotal_usd`, `afecta_inventario`, `descripcion`, `lote_id`, `created_at` | 0006 | |
| `venta_det_id` | **0091** | FK `ventas_det`, ON DELETE RESTRICT — clave del guard de doble-crédito por línea (`validarTopeDobleCredito`) |
| `subtotal_bs` | **0091** | Simetría bimonetaria con `ventas_det` |

### 8.3 Constraints relacionadas (misma migración 0091)
- `movimientos_metodo_cobro.origen` CHECK ampliado con `'NCR'` (egreso condicional de la Regla de Oro).
- `permisos` += `ventas.nota_credito`, otorgado a `Supervisor` y `Administrador` (`rol_permisos`).

**No existen migraciones posteriores a 0091 que toquen `notas_credito`** (grep exhaustivo de `notas_credito` en `migrations/` confirma: 0006, 0091, y los 3 scripts de cleanup genéricos).

---

## 9. Inventario de tests existentes

### 9.1 `use-notas-credito.test.ts` (1051+ líneas, ~35 tests) — motor puro
- Reingreso de stock al depósito de ORIGEN (5 tests) — incluye servicio con receta.
- Fallback automático a depósito principal si el origen está inactivo (2 tests).
- `sesion_caja_id` + Regla de Oro egreso condicional + reversa de pagos (6 tests) — incluye multi-método (per-method egress) y "otra sesión → NO egreso".
- Modalidades de liquidación + gate anti-fraude (11 tests) — cubre las 5 modalidades explícitamente, incluyendo el throw de `REFUND_TESORERIA` como "aún no implementado" (L699-707, candidato a volverse RED intencional cuando se implemente) y la regresión obs #2814 (SALDO_FAVOR nunca dispara Regla de Oro).
- `depositoReingresoId` override (3 tests).
- Wiring PARCIAL completo: `notas_credito_det`, guard doble-crédito, desglose fiscal por línea, servicio no seleccionado, factura CRÉDITO parcialmente pendiente (5 tests).
- `useReversosFactura` (4 tests) — historial JOIN NC+detalle.
- `useNotasCredito` con filtros (6 tests).

### 9.2 `nota-credito-pos-modal.test.tsx` (~50 tests)
Cobertura completa: título/layout, reveal-gate de sección NC, reimpresión, PIN A (con/sin permiso), PIN B (override depósito, independencia de PIN A/B, casos borde de doble-PIN), badges de estado/reverso, buscador, panel de detalle fiscal (incluye exclusión deliberada de sección CxC), selección TOTAL/PARCIAL sin preselección, placeholder "Editar métodos de pago", comportamiento post-emisión (modal permanece abierto, remount de `SeleccionLineasNc`), responsive master-detail.

### 9.3 `crear-ncr-modal.test.tsx` (~17 tests)
Sin PIN nunca, TOTAL/PARCIAL, "Devolver dinero" deshabilitado con tooltip "Próximamente" (confirma que REFUND_TESORERIA es inalcanzable desde la UI hoy), motivo obligatorio, "Crédito a favor" única opción activa, gating de reverso previo (total/parcial), selector de depósito libre sin PIN.

### 9.4 Otros archivos de test relacionados
`notas-credito-page.test.tsx`, `notas-credito-tab.test.tsx` (listado/UI de administración), `notas-credito-admin-filters.test.ts`, `notas-credito-fiscal.test.ts` (desglose fiscal puro, incluye tasa histórica), `notas-credito-pin-gating.test.ts` (función pura `resolverDepositoOverride`), `notas-credito-ui.test.ts` (badges, gating de acción).

**Conclusión de cobertura:** el único hueco de test intencional y documentado es `REFUND_TESORERIA rechaza como "no implementado"` — diseñado para volverse el primer test RED del change `nc-refund-tesoreria` (TDD).

---

## Resumen ejecutivo para el usuario

Ver mensaje de retorno al orquestador.
