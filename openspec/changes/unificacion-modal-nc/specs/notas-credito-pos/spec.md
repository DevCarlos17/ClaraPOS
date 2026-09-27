# Delta for notas-credito-pos

## ADDED Requirements

### Requirement: Orden del flujo tras revelar la sección de NC en POS

Tras presionar "Emitir nota de crédito", el sistema MUST mostrar el contenido en este orden: (1) selección de depósito de reingreso (con la lógica de PIN B existente sin cambios), (2) botones Total/Parcial, (3) si se elige Parcial, la sub-sección "artículos a devolver" (`SeleccionLineasNc`) MUST aparecer INMEDIATAMENTE debajo de los botones Total/Parcial, (4) gestión de vueltos + concepto (ver requirement siguiente). Este orden reemplaza el orden previo (Tipo de NC → Modalidad de liquidación → Depósito → Motivo).

#### Scenario: Depósito aparece antes que Total/Parcial

- GIVEN la sección de NC recién revelada
- WHEN el cajero observa el contenido
- THEN la selección de depósito de reingreso aparece primero, antes de los botones Total/Parcial

#### Scenario: Artículos a devolver aparecen debajo de Total/Parcial

- GIVEN el cajero eligió Parcial
- WHEN la sección se renderiza
- THEN "artículos a devolver" aparece inmediatamente debajo de los botones Total/Parcial, antes de cualquier otro contenido

#### Scenario: Gestión de vueltos aparece después de elegir tipo

- GIVEN ningún tipo elegido aún
- WHEN el cajero no ha presionado Total ni Parcial
- THEN la sección de gestión de vueltos + concepto no es visible

### Requirement: Gestión de vueltos en POS — Devolver dinero y Crédito a favor

Tras elegir Total o Parcial, el sistema MUST ofrecer en POS las mismas dos opciones que en admin: "Devolver dinero" y "Crédito a favor", con las MISMAS validaciones (filas completas antes de confirmar, límite de caja/saldo disponible por cuenta, mensajes de warning, reconocimiento de moneda nativa por cuenta). "Devolver dinero" en POS MUST permitir como origen: la sesión activa propia del cajero (directo, sin PIN adicional) O una cuenta de Tesorería (requiere re-ingresar el PIN de supervisor). `RefundTesoreriaForm` MUST reusarse sin cambios propios para el sub-formulario de Tesorería.

#### Scenario: Ambas opciones visibles en POS

- GIVEN Total o Parcial ya elegido
- WHEN el cajero observa la sección de vueltos
- THEN ve "Devolver dinero" y "Crédito a favor", igual que en admin

#### Scenario: Origen sesión propia no exige PIN adicional

- GIVEN "Devolver dinero" elegido
- WHEN el cajero selecciona su propia sesión activa como origen
- THEN el sistema no solicita un PIN adicional para ese origen

#### Scenario: Origen Tesorería exige PIN

- GIVEN "Devolver dinero" elegido
- WHEN el cajero selecciona una cuenta de Tesorería como origen
- THEN el sistema exige re-ingresar el PIN de supervisor antes de mostrar el mini-formulario de cuenta/monto

#### Scenario: Fila incompleta bloquea la confirmación

- GIVEN el mini-formulario de Tesorería con al menos una línea sin cuenta o sin monto
- WHEN el cajero intenta confirmar
- THEN el sistema bloquea la confirmación, igual que en admin

#### Scenario: Límite de caja bloquea el monto excedente

- GIVEN un monto ingresado que excede el saldo disponible de la cuenta o el total de la NC
- WHEN el cajero intenta confirmar
- THEN el sistema rechaza el monto con el mismo mensaje de warning que admin

#### Scenario: Reconocimiento de moneda por cuenta

- GIVEN una cuenta de Tesorería en una moneda distinta a USD
- WHEN el cajero ingresa un monto para esa cuenta
- THEN el sistema lo interpreta y muestra en la moneda nativa de esa cuenta, igual que en admin

### Requirement: Invariante de cuadre y alcance de sesión preservados tras compartir UI

La unificación del componente de UI entre POS y admin MUST NOT alterar qué NC afecta el cuadre de una sesión ni el alcance de facturas visibles en POS: ese comportamiento sigue determinado exclusivamente por `entryPoint`/`sesionCajaActivaId`/`modalidad` recibidos por el motor, nunca por la forma o el componente de UI que los originó.

#### Scenario: NC POS sigue afectando el cuadre de su sesión pese a compartir UI

- GIVEN el componente de UI ahora compartido con admin, usado desde POS
- WHEN se emite una NC con salida real de efectivo/tarjeta de la sesión activa
- THEN el cuadre de esa sesión la refleja, exactamente igual que antes de compartir UI

#### Scenario: NC admin sigue sin aparecer en el cuadre de ninguna sesión

- GIVEN el componente de UI compartido, usado desde la ruta administrativa
- WHEN se emite una NC vía `AJUSTE_CXC`, `SALDO_FAVOR` o `REFUND_TESORERIA`
- THEN ninguna sesión de caja refleja esa NC en su cuadre, salvo el egreso Fase 2 ya existente (`origen='NCR'`)

#### Scenario: POS sigue sin ofrecer selección cross-session

- GIVEN el componente de UI compartido con admin (que sí permite elegir cualquier factura de la empresa)
- WHEN se usa desde POS
- THEN el listado de facturas sigue limitado a la sesión activa del cajero, sin opción de elegir facturas de otra sesión

## MODIFIED Requirements

### Requirement: Reveal-gate de la sección de emisión de NC

Al seleccionar una factura, el sistema MUST mostrar únicamente su detalle fiscal (artículos, base imponible, IVA, total, métodos de pago) y un pie con tres acciones: `Volver`, `Reimprimir`, `Emitir nota de crédito`. La sección NC (depósito de reingreso, Tipo de nota de crédito, artículos a devolver si Parcial, gestión de vueltos con concepto) MUST permanecer oculta hasta presionar "Emitir nota de crédito"; al presionarlo se revela — en el orden descrito en "Orden del flujo tras revelar la sección de NC en POS" — y el pie se reduce a `[Volver, Editar métodos de pago]` (ver requirement "Pie del modal tras revelar la sección de NC"), con la confirmación de la NC ubicada dentro de la propia sección revelada. El gate MUST resetear al cambiar de factura, cerrar el panel, o presionar `Volver`. `Volver` MUST ser de una sola etapa: siempre retorna al estado vacío de selección.
(Previously: la sección enumeraba "Tipo de nota de crédito, modalidad de liquidación, depósito de reingreso, motivo de anulación, alerta irreversible" sin orden explícito.)

#### Scenario: Selección inicial solo muestra detalle y pie de tres acciones

- GIVEN una sesión de caja activa con facturas listadas
- WHEN el cajero selecciona una factura
- THEN el panel muestra solo el detalle fiscal
- AND el pie muestra Volver, Reimprimir y Emitir nota de crédito
- AND la sección NC no está visible

#### Scenario: Emitir nota de crédito revela la sección

- GIVEN una factura seleccionada, sección NC oculta
- WHEN el cajero presiona "Emitir nota de crédito"
- THEN se revela la sección NC completa, empezando por el depósito de reingreso
- AND el pie pasa a mostrar solo Volver y Editar métodos de pago

#### Scenario: Cambiar de factura reoculta la sección NC

- GIVEN la sección NC revelada para la factura A
- WHEN el cajero selecciona la factura B
- THEN el panel de B inicia oculto (solo detalle + pie de tres acciones)

#### Scenario: Volver es de una sola etapa

- GIVEN la sección NC revelada para una factura
- WHEN el cajero presiona "Volver"
- THEN el panel regresa directo al estado vacío de selección, sin estado intermedio

### Requirement: Modelo de PIN por acción sensible (mismo PIN, re-solicitado)

El sistema MUST usar un ÚNICO mecanismo de PIN de supervisor (`SupervisorPinDialog`), re-solicitado de forma independiente para cada una de estas acciones sensibles: (a) emitir la NC ("Nota de crédito"/"Editar métodos de pago") — solo si el usuario NO tiene `PERMISSIONS.SALES_NOTA_CREDITO`; (b) elegir explícitamente el depósito de reingreso (salir del riel automático); (c) usar una cuenta de Tesorería como origen del vuelto. Autorizar una de estas tres acciones MUST NOT autorizar automáticamente ninguna de las otras dos — cada gate exige su propio ingreso de PIN, aunque el valor del PIN sea el mismo.
(Previously: "Modelo de doble PIN" — solo describía dos gates, (a) emitir y (b) elegir depósito; no existía el gate de Tesorería.)

#### Scenario: Permiso determina el PIN para emitir

- GIVEN un cajero con el permiso `PERMISSIONS.SALES_NOTA_CREDITO`, y otro sin él
- WHEN cada uno presiona "Nota de crédito" o "Editar métodos de pago"
- THEN el primero no ve solicitud de PIN; el segundo debe ingresar el PIN de supervisor antes de continuar

#### Scenario: PIN independiente para elegir depósito

- GIVEN un cajero que quiere elegir el depósito de reingreso manualmente
- WHEN ingresa el PIN de supervisor para ese gate
- THEN se le presenta el selector de depósito explícito; sin ese PIN, el depósito se resuelve por rieles sin selector visible

#### Scenario: PIN independiente para origen Tesorería

- GIVEN un cajero que ya autorizó emitir la NC o elegir depósito
- WHEN intenta usar Tesorería como origen del vuelto
- THEN el sistema exige un nuevo ingreso de PIN para ese gate específico, sin heredar la autorización de los otros gates

#### Scenario: PIN incorrecto bloquea la acción

- GIVEN un cajero sin el permiso `PERMISSIONS.SALES_NOTA_CREDITO`
- WHEN ingresa un PIN de supervisor incorrecto en cualquiera de los tres gates
- THEN el sistema rechaza el PIN y no habilita esa acción específica

#### Scenario: PIN correcto habilita solo la acción elegida

- GIVEN un cajero que ingresó el PIN correcto para un gate específico
- WHEN el sistema valida el PIN
- THEN habilita únicamente esa acción; los otros dos gates permanecen bloqueados hasta pedirse por separado
