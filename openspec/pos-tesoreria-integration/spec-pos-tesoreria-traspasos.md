# Spec: pos-tesoreria-traspasos

_Change: pos-tesoreria-integration | Date: 2026-07-05 | Type: New Capability_

---

## Capability

El cajero puede retirar efectivo de su sesión de caja hacia Tesorería en una sola operación atómica con trazabilidad formal; el modal Avance ya no expone el origen Banco.

---

## Requirements

### REQ-001: Traspaso atómico RETIRO → Caja Fuerte

El sistema MUST ofrecer la opción "Traspaso a Tesorería" en `ingreso-retiro-modal.tsx` exclusivamente cuando `modo='RETIRO'`. Al confirmar, MUST ejecutar una `db.writeTransaction()` que crea los tres registros siguientes en orden y sin pausa:

1. `movimientos_metodo_cobro` con `tipo='EGRESO'` y `origen='EGRESO_TESORERIA'`, `sesion_caja_id` de la sesión activa.
2. `mov_caja_fuerte` con `tipo='INGRESO'`, `validado=0`, `doc_origen_tipo='SESION_CAJA'`, `doc_origen_id` = id del movimiento anterior.
3. `traspasos_tesoreria` con `cuenta_origen_tipo='SESION_CAJA'`, `sesion_caja_id` de la sesión, `cuenta_destino_tipo='CAJA_FUERTE'`, `cuenta_destino_id` = caja fuerte seleccionada.

Si cualquiera de los tres INSERTs falla, la transacción completa MUST revertir. Ningún registro parcial MUST persistir.

#### Scenario: happy path — retiro con traspaso

- Given: sesión de caja activa con saldo > 0, al menos una caja fuerte activa de la moneda correspondiente
- When: cajero elige "Traspaso a Tesorería", selecciona caja fuerte destino, ingresa monto válido y confirma
- Then: se crean exactamente tres registros (movimientos_metodo_cobro + mov_caja_fuerte + traspasos_tesoreria) con `empresa_id` del usuario actual; el saldo de la sesión disminuye por el monto retirado
- Validation: los tres INSERTs ocurren en una sola transacción; si falla uno, los tres son revertidos

#### Scenario: registro mov_caja_fuerte queda PENDIENTE

- Given: traspaso completado exitosamente
- When: se consulta el registro `mov_caja_fuerte` recién creado
- Then: `validado = 0`; el registro NO es conciliado automáticamente; requiere validación manual desde Tesorería
- Validation: `validado` es `integer` (0/1); el campo `validado_por` y `validado_at` permanecen NULL

#### Scenario: monto supera saldo disponible de sesión

- Given: sesión con saldo_disponible_usd = 50.00
- When: cajero ingresa monto = 75.00 y elige "Traspaso a Tesorería"
- Then: la operación es rechazada antes de tocar la base de datos; se muestra mensaje de error claro indicando el saldo disponible
- Validation: ningún registro es creado en ninguna tabla

#### Scenario: aislamiento multi-tenant

- Given: usuario de empresa A con sesión activa
- When: se ejecuta el traspaso
- Then: los tres registros creados tienen `empresa_id` = empresa del usuario; ningún registro de otra empresa es afectado

---

### REQ-002: Botón "Traspaso a Tesorería" ausente en modo INGRESO

El sistema MUST NOT mostrar la opción "Traspaso a Tesorería" cuando `ingreso-retiro-modal.tsx` opera en `modo='INGRESO'`.

#### Scenario: modal abierto en modo INGRESO

- Given: `ingreso-retiro-modal.tsx` abierto con `modo='INGRESO'`
- When: el cajero visualiza las opciones disponibles
- Then: la opción "Traspaso a Tesorería" no es visible en ninguna sección del modal

---

### REQ-003: Eliminación del tab BANCO en modal Avance

El sistema MUST NOT mostrar la pestaña o selector de origen "BANCO" en `avance-modal.tsx`. Los únicos orígenes disponibles MUST ser `CAJA` y `EFECTIVO_EMPRESA`.

#### Scenario: modal Avance abierto

- Given: `avance-modal.tsx` abierto en cualquier contexto
- When: el cajero visualiza los orígenes disponibles
- Then: solo aparecen `CAJA` y `EFECTIVO_EMPRESA`; no existe pestaña, botón ni opción con la etiqueta "Banco" o equivalente
- Validation: el comportamiento de los orígenes existentes (CAJA, EFECTIVO_EMPRESA) MUST permanecer sin cambios
