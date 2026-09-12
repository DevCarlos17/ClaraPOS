# Facturas Emitidas — Listado UI Specification

## Purpose

Requisitos visuales/presentacionales de la pantalla `Ventas > Facturas emitidas`: el estilo de tarjeta de la tabla de facturas y la union visual entre las tabs "Facturas"/"Notas de credito" y su tarjeta de filtros. No cubre logica de negocio, filtrado, ni el flujo de aplicar nota de credito.

## Requirements

### Requirement: Estilo de tarjeta blanca con borde para tablas basadas en DataTable

El `DataTable` generico (y por lo tanto `FacturasEmpresaTable`, su unico consumidor) SHALL renderizar su contenedor con fondo blanco (`bg-card`) y un borde visible, en linea con la convencion de tarjetas usada en el resto de la aplicacion, en vez del fondo gris de pagina (`bg-background`).

#### Scenario: Tabla de facturas visible en tab "Facturas"

- GIVEN el usuario esta en `Ventas > Facturas emitidas`, tab "Facturas"
- WHEN la lista de facturas renderiza via `FacturasEmpresaTable`
- THEN el contenedor de la tabla se ve con fondo blanco y borde, distinguible del fondo gris de la pagina

#### Scenario: Separacion visual dentro de cliente-detalle

- GIVEN el usuario abre el detalle de un cliente con facturas asociadas
- AND `cliente-detalle.tsx` ya envuelve la tabla en su propia tarjeta blanca (`bg-card shadow-lg`)
- WHEN `FacturasEmpresaTable` renderiza dentro de esa tarjeta
- THEN el borde del `DataTable` SHALL mantener una separacion visual perceptible (no blanco-sobre-blanco sin limites)

#### Scenario: Consistencia en el modal de consultas de ventas

- GIVEN el usuario abre el modal de consultas de ventas (`ventas-consultas-modal.tsx`) que embebe `FacturasEmpresaTable`
- WHEN la tabla renderiza dentro del modal
- THEN usa el mismo estilo de tarjeta blanca con borde que los otros 2 consumidores

#### Scenario: Sin regresion funcional

- GIVEN cualquiera de los 3 consumidores de `FacturasEmpresaTable`
- WHEN se aplica el cambio de estilo del contenedor
- THEN el comportamiento de filtrado, `onRowClick`, y "Aplicar nota de credito" permanece sin cambios (solo cambia `className`)

### Requirement: Tabs visualmente unidas a la tarjeta de filtros

Las `TabsTrigger` "Facturas" y "Notas de credito" en `notas-credito-page.tsx` SHALL renderizarse visualmente unidas (sin espacio/seam) a la tarjeta de filtros que aparece debajo del `TabsList` activo, para ambas tabs.

#### Scenario: Tab "Facturas" unida a su filtro

- GIVEN el usuario esta en la tab "Facturas" (activa por defecto)
- WHEN la pantalla renderiza `TabsList` seguido de `FacturasEmpresaFiltros`
- THEN no hay espacio/gap visible entre el `TabsList` y la tarjeta de filtros

#### Scenario: Tab "Notas de credito" unida a su filtro

- GIVEN el usuario cambia a la tab "Notas de credito"
- WHEN la pantalla renderiza `TabsList` seguido del bloque de filtro inline de `NotasCreditoTab`
- THEN no hay espacio/gap visible entre el `TabsList` y la tarjeta de filtros, igual que en la tab "Facturas"

#### Scenario: Estado de filtros permanece independiente por tab

- GIVEN ambas tabs muestran un bloque de filtro con la misma forma visual (Desde/Hasta/Buscar)
- WHEN el usuario cambia valores de filtro en una tab y luego cambia a la otra tab
- THEN los valores de filtro de cada tab SHALL permanecer independientes (sin estado compartido) — la union es unicamente visual

#### Scenario: Sin regresion en tests existentes basados en rol/estado

- GIVEN `notas-credito-page.test.tsx` asertando via `getByRole('tab', ...)` y atributo `data-state`
- WHEN se aplican los overrides de `className` para la union visual
- THEN esos tests SHALL seguir pasando sin modificacion (no dependen de clases CSS)
