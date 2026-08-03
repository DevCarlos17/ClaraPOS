# Spec: Gastos — Registro QoL (Comisiones Bancarias N-conceptos)

> Change: `gastos-registro-qol`
> Date: 2026-07-28 (updated 2026-07-30 — PR-2b redesign)
> Capabilities: `gastos-comisiones-bancarias-seed` (New) · `metodo-cobro-deducciones` (New)
> Modifies (by reference, no literal block-copy — no spec principal existe todavía para `contabilidad`/`configuracion/bancos`):
> `openspec/specs/caja/spec.md` (cierre de sesión, `cerrarSesionCaja`) · configuración de bancos (`banco-form.tsx`)

> **PR-2b (2026-07-30)**: El diseño plano `6.2.05 COMISIONES BANCARIAS` de PR-2 (commit `16a0e3e`) queda SUPERADO por una estructura de 4 niveles que separa comisiones de pasarela de pago (gasto de venta) de comisiones bancarias (gasto financiero), y agrega el invariante de que ningún método de pago queda sin cuenta de comisión de pasarela. Ver obs. Engram `#706` (diseño final), `#703` (constraint: gastos en desarrollo, rewrite opción C permitido), `#705` (zonas prohibidas).

> **PR-3 spec fix (2026-08-02)**: SC-07/SC-08 corregidos. `tipo='TARJETA_CREDITO'` NO existe en `metodos_cobro` (obs Engram `#759` — el CHECK real es `EFECTIVO|TRANSFERENCIA|PUNTO|PAGO_MOVIL|ZELLE|DIVISA_DIGITAL|OTRO`; débito y crédito son ambos `tipo='PUNTO'`, distinguidos solo por `nombre`). El usuario confirmó además una simplificación total: SIN defaults especiales por `tipo` de método — un único slot de comisión base para cualquier método bancario (obs Engram `#753`, revisión final).

> **Scope guard**: Este cambio SOLO puede tocar el subárbol GASTOS de `plan_cuentas`, `bancos_empresa` y `metodo_cobro_deducciones`, además de la lógica de `banco-form.tsx`. MUST NOT tocar `ventas*`, `inventario_stock`/`movimientos_inventario` (Kardex), `productos`/`departamentos`/`marcas`/`unidades`/`depositos`/`lotes`/`ajustes`, `clientes`/`movimientos_cuenta`/`vencimientos_cobrar`, ni `usuarios`/`roles`/`rol_permisos`/`tenant_permisos` (obs #705).

---

## Capability: gastos-comisiones-bancarias-seed

### Requirement: Creación de la estructura de 4 niveles para comisiones de pasarela y bancarias (Slice 1 — PR-2b)

(Previously: un único subgrupo plano `6.2.05 COMISIONES BANCARIAS`, nivel 3, bajo `6.2`.)

La migración 0081 MUST crear dos ramas nuevas de grupos (nivel 3, `es_cuenta_detalle=false`), reutilizando el patrón `ON CONFLICT (empresa_id, codigo) DO NOTHING` de `seed_plan_cuentas`:

1. Bajo `6.1 GASTOS OPERACIONALES` → grupo `Gastos de Venta` → subgrupo `Comisiones de Pasarelas de Pago`.
2. Bajo `6.2 GASTOS NO OPERACIONALES` → grupo `Gastos Financieros` → subgrupo `Comisiones Bancarias`.

Dado que el módulo de gastos está en desarrollo y sin data de producción (obs #703), la migración 0081 MAY reescribir limpiamente el seed (opción C): MUST desactivar (`is_active=false`) las leaves planas `6.2.05.NN` creadas por 0080 en favor de la nueva jerarquía, sin requerir preservación histórica.

#### Scenario: SC-01 — Empresa nueva obtiene ambas ramas nuevas

- GIVEN una empresa creada después de aplicar la migración 0081
- WHEN se ejecuta `seed_plan_cuentas` para esa empresa
- THEN existen `Gastos de Venta > Comisiones de Pasarelas de Pago` (bajo `6.1`) y `Gastos Financieros > Comisiones Bancarias` (bajo `6.2`), ambos con `es_cuenta_detalle=false`

#### Scenario: SC-02 — Empresa existente obtiene el backfill y pierde la estructura plana anterior

- GIVEN una empresa creada antes de 0081, con leaves `6.2.05.NN` ya posteadas por 0080
- WHEN se ejecuta el backfill de 0081
- THEN la empresa obtiene ambas ramas nuevas y las leaves `6.2.05.NN` quedan `is_active=false`

#### Scenario: SC-03 — Re-ejecución no duplica

- GIVEN una empresa que ya tiene ambas ramas nuevas (por 0081 ya aplicada)
- WHEN la migración o el backfill se ejecuta de nuevo
- THEN `ON CONFLICT (empresa_id, codigo) DO NOTHING` evita crear una fila duplicada

#### Scenario: SC-04 — Rewrite limpio aceptado, sin preservación histórica

- GIVEN leaves `6.2.05.NN` de prueba creadas por 0080 en una empresa de desarrollo
- WHEN se aplica la migración 0081 completa
- THEN las leaves antiguas quedan desactivadas y NO se exige migrar sus montos ni conservar su código (regla de negocio #5 no aplica — sin data real, obs #703)

---

## Capability: metodo-cobro-deducciones

### Requirement: Tabla de N conceptos de deducción por método (Slice 1)

El sistema MUST soportar N filas de deducción por `metodo_cobro_id` en la tabla `metodo_cobro_deducciones`, cada una con `concepto` (texto), `porcentaje` (NUMERIC 0-100), `cuenta_gasto_id` (FK a `plan_cuentas`), `tipo` (`COMISION`|`ISLR`|`OTRO`), `orden` e `is_active`. Todas las filas MUST filtrar por `empresa_id`.

#### Scenario: SC-05 — Alta de concepto válido

- GIVEN un método de pago bancario existente
- WHEN se inserta una deducción con `porcentaje=3.5` y `cuenta_gasto_id` válida
- THEN la fila se crea correctamente asociada al método y a la `empresa_id` del usuario actual

#### Scenario: SC-06 — Rechazo por porcentaje fuera de rango

- GIVEN un intento de crear una deducción
- WHEN `porcentaje` es negativo o mayor a 100
- THEN la base de datos rechaza el INSERT/UPDATE (`CHECK (porcentaje >= 0 AND porcentaje <= 100)`)

### Requirement: Default único de comisión al crear método bancario (Slice 3)

Al crear un método de pago con `banco_empresa_id` asociado (cualquier `tipo` — no hay defaults especiales por `tipo`), el sistema MUST precargar exactamente 1 deducción por defecto: `tipo='COMISION'`, `porcentaje=0`, `cuenta_gasto_id` = `cuenta_gasto_pasarela_id` del banco del método. Este slot MUST quedar pre-seleccionado y editable por el usuario (ajustar `porcentaje`, cambiar cuenta, agregar más conceptos o desactivar) antes o después de guardar. Cualquier concepto adicional que el usuario agregue (segundo, tercero, etc.) MUST nacer también con `cuenta_gasto_id` default = la misma pasarela base, re-apuntable manualmente a otra cuenta de gasto.

#### Scenario: SC-07 — Default único al crear método bancario

- GIVEN la creación de un nuevo método de pago con `banco_empresa_id` asociado (cualquier `tipo`, ej. `PUNTO` para una tarjeta débito o crédito — ambas comparten el mismo `tipo`, se distinguen solo por `nombre`)
- WHEN se guarda el método
- THEN se precarga exactamente 1 fila en `metodo_cobro_deducciones` con `tipo='COMISION'`, `porcentaje=0` y `cuenta_gasto_id` = la cuenta pasarela base del banco

#### Scenario: SC-08 — El slot default nunca queda huérfano de cuenta

- GIVEN un método de pago bancario recién creado, sin que el usuario haya tocado el slot default
- WHEN se guarda el método
- THEN el slot `COMISION` queda vinculado a `bancos_empresa.cuenta_gasto_pasarela_id` (garantizado no-null por PR-2b), nunca con `cuenta_gasto_id` NULL ni huérfano

#### Scenario: SC-09 — Método sin banco no ofrece deducciones bancarias

- GIVEN un método de pago que no tiene `banco_empresa_id` asociado (p. ej. EFECTIVO)
- WHEN el usuario abre la sección de deducciones para ese método
- THEN el sistema no ofrece agregar conceptos de deducción bancaria (regla de dominio: solo métodos bancarios generan comisión — obs #638)

### Requirement: Backfill desde comision_pct (Slice 1)

La migración 0080 MUST migrar cada `metodos_cobro` con `comision_pct > 0` y `banco_empresa_id IS NOT NULL` a una fila de `metodo_cobro_deducciones` con `concepto='Comision bancaria'`, `tipo='COMISION'`, `porcentaje=comision_pct` y `cuenta_gasto_id` apuntando a la leaf de comisión del banco correspondiente. `metodos_cobro.comision_pct` MUST NOT eliminarse en esta migración (queda deprecado, comentario en schema). (Actualizado por PR-2b — obs #706): tras 0081, `cuenta_gasto_id` de este backfill MUST re-apuntar a la leaf bajo `Gastos Financieros > Comisiones Bancarias`, no a la leaf plana `6.2.05.NN` desactivada.

#### Scenario: SC-10 — Backfill de método existente con comisión

- GIVEN un método "Tarjeta Débito Banesco" con `comision_pct=2.5` y banco asociado
- WHEN se ejecuta el backfill de 0080 y luego 0081
- THEN existe una fila en `metodo_cobro_deducciones` con `porcentaje=2.5`, `tipo='COMISION'`, apuntando a la leaf de "Comisiones Bancarias" de Banesco (no a la leaf plana desactivada)

### Requirement: Soft-deactivate, nunca DELETE físico (Slice 3)

El sistema MUST desactivar un concepto de deducción vía `is_active=0` (soft-deactivate). El sistema MUST NOT ofrecer ni ejecutar un DELETE físico de una fila de `metodo_cobro_deducciones`, siguiendo la convención del proyecto para tablas catálogo (`departamentos`, `productos`, `metodos_cobro`, etc.).

#### Scenario: SC-11 — Desactivar un concepto

- GIVEN una deducción activa vinculada a un método
- WHEN el usuario la desactiva desde la UI
- THEN la fila queda con `is_active=0` y deja de aplicarse en cierres futuros, pero sigue existiendo en la tabla

#### Scenario: SC-12 — Multi-tenant en gestión de deducciones

- GIVEN dos empresas distintas con métodos de pago propios
- WHEN un usuario de la Empresa A consulta las deducciones de sus métodos
- THEN solo ve filas con `empresa_id` igual a la de su usuario actual, nunca las de la Empresa B

---

## Capability: gastos-comisiones-bancarias-seed (auto-creación al registrar banco)

### Requirement: Auto-creación de 3 cuentas contables al crear un banco (Slice 2 — PR-2b)

(Previously: creaba 2 cuentas — activo + 1 comisión bancaria plana bajo `6.2.05`.)

Al crear un banco en `banco-form.tsx`, el sistema MUST crear automáticamente TRES cuentas, siempre las tres juntas, sin pasos manuales adicionales del usuario:

1. Cuenta de activo del banco (`1.1.xx`, patrón ya existente en `handleCrearCuentaContable`).
2. Cuenta de comisión BANCARIA, leaf bajo `Gastos Financieros > Comisiones Bancarias` (vía `agregarSubcuentaAGrupo`).
3. Cuenta BASE de comisión de PASARELA DE PAGO, leaf bajo `Gastos de Venta > Comisiones de Pasarelas de Pago` — una sola por banco.

Cada leaf de comisión (2 y 3) MUST nombrarse dinámicamente como `{Banco} {Tipo} {últimos 4 dígitos de numero_cuenta}` (ej. "Venezuela Corriente 5546"), incluyendo `Tipo` (Corriente/Ahorro) para desambiguar cuando los últimos 4 dígitos coinciden dentro del mismo banco. El sistema MUST vincular las 3 cuentas a `bancos_empresa` (cuenta de activo, cuenta de comisión bancaria y cuenta base de pasarela, en columnas separadas).

#### Scenario: SC-13 — Banco nuevo genera las 3 cuentas con nombre dinámico

- GIVEN el usuario completa el formulario de un banco nuevo "Banco de Venezuela", cuenta Corriente terminada en 5546
- WHEN guarda el formulario
- THEN se crean: la cuenta de activo `1.1.xx`, la leaf "Venezuela Corriente 5546" bajo `Comisiones Bancarias`, y la leaf "Venezuela Corriente 5546" bajo `Comisiones de Pasarelas de Pago`, ambas vinculadas a `bancos_empresa`

#### Scenario: SC-28 — Desambiguación cuando coinciden los últimos 4 dígitos

- GIVEN el mismo banco con dos cuentas propias, ambas terminadas en `5546` pero una Corriente y otra Ahorro
- WHEN se crean ambos bancos-registro
- THEN las leaves resultantes son "Venezuela Corriente 5546" y "Venezuela Ahorro 5546", sin colisión de nombre

#### Scenario: SC-14 — El usuario solo configura el porcentaje

- GIVEN un banco recién creado con sus 2 cuentas de comisión auto-vinculadas
- WHEN el usuario configura una deducción de tipo `COMISION` en un método de pago de ese banco
- THEN solo debe indicar el porcentaje — el destino (bancaria o pasarela, según corresponda al concepto) ya está resuelto por defecto

### Requirement: Ningún método de pago queda sin cuenta de comisión de pasarela vinculada (Slice 2/3 — PR-2b, NUEVO)

El sistema MUST garantizar que todo método de pago asociado a un banco tenga siempre una cuenta de comisión de pasarela resuelta. Si el método no especifica su propia cuenta de pasarela, MUST vincularse automáticamente a la cuenta BASE de pasarela de su banco (creada junto al banco). Múltiples métodos del mismo banco que no especifiquen cuenta propia MUST compartir esa misma cuenta base — no se crea una leaf nueva por método. Las deducciones adicionales (ej. retención ISLR) quedan fuera de este invariante: MUST configurarse manualmente por el usuario apuntando a una cuenta de gasto separada (capability `metodo-cobro-deducciones`); el sistema MUST NOT inferirlas automáticamente.

#### Scenario: SC-29 — Métodos creados junto al banco comparten la base de pasarela

- GIVEN el usuario crea el banco "Banco de Venezuela" y en el mismo flujo dos métodos POS ("Débito" y "Crédito") sin indicar cuenta propia
- WHEN se guardan ambos métodos
- THEN ambos quedan vinculados a la misma cuenta base de pasarela "Venezuela Corriente 5546" bajo `Comisiones de Pasarelas de Pago`

#### Scenario: SC-30 — Ningún método queda huérfano

- GIVEN un método de pago bancario nuevo sin cuenta de pasarela especificada por el usuario
- WHEN se guarda el método
- THEN el sistema lo vincula automáticamente a la cuenta base de pasarela de su banco — nunca queda sin cuenta de comisión de pasarela resuelta

#### Scenario: SC-31 — Deducción manual adicional no rompe el invariante

- GIVEN un método vinculado a la cuenta base de pasarela de su banco
- WHEN el usuario agrega manualmente una deducción `RET ISLR` apuntando a una cuenta de gasto distinta
- THEN el método conserva su vínculo a la cuenta base de pasarela para la deducción `COMISION`, y la deducción `ISLR` aplica sobre su propia cuenta, de forma independiente

### Requirement: UI para ver y reasignar las cuentas de comisión vinculadas (Slice 2 — PR-2b)

(Previously: solo mostraba/reasignaba 1 cuenta de comisión.)

`banco-form.tsx` MUST mostrar, de forma independiente, la cuenta de comisión BANCARIA y la cuenta BASE de comisión de PASARELA vinculadas a un banco, y MUST permitir reasignar cada una por separado a otra cuenta de tipo GASTO existente (filtrada vía `useCuentasDetallePorTipo('GASTO')`).

#### Scenario: SC-15 — Reasignar una de las cuentas de un banco existente

- GIVEN un banco con sus 2 cuentas de comisión ya vinculadas
- WHEN el usuario edita el banco y selecciona otra cuenta de gasto existente como destino de la comisión bancaria (sin tocar la de pasarela)
- THEN solo la cuenta de comisión bancaria se actualiza; la cuenta base de pasarela y las deducciones ya configuradas en métodos existentes no se ven afectadas

#### Scenario: SC-16 — Multi-tenant en auto-creación de cuentas de banco

- GIVEN dos empresas creando bancos con el mismo nombre y últimos 4 dígitos
- WHEN cada una guarda su banco
- THEN cada una obtiene sus propias leaves bajo `Comisiones Bancarias` y `Comisiones de Pasarelas de Pago`, scoped por `empresa_id`, sin colisión entre empresas

---

## Capability: caja (cierre aplica N deducciones por banco)

### Requirement: Loop de N deducciones independientes por método en el cierre (Slice 4)

Al cerrar una sesión de caja, `cerrarSesionCaja` MUST, por cada método de pago con deducciones activas en `metodo_cobro_deducciones`, iterar cada concepto (ordenado por `orden`) y aplicar su `porcentaje` sobre el monto base del método de forma independiente (no en cascada — cada porcentaje se calcula sobre el monto base original, no sobre el resultado del concepto anterior). El sistema MUST registrar un gasto por cada concepto, en la `cuenta_gasto_id` propia de esa fila (no en una clave global `COMISION_BANCARIA`).

#### Scenario: SC-17 — Método con 2 conceptos crea 2 gastos en 2 cuentas

- GIVEN un método "Tarjeta de Crédito Banesco" con 2 deducciones activas: `Comision bancaria` (3%) → cuenta banco, `Retencion ISLR` (5%) → cuenta ISLR
- WHEN se cierra la sesión con $1000 cobrados en ese método
- THEN se crean 2 gastos: uno de $30 en la cuenta de comisión de Banesco, otro de $50 en la cuenta de ISLR, ambos calculados sobre los $1000 originales

#### Scenario: SC-18 — Método efectivo con deducción mal configurada se ignora con warning

- GIVEN un método "Efectivo USD" que por error tiene una fila activa en `metodo_cobro_deducciones`
- WHEN se cierra la sesión
- THEN el sistema ignora esa deducción y emite el warning W5 existente, sin crear gasto ni bloquear el cierre

### Requirement: Atomicidad transaccional y tasa vigente (Slice 4)

Los N gastos generados por deducciones MUST crearse dentro de la misma `writeTransaction` de `cerrarSesionCaja`. Si algún paso del cierre falla, TODO el cierre (incluidas las N deducciones ya insertadas) MUST revertirse y la sesión MUST permanecer `ABIERTA`. El monto de cada deducción en Bs MUST usar la tasa de cambio vigente ya resuelta en el Paso 1 del cierre (fix de `tasaDelDia` ya corregido, fuera de este alcance).

#### Scenario: SC-19 — Rollback si falla un paso intermedio

- GIVEN un cierre con un método de 2 deducciones válidas y otro método sin destino de banco configurado
- WHEN el paso del método sin destino falla
- THEN ninguno de los gastos de deducciones se persiste, y `status` de la sesión permanece `ABIERTA`

#### Scenario: SC-20 — Tasa vigente disponible para comisión en Bs

- GIVEN un cierre con deducciones que requieren conversión a Bs
- WHEN se calcula el monto en Bs de cada deducción
- THEN se usa la tasa vigente ya resuelta en el Paso 1, sin fallar por tasa ausente (bug ya resuelto en Paso 1 previo a este cambio)

### Requirement: Visibilidad en Tesorería sin cambios (Slice 4)

Las comisiones y deducciones generadas por el cierre MUST seguir siendo visibles en Tesorería exactamente como hoy, con la única diferencia de que ahora aparecen N registros por método (uno por concepto) en vez de 1.

#### Scenario: SC-21 — Tesorería muestra N registros

- GIVEN un cierre que generó 2 gastos por deducciones para un mismo método
- WHEN el usuario consulta Tesorería
- THEN ve 2 registros de comisión/deducción distintos, cada uno en su respectiva cuenta, con la misma visibilidad que un registro único tenía antes

---

## Capability: gastos-comisiones-bancarias-seed (limpieza de datos de prueba)

### Requirement: Script de limpieza manual, borrado ordenado hijo→padre (Slice 1)

`migrations/cleanup_gastos_cxp_qol.sql` MUST borrar gastos y CxP en TODAS las empresas siguiendo el orden hijo→padre (`gasto_pagos` → `facturas_compra_det` → `retenciones_iva` → `retenciones_islr` → `notas_fiscales_compra_det` → `notas_fiscales_compra` → `movimientos_cuenta_proveedor` → `vencimientos_pagar` → `facturas_compra` → `gastos`), deshabilitando los triggers de inmutabilidad involucrados antes del borrado y rehabilitándolos al final. El script MUST excluir `movimientos_bancarios WHERE origen='MANUAL'` del borrado.

#### Scenario: SC-22 — Triggers deshabilitados y rehabilitados

- GIVEN el script de limpieza en ejecución
- WHEN se ejecutan los DELETE sobre tablas protegidas por triggers de inmutabilidad
- THEN los triggers están deshabilitados durante el borrado y quedan rehabilitados al finalizar el script, en el mismo orden documentado

#### Scenario: SC-23 — Movimientos MANUAL preservados

- GIVEN `movimientos_bancarios` con filas `origen='GASTO'`, `origen='PAGO_PROVEEDOR'` y `origen='MANUAL'`
- WHEN se ejecuta el script de limpieza
- THEN solo se borran las filas `origen IN ('GASTO','PAGO_PROVEEDOR')`; las filas `origen='MANUAL'` permanecen intactas

### Requirement: Recompute de saldos derivados, nunca reset (Slice 1)

El script MUST recalcular `bancos_empresa.saldo_actual` y `metodos_cobro.saldo_actual` como `SUM` sobre las filas remanentes de `movimientos_bancarios`/`movimientos_metodo_cobro` tras el borrado (alimentadas también por ventas/tesorería, que se preservan). El script MUST NOT resetear estos dos campos a 0. `proveedores.saldo_actual` (100% derivado de CxP) MUST resetearse a 0.

#### Scenario: SC-24 — Saldos recalculados coinciden con SUM manual

- GIVEN una empresa con movimientos de ventas/tesorería preservados y movimientos de gastos/CxP eliminados
- WHEN el script termina de ejecutarse
- THEN `bancos_empresa.saldo_actual` y `metodos_cobro.saldo_actual` son exactamente iguales al `SUM` manual sobre las filas remanentes de sus tablas de movimientos

#### Scenario: SC-25 — Datos no relacionados preservados

- GIVEN una empresa con ventas, inventario, Kardex, CxC, usuarios y configuración existentes
- WHEN se ejecuta el script de limpieza
- THEN ninguna de esas tablas/dominios se ve afectada — solo gastos/CxP y sus tablas compartidas con discriminador `origen`

### Requirement: Eliminación de la clave global y desactivación de leaves viejas (Slice 1)

El script MUST eliminar la fila `cuentas_config['COMISION_BANCARIA']` y MUST desactivar (`is_active=false`) las leaves `6.2.01` y `6.2.03`, en ese orden (la eliminación de la clave global libera el trigger `protect_plan_cuentas` que de otro modo bloquearía la desactivación).

#### Scenario: SC-26 — Desactivación de leaves viejas tras liberar la clave

- GIVEN `cuentas_config['COMISION_BANCARIA']` apuntando a `6.2.03`
- WHEN el script borra esa fila y luego intenta `UPDATE plan_cuentas SET is_active=false WHERE codigo IN ('6.2.01','6.2.03')`
- THEN la actualización sucede sin ser bloqueada por `protect_plan_cuentas`

### Requirement: Respaldo obligatorio previo a la ejecución (Slice 1)

El script MUST incluir en su cabecera la instrucción de ejecutar `pg_dump` de las tablas afectadas antes de correrlo. El script es NO reversible sin ese respaldo — es una salvaguarda obligatoria, no opcional.

#### Scenario: SC-27 — Advertencia de respaldo obligatorio

- GIVEN un operador a punto de ejecutar `cleanup_gastos_cxp_qol.sql`
- WHEN abre el archivo antes de ejecutarlo
- THEN encuentra en la cabecera la instrucción explícita de correr `pg_dump` de las tablas listadas antes de proceder

---

## Out of Scope

- Cualquier tabla o dominio fuera del scope guard indicado al inicio del documento (obs #705): `ventas*`, inventario/Kardex, `clientes`/CxC, `usuarios`/roles/permisos. PR-2b no toca ninguna de estas.
- Contabilidad real con partida doble formal o conciliación fiscal — este registro sigue siendo un registro QoL, no un módulo contable.
- Vinculación de deducciones tipo `ISLR` (u otro) a impuestos o anticipos fiscales reales — no hay default automático de `ISLR`; si el usuario agrega manualmente un concepto de ese tipo, va directo a la cuenta de gasto que el usuario elija, como cualquier otro concepto.
- Fix de `tasaDelDia` en `useTasaDelDia`/`FormCierre` — ya resuelto en el Paso 1 (commits `db0417b`, `1e3a603`, `4fc9808`), fuera de este cambio.
- Correlativo secuencial de sesiones de caja, rediseño de conciliación bancaria, o cualquier tema no listado en `task.md`.
