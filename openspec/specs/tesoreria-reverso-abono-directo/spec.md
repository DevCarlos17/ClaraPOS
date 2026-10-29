# Reverso de Abono Directo desde Tesorería Specification

## Purpose

Reversar un ingreso `TRANSFERENCIA_CLIENTE` desde el modal de tesorería hoy solo crea el egreso bancario (`reversarMovBancario`) sin tocar CxC, y reversar el mismo pago desde CxC (`registrarReversoAbono`) nunca crea el egreso bancario — en ambos casos el saldo del banco o de la factura queda desincronizado. Esta spec define el reverso ATÓMICO con AMBOS efectos (egreso + CxC completo) para el caso **sin cadena SAF**. El caso con SAF se bloquea explícitamente (slice futuro separado).

**Fuera de alcance**: desenredo de lotes SAF, reverso batch/lote, modal de consulta de factura en emisión, permiso `TESORERIA_REVERSE` nuevo.

## Requirements

### Requirement: Extracción de `reversarPagoEnTx` preserva el comportamiento existente

El sistema MUST extraer la lógica interna de `registrarReversoAbono` a un helper `reversarPagoEnTx(tx, params)` que acepta la `tx` del llamador sin abrir su propia `db.writeTransaction`. `registrarReversoAbono` MUST seguir produciendo, para el entry point de CxC, exactamente los mismos efectos que antes del refactor.

#### Scenario: Reverso standalone desde CxC sin cambios observables

- GIVEN un pago con `venta_id` no-NULL y sin cadena SAF
- WHEN se invoca `registrarReversoAbono` con los mismos parámetros que antes del refactor
- THEN la factura reabre `saldo_pend_usd`, el cliente actualiza `saldo_actual`/`saldo_pendiente_usd`, se inserta un movimiento `REV`, `pagos.is_reversed=1` y se generan los contra-asientos — idéntico al comportamiento pre-refactor

#### Scenario: `reversarPagoEnTx` nunca anida transacciones

- GIVEN un llamador con una `tx` ya abierta
- WHEN invoca `reversarPagoEnTx(tx, params)`
- THEN no se abre ninguna `db.writeTransaction` adicional

### Requirement: Reverso simple (1 factura, sin SAF)

El sistema MUST reversar, en una única `db.writeTransaction`, un ingreso ligado vía el puente a 1 pago sobre 1 factura sin SAF: crea un egreso bancario (`origen='REVERSO'`, `reverso_de`, `bancos_empresa.saldo_actual` decrementado, ingreso marcado `reversado=1`, `validado=1`, `validado_por`=usuario que confirma el reverso, `validado_at`=ahora) y ejecuta `reversarPagoEnTx` para el pago.

#### Scenario: Ingreso de $100 que paga 1 factura completa

- GIVEN un ingreso `TRANSFERENCIA_CLIENTE` de $100 ligado a 1 pago sobre la factura F1, sin SAF
- WHEN se reversa desde tesorería
- THEN se crea 1 egreso de $100 (banco baja $100) con `validado=1`, `validado_por` poblado con el usuario que confirma y `validado_at` poblado con la hora del reverso
- AND F1 reabre $100 de `saldo_pend_usd`, el cliente sube `saldo_actual` $100 y `pago.is_reversed=1`

#### Scenario: El egreso-reverso aterriza directo en Histórico como Validado, solo con Desconciliar

- GIVEN el egreso-contraparte recién insertado con `validado=1`, `reversado=0`, `origen='REVERSO'`
- WHEN la tabla de movimientos renderiza esa fila
- THEN la fila aparece en "Histórico" (nunca en "Pendientes", cuya query filtra `validado=0`) con badge "Validado" y ÚNICAMENTE la acción "Desconciliar"
- AND NUNCA muestra "Rechazar" (solo renderiza en Pendientes), "Conciliar" (gate exige `validado=0`) ni "Reversar" (gate exige `origen==='TRANSFERENCIA_CLIENTE'`, y este origen es `'REVERSO'`)

### Requirement: Reverso de abono global (N facturas, sin SAF)

El sistema MUST, para un ingreso ligado a N pagos sobre N facturas sin SAF, reversar las N facturas y marcar los N pagos `is_reversed=1` en la MISMA transacción, creando EXACTAMENTE UN egreso por el monto total con `validado=1`, `validado_por`=usuario que confirma el reverso, `validado_at`=ahora.

#### Scenario: Ingreso 38201beb reversa 2 facturas con 1 solo egreso

- GIVEN el ingreso `38201beb` ($2) con 2 pagos de $1 sobre `8954d635` y `ab7d1bab`, sin SAF
- WHEN se reversa desde tesorería
- THEN ambas facturas reabren $1 cada una, ambos pagos quedan `is_reversed=1`, el cliente sube $2
- AND se crea exactamente 1 egreso de $2 con `validado=1`, `validado_por` y `validado_at` poblados (no `NULL`)

### Requirement: Bloqueo del caso con cadena SAF

El sistema MUST rechazar el reverso, sin mutar ningún registro, cuando algún `pago_id` del puente tenga `facturasSaf` no vacío (`detectarLoteSafDePago`), con un mensaje indicando que el caso SAF no está disponible desde tesorería todavía.

#### Scenario: Abono con excedente consumido vía SAF

- GIVEN un ingreso cuyo abono generó un lote SAF consumido en la factura D
- WHEN se intenta reversar desde tesorería
- THEN se rechaza antes de abrir la transacción: cero egreso, cero facturas reabiertas, cero `pago.is_reversed`

### Requirement: Rechazo de doble-reverso

El sistema MUST rechazar el reverso si el pago ya tiene `is_reversed=1` o el ingreso ya tiene `reversado=1`, sin efectos duplicados.

#### Scenario: Pago ya reversado desde CxC

- GIVEN un pago con `is_reversed=1`
- WHEN se intenta reversar el ingreso desde tesorería
- THEN se rechaza sin segundo egreso ni reapertura; `trg_pagos_allow_reversal` (migración 0015) respalda este guard a nivel de Postgres

#### Scenario: Ingreso ya reversado desde tesorería

- GIVEN un ingreso con `reversado=1`
- WHEN se intenta reversarlo de nuevo
- THEN se rechaza; este guard es solo de aplicación (sin trigger Postgres equivalente)

### Requirement: Permiso y PIN de supervisor requeridos

El sistema MUST exigir `CXC_REVERSE` y, si el usuario no lo posee, el flujo de PIN de supervisor (patrón de `factura-detalle-cxc.tsx`) antes de ejecutar el reverso.

#### Scenario: Usuario sin CXC_REVERSE

- GIVEN un usuario sin `CXC_REVERSE`
- WHEN intenta reversar el abono directo
- THEN el sistema exige PIN de un supervisor con `CXC_REVERSE`; sin autorización válida, el reverso NO se ejecuta

### Requirement: Atomicidad total ante fallo

El sistema MUST ejecutar el egreso y todos los reversos CxC en UNA sola `db.writeTransaction`; si cualquier paso falla, la transacción MUST revertirse sin efectos parciales.

#### Scenario: Falla en el reverso del tercer pago de un abono global

- GIVEN un abono de 3 pagos donde el tercer `reversarPagoEnTx` lanza error
- WHEN la transacción hace rollback
- THEN no queda egreso creado ni las 2 facturas previas quedan reabiertas

### Requirement: Aislamiento multi-tenant e inmutabilidad del libro

Toda lectura/escritura MUST filtrar por `empresa_id` del usuario actual (defensa en profundidad: RLS no filtra por `empresa_id`, ver `CLAUDE.md`). El reverso MUST únicamente INSERTAR contra-registros (`REV`, contra-asientos, contra-movimiento bancario) y NUNCA actualizar/borrar filas existentes de `movimientos_cuenta` o `libro_contable`.

#### Scenario: Aislamiento por empresa

- GIVEN dos empresas con ids de pago coincidentes por azar
- WHEN se reversa un ingreso de la empresa A
- THEN solo se mutan registros con `empresa_id` de la empresa A

#### Scenario: Ningún registro inmutable se actualiza

- GIVEN cualquier reverso válido
- WHEN se ejecuta
- THEN los movimientos y asientos previos permanecen sin cambios; el efecto se logra solo con filas nuevas
