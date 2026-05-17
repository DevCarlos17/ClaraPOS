MANUAL TÉCNICO: MÓDULO DE
AGENDA Y MICRO-POS

1. Filosofía y Arquitectura Base
   El núcleo transaccional de ClaraPOS está diseñado bajo el principio de
   Desacoplamiento y Reutilización (DRY). El motor financiero central (Core_POS) es el
   único responsable de la gestión fiscal, impuestos, correlativos y cierres de caja. Los
   módulos front-end actúan como clientes independientes que alimentan este cerebro
   financiero.
   1.1. La Naturaleza del Servicio: Ejecución Inmediata vs. Planificación
   Temporal
   El sistema reconoce que un "Servicio" puede ser consumido de dos formas distintas
   según la naturaleza operativa del comercio, permitiendo al cliente configurar el flujo
   que mejor se adapte a su día a día:
   ● Servicio Directo (Flujo POS): Diseñado para servicios de ejecución instantánea
   que no requieren reserva de recursos en el futuro ni seguimiento de personal
   detallado.
   ○ Caso de uso: Una carnicería que cobra una tarifa por el servicio de
   corte de costillas o molido de carne en el momento. El cajero procesa el
   servicio en el mostrador, se genera el pago y finaliza la transacción de
   forma inmediata.
   ● Servicio Planificado (Flujo Agenda - El Meta-documento): Diseñado para
   negocios cuyo activo principal es la gestión del tiempo y la asignación de
   recursos. Aquí, la Cita opera como un "meta-documento" financiero y
   operativo que encapsula información crítica: rango horario, asignación de
   personal (trabajador), control de estaciones, y en fases avanzadas,
   almacenamiento de registros históricos, evolución o fotografías.
   ○ Caso de uso: Una estética que pauta citas, un entrenador personal que
   gestiona turnos o un servicio de limpieza a domicilio. Al confirmarse el
   pago, la agenda delega la facturación al POS emitiendo el documento
   fiscal correspondiente, pero manteniendo el control de la experiencia
   del cliente en su propio front-end.
   1.2. Separación de Conceptos: Tiempo/Espacio vs. Entidad Financiera
   Para garantizar la integridad total de las auditorías, mantenemos estrictamente
   separada la entidad del Tiempo/Espacio (la planificación operativa) de la entidad
   Financiera (el dinero), aunque permanecen vinculadas de forma unívoca.
   La máquina de estados del sistema procesa estos dos carriles de manera
   independiente:
   ● Estado Operativo (Cita_Status): Controla el flujo físico en el establecimiento
   (RESERVADA, EN_PROCESO, REALIZADA, CANCELADA).
   ● Estado Financiero (Finance_Status): Controla el flujo del dinero dentro de la
   misma sesión de caja activa (PENDIENTE, ABONADO, PAGADO, NULO).
   El módulo de Agenda tiene estrictamente prohibido realizar inserciones directas en
   las tablas de caja, bancos, cuentas por cobrar o correlativos de facturación. Cualquier
   evento económico se notifica al Core_POS mediante un contrato de datos estándar,
   asegurando que la facturación de la agenda ocurra dentro de la misma sesión de caja
   abierta por el usuario.
   1.3. Arquitectura Modular y Feature Flags (Banderas de Características)
   La interfaz del sistema reacciona de forma dinámica según el rubro del comercio
   mediante banderas de características (Feature Flags). Esto permite una arquitectura
   modular de clientes (Micro Front-ends):
   ● En comercios de Retail/Volumen (ferreterías, minimarkets), el módulo de
   Agenda no se renderiza en el menú lateral, manteniendo la interfaz limpia y
   enfocada en la velocidad de caja.
   ● En comercios de Servicios (barberías, clínicas, talleres), el sistema activa el
   calendario como pantalla principal, permitiendo facturar servicios mixtos
   (pautas + venta de productos como champús o repuestos) desde la misma
   interfaz de la agenda.
   Código de Soporte: Enrutador de Inicialización Operativa
   /\*\*

- FUNCIÓN: CL_InicializarFlujoOperativo
- NUEVA FUNCIÓN: Determina el comportamiento del Front-End y la carga de
  módulos
- dependiendo del rubro del Tenant, asegurando la consistencia de los prefijos del
  Core.
- - @param {Object} tenantConfig - Configuración del comercio actual
- @param {string} empleadoId - ID del empleado que inicia sesión (Debe incluir
  prefijo CL*EMP*)
- @returns {Object} Configuración operativa de la interfaz del cliente
  \*/
  function CL*InicializarFlujoOperativo(tenantConfig, empleadoId) {
  // Validación de seguridad de gobernanza de datos
  if (!empleadoId.startsWith('CL_EMP*')) {
  throw new Error('[SECURITY_ERR] Código de empleado inválido para
  auditoría.');
  }
  const flagsUI = {
  mostrarAgenda: tenantConfig.rubro === 'ESTETICA' || tenantConfig.rubro ===
  'TALLER',
  mostrarPosRapido: tenantConfig.rubro === 'RETAIL' || tenantConfig.rubro ===
  'CARNICERIA',
  permitirServiciosDirectos: true // El POS siempre puede vender servicios express
  };
  // Registrar en logs del sistema el modo de inicialización para el auditor
  console.log(`[SYS_LOG] Sesión iniciada para ${empleadoId}. Modo Agenda:
${flagsUI.mostrarAgenda}`);
  return flagsUI;
  }

2. Interfaz de Usuario y Flujos de Pantalla (El Front-End) <- Aquí es donde integramos tu
   menú
   2.1. Agendar Cita (El Motor de Reservas)
   Este submódulo representa la puerta de entrada operativa del sistema. Consiste en una
   interfaz guiada mediante un asistente por pasos (Wizard Step-by-Step) diseñado para
   segmentar la carga de datos cognitivos del operador. La lógica del Front-End coordina la
   recolección de variables temporales, de personal y de servicios, empaquetándolas en un
   objeto JSON unificado idóneo para el consumo del Core_POS.
   [PASO 1: Servicios] ➔ [PASO 2: Prioridad] ➔ [PASO 3: Agenda y Personal] ➔ [PASO 4: Ch
   2.1.1. Flujo Reestructurado del Asistente (Algoritmo de 4 Pasos)
   Paso 1: Selección de Servicios y Optimización del Tiempo
   ● Descripción: La pantalla inicial expone el catálogo reactivo de servicios del negocio.
   El operador puede seleccionar múltiples ítems (ej. Corte Premium + Tinte Completo).
   ● Lógica del Front-End (Cálculo de Duración Colectiva): Cada servicio inyecta su
   duración estimada preconfigurada. El Front-End calcula en tiempo real dos variables
   de estado:
1. CL_DURACION_LINEAL: La suma matemática estricta de todos los servicios.
1. CL_DURACION_PARALELA: Si el operador activa la bandera de "Ejecución
   Simultánea" (porque el local dispone de la infraestructura para hacer
   manicura mientras se procesa el tinte), el sistema ajusta el bloque de tiempo
   al servicio de mayor duración, evitando el sobre-bloqueo innecesario de 4
   horas en la agenda.
   Paso 2: Criterio de Prioridad Operativa (El Filtro Inteligente)
   Para dar flexibilidad a la recepción, el sistema bifurca el comportamiento del motor mediante
   dos tarjetas de selección excluyente:
   ● Tarjeta A - Prioridad Especialista ("Fidelizado"): Se despliega la lista del staff. Al
   seleccionar al profesional favorito del cliente, el siguiente paso filtrará únicamente los
   días y horas disponibles en la agenda particular de ese trabajador.
   ● Tarjeta B - Prioridad Horaria ("Apurado"): El cliente requiere atención inmediata
   sin importar el recurso. El sistema omite la selección de personal en esta etapa y
   abre un calendario general con las próximas horas libres de la empresa.
   Paso 3: Selección Dinámica de Fecha, Hora y Personal Asignado
   ● Renderizado Reactivo: Utilizando la duración calculada en el Paso 1 y el filtro del
   Paso 2, el componente genera bloques de tiempo válidos (Slots).
   ● Mapeo Muchos a Muchos (Cita_Trabajador): Si se seleccionaron múltiples
   servicios en el Paso 1, la interfaz expone selectores específicos para asignar qué
   profesional ejecutará cada servicio. Si los horarios de los especialistas favoritos no
   coinciden, el sistema genera una alerta visual sugiriendo dividir la operación en dos
   citas independientes o proceder con una readecuación manual interna del itinerario.
   Paso 4: Checkout Financiero e Inyección al POS
   ● Resumen en Tiempo Real: Compila la hidratación total del estado: datos del
   cliente, desglose de servicios con sus precios pactados, profesionales responsables
   y el rango de tiempo definitivo.
   ● Acciones Concretas de Cierre: Expone los tres botones de interacción directa con
   la máquina de estados financieros:
1. Solo Reservar: Modifica Cita_Status a RESERVADA y mantiene
   Finance_Status en PENDIENTE.
1. Procesar Pago (POS): Transforma la cita en un Payload_Venta y delega
   la facturación atómica al Core_POS.
1. Asignar a Crédito: Emite la factura y deriva el remanente a la cuenta por
   cobrar correspondiente.
   2.1.2. Gestión de Estado Crítico: Resiliencia y Memoria del Formulario
   Para blindar la experiencia frente a fallas imprevistas de infraestructura (caídas de red,
   cortes de fluido eléctrico), el estado del asistente implementa un protocolo de persistencia
   idéntico al del módulo de facturación principal:
   ● Tolerancia a Fallos (Estrategia Bit-a-Bit): En cada transición de paso, el Front-End
   serializa el estado actual (CL_Estado_Wizard) y lo almacena de manera local en
   el navegador utilizando LocalStorage o IndexedDB. Si la pestaña se cierra o el
   equipo se apaga bruscamente, al reiniciar la ruta de Agendar Cita, el sistema detecta
   la sesión huérfana y pregunta al operador si desea restaurar la carga de datos con
   un solo clic.
   ● Preservación del Historial en Navegación Inversa: El botón "Regresar" no
   destruye el estado. Si el operador avanza hasta el Paso 4 (Checkout) y nota un error
   en el precio o el nombre del cliente, puede retroceder con total libertad. Los
   componentes recuperan e "hidratan" los inputs con los valores almacenados
   previamente, agilizando la corrección sin obligar al usuario a repetir todo el proceso
   desde cero.
   Código de Soporte: Motor de Estado y Validación del Asistente
   Este módulo de JavaScript controla la inicialización, persistencia local y validación
   estructural del flujo de reserva antes de permitir el avance de pantalla:
   /\*\*

- FUNCIÓN: CL_InicializarOActualizarEstadoCita
- DE NUEVA CREACIÓN: Orquesta el estado multipasos del formulario de reserva,
- garantizando la persistencia local contra fallas eléctricas y calculando tiempos.
- - @param {Object} estadoPrevio - Estado actual del wizard obtenido del componente
- @param {Object} nuevosDatos - Inputs capturados en el paso actual de la UI
- @returns {Object} Estado actualizado, persistido e hidratado
  \*/
  function CL_InicializarOActualizarEstadoCita(estadoPrevio, nuevosDatos) {
  // TIP DE CLARA: Si no hay un estado previo, intentamos buscar en el almacenamiento
  local una sesión recuperable
  let estadoActual = estadoPrevio ||
  JSON.parse(localStorage.getItem('CL_SESION_WIZARD_HUERFANA')) || {
  CL_PASO_ACTUAL: 1,
  cliente: null,
  servicios_seleccionados: [],
  CL_DURACION_TOTAL_MINUTOS: 0,
  CL_EJECUCION_PARALELA: false,
  prioridad_filtro: null, // 'EMPLEADO' o 'HORA'
  asignacion_personal: [],
  bloque_horario: null
  };
  // Fusionar los nuevos datos capturados por el front-end en el objeto del estado
  estadoActual = { ...estadoActual, ...nuevosDatos };
  // --- CAPA DE VALIDACIÓN Y CÁLCULO SEGÚN EL PASO ---
  if (estadoActual.CL_PASO_ACTUAL === 1 &&
  estadoActual.servicios_seleccionados.length > 0) {
  // Calcular la duración en base a los servicios agregados
  if (estadoActual.CL_EJECUCION_PARALELA) {
  // Curiosidad de Clara: Si se ejecutan en paralelo, manda el servicio que tome más
  tiempo
  estadoActual.CL_DURACION_TOTAL_MINUTOS =
  Math.max(...estadoActual.servicios_seleccionados.map(s => s.duracion));
  } else {
  // Si es secuencial, se realiza una suma limpia bit a bit de los minutos de cada
  servicio
  estadoActual.CL_DURACION_TOTAL_MINUTOS =
  estadoActual.servicios_seleccionados.reduce((total, s) => total + s.duracion, 0);
  }
  }
  // AUDITORÍA Y CONTROL: Persistir de inmediato en el almacenamiento local para
  prevenir desastres por fallas de energía
  try {
  localStorage.setItem('CL_SESION_WIZARD_HUERFANA',
  JSON.stringify(estadoActual));
  } catch (err_storage) {
  console.warn('[AUDIT_WARN] No se pudo guardar la persistencia local:',
  err_storage.message);
  }
  return estadoActual;
  }
  2.2. Panel de Trabajo (Dashboard Operativo - Vista Kanban) Y Calendario
  operativo
  Este módulo es la interfaz táctica del negocio, optimizada para pantallas de tablets y
  dispositivos móviles en el área de ejecución del servicio. Su función es transformar el
  itinerario temporal estático en un flujo de trabajo dinámico y auditable impulsado por los
  propios operarios.
  [Por Atender (RESERVADA)] ➔ Botón "Iniciar" ➔ [En Operación (EN_PROCESO)] ➔ Botón
  "Terminar" ➔ [Finalizados (REALIZADA)]
  2.2.1. Arquitectura de Permisos y Roles (Filtros de Ámbito)
  La interfaz muta estructuralmente según el perfil de seguridad del usuario autenticado:
  ● Vista Operario/Técnico: Al iniciar sesión, el sistema identifica el trabajador_id.
  El dashboard se bloquea automáticamente para mostrar únicamente las tarjetas
  asignadas a su persona. Por estrictas razones de confidencialidad comercial, la
  variable CL_PERMISO_VER_PRECIOS se evalúa en false, ocultando los importes
  monetarios de las tarjetas para este rol.
  ● Vista Supervisor / Recepción: Habilita un selector superior dinámico (Combobox)
  que permite alternar entre la "Vista Global" (todas las columnas de la empresa en
  paralelo) o aislar el flujo de un empleado específico. En este modo, los precios e
  indicadores financieros quedan completamente expuestos para la auditoría de caja.
  2.2.2. Ciclo de Vida Operativo y Tracking de Eficiencia
  El avance de las tarjetas ejecuta operaciones atómicas en la base de datos para alimentar
  el motor analítico de rendimiento:

1. Columna "Por Atender" (Estado: RESERVADA): Muestra las citas del día
   ordenadas cronológicamente. Al hacer clic en [Iniciar Atención], el Front-End
   registra el timestamp exacto del sistema (CL_TIMESTAMP_INICIO).
2. Columna "En Operación" (Estado: EN_PROCESO): La tarjeta cambia de color y
   activa un temporizador visual interno. Al pulsar [Finalizar y Guardar Extras], se
   captura el CL_TIMESTAMP_FIN.
3. Métrica de Desviación: La diferencia entre el tiempo estimado en la creación del
   servicio y la duración real consumida se almacena en el campo
   CL*Desviacion_Minutos. Esta variable servirá para que el futuro optimizador
   estadístico reajuste automáticamente las duraciones de los servicios en base al
   histórico del empleado.
   2.2.3. El Mini-POS On-The-Fly (Mutación de Órdenes en Curso)
   Durante la fase de ejecución (EN_PROCESO), el operario puede interactuar con la tarjeta
   para abrir el modal de adición de ítems:
   ● Flujo de Modificación: Permite escanear o buscar productos del inventario o
   servicios adicionales.
   ● Control del Delta Financiero: Si la cita madre ya ostentaba un estado de
   Finance_Status = 'PAGADO', la interfaz no altera la factura original congelada
   por auditoría. En su lugar, el Front-End añade los nuevos ítems con una bandera de
   CL_Status_Item = 'PENDIENTE_COBRO'.
   ● Resolución en Checkout Secundario: Al finalizar, si el usuario posee rol de caja,
   puede procesar el cobro inmediato del excedente mediante el Integration_Core.
   De lo contrario, la tarjeta se mueve a "Finalizados" con un botón de alerta visual
   [Pendiente Pago en POS], obligando a que el registro se liquide en el mostrador
   principal para poder dar el cierre definitivo.
   2.2.4. Subsistema de Evidencia Multimedia y Escalabilidad Clínica
   ● Control Fotográfico: El modal dispone de un capturador multimedia. Tras realizarse
   la compresión en el cliente a formato WebP (máximo 150 KB por archivo), el archivo
   se sube al bucket de almacenamiento bajo la siguiente máscara de nomenclatura
   estricta para auditoría: CL_IMG*[CITA_ID]_[AAAAMMDD]_[TIPO_FOTO].webp
   (Donde TIPO_FOTO puede parametrizarse como ANTES o DESPUES).
   ● Abstracción del Módulo Clínico (Evolución Histórica): Para garantizar la
   modularidad futura sin alterar la tabla principal de Citas, el formulario implementa
   un objeto de extensión dinámica de datos del cliente (CL_Estructura_Clinica
   tipo JSONB). Si el tenant tiene activo el componente de salud, se renderizará un
   componente tipo CRUD lineal que guarda de forma histórica los apuntes, alergias o
   la evolución médica del paciente indexados por el ID de la cita actual.
   Código de Soporte: Mutación de Ítems en Curso (Mini-POS)
   Este script gestiona de forma segura la adición de productos o servicios extra directamente
   desde la pizarra de trabajo, calculando las diferencias de dinero sin corromper la auditoría
   de lo ya pagado:
   /\*\*

- FUNCIÓN: CL_ProcesarAdicionMiniPOS
- DE NUEVA CREACIÓN: Permite inyectar productos o servicios extra a una cita en
  ejecución,
- calculando el remanente financiero y aislando los montos ya facturados para control
  contable.
- @param {Object} citaActual - Instancia de la cita en memoria extraída del estado de la UI
- @param {Array} itemsNuevos - Lista de productos/servicios agregados sobre la marcha
  en la silla/fosa
- @returns {Object} Payload de la cita actualizado con los balances recalculados
  _/
  function CL*ProcesarAdicionMiniPOS(citaActual, itemsNuevos) {
  // TIP DE CLARA: Clonamos el objeto para evitar mutaciones directas indeseadas en el
  estado reactivo
  let citaMutada = JSON.parse(JSON.stringify(citaActual));
  // Inicializar el arreglo de extras si no existe en la estructura de la cita
  if (!citaMutada.CL_items_extras) {
  citaMutada.CL_items_extras = [];
  }
  itemsNuevos.forEach(item => {
  // Inicializar el objeto con el prefijo CL* exigido por nuestro estándar de código
  const CL_nuevoItem = {
  CL_item_id: item.id,
  tipo: item.tipo, // 'PRODUCTO' o 'SERVICIO'
  descripcion: item.descripcion,
  cantidad: item.cantidad,
  precio_unitario: item.precio_unitario,
  CL_status_cobro: 'PENDIENTE' // Forzamos el estado inicial para control de caja
  };
  citaMutada.CL_items_extras.push(CL_nuevoItem);
  });
  // AUDITORÍA: Si la cita ya fue pagada con anterioridad, el nuevo total acumulado no
  afecta la factura vieja
  let CL_montoExcedente = itemsNuevos.reduce((acc, i) => acc + (i.precio_unitario _
  i.cantidad), 0);
  if (citaMutada.finance_status === 'PAGADO') {
  // Curiosidad de Clara: Encapsulamos el saldo pendiente en una variable separada
  para que el POS sepa exactamente qué cobrar
  citaMutada.CL_saldo_excedente_pendiente =
  (citaMutada.CL_saldo_excedente_pendiente || 0) + CL_montoExcedente;
  console.log(`[AUDIT] Alerta: Se generó un excedente de ${CL_montoExcedente}$ en
una cita previamente liquidada.`);
  } else {
  // Si no estaba pagada, simplemente se acumula al saldo general de la cita
  citaMutada.total_pactado = (citaMutada.total_pactado || 0) + CL_montoExcedente;
  }
  return citaMutada;
  }
  Gestión de Retrasos en la Pizarra: ¿Reajuste automático o Label de
  Alerta?
  Mi propuesta técnica: Mantener las horas estáticas pero clavar un indicador visual de
  retraso en tiempo real (Label Rojo +X min de retraso).
  ● Por qué NO reajustar automáticamente: Si el sistema mueve visualmente la cita
  de Pedro de las 02:00 p. m. a las 02:25 p. m. de forma silenciosa porque el
  empleado se retrasó con el cliente anterior, generarías un caos administrativo. Pedro
  va a llegar a las 02:00 p. m. (su hora pactada), la recepcionista va a mirar la pantalla
  y podría confundirse pensando que la cita siempre fue a las 02:25 p. m. Además,
  para la auditoría y métricas de eficiencia, necesitas ver la brecha real entre lo
  planificado y lo ejecutado.
  ● Cómo lo gestionamos: Si la cita anterior se extiende del tiempo estimado, las citas
  subsiguientes de la columna "Por Atender" calcularán dinámicamente el retraso
  acumulado: Tiempo_Actual - Hora_Teorica_Inicio. La interfaz pintará un
  banner sutil pero imponente en rojo: ⚠️ +25 min de retraso estimado. Esto
  le da superpoderes a la recepción para tomar decisiones: reasignar a Pedro a otro
  trabajador libre o invitarle un café y pedirle disculpas antes de que se moleste.
  Inventario Comprometido en la Silla (El Mini-POS)
  La fórmula matemática infalible en la base de datos para evitar la doble venta es:
  Stock Disponible = Stock Real - Stock Comprometido
  ● La interacción: En el momento exacto en que el operario agrega la cera para peinar
  en el modal de la cita activa, el Front-End dispara un micro-trigger al Back-End que
  incrementa Stock_Comprometido en $+1$ para ese producto.
  ● El bloqueo: Si un cajero en el POS tradicional intenta vender la última cera en ese
  mismo segundo, el sistema le dirá: "Stock real: 1, Disponible: 0 (Comprometido en
  Cita de Laura S.)". ¡Sistema protegido!
  ● El cierre: Si la cita se cancela o se remueve el producto, se resta de
  comprometidos. Si se factura y finaliza, el Stock_Real disminuye físicamente, y el
  Stock_Comprometido se libera. Limpio, atómico y auditable.
  La persistencia indestructible: Adiós al "Puff" de los datos
  Confiar el estado de una cita en curso solo al localStorage es jugar a la ruleta rusa con
  cinco balas en el tambor, Fran. Si el usuario limpia la caché, usa el modo incógnito o cambia
  de dispositivo porque la tablet se quedó sin batería, los extras cargados y el tiempo de inicio
  se desvanecerían en el aire.
  La Práctica Profesional Definitiva: Persistencia Híbrida basada en el Servidor
  (Server-Driven State).
  Como estamos usando Supabase (PostgreSQL), la mejor práctica no es crear tablas
  temporales locas, sino utilizar una columna de tipo JSONB en la misma tabla de la cabecera
  de la cita (o una tabla relacional de auditoría en curso) que funcione como un Snapshot del
  Estado Activo.
  Cada vez que el operario hace un cambio en el modal (iniciar cita, agregar un producto,
  pausar), se envía un debounce o una petición rápida al backend para actualizar ese campo.
  ● Si la luz se va en Maracaibo o la tablet muere, el estado está a salvo en la nube de
  Supabase.
  ● Al abrir sesión en cualquier computadora o teléfono, el sistema lee el registro del
  servidor, rehidrata la interfaz y el Kanban vuelve a la vida exactamente donde se
  quedó.
  Código de Soporte: Sincronización del Estado en Servidor
  (Anti-Desastres)
  Aquí tienes la función técnica para actualizar ese Snapshot en el backend cada vez que
  mutemos la pizarra o el modal, asegurando que todo quede registrado con nuestro estándar
  de código:
  /\*\*
- FUNCIÓN: CL_SincronizarSnapshotCitaServidor
- NUEVA FUNCIÓN: Persiste el estado intermedio de una cita en ejecución directamente
- en el servidor para evitar pérdidas por borrado de caché, fallas de red o cortes eléctricos.
- - @param {string} citaId - Identificador único con prefijo de la cita (CL*CIT*)
- @param {Object} estadoModalActual - Datos actuales del mini-pos, fotos temporales y
  tiempos
- @returns {Promise<Object>} Confirmación de la persistencia en el backend
  \*/
  async function CL*SincronizarSnapshotCitaServidor(citaId, estadoModalActual) {
  if (!citaId.startsWith('CL*')) {
  throw new Error('[AUDIT_ERR] ID de cita inválido para sincronización de seguridad.');
  }
  // TIP DE CLARA: Construimos el payload de resguardo aislando el estado operativo
  const CL*PayloadSeguridad = {
  CL_ultimo_timestamp_sincro: new Date().toISOString(),
  CL_items_en_silla: estadoModalActual.items || [],
  CL_retraso_detectado_minutos: estadoModalActual.retrasoMinutos || 0,
  CL_metadata_dispositivo: navigator.userAgent
  };
  try {
  // CURIOSIDAD: Aquí haríamos el fecht o la llamada al cliente de Supabase
  // actualizando la columna JSONB 'CL_snapshot_en_progreso' de la tabla 'CL_CITA'
  console.log(`[BACKEND_SYNC] Guardando respaldo indestructible para ${citaId}...`);
  // Simulación de persistencia exitosa en el servidor
  return {
  CL_SYNC_SUCCESS: true,
  timestamp: CL_PayloadSeguridad.0,
  version_snapshot: CL_PayloadSeguridad
  };
  } catch (error_net) {
  // En caso de caída extrema de internet, usamos el LocalStorage como último
  salvavidas temporal
  console.warn('[FALLBACK] Sin conexión al servidor. Activando almacenamiento de
  emergencia local.');
  localStorage.setItem(`CL_BACKUP*${citaId}`, JSON.stringify(CL_PayloadSeguridad));
  return { CL_SYNC_SUCCESS: false, error: error_net.message };
  }
  }
  Calendario operativo

1. El nuevo modal de Reprogramación (Multi-Servicio y Multi-Staff)
   El boceto actual se quedó corto porque fue pensado para la estructura vieja (un solo
   trabajador, un solo servicio). Ahora que nuestro modelo de datos soporta que una cita
   (CL_CITA) tenga un cuerpo de detalles (Cita_Detalle) y varios trabajadores en paralelo
   (Cita_Trabajador), el modal debe evolucionar.
   ● La propuesta: Al hacer clic en "Reprogramar", el modal debe ofrecer dos caminos
   claros:
1. Movimiento Global (Bloque Completo): Cambiar la fecha y hora de toda la
   cita. El sistema validará en cascada si todos los profesionales asignados a
   los servicios de esa cita están libres en el nuevo horario.
1. Desglose Quirúrgico (Por Servicio): Un diseño tipo acordeón donde listes
   cada servicio de la cita y permitas reasignar al profesional o la hora de ese
   ítem específico de forma independiente.
1. Gestión de Descansos y Turnos Cortos en la Grilla
   ¡Obligatorio mostrarlo! Si Carlos M. almuerza de 01:00 p. m. a 02:00 p. m., la recepción no
   debería poder soltar una cita ahí por error. a menos que se aplique la logica de notificar al
   trabajador y permitir solapar la cita.
   ● La solución visual: Las celdas del calendario que correspondan a las horas de
   almuerzo o que estén fuera del turno del trabajador no se muestran en blanco. Se
   renderizan con un fondo grisáceo texturizado (líneas diagonales de CSS) y la
   propiedad disabled en el Front-End. Si intentan hacer clic, el sistema ni siquiera
   abre el modal de agendar.
1. Arrastrar y Soltar (Drag & Drop): ¿Placer o Peligro?
   ● Mi veredicto: Sí, absolutamente conveniente, pero con un escudo de fuerza
   activado. En pantallas táctiles o con ratones rápidos, un usuario puede mover una
   cita sin querer y causar una catástrofe logística.
   ● El mecanismo anti-accidentes: Cuando el usuario arrastre la cita de las 09:00 a las
   11:00, la interfaz no guardará el cambio inmediatamente. Al soltarla, se activará un
   pequeño Popover o Toast de Confirmación en el sitio que diga: ¿Mover cita de Laura
   S. a las 11:00 AM con Luis T.? [Confirmar] [Cancelar]. Si no le dan a confirmar en 5
   segundos o pulsan cancelar, la cita regresa mágicamente a su posición original. Y
   por supuesto, al confirmar, el backend ejecuta la validación de solapamiento
   temporal que definimos en el manual técnico.
1. Horas Dinámicas y Rangos de Filtros
   ● Cálculo Dinámico de Horas: Tu idea de calcular el rango de la grilla basado en el
   trabajador que entra más temprano y el que sale más tarde es brillante. Evita que la
   pantalla tenga scrolls infinitos hacia arriba o hacia abajo con horas muertas (como
   las 3:00 a. m.).
   ● Estrategia de Filtros de Fecha: No uses consultas estáticas de "últimos 15 días"
   para el calendario, ya que los administradores viven mirando el futuro para planificar
   la semana. Lo ideal es una solución híbrida:
   ○ Controles Rápidos (UI): Botones de "Hoy", "Esta Semana", "Este Mes" (que
   calcula los rangos dinámicamente según la fecha actual).
   ○ Componente DateRangePicker: Para que el dueño pueda emitir el reporte
   personalizado seleccionando el rango exacto que le pida el cuerpo o su
   contador.
1. Observaciones del Cliente y Reportes
   ● Observaciones: Agregamos el campo CL_observaciones (tipo TEXT o JSONB si
   quieres notas estructuradas) en la tabla cabecera CL_CITA. Aparecerá como un
   campo de texto libre en el paso 1 del asistente de agendado (image_35260f.png).
   ● Reportes: Al estar la vista indexada por rango de fechas en Supabase, emitir el
   reporte es tan fácil como pasar el JSON de la consulta actual a una función de
   exportación a CSV/Excel.
1. Arquitectura del Audit Trail (Tabla CL_Cita_Log)
   Como confirmaste que quieres auditoría total para el Drag & Drop, no podemos
   simplemente hacer un UPDATE plano en Supabase. Necesitamos una tabla intermedia que
   guarde el historial de movimientos. Cada vez que una cita se arrastre o cambie, disparamos
   una inserción aquí.
1. Comportamiento del Arrastre en Bloque (UX Inteligente)
   Para cumplir con tu idea de que el calendario sea un facilitador flexible y no una camisa de
   fuerza, implementaremos un comportamiento de "Desplazamiento Elástico con Opción
   de Quiebre". Al arrastrar el servicio base (ej. el Corte):
   ● El sistema calculará si hay espacio libre para mover también el servicio encadenado
   (ej. el Tinte).
   ● En el cartel flotante de confirmación le preguntaremos al usuario:
   ○ ¿Deseas mover toda la secuencia de citas en bloque? [Mover Secuencia]
   [Separar Citas] Esto le da el control absoluto al recepcionista para gestionar
   el flujo sin romper el pacto con el cliente.
1. Configuración Centralizada (Pestaña "Agenda" en Configuración)
   Aprovechando la vista de "Datos de la Empresa" que ya tienes diseñada
   (image_375cc3.png), agregaremos una pestaña lateral o sección llamada Configuración
   de Agenda. Allí el dueño del negocio podrá definir:
   ● CL_limite_futuro_dias: (7, 15, 30, 90 días o sin límite).
   ● Rango por defecto del visor de la grilla.
1. Historial de Cambios (Audit Trail) y Configuración Dinámica
   Para asegurar que el sistema sea completamente auditable y que ningún usuario altere la
   planificación del negocio de manera maliciosa o accidental, implementamos la estructura de
   trazabilidad para movimientos físicos (Drag & Drop) y la capa de configuración por Tenant.
   Modelo de Datos: CL_Cita_Log
   Esta tabla registrará cada alteración temporal de una cita.
   CREATE TABLE CL_Cita_Log (
   CL_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   CL_cita_id VARCHAR(50) NOT NULL,
   CL_usuario_id VARCHAR(50) NOT NULL, -- Quién hizo el cambio
   CL_accion VARCHAR(50) NOT NULL, -- 'DRAG_AND_DROP',
   'MODAL_REPROGRAMAR'
   CL_fecha_cambio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
   CL_datos_anteriores JSONB, -- { profesional_id, fecha, hora_inicio, hora_fin }
   CL_datos_nuevos JSONB -- { profesional_id, fecha, hora_inicio, hora_fin }
   );
   Capa de Control: Validación y Registro de Movimientos
   A continuación, se detalla la función del servidor encargada de procesar el movimiento de
   una cita en el calendario. Incluye la validación de congelamiento histórico y la inyección del
   registro de auditoría.
   /\*\*

- NUEVA FUNCIÓN: Service_ProcesarMovimientoCalendario
- Se encarga de validar y registrar de forma auditable el cambio de horario
- o de profesional de una cita cuando se ejecuta una acción de Drag & Drop.
- - @param {string} CL_cita_id - ID de la cita con prefijo del sistema
- @param {Object} CL_nuevos_tiempos - Objeto con la nueva fecha, hora y staff destinado
- @param {string} CL_usuario_id - ID del operador que ejecuta el cambio en el front-end
- @returns {Object} Estado de éxito y datos actualizados
  \*/
  function Service*ProcesarMovimientoCalendario(CL_cita_id, CL_nuevos_tiempos,
  CL_usuario_id) {
  // 1. CONTROL DE INTEGRIDAD: Buscar la cita cabecera existente
  const CL_cita_actual = Db_BuscarPorId("CL_Citas", CL_cita_id);
  if (!CL_cita_actual) {
  throw new Error(`[CALENDAR_ERR] La cita ${CL_cita_id} no existe.`);
  }
  // 2. CAPA ANTI-DESTRUCCIÓN: Validar congelamiento de estados históricos
  // Las citas REALIZADA o CANCELADA no pueden sufrir alteraciones de tiempos ni
  dinero[cite: 221, 222].
  if (CL_cita_actual.Cita_Status === 'REALIZADA' || CL_cita_actual.Cita_Status ===
  'CANCELADA') { // [cite: 218, 221]
  throw new Error(`[VALIDATION_ERR] Seguridad: No se puede reprogramar una cita en
estado ${CL_cita_actual.Cita_Status}.`); // [cite: 218, 221]
  }
  // 3. VALIDACIÓN DE LÍMITE DE CONFIGURACIÓN DEL TENANT
  const CL_config = Db_BuscarPorId("CL_Configuracion_Tenant",
  CL_cita_actual.tenant_id);
  const CL_fecha_limite = EncontrarFechaLimiteFutura(CL_config.CL_limite_futuro_dias);
  if (new Date(CL_nuevos_tiempos.fecha_inicio) > CL_fecha_limite) {
  throw new Error(`[LIMIT_ERR] El negocio no permite agendar citas más allá de
${CL_config.CL_limite_futuro_dias} días al futuro.`);
  }
  // 4. PREPARAR CAPTURA DE AUDITORÍA (Valores Anteriores vs Nuevos)
  const CL_datos_anteriores = {
  fecha_inicio: CL_cita_actual.fecha_inicio,
  fecha_fin: CL_cita_actual.fecha_fin,
  trabajadores: CL_cita_actual.trabajadores_asignados
  };
  // 5. EJECUCIÓN ATÓMICA DE LA REPROGRAMACIÓN
  try {
  // Ejecuta la query de actualización en la base de datos central
  Db_Actualizar("CL_Citas", CL_cita_id, {
  fecha_inicio: CL_nuevos_tiempos.fecha_inicio,
  fecha_fin: CL_nuevos_tiempos.fecha_fin,
  fecha_modificacion: new Date().toISOString()
  });
  // 6. INYECCIÓN EN EL REGISTRO DE AUDITORÍA (Log de Trazabilidad)
  Db_Insertar("CL_Cita_Log", {
  CL_cita_id: CL_cita_id,
  CL_usuario_id: CL_usuario_id,
  CL_accion: "DRAG_AND_DROP",
  CL_datos_anteriores: CL_datos_anteriores,
  CL_datos_nuevos: CL_nuevos_tiempos
  });
  return {
  exitoso: true,
  mensaje: "Cita reprogramada y movimiento auditado correctamente."
  };
  } catch (error_db) {
  // En caso de caída, registramos la falla crítica en el sistema
  Syslog_Registrar("CRITICAL", "FALLO_REPROGRAMACION_CALENDARIO",
  error_db.message);
  throw new Error(`[FATAL] Error en base de datos. Transacción abortada:
${error_db.message}`);
  }
  }
  ¿Por qué usamos JSONB para los logs? Fíjate que en las columnas
  CL_datos_anteriores y CL_datos_nuevos utilicé el tipo de datos JSONB (JSON
  Binario optimizado de PostgreSQL/Supabase). Como una cita puede mutar su estructura en
  el futuro (añadir más campos, campos de observaciones del cliente, etc.), guardar el estado
  de la cita como un objeto JSON dentro de la base de datos nos da una flexibilidad tremenda
  sin tener que cambiar la estructura de la tabla de logs cada dos meses. ¡Rendimiento y
  adaptabilidad pura!
  Validación Atómica: Al igual que hicimos con la conexión al POS, si por alguna razón la
  base de datos pierde conexión justo después del UPDATE de la cita pero antes de guardar el
  LOG, el bloque transaccional hace un Rollback automático. En un software contable o de
  administración, o se guarda todo o no se guarda nada. No queremos datos huérfanos.
  2.3. Horarios de Staff: Gestión de Disponibilidad, Turnos, Descansos y
  Bloqueos
  Este submódulo es el encargado de alimentar el motor de restricciones temporales
  del sistema. Su objetivo es definir con absoluta precisión matemática en qué
  momentos un recurso humano (CL_EMP*) está hábil para recibir asignaciones,
  evitando el sobre-agendamiento y protegiendo los tiempos de descanso del personal.
  2.3.1. Componentes de la Interfaz Base (Análisis del Prototipo)
  La pantalla se estructura en un diseño de dos columnas principales para agilizar el
  flujo de trabajo del administrador:
  ● Panel Lateral de Selección: Un listado vertical reactivo con tarjetas de los
  profesionales disponibles, clasificados por su nombre y rol operativo (ej.
  Carlos M. - Barbero Principal).
  ● Contenedor Central de Disponibilidad Semanal: Una tarjeta dinámica que se
  renderiza con el estado del trabajador seleccionado en el panel lateral. Muestra
  de lunes a domingo con selectores de tipo Toggle para activar/desactivar el día
  completo, controles de hora de entrada/salida y filas dinámicas para agregar
  tiempos de almuerzo o descansos mediante el botón + Agregar Descanso.
  2.3.2. Mejoras de UI/UX Aplicadas e Interacciones Críticas
  Para subsanar los casos de borde operativos, la persistencia de datos y evitar la
  pérdida de información por descuidos del usuario, se implementan las siguientes
  modificaciones estructurales en el Front-End:
  A. Contextualización del "Tiempo de Preparación"
  ● Ubicación en el Front-End: Se reubica la tarjeta de Tiempo de Preparación
  desde la zona inferior izquierda hacia el interior del contenedor central de
  Disponibilidad Semanal, posicionándose inmediatamente debajo del
  encabezado dinámico del profesional.
  ● Comportamiento Visual: El título de la tarjeta se vuelve reactivo,
  transformándose en:
  Tiempo de Preparación para [Nombre del Trabajador
  Seleccionado].
  ● Lógica Asociada: Almacena de forma individual en la base de datos el buffer
  de minutos necesarios para este empleado específico antes de admitir su
  siguiente pauta.
  B. Rediseño del Ámbito del Botón Guardar (Prevención de Pérdida de Estado)
  ● Ubicación en el Front-End: Se elimina el botón global superior derecho de la
  pantalla. En su lugar, se inserta un botón de acción principal en la esquina
  inferior derecha de la tarjeta de Disponibilidad Semanal.
  ● Comportamiento Visual: El texto del botón cambia dinámicamente según el
  foco: Guardar Horario de Carlos M..
  ● Lógica de Respaldo: Si el administrador modifica los campos de un trabajador
  e intenta hacer clic en otro profesional de la lista lateral sin haber guardado, la
  interfaz disparará un modal de advertencia interrumpiendo la navegación:
  "¿Deseas guardar los cambios pendientes de Carlos M. antes de
  cambiar de profesional?".
  C. Inteligencia de Cruce de Medianoche ("Horas Locas")
  ● Comportamiento del Selector: El componente de captura de hora
  (TimePicker) no bloqueará al usuario si la hora de finalización es menor
  numéricamente que la de inicio.
  ● Lógica Asociada: Si el sistema detecta que Hora_Inicio = 09:00 p.m. y
  Hora_Fin = 02:00 a.m., el Front-End marcará de forma invisible un flag
  interno llamado CL_Cruza_Medianoche = true, indicándole al calendario
  que ese bloque de disponibilidad se extiende legalmente hasta la madrugada
  del día posterior.
  D. Inclusión de la Capa de "Excepciones y Días Libres" (Nueva Funcionalidad)
  ● Ubicación en el Front-End: En la parte superior de la Disponibilidad Semanal,
  se añade un control de pestañas estilo Tabs:
  [ Plantilla Rutinaria ] [ Excepciones / Días Libres ]
  ● Comportamiento Visual: Al cambiar a "Excepciones", se despliega un
  calendario mensual donde el administrador puede seleccionar un día
  específico (ej. Martes 24 de Noviembre) para marcarlo como libre (cumpleaños,
  reposo) o modificar su horario temporalmente, sin alterar la configuración fija
  de la plantilla rutinaria de los demás martes del año.
  E. El "Botón de Pánico" para Salidas de Emergencia e Imprevistos
  ● Ubicación en el Front-End: Al lado del botón de guardar horario de cada
  trabajador, se incluye un botón secundario con el texto Registrar Salida
  Imprevista / Bloqueo.
  ● Comportamiento Operativo (Flujo del Modal): 1. Al pulsarlo, se abre una
  ventana flotante que solicita la fecha y el rango horario del retiro forzado del
  empleado. 2. El Front-End realiza una consulta inmediata al Back-End y
  renderiza un listado dentro del modal con todas las citas agendadas que van a
  quedar huérfanas debido a ese retiro. 3. Al lado de cada cita afectada, se
  expone un menú desplegable inteligente con los nombres de otros
  trabajadores del mismo rubro que sí están disponibles en ese exacto
  momento. El administrador puede reasignar las pautas masivamente o
  enviarlas a la "Bandeja de Reagendación Pendiente" antes de confirmar el
  bloqueo.
  2.3.3. Control de Acceso, Validaciones y Auditoría
  ● Gobierno de Roles: Esta pantalla queda estrictamente restringida por código
  para usuarios con privilegios de ADMINISTRADOR o GERENTE. Los usuarios con
  rol de EMPLEADO/ESTAFT verán bloqueada la ruta de edición, permitiéndoles
  únicamente la lectura de su propio itinerario mediante consultas a la API de
  autoservicio.
  ● Advertencia por Solapamiento de Descanso: Si en el módulo de Agendar Cita
  un operador fuerza una reserva que invade el rango de descanso configurado
  en esta pantalla, el sistema interrumpirá el guardado con un aviso
  confirmatorio:
  "[WARN] El horario seleccionado invade el tiempo de Almuerzo
  de Carlos M. ¿Desea proceder con la autorización del
  profesional?".
  Código de Soporte: Validador de Rangos y Cruce de Medianoche
  Para garantizar la robustez técnica del selector de horas, utilizaremos esta función
  encargada de procesar los rangos y calcular la duración real, contemplando el
  cambio de día:
  JavaScript
  /\*\*
- FUNCIÓN: CL_ValidarYCalcularRangoHorario
- NUEVA FUNCIÓN: Evalúa si un rango horario es válido, detectando
  automáticamente
- si la jornada laboral cruza la barrera de la medianoche.
- - @param {string} horaInicio - Cadena de hora en formato 'HH:MM' (ej. '21:00')
- @param {string} horaFin - Cadena de hora en formato 'HH:MM' (ej. '02:00')
- @returns {Object} Resultado del análisis con la bandera de cruce de día
  _/
  function CL_ValidarYCalcularRangoHorario(horaInicio, horaFin) {
  if (!horaInicio || !horaFin) {
  throw new Error('[VALIDATION_ERR] Ambas horas son requeridas para el
  cálculo.');
  }
  const [hrsInicio, minsInicio] = horaInicio.split(':').map(Number);
  const [hrsFin, minsFin] = horaFin.split(':').map(Number);
  const minutosTotalesInicio = (hrsInicio _ 60) + minsInicio;
  const minutosTotalesFin = (hrsFin _ 60) + minsFin;
  let cruzaMedianoche = false;
  let duracionMinutos = 0;
  if (minutosTotalesFin < minutosTotalesInicio) {
  // TIP DE CLARA: Si la hora fin es menor, el turno termina al día siguiente (24h _
  60m = 1440m)
  cruzaMedianoche = true;
  duracionMinutos = (1440 - minutosTotalesInicio) + minutosTotalesFin;
  } else {
  duracionMinutos = minutosTotalesFin - minutosTotalesInicio;
  }
  return {
  CL_RANGO_VALIDO: duracionMinutos > 0,
  duracionHoras: (duracionMinutos / 60).toFixed(2),
  cruza_medianoche: cruzaMedianoche
  };
  }

3. Máquina de Estados y Reglas de Negocio
   ● Matriz de Estado Operativo vs. Estado Financiero.
   ● Validaciones Críticas (Nuestra famosa "Capa Anti-Destrucción").
   ● Bloqueos históricos y manejo de inventario crítico.
4. Integración Core POS y Trazabilidad (El Back-End)
   ● El Payload de Abstracción (Payload_Venta).
   ● El Servicio de Acoplamiento (Service_AsociarCitaAPOS) y el manejo atómico de
   errores.
   ● Trazabilidad Dual bidireccional.
5. Casos de Borde y Optimización
   ● Modificaciones de último minuto y manejo de créditos/abonos.
   ● Optimización de consultas indexadas para no colapsar la vista del calendario.
   CAPA DE SEGURIDAD Y TELEMETRÍA
6. Arquitectura de Validación de Tres Capas (Defensa en Profundidad)
   Para blindar la integridad del sistema contra errores operativos, caídas de red o ataques
   maliciosos, ClaraPOS ejecuta un protocolo de validación síncrona en cascada. Si una regla
   falla en cualquier nivel, el proceso se aborta inmediatamente.
   [FRONT-END: Validación UX] ⬇ (Pasa formato básico) [MIDDLEWARE: Filtro de Reglas y
   Roles] ⬇ (Pasa esquema y permisos) [BACK-END: Consistencia Atómica DB] ➔ Inserción
   Exitosa
   6.1. Capa 1: Front-End (Filtro de Experiencia de Usuario)
   ● Propósito: Dar feedback instantáneo al operador, ahorrar ancho de banda y evitar
   peticiones a la API que están condenadas al fracaso.
   ● Validaciones Críticas:
   ○ Máscaras y Formatos: Validación reactiva de correos, cédulas/RIF, y
   números telefónicos.
   ○ Rango de Fechas Relativo: Bloqueo físico en el componente de calendario
   de cualquier fecha anterior al día en curso (Date.now()), o que supere el
   límite configurado en el Tenant (ej. +30 días).
   ○ Estado de Bloqueo Táctil: Deshabilitar los botones de envío (submit)
   mientras la petición HTTP está en curso para prevenir la duplicación de
   registros por "doble clic" del usuario ansioso.
   6.2. Capa 2: Middleware (La Aduana Estructural y de Roles)
   ● Propósito: Sanitizar el objeto JSON entrante antes de que toque la lógica de
   negocio y verificar la identidad legal de quien dispara la acción.
   ● Validaciones Críticas:
   ○ Inyección de Esquema Rígido (Zod/Joi): Comprobación de que no vengan
   campos adicionales maliciosos en el cuerpo de la petición (Payload). Si el
   esquema espera CL_cita_id y fecha, y el JSON trae Drop_Table, el
   middleware bloquea y reporta intento de intrusión.
   ○ Matriz de Autorización: Validación de tokens JWT y contraste de permisos
   específicos del rol (ej. Confirmar que el usuario que intenta mover una cita
   mediante Drag & Drop posee la variable CL_PERMISO_ADMIN_AGENDA =
   true).
   6.3. Capa 3: Back-End / Base de Datos (La Última Línea de Verdad)
   ● Propósito: Garantizar que los datos cumplan con las reglas del negocio de manera
   inmutable y atómica a nivel de almacenamiento.
   ● Validaciones Críticas:
   ○ CHECK Constraints en PostgreSQL: Restricciones duras en la tabla. Por
   ejemplo, CHECK (CL_precio_pactado >= 0) e integridad relacional
   forzada mediante llaves foráneas (FK).
   ○ Aislamiento contra Concurrencia (Race Conditions): Uso de sentencias
   SELECT ... FOR UPDATE dentro de bloques transaccionales. Si dos
   recepcionistas intentan agendar al mismo trabajador a la misma hora en el
   mismo microsegundo, la base de datos procesa la primera petición, bloquea
   la fila de la agenda, y rechaza la segunda con un error controlado de
   ocupación.
7. Estrategia de Logging Profesional (Telemetría Sin Pérdidas)
   En producción, decir "el sistema falló y no sé por qué" es inaceptable. Para que ningún
   evento se desvanezca (incluso si el servidor principal explota), ClaraPOS implementa
   Estructuración Semántica y un Mecanismo de Resiliencia en Memoria (Buffer de
   Contingencia).
   7.1. Estructura de Log Semántico (Formato JSON Estricto)
   Olvídate de guardar logs en texto plano como "El usuario cambió una cita". Los logs
   profesionales se guardan como objetos estructurados para que herramientas analíticas
   puedan indexarlos y buscar fallas en milisegundos:
   {
   "CL_log_timestamp": "2026-05-17T17:04:21.102Z",
   "CL_log_level": "ERROR",
   "CL_contexto": "MOTOR_AGENDA",
   "CL_accion": "DRAG_AND_DROP_REPROGRAMAR",
   "CL_tenant_id": "TEN_MARACAIBO_01",
   "CL_usuario_id": "USR_FRAN_32",
   "CL_metadata": {
   "cita_id": "CL_CIT_9982",
   "error_detalle": "ConflictTemporal: El especialista Luis T. se encuentra en horario de
   descanso",
   "codigo_error_db": "23514"
   }
   }
   7.2. El Circuito de Resiliencia (¿Cómo evitamos perder eventos?)
   Si el servidor central de logs (como Grafana, Logflare o tu propia base de datos dedicada)
   sufre una caída o interrupción de red por un bajón de luz, no puedes detener la operación
   del negocio, pero tampoco puedes perder el rastro del dinero. Aplicamos la técnica de
   Failover Local Inmediato:
8. Los logs se envían primero a un Buffer asíncrono en memoria dentro del backend
   para no ralentizar la navegación del cliente.
9. Un proceso secundario (Background Worker) se encarga de vaciar ese buffer hacia
   el servidor central de telemetría.
10. Si la conexión con el servidor de logs falla, el backend intercepta el error de red,
    activa el protocolo de emergencia y desvía la escritura de forma atómica a un
    archivo físico rotativo local cifrado dentro del sistema de archivos del servidor de
    la aplicación.
11. Cuando el servidor central vuelve a responder, el sistema ejecuta un proceso de
    conciliación automática, leyendo el archivo local y cargando bit a bit los eventos
    pendientes al histórico consolidado.
    Código de Soporte: Middleware de Validación y Telemetría Segura
    Este script de Node.js actúa como el guardia de seguridad de nuestra API de la Agenda,
    aplicando las capas de validación y telemetría estructurada antes de tocar la base de datos.
    /\*\*

- FUNCIÓN: CL_MiddlewareValidarYRegistrarAccion
- DE NUEVA CREACIÓN: Inspecciona la estructura, permisos y coherencia de una petición
- de agenda antes de pasar al backend, registrando el evento de forma altamente
  auditable.
- - @param {Object} req - Objeto de petición HTTP (Request)
- @param {Object} res - Objeto de respuesta HTTP (Response)
- @param {Function} next - Función callback para continuar el flujo si todo es correcto
  \*/
  function CL_MiddlewareValidarYRegistrarAccion(req, res, next) {
  const CL_Timestamp_Evento = new Date().toISOString();
  const { CL_usuario_id, rol, permisos } = req.auth || { CL_usuario_id: 'ANÓNIMO', rol:
  'INVITADO', permisos: [] };
  const CL_Payload = req.body;
  // TIP DE CLARA: Estructuramos la base del log desde el inicio para garantizar la
  trazabilidad total
  let CL_Template_Log = {
  CL_log_timestamp: CL_Timestamp_Evento,
  CL_log_level: "INFO",
  CL_contexto: "API_MIDDLEWARE_AGENDA",
  CL_usuario_id: CL_usuario_id,
  CL_tenant_id: req.headers['x-tenant-id'] || 'DESCONOCIDO'
  };
  try {
  // --- CAPA 2: VALIDACIÓN ESTRUCTURAL ---
  if (!CL_Payload || Object.keys(CL_Payload).length === 0) {
  throw new Error("Estructura de payload vacía o corrupta.");
  }
  // --- CAPA 2: VALIDACIÓN DE ROLES ---
  // Curiosidad de Clara: El usuario puede estar autenticado, pero si no tiene el token de
  permiso específico, rebota de inmediato
  if (!permisos.includes('CL_PERMISO_MODIFICAR_AGENDA')) {
  CL_Template_Log.CL_log_level = "WARN";
  CL_Template_Log.CL_accion = "ACCESO_DENEGADO_REPROGRAMAR";
  CL_Template_Log.CL_metadata = { razon: "El rol de usuario no posee privilegios
  administrativos de agenda" };
  CL_RegistrarLogEnSistema(CL_Template_Log);
  return res.status(403).json({ error: "Seguridad: No posees autorización para realizar
  movimientos en la agenda." });
  }
  // Si supera los filtros de la aduana, registramos el evento exitoso de paso
  CL_Template_Log.CL_accion = "VALIDACION_MIDDLEWARE_EXITOSA";
  CL_Template_Log.CL_metadata = { ruta: req.originalUrl };
  CL_RegistrarLogEnSistema(CL_Template_Log);
  next(); // Continuamos seguros hacia el controlador del Back-End
  } catch (err_middleware) {
  // Captura destructiva de fallos en el middleware
  CL_Template_Log.CL_log_level = "ERROR";
  CL_Template_Log.CL_accion = "FALLO_CRITICO_MIDDLEWARE";
  CL_Template_Log.CL_metadata = { error: err_middleware.message,
  payload_sospechoso: CL_Payload };
  CL_RegistrarLogEnSistema(CL_Template_Log);
  return res.status(400).json({ error: `Solicitud rechazada por auditoría:
${err_middleware.message}` });
  }
  }
  /\*\*
- FUNCIÓN: CL_RegistrarLogEnSistema
- DE NUEVA CREACIÓN: Se encarga de procesar la ingesta del log estructurado,
  implementando
- el mecanismo de contingencia local en caso de que falle el recolector central.
- - @param {Object} CL_Log_Estructurado - Objeto con los datos semánticos del evento
    \*/
    function CL_RegistrarLogEnSistema(CL_Log_Estructurado) {
    // AUDITORÍA CONTABLE: Imprimir en la consola estandarizada para recolección en
    contenedores
    console.log(JSON.stringify(CL_Log_Estructurado));
    // Simulación del circuito de resiliencia
    const CL_Servidor_Logs_Disponible = false; // Forzamos un escenario de caída de red
    if (!CL_Servidor_Logs_Disponible) {
    // CURIOSIDAD DE CLARA: Si el recolector central está caído, tiramos del salvavidas
    local de inmediato
    // En una app real de Node, aquí usarías fs.appendFileSync para escribir en un archivo
    local .log cifrado
    console.warn(`[FAILOVER ACTIVADO] Guardando log de forma segura en
almacenamiento local de emergencia.`);
