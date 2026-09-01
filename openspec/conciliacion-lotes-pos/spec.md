# Spec: Conciliación Legible + Lotes POS

> Change: `conciliacion-lotes-pos`
> Date: 2026-07-24
> Capabilities: `conciliacion-bancaria-legibilidad` (New) · `lotes-pos-cuadre` (New)
> Modifies (by reference, no literal block-copy — no matching requirement exists yet in either spec):
> `openspec/specs/caja/spec.md` (cuadre físico UI) · `openspec/cierre-consolidacion-tesoreria/specs/tesoreria-consolidacion-cierre/spec.md` → "Requirement: Routing per payment method" (extends the per-method loop with lote branching; that spec explicitly lists "POS batch/lote number entry" as Out of Scope, which this change fills)

---

## Capability: conciliacion-bancaria-legibilidad

### Requirement: Lectura de descripción con fallback a observación (TANDA 1a)

La tabla de conciliación pendiente/histórica (`movimientos-table.tsx`) MUST mostrar el texto legible del movimiento leyendo `descripcion ?? observacion`, incluso cuando `descripcion` esté vacía y el texto legible viva en `observacion` (patrón ya correcto en `conciliacion-bancaria.tsx`). MUST NOT mostrar `"-"` cuando exista texto en cualquiera de las dos columnas.

#### Scenario: SC-01 — Cobro cliente con texto solo en observación

- GIVEN un `movimiento_bancario` tipo "Cobro cliente" con `descripcion=NULL` y `observacion="Venta C01-000123"`
- WHEN se renderiza la fila en la tabla de conciliación
- THEN la fila muestra "Venta C01-000123", no "-"

#### Scenario: SC-02 — Ambas columnas vacías

- GIVEN un movimiento con `descripcion=NULL` y `observacion=NULL`
- WHEN se renderiza la fila
- THEN la fila muestra "-" (comportamiento sin cambios)

### Requirement: Referencia condicionada a requiere_referencia (TANDA 1b)

`cobro-modal.tsx` MUST mostrar el campo de referencia como obligatorio y bloquear el registro del pago si `metodos_cobro.requiere_referencia = 1` y la referencia ingresada está vacía. MUST permitir referencia vacía cuando `requiere_referencia = 0`. Mismo patrón ya usado en `gasto-form.tsx` y `citas/step-checkout.tsx`.

#### Scenario: SC-03 — Método con referencia obligatoria sin referencia

- GIVEN método de pago "Pago Móvil" con `requiere_referencia=1`
- WHEN el cajero intenta agregar el pago dejando la referencia vacía
- THEN el sistema bloquea la acción con un mensaje en español indicando que la referencia es obligatoria para ese método

#### Scenario: SC-04 — Método sin referencia obligatoria

- GIVEN método de pago con `requiere_referencia=0`
- WHEN el cajero agrega el pago sin ingresar referencia
- THEN el pago se agrega normalmente

### Requirement: Sesión de caja legible (TANDA 2)

En todo lugar donde hoy se muestra el uuid crudo de una sesión de caja al usuario, empezando por la descripción generada en la consolidación de `cerrarSesionCaja`, el sistema MUST mostrar `SES-{primeros 8 caracteres del uuid en mayúsculas}` en su lugar. Fuera de alcance: correlativo secuencial (`SES-C01-000123`) — pospuesto por conflicto con sincronización eventual offline-first.

#### Scenario: SC-05 — Descripción de consolidación con sesión legible

- GIVEN una sesión de caja con id `7dbd3a2f-1234-...`
- WHEN se genera la descripción del traspaso consolidado de cierre
- THEN el texto de sesión mostrado es "SES-7DBD3A2F", no el uuid completo

---

## Capability: lotes-pos-cuadre

### Requirement: Captura de lotes POS en el cuadre

En la pantalla de cuadre (`cuadre-conteo-fisico.tsx`), para métodos de pago de `tipo` POS/PUNTO, el sistema MUST permitir al cajero cargar N filas de lote: `{ metodo_cobro_id, nro_lote (texto manual), monto (moneda nativa del método) }`. Estas filas MUST ser editables y eliminables antes de cerrar la sesión. La suma de los lotes de un método MUST reemplazar el input de monto único como total del sistema para ese método. Métodos que no son POS/PUNTO MUST NOT mostrar esta tabla; conservan el input simple actual.

#### Scenario: SC-06 — Alta de dos lotes en un método

- GIVEN método "Tarjeta Débito" (POS) sin lotes cargados
- WHEN el cajero agrega lote "10" por $5000 y lote "11" por $5500
- THEN el total del sistema para ese método muestra $10500

#### Scenario: SC-07 — Edición y borrado de un lote

- GIVEN un lote cargado con monto $5000
- WHEN el cajero edita el monto a $5200 y luego borra otro lote existente
- THEN el total del método recalcula reflejando ambos cambios, antes de cerrar la sesión

#### Scenario: SC-08 — Mismo número de lote en métodos distintos

- GIVEN método "Tarjeta Débito" con lote "10" y método "Tarjeta Crédito" con lote "10"
- WHEN ambos se cargan en el mismo cuadre
- THEN no hay colisión ni error de unicidad — el número de lote es único por `(empresa_id, metodo_cobro_id, sesion_caja_id, nro_lote)`, no global

### Requirement: Persistencia de lotes como datos previos al cierre

Los lotes MUST persistir en una nueva tabla PowerSync con scope `empresa_id`, vinculada a `sesion_caja_id` y `metodo_cobro_id`, siguiendo las convenciones existentes (booleanos como `column.integer`, decimales como `column.text`). Esta tabla MUST comportarse como datos de trabajo editables/eliminables antes del cierre — MUST NOT ser un libro inmutable (no aplica la regla de inmutabilidad de Kardex/tasas/movimientos_cuenta).

#### Scenario: SC-09 — Lote persiste offline y sincroniza

- GIVEN el cajero carga un lote sin conexión
- WHEN la app reconecta
- THEN el lote sincroniza a Supabase con su `empresa_id` correcto, sin requerir intervención manual

### Requirement: Enrutamiento a Tesorería según consolidar_lotes

`metodos_cobro` gains la columna `consolidar_lotes` (boolean, DEFAULT `true` — preserva el comportamiento actual de un traspaso sumado por método). Al cerrar la sesión:
- WHEN `consolidar_lotes = true`: el sistema MUST sumar todos los lotes del método en UN solo traspaso a Tesorería, con los números de lote listados en la descripción (`"Lotes: 10, 11"`). La comisión MUST aplicarse sobre el total del método (estilo Mercantil).
- WHEN `consolidar_lotes = false`: el sistema MUST generar UN traspaso a Tesorería POR CADA lote, cada uno con su propia comisión calculada sobre el monto de ese lote (estilo Banesco).

#### Scenario: SC-10 — Consolidado (true)

- GIVEN método con `consolidar_lotes=true`, lotes "10" ($5000) y "11" ($5500)
- WHEN se cierra la sesión
- THEN Tesorería muestra UN traspaso pendiente de $10500 con descripción que incluye "Lotes: 10, 11", comisión calculada sobre $10500

#### Scenario: SC-11 — Por lote (false)

- GIVEN método con `consolidar_lotes=false`, lotes "10" ($5000) y "11" ($5500)
- WHEN se cierra la sesión
- THEN Tesorería muestra DOS traspasos pendientes distintos ($5000 y $5500), cada uno con su propia comisión calculada sobre su propio monto

### Requirement: Moneda nativa del lote

Los montos de lote MUST capturarse y enrutarse en la moneda nativa del método de pago. El cierre MUST reutilizar la validación de destino-moneda ya existente en `cerrarSesionCaja` (fail-close si hay mismatch de moneda entre el lote y el destino resuelto).

#### Scenario: SC-12 — Mismatch de moneda aborta el cierre

- GIVEN un método POS en Bs con un lote cuyo destino resuelto está en USD (configuración inconsistente)
- WHEN se intenta cerrar la sesión
- THEN el cierre completo aborta con error en español nombrando el método; la sesión permanece `ABIERTA`; ningún traspaso se persiste

### Requirement: No regresión para métodos no-POS y sesiones sin lotes

Los métodos que NO son de `tipo` POS/PUNTO, y las sesiones sin ninguna fila de lote cargada, MUST comportarse EXACTAMENTE igual que hoy: mismo input simple de monto, misma consolidación en un único traspaso por método, sin ningún cambio de UI, cálculo o flujo. Este requisito es de cumplimiento estricto (HARD requirement) — la introducción de lotes POS MUST NOT alterar en absoluto el comportamiento ya estabilizado para métodos EFECTIVO, transferencia u otros tipos no-POS.

#### Scenario: SC-13 — Sesión mixta sin regresión

- GIVEN una sesión con método "Efectivo USD" (sin lotes, comportamiento actual) y método "Tarjeta Débito" (POS, con 2 lotes)
- WHEN se cierra la sesión
- THEN "Efectivo USD" genera su depósito exactamente como antes de este cambio; "Tarjeta Débito" enruta según `consolidar_lotes`; ningún otro método o cálculo cambia

### Requirement: Atomicidad del cierre con enrutamiento de lotes

El enrutamiento de lotes a Tesorería MUST ejecutarse dentro de la misma `writeTransaction` de `cerrarSesionCaja`, respetando el ordenamiento ya establecido (Opción 1): las inserciones de consolidación (incluido el enrutamiento por lote) MUST ocurrir ANTES del `UPDATE status='CERRADA'`, de forma que el trigger `fn_validate_sesion_abierta` vea la sesión en estado `ABIERTA` al momento de las inserciones. Si cualquier paso falla, TODO el cierre MUST revertirse (incluyendo lotes ya sumados/enrutados) y la sesión MUST permanecer `ABIERTA`.

#### Scenario: SC-14 — Falla parcial revierte todo, incluidos lotes

- GIVEN un cierre con lotes válidos en un método y un método distinto sin destino de banco configurado
- WHEN `cerrarSesionCaja` ejecuta y el método sin destino hace fail-hard
- THEN ningún traspaso de lote se persiste, `status` permanece `ABIERTA`, y el error nombra el método sin destino en español

---

## Out of Scope

- Correlativo secuencial de sesión de caja (`SES-C01-000123`) — pospuesto por conflicto con offline-first / sync eventual.
- Pantallas de consulta por rango de fecha/lote/monto en el módulo de bancos — diferido a un cambio futuro.
- Cualquier cambio de comportamiento en métodos de pago no-POS.
- Reapertura de sesión cerrada y la condición de carrera preexistente de `caja_fuerte.saldo_actual` — sin cambios, fuera de alcance.
