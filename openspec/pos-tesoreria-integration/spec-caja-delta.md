# Delta for Caja

_Change: pos-tesoreria-integration | Date: 2026-07-05 | Modifies: openspec/specs/caja/spec.md_

---

## ADDED Requirements

### REQ: Indicativo visual de origen INGRESO_TESORERIA en cuadre

El cuadre de caja MUST diferenciar visualmente los ingresos manuales con `origen='INGRESO_TESORERIA'` de los ingresos manuales ordinarios (`origen='INGRESO_MANUAL'`). La diferenciación MUST ser un badge o etiqueta visible junto a la entrada correspondiente. La visualización MUST NOT alterar el cálculo del saldo ni el flujo de cierre.

#### Scenario: sesión con ingresos mixtos en cuadre

- Given: sesión con un INGRESO_MANUAL ordinario y un INGRESO_TESORERIA
- When: el cajero abre el cuadre de caja
- Then: el ingreso con `origen='INGRESO_TESORERIA'` muestra un badge o indicativo que lo distingue del ingreso manual ordinario
- Validation: el monto de ambos ingresos cuenta correctamente en el total de ingresos de la sesión

#### Scenario: sesión sin ingresos INGRESO_TESORERIA

- Given: sesión sin ningún movimiento con `origen='INGRESO_TESORERIA'`
- When: el cajero abre el cuadre
- Then: no aparece badge ni indicativo de Tesorería; el cuadre se comporta exactamente igual que antes

#### Scenario: aislamiento multi-tenant en cuadre

- Given: cajera en empresa A
- When: se carga el cuadre
- Then: solo movimientos de la sesión activa de empresa A son mostrados; ningún movimiento de otra empresa aparece

---

### REQ: useSaldoSesionCaja incluye INGRESO_TESORERIA en cálculo de ingresos

`useSaldoSesionCaja` MUST incluir los movimientos con `origen='INGRESO_TESORERIA'` en el total de ingresos de la sesión, de modo que el saldo calculado refleje el efectivo enviado desde Tesorería.

#### Scenario: saldo con INGRESO_TESORERIA

- Given: sesión con apertura $100 USD + INGRESO_TESORERIA de $50 USD
- When: se consulta `useSaldoSesionCaja`
- Then: el saldo reportado incluye los $50 del INGRESO_TESORERIA en el total de ingresos; saldo total = $150 USD
- Validation: el hook filtra por `empresa_id` y `sesion_caja_id` de la sesión activa

---

### REQ: Mensaje informativo de depósito a Tesorería al cerrar sesión

Al completar el cierre de sesión exitosamente, el sistema MUST mostrar un mensaje o toast informativo recordando al cajero que el efectivo reportado debe ser depositado a la cuenta de Tesorería correspondiente a la moneda respectiva. El mensaje MUST NOT bloquear el flujo de cierre ni requerir confirmación adicional.

#### Scenario: cierre de sesión exitoso muestra mensaje

- Given: sesión de caja en curso, cajero ejecuta el cierre
- When: el cierre se completa sin errores
- Then: aparece un toast o mensaje informativo con texto sobre el depósito del efectivo a la cuenta de Tesorería; el flujo de cierre ya está completo al momento de mostrarlo
- Validation: el mensaje es informativo (no es un dialog de confirmación ni bloquea la UI)

#### Scenario: cierre fallido no muestra mensaje

- Given: cajero intenta cerrar sesión pero ocurre un error
- When: el cierre falla
- Then: no aparece el mensaje de depósito a Tesorería; solo se muestra el error del cierre
