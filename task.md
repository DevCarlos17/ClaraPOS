📄 MANUAL TÉCNICO: LÓGICA DE CONTROL Y ARQUEO DE EFECTIVO
(POS)

1. Arquitectura Base: El Libro de Movimientos de Caja (Cash Ledger)
   Para garantizar la integridad y auditoría de los fondos, la gestión de efectivo NO debe
   calcularse dinámicamente sumando facturas. Se debe implementar una tabla transaccional
   (ej. cash_session_transactions) que registre todo flujo de entrada y salida como un
   registro inmutable (Patrón Event Sourcing).
   Campos mínimos requeridos en la tabla:
   ● session_id: ID de la sesión de caja abierta.
   ● currency: Moneda de la transacción (USD o VES).
   ● type: Dirección del flujo (IN o OUT).
   ● category: Origen del movimiento (INITIAL_FUND, SALE_CASH_IN, CHANGE_OUT,
   MANUAL_EXPENSE, ADVANCE_OUT, LOAN_OUT, MANUAL_IN).
   ● amount: Monto absoluto del movimiento.
   ● exchange_rate: Tasa de cambio vigente al momento exacto de la operación
   (crucial para auditoría histórica).
   ● reference_id: ID de la factura, pago móvil, o comprobante asociado (para
   trazabilidad cruzada).
2. Lógica de Cobro Mixto y Vueltos (El Caso de Uso Crítico)
   Cuando un cliente paga con un monto mayor al de la deuda, el sistema debe registrar
   múltiples eventos en la sesión de caja, desglosando la moneda de pago y la moneda de
   vuelto.
   Ejemplo Práctico: Venta de $4.5. Cliente paga con $5 en efectivo. Vuelto de $0.5 pagado
   en VES (Tasa: 500). El sistema debe insertar dos registros en
   cash_session_transactions:
3. IN | SALE_CASH_IN | USD | Monto: 5.00 | Ref: Factura_001
4. OUT| CHANGE_OUT | VES | Monto: 250.00 | Ref: Factura_001
   Nota para Backend: El cálculo en vivo del efectivo actual en gaveta es simplemente un
   SUM(amount) donde los IN son positivos y los OUT son negativos, filtrado por currency.
5. Fórmulas Estrictas para el Arqueo de Caja (Cierre de Sesión)
   Al momento del cierre, el sistema debe mostrar el saldo esperado por cada moneda por
   separado. Las fórmulas para el motor de cálculo son:
   Saldo Esperado en USD ($): Fondo Inicial USD + Pagos Recibidos en
   Efectivo USD (Monto Entregado) + Ingresos Manuales USD - Egresos
   Manuales USD - Avances Entregados en USD - Préstamos en USD - Vueltos
   Entregados en USD
   Saldo Esperado en VES (Bs): Fondo Inicial VES + Pagos Recibidos en
   Efectivo VES (Monto Entregado) + Ingresos Manuales VES - Egresos
   Manuales VES - Avances Entregados en VES - Préstamos en VES - Vueltos
   Entregados en VES
6. Validaciones Críticas y Seguridad (Anti-Tampering)
   Para prevenir errores humanos o fraude, el sistema debe aplicar las siguientes validaciones
   duras en el backend:
   ● Bloqueo de Saldo Negativo: El sistema no debe permitir registrar un vuelto,
   egreso, avance o préstamo en efectivo si el Monto Solicitado > (Fondo
   Inicial + Entradas Acumuladas - Salidas Acumuladas) en esa
   moneda específica. (Ej: No puedes dar vuelto de $1 si la gaveta de USD está en
   cero, incluso si hay Bs de sobra).
   ● Bloqueo de Avances (Cross-Check): Un registro de categoría ADVANCE_OUT en
   efectivo debe requerir obligatoriamente el reference_id de un pago digital
   (Punto/Pago Móvil) procesado exitosamente por un monto igual o superior
   (incluyendo el % de comisión si aplica).
   ● Trazabilidad de Préstamos: Todo LOAN_OUT en efectivo debe tener asociado el
   user_id de quien lo autoriza (Supervisor) y el ID del destinatario.
   ● Cierre Inmutable: Al cerrar la sesión, se debe guardar un Snapshot (foto) de los
   saldos esperados versus los saldos reales declarados por la cajera. La diferencia
   (Sobrante/Faltante) se registra, y la sesión pasa a estado CLOSED, desactivando
   cualquier inserción futura bajo ese session_id.
   SUGERENCIA DE UX/UI: EL MODAL DE PAGO "SPLIT-TENDER"
   Cuando la cajera presiona "Cobrar", no debe ver un solo campo de texto estático. Debe
   aparecer un modal (una ventana emergente) dinámico enfocado en el "Saldo Restante".
7. La Estructura Visual del Modal de Cobro
   Divide la pantalla de cobro en dos zonas claramente diferenciadas:
   ● Zona Izquierda (El Resumen en Vivo):
   ○ Total a Pagar: $10.00 (Bs 5,000)
   ○ Total Recibido: $0.00
   ○ Saldo Restante (Rojo): $10.00 (Bs 5,000)
   ○ Vuelto (Verde): $0.00
   ● Zona Derecha (El Agregador de Pagos):
   ○ Un selector de "Método de Pago" (Efectivo USD, Efectivo VES, Punto de
   Venta, Pago Móvil, Zelle).
   ○ Un campo de "Monto a Ingresar".
   ○ Un botón gigante de "Agregar Pago" (+).
8. El Flujo "A Prueba de Tontos" (Ejemplo Práctico)
   Imagina que la factura es de $10. El cliente dice: "Te doy $5 en efectivo y el resto por Pago
   Móvil".
9. Paso 1: La cajera selecciona "Efectivo USD" en la zona derecha. El sistema
   autocompleta el campo de monto con el saldo restante ($10.00) por defecto para
   ahorrar clics.
10. Paso 2: La cajera borra el $10.00, escribe $5.00 y le da a "Agregar Pago".
11. Paso 3: ¡Magia en pantalla! La Zona Izquierda se actualiza al instante:
    ○ Aparece una lista: 1. Efectivo USD - $5.00 ❌ (botón para
    eliminar si se equivocó)
    ○ Saldo Restante: Baja a $5.00 (Bs 2,500).
12. Paso 4: La cajera selecciona "Pago Móvil (VES)". El sistema autocompleta el campo
    con Bs 2,500 (el equivalente exacto al saldo restante).
13. Paso 5: Ella ingresa la referencia del banco, le da a "Agregar Pago".
14. Paso 6: El "Saldo Restante" llega a $0.00. Solo en este momento, el botón final de
    "Procesar Factura y Cerrar" se habilita.
15. El Manejo del Vuelto Multimoneda (La Cereza del Pastel)
    ¿Qué pasa si el cliente paga con un billete de $20 una cuenta de $15?
    ● La cajera selecciona "Efectivo USD" e ingresa $20.00.
    ● El sistema detecta que el "Total Recibido" supera al "Total a Pagar".
    ● El campo Saldo Restante se vuelve cero.
    ● El campo Vuelto se enciende en verde: $5.00.
    ● AQUÍ ESTÁ EL TRUCO: Automáticamente, debajo del vuelto, aparece un selector
    obligatorio que dice: "¿Cómo entregarás el vuelto?". Con dos opciones: Efectivo
    USD ($5.00) o Efectivo VES (Bs 2,500).
    Tasas Congeladas: Cuando se abre el modal de cobro, la tasa de cambio de esa
    transacción se "congela" en la memoria del frontend, para que no haya descuadres si la
    tasa del sistema se actualiza justo en los 30 segundos que tarda la cajera en cobrar.
