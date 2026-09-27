# Design: Unificación de la sección NC-info (modal POS y modal Admin)

## Technical Approach

No se crea un `NcInfoSection` monolítico (sketch de `explore.md §E.1` descartado por sobre-parametrizado). Se extraen 2 piezas presentacionales chicas + 1 función pura, y se reordena JSX en ambos modales. Admin sigue siendo la base funcional (modelo Origen/RefundTesoreriaForm); POS lo adopta, reemplazando su select "Modalidad de liquidación". `entryPoint` nunca sale de los call-sites de `crearNotaCredito` — ninguna pieza compartida lo recibe ni lo infiere.

## Architecture Decisions

### D1 — Límite del componente compartido
**Elección**: extraer `TipoNcSelector` (Total/Parcial, idéntico byte-a-byte en `crear-ncr-modal.tsx:303-334` / `nota-credito-pos-modal.tsx:563-596`) y `OrigenReversoSelector` (Devolver dinero/Crédito a favor, extraído de `crear-ncr-modal.tsx:343-367`, nuevo consumidor: POS). Ambos presentacionales puros (`value`/`onChange`), sin `entryPoint`, sin fetch. `FacturaDetallePanel`/`SeleccionLineasNc`/`RefundTesoreriaForm` ya compartidos, se reusan sin fork.
**Descartado**: `NcInfoSection` único con ~15 props condicionales (explore §E.1) — dificulta el slicing y mezcla responsabilidades POS/admin.
**Fuera de scope**: aviso "reversada totalmente" y `<input>` Motivo — duplicación trivial, se preserva tal cual.

### D2 — Modelo Origen/Modalidad (asimetría preservada)
Ambos modales pasan a tener `origenReverso: 'DEVOLVER_DINERO' | 'CREDITO_A_FAVOR' | null` (POS elimina `modalidad`/`MODALIDADES_POS`). Se extrae `resolverModalidadDesdeOrigen(origenReverso): 'SALDO_FAVOR' | 'AJUSTE_CXC'` a `notas-credito-ui.ts`, copiado **verbatim** de `crear-ncr-modal.tsx:225`, consumida por `emitirNc()` en ambos. `TOTAL + DEVOLVER_DINERO` sigue hardcodeado a `'REFUND_TESORERIA'` vía `emitirNcRefund` (`crear-ncr-modal.tsx:189`), nunca pasa por la función pura. `entryPoint`/`sesionCajaActivaId` siguen hardcodeados en el `crearNotaCredito({...})` de cada modal — la función pura solo calcula `modalidad`. `egresoParams` solo viaja junto a `REFUND_TESORERIA` (mismo patrón admin) — `assertGateAntiFraudeNoDesembolso` sigue funcionando intacta.
**Riesgo preservado a propósito**: `PARCIAL + DEVOLVER_DINERO → AJUSTE_CXC` (`crear-ncr-modal.tsx:216-224`) hoy es alcanzable en admin sin feedback dedicado; en POS será una combinación real elegible. Motor sin cambios (fuera de scope) — **Open Question** antes de Slice 3.
**Select "Modalidad de liquidación" (POS)**: eliminado (`MODALIDADES_POS`, `:59-64,598-616`). `EFECTIVO_REAL`/`COMPENSACION_VENTA` quedan sin caller en la UI (motor intacto).

### D3 — Modelo de PIN (un componente, tres gates independientes)
`SupervisorPinDialog` es **stateless por invocación** — "un solo PIN re-solicitado" se resuelve montando una instancia más, igual al patrón PIN A/PIN B existente. Tres flags en `nota-credito-pos-modal.tsx`, sin estado compartido:
| Gate | Flag existente/nuevo | Autoriza |
|---|---|---|
| PIN A | `showPin`/permiso (existe) | Emitir NC |
| PIN B | `showPinDeposito`/`pinDepositoAutorizado` (existe) | Cambiar depósito |
| PIN C (nuevo) | `showPinTesoreria`/`tesoreriaAutorizada` | Origen=Tesorería |

Los 3 viven en el wrapper POS; el admin no monta ninguno (`RefundTesoreriaForm` con `mostrarOrigenTesoreria` default `true`). `tesoreriaAutorizada` se resetea en los mismos 3 puntos que `resetAutorizacionesPin()`.

### D4 — Reorden "artículos a devolver" (ambos modales)
Solo afecta la rama PARCIAL. `SeleccionLineasNc` se mueve a justo después de `TipoNcSelector`, ANTES de `OrigenReversoSelector` — nueva prop `origenPendiente?: boolean` en `SeleccionLineasNcProps` (mismo patrón que `depositoInvalido`: bloquea `puedeConfirmar` + mensaje inline) para impedir confirmar sin `origenReverso` elegido (evita reintroducir el bug de `:71-81`). La rama TOTAL (Origen → Motivo → RefundForm/Warning) no se mueve.

### D5 — Restricción de orígenes de vuelto en POS
Dos props opcionales en `RefundTesoreriaFormProps` (default = comportamiento admin, sin fork): `restringirOrigenASesionId?: string` (filtra el `<select>` Origen a esa sesión + Tesorería) y `mostrarOrigenTesoreria?: boolean` (default `true`; `false` oculta "Tesorería"). POS pasa `restringirOrigenASesionId={sesion.id}` y `mostrarOrigenTesoreria={tesoreriaAutorizada}`, con un link "Usar Tesorería (requiere PIN)" que abre PIN C. La línea por defecto usa `SESION:${sesion.id}` en vez de `'TESORERIA'` cuando el prop está presente.

## File Changes

| File | Action |
|---|---|
| `components/tipo-nc-selector.tsx` | Create (extracción D1) |
| `components/origen-reverso-selector.tsx` | Create (extracción D1) |
| `utils/notas-credito-ui.ts` | Modify — agregar `resolverModalidadDesdeOrigen` |
| `components/seleccion-lineas-nc.tsx` | Modify — prop `origenPendiente` |
| `components/refund-tesoreria-form.tsx` | Modify — props `restringirOrigenASesionId`, `mostrarOrigenTesoreria` |
| `components/crear-ncr-modal.tsx` | Modify — consumir selectores extraídos, reorden D4 |
| `components/nota-credito-pos-modal.tsx` | Modify — `origenReverso` reemplaza `modalidad`, PIN C, reorden D4/D5 |
| `__tests__/*.test.tsx` (ambos) | Modify — migrar tests de bloques movidos |

## Testing Strategy
Tests nuevos por componente extraído, portando casos de ambas suites. Test dedicado por modal: `entryPoint` llega hardcodeado en cada `crearNotaCredito()`. Regresión explícita de la asimetría D2. Integración: POS con PIN C mockeado sobre `RefundTesoreriaForm` filtrado.

## Slicing (chain recomendada)

| Slice | Contenido | Riesgo | Líneas |
|---|---|---|---|
| 1 | Extraer `TipoNcSelector`, consumir en ambos | Bajo | ~80 |
| 2 | Reorden D4 + prop `origenPendiente` | Bajo-Medio | ~120 |
| 3 | `OrigenReversoSelector` + `resolverModalidadDesdeOrigen`; POS gana Origen (reemplaza Modalidad) | Alto (D2) | ~250 |
| 4 | POS gana `RefundTesoreriaForm` restringido (D5) + PIN C (D3) | Alto | ~200 |
| 5 | Cleanup `MODALIDADES_POS`, mobile, tests | Bajo | ~100 |

PRs encadenados (`chained-pr`/`work-unit-commits`), cada uno revertible sin afectar el motor.

## Open Questions
- [ ] ¿`PARCIAL + Devolver dinero` en POS debe producir `AJUSTE_CXC` (comportamiento heredado de admin) o requiere un mapeo de negocio distinto? Confirmar con el usuario antes de Slice 3.
- [ ] ¿Se acepta que `EFECTIVO_REAL`/`COMPENSACION_VENTA` queden sin UI alcanzable en POS tras este change?
