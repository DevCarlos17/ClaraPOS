Modulo Agenda

- Configuracion - PESTAÑA CONFIGURACION DE AGENDA

- la opcion Visibilidad del modulo no funciona al marcar o desmarcar el checkbox, adicionalmente:

* la opcion de desmarcado no debe ser solo visual, debe pausar el modulo completamente para evitar que los usuarios aun puedan acceder al modulo via consola por ejemplo, pero no borrar los registros existentes ni informacion en las tablas, se debe alertar al usuario en caso de que hayan registros pendientes, como citas abiertas, o sesiones de caja que incluyan registros aun no cerrados, para evitar posibles errores,
* al reactivarse el modulo debe mostrarse de nuevo toda la información existente, y se puede proceder a trabajar con normalidad

- la opcion Limite de programacion futura no funciona, no parece estar activando el limite maximo permitido para las citas

- la opcion Vista por defecto del calendario no funciona, no parece modificar la vista predeterminada del calendario

- la opcion Duracion minima del slot no funciona, no parece modificar el intervalo

- la opcion Citas durante descansos no funciona

- todos estos errores no han podido ser comprobados en su totalidad ya que al presionar el boton Guardar configuracion del menu de opciones, arroja un error "Error al guardar configuracion"

- evaluar si es mejor que las opciones se guarden automaticamente al ser modificadas sin tener que presionar el boton de guardar, pero opciones importantes como el de ocultar o mostrar modulo solo puede hacerlo el usuario principal del tenant

Modulo Agenda

- Pantalla Horario Staff

* es necesario mejorar la logica para agregar hora de almuerzo al horario, sugerencia: convertir la plantilla de semana laboral actual, en un mini sistema de gestion, que sea posible crear varias plantillas hasta un maximo de 5, y que se puedan configurar, de modo que el usuario pueda simplemente elegir alguna de ellas para que se copie automáticamente a un trabajador seleccionado, estas plantillas deben poder tener el nombre editable para que el usuario las identifique mas fácilmente, al pasar el mouse por encima o dejar el dedo apretado en Mobile, debe aparecer una ventanita pequeña con el resumen del horario para que el usuario sepa cual es

* pestaña de excepciones: el sistema permite crear permisos excepcionales, para no tener que modificar el horario, sin embargo no parece estar aplicando la lógica, se hizo una prueba colocando un día laboral como día libre, y al momento de intentar agendar un servicio con ese trabajador, el día seguía estando disponible
* la función de la pestaña de excepciones debería ser, sobreponerse al horario normal de trabajo del trabajador, para inhabilitar total o parcialmente su jornada de trabajo por situaciones imprevistas o puntuales
* el sistema debe ser lo suficientemente inteligente para detectar si el trabajador tiene citas pendientes dentro del intervalo que se intenta inhabilitar y dar la opción para reprogramar en otra fecha u horario disponible o trasladar la cita a otro trabajador, o cancelar la cita

* boton de bloqueo: parece estar teniendo los mismos errores de logica que la pestaña de excepciones

Panel de trabajo

- el panel de trabajo no parece estar operativo, no aparecen ninguna de las citas programadas
- es necesario cambiar le frontend del panel de trabajo actuamente son 3 columnas de colores, sustituir esos colores, por el mismo color de fondo de la pagina, y el borde de cada columna por un gris un poco mas oscuro, para dar la sensación de que esta "hundido" en la interfaz, como si fueran surcosm y las citas deben aparecer como cards con la informacion correspondiente dentro de cada una

Calendario

- la vista de "DIA" no muestra ninguna de las citas programadas
