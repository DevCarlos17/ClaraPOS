# Spec: Caja — SAF en cuadre de sesión

> **Domain**: caja (cross-cutting: `features/caja` + `features/reportes`)
> **Last updated by change**: `caja-saf` (2026-06-06) — added CAP-3, CAP-1, CAP-2

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

## Known Open Items

| ID | Description |
|----|-------------|
| DEUDA-1 | `ResumenSesionCerradaModal` no muestra la fila SAF del snapshot — INNER JOIN sobre `metodo_cobro_id` excluye la fila virtual con NULL. Pendiente para futura iteración. |
| DEUDA-2 | Empty state del modal dice "en esta sesión" en lugar de "hoy" (cosmético; implementación es más precisa que el spec original). |
