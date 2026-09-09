# Proposal: Máscara Visual tipo Excel en Esquema de Precios

## Intent

El modal de producto (`producto-form.tsx`, tab "Precios y Fiscalidad") muestra hoy precios con hasta 8 decimales sin formato — ruidoso para el usuario, que solo necesita ver 2. Pero el sistema **necesita** los 8 decimales completos (regla de negocio #10: `NUMERIC(20,8)`, `precision_calc=8`) para no perder exactitud al reconvertir USD↔Bs y evitar drift de redondeo. Se requiere una **máscara puramente visual**: mostrar 2 decimales por defecto, revelar la precisión completa solo mientras el usuario edita ese campo, y garantizar que el valor que viaja a la DB sea siempre el de precisión completa — nunca el truncado a 2 decimales.

Bug relacionado que la máscara corrige: escribir en "Precio Venta Bs" hoy hace parpadear "Precio Venta $" con 8 decimales sin formato (handlers en ~L767/909/937 escriben `toFixed(8)` en el estado de display de un campo *distinto* al enfocado).

## Scope

### In Scope
- Máscara visual (2 decimales por defecto, completos en foco) en los 4 grupos de input × 3 niveles: COSTOS, MARGEN, PRECIO VENTA ($/Bs), PRECIO FINAL ($/Bs) — 15 inputs totales.
- Fuente de verdad de precisión completa para MARGEN (hoy no existe; se escribe con `toFixed(1)/toFixed(2)` en `applyPricesFromCosto` y `handleFijarCosto`), análoga a los refs `precioVentaUsdFullRef`/`precioMayorUsdFullRef`/`precioEspecialUsdFullRef` ya existentes.
- Reconciliación del focus-guard existente de Precio Final (`precioFinalFocusRef`, L~324) con el nuevo toggle de máscara — son dos mecanismos distintos (guard de sync derivado vs. toggle de display) que deben converger en un único patrón.
- Auditoría de floats sueltos (`parseFloat`, aritmética nativa) en la cadena de VALOR de precios/costo/margen — reportar hallazgos, no corregirlos en este cambio salvo que sean parte directa del toggle.
- Documentar el patrón máscara-visual/valor-completo en `CLAUDE.md` (o nota de diseño) para agentes futuros.

### Out of Scope
- Lógica de negocio del back-cálculo de costo o del modo exploración (`recalcularCostoSiExplorando`, guards `!costoBackCalculado`) — solo deben seguir recibiendo el valor crudo tipeado, sin alteración.
- Cambios de schema DB (columnas ya son `NUMERIC(20,8)`).
- Cambios a `soloNumeroPositivo` (`src/lib/numeric-input.ts`).
- Combos (`tipo === 'C'`): ya no pasan por el esquema de precios.
- Corrección de los floats sueltos hallados en la auditoría (se reporta; la corrección queda para un cambio futuro salvo hallazgos triviales en el mismo toggle).

## Capabilities

### New Capabilities
- `producto-precio-mascara-visual`: máscara visual de 2 decimales con revelado de precisión completa on-focus para los inputs de esquema de precios del formulario de producto, sin alterar el valor real que llega a persistencia.

### Modified Capabilities
None — no existe spec previa para el modal de precios de producto (mismo estado que dejó `producto-costo-backcalculo`, aún sin archivar a `openspec/specs/`).

## Approach

1. Helper de display compartido (`formatDisplay(value, focused)`): reemplaza los `.toFixed(2)`/`.toFixed(8)` inline dispersos por una función única, testeable, usada por los 15 inputs.
2. Cada grupo obtiene (o ya tiene) un ref de precisión completa por nivel; `onChange` sigue escribiendo el valor crudo tal cual lo recibe hoy (sin tocar `recalcularCostoSiExplorando` ni los handlers `!costoBackCalculado`) y además actualiza el ref full.
3. `onFocus`: input muestra el ref full (string sin redondear). `onBlur`: input vuelve a mostrar `toFixed(2)` del valor real. El toggle se ata al estado de foco del input propio (`focused === thisFieldKey`), nunca al de un campo relacionado — corrige el bug de parpadeo cruzado.
4. Margen: se agrega su propio ref full-precision, poblado en los mismos puntos donde hoy se escribe `toFixed(1)/toFixed(2)`, sin cambiar la matemática de back-calc.
5. El focus-guard existente de Precio Final se adapta para usar el mismo patrón de toggle (no dos mecanismos paralelos).
6. `handleSubmit` sigue leyendo los refs full (patrón ya usado en L1086-1088), extendido a Margen y Precio Final.
7. Auditoría: grep dirigido de `parseFloat`/aritmética nativa en la cadena de valor de precio/costo/margen dentro del archivo; resultado documentado en el design doc, no corregido en este cambio.

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `src/features/inventario/components/productos/producto-form.tsx` | Modified | 15 inputs de precio: toggle focus/blur, nuevo ref full para Margen, reconciliación del focus-guard de Precio Final, ref full para Costo |
| `src/lib/` (nuevo módulo, p.ej. `price-display-mask.ts`) | New | Helper `formatDisplay()` compartido, testeable de forma aislada |
| `src/features/inventario/components/productos/producto-form.test.tsx` (o nuevo test file) | Modified/New | Casos: valor completo llega a submit; display re-enmascara en blur; margen widening no rompe back-calc |
| `CLAUDE.md` o `openspec/changes/producto-form-mascara-decimales/design.md` | Modified/New | Documentación del patrón máscara-visual/valor-completo |

## Risks

| Riesgo | Probabilidad | Mitigación |
|--------|---------------|------------|
| Ensanchar precisión de Margen toca la cadena de back-cálculo de costo (parte de mayor riesgo) | Alta | Cubrir `producto-precio-gating.test.ts` existente ANTES de tocar `applyPricesFromCosto`/`handleFijarCosto`; el ref full de margen es aditivo, no reemplaza la matemática actual |
| Alterar `recalcularCostoSiExplorando` o los handlers `!costoBackCalculado` al introducir el toggle | Media | El toggle solo interviene en la capa de DISPLAY (qué string se muestra); `onChange` sigue pasando el valor crudo sin cambios a estos handlers |
| Máscara se ata al foco de un campo relacionado en vez del propio (repite el bug de parpadeo) | Media | Toggle keyed por identificador único del input propio (`focused === thisFieldKey`), con test de regresión que cubra el escenario Bs→$ actual |
| `handleSubmit` con checks `.trim() === ''` sobre estado enmascarado mientras el campo está enfocado | Media | Los checks de vacío deben leer el ref/estado real, nunca el string de display; test que confirme submit con campo enfocado y vacío se comporta igual que hoy |
| Floats sueltos (`parseFloat`, aritmética nativa) en la cadena de valor, fuera de `decimal.js` | Baja-Media (ya existe hoy) | Auditoría dirigida documentada en el design doc; no se corrige en este cambio salvo que colisione directamente con el toggle |

## Verification Approach

TDD estricto (`strict_tdd: true`), Vitest, `yarn test:run`. Mock obligatorio de `@/core/db` (el archivo tiene un side-effect top-level de `new PowerSyncDatabase`).

Casos mínimos:
- Helper `formatDisplay()` aislado: 2 decimales por default, string completo cuando `focused=true`, sin depender de React.
- Por cada uno de los 15 inputs: valor tipeado con >2 decimales → payload de submit contiene el valor de precisión completa, no el truncado.
- Onfocus muestra completo / onBlur reenmascara a 2 decimales (test de interacción, no solo del helper).
- Margen: escribir margen con >2 decimales no rompe el back-calc de costo (regresión sobre `producto-precio-gating.test.ts`).
- Regresión del bug de parpadeo cruzado: escribir en "Precio Venta Bs" no debe mostrar sin formato el display de "Precio Venta $".
- Combos (`tipo === 'C'`) no exhiben estos inputs — test de no-regresión.

## Documentation Deliverable

El patrón máscara-visual (display 2 decimales / valor real 8 decimales / toggle on-focus) debe quedar documentado en `CLAUDE.md` (sección de convenciones frontend o de reglas de negocio #10) o en `design.md` de este cambio, para que agentes futuros no reintroduzcan inputs sin máscara ni rompan el patrón al tocar el formulario de producto.

## Rollback Plan

Cambio acotado a un componente (`producto-form.tsx`), un helper nuevo aislado y su archivo de test. Sin migraciones de DB ni cambio de schema Zod. Revertir el commit/PR restaura el comportamiento actual (inputs sin máscara, matemática intacta). El helper nuevo no tiene dependientes fuera de este archivo, por lo que no deja código huérfano al revertir.

## Dependencies

Ninguna nueva — `decimal.js` ya es dependencia del proyecto (usado en la cadena de valor existente).

## Success Criteria

- [ ] Los 15 inputs muestran 2 decimales por defecto y precisión completa (hasta 8) al enfocar
- [ ] El payload de `handleSubmit` contiene siempre el valor de precisión completa para los 15 campos, nunca el truncado a 2 decimales
- [ ] Margen tiene su propia fuente de verdad de precisión completa, sin alterar el resultado numérico del back-cálculo de costo existente
- [ ] El focus-guard de Precio Final y el nuevo toggle de máscara conviven como un único mecanismo, no dos paralelos
- [ ] El bug de parpadeo cruzado (Bs→$ sin formato) no se reproduce
- [ ] `recalcularCostoSiExplorando` y los guards `!costoBackCalculado` reciben el mismo valor crudo que reciben hoy
- [ ] Auditoría de floats sueltos en la cadena de valor documentada en el design doc
- [ ] Patrón documentado en `CLAUDE.md` o `design.md`
- [ ] Combos (`tipo === 'C'`) sin cambio de comportamiento
