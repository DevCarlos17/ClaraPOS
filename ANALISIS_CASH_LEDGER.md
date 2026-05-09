# Analisis: Arquitectura Cash Ledger vs Estado Actual ClaraPOS

**Referencia**: `task.md` (manual tecnico de control y arqueo de efectivo)
**Fecha de analisis**: 2026-05-09

---

## Tabla Comparativa: Brechas y Acciones Requeridas

| # | Concepto (task.md) | Estado Actual en ClaraPOS | Brecha | Accion Requerida | Impacto |
|---|---|---|---|---|---|
| **1** | **Tabla `cash_session_transactions` con Event Sourcing** — Cada flujo de caja se registra como evento inmutable con: `session_id`, `currency`, `type (IN/OUT)`, `category`, `amount`, `exchange_rate`, `reference_id` | Existe `movimientos_metodo_cobro` (similar) y `pagos`. Sin embargo, estan orientados a `metodo_cobro_id` y no rastrean moneda por separado (USD vs VES) de forma nativa | **Alta** — No hay un ledger unificado por divisa. La conversion a USD diluye la separacion bimonetaria en el libro de caja | Crear tabla `cash_session_transactions` con las columnas exactas del spec. Migrar los origenes actuales (INGRESO_MANUAL, EGRESO_MANUAL, AVANCE, PRESTAMO) a categorias del spec (MANUAL_IN, MANUAL_EXPENSE, ADVANCE_OUT, LOAN_OUT). Agregar SALE_CASH_IN y CHANGE_OUT como categorias nuevas | **Critico** — Afecta toda la arquitectura de caja |
| **2** | **Categoria `SALE_CASH_IN`** — Cada cobro en efectivo de una venta debe insertarse como evento IN en el ledger, separado por moneda | Los pagos en efectivo se insertan en `pagos` (inmutable) y actualizan `metodos_cobro.saldo_actual` via trigger. No hay un evento explicito `SALE_CASH_IN` en el ledger de caja | **Media** — El dato existe en `pagos` pero no es visible en el ledger de sesion como evento atomico categorizado | Al registrar un pago en EFECTIVO, insertar adicionalmente en `cash_session_transactions` con `category=SALE_CASH_IN`, `currency` = moneda del pago, `amount` = monto en moneda nativa, `exchange_rate` fotografia del momento | **Alto** |
| **3** | **Categoria `CHANGE_OUT` — El vuelto se registra como evento OUT** en la moneda en que se entrega (puede diferir del pago) | **NO EXISTE**. El vuelto es solo calculo visual en la UI. No se persiste ningun registro del vuelto entregado ni de su moneda | **Critica** — Gap de auditoria: no hay rastro del dinero que sale de la gaveta como cambio. El saldo esperado queda sobreestimado | Implementar: (a) Selector obligatorio de moneda de vuelto en el modal de cobro cuando `monto_pagado > total_venta`; (b) Insertar registro `CHANGE_OUT` en `cash_session_transactions` con la moneda y monto real del vuelto | **Critico** |
| **4** | **Saldo esperado por moneda (USD y VES independientes)** — Formulas separadas: `Fondo Inicial + Ingresos - Egresos - Vueltos` por cada divisa | El `monto_sistema_usd` convierte todo a USD para un unico total. El BS solo se registra en apertura (`monto_apertura_bs`) pero no se rastrea su balance durante la sesion | **Alta** — No es posible saber cuanto BS debe haber en gaveta en un momento dado. Solo se conoce el total en USD | Agregar a `sesiones_caja` los campos `monto_sistema_bs` y `monto_fisico_bs`. Calcular el balance VES de forma independiente usando `cash_session_transactions WHERE currency = 'VES'` | **Alto** |
| **5** | **Modal de cobro Split-Tender con "Saldo Restante" en vivo** — Zona izquierda (resumen en tiempo real: Total, Recibido, Restante, Vuelto) + Zona derecha (selector metodo + monto + boton Agregar Pago). Lista de pagos agregados con boton X para eliminar | El sistema tiene pagos multiples pero la UX especifica del spec (dos zonas, lista con X, saldo restante dinamico que baja con cada pago agregado) no esta verificada como implementada con este diseno exacto | **Media** — El flujo funcional existe pero la UX descrita en task.md es mas explicita y a prueba de errores | Revisar y ajustar el modal de cobro del POS para que: (a) muestre Saldo Restante actualizado en tiempo real al agregar cada pago; (b) tenga lista de pagos con boton de eliminar; (c) auto-complete el campo monto con el saldo restante al seleccionar metodo; (d) boton "Procesar" deshabilitado hasta Saldo Restante = $0 | **Alto** |
| **6** | **Selector de moneda del vuelto (obligatorio)** — Si `Total Recibido > Total a Pagar`, aparece selector: "Como entregars el vuelto? Efectivo USD / Efectivo VES" | **NO EXISTE**. El vuelto se muestra en pantalla pero el cajero decide internamente la moneda sin registrarlo | **Alta** — Sin este selector no se puede registrar el CHANGE_OUT en la moneda correcta, y el saldo por divisa queda incorrecto | Agregar al modal de cobro: cuando se detecta vuelto, renderizar obligatoriamente el selector de moneda del vuelto antes de permitir "Procesar Factura". El valor seleccionado determina el `currency` del evento CHANGE_OUT | **Critico** |
| **7** | **Tasa de cambio "congelada" al abrir el modal** — La tasa del momento en que se abre el modal de cobro se fija en memoria para toda la transaccion. Si la tasa global cambia en esos 30 segundos, no afecta la operacion en curso | La tasa se carga de `tasas_cambio` al iniciar la UI del POS, pero si el modal de cobro consulta la tasa en tiempo real o si hay re-renders que la recargan, puede haber descuadre | **Media** — Riesgo bajo en practica pero el spec lo exige explicitamente para auditorias limpias | En el componente del modal de cobro, capturar la tasa vigente en `useRef` o `useState` en el momento exacto de apertura del modal (`onOpen`). Usar ese valor frozen para todos los calculos internos del modal, sin actualizar aunque la tasa cambie | **Medio** |
| **8** | **Validacion anti-negativo por divisa** — El sistema no debe permitir registrar CHANGE_OUT, MANUAL_EXPENSE, ADVANCE_OUT, LOAN_OUT si el monto > saldo actual en ESA moneda especifica. No compensar entre divisas | El sistema calcula saldo en USD unificado. No hay validacion que impida dar vuelto en VES si el saldo VES es cero, aunque haya dolares de sobra | **Alta** — Permite dar vuelto o hacer egresos en una moneda aunque la gaveta de esa moneda este vacia, lo cual es fisicamente imposible | Implementar funcion `getSaldoActualPorMoneda(session_id, currency)` que haga SUM del ledger por divisa. Llamar esta funcion antes de registrar cualquier salida de caja y bloquear con error si `monto_solicitado > saldo_disponible_en_esa_moneda` | **Critico** |
| **9** | **Bloqueo de Avances (Cross-Check)** — Un ADVANCE_OUT requiere obligatoriamente el `reference_id` de un pago digital (Punto/Pago Movil) procesado exitosamente por monto igual o mayor | Los avances se registran en `movimientos_metodo_cobro` con `origen=AVANCE` pero no requieren referenciar un pago digital previo como prerequisito | **Media** — Permite registrar avances sin verificar que el equivalente digital exista, lo que puede facilitar fraude | En el formulario de movimiento manual tipo AVANCE: agregar campo obligatorio `reference_id` con lookup de pagos digitales de la sesion. Validar en backend que el pago referenciado existe y su monto cubre el avance | **Alto** |
| **10** | **Trazabilidad de Prestamos** — Todo LOAN_OUT debe registrar `user_id` del supervisor que lo autoriza y el ID del destinatario | Los prestamos (`PRESTAMO`) se registran pero el esquema actual de `movimientos_metodo_cobro` no tiene campos `autorizado_por_user_id` ni `destinatario_id` | **Media** — Datos de auditoria de prestamos incompletos. No se puede saber quien autorizo ni a quien se le presto | Agregar a la tabla `movimientos_metodo_cobro` (o a `cash_session_transactions`) los campos `autorizado_por_id` (FK usuarios) y `destinatario_id`. Hacerlos obligatorios cuando `origen=PRESTAMO`. Requerir PIN/confirmacion de supervisor al registrar | **Medio** |
| **11** | **Snapshot inmutable al cerrar sesion** — Al cerrar, se guarda foto de saldos esperados vs declarados por el cajero. La sesion pasa a CLOSED y ninguna insercion futura es posible bajo ese session_id | `sesiones_caja` registra `monto_sistema_usd`, `monto_fisico_usd`, `diferencia_usd` y cambia status a CERRADA. Sin embargo, el cuadre formal (supervisor) ocurre despues y puede modificar el conteo fisico post-cierre | **Baja** — La estructura base existe. Falta: (a) garantizar que una sesion CERRADA/CUADRADA no acepte nuevas inserciones en `cash_session_transactions`; (b) hacer el snapshot separado por divisa (USD y VES) | Agregar trigger `validate_sesion_cerrada` que rechace INSERT en `cash_session_transactions` si `sesion_caja.status != 'ABIERTA'`. Agregar columnas `snapshot_expected_usd`, `snapshot_expected_ves`, `snapshot_declared_usd`, `snapshot_declared_ves` a `sesiones_caja` | **Medio** |
| **12** | **Categorias del ledger estandarizadas** — INITIAL_FUND, SALE_CASH_IN, CHANGE_OUT, MANUAL_EXPENSE, ADVANCE_OUT, LOAN_OUT, MANUAL_IN | Categorias actuales en `movimientos_metodo_cobro.origen`: VENTA, PAGO_CXC, DEPOSITO_BANCO, RETIRO, AJUSTE, APERTURA_CAJA, CIERRE_CAJA, INGRESO_MANUAL, EGRESO_MANUAL, AVANCE, PRESTAMO. Faltan SALE_CASH_IN, CHANGE_OUT | **Media** — Nomenclatura diferente y categorias del spec ausentes. Dificultad para reportes auditables con el lenguaje del spec | Mapear o renombrar: INGRESO_MANUAL → MANUAL_IN, EGRESO_MANUAL → MANUAL_EXPENSE, AVANCE → ADVANCE_OUT, PRESTAMO → LOAN_OUT, APERTURA_CAJA → INITIAL_FUND. Agregar SALE_CASH_IN y CHANGE_OUT como nuevas categorias | **Medio** |

---

## Resumen de Prioridades

### Critico (Implementar primero — afecta integridad de datos)
1. **Registro de CHANGE_OUT** — El vuelto entregado debe persistirse como evento
2. **Selector de moneda del vuelto** en el modal de cobro
3. **Validacion anti-negativo por divisa** — Bloquear egresos en moneda sin saldo
4. **Ledger por divisa** — Saldo esperado USD y VES de forma independiente

### Alto (Segunda iteracion — mejora auditoría)
5. Tabla `cash_session_transactions` como ledger unificado (o extender `movimientos_metodo_cobro`)
6. Evento `SALE_CASH_IN` en el ledger al cobrar en efectivo
7. UX del modal Split-Tender segun el spec (saldo restante, lista de pagos, boton X)
8. Cross-check de Avances contra pagos digitales

### Medio (Tercera iteracion — trazabilidad y cierre)
9. Tasa congelada al abrir modal
10. Trazabilidad de prestamos (autorizado_por + destinatario)
11. Snapshot inmutable por divisa en cierre de sesion
12. Estandarizacion de categorias del ledger

---

## Lo que ya esta bien implementado

| Concepto | Estado |
|---|---|
| Sesiones de caja con apertura/cierre | Implementado (`sesiones_caja`) |
| Inmutabilidad de pagos (no UPDATE/DELETE) | Implementado (triggers) |
| Foto de tasa por transaccion | Implementado (`pagos.tasa`) |
| Movimientos manuales de caja (ingresos y egresos) | Implementado (`movimientos_metodo_cobro`) |
| Fondo inicial bimonetario | Implementado (`monto_apertura_usd` + `monto_apertura_bs`) |
| Desglose por metodo de pago en cierre | Implementado (`sesiones_caja_detalle`) |
| Multi-pago en una venta (conceptual) | Implementado |
| Supervisor puede revisar y hacer override con PIN | Implementado |
