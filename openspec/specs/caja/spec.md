# Spec: Caja — SAF en cuadre de sesión + Consolidación a Tesorería

> **Domain**: caja (cross-cutting: `features/caja` + `features/reportes` + `features/tesoreria`)
> **Last updated by change**: `cierre-consolidacion-tesoreria` (2026-07-24) — added CAP-4

---

## CAP-3: saf-schema-migration

### Requirement: sesion_caja_id en movimientos_cuenta

`movimientos_cuenta` MUST include `sesion_caja_id TEXT` (nullable). `crearVenta` paso 7d MUST popularlo con el `sesion_caja_id` de la venta al insertar SAF. Sin backfill.

#### Scenario: migración additive

- GIVEN `movimientos_cuenta` sin `sesion_caja_id`
- WHEN `ALTER TABLE movimientos_cuenta ADD COLUMN sesion_caja_id TEXT`
- THEN columna existe, nullable, sin DEFAULT; registros previos quedan con `NULL`

#### Scenario: schema PowerSync y sync rules

- GIVEN schema PowerSync de `movimientos_cuenta` sin la columna
- WHEN se agrega `sesion_caja_id: column.text`
- THEN columna sincroniza; sync rules con `SELECT *` la incluyen sin cambio manual

#### Scenario: crearVenta paso 7d propaga ID

- GIVEN venta activa con `sesion_caja_id` en payload
- WHEN `crearVenta` INSERT `movimientos_cuenta tipo='SAF'` (paso 7d)
- THEN `movimientos_cuenta.sesion_caja_id` = `ventas.sesion_caja_id` de la venta

---

## CAP-1: saf-cuadre

### Requirement: Saldo a favor aplicado en cuadre de caja

Cuadre MUST mostrar "Saldo a favor aplicado" = SUM(`tipo='SAF'`) por `sesion_caja_id` activo. SAF overpago CxC MUST NOT incluirse. Total cero → SHOULD ocultarse.

#### Scenario: sesión sin SAF

- GIVEN sesión sin `tipo='SAF'` con `sesion_caja_id` coincidente
- WHEN se carga el cuadre
- THEN "Saldo a favor aplicado" no aparece o muestra $0.00

#### Scenario: venta 100% SAF

- GIVEN venta de la sesión pagada 100% con SAF
- WHEN se carga el cuadre
- THEN muestra el monto exacto en USD

#### Scenario: venta parcial SAF

- GIVEN venta pagada parte SAF, parte otro método
- WHEN se carga el cuadre
- THEN muestra solo el monto SAF aplicado, no el total factura

#### Scenario: múltiples ventas SAF

- GIVEN dos o más ventas con SAF en la sesión
- WHEN se carga el cuadre
- THEN muestra suma total de SAF directos de la sesión

#### Scenario: SAF overpago CxC excluido

- GIVEN sesión con overpago dirigido a SAF vía `discrepancy.mode='SAF'`
- WHEN se carga el cuadre
- THEN ese monto NO aparece en "Saldo a favor aplicado"

#### Scenario: históricos NULL no contaminan

- GIVEN registros SAF previos a la migración (`sesion_caja_id IS NULL`)
- WHEN se carga el cuadre de la sesión activa
- THEN no aparecen en el total de la sesión actual

#### Scenario: snapshot en cierre de sesión

- GIVEN sesión activa con SAF aplicado
- WHEN cajero ejecuta el cierre
- THEN `sesiones_caja_detalle` incluye entrada con total SAF de la sesión

#### Scenario: aislamiento multi-tenant

- GIVEN usuario en empresa A con sesión activa
- WHEN se carga el cuadre
- THEN solo SAF de `empresa_id` del usuario y `sesion_caja_id` de la sesión activa

---

## CAP-2: saf-detalle-facturas

### Requirement: Modal de facturas pagadas con SAF

Click en "Saldo a favor aplicado" MUST abrir modal con `tipo='SAF'` de la sesión. Fila MUST incluir: nro. factura, cliente, monto SAF, total factura, indicador total/parcial. USD + Bs a tasa.

#### Scenario: modal vacío

- GIVEN sesión sin SAF aplicado
- WHEN se abre el modal
- THEN muestra "No hay ventas pagadas con saldo a favor hoy"

#### Scenario: lista con ventas SAF

- GIVEN sesión con ventas con SAF aplicado
- WHEN se abre el modal
- THEN lista con: nro. factura, nombre cliente, monto SAF, total factura

#### Scenario: pago total SAF

- GIVEN monto SAF aplicado = total factura
- WHEN aparece en el modal
- THEN fila muestra indicador "Pagado con SAF"

#### Scenario: pago parcial SAF

- GIVEN venta pagada con SAF + otro método
- WHEN aparece en el modal
- THEN muestra desglose: "SAF: $X.XX | [Método]: $Y.YY"

#### Scenario: bimonetario

- GIVEN ventas con tasa de cambio registrada
- WHEN se muestra el detalle
- THEN montos en USD con equivalente Bs a la tasa de cada venta

#### Scenario: históricos excluidos del drill-down

- GIVEN registros SAF con `sesion_caja_id IS NULL`
- WHEN se abre el modal de cualquier sesión
- THEN esos registros no aparecen en ninguna sesión

---

## CAP-4: cierre-consolidacion-tesoreria

_Change: `cierre-consolidacion-tesoreria` (archived 2026-07-24)_

### Requirement: cerrarSesionCaja triggers Tesorería consolidation atomically

`cerrarSesionCaja` MUST, inside its existing `writeTransaction` and after populating `sesiones_caja_detalle`, invoke the `tesoreria-consolidacion-cierre` capability (see `openspec/specs/tesoreria-consolidacion-cierre/spec.md`) for every used method. Consolidation MUST use the same transaction handle (no nested `writeTransaction`) so any consolidation failure rolls back the ENTIRE cierre atomically, including the `sesiones_caja.status` update. The existing `status='ABIERTA'` guard MUST continue to provide idempotency — a session cannot be closed (and consolidated) twice.

The `sesiones_caja.status='CERRADA'` UPDATE MUST be the LAST write inside `cerrarSesionCaja`'s transaction (not an early step), so that PostgreSQL trigger `fn_validate_sesion_abierta` (migration 0041), which rejects `movimientos_metodo_cobro`/`pagos` INSERTs against a non-`ABIERTA` session, sees the session as still `ABIERTA` while consolidation writes its `movimientos_metodo_cobro` EGRESO rows during PowerSync's sequential, write-order-preserving upload.

#### Scenario: Successful cierre also consolidates to Tesorería

- GIVEN an open session with mixed-method activity
- WHEN the cashier confirms cierre
- THEN `sesiones_caja.status` becomes `CERRADA` AND the corresponding pending Tesorería transfers exist, all committed in the same transaction

#### Scenario: Consolidation failure blocks the whole cierre

- GIVEN a method lacking a valid destination or a missing commission account
- WHEN cierre is attempted
- THEN the transaction throws, `sesiones_caja.status` stays `ABIERTA`, and no `sesiones_caja_detalle` row from this attempt persists either

#### Scenario: Status flip ordered after consolidation writes (sync-safety)

- GIVEN a cierre that consolidates at least one method to Tesorería
- WHEN the local transaction's writes upload to Supabase in original order
- THEN every `movimientos_metodo_cobro` EGRESO_TESORERIA insert reaches Postgres while the session is still `ABIERTA` there, so `fn_validate_sesion_abierta` does not reject it; the `status='CERRADA'` UPDATE is the last op in the batch

### Requirement: Mensaje informativo de depósito a Tesorería al cerrar sesión

Since cierre now deposits automatically via `tesoreria-consolidacion-cierre`, the system MUST NOT show any manual-deposit reminder toast after a successful cierre. The cashier is no longer responsible for manually depositing reported cash.

#### Scenario: Successful cierre shows no deposit reminder

- GIVEN a cashier completes cierre successfully
- WHEN the success toast appears
- THEN no additional "recuerda depositar" informational toast is shown afterward

#### Scenario: Failed cierre still shows no reminder (unchanged)

- GIVEN cierre fails
- WHEN the error toast appears
- THEN no deposit-reminder toast appears — same as before this change

---

## Known Open Items

| ID | Description |
|----|-------------|
| DEUDA-1 | `ResumenSesionCerradaModal` no muestra la fila SAF del snapshot — INNER JOIN sobre `metodo_cobro_id` excluye la fila virtual con NULL. Pendiente para futura iteración. |
| DEUDA-2 | Empty state del modal dice "en esta sesión" en lugar de "hoy" (cosmético; implementación es más precisa que el spec original). |
| DEUDA-3 | `cuadre-page.tsx` `ResumenSesionCerradaModal` query previamente seleccionaba `mc.moneda` (columna inexistente en `metodos_cobro`, solo existe `moneda_id`) — arreglado vía JOIN a `monedas` durante `cierre-consolidacion-tesoreria` (commit `808c714`), bug preexistente desde 2026-05-07 (commit `d5debc1`), no introducido por este cambio. |
| DEUDA-4 | Factura con métodos de pago combinados mostrando solo métodos en efectivo en el cuadre — síntoma secundario detectado durante QA de `cierre-consolidacion-tesoreria`, sin diagnosticar; movido a exploración del cambio `conciliacion-lotes-pos`. |
| DEUDA-5 | Carrera de lectura-escritura preexistente en `caja_fuerte.saldo_actual` / `bancos_empresa.saldo_actual` en cierres concurrentes (sin row locking) — documentada como riesgo conocido, no corregida en `cierre-consolidacion-tesoreria`. |
| DEUDA-6 | Gap sistémico en `connector.ts` `uploadData()`: sube CRUD ops secuencialmente en orden de escritura local y, ante un error FATAL, descarta el resto del batch pendiente (`transaction.complete()`). Si la consolidación falla a mitad de loop por una razón no relacionada, Postgres podría quedar con consolidación parcial y el UPDATE final de `status='CERRADA'` descartado (sesión queda `ABIERTA` en Postgres). Estrictamente no peor que el bug que esto reemplaza, pero es un gap sistémico de atomicidad multi-statement que ameritaría una RPC/función de Postgres a futuro. |
| DEUDA-7 | `pos-tesoreria-integration` (change previo) nunca fue archivado — su delta de `caja` (toast de recordatorio de depósito) quedó fuera del main spec hasta que `cierre-consolidacion-tesoreria` lo superó (MODIFIED requirement arriba). Considerar limpiar/archivar formalmente ese change folder si aún existe activo. |
