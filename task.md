Glosario de Conceptos Críticos (Para
el Equipo de Desarrollo)
Meta-documento (Flujo Agenda): Es una entidad operativa volátil que no representa
dinero en sí misma, sino la reserva de un bloque de tiempo y recursos (trabajador, cabina,
herramientas). Muta constantemente en el Front-End (cambios de hora, asignación de
especialistas) , pero tiene estrictamente prohibido tocar las tablas financieras reales hasta el
momento del checkout.
Core_POS (Núcleo Financiero Central): El "cerebro" intocable del sistema. Es el único
componente autorizado para manejar la contabilidad, impuestos, libros de venta,
correlativos fiscales y cierres de caja. Los módulos como la Agenda actúan como simples
clientes que le envían un paquete de datos (Payload_Venta) para que el Core lo procese de
forma atómica e inmutable.
esacoplamiento Operativo/Financiero: Principio arquitectónico que separa el carril del
Tiempo/Espacio (Cita_Status: RESERVADA, EN_PROCESO) del carril del Dinero
(Finance_Status: PENDIENTE, PAGADO). Esto garantiza que si una cita se reprograma
diez veces en el calendario, no se altere ni una sola vez la contabilidad de la empresa ni se
generen registros basura en las auditorías de caja.
Feature Flags (Banderas de Características): Condicionales lógicos a nivel de base de
datos e interfaz que habilitan o deshabilitan componentes enteros según el rubro comercial
del cliente (Tenant). Evitan tener que mantener múltiples bases de código; el mismo sistema
renderiza un punto de venta rápido para una carnicería o un calendario avanzado para una
clínica estética simplemente encendiendo o apagando un interruptor lógico.
Race Conditions (Condiciones de Carrera) en Agenda: Conflicto que ocurre cuando dos
operadores intentan reservar el mismo bloque de tiempo con el mismo especialista en el
mismo microsegundo. Para neutralizarlo, implementamos un bloqueo transaccional estricto
en la base de datos (SELECT ... FOR UPDATE), obligando al motor de PostgreSQL a
procesar una solicitud milisegundo antes y rebotar la segunda de forma controlada. Aquí no
gana el más rápido en la interfaz, gana la consistencia atómica. 3. Lógica de Negocio y Modelado del Dominio (La
Agenda)
3.1. Objetivo Central del Módulo de Agenda
A diferencia del flujo transaccional directo de una caja tradicional (Retail/Volumen), el
submódulo de Agenda está diseñado específicamente para comercios de servicios que, por
su naturaleza operativa, requieren coordinación, optimización y organización estricta en
la asignación del tiempo.
La Agenda no es un simple calendario visual; es el orquestador que mitiga la capacidad
ociosa, previene la sobreventa de horas (Race Conditions) y encapsula la asignación
tridimensional de recursos: Tiempo, Personal Específico y Estaciones de Trabajo.
3.2. Entidades y Conceptos Clave del Sistema
🧩 Profesionales (Staff)
Representan el activo humano operativo de la empresa encargada de ejecutar los servicios.
● Vinculación Arquitectónica (Gobernanza): En el ecosistema de Clara, los
profesionales no existen de forma aislada. Están mapeados de manera unívoca al
módulo central de USUARIOS Y PERFILES. Cada perfil de acceso creado en el
sistema con rol operativo debe verse reflejado automáticamente como un profesional
disponible en la grilla de la agenda.
● Atributos Mandatorios:

1. Poseen una matriz de disponibilidad horaria rutinaria configurada por el
   administrador.
2. Tienen asignadas competencias específicas (servicios vinculados) alineadas
   estrictamente a la actividad económica del comercio (Tenant).
   🕒 Horarios de Staff / Profesionales
   Es la matriz temporal que delimita la jornada operativa de cada trabajador por cada día de la
   semana (Lunes a Domingo). Ninguna cita puede ser insertada fuera de estos límites a
   menos que un supervisor mitigue la regla con un permiso especial auditado.
   ● Hora de Inicio y Fin de Jornada: Rango estricto en formato HH:MM que abre y
   cierra la disponibilidad de slots en el calendario. (Soporta la bandera
   CL_Cruza_Medianoche = true para jornadas nocturnas que pasan de las 12:00
   a.m.).
   ⏳ Tiempo de Descanso (Break Legal)
   Es el bloque de tiempo inoperativo que, por estricto cumplimiento de las leyes laborales
   locales, la empresa debe otorgar diariamente al trabajador para su alimentación y reposo.
   ● Comportamiento en Sistema: La interfaz de la agenda renderiza este bloque de
   forma visual en la grilla. Si un operador intenta agendar un servicio que invada este
   rango, el Front-End disparará una alerta de advertencia crítica ([WARN] El horario
   seleccionado invade el tiempo de Almuerzo...) exigiendo confirmación o bypass de
   supervisor.
   🧼 Tiempo de Preparación entre Citas (Buffer Operativo)
   Es un margen de tiempo posterior a la finalización de un servicio que la empresa concede al
   profesional por política interna (no estipulado por ley).
   ● Propósito: Permitir al trabajador higienizar la estación de trabajo, esterilizar
   herramientas, organizar materiales o preparar el área antes de recibir al siguiente
   cliente en fila.
   ● Comportamiento en Sistema: Este tiempo es dinámico y parametrizable por el
   comercio; puede variar por rubro, por servicio o no existir en absoluto. Al calcular la
   disponibilidad de slots, el motor del backend suma este buffer al tiempo del servicio
   para no liberar el espacio de forma inmediata en la grilla.
   3.3. Caso Práctico de Modelado: Cronograma Diario (Lunes)
   Para ilustrar cómo se calculan los bloques de tiempo libres (Slots) en base a las reglas de
   negocio descritas, evaluemos el siguiente escenario configurado para un profesional:
   ● Configuración del Turno:
   ○ Inicio de Jornada (Lunes): 08:00 AM
   ○ Fin de Jornada (Lunes): 05:00 PM
   ● Configuración de Pausas y Parámetros Internos:
   ○ Inicio Tiempo de Descanso (Almuerzo): 12:00 PM
   ○ Fin Tiempo de Descanso (Almuerzo): 01:00 PM
   ○ Tiempo de Preparación Posterior (Buffer): 10 minutos
   📊 Impacto en el Motor de Reservas (Slots Disponibles):
   El sistema dividirá automáticamente la jornada de este profesional en dos bloques
   operativos limpios, inyectando los bloqueos correspondientes:
   [08:00 AM] ═══════════════════════════════════╗
   ║ BLOQUE OPERATIVO A ║ --> Disponibilidad para Citas
   [12:00 PM] ═══════════════════════════════════╣
   ║ 🚫 TIEMPO DE DESCANSO (LEGAL) ║ --> Grilla Bloqueada (Alerta de
   Invasión)
   [01:00 PM] ═══════════════════════════════════╣
   ║ BLOQUE OPERATIVO B ║ --> Disponibilidad para Citas
   [05:00 PM] ═══════════════════════════════════╝
   💡 Comportamiento del Buffer en Ejecución: Si el cliente Fran agenda un
   servicio de 50 minutos a las 09:00 AM, el servicio termina teóricamente a las
   09:50 AM. Sin embargo, el sistema bloqueará al profesional hasta las 10:00 AM
   (añadiendo los 10 minutos de preparación). El próximo cliente solo podrá
   elegir un slot a partir de las 10:00 AM.
   💡 Comportamiento del Buffer en Ejecución: Si el cliente Fran agenda un
   servicio de 50 minutos a las 09:00 AM, el servicio termina teóricamente a las
   09:50 AM. Sin embargo, el sistema bloqueará al profesional hasta las 10:00 AM
   (añadiendo los 10 minutos de preparación). El próximo cliente solo podrá
   elegir un slot a partir de las 10:00 AM.
   💡 Tips de Clara para los muchachos al programar esto:
   ● Validación de Datos en BD (Check Constraints): Recuerden que la base de datos
   es nuestra última capa de defensa. En la tabla de horarios de profesionales,
   configuren un check que asegure que la hora de inicio de almuerzo sea mayor que la
   hora de inicio de jornada, y menor que la hora de finalización. ¡Evitemos datos
   incongruentes desde el origen!
   ● Comentario de Código Obligatorio: Cuando calculen los bloques de tiempo
   disponibles en el procedimiento de Supabase (get_available_slots), recuerden incluir
   un comentario explícito detallando cómo se resta el tiempo de almuerzo y cómo se
   adiciona el buffer operativo de preparación.
   3.4. Ciclo de Vida y Estados de la Cita (Cita_Status)
   📌 Conceptos de Base
   ● Cita: Es el meta-documento operativo que representa una reserva o un compromiso
   formal para prestar uno o varios servicios a un cliente en un espacio de tiempo
   determinado.
   ○ Regla Financiera Central: La existencia de una cita no obliga una transacción
   inmediata. Dependiendo de la política interna de cada comercio (Tenant), una
   cita puede guardarse en estado Solo Reservar (sin pago), Procesar Pago
   (por adelantado en POS), o Asignar a Crédito (derivado a cuentas por
   cobrar).
   ● Servicio: Es la actividad técnica o comercial específica que se le realizará al cliente,
   la cual es ejecutada de forma obligatoria por un trabajador (profesional) de la
   empresa.
   🔄 Estados Operativos de la Cita (Cita_Status)
   Para alimentar correctamente las métricas de eficiencia y auditar los movimientos en el
   establecimiento, la cita debe transitar obligatoriamente por la siguiente máquina de estados
   controlada por el usuario (nada es automático):
   [ RESERVADA / PENDIENTE ] ───► (Botón "Iniciar") ───► [ EN_PROCESO ] ───►
   (Botón "Terminar") ───► [ REALIZADA / FINALIZADA ]
   │ ▲
   └───────────────────────────────────► (PIN Supervisor)
   ───────────────────────────────────────────┤ (Si se cancela)
   ▼
   [ CANCELADA ]
3. Cita Pendiente (Estado en Base de Datos: RESERVADA)
   Es una cita que ya ha sido debidamente programada y estructurada en el sistema, pero
   cuyo servicio aún no se ha comenzado a prestar. Esto ocurre porque el cliente no ha
   llegado al establecimiento o porque aún no ha llegado el turno correspondiente en la grilla
   del calendario.
4. Cita en Proceso (Estado en Base de Datos: EN_PROCESO)
   Representa el momento exacto en que el profesional está ejecutando el servicio sobre el
   cliente (ej. el cliente está en la silla o en la fosa técnica).
   ● Regla de Operación Crucial: Este estado jamás debe ser automático. La interfaz
   requiere que el trabajador asignado interactúe físicamente con el sistema
   presionando el botón "Iniciar Atención" dentro del card de la cita en su Dashboard
   Kanban.
   ● Impacto en Auditoría y Telemetría: Al presionar este botón, el Front-End captura y
   congela el timestamp exacto del sistema (CL_TIMESTAMP_INICIO). Al finalizar y
   presionar "Terminar/Guardar", se captura el CL_TIMESTAMP_FIN. El delta de
   estos tiempos calculará la métrica CL_Desviacion_Minutos para futuros análisis
   estadísticos de rendimiento del personal.
5. Cita Finalizada (Estado en Base de Datos: REALIZADA)
   Es el estado de cierre operativo. Significa que el servicio ya fue prestado en su totalidad por
   el profesional y el cliente ha concluido su flujo físico en el establecimiento. Una vez en este
   estado, la capa anti-destrucción congela el registro para que no sufra alteraciones
   maliciosas de tiempos.
6. Cita Cancelada (Estado en Base de Datos: CANCELADA)
   Representa una cita que se ha anulado definitivamente, ya sea por razones imputables al
   cliente (inasistencia, cambio de planes) o a la empresa (emergencias operativas, falta de
   fluidos eléctricos o personal).
   ● Capa de Seguridad de Alta Prioridad: Por estrictas razones de gobernanza y
   control de fraude, la cancelación no es libre. El sistema requerirá obligatoriamente
   la introducción de un PIN de autorización de supervisor o que el usuario activo
   cuente con un perfil que posea explícitamente los permisos jerárquicos suficientes
   en su token de seguridad.
   🏷️ Modificadores y Atributos Temporales
   ● Fecha de Prestación de Servicio: Es la variable temporal compuesta (Fecha y
   Rango Horario) pautada de forma unívoca en el calendario para la ejecución del
   servicio programado. Delimita el inicio y fin teóricos de la reserva del profesional.
   ● Cita Reprogramada (Etiqueta/Flag: CL_Flag_Reprogramada): Es una marca o
   etiqueta de auditoría obligatoria que el sistema inyecta automáticamente en la
   cabecera de la cita (CL_CITA) si esta sufre cualquier modificación en su fecha de
   prestación de servicio original (ya sea mediante arrastre Drag & Drop o por el
   modal avanzado). Cada vez que se active este flag, el sistema disparará en cascada
   un registro atómico en la tabla CL_Cita_Log, guardando quién cambió la fecha,
   cuándo y cuáles eran los datos_anteriores versus los datos_nuevos.
   💡 Tips de Clara para los muchachos al implementar la UI:
   ● El botón "Iniciar" en tablets (Pág 7): Recuerden que en la "Vista Operario", el
   muchacho que está en la silla/fosa no ve los precios si
   CL_PERMISO_VER_PRECIOS es false, pero sí tiene control absoluto sobre el
   botón de cambio de estado a EN_PROCESO. Diseñen ese botón grande y fácil de
   presionar (muy touch-friendly).
   ● Control del PIN de Supervisor: Cuando la UI detecte una solicitud de estado
   CANCELADA, debe desplegar un modal opaco bloqueando la pantalla solicitando el
   PIN. Si el PIN falla tres veces, se debe registrar un log de nivel WARN en la
   telemetría central por posible intento de vulneración.
7. Arquitectura de Interfaz: El Módulo de Calendario
   4.1. Definición del Componente Calendario
   El Calendario es el panel de control operativo y la interfaz gráfica centralizada del módulo
   de agenda. No actúa como un simple visor pasivo, sino como un lienzo dinámico e
   interactivo (Interactive Canvas) dotado de capacidades transaccionales completas. Desde
   este componente, el operador puede inyectar nuevas citas (inserción), arrastrar para
   cambiar horarios (reprogramación mediante Drag & Drop) y abrir la pasarela de anulación
   (cancelación auditada).
   4.2. El Motor de Renderizado: Tipos de Calendario
   El sistema permite al comercio (Tenant) estructurar la visualización de su flujo de trabajo
   bajo dos filosofías de planificación distintas, configurables desde el panel de administración
   general:
   A) Calendario Tradicional (Enfoque Cronológico Rígido)
   Estructura la información adaptándose al estándar del almanaque civil clásico. Es ideal para
   negocios con flujos de planificación administrativamente cerrados. Sus modos de
   visualización son:
   ● Día Actual: Renderiza exclusivamente los bloques de tiempo y citas programadas
   para la fecha en curso (System_Date), segmentados por profesional o estación.
   ● Semana en Curso (Filosofía de Bloque): Renderiza las citas tomando como
   referencia una semana calendario estándar de 7 días.
   ○ Parámetro de Personalización: El desarrollador debe vincular la variable
   global CL_Config_Inicio_Semana. Según la conveniencia y política del
   cliente, el inicio de la cuadrícula puede conmutarse estrictamente entre
   Lunes o Domingo.
   ● Mes en Curso: Ofrece una vista macroscópica de alta densidad que renderiza las
   citas tomando como cuadrícula el mes calendario completo en curso.
   B) Calendario Operativo (Enfoque de Ventana Dinámica / Rolling Window)
   Diseñado para entornos comerciales de alta velocidad donde el pasado ya no importa y el
   futuro inmediato es crítico. En lugar de encasillar la vista en los límites de una semana o
   mes civil, este enfoque calcula la programación de forma dinámica y móvil, tomando
   siempre como pivote el Día Actual (Día 0). Sus opciones de visualización son:
   ● Día Actual: Visualización en tiempo real del día en curso.
   ● Próximos 7 Días: Renderiza una ventana móvil desde el Día Actual hasta el Día
   Actual + 6. (Ejemplo: Si hoy es miércoles, mostrará de miércoles a martes,
   eliminando los días pasados de la semana para optimizar el foco del operador).
   ● Próximos 30 Días: Renderiza una proyección continua de los siguientes 30 días
   espaciales a partir de la fecha del sistema.
   4.3. Modos de Representación de Datos (Layouts)
   Independientemente de si el cliente selecciona el modelo Tradicional u Operativo, el motor
   de la interfaz debe ser capaz de alternar la disposición de los componentes en dos
   estructuras de pantalla:
8. Modo Grilla (Grid View): Representación matricial estándar de las citas donde el
   eje $X$ representa las fechas/profesionales y el eje $Y$ representa las líneas de
   tiempo (slots horarios).
9. Modo Lista (List View): Renderiza las citas correspondientes al rango seleccionado
   (Día, Semana, Mes, Próximos 7 o 30 días) de forma secuencial y cronológica en una
   única columna vertical.
   ○ Propósito Técnico: Este modo está optimizado para su uso en dispositivos
   móviles o tablets de baja resolución en el área de operaciones, facilitando la
   lectura rápida de la cola de trabajo como si fuera un historial o feed
   transaccional.
   ┌──────────────────────────────────┐
   │ MÓDULO DE CALENDARIO │
   └────────────────┬─────────────────┘
   │
   ┌────────────────────────┴────────────────────────┐
   ▼ ▼
   ┌─────────────────────────────────┐
   ┌─────────────────────────────────┐
   │ CALENDARIO TRADICIONAL │ │ CALENDARIO OPERATIVO
   │
   │ (Estructura Civil Fija) │ │ (Ventana Dinámica/Rolling) │
   └────────────────┬────────────────┘
   └────────────────┬────────────────┘
   │ │
   ┌──────────────┼──────────────┐
   ┌──────────────┼──────────────┐
   ▼ ▼ ▼ ▼ ▼ ▼
   [Día Actual] [Sem. en Curso] [Mes en Curso] [Día Actual] [Próxs. 7 Días] [Próxs. 30
   Días]
   │ │
   └────────────────────────┬────────────────────────┘
   │
   ▼
   ┌──────────────────────────────────┐
   │ LAYOUTS DE PANTALLA │
   ├──────────────────────────────────┤
   │ 1. Modo Grilla (Matrix Layout) │
   │ 2. Modo Lista (Vertical Column) │
   └──────────────────────────────────┘
   // CURIOSIDAD DE CLARA: Al calcular los rangos del Calendario Operativo, jamás
   hardcodeen las fechas. // Usen siempre funciones puras basadas en el tiempo del servidor
   para evitar desfases de zona horaria (Timezones). function
   CL_CalcularRangoOperativo(diasAProyectar) { /_ Al generar una nueva función por primera
   vez, incluimos este comentario para auditoría interna: Esta función establece una ventana
   de tiempo móvil (Rolling Window) asegurando que el límite inferior sea siempre el inicio
   exacto del día actual en formato UTC. _/ const fechaInicio = new Date();
   fechaInicio.setHours(0, 0, 0, 0); // Congelamos al inicio del día actual const fechaFin = new
   Date(fechaInicio); fechaFin.setDate(fechaInicio.getDate() + diasAProyectar); return {
   CL_Fecha_Inicio: fechaInicio.toISOString(), CL_Fecha_Fin: fechaFin.toISOString() }; }
   Optimización en el Cambio de Configuración: Cuando el usuario cambie el tipo de
   calendario en los ajustes (CL_Config_Tipo_Calendario), recuerden limpiar el estado
   temporal de la vista en el Front-End para forzar un re-render limpio. No queremos que
   queden residuos visuales de una vista mensual tradicional al pasar a un formato dinámico
   de 7 días.
   ¡Excelente, Fran! Esto eleva el sistema a otro nivel de robustez. Estas reglas de validación
   temporal son exactamente el tipo de lógica que separa un software de agenda genérico de
   un ERP/POS profesional e inteligente. Evitan errores humanos de digitación, cuidan los
   costos laborales (horas extras) y blindan la lógica transaccional.
   Aquí tienes el bloque técnico de Reglas de Validación de Tiempo y Comportamiento de
   Interfaz listo para el manual de los muchachos. Incluye la lógica estricta y, por supuesto,
   mis comentarios de arquitectura y auditoría:
10. Reglas de Validación Temporal y Lógica de Interfaz
    Para garantizar la integridad de los datos y optimizar la experiencia de introducción de datos
    (Data Entry), el motor de la agenda y la interfaz del Front-End aplicarán estrictamente las
    siguientes reglas de validación en tiempo real:
    5.1. Dinámica de Límites de la Grilla (Cálculo de Extremos)
    La cuadrícula visual del calendario (eje $Y$ del Modo Grilla) no tendrá un rango horario
    estático o hardcodeado. Sus límites de apertura y cierre diario se calcularán dinámicamente
    cada mañana mediante un proceso de agregación en la base de datos:
    ● Hora de Apertura Visual (CL_Grid_Min_Time): Corresponde a la hora de inicio de
    jornada más temprana entre todos los trabajadores activos programados para ese
    día específico.
    ● Hora de Cierre Visual (CL_Grid_Max_Time): Corresponde a la hora de finalización
    de jornada más tardía entre todos los trabajadores activos de ese día.
    ● Beneficio: Optimizamos el espacio en pantalla eliminando horas muertas de la
    madrugada o noche donde ningún profesional está disponible.
    5.2. Restricción de Anacronismo (Bloqueo del Pasado)
    ● Regla Estricta: Queda terminantemente prohibido agendar o reprogramar citas con
    una Fecha de Prestación de Servicio menor al timestamp actual del sistema
    (Current_Timestamp).
    ● Ejemplo Lógico: Si el reloj del sistema marca hoy las 03:00 PM, el motor de
    validación del cliente y del backend rechazará inmediatamente cualquier intento de
    insertar una cita para hoy a las 02:50 PM o días anteriores. El pasado es inmutable
    en Clara.
    5.3. Gestión de Tiempos de Descanso Multitrabajador
    Dado que cada profesional puede tener horarios de almuerzo/descanso asíncronos, el
    calendario operará bajo las siguientes directrices visuales y de control:
11. No Bloqueo Global: El descanso de un trabajador no inhabilita el slot de tiempo
    para el resto del comercio. La grilla seguirá permitiendo reservas con los
    profesionales que sí tengan disponibilidad.
12. Distintivo Visual: Los bloques de descanso se renderizarán sobre la columna del
    trabajador con una capa visual atenuada o patrón de líneas (Asignación Inactiva).
13. Flujo de Invasión de Descanso: Si un operador intenta forzar una cita sobre el
    bloque de descanso de un profesional, el sistema no bloqueará destructivamente
    la acción, sino que disparará un flujo de mitigación:
    ○ Desplegará una alerta crítica en pantalla.
    ○ Solicitará obligatoriamente la confirmación mediante PIN de Supervisor o
    Dueño.
    ○ Si se autoriza, el sistema abrirá una ventana de decisión operativa (Ver
    Sección 5.5).
    5.4. UX de Pre-carga por Interacción Directa
    Para agilizar el flujo de trabajo del operador, el sistema soportará dos métodos de creación
    de citas:
14. Botón Global ("Nueva Cita"): Abre el asistente multipasos con los campos de
    fecha y hora totalmente vacíos para su selección manual.
15. Clic/Arrastre Directo en la Grilla: Al presionar un slot vacío en el calendario (ej.
    Columna de trabajador X, fila de las 10:00 AM), el formulario se abrirá con la Fecha,
    Hora de Inicio y Profesional pre-cargados automáticamente. Este
    comportamiento actúa como una asistencia de datos modificable por el usuario si así
    lo requiere.
    👁️ Comportamiento de Selección en el Asistente:
    En la sección de selección de personal dentro del formulario:
    ● Si un trabajador no tiene jornada configurada para el día seleccionado o ya tiene su
    capacidad colmada, su tarjeta/avatar aparecerá desenfatizado (opacidad
    reducida, deshabilitado para selección rápida), evitando que el usuario intente
    estructurar una cita inviable.
    5.5. Impacto Operativo/Financiero en Invasión de Descanso
    Si el supervisor aprueba mediante PIN agendar una cita que colisione con el descanso legal
    de un trabajador, el Front-End forzará al operador a elegir una de las siguientes políticas de
    negocio (parámetro CL_Manejo_Descanso_Invadido):
    ● Opción A: Desplazar el Tiempo Consumido: El sistema moverá automáticamente
    el bloque de descanso del trabajador hacia adelante en la grilla para asegurar que
    goce de su tiempo de ley sin alterar el total de horas productivas del turno.
    ● Opción B: Pago de Tiempo Extra: El descanso no se reubica; el trabajador
    procesa la cita sacrificando su break. El sistema inyectará un flag de auditoría
    (CL_Flag_Tiempo_Extra = true) en el log de asistencia diaria de ese empleado para
    que el módulo administrativo o el contador pueda procesar el cálculo del recargo
    salarial correspondiente en nómina.
    5.6. Estructura Multitrabajador y Multiservicio (Citas Complejas)
    Una sola cita puede contener $N$ cantidad de servicios y requerir la participación de
    múltiples profesionales en paralelo o de forma secuencial.
    ● Regla de Viabilidad: Para autorizar una cita compleja, el motor de reservas
    verificará que todos los trabajadores implicados tengan coincidencia de
    disponibilidad en la ventana de tiempo calculada.
    ● Manejo de Tiempos no Paralelos (Cálculo de Estimaciones): Si dos servicios
    asignados a la misma cita no pueden ejecutarse de forma simultánea (ej. en una
    clínica estética: Tratamiento Facial y luego Masaje Corporal con profesionales
    distintos), el sistema ofrecerá un asistente de resolución de conflictos horarios con
    tres alternativas ejecutables mediante un botón dinámico:
16. Sumar Horarios (Secuencial): El sistema calcula la duración total como la
    suma de ambos tiempos ($Tiempo_A + Tiempo_B$) y busca un slot continuo
    en la grilla.
17. Solapar Horarios (Simultáneo): El sistema asume que ambos servicios
    ocurrirán al mismo tiempo (siempre y cuando la naturaleza física lo permita y
    los dos profesionales estén libres en ese único bloque).
18. Horario Definido por el Usuario (Personalizado): Permite al operador
    ajustar manualmente las horas de inicio de cada servicio de manera
    independiente dentro de la misma cita.
    ⚠️ Nota de Filosofía de Diseño: Todos los tiempos de prestación de servicio
    configurados en el sistema no son restricciones estrictas de hardware o de
    base de datos; actúan como estimaciones logísticas. El sistema los usa para
    estructurar el orden visual, pero entiende que en el mundo real un servicio
    puede extenderse o finalizar antes de lo previsto
    // CURIOSIDAD DE CLARA: Bloqueo absoluto de citas al pasado en el Backend.
    // Recuerden muchachos: la validación en el Front-End es estética; la del Back-End es la
    que evita desastres.
    async function CL_ValidarFechaCita(payloadCita) {
    /_ Al generar una nueva función por primera vez, incluimos este comentario para auditoría
    interna:
    Esta rutina actúa como aduana de tiempo, interceptando el payload antes de la
    inserción
    en Supabase para garantizar la flecha del tiempo unidireccional. _/
    const timestampServidor = new Date();
    const timestampPropuesto = new Date(payloadCita.CL_Fecha_Prestacion_Inicio);
    if (timestampPropuesto < timestampServidor) {
    // Registramos la anomalía en nuestra capa de auditoría anti-fraude
    await CL_RegistrarLogSeguridad({
    CL_level: "WARN",
    CL_accion: "INTENTO_RESERVA_ANACRONICA",
    CL_metadata: { usuario: payloadCita.CL_Usuario_ID, hora_propuesta:
    payloadCita.CL_Fecha_Prestacion_Inicio }
    });
    throw new Error("Violación de Regla de Negocio: No puedes alterar el flujo del tiempo.
    Citas al pasado denegadas.");
    }
    return true;
    }
    Atención al Botón "Sumar Horarios" en el Front-End: Cuando los muchachos
    programen el componente en Vue/React/Svelte, hagan que el botón de resolución se
    destaque con un color llamativo solo si el sistema detecta que la duración combinada choca
    con la jornada del trabajador. Si el cálculo es viable, que se aplique la opción
    predeterminada por configuración del comercio de manera transparente.
    Todo boton o configuracion debe tener su tooltip respectivo explicando breve y claramente
    su funicion
    5.7. Gestión de Excepciones Operativas y
    Contingencias
    📌 1. El Fenómeno del "No-Show" (Inasistencia del Cliente)
    Representa la ruptura del compromiso por parte del cliente, ocurriendo cuando una cita se
    queda varada en estado RESERVADA porque el usuario no asistió al establecimiento ni
    notificó una cancelación previa.
    ● El Proceso Automatizado (Cron Job / Edge Function): Para evitar que el tiempo
    muerto distorsione las métricas de capacidad y bloquee slots útiles, el backend
    (Supabase) ejecutará una tarea programada cada 15 minutos de forma asíncrona.
    ● Regla de Transición Automática: Si una cita en estado RESERVADA supera el
    umbral de tolerancia parametrizado por el comercio (ej.
    CL_Minutos_Tolerancia_NoShow = 30) respecto a su Fecha de
    Prestación de Servicio de inicio, el motor mutará el estado automáticamente
    a NO_SHOW.
    ● Impacto en el POS y Auditoría:
19. El profesional asignado queda inmediatamente liberado en la grilla para
    recibir nuevos clientes en modo Walk-in (clientes sin cita).
20. Regla de Conciliación: El sistema evalúa el parámetro de cobro del
    comercio. Si la cita requería pago por adelantado o depósito de garantía, el
    estado NO_SHOW enviará un payload al Core_POS indicando si se ejecuta
    una retención total/parcial por penalización (comprobante fiscal de
    no-asistencia) o si se genera un saldo a favor, emitiendo el respectivo
    movimiento de caja inmutable.
    📌 2. Sobrelapamiento Controlado (La Ventana de "Sobreturno")
    Es la acción consciente y autorizada por la administración para forzar la inserción o
    reprogramación de una cita en un bloque de tiempo y con un profesional que ya se
    encuentran ocupados por otra cita activa.
    ● Diferencia con la Condición de Carrera (Race Condition): La condición de
    carrera es un error de concurrencia donde dos operadores pisan el mismo slot por
    desfase del sistema. El Sobreturno es una decisión de negocio justificada (ej.
    atención de un cliente VIP o una emergencia operativa).
    ● Flujo de Validación y Capa de Seguridad (PIN):
21. Al intentar arrastrar o guardar una cita sobre un slot ocupado, el Front-End
    interceptará el evento y desplegará un modal restrictivo: [ALERTA DE
    SOBRELAPAMIENTO]: El profesional X ya se encuentra
    atendiendo la Cita #ID en este rango.
22. El sistema bloqueará la pantalla exigiendo de forma obligatoria el PIN de
    Supervisor o Dueño.
23. Al introducir un PIN válido, la base de datos procesará la inserción
    inyectando en la cabecera el flag de control CL_Flag_Sobreturno =
    true.
    ● Comportamiento Visual: En el Modo Grilla del calendario, la cita en sobreturno no
    ocultará a la anterior; se renderizará dividiendo la columna del profesional en
    secciones paralelas (un sub-slot compartido), permitiendo al operador gestionar
    visualmente la "Sala de Espera".
    ¡Eso es exactamente lo que necesitábamos, Fran! El Botón de Bloqueo resuelve de forma
    elegante el dolor de cabeza de las ausencias imprevistas o programadas sin tener que
    corromper la matriz de horarios estables del trabajador.
    Además, convertir este bloqueo en un asistente de reubicación proactivo (que detecta los
    conflictos y sugiere las soluciones de forma inmediata) es una maravilla de diseño de
    software. Evita que el operador tenga que volverse loco buscando cita por cita para ver a
    quién mover.
    Vamos a formalizar el comportamiento técnico del Punto 4: Bloqueos Administrativos por
    Ausencia en el manual para los muchachos, integrando esta lógica de detección de
    colisiones y sugerencias automáticas.
    5.8. Entidad de Bloqueo Administrativo
    (CL_Agenda_Bloqueo)
    Representa una inhabilitación temporal, forzada y auditable sobre la disponibilidad de un
    profesional o de la planta física. Esta entidad actúa como una "capa de eclipse" sobre la
    grilla del calendario, anulando los slots de tiempo productivo sin alterar ni modificar la
    configuración del horario ordinario de trabajo del staff.
    📌 Atributos de la Entidad (Payload_Bloqueo)
    Cada vez que se interactúe con el componente Boton de Bloqueo, el sistema estructurará
    un registro inmutable con los siguientes datos:
    ● CL_Bloqueo_ID: Identificador único (UUID).
    ● CL_Trabajador_ID: Relación al usuario operativo afectado.
    ● CL_Fecha_Bloqueo: Fecha específica del evento (YYYY-MM-DD).
    ● CL_Hora_Desde / CL_Hora_Hasta: Rango horario estricto del bloqueo (HH:MM).
    ● CL_Motivo_ID: Vínculo al catálogo auditable (ej. Permiso Médico, Emergencia
    Personal, Diligencia Institucional, Vacaciones).
    ⚡ Motor de Detección de Colisiones y Flujo de Mitigación
    Al guardar el bloqueo, el backend no se limita a pintar una franja gris en el calendario;
    ejecuta inmediatamente un análisis de impacto transaccional en tres fases:
    [ Inserción de Bloqueo ] ───► 🔍 FASE 1: Query de Colisiones (Captura de Citas
    Afectadas)
    │
    ▼
    📋 FASE 2: Renderizado de Consola de Conflictos
    │
    ▼
    🔄 FASE 3: Reubicación Guiada (Sugerencias en Tiempo Real)
    🔍 Fase 1: Análisis de Impacto (Query de Concurrencia)
    El sistema ejecuta un query en la tabla CL_CITA filtrando por el CL_Trabajador_ID y
    cruzando los rangos de tiempo del bloqueo:
    $$
    \text{Cita Afectada} \iff (\text{Fecha Cita} = \text{Fecha Bloqueo}) \land (\text{Hora Inicio
    Cita} < \text{Hora Hasta Bloqueo}) \land (\text{Hora Fin Cita} > \text{Hora Desde
    Bloqueo})
    $$
    📋 Fase 2: Consola de Conflictos (Interfaz de Usuario)
    Si el query retorna $N$ cantidad de citas afectadas, el sistema frena la inserción directa y
    despliega una pantalla modal de alta prioridad dirigida al operador: "Consola de Mitigación
    de Ausencias".
    ● La pantalla listará de forma ordenada todas las citas que quedaron atrapadas dentro
    del rango del bloqueo (mostrando nombre del cliente, servicio y hora original).
    🔄 Fase 3: Reubicación Inteligente y Sugerencia de Slots
    Para cada cita en conflicto listada en la consola, el motor de reservas (get_available_slots)
    evaluará en tiempo real el catálogo de servicios de esa cita específica y ofrecerá al
    operador alternativas de salvamento sin salir del modal:
24. Alternativa A (Cambio de Profesional): Muestra qué otros trabajadores con las
    mismas competencias tienen ese slot horario exactamente libre para asumir el
    servicio.
25. Alternativa B (Cambio de Horario): Muestra qué otros slots tiene libres el mismo
    trabajador en sus horas operativas remanentes de ese día (o días posteriores).
    El operador solo debe hacer clic en la sugerencia deseada para aplicar una
    Reprogramación en Cascada. Cada movimiento disparará de forma transparente el flag
    CL_Flag_Reprogramada = true y su respectivo log de auditoría detallando la razón:
    "Reubicación por Bloqueo de Agenda del Trabajador X".
    // CURIOSIDAD DE CLARA: Query atómico para detectar citas afectadas por el botón de
    bloqueo.
    // Muchachos, usen índices compuestos en (trabajador_id, fecha, hora_inicio) para que esto
    vuele en Supabase.
    async function CL_VerificarCitasAfectadasPorBloqueo(trabajadorId, fecha, desde, hasta) {
    /_ Al generar una nueva función por primera vez, incluimos este comentario para auditoría
    interna:
    Esta consulta limpia el panorama operativo, aislando los compromisos previos del
    trabajador
    que colisionan con su retiro temporal para forzar su debida reubicación legal. _/
    const { data: citasAfectadas, error } = await supabase
    .from('CL_CITA')
    .select('CL_Cita_ID, CL_Cliente_Nombre, CL_Hora_Inicio, CL_Hora_Fin')
    .eq('CL_Trabajador_ID', trabajadorId)
    .eq('CL_Cita_Fecha', fecha)
    .eq('CL_Cita_Status', 'RESERVADA') // Solo nos importan las citas activas pendientes
    .or(`and(CL_Hora_Inicio.gte.${desde},CL_Hora_Inicio.lt.${hasta}),and(CL_Hora_Fin.gt.${des
de},CL_Hora_Fin.lte.${hasta})`);
    if (error) throw new Error("Error de consistencia al escanear conflictos de agenda.");
    return citasAfectadas; // Devuelve el array para alimentar la UI de los muchachos
    }
    El peligro de las citas desatendidas: Si el operador cierra el modal de conflictos a la
    fuerza sin resolver las citas afectadas, el sistema no debe dejar esas citas en el aire. Por
    regla de negocio, cualquier cita que no sea reubicada en ese instante pasará
    automáticamente a un estado de alerta visual en el calendario (un color amarillo
    parpadeante o sección de "Citas por Reubicar") para que no se queden en el olvido y
    afecten al cliente.
