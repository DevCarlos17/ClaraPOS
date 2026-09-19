# Delta for caja

## ADDED Requirements

### Requirement: Las 3 estrategias de cálculo de efectivo reconocen el egreso NC admin cross-sesión

`useSaldoEfectivoBimonetario`, `cerrarSesionCaja` y `useSaldoSesionCaja` MUST tratar un egreso NC admin `destino: 'SESION_CAJA'` (escrito contra la sesión DESTINO elegida) de forma idéntica al egreso NCR existente de POS, para efectos del cuadre de esa sesión destino — sin importar en qué sesión vive el pago original de la venta reversada. El egreso MUST aparecer en la línea "Devoluciones (NC)" del Arqueo Teórico y en la tabla "Salidas de Caja" de la sesión destino.

#### Scenario: Aparece en Arqueo Teórico de la sesión destino

- GIVEN una sesión `ABIERTA` que recibió un egreso NC admin
- WHEN se calcula `useSaldoEfectivoBimonetario` para esa sesión
- THEN el monto aparece restado en la línea "Devoluciones (NC)"

#### Scenario: Aparece en la tabla "Salidas de Caja"

- GIVEN el mismo egreso
- WHEN se abre el acordeón "Salidas de Caja" de la sesión destino
- THEN la fila del egreso NC admin está listada, igual que un egreso NCR de POS

#### Scenario: Consistente al cerrar la sesión destino

- GIVEN una sesión con el egreso NC admin ya registrado
- WHEN el cajero ejecuta `cerrarSesionCaja`
- THEN `sesiones_caja_detalle` refleja el mismo monto que ya se veía en el cuadre en vivo, sin divergencia entre las 3 estrategias

#### Scenario: Aislamiento multi-tenant

- GIVEN egresos NC admin de otra empresa
- WHEN se calcula cualquiera de las 3 estrategias para una sesión de la empresa actual
- THEN esos egresos de otra empresa nunca se incluyen

## Out of Scope (Fase 3)

- Reflejar en el cuadre de la SESIÓN DE ORIGEN de la venta que su pago fue reversado por una NC liquidada contra OTRA sesión (paridad completa POS/admin cruzando sesiones) — limitación conocida y ya documentada: `useSaldoEfectivoBimonetario` no filtra `pagos.is_reversed`, por lo que el pago reversado puede seguir sumando en la sesión de origen si el egreso compensatorio no vive ahí.
