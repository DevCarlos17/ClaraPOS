# Proposal: Precio Venta Bs editable + cascada bidireccional en sandbox "Tasa Paralela" (modo manual)

## Intent

En el sandbox "Tasa Paralela", modo **"Editar manual todo"**, solo Margen % es editable; Precio $ es derivado y no hay columna Bs. Falta poder editar Margen %, Precio $ o Precio Bs por nivel, recalculando los otros dos.

## Scope

### In Scope
- Columna **Precio Venta Bs** en la tabla preview del modo 'manual'.
- Precio $ y Precio Bs editables por nivel (junto a Margen %), solo en modo 'manual'.
- Cascada bidireccional reusando `calcularPrecioPreservandoMargenD`, `calcularMargenPreservandoPvp`, `usdToBs`/`bsToUsd` — sin fórmulas nuevas.
- Máscara de precisión completa (ref full + focus/blur) en los 2 campos nuevos, mismo contrato del form.
- Bloqueo de "Confirmar cambios" con margen negativo en algún nivel.
- Extender pre-fill de `handleSetModoRecalculo('manual')` a PVP $ y Bs.
- Tests vitest para `calcularMargenPreservandoPvp` y las 3 cascadas (sin cobertura hoy).

### Out of Scope
- Modos 'margen'/'mantener_pvp' (sin cambios).
- Persistencia: solo 4 campos USD de 8 decimales se guardan; Margen/Bs siguen derivados.
- Aviso de margen negativo fuera de este sandbox.

## Capabilities

### New Capabilities
- `producto-tasa-paralela-manual-bidireccional`: edición bidireccional Margen%/Precio $/Precio Bs por nivel en modo manual, con bloqueo por margen negativo.

### Modified Capabilities
- None.

## Approach

6 `useState` nuevos (PVP $ y Bs por nivel). Cada `onChange` construye `Decimal` fresco desde el input crudo (nunca el enmascarado) y escribe los otros 2 campos vía las funciones puras existentes, igual patrón que `handleTasaParalelaChange`. Modo 'manual' lee estos 3 campos directamente (`calcularPreviewNivel` intacta en otros modos). "Confirmar" se deshabilita con margen negativo.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `producto-form.tsx` (L482-526, L1143-1170, L1230-1239, L2657-2730) | Modified | State nuevo, render bifurcado, pre-fill extendido, columna Bs |
| `producto-precio-gating.ts` | Tests only | Cobertura para `calcularMargenPreservandoPvp` |
| `currency.ts`, `decimal-display-mask.ts` | None | Reuso |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Precision leak por `parseFloat` sobre string enmascarado (bug previo) | Medium | Decimal fresco en `onChange`; computos leen solo `xFullRef.current` |
| Regresión en modos existentes / sandbox sin cobertura hoy | Medium | No tocar esos modos; tests de la cascada antes del JSX |

## Rollback Plan

Cambio aislado a la rama `modoRecalculo === 'manual'` de un archivo, sin schema/persistencia nuevos. Revertir el commit restaura el comportamiento anterior.

## Dependencies

- Ninguna.

## Success Criteria

- [ ] Editar Margen %, Precio $ o Precio Bs recalcula los otros dos con Decimal.
- [ ] Campos nuevos usan el contrato completo de máscara.
- [ ] "Confirmar" bloqueado con margen negativo tras editar $/Bs.
- [ ] Modos 'margen'/'mantener_pvp' intactos; `yarn test:run` pasa.
