# Proposal: Unificación de la sección NC-info (modal POS y modal Admin)

## Intent

Las dos UIs de emisión de Nota de Crédito (`nota-credito-pos-modal.tsx`, 840 líneas; `crear-ncr-modal.tsx`, 468 líneas) duplican JSX y lógica de disclosure para el mismo concepto de negocio (emitir NC contra una factura ya emitida), aunque el motor de escritura `crearNotaCredito` ya está unificado desde antes (parametrizado por `entryPoint`/`modalidad`/`tipo`). Cada ajuste futuro de UX/validación en la sección NC hoy exige tocar dos archivos con riesgo de que diverjan. Este change reduce esa duplicación reusando el modal ADMIN como base y llevando su modelo de "Origen del reverso" (Devolver dinero / Crédito a favor) + `RefundTesoreriaForm` al POS, preservando las restricciones propias de sesión y PIN del POS.

## Scope

### In Scope
- Reordenar la sección "artículos a devolver" (Parcial) para que aparezca INMEDIATAMENTE debajo de Total/Parcial, en AMBOS modales (único cambio al modal admin).
- POS: nuevo flujo tras "Emitir notas de crédito" → Depósito (PIN existente) → Total/Parcial → gestión de vueltos (Devolver dinero / Crédito a favor) + concepto, reusando las validaciones del admin (filas completas, límite de caja, warnings).
- POS gana "Devolver dinero" con origen: sesión activa propia (directo) o Tesorería (nuevo gate de PIN, mismo mecanismo PIN A/PIN B existente).
- Preservar: pantalla compartida POS, botón "Emitir notas de crédito", vista de detalle de factura desde el listado del día, alcance de sesión activa, presentación del cuadre.
- Preservar la asimetría documentada `origenReverso` → `modalidad` según `tipoNc` (ver Riesgos).

### Out of Scope
- Modificar `crearNotaCredito` (`use-notas-credito.ts:665-1469`) o las queries de cuadre — el motor NO se toca.
- Cambiar el comportamiento contable ya correcto (NC-admin fuera del cuadre salvo egreso Fase 2 vía `origen='NCR'`).
- Slices 3/4 completos de la exploración (unificación total del modelo de datos "Origen"/"Modalidad", extracción del `SupervisorPinDialog`) — se resuelven incrementalmente, ver Rollback/Slicing.

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `notas-credito-pos`: nuevo flujo post-reveal (Depósito → Total/Parcial → vueltos), incorpora Devolver-dinero/Crédito-a-favor + `RefundTesoreriaForm` con origen sesión-propia o Tesorería-tras-PIN.
- `notas-credito-admin`: reordena la sección Parcial (artículos a devolver) justo debajo de Total/Parcial; sin cambio de reglas.

## Approach

Extraer un componente parametrizado (nombre tentativo `NcInfoSection` o similar, a definir en Design) que reciba **por prop obligatoria** `entryPoint: 'POS' | 'TRADICIONAL'`, factura, permisos/PIN gates, y los orígenes de vuelto permitidos. El admin sigue siendo la base funcional; el modal POS se adapta para consumir el componente compartido, agregando sus propios wrappers de PIN y alcance de sesión sin tocar el motor.

**Invariante NO NEGOCIABLE**: `entryPoint` es la única señal que activa la Regla de Oro (`use-notas-credito.ts:737-741`) y decide si una NC afecta el cuadre de una sesión. El componente compartido MUST recibir `entryPoint` por prop desde el llamador — MUST NOT inferirlo ni tener un default. Un error acá rompe silenciosamente el cuadre de caja o filtra NC-admin hacia el cuadre de una sesión.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/ventas/components/nota-credito-pos-modal.tsx` | Modified | Reorden Parcial, nuevo flujo de vueltos, origen Tesorería tras PIN |
| `src/features/ventas/components/crear-ncr-modal.tsx` | Modified | Único cambio: reorden de la sección Parcial |
| `src/features/ventas/components/refund-tesoreria-form.tsx` | Reused | Se consume también desde POS, sin cambios propios previstos |
| `src/features/ventas/hooks/use-notas-credito.ts` | Not touched | Motor ya unificado, fuera de alcance |
| `.../__tests__/nota-credito-pos-modal.test.tsx` (1516 líneas) | Modified | Migrar/actualizar cobertura del nuevo flujo |
| `.../__tests__/crear-ncr-modal.test.tsx` (438 líneas) | Modified | Cobertura del reorden Parcial |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `entryPoint` inferido/hardcodeado incorrectamente al compartir componente | Med | Invariante explícita arriba; test dedicado que verifique `entryPoint` por prop en ambos modales |
| Traducción asimétrica `origenReverso`→`modalidad` según `tipoNc` se pierde al portar a POS (bug ya corregido una vez en admin, comentario `crear-ncr-modal.tsx:71-81`) | Med | Reusar la función de traducción existente sin reimplementarla; test de regresión explícito |
| PIN de Tesorería-como-origen mal integrado con el mecanismo PIN A/B existente en POS | Med | Reusar `SupervisorPinDialog` tal cual; PIN se re-solicita por acción, no se comparte estado entre gates |
| Ruptura del scope "FROZEN" documentado (`factura-detalle-panel.tsx:186-188`) | Low | Documentado y aceptado deliberadamente en este proposal; coordinar con `consulta-factura-evolucion`/`nc-refund-tesoreria` si dependen del freeze |
| Tamaño total excede budget de revisión (400 líneas) | High | Slicing en PRs encadenados (ver Rollback Plan) |
| Responsividad mobile del POS no verificada para el nuevo bloque de vueltos | Med | Verificar en mobile antes de cerrar el slice que introduce vueltos en POS |
| Cobertura de tests desigual (POS 1516 líneas vs admin 438) | Med | Portar tests de comportamiento compartido antes de borrar JSX duplicado |

## Rollback Plan

Cada slice es un PR independiente y revertible por `git revert` sin afectar el motor de escritura (no tocado). Si un slice introduce una regresión de cuadre, revertir ese slice puntual restaura el modal afectado a su comportamiento anterior sin impacto en los demás. El slice de mayor riesgo (vueltos + Tesorería en POS) se libera detrás de verificación manual de cuadre antes de merge.

## Dependencies

- Motor `crearNotaCredito` y sus 5 modalidades, ya estables (spec `notas-credito-liquidacion`) — se consume, no se modifica.
- Componentes ya compartidos: `FacturaDetallePanel`, `SeleccionLineasNc`, `RefundTesoreriaForm`, funciones puras de `notas-credito-ui.ts`.

## Success Criteria

- [ ] Ambos modales muestran la sección Parcial inmediatamente debajo de Total/Parcial.
- [ ] POS ofrece Devolver-dinero (sesión propia o Tesorería-tras-PIN) y Crédito-a-favor, con las mismas validaciones que admin.
- [ ] `entryPoint` sigue viniendo por prop explícita en cada modal; ninguna NC-admin aparece en el cuadre de una sesión salvo el egreso Fase 2 ya existente.
- [ ] Suite de tests de ambos modales migrada/actualizada, sin pérdida de cobertura de comportamiento compartido.
- [ ] Ningún cambio en `use-notas-credito.ts` ni en las queries de cuadre.
