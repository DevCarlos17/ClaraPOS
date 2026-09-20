# Apply Progress — unificacion-modal-nc

Chain: feature-branch-chain, slice a slice. Tracker: `feat/unificacion-modal-nc` (desde develop).

## Slice 1 — Extraer `TipoNcSelector` (Total/Parcial) — COMPLETO

- **Rama**: `feat/unificacion-modal-nc-pr1-tiponc`
- **Qué**: Extraccion verbatim del bloque "Tipo de NC" (Total/Parcial), que estaba duplicado byte-a-byte entre `crear-ncr-modal.tsx` y `nota-credito-pos-modal.tsx`, a un componente presentacional puro `tipo-nc-selector.tsx`.
- **Props**: `{ tipoNc: 'TOTAL'|'PARCIAL'|null, onChange, puedeTotal }`. Sin `entryPoint` (el bloque es identico en ambos, no depende del contexto). Sin logica de negocio.
- **Archivos**:
  - `src/features/ventas/components/tipo-nc-selector.tsx` (nuevo)
  - `src/features/ventas/components/__tests__/tipo-nc-selector.test.tsx` (nuevo)
  - `src/features/ventas/components/crear-ncr-modal.tsx` (usa `<TipoNcSelector>`, bloque inline eliminado)
  - `src/features/ventas/components/nota-credito-pos-modal.tsx` (idem)
- **Tests**: 90/90 en los 3 archivos (tipo-nc-selector + crear-ncr-modal + nota-credito-pos-modal). Los tests existentes de AMBOS modales pasan SIN adaptacion -> la extraccion es behavior-preserving.
- **Verificacion**: `yarn test:run src/features/ventas/components/__tests__/{tipo-nc-selector,crear-ncr-modal,nota-credito-pos-modal}.test.tsx`

## Slice 2 — Reorden `SeleccionLineasNc` (D4, ambos modales) — COMPLETO (alcance reducido)

- **Rama**: `feat/unificacion-modal-nc-pr2-reorden` (stack sobre `feat/unificacion-modal-nc-pr1-tiponc`)
- **Que**: reorden JSX puro. El bloque "articulos a devolver" (`SeleccionLineasNc`, rama PARCIAL) se movio de estar al FINAL del modal a estar justo debajo de `TipoNcSelector`, en AMBOS modales. Sin cambios de props, logica de negocio ni del gate que revela el bloque.
- **Alcance reducido a proposito** (decision de ejecucion de este batch, documentada en `tasks.md`): NO se agrego la prop `origenPendiente` a `seleccion-lineas-nc.tsx`, NI se movio el bloque Deposito en POS. Ambos quedan diferidos a Slice 3, donde POS gana el modelo `origenReverso` (mas natural resolverlo ahi que tocar la UI de Origen dos veces). El gate del bloque en admin sigue siendo `tipoNc === 'PARCIAL' && origenReverso` (sin cambios) — esto significa que, tal cual queda hoy, seleccionar "Parcial" en admin SIN elegir Origen aun no muestra nada arriba (mismo comportamiento que antes, solo cambia DONDE aparece una vez que Origen SI esta elegido).
- **Admin** (`crear-ncr-modal.tsx`): bloque `SeleccionLineasNc` (antes en la cola de un ternario de 3 ramas junto a `RefundTesoreriaForm`/aviso irreversible) se extrajo a su propio condicional (`tipoNc === 'PARCIAL' && origenReverso ? <SeleccionLineasNc/> : null`) insertado inmediatamente despues de `<TipoNcSelector/>`. El ternario remanente (TOTAL+DEVOLVER_DINERO / TOTAL+CREDITO_A_FAVOR) quedo intacto, solo sin la rama PARCIAL.
- **POS** (`nota-credito-pos-modal.tsx`): mismo patron — `{tipoNc === 'PARCIAL' ? <SeleccionLineasNc/> : null}` insertado justo despues de `<TipoNcSelector/>`, antes de "Modalidad de liquidacion"/Deposito/Motivo (que NO se movieron). El ternario final (antes `PARCIAL ? A : TOTAL ? B : C`) se reescribio a `TOTAL ? B : tipoNc === null ? C : null` para no duplicar el mensaje neutro cuando `tipoNc === 'PARCIAL'` (el bloque PARCIAL ya se muestra arriba).
- **Tests**: se agrego 1 test de orden por modal usando `compareDocumentPosition`/`DOCUMENT_POSITION_FOLLOWING` (mismo patron que el test preexistente "Reorden del layout" de deposito/TipoNc en admin). Ambos tests nuevos se confirmaron RED contra el codigo viejo via `git stash` de solo los componentes (dejando los tests nuevos aplicados), luego GREEN al restaurar. Suites completas de ambos modales sin adaptacion adicional: 23/23 (admin) y 65/65 (POS), incluyendo los 2 tests nuevos.
- **Verificacion**: `yarn test:run` completo → 1642/1645 (3 fallas = flakes preexistentes de PowerSync, `Worker is not defined`, no relacionados con este cambio). `yarn type-check:test` sin errores en los 4 archivos tocados (hay 3 errores preexistentes en `producto-form-*.test.tsx` y `use-pwa-update.ts`, no relacionados).
- **Archivos**: `crear-ncr-modal.tsx` (+23/-21L), `crear-ncr-modal.test.tsx` (+15L), `nota-credito-pos-modal.tsx` (+26/-21L), `nota-credito-pos-modal.test.tsx` (+16L). ~81L netas.

## Fix QA Slice 2/3 (adelantado desde Slice 3) — COMPLETO

QA del usuario sobre Slice 2 detecto 2 cosas; se corrigieron sobre la rama PR2:

1. **Gate de articulos a devolver** (BUG): en admin, `SeleccionLineasNc` dependia de `tipoNc==='PARCIAL' && origenReverso` -> no se mostraba hasta elegir vuelto/credito. Corregido: ahora se muestra apenas `tipoNc==='PARCIAL'` (regla: Total/Parcial es inventario, independiente del vuelto). Se agrego prop `origenPendiente` a `seleccion-lineas-nc.tsx` (L57/88/139/287): muestra los articulos pero bloquea Confirmar (`puedeConfirmar` incluye `!origenPendiente`) hasta elegir origen. POS no regresiona (ya mostraba bien).
2. **Boton Confirmar POS fijo**: se ocultaba el boton interno de SeleccionLineasNc (`mostrarBotonConfirmar={false}`) y se expone estado al padre (`onEstadoConfirmarChange`) que lo renderiza en la seccion FINAL del modal, misma posicion en Total y Parcial (antes "saltaba"). Cero cambio de logica de `puedeConfirmar`.

Verificado por lectura de codigo + test liviano `seleccion-lineas-nc.test.tsx` 12/12. Los 2 modales pesados NO se re-corrieron (collect ~80s por WASM/PowerSync, ver deuda architecture/test-collect-lento-powersync) -> QA visual en navegador.

## Pendiente

- **Slice 3**: compartir seccion NC-info al POS (Devolver dinero/Credito a favor + OrigenReversoSelector + resolverModalidadDesdeOrigen) [ALTO riesgo]. `origenPendiente` ya agregado en este fix. Falta mover el bloque Deposito en POS a antes de `TipoNcSelector`.
- **Slice 4**: RefundTesoreriaForm al POS con restriccion de origen (sesion propia + Tesoreria PIN C) [ALTO riesgo].
- **Slice 5**: cleanup (remover select "Modalidad de liquidacion" del POS).
