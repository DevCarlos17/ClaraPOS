# Tasks: Unificación de la sección NC-info (modal POS y modal Admin)

## Review Workload Forecast

| Slice | Contenido | Líneas est. | Riesgo 400L | Riesgo funcional |
|---|---|---|---|---|
| 1 | `TipoNcSelector` | ~90 | Low | Bajo |
| 2 | Reorden depósito(POS)/`SeleccionLineasNc`(D4) + `origenPendiente` | ~150 | Low-Medium | Bajo-Medio |
| 3 | `OrigenReversoSelector` + `resolverModalidadDesdeOrigen`; POS gana Origen | ~250 | High | Alto (D2) |
| 4 | POS gana `RefundTesoreriaForm` restringido (D5) + PIN C (D3) | ~260 | High | Alto |
| 5 | Cleanup `MODALIDADES_POS`, mobile, regresión total | ~100 | Low | Bajo |
| **Total** | | **~850** | | |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

**Rationale chain strategy**: cada slice depende del anterior (Slice 3/4 dejan a POS en un estado intermedio conocido — ver nota D2 abajo) y el motor no se toca en ninguno; un `feature-branch-chain` evita exponer `main` a un POS a medio construir entre Slice 3 y 4, y cada PR hijo queda acotado (~90–260L, todos bajo 400L individualmente). Elección final del chain concreto queda al orquestador/usuario.

## Nota resuelta: PARCIAL + Devolver dinero (NO construir lógica especial)

El Open Question de `design.md` ("¿PARCIAL + Devolver dinero → AJUSTE_CXC?") está **RESUELTO**: "Devolver dinero" en POS debe reflejar exactamente el mismo gate que ya existe en admin (`tipoNc === 'TOTAL' && origenReverso === 'DEVOLVER_DINERO'` → `RefundTesoreriaForm`/`REFUND_TESORERIA`). El motor ya reparte `remanenteALiquidar` en N egresos de tesorería/sesión + el remanente no cubierto va a SAF (`use-notas-credito.ts:1227,1326-1411`) — Total-vs-Parcial es ortogonal al flujo de dinero, solo afecta inventario. Slices 3 y 4 **NO** deben agregar ninguna rama/UI especial para `PARCIAL + DEVOLVER_DINERO`: ese combo sigue cayendo, igual que hoy en admin, en el fallback `AJUSTE_CXC` de `resolverModalidadDesdeOrigen` vía `emitirNc()` (byte-idéntico al riesgo ya preservado a propósito en `crear-ncr-modal.tsx:216-224`, fuera de alcance de este change).

---

## Slice 1 — `TipoNcSelector` (Riesgo bajo)

**Inicio**: sin dependencias. **Fin**: ambos modales renderizan vía el componente extraído, cero cambio de DOM/comportamiento. **Rollback**: revertir 3 archivos, sin cambio de forma de estado.

- [ ] 1.1 RED — Crear `components/__tests__/tipo-nc-selector.test.tsx`: oculta "Total" si `puedeTotal=false` (+ warning), `aria-pressed` refleja `tipoNc`, `onChange('TOTAL'|'PARCIAL')` al click. (~55L)
- [ ] 1.2 GREEN — Crear `components/tipo-nc-selector.tsx`: extraer JSX verbatim de `crear-ncr-modal.tsx:303-334` a `TipoNcSelector({ tipoNc, onChange, puedeTotal })`, presentacional puro, sin `entryPoint`. (~45L)
- [ ] 1.3 REFACTOR — Consumir en `crear-ncr-modal.tsx` (reemplaza `:303-334`) y `nota-credito-pos-modal.tsx` (reemplaza `:563-596`) por `<TipoNcSelector tipoNc={tipoNc} onChange={setTipoNc} puedeTotal={puedeTotal} />`.
- [ ] 1.4 Verify — `yarn test:run tipo-nc-selector`, `yarn test:run crear-ncr-modal`, `yarn test:run nota-credito-pos-modal`: los 3 en verde SIN tocar aserciones existentes (DOM idéntico).

New: `tipo-nc-selector.tsx` (~45L), `__tests__/tipo-nc-selector.test.tsx` (~55L). Modified: `crear-ncr-modal.tsx` (~-25L neto), `nota-credito-pos-modal.tsx` (~-25L neto).

---

## Slice 2 — Reorden depósito (POS) + `SeleccionLineasNc` D4 (ambos) + `origenPendiente`

**Inicio**: depende de Slice 1. **Fin**: orden coincide con specs `notas-credito-pos`/`notas-credito-admin` (artículos a devolver justo debajo de Total/Parcial; depósito antes de Total/Parcial en POS). **Rollback**: revertir 3 archivos; prop `origenPendiente` es opcional/default `false`, segura.

- [ ] 2.1 RED — `components/__tests__/seleccion-lineas-nc.test.tsx`: con `origenPendiente=true`, botón confirmar deshabilitado + mensaje inline "Debes elegir el origen del reverso primero".
- [ ] 2.2 GREEN — `seleccion-lineas-nc.tsx`: agregar prop `origenPendiente?: boolean` (mismo patrón que `depositoInvalido`), bloquea `puedeConfirmar` + mensaje. (~+15L)
- [ ] 2.3 RED — `crear-ncr-modal.test.tsx`: "artículos a devolver" se renderiza inmediatamente debajo de Total/Parcial y ANTES de "Origen del reverso" (spec `notas-credito-admin` scenario); elegir Parcial sin Origen bloquea confirmar.
- [ ] 2.4 GREEN — `crear-ncr-modal.tsx`: mover bloque `SeleccionLineasNc` (hoy `:395-406`) a justo después de `<TipoNcSelector/>`, antes del bloque Origen (`:343-367`); gate pasa de `tipoNc === 'PARCIAL' && origenReverso` a `tipoNc === 'PARCIAL'`; pasar `origenPendiente={origenReverso === null}`.
- [ ] 2.5 RED — `nota-credito-pos-modal.test.tsx`: depósito de reingreso se renderiza ANTES de Total/Parcial (spec `notas-credito-pos` scenario "Depósito aparece antes..."); "artículos a devolver" aparece inmediatamente debajo de Total/Parcial (scenario "Artículos a devolver aparecen debajo...").
- [ ] 2.6 GREEN — `nota-credito-pos-modal.tsx`: mover bloque Depósito (hoy `:618-654`) a ANTES de `<TipoNcSelector/>` (hoy `:563-596`); mover bloque `SeleccionLineasNc` (hoy `:667-685`) a justo después de `<TipoNcSelector/>`, antes de Modalidad (`:598-616`)/Motivo (`:656-665`). Sin `origenPendiente` aún (POS todavía usa `modalidad` con default — llega en Slice 3).
- [ ] 2.7 Verify — `yarn test:run seleccion-lineas-nc`, `yarn test:run crear-ncr-modal`, `yarn test:run nota-credito-pos-modal`.

Modified: `seleccion-lineas-nc.tsx` (~+15L), `seleccion-lineas-nc.test.tsx` (~+25L), `crear-ncr-modal.tsx` (~±35L movimiento+gate), `crear-ncr-modal.test.tsx` (~+20L), `nota-credito-pos-modal.tsx` (~±60L, dos movimientos), `nota-credito-pos-modal.test.tsx` (~+30L).

---

## Slice 3 — `OrigenReversoSelector` + `resolverModalidadDesdeOrigen`; POS gana Origen (Riesgo alto — D2)

**Inicio**: depende de Slice 2. **Fin**: ambos modales comparten el modelo `origenReverso`; POS pierde el select "Modalidad de liquidación" como fuente de verdad de UI (constante `MODALIDADES_POS` se limpia recién en Slice 5). `TOTAL+DEVOLVER_DINERO` en POS queda temporalmente en estado neutro (transicional, sin confirmar) hasta Slice 4 — comportamiento esperado y documentado, no un bug. **Rollback**: revertir los 3 archivos de código + su parte de tests; POS vuelve al select Modalidad.

**Checkpoint invariante `entryPoint`**: `OrigenReversoSelector` NO recibe ni infiere `entryPoint`; ambos `crearNotaCredito({...})` siguen con su literal hardcodeado (`'TRADICIONAL'` en admin, `'POS'` en POS) sin pasar por la pieza compartida — verificar explícitamente en 3.8.

- [ ] 3.1 RED — `components/__tests__/origen-reverso-selector.test.tsx`: botones "Devolver dinero"/"Credito a favor", `aria-pressed`, `onChange` al click, sin preselección.
- [ ] 3.2 GREEN — `components/origen-reverso-selector.tsx`: extraer JSX verbatim de `crear-ncr-modal.tsx:343-367`, presentacional puro `(value, onChange)`, sin `entryPoint`. (~45L)
- [ ] 3.3 RED — `utils/__tests__/notas-credito-ui.test.ts`: `resolverModalidadDesdeOrigen('CREDITO_A_FAVOR')` → `'SALDO_FAVOR'`; `resolverModalidadDesdeOrigen('DEVOLVER_DINERO')` → `'AJUSTE_CXC'` (fallback verbatim, ver nota resuelta arriba).
- [ ] 3.4 GREEN — `utils/notas-credito-ui.ts`: agregar `resolverModalidadDesdeOrigen`, copia byte-a-byte del ternario de `crear-ncr-modal.tsx:225`. (~+12L)
- [ ] 3.5 REFACTOR (admin) — `crear-ncr-modal.tsx`: consumir `<OrigenReversoSelector/>` en el bloque `:343-367`; reemplazar el ternario inline de `emitirNc` (`:225`) por `resolverModalidadDesdeOrigen(origenReverso!)`. `emitirNcRefund` (`:183-193`, `REFUND_TESORERIA` hardcodeado) **NO se toca**. Verificar `crear-ncr-modal.test.tsx` sigue en verde sin nuevas aserciones (refactor puro).
- [ ] 3.6 RED (POS) — `nota-credito-pos-modal.test.tsx`: Origen selector visible en vez de select Modalidad; `CREDITO_A_FAVOR` + Total o Parcial confirma con `modalidad: 'SALDO_FAVOR'`; `DEVOLVER_DINERO` elegido muestra estado neutro transicional (sin botón de confirmar) — cubre el gap documentado arriba.
- [ ] 3.7 GREEN (POS) — `nota-credito-pos-modal.tsx`: quitar estado `modalidad`/select `MODALIDADES_POS` (`:598-616`) de la UI activa; agregar estado `origenReverso` (default `null`); renderizar `<OrigenReversoSelector/>`; en `emitirNc()` (`:321-367`) calcular `modalidad: resolverModalidadDesdeOrigen(origenReverso!)` para el camino no-refund; gatear el bloque TOTAL (`:686-712`) a `origenReverso === 'CREDITO_A_FAVOR'`; pasar `origenPendiente={origenReverso === null}` a `SeleccionLineasNc`.
- [ ] 3.8 Verify + checkpoint — `yarn test:run origen-reverso-selector`, `yarn test:run notas-credito-ui`, `yarn test:run crear-ncr-modal`, `yarn test:run nota-credito-pos-modal`; confirmar (grep) que `entryPoint` sigue apareciendo solo como literal hardcodeado en los 2 call-sites de `crearNotaCredito`, nunca en `origen-reverso-selector.tsx`.

New: `origen-reverso-selector.tsx` (~45L), `__tests__/origen-reverso-selector.test.tsx` (~45L). Modified: `notas-credito-ui.ts` (~+12L), `notas-credito-ui.test.ts` (~+15L), `crear-ncr-modal.tsx` (~±20L), `nota-credito-pos-modal.tsx` (~+70/-45L), `nota-credito-pos-modal.test.tsx` (~+60L, adapta describes `Slice 5a-2a`/`Slice 3b`).

---

## Slice 4 — POS gana `RefundTesoreriaForm` restringido (D5) + PIN C (D3) (Riesgo alto)

**Inicio**: depende de Slice 3. **Fin**: POS ofrece "Devolver dinero" (Total) con origen sesión propia directo o Tesorería tras PIN C; combo `PARCIAL+DEVOLVER_DINERO` sigue sin UI dedicada (nota resuelta arriba, sin cambios). **Rollback**: revertir `refund-tesoreria-form.tsx` (props opcionales, default = comportamiento admin actual) + wiring POS; POS retrocede al estado transicional de Slice 3.

**Checkpoint invariante `entryPoint`**: `RefundTesoreriaForm` sigue sin recibir `entryPoint` (solo `restringirOrigenASesionId`/`mostrarOrigenTesoreria`, alcance decidido por el llamador); `emitirNcRefund()` de POS hardcodea `entryPoint: 'POS'` igual que admin hardcodea `'TRADICIONAL'` en su `emitirNcRefund` — verificar en 4.5.

- [ ] 4.1 RED — `components/__tests__/refund-tesoreria-form.test.tsx`: con `restringirOrigenASesionId="sesion-1"` el select Origen SOLO ofrece esa sesión (+ Tesorería si `mostrarOrigenTesoreria`); con `mostrarOrigenTesoreria=false` la opción Tesorería no aparece; línea nueva por defecto usa `SESION:sesion-1` en vez de `'TESORERIA'`. Modo sin props (admin) debe seguir sin cambios.
- [ ] 4.2 GREEN — `refund-tesoreria-form.tsx`: agregar props `restringirOrigenASesionId?: string`, `mostrarOrigenTesoreria?: boolean` (default `true`); filtrar opciones del `<select>` Origen y el `origen` por defecto de línea nueva. (~+40L)
- [ ] 4.3 RED (POS) — `nota-credito-pos-modal.test.tsx`: elegir "Devolver dinero" revela `RefundTesoreriaForm` restringido a la sesión propia; link "Usar Tesorería (requiere PIN)" visible y oculto tras autorizar; tras PIN C correcto, Tesorería aparece como origen disponible; PIN C NO autoriza emitir NC ni cambiar depósito (independencia de gates).
- [ ] 4.4 GREEN (POS) — `nota-credito-pos-modal.tsx`: agregar estado `showPinTesoreria`/`tesoreriaAutorizada`; gatear bloque TOTAL (`origenReverso === 'DEVOLVER_DINERO'`) a `<RefundTesoreriaForm restringirOrigenASesionId={sesion.id} mostrarOrigenTesoreria={tesoreriaAutorizada} onConfirm={lineas => void emitirNcRefund(lineas)} .../>`; agregar `emitirNcRefund()` (mirror de `crear-ncr-modal.tsx:183-193`: `entryPoint:'POS'`, `sesionCajaActivaId: sesion.id`, `modalidad:'REFUND_TESORERIA'` hardcodeado, `tipo:'TOTAL'`, `egresoParams: lineas`); montar 3ª instancia de `SupervisorPinDialog` (PIN C, mismo patrón que PIN B `:816-823`) con `onAuthorized={() => setTesoreriaAutorizada(true)}`; resetear `tesoreriaAutorizada` en los mismos 3 puntos que `resetAutorizacionesPin()`.
- [ ] 4.5 Verify + checkpoint — `yarn test:run refund-tesoreria-form`, `yarn test:run nota-credito-pos-modal`, `yarn test:run crear-ncr-modal` (regresión, sin cambios esperados); confirmar (grep) `entryPoint: 'POS'` solo en `emitirNc`/`emitirNcRefund` de POS, nunca dentro de `refund-tesoreria-form.tsx`.

Modified: `refund-tesoreria-form.tsx` (~+40L), `refund-tesoreria-form.test.tsx` (~+55L), `nota-credito-pos-modal.tsx` (~+95L), `nota-credito-pos-modal.test.tsx` (~+70L, nuevo describe "PIN C / Tesorería").

---

## Slice 5 — Cleanup `MODALIDADES_POS`, mobile, regresión total (Riesgo bajo)

**Inicio**: depende de Slice 4. **Fin**: cero código muerto, comentarios actualizados, suite completa en verde, invariante `entryPoint` verificada globalmente. **Rollback**: revertir solo este commit de cleanup; sin riesgo funcional (dead-code removal).

- [ ] 5.1 REFACTOR — `nota-credito-pos-modal.tsx`: eliminar constante `MODALIDADES_POS` (`:59-64`) y el import de `LiquidacionModalidad`/`NativeSelect` si quedan sin uso.
- [ ] 5.2 REFACTOR — Actualizar comentario `:55-58` ("REFUND_TESORERIA queda deliberadamente excluida...") — ya no aplica, POS la ofrece restringida+PIN-gated.
- [ ] 5.3 Verify mobile — Confirmar (render/responsive test existente `describe(... responsive master-detail ...)`, `:1452`) que el layout 2→1 columna sigue intacto con las nuevas secciones Origen/Refund/PIN C.
- [ ] 5.4 Full regression — `yarn test:run nota-credito-pos-modal`, `yarn test:run crear-ncr-modal`, `yarn test:run refund-tesoreria-form`, `yarn test:run tipo-nc-selector`, `yarn test:run origen-reverso-selector`, `yarn test:run seleccion-lineas-nc`, `yarn test:run notas-credito-ui` — todo en verde.
- [ ] 5.5 Invariante final — Grep ambos modales: `entryPoint:` aparece exactamente como literal (`'TRADICIONAL'` × N en admin, `'POS'` × N en POS), nunca como prop de `TipoNcSelector`/`OrigenReversoSelector`/`RefundTesoreriaForm`/`SeleccionLineasNc`.
- [ ] 5.6 Confirmar que `nota-credito-pos-modal.test.tsx` (1516L base) fue ADAPTADO por slice, no borrado en bloque — el diff acumulado de Slices 2-5 debe mostrar migraciones de describes existentes (`Slice 5a-2a`, `Slice 3b`), no un `git diff --stat` con solo eliminaciones netas grandes.

Modified: `nota-credito-pos-modal.tsx` (~-15L), sin nuevos archivos.

---

## Suggested Work Units (PR split)

| Unit | Goal | Base (feature-branch-chain) | Notes |
|---|---|---|---|
| 1 | Slice 1 — `TipoNcSelector` | tracker branch | Sin riesgo funcional |
| 2 | Slice 2 — Reorden D4 + depósito POS | PR 1 branch | Toca specs de orden directamente |
| 3 | Slice 3 — `OrigenReversoSelector` + POS pierde Modalidad | PR 2 branch | Deja `DEVOLVER_DINERO` transicional en POS a propósito |
| 4 | Slice 4 — `RefundTesoreriaForm` + PIN C en POS | PR 3 branch | Cierra el gap transicional de Slice 3 |
| 5 | Slice 5 — Cleanup + regresión | PR 4 branch | Último, antes de mergear tracker → main |
