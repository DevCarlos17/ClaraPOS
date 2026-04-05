ESTRUCTURA DEL DASHBOARD

BOTON DASHBOARD: Interfaz informativa con los registros y movimientos recientes relevantes, solo visible para usuarios con el mayor nivel de permisos (nivel 3)
Mensaje que da la bienvenida al usuario que inicio sesión
Ventas de hoy, en dolares y calculadas a la tasas vigente (card)
Tasa actual (card con la tasa actual configurada, si se implementa el web scraping de la página del bcv, deberá indicar si existe una diferencia entre la tasa del sistema y la tasa del bcv
Valor de inventario (Card con valor en dólares del inventario, y el número de artículos con bajo stock)
Gráfico de distribución de valor de inventario
Total cuentas por cobrar en dolares y bolivares (Card)
Gráfico de barras o de línea con las ventas del último mes, configurable para última semana, últimos 15 días, mes en curso
Top 10: tabla con los 10 productos con mayor rotación en los últimos 30 dias | tabla con los 10 productos con menor rotación en los últimos 30 dias

BOTON DE VENTAS tendra el siguiente submenu:
-NUEVA VENTA
-NOTA DE CRÉDITO
-REPORTES
-CUADRE DE CAJA

INVENTARIO contine el siguiente submenu:
-DEPARTAMENTOS (boton de submenu)
-Agregar la función de ordenar la tabla de departamentos haciendo clic en la cabecera de cualquier a de las columnas
-Eliminar la posibilidad de desactivar un departamento con productos asociados desde la ventana de editar departamento

-COMPRAS (boton de submenu)

-PRODUCTOS / SERVICIOS: (boton de submenu)
-centrar la ventana de creacion y edicion de productos
-agregar la función para ordenar los productos al hacer click en la cabecera de cualquier a de las columnas
-al seleccionar la opción de servicio deberá desactivarse la opción de seleccionar método de unidad
-al hacer click en el card de productos criticos deberia desplegarse una ventana con la lista de productos bajos en inventario, y dar la opción para descargar en pdf o imprimir reporte, debe utilizar los datos registrados de la empresa para la cabecera del reporte
-al hacer clic en el card de valor total de inventario, se deberá desplegar una ventana con un gráfico de barras o circular que desglose la distribución del inventario actual en dólares
-se debe agregar un botón para exportar inventario en formato csv y excel
-Se debe agregar un botón para importar inventario en formato csv o excel, sería una ventana que explique qué columnas debe contener el archivo y en qué formato debe estar la información. antes de procesar los datos, deberá validarse que cumpla con los requerimientos del backend, y en caso de no cumplir con alguno deberá arrojar un mensaje indicando que líneas no cumplen con los requerimientos
-se debe agregar un botón para imprimir el inventario en formato pdf, utilizando la información de la empresa como cabecera, numeración de página, el reporte debe contener, código de producto, departamento, nombre de producto, unidad de medida, precio de costo en dolares, precio de pvp en dólares, existencia actual, inventario mínimo, antes de generar el pdf se debe desplegar una ventana donde se permite seleccionar cual de todas estas columnas se puede activar o desactivar para mostrar en el reporte, siendo la de código y nombre de producto obligatorias
-RECETAS / COMBOS (Boton de submenu)
-REPORTES DE INVENTARIO (Boton de submenu)

PROVEEDORES, tendra el siguiente submenu:
-RAZÓN SOCIAL DE PROVEEDOR
-RIF DE PROVEEDOR
-DIRECCIÓN FISCAL DE PROVEEDOR
-TELÉFONO DE CONTACTO
-CORREO ELECTRÓNICO DE CONTACTO
-RETIENE IVA
-RETIENE ISLR

CLIENTES, tendra el siguiente submenu
-GESTION DE CLIENTES
-CUENTAS POR COBRAR
-REPORTES DE CUENTAS POR COBRAR

CONFIGURACIÓN y en este boton se debera poder ver esta informacion:
-DATOS EMPRESA (Boton de submenu)
RAZÓN SOCIAL: Tal cual aparece en el registro mercantil
NÚMERO DE RIF: Debe estar validado (formato J-00000000-0). Desglose del RIF: 1° carácter (v,e,j,p,g) tipo de rif, 2°-9° caracteres: Número asignado por SENIAT, 10° carácter: Dígito verificador calculado
V Venezolano (persona natural) ejemplo: V-12345678-0
E Extranjero (persona natural) ejemplo: E-87654321-5
J Persona jurídica (empresa) J-30123456-7
P Pasaporte (extranjero sin cédula)
G Gobierno (entidades públicas)G-20000001-3
DIRECCION FISCAL: tal como aparece en el rif
Número de Registro Mercantil: Datos del tomo, folio y número de registro donde se constituyó la empresa.
Tipo de Contribuyente: Selecciona si la empresa es Especial, Ordinaria, Formal o Exonerada.
¿Es Agente de Retención de IVA?: si o no, Activa esta opción si el SENIAT te designó como tal.
Porcentaje de Retención (IVA) : Indica si retienes el 75% o el 100% (según tu Providencia).
¿Es Agente de Retención de ISLR?: Activa para habilitar el cálculo automático de retenciones de ISLR.
Representante Legal: Nombre y Cédula (útil para actas de asamblea o declaraciones juradas).
Coeficiente de Retención: (75% o 100%) para automatizar el cálculo del IVA retenido.
Logotipo en Alta Resolución: Para que los PDF de las facturas y balances se vean profesionales
Fecha de inicio de periodo fiscal
Fecha de fin de periodo Fiscal
Calendario de Sujetos Pasivos Especiales: \* Si el usuario marca que es Especial, el sistema necesita saber el Último Dígito del RIF.
Teléfono fiscal
Correo Electrónico Fiscal:
TASA DE CAMBIO (Boton de submenu)
USUARIOS Y PERFILES DE ACCESO (Boton de submenu)
INFORMACIÓN BANCARIA (Boton de submenu que contiene 2 botones mas)
-BANCOS
-MÉTODOS DE PAGO
