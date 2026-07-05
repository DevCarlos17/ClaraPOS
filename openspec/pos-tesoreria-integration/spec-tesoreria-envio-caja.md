# Spec: tesoreria-envio-caja

_Change: pos-tesoreria-integration | Date: 2026-07-05 | Type: New Capability_

---

## Capability

Un operador de Tesorería puede enviar efectivo desde una caja fuerte hacia una sesión de caja activa, con el ingreso identificado como proveniente de Tesorería en el cuadre de la cajera.

---

## Requirements

### REQ-001: Listado de sesiones de caja activas

El sistema MUST mostrar en el módulo Tesorería una vista o modal con todas las `sesiones_caja` cuyo `status = 'ABIERTA'` dentro de la misma empresa. Cada entrada MUST incluir: nombre del usuario que abrió la sesión, nombre de la caja, y fecha/hora de apertura. El listado MUST filtrar por `empresa_id` del usuario actual.

#### Scenario: sesiones activas disponibles

- Given: empresa con dos sesiones de caja en status='ABIERTA'
- When: el operador de Tesorería accede al selector de sesiones
- Then: el listado muestra exactamente esas dos sesiones con usuario, nombre de caja y fecha de apertura
- Validation: solo aparecen sesiones de la misma empresa; status='CERRADA' excluidas

#### Scenario: sin sesiones activas

- Given: ninguna sesión de caja en status='ABIERTA'
- When: el operador accede al selector
- Then: se muestra estado vacío con mensaje explicativo; el botón de confirmación está deshabilitado

---

### REQ-002: Envío atómico Caja Fuerte → Sesión de Caja

Al confirmar el envío, el sistema MUST ejecutar una `db.writeTransaction()` que crea tres registros en orden:

1. `mov_caja_fuerte` con `tipo='EGRESO'`, actualizando `saldo_nuevo` de la caja fuerte origen.
2. `movimientos_metodo_cobro` con `tipo='INGRESO'`, `origen='INGRESO_TESORERIA'`, `sesion_caja_id` de la sesión destino, `doc_origen_id` = id del movimiento anterior.
3. `traspasos_tesoreria` con `cuenta_origen_tipo='CAJA_FUERTE'`, `cuenta_destino_tipo='SESION_CAJA'`, `sesion_caja_id` de la sesión destino.

Si cualquier INSERT falla, la transacción completa MUST revertir. Ningún registro parcial MUST persistir.

#### Scenario: happy path — envío exitoso

- Given: caja fuerte con saldo suficiente, sesión de caja activa seleccionada, monto válido ingresado
- When: el operador confirma el envío
- Then: saldo de la caja fuerte disminuye por el monto; saldo de la sesión de caja aumenta por el monto; se crean tres registros con `empresa_id` del operador
- Validation: atomicidad garantizada; los tres INSERTs o ninguno persisten

#### Scenario: cajera ve el ingreso marcado como proveniente de Tesorería

- Given: envío completado hacia la sesión de la cajera
- When: la cajera consulta el cuadre o movimientos de su sesión
- Then: el ingreso aparece con `origen='INGRESO_TESORERIA'` y muestra un indicativo visual que lo diferencia de ingresos manuales normales
- Validation: el campo `origen` en `movimientos_metodo_cobro` es 'INGRESO_TESORERIA'

#### Scenario: sesión destino cerrada al momento de confirmar

- Given: el operador tenía la sesión A seleccionada; entre la selección y la confirmación, esa sesión fue cerrada
- When: el operador confirma el envío
- Then: la operación es rechazada con mensaje claro indicando que la sesión ya no está activa; ningún registro es creado
- Validation: verificar `status='ABIERTA'` dentro de la misma transacción antes del primer INSERT

#### Scenario: saldo insuficiente en caja fuerte

- Given: caja fuerte con saldo_actual = 30.00 USD
- When: operador ingresa monto = 50.00 USD
- Then: la operación es rechazada antes de escribir; se muestra el saldo disponible en el mensaje de error
- Validation: ningún registro es creado en ninguna tabla

#### Scenario: aislamiento multi-tenant

- Given: operador de empresa A
- When: se ejecuta el envío
- Then: solo sesiones y cajas fuerte de empresa A son accesibles y afectadas; los tres registros creados tienen `empresa_id` de empresa A
