# Spec: Gastos — Registro QoL (Comisiones Bancarias N-conceptos)

> Change: `gastos-registro-qol`
> Date: 2026-07-28
> Capabilities: `gastos-comisiones-bancarias-seed` (New) · `metodo-cobro-deducciones` (New)
> Modifies (by reference, no literal block-copy — no spec principal existe todavía para `contabilidad`/`configuracion/bancos`):
> `openspec/specs/caja/spec.md` (cierre de sesión, `cerrarSesionCaja`) · configuración de bancos (`banco-form.tsx`)

---

## Capability: gastos-comisiones-bancarias-seed

### Requirement: Creación idempotente del subgrupo 6.2.05 (Slice 1)

La migración 0080 MUST agregar el subgrupo `6.2.05 COMISIONES BANCARIAS` (nivel 3, `es_cuenta_detalle=false`) como hijo del grupo ya existente `6.2 GASTOS NO OPERACIONALES`, reutilizando el patrón `ON CONFLICT (empresa_id, codigo) DO NOTHING` de `seed_plan_cuentas`. Las leaves existentes `6.2.01 GASTOS FINANCIEROS` y `6.2.03 COMISION BANCARIA` MUST NOT ser modificadas (código, nivel, `es_cuenta_detalle`) por esta migración — permanecen intactas hasta que el script de limpieza las desactive.

#### Scenario: SC-01 — Empresa nueva obtiene el subgrupo

- GIVEN una empresa creada después de aplicar la migración 0080
- WHEN se ejecuta `seed_plan_cuentas` para esa empresa
- THEN existe la cuenta `6.2.05 COMISIONES BANCARIAS` con `es_cuenta_detalle=false`, hija de `6.2`

#### Scenario: SC-02 — Empresa existente obtiene el subgrupo vía backfill

- GIVEN una empresa creada antes de la migración 0080, con `6.2.01`/`6.2.03` ya posteadas
- WHEN se ejecuta el backfill de 0080 (`SELECT seed_plan_cuentas(id, NULL) FROM empresas`)
- THEN la empresa obtiene `6.2.05` sin alterar `6.2.01` ni `6.2.03`

#### Scenario: SC-03 — Re-ejecución no duplica

- GIVEN una empresa que ya tiene `6.2.05` (por 0080 ya aplicada)
- WHEN la migración o el backfill se ejecuta de nuevo
- THEN `ON CONFLICT (empresa_id, codigo) DO NOTHING` evita crear una fila duplicada

#### Scenario: SC-04 — Códigos inmutables no se alteran

- GIVEN `6.2.01` y `6.2.03` con gastos históricos posteados
- WHEN se aplica la migración 0080 completa
- THEN `6.2.01`/`6.2.03` conservan su `codigo`, `nivel` e `is_active=true` sin cambios (regla de negocio #5)

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

### Requirement: Defaults por tipo de método al crear (Slice 3)

Al crear un método de pago, el sistema MUST precargar deducciones por defecto según el tipo: PUNTO → 2 slots al 0%; transferencia/otros bancarios → 1 slot al 0%; tarjeta de crédito → 1 slot con `tipo='ISLR'` y `porcentaje=5`. Todos los defaults MUST quedar editables por el usuario antes o después de guardar.

#### Scenario: SC-07 — Defaults de método PUNTO

- GIVEN la creación de un nuevo método de pago con `tipo='PUNTO'`
- WHEN se guarda el método
- THEN se precargan 2 filas en `metodo_cobro_deducciones` con `porcentaje=0`

#### Scenario: SC-08 — Defaults de tarjeta de crédito

- GIVEN la creación de un nuevo método de pago con `tipo='TARJETA_CREDITO'`
- WHEN se guarda el método
- THEN se precarga 1 fila con `tipo='ISLR'` y `porcentaje=5`

#### Scenario: SC-09 — Método sin banco no ofrece deducciones bancarias

- GIVEN un método de pago que no tiene `banco_empresa_id` asociado (p. ej. EFECTIVO)
- WHEN el usuario abre la sección de deducciones para ese método
- THEN el sistema no ofrece agregar conceptos de deducción bancaria (regla de dominio: solo métodos bancarios generan comisión — obs #638)

### Requirement: Backfill desde comision_pct (Slice 1)

La migración 0080 MUST migrar cada `metodos_cobro` con `comision_pct > 0` y `banco_empresa_id IS NOT NULL` a una fila de `metodo_cobro_deducciones` con `concepto='Comision bancaria'`, `tipo='COMISION'`, `porcentaje=comision_pct` y `cuenta_gasto_id` apuntando a la leaf `6.2.05.NN` del banco correspondiente. `metodos_cobro.comision_pct` MUST NOT eliminarse en esta migración (queda deprecado, comentario en schema).

#### Scenario: SC-10 — Backfill de método existente con comisión

- GIVEN un método "Tarjeta Débito Banesco" con `comision_pct=2.5` y banco asociado
- WHEN se ejecuta el backfill de 0080
- THEN existe una fila en `metodo_cobro_deducciones` con `porcentaje=2.5`, `tipo='COMISION'`, apuntando a la leaf de comisión de Banesco

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

### Requirement: Auto-creación de cuenta de activo y cuenta de comisión al crear un banco (Slice 2)

Al crear un banco en `banco-form.tsx`, el sistema MUST crear automáticamente su cuenta de activo (`1.1.xx`, patrón ya existente en `handleCrearCuentaContable`) Y su cuenta de comisión (`6.2.05.NN COMISION BANCO {nombre}`, leaf bajo `6.2.05`, vía `agregarSubcuentaAGrupo`), y MUST setear `bancos_empresa.cuenta_gasto_comision_id` con esa nueva cuenta — sin pasos manuales adicionales del usuario.

#### Scenario: SC-13 — Banco nuevo genera ambas cuentas

- GIVEN el usuario completa el formulario de un banco nuevo llamado "Mercantil"
- WHEN guarda el formulario
- THEN se crean la cuenta de activo `1.1.xx` Y la cuenta `6.2.05.NN COMISION BANCO MERCANTIL`, y `bancos_empresa.cuenta_gasto_comision_id` queda vinculada a esta última

#### Scenario: SC-14 — El usuario solo configura el porcentaje

- GIVEN un banco recién creado con su cuenta de comisión auto-vinculada
- WHEN el usuario configura un método de pago de ese banco
- THEN solo debe indicar el porcentaje de la deducción — la cuenta de destino ya está resuelta por defecto

### Requirement: UI para ver y reasignar la cuenta de comisión vinculada (Slice 2)

`banco-form.tsx` MUST mostrar la cuenta de comisión actualmente vinculada a un banco y MUST permitir reasignarla a otra cuenta de tipo GASTO existente (filtrada vía `useCuentasDetallePorTipo('GASTO')`).

#### Scenario: SC-15 — Reasignar la cuenta de comisión de un banco existente

- GIVEN un banco con su cuenta de comisión ya vinculada
- WHEN el usuario edita el banco y selecciona otra cuenta de gasto existente como destino de comisión
- THEN `bancos_empresa.cuenta_gasto_comision_id` se actualiza a la nueva cuenta seleccionada, sin afectar deducciones ya configuradas en métodos existentes

#### Scenario: SC-16 — Multi-tenant en auto-creación de cuentas de banco

- GIVEN dos empresas creando bancos con el mismo nombre
- WHEN cada una guarda su banco
- THEN cada una obtiene su propia leaf `6.2.05.NN` bajo su propio subgrupo `6.2.05`, scoped por `empresa_id`, sin colisión entre empresas

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

- Contabilidad real con partida doble formal o conciliación fiscal — este registro sigue siendo un registro QoL, no un módulo contable.
- Vinculación de la deducción ISLR de tarjetas de crédito a impuestos o anticipos fiscales — va directo a Gastos > Comisiones Bancarias como cualquier otro concepto.
- Fix de `tasaDelDia` en `useTasaDelDia`/`FormCierre` — ya resuelto en el Paso 1 (commits `db0417b`, `1e3a603`, `4fc9808`), fuera de este cambio.
- Correlativo secuencial de sesiones de caja, rediseño de conciliación bancaria, o cualquier tema no listado en `task.md`.
