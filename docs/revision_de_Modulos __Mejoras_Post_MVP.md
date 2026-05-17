Proyecto Nexo21: Revisión de Módulos y
Mejoras Post-MVP
Sistema: ClaraPOS (Arquitectura Multi-tenant) Enfoque: Optimización de UX/UI y
Robustez de Datos
Módulo de Inventario:

1. Gestión de Departamentos
   1.1. Descripción General
   El sub-módulo de Departamentos constituye la base de la jerarquía del inventario. Su
   correcta configuración es crítica para la integridad de los reportes financieros y la
   organización del catálogo de productos.
   1.2. Especificaciones de Implementación y Mejoras
   A. Importación Masiva de Datos (Batch Processing)
   ● Funcionalidad: Implementar un componente de carga para archivos con extensión
   .xlsx o .csv.
   ● Estructura de Datos Requerida: La matriz de importación solo debe requerir la
   columna nombre_departamento.
   ● Lógica de Negocio:
   ○ Generación de Identificadores: El sistema debe calcular automáticamente
   el código interno correlativo. Si existen 5 departamentos y se importan 3, los
   nuevos registros deben asumir los índices 6, 7 y 8 consecutivamente.
   ○ Estado por Defecto: Todo registro creado vía importación masiva se
   marcará con el flag is_active: true.
   B. Normalización y Sanitización de Inputs
   Para garantizar la auditabilidad y evitar errores en las consultas de base de datos, se
   aplicarán las siguientes reglas estrictas:
   ● Transformación de Texto: Aplicar el método .toUpperCase() en el frontend y
   validarlo en el backend antes de la persistencia para asegurar uniformidad estética y
   de búsqueda.
   ● Restricciones de Caracteres:
   ○ Permitidos: Alfanuméricos (A-Z, 0-9) y espacios simples.
   ○ Prohibidos: Caracteres especiales como /?\*-+, puntos o comas. Se debe
   implementar una Regex a nivel de Middleware para rechazar cualquier
   petición que contenga estos símbolos.
   ● Seguridad de Capas: Validación redundante en Frontend (UI Feedback),
   Middleware (Seguridad de API) y Backend (Integridad de DB en Supabase).
   1.3. Sugerencias de Mejora Adicionales
   Detección de Duplicados en Tiempo Real:
   ● Al importar o crear manualmente, el sistema debe realizar una búsqueda por
   "Levenshtein Distance" o similitud para advertir al usuario si está intentando crear
   "REFRESCOS" y ya existe "REFRESCO". Evita la redundancia de datos desde el
   inicio
   Audit Log de Creación:
   ● Incluir en la tabla de departamentos los campos created_by y updated_by,
   vinculados al ID del usuario de la sesión, para saber exactamente quién realizó la
   importación masiva.
   Previsualización de Importación:
   ● Antes de procesar el archivo Excel, mostrar una tabla temporal (modal) con los datos
   mapeados para que el usuario confirme la acción antes de afectar la base de datos
   productiva.
2. Gestión de Depositos
   A. Especificaciones de Importación Masiva
   ● Columnas del Archivo:
   ○ nombre_deposito (Obligatorio)
   ○ direccion (Opcional)
   ○ es_principal (Booleano: SI/NO o 1/0)
   ○ permite_venta (Booleano: SI/NO o 1/0)
   ● Lógica de Negocio y Restricciones:
   ○ Regla de Oro de Unicidad: Solo puede existir un registro con
   es_principal: true.
   ○ Validación en Importación: Si el archivo Excel trae varios registros
   marcados como "Principal", el sistema solo tomará el primero y marcará el
   resto como false. Si ninguno viene marcado, se mantendrá el depósito
   creado por defecto en la instalación.
   ○ Integridad de Venta: Si permite_venta es true, el depósito aparecerá
   como origen de stock en el módulo de Facturación.
   B. Sanitización en Tres Niveles (Protocolo de Seguridad Clara)
   Para evitar que un usuario "creativo" inyecte código o dañe la estética de la base de datos:
3. Nivel 1: Frontend (React/Vue/Componente UI)
   ○ Máscaras de Entrada: Bloquear caracteres como < > ; ' " mientras el
   usuario escribe.
   ○ Visual Feedback: Si el nombre es demasiado largo o contiene símbolos, el
   botón "Guardar" se deshabilita automáticamente.
4. Nivel 2: Middleware (API Gateway / Node.js)
   ○ Schema Validation: Usar una librería como Joi o Zod para verificar que los
   tipos de datos sean correctos (ej: que permite_venta sea realmente un
   booleano y no un string malicioso).
   ○ Trimming: Eliminar espacios en blanco innecesarios al inicio y final de cada
   cadena.
5. Nivel 3: Backend (Supabase / Postgres)
   ○ Stored Procedures / Triggers: Un trigger en la base de datos verificará
   antes de cada INSERT o UPDATE que no exista más de un is_principal
   = true por cada tenant_id.
   ○ Constraints: Aplicar CHECK constraints para asegurar que los campos
   obligatorios no lleguen vacíos tras la sanitización.
   2.1. Propuestas de Implementación Post-MVP
   Transferencia Rápida entre Depósitos:
   ● Un botón de "Traspaso Express" que genere el movimiento de inventario y la planilla
   de registro (digital o impresa) para que el chofer la lleve consigo.
   Funcionalidad de Ordenamiento (Data Sorting)
   ● Comportamiento: Todas las cabeceras de columna (Nombre, Dirección, Venta,
   Principal) deben actuar como disparadores de ordenamiento.
   ● Lógica de Interacción:
   ○ Primer Clic: Orden ascendente (A-Z / 0-9).
   ○ Segundo Clic: Orden descendente (Z-A / 9-0).
   ○ Indicador Visual: Se debe mostrar un icono sutil (flecha hacia arriba/abajo)
   al lado del nombre de la columna activa para que el usuario sepa bajo qué
   criterio se están visualizando los datos.
   Independientemente de cómo el usuario ordene la tabla, el Depósito Principal debe tener
   la opción de quedarse siempre en la primera fila (Sticky Row) si el usuario así lo desea.
   Estado de la Tabla en Memoria:
   ● Si Fran ordena por "Nombre" y sale del módulo para ir a Facturación, cuando vuelva,
   el sistema debería recordar ese orden. Podemos usar localStorage para guardar
   la preferencia del usuario y que no tenga que hacer clic de nuevo.
6. Gestión de Unidades
   A. Estrategia de Carga Inicial (UX Optimization)
   ● Implementación Sugerida: Eliminar la necesidad del botón manual "Cargar
   Predeterminadas".
   ● Lógica Automática: En el momento en que se crea el tenant (empresa) a través del
   Wizard, el sistema debe insertar automáticamente un set básico de unidades
   universales.
   ○ Mínimas: UNIDAD (UND, no fraccionable) y KILOGRAMO (KG, fraccionable).
   ● Beneficio: El usuario puede empezar a facturar inmediatamente. El botón de
   "Cargar Predeterminadas" podría quedar oculto en una sección de "Configuración
   Avanzada" o "Recuperación de Datos" por si el usuario borra todo por error.
   B. Especificaciones de Importación Masiva
   ● Columnas del Archivo: nombre_unidad, abreviatura, permite_decimales
   (Boolean).
   ● Lógica de Negocio:
   ○ Normalización: Todas las abreviaturas deben tener un máximo de 3 a 5
   caracteres para no romper la estética de las etiquetas de precios.
   ○ Control de Decimales: Si una unidad no permite decimales (ej. BOLSA), el
   sistema debe bloquear cualquier intento de vender 1.5 unidades en el punto
   de venta.
   C. Sanitización y Reglas de Negocio (3 Capas)
   ● Transformación: Todo a .toUpperCase() para evitar que tengamos "und", "Und"
   y "UND" mezclados.
   ● Restricción Alfanumérica: Solo letras y números. Evitar símbolos que puedan
   confundir al motor de base de datos o al generar reportes en Excel.
   ● Sorting: Implementar el ordenamiento dinámico en las cabeceras Nombre,
   Abreviatura y Decimal para facilitar la búsqueda rápida.
   Sugerencias de Mejora "Extra"
   Factores de Conversión (Multi-unidades):
   ● Esto es vital. Imagina que el usuario compra por "CAJA" pero vende por "UNIDAD".
   El sistema debería permitir definir que 1 CAJA = 12 UNIDADES. Al cargar la compra
   en Cajas, el inventario debe subir automáticamente en Unidades.
   Protección de Unidades en Uso (Seguridad Auditable):
   ● Regla de Oro: Si una unidad ya tiene movimientos de inventario o productos
   asociados, no se puede eliminar. Solo se puede "Desactivar". Si la borras,
   descuadras todo el histórico contable. Hay que poner un candado lógico ahí.
   Búsqueda Rápida (Filtro Inline):
   ● Un pequeño input de búsqueda sobre la tabla. A medida que el usuario escribe "K",
   la tabla se filtra y solo muestra "KILOGRAMO". Es un detalle de calidad que los
   usuarios agradecen mucho.
7. Productos y servicios
Importación de Inventario y Ajustes Iniciales
A. Flexibilidad en la Carga (Stock Inicial)
● Funcionalidad: Se añade la columna opcional stock_inicial a la plantilla de
importación si el usuario decide hacer la carga inicial de stock desde la importacion
● Lógica de Negocio: \* Si el campo stock_inicial tiene un valor $> 0$, el sistema
generará automáticamente un Ajuste de Entrada por Inventario Inicial vinculado al
depósito marcado como "Principal".
● Auditabilidad: Este movimiento quedará registrado con el concepto "CARGA
INICIAL DE SISTEMA" para diferenciarlo de una compra a proveedor.
B. Resolución de Departamentos (Manejo de Errores Humanos)
● Identificación por Nombre: El sistema buscará el departamento por Nombre (Case
Insensitive), no por ID.
Protocolo de "Departamento No Encontrado":
● No crear automáticamente: Si el usuario escribe "REFRESCO" y luego
"REFRESCOS", tendríamos duplicidad por error ortográfico.
● Interfaz de Mapeo (Intercepción): Si hay nombres que no coinciden, el sistema
mostrará una pantalla intermedia: "El departamento 'BEBIDAS' no existe. ¿Deseas
mapearlo a uno existente (BEBIDAS FRIAS) o crearlo como nuevo?".
● Opción Segura: Si el usuario no quiere resolverlo en el momento, esa fila se marca
como "Error" y se permite importar el resto, generando un log de fallos descargable.
C. Sanitización y Seguridad
las reglas de sanitización para carga masiva son:
● Type Casting Estricto: Si la columna precio trae un texto o un símbolo de
moneda ($), el middleware debe limpiarlo y convertirlo a numeric antes de llegar a
la base de datos.
● Validación de Rango: No permitir costos negativos ni stocks absurdos (ej.
1.000.000.000) que puedan ser intentos de desbordamiento de memoria (Buffer
Overflow).
● Cross-Site Scripting (XSS) Prevention: Eliminar etiquetas HTML o scripts (ej.
<script>) que puedan venir ocultos en las descripciones de los productos.
● Batch Limit: Limitar la importación a bloques de 500 registros por vez para evitar
que un usuario malintencionado bloquee el hilo de ejecución del servidor (DoS).
Mejoras Sugeridas (Nivel Corporativo/Seguridad)
Control de Unicidad por Código de Barras:
● Si el Excel trae dos productos con el mismo código de barras o SKU, el sistema
debe rebotarlos.
Carga de Imágenes vía URL:
● Permitir una columna donde el usuario pegue un link de imagen. El backend de
ClaraPOS se encargará de descargarla y alojarla en tu bucket de Supabase.
Manejo de Impuestos por Defecto:
si el usuario decide usar la capa fizcal
● Si el usuario no especifica el impuesto en el Excel, el sistema debe asignar el
impuesto por defecto de la empresa (ej. IVA 16%) para asegurar que no queden
productos "exentos" por error de carga.
Para evitar archivos peligrosos, no confíes solo en la extensión .csv o .xlsx
// Comentario de Clara: Validación de MIME Type y Peso
const CL_ValidateFile = (file) => {
const allowedTypes = ['text/csv',
'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
if (!allowedTypes.includes(file.type)) {
throw new Error("Formato no permitido. ¡Intenta con algo menos sospechoso, Fran!");
}
if (file.size > 5 * 1024 * 1024) { // 5MB límite
throw new Error("Archivo demasiado pesado. ¡Ni que estuviéramos importando el
inventario de Amazon!");
}
};
Sugerencias de Mejora "Extra"
Optimización de Performance y Ordenamiento de Datos
A. Protocolo de Inserción Masiva (Bulk Operations)
● Implementación: Se prohíbe el uso de bucles (foreach o map) que disparen
peticiones individuales a la API durante la importación.
● Procedimiento: El frontend debe parsear el archivo completo, validar los datos y
enviar un único JSON Array al endpoint de Supabase.
○ Ventaja: Se reduce el overhead de red y se garantiza la atomicidad (si un
registro crítico falla, se puede revertir la carga completa mediante una
transacción).
Manejo de Transacciones (All or Nothing):
● Si el usuario está cargando 500 productos y la luz parpadea o internet falla en el
registro 499, no queremos que la base de datos quede a medias. Al usar Bulk
Insert, nos aseguramos de que o entran todos, o no entra ninguno. Así evitamos
duplicados en un segundo intento.
Feedback de Progreso (Progress Bar Real):
● Aunque ahora será mucho más rápido, para cargas de 5,000 registros es vital
mostrar una barra de progreso.
Debounce en el Ordenamiento:
● Si el usuario hace clic frenéticamente en la cabecera de la tabla, aplicaremos un
pequeño retraso (debounce) para no saturar el renderizado de la UI.
Corrección de Lógica de Ordenamiento (Sorting) tabla de productos
● Campo codigo_interno: Se define como tipo numérico estrictamente para
asegurar que el ordenamiento siga la secuencia lógica (1, 2, 10, 11...) y no la
alfabética (1, 10, 100...).
● Tratamiento de Nulos: En caso de códigos manuales no asignados, estos se
enviarán al final de la lista para no entorpecer la visualización del stock activo.
edición desde la pantalla de previsualización
● permitir ajustar los errores desde la pantalla de previsualización (evaluar las
debilidades de implementar este método, frente a solicitar al usuario corregir
el archivo original y resubir
Excluir productos de ejemplo de la importación
● la plantilla de importación tiene registros de ejemplo, si el usuario olvida borrarlos,
estos no deberían ser reconocidos por el módulo de importación y avisar al usuario
que no se importaran ya que son datos de ejemplo
Botón con logs de error
● agregar un botón para exportar en formato texto, pdf o similar un mensaje de log con
los errores de importación antes de que el usuario los ejecute, en caso de que se le
está brindando asistencia remota para la importación, de esta manera el usuario
puede simplemente copiar y pegar el error en el chat con su asistente
previsualización de stock mínimo
● agregar el campo de stock mínimo en la ventana de previsualización del módulo de
importación de productos
Ordenes de compra
● agregar la funcionalidad de orden de compra automática o asistida (un reporte
generado entre el inventario mínimo y el inventario actual, puede ser necesario
agregar un campo de inventario máximo o deseado para automatizar esta sección
correctamente, o implementar algoritmos para medir la rotación de inventario)
8. CONFIGURACION
   Módulo de Configuraciones: Identidad y Fiscalidad
   A. Sincronización con el Wizard (Onboarding Flow)
   ● Automatización: Los datos capturados en el Wizard de Instalación (Paso 1/6)
   deben persistir directamente en la tabla CL_CompanyProfile.
   ● Estado: El usuario solo debería entrar a esta sección para corregir o añadir
   detalles (como el logo o la dirección fiscal exacta), no para reescribir lo que ya puso
   al inicio.
   B. Optimización del RIF y Campos Fiscales
   ● Unicidad del Dato: El RIF se solicitará únicamente en Datos Generales. A nivel de
   base de datos, este campo actuará como el identificador fiscal primario.
   ● Máscara de Entrada: Implementar validación automática (Ej: J-12345678-9). Si el
   usuario no cumple el formato, el tooltip debe activarse inmediatamente.
   C. Lógica de Retenciones (Contexto Contable)
   ● Input Inteligente: El campo "Porcentaje de Retención IVA" estará oculto por
   defecto.
   ● Disparador: Solo se mostrará si el Checkbox Contribuyente Especial está
   activo.
   ● Restricción de Edición: Al ser un valor de ley (generalmente 75% o 100%),
   eliminaremos las flechas de incremento (type="number" sin controles) para evitar
   errores accidentales
   Secciones Necesarias (Contexto Venezolano)
   Tipo de Contribuyente (Selector):
   ● Opciones: Ordinario, Especial, Formal o Exento. Esto automatiza si el sistema debe
   calcular el IGTF (3%) en los pagos con divisas o no.
   Datos de Contacto para Soporte Interno:
   ● Un campo para el correo del contador. Así, cuando haya que sacar un reporte
   pesado, el sistema puede tenerlo "a la mano" para envíos automáticos.
   Logo para Documentos Fiscales:
   ● Un cargador de imágenes que optimice el logo a blanco y negro (o escala de grises)
   para que las facturas impresas en tickeras térmicas se vean nítidas y profesionales.
   UX: Tooltips e Interfaz Humana
   Implementaremos Tooltips estratégicos en:
   ● RIF: "Ejemplo: J-12345678-0. Asegúrate de incluir el guion final".
   ● Contribuyente Especial: "Activa esta opción solo si el SENIAT te ha designado
   como Agente de Retención".
   ● Moneda Base: "Es la moneda en la que se expresarán tus reportes financieros".
   Gestión de Secuencias y Talonarios Fiscales
   A. Configuración de Puntos de Emisión
   En lugar de un campo suelto, crearemos una pequeña tabla de Rangos Autorizados. Esto
   permite que si el negocio crece y tiene dos cajas (Punto A y Punto B), cada una lleve su
   propia numeración.
   ● Campos Requeridos:
   ○ Serie: (Ej: "A", "001"). Opcional, pero da orden.
   ○ Número de Control Inicial: El número que el SENIAT imprimió en el
   talonario físico o asignó a la máquina.
   ○ Número de Factura Inicial: Para que el usuario pueda empezar, por
   ejemplo, desde la factura "000501" si ya venía usando otro sistema.
   ○ Próximo Número (Internal Counter): El sistema lo incrementa
   automáticamente con cada venta exitosa.
   B. Lógica de "Candado Fiscal" (Auditoría)
   Para evitar que un usuario "borre" una factura y use ese número para otra cosa
   Correlatividad Estricta: El sistema no permitirá saltarse números.
   Anulación, no Eliminación: Si una factura está mal, se genera una Nota de Crédito o se
   marca como Anulada, pero el registro físico en la base de datos permanece.
   Validación de Formato: Asegurar que los números de control siempre tengan el formato de
   8 dígitos (Ej: 00-000001) para que los reportes de ventas salgan perfectos.
   "Modo de Prueba" vs "Modo Producción"
   Como estamos enfocándonos en la simplicidad del usuario final:
9. Modo Entrenamiento/Draft: Por defecto, al instalar la app, los números de factura
   no afectan el contador legal. Esto permite al usuario "jugar" con el sistema sin miedo
   a dañar su contabilidad.
10. Activación Fiscal: Un botón grande que diga "Activar Facturación Legal". Al
    presionarlo, el sistema pide los datos del talonario y, a partir de ahí, los números se
    vuelven inmutables.
    Alerta de "Talonario por Vencer":
    ● Si el usuario carga que su talonario llega hasta la factura 1000, cuando llegue a la
    950, ClaraPOS le envía una notificación: "¡Oye, Fran! Te quedan 50 facturas. Hora
    de mandar a imprimir el próximo talonario".
    Manejo de Notas de Débito/Crédito:
    ● Asegurarnos de que tengan su propia secuencia independiente, tal como lo exige la
    providencia administrativa actual.
    IGTF (Impuesto a las Grandes Transacciones Financieras):
    ● Como estamos en Venezuela, la configuración de la factura debe incluir el flag de
    "Cálculo automático de IGTF 3%" si el método de pago seleccionado es divisas en
    efectivo. Esto debe aparecer claramente desglosado en el pie de la factura.
11. TASA DE CAMBIO
    La sección de tasa de cambio se puede integrar a la sección de datos de empresa como
    una pestaña más,
    Configuración de Moneda de Referencia (BCV):
    ● Un selector para definir si el sistema debe buscar automáticamente la tasa del BCV
    o si el usuario la cargará manualmente. Esto es vital para lo que hablamos de los
    costos en USD.
    ● Eliminar las flechas del input y la posibilidad de modificar el monto al hacer scroll con
    el mouse
    ● al entrar a la sección no ejecutar automáticamente la consulta de las últimas 10
    tasas, agregar un botón de consultar últimas 10, o una histórica entre intervalo de
    fechas no mayores a 3 meses, para evitar enviar consultas pesadas o innecesarias
    al servidor
    Módulo de Usuarios, Roles y Seguridad
    A. Flujo de Creación en Wizard (Onboarding de Equipo)
    ● Pantalla Equipo de Trabajo:
    ○ Usuario Maestro: Se confirma el Admin creado por defecto.
    ○ Plantillas Predefinidas: El sistema ofrecerá un botón de "Carga Rápida" para
    roles comunes:
    ■ CAJERO(A): Solo Ventas, Apertura/Cierre de Caja. Sin acceso a
    Costos ni Configuraciones.
    ■ SUPERVISOR: Ventas, Anulaciones, Devoluciones y Reportes de
    inventario.
    ○ Tutorial Integrado: Un componente de "Guía Paso a Paso" (Overlay) que
    señale los campos críticos al crear el primer usuario adicional.
    B. Sistema de Doble Autenticación Interna (PIN de Seguridad)
    ● Funcionalidad: Además de la contraseña principal (para el login), cada usuario podrá
    tener un PIN de 4 a 6 dígitos.
    ● Casos de Uso:
    ○ Login Rápido: Permite a la cajera cambiar de turno o bloquear su pantalla sin
    cerrar sesión completamente.
    ○ Autorización de Supervisor: Cuando un cajero intenta una "Acción Sensible"
    (borrar ítem de factura activa, aplicar descuento mayor al 10%, anular
    factura), el sistema lanzará un modal pidiendo el PIN del Supervisor.
    ● Seguridad: El PIN debe almacenarse con hash (encriptado) en la base de datos,
    igual que la contraseña.
    C. Rediseño de la Interfaz de Roles (UX Refactor)
    Para evitar la confusión de los botones, separaremos la pantalla en dos vistas o pestañas
    claras:
12. Pestaña "Gestión de Roles": Aquí se crean las "plantillas" de permisos (ej.
    "Vendedor Nocturno"). Es una estructura de configuración pura.
13. Pestaña "Asignación de Usuarios": Aquí se listan los trabajadores y se les vincula un
    rol existente mediante un selector (Dropdown).
14. Diferenciación Visual: Los botones para "Crear Nuevo Rol" y "Registrar Nuevo
    Trabajador" deben tener colores o ubicaciones distintas para que el usuario entienda
    que son entidades diferentes.
    1.19. Matriz de Permisos Sugerida (Nivel Pro)
    Para que ClaraPOS sea profesional, los permisos no deben ser "todo o nada". Deben ser
    granulares:
    ● Ver Costos: (Privacidad financiera).
    ● Modificar Precios de Venta: (Evitar fugas de dinero).
    ● Aplicar Descuentos: (Control de margen).
    ● Ver Reportes de Utilidad: (Solo para dueños/gerentes).
    1.20. Sugerencias
15. Bitácora de Acciones por PIN:
    ○ Cada vez que se use un PIN de supervisor para autorizar algo, el sistema
    debe guardar un log: "El Supervisor [Fran] autorizó la eliminación de
    [Coca-Cola 1.5L] en la Factura #105 a las 14:00h".
16. Sesiones Concurrentes:
    ○ Debemos configurar si un mismo usuario puede estar logueado en dos
    dispositivos a la vez. Para una cajera, lo ideal es que no, para evitar que se
    compartan cuentas.
17. Mini-Tutorial
    ○ En lugar de un manual aburrido, podemos usar "Tooltips dinámicos" que se
    activen la primera vez que el Admin entra al módulo: "¡Hola! Aquí es donde
    delegas el trabajo para que tú puedas dedicarte a gerenciar. Empieza
    creando un rol de Cajero".
18. Gestión de Impuestos y Parámetros Fiscales
    A. Integración de Interfaz (UI Consolidation)
    ● Ubicación: El submódulo de Impuestos se integrará como una pestaña
    adicional dentro de la sección "Configuraciones de Empresa".
    ● Propósito: Centralizar toda la información que afecta la legalidad y el cálculo
    de precios en un solo lugar.
    B. Optimización del Modal de Creación
    Para evitar errores de carga y asegurar la integridad de los datos, aplicaremos las
    siguientes restricciones:
    ● Sanitización del Nombre: El input nombre_impuesto (Ej: IVA, IGTF,
    Municipal) solo aceptará caracteres alfanuméricos y espacios simples. Se
    aplicará .toUpperCase() automáticamente para estandarizar (Ej: "iva 16%"
    → "IVA 16%").
    ● Control de Inputs Numéricos: \* Se deshabilitarán las flechas de
    incremento/decremento (spinners) en el campo de alícuota/monto.
    ○ Se bloqueará la modificación de valores mediante el scroll del mouse
    para prevenir cambios accidentales mientras el usuario navega por el
    modal.
    ○ El input solo aceptará valores entre 0 y 100 (para porcentajes).
    C. Simplificación de la Terminología (El "Código SENIAT")
    ● Análisis Técnico: El campo "Código SENIAT" es una referencia técnica para
    archivos XML o reportes de máquinas fiscales. Para el usuario común, es
    ruido innecesario.
    ● Acción Sugerida: Ocultar este campo bajo un botón de "Opciones
    Avanzadas" o renombrarlo como "Identificador Fiscal (Opcional)". Si el
    sistema no va a generar archivos TXT específicos para contabilidad externa
    en esta fase, se recomienda eliminarlo para no abrumar al usuario.
    D. Carga Predeterminada (Localización Venezolana)
    Para facilitar el onboarding, el sistema vendrá con los siguientes impuestos
    pre-configurados:
    ● IVA General (16%): Marcado como impuesto por defecto.
    ● IVA Reducido (8%) e IVA Lujo (31%): Disponibles pero inactivos.
    ● IGTF (3%): Configurado para aplicarse exclusivamente sobre métodos de
    pago en divisas.
    ● Exento (0%): Para productos de la cesta básica o servicios no gravados.
    Sugerencias de Mejora
19. Protección de Impuestos con Historial:
    ○ Regla Inmutable: Un impuesto que ya ha sido utilizado en una factura
    no puede ser eliminado. Solo puede "Desactivarse". Esto es vital
    para que, al reimprimir una factura de hace 6 meses, el sistema sepa
    qué impuesto se aplicó en ese momento.
20. Impuestos Compuestos / Retenciones:
    ○ Podríamos agregar una pequeña nota informativa en la pestaña que
    explique que el IGTF solo se activa si el pago se recibe en una
    moneda distinta a la base (Bolívares), para que el usuario no se asuste
    pensando que se le cobrará a todo el mundo.
21. Tooltip de Ayuda Fiscal:
    ○ Agregar un tooltip en el campo de monto: "Ingresa el valor porcentual
    sin el símbolo %. Ejemplo: Para 16% ingresa 16".
    A. Integración de Interfaz (UI Consolidation)
    ● Ubicación: El submódulo de Precios se integrará como una pestaña
    estratégica dentro de la sección "Configuraciones de Empresa".
    ● Propósito: Centralizar las reglas de cálculo de rentabilidad, nombres
    comerciales de las listas de precios y márgenes de ganancia en un solo panel
    de control.
    B. Configuración en el Wizard (Onboarding de Rentabilidad)
    Para evitar que el usuario tenga que configurar producto por producto desde cero, el
    Wizard de instalación incluirá una sección de "Estrategia de Precios":
    ● Definición de Nombres: Permitir al usuario bautizar sus niveles (ej. Nivel 1:
    "Detal", Nivel 2: "Mayorista", Nivel 3: "VIP").
    ● Márgenes por Defecto: Solicitar el porcentaje de utilidad esperado para
    cada nivel.
    ○ Ejemplo: Detal (30%), Mayorista (15%).
    ● Automatización: Al crear un nuevo producto, el sistema precargará estos
    márgenes. Si el usuario ingresa el costo, ClaraPOS calculará los tres precios
    de venta automáticamente, ahorrando tiempo y errores de cálculo manual.
    C. Ajustes y Validaciones de Componentes (Control de Errores)
    Para mantener la integridad de los datos financieros, aplicaremos estas reglas
    técnicas en los inputs:
22. Protección de Inputs Numéricos:
    ○ Eliminar las flechas de incremento/decremento (spinners) en los
    campos de margen y precio.
    ○ Bloquear la modificación de valores mediante el scroll del mouse.
23. Sanitización de Etiquetas:
    ○ Los nombres de los niveles de precio (ej. "MAYORISTA") pasarán por
    el método .toUpperCase() y se limitarán a caracteres alfanuméricos
    para evitar errores en reportes y facturas.
24. Validación de Margen Mínimo:
    ○ El sistema lanzará una advertencia si el usuario intenta configurar un
    margen que resulte en un precio de venta inferior al costo (Margen de
    contribución negativo).
    Sugerencias
25. Prioridad de Margen por Departamento:
    ○ Idea: En el mundo real, no se gana lo mismo vendiendo "Viveres"
    (margen bajo, alto volumen) que "Licores" o "Electrónicos". Sugiero
    que, si el usuario define un margen en el departamento, este
    prevalezca sobre el margen general de la empresa.
26. Sincronización Multimoneda en Tiempo Real:
    ○ Como vimos antes, el componente debe mostrar: Si el usuario cambia
    el margen, los otros dos campos deben reaccionar instantáneamente
    sin recargar la página.
27. Redondeo Fiscal Sugerido:
    ○ Agregar un selector de "Tipo de Redondeo" en esta pestaña:
    ■ Sin redondeo (Exacto).
    ■ Hacia arriba (A la unidad más cercana).
    ■ Psicológico (Terminado en .99).
28. MODULO BANCOS
    A. Configuración en el Wizard (Onboarding Financiero)
    ● Paso Inicial: Se sugiere la creación de al menos una entidad bancaria
    para habilitar la operatividad del Punto de Venta (POS).
    ● Flujo Automatizado: Al crear un banco, el sistema solicitará:
29. Nombre de la Institución.
30. Tipo de Moneda (Local/Extranjera).
31. Vínculo Contable (Ver sección B).
32. Métodos de Pago: El sistema ofrecerá "Checkboxes" para activar
    rápidamente los métodos comunes (Punto de Venta,
    Transferencia, Pago Móvil).
    B. Integración con el Plan de Cuentas (Filtros Inteligentes)
    Para evitar que un usuario sin conocimientos contables vincule un banco a una
    cuenta de "Gastos" o "Activo Fijo", el sistema aplicará un Filtro de Categoría
    Estricto:
    ● Selector de Cuenta Contable: Solo mostrará cuentas pertenecientes a las
    categorías de Disponibilidad / Bancos (Moneda Local o Extranjera).
    ● Validación de Moneda: Si el banco se define en USD, el selector solo
    mostrará cuentas contables configuradas en moneda extranjera.
    C. Interfaz de Usuario y Consulta Rápida (UX)
    ● Visualización en Tabla: La tabla principal mostrará las columnas: Banco,
    Moneda, Cuenta Contable Vinculada y Saldo (opcional).
    ● Vista de Detalle (Master-Detail): Al hacer clic en una fila, no se abrirá una
    pantalla nueva; se desplegará un panel lateral o sección inferior que
    muestre:
    ○ Información general del banco.
    ○ Lista de Métodos de Pago asociados (Ej: Débito, Zelle, etc.).
    ○ Código y nombre de la cuenta contable para auditoría rápida.
    D. Importación Masiva y Reportes
    ● Protocolo de Importación: Se habilita el botón de carga vía Excel/CSV
    cumpliendo con el Escudo de Seguridad Clara:
    ○ Límite de Carga: Máximo 500 registros por bloque.
    ○ Sanitización: Prohibición de caracteres especiales y limpieza de
    espacios (Trim).
    ○ Previsualización: Modal obligatorio para validar que los nombres
    de los bancos y cuentas contables coincidan antes de afectar la
    DB.
    ● Reportes: Botón de generación de reporte en PDF/Excel del listado de
    cuentas y sus configuraciones fiscales.
    Sugerencias de Mejora
    Manejo de Comisiones Bancarias:
    ● En Venezuela, las transferencias y el uso de puntos tienen comisiones.
    Sugiero que en la configuración del banco se pueda definir un % de
    Comisión por Defecto. Así, al registrar un pago, ClaraPOS calcula
    automáticamente el gasto bancario.
    Detección de Duplicados por Número de Cuenta:
    ● El sistema debe impedir que se registren dos bancos con el mismo
    número de cuenta para el mismo tenant_id, evitando errores en la
    carga masiva.
    Gestión de Métodos de Pago Especiales (No Monetarios)
    A. La Permuta (Intercambio de Bienes/Servicios)
    En sistemas profesionales, la permuta se maneja como una Compensación de
    Partidas.
    ● Cómo funciona: Tú le debes al proveedor (Factura de Compra) y el
    proveedor te debe a ti (Factura de Venta). El sistema "cruza" ambos
    saldos.
    ● Sugerencia para ClaraPOS: Crear un método de pago tipo "Cruce de
    Cuentas". Al seleccionarlo, el sistema debe pedir la referencia del
    documento (factura o nota de crédito) que está compensando el pago.
    Esto asegura que el IVA se declare correctamente aunque no haya
    pasado dinero por el banco.
    B. Consumo Interno (Retiro de Inventario por Dueños/Empleados)
    SAP maneja esto mediante Centros de Costo. No es una venta (porque no hay
    ganancia ni IVA cobrado al cliente externo), sino una salida de inventario a
    valor de costo.
    ● Sugerencia para ClaraPOS: Implementar el método "Consumo Interno".
    ● Lógica Contable: 1. Rebaja el stock al precio de costo (no al de venta). 2.
    En lugar de afectar la cuenta de "Ventas", afecta una cuenta de "Gasto
    por Consumo Interno".
    ○ Tip de Clara: Esto es vital para que al final del mes, Fran, no
    pienses que "perdiste" mercancía, sino que sepas exactamente
    cuánto se consumió internamente.
    C. Otras Formas de Pago Profesionales:
33. Cuentas de Cortesía (Gifts/Marketing): Muy común en el ramo de
    restaurantes que manejas. Se registra la salida para llevar el control de
    inventario, pero el pago se asigna a una cuenta de "Gastos de
    Publicidad".
34. Vales de Empleados: El empleado se lleva el producto y el "pago" se
    registra como un Anticipo de Nómina. Luego, tú como contador,
    descuentas eso al pagar el sueldo.
    1.30. Actualización del Manual: Métodos de Pago Avanzados
    Para el manual técnico, añadiremos estas reglas de negocio:
    ● Categorización de Métodos: Cada método de pago creado en el módulo
    de Bancos debe tener un "Tipo":
    ○ MONETARIO (Efectivo, Banco, Zelle).
    ○ COMPENSACIÓN (Permuta, Notas de Crédito).
    ○ INTERNO (Consumo, Cortesía).
    ● Validación Fiscal: Los métodos tipo INTERNO y COMPENSACIÓN deben
    generar una validación especial para asegurar que el tratamiento del IVA
    sea el correcto según la ley venezolana (autofactura o nota de ajuste).
    ● Restricción de Acceso: Estos métodos especiales no deberían estar
    disponibles para cualquier cajero. Deben requerir el PIN de Supervisor
    que definimos antes.
35. Módulo de Gestión de Clientes y CRM
    A. Optimización de Carga y Rendimiento (Lazy Loading)
    ● Comportamiento de Interfaz: Para evitar latencia en la carga inicial, la
    sección de Clientes no listará la base de datos completa por defecto.
    ● Lógica de Visualización: Al entrar, se mostrará un Top 20 de los clientes
    con mayor frecuencia de facturación o mayor volumen de ventas
    (fomentando la atención a clientes VIP).
    ● Búsqueda Dinámica: Para localizar otros registros, el usuario utilizará la
    barra de búsqueda (filtrando por RIF, Cédula o Nombre). Los resultados
    se renderizarán en tiempo real.
    B. Rediseño de la Ficha de Cliente (Master-Detail View)
    ● Experiencia de Usuario (UX): Se eliminará el ajuste dinámico de tamaño de
    tabla (que puede ser visualmente molesto).
    ● Nueva Interfaz: Al seleccionar un cliente, el sistema abrirá una Vista de
    Detalle (Full Page o Modal Expandido) que presente la información de
    forma jerárquica:
36. Datos Fiscales: RIF/Cédula, Dirección, Teléfono.
37. Perfil Comercial: Nivel de precio asignado (Detal/Mayor), límite de
    crédito y días de gracia.
38. Historial Rápido: Últimas 5 facturas y saldo pendiente de pago.
    C. Importación, Exportación y Controles de Seguridad
    ● Gestión Masiva: Se integran los botones de Importación y Exportación
    (CSV/Excel).
    ● Escudo de Seguridad Clara:
    ○ Límite de 500 líneas por carga.
    ○ Sanitización estricta de nombres y direcciones (Remover
    caracteres especiales que rompan el CSV).
    ○ Validación de unicidad de RIF/Cédula antes de procesar la carga.
    ● Control de Inputs: Eliminación de flechas (spinners) y capacidad de
    scroll en campos numéricos (como el límite de crédito o días de crédito)
    para evitar cambios accidentales.
    Modal de creación de clientes
    ● limitar el maximo de caracteres posibles para los inputs
    ● agregar validación y sanitización en front, back y middle
    ● eliminar la función de scroll y flechas en el input del límite de crédito
    ● no permitir un límite negativo en el crédito del cliente
    Sugerencias de Mejora
    Validación de RIF (Formato SENIAT):
    ● Al ingresar el RIF, el sistema debe verificar automáticamente el formato
    (V, J, G, E + número + dígito verificador). Esto evita que el contador
    tenga que corregir errores al final del mes para el Libro de Ventas.
    Límites de Crédito y Bloqueos:
    ● Si el cliente intenta una compra que supera su límite o si tiene facturas
    vencidas por más de "X" días, el sistema debe bloquear la venta y
    requerir el PIN del Supervisor.
    Filtros de Búsqueda Avanzados:
    ● No solo buscar por nombre. Permitir filtrar por:
    ○ Clientes con deuda activa.
    ○ Clientes que no han comprado en los últimos 30 días (para
    estrategias de marketing).
    ○ Clientes por zona/ciudad (útil si tienes rutas de despacho).
    ● Geolocalización Sugerida:
    ○ Un campo para el enlace de Google Maps de la ubicación del
    cliente. Muy útil para empresas que hacen entregas a domicilio o
    despachos de mercancía pesada.
39. Módulo de proveedores
    modal de creación de proveedores
    ● sanitizar inputs, limitando el máximo de caracteres permitidos, limitar a
    a-z y 0-9
    ● eliminar la función de scroll y flechas para modificar el monto en los
    inputs de días de crédito y límite de crédito
    ● evaluar la posibilidad de integrar esta sección al modulo de compras y
    gastos para simplificar el panel lateral
    tabla de proveedores
    ● no cargar todos los proveedores existentes, limitar a los que más
    facturas poseen, o dejar la tabla vacía en espera de que el usuario
    realice una consulta,
40. Módulo de compras y gastos
    ● sección de facturas
    ○ renombrar a facturas de compra
    ○ eliminar la funcion de scroll y flechas para modificar el monto del
    input de
    ■ tasa interna
    ■ tasa proveedor (la que aparece al marcar que la factura usa
    tasa paralela
    ■ costo de productos
    ■ monto en sección de abonos de la factura
    ● cuentas por pagar
    ○ agregar botón para importar cuentas por pagar vía excel o cvs,
    aplicando limitantes de peso de archivo, limite de registros y
    sanitización de datos
