# Delta for Notas de Crédito — Entrada POS

## ADDED Requirements

### Requirement: Diseño responsivo del modal (mobile master-detail)

Por debajo del breakpoint Tailwind `md` (<768px), el modal de entrada POS de NC MUST comportarse como un master-detail de una sola columna: MUST mostrar únicamente el listado de facturas (columna izquierda) mientras ninguna factura esté seleccionada, ocupando el ancho completo. Al seleccionar una factura, el listado MUST ocultarse y MUST mostrarse únicamente la columna de detalle (desglose fiscal + sección NC con reveal-gate + footer de acciones), ocupando el ancho completo. Presionar "Volver" MUST ocultar el detalle y MUST volver a mostrar el listado. En `md:` y superior, el layout de dos columnas lado a lado MUST permanecer sin cambios visuales ni de comportamiento respecto al estado actual. El diálogo (elemento `<dialog>` nativo) en mobile MUST ocupar la pantalla completa (ancho de viewport y alto de viewport dinámico); en `md:` y superior MUST conservar su tamaño y bordes redondeados actuales. El estilo `minHeight: 420px` de la columna de detalle MUST aplicarse únicamente en `md:` y superior — no debe forzar scroll adicional en viewports móviles cortos.

Este requirement se implementa exclusivamente con clases condicionales de Tailwind derivadas del estado existente de selección de factura — MUST NOT introducir nuevo estado ni el hook `useMobile` (no usado en ningún otro punto del código, patrón rechazado en una decisión previa).

#### Scenario: Mobile muestra solo el listado sin selección

- GIVEN el modal abierto en un viewport menor a `md` (<768px), sin ninguna factura seleccionada
- WHEN el cajero observa el modal
- THEN solo la columna de listado es visible, ocupando el ancho completo; la columna de detalle no se muestra

#### Scenario: Mobile muestra solo el detalle al seleccionar

- GIVEN el modal abierto en un viewport menor a `md`, con el listado visible
- WHEN el cajero selecciona una factura del listado
- THEN el listado se oculta y solo la columna de detalle es visible, ocupando el ancho completo, incluyendo el footer de acciones

#### Scenario: Volver regresa al listado en mobile

- GIVEN el modal en viewport menor a `md`, mostrando el detalle de una factura seleccionada
- WHEN el cajero presiona "Volver"
- THEN el detalle se oculta y el listado vuelve a mostrarse, ocupando el ancho completo

#### Scenario: Desktop conserva el layout de dos columnas sin cambios

- GIVEN el modal abierto en un viewport `md` o superior (≥768px)
- WHEN el cajero selecciona o deselecciona una factura
- THEN ambas columnas permanecen visibles simultáneamente, lado a lado, igual que antes de este cambio

#### Scenario: Diálogo full-screen en mobile

- GIVEN el modal abierto en un viewport menor a `md`
- WHEN se renderiza el `<dialog>`
- THEN ocupa el ancho y alto completos del viewport, sin bordes redondeados

#### Scenario: minHeight de la columna de detalle no aplica en mobile

- GIVEN el modal abierto en un viewport menor a `md`, con el detalle visible
- WHEN se mide el layout de la columna de detalle
- THEN no se le fuerza una altura mínima de 420px que provoque scroll adicional en pantallas cortas
