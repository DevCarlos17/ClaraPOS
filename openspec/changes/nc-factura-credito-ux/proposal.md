# Proposal: UX inteligente de Nota de Crédito sobre facturas con saldo a crédito

## Intent

El motor de Nota de Crédito (`use-notas-credito.ts::crearNotaCredito`) YA calcula correctamente el reparto en dos pasos cuando una factura tiene deuda pendiente (`saldo_pend_usd > 0`): Step A cancela primero `min(saldo_pend, totalNC)` de la deuda; Step B liquida solo el remanente (`totalNC - montoAplicadoAPendiente`) y no escribe nada si el remanente es 0. El motor NO necesita cambios.

El problema es 100% de UI: `OrigenReversoSelector` muestra SIEMPRE los mismos dos botones ("Devolver dinero" / "Crédito a favor"), sin importar cuánto queda por decidir. En una factura 100% a crédito (o cuando la NC ≤ deuda), el remanente es $0 y ambos botones son irrelevantes — peor, "Crédito a favor" es engañoso porque no genera ningún saldo a favor, solo cancela deuda. Tampoco hay desglose visible antes de confirmar, ni advertencia cuando elegir una opción "sin desembolso" en una NC TOTAL puede descuadrar la caja (NC TOTAL reversa `pagos` incondicionalmente; el egreso compensatorio solo existe para `EFECTIVO_REAL`, inalcanzable desde la UI).

## Scope

### In Scope
- Función pura en `notas-credito-ui.ts` que calcule el desglose (monto aplicado a deuda / remanente disponible) reutilizando `calcularMontoDisponibleRefund`.
- `OrigenReversoSelector` vuelto condicional: remanente `0` → vista solo-confirmación ("Esta NC cancela $X de la deuda pendiente"); remanente `> 0` → desglose + los dos botones existentes.
- Advertencia soft-confirm (patrón `AlertDialog` ya existente en `RefundTesoreriaForm`) cuando NC TOTAL + hubo cobro real en efectivo + se elige una modalidad sin desembolso.
- Wiring idéntico en ambos modales (POS y admin), reutilizando las mismas funciones puras y el mismo componente.

### Out of Scope
- Cualquier cambio a `use-notas-credito.ts::crearNotaCredito` (motor ya correcto).
- Habilitar `AJUSTE_CXC` con remanente `> 0` (split explícito) — posible change futuro, no aquí.
- Verificar si el cuadre ya registra los SAF de sesión — el owner lo valida en un paso siguiente, no en este change.
- Cambios al gate anti-fraude, a `entryPoint`, o a `notas_credito.sesion_caja_id`.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `notas-credito-admin`: el requirement "Selector 'Devolver dinero' / 'Crédito a favor'" pasa a ser condicional al remanente calculado (hoy siempre muestra ambos botones sin importar el desglose Step A/B).
- `notas-credito-pos`: mismo gap — el selector (componente compartido con admin) no tiene requirement formal en este spec; se agrega junto con el fix.

## Approach

Mantener la estructura de 4 pasos ya validada por el owner: (1) Total/Parcial sin cambios; (2) Método vuelto INTELIGENTE — calcula el remanente vía la función pura extendida y decide qué renderizar (solo-confirmación vs desglose+opciones+advertencia); (3) Origen de fondos sin cambios (solo si se eligió reembolso); (4) Procesar sin cambios (llama al motor intacto).

## Casos de negocio (ya soportados por el motor; este change los hace CLAROS en la UI)

| # | Caso | Resultado esperado en UI |
|---|------|---------------------------|
| 1 | Factura 100% crédito, NC x% | Solo confirmación: "cancela $X de deuda", sin elegir método |
| 2 | Factura x% crédito, NC > deuda | Cancela deuda primero; excedente (ya cobrado) se reembolsa |
| 3 | Factura x% crédito, NC > deuda | Cancela deuda primero; excedente queda como saldo a favor |

## Invariantes duras (no negociables)

1. **El vínculo NC↔cuadre no se rompe.** No se toca `entryPoint`, `notas_credito.sesion_caja_id` ni ningún input que determine si una NC aparece como "NC · POS" o "NC · Adm" en el cuadre (lógica recién corregida en el change hermano `nc-cuadre-origen-pos-vs-adm`, branch `feat/cuadre-nc-origen-pos-vs-adm`). Este change debe mantenerse compatible con ese branch.
2. **Misma elección del usuario → mismos movimientos de hoy.** Es un change de presentación: cambia QUÉ opciones se OFRECEN (ocultar las irrelevantes, mostrar desglose/advertencia), nunca QUÉ hace cada opción en el motor. Los egresos escritos en `movimientos_metodo_cobro` (origen='NCR') deben ser idénticos byte a byte para intención de usuario equivalente.
3. **Cero cambios al motor.** `use-notas-credito.ts::crearNotaCredito` no se toca. Solo: `notas-credito-ui.ts` (funciones puras nuevas/extendidas), `OrigenReversoSelector` (condicional/inteligente), wiring en ambos modales.
4. **POS y admin se comportan idéntico y REUTILIZAN la misma lógica** (funciones puras en `notas-credito-ui.ts` + el componente `OrigenReversoSelector` compartido) — sin caminos de código divergentes que mantener por separado.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/ventas/utils/notas-credito-ui.ts` | Modified | Nueva función pura de desglose (monto a deuda / remanente), testeable en aislamiento (strict TDD) |
| `src/features/ventas/components/origen-reverso-selector.tsx` | Modified | Renderizado condicional según remanente + advertencia soft-confirm |
| `src/features/ventas/components/nota-credito-pos-modal.tsx` | Modified | Wiring del desglose/advertencia, sin tocar `emitirNc*` |
| `src/features/ventas/components/crear-ncr-modal.tsx` | Modified | Igual que arriba (admin) |
| `src/features/ventas/hooks/use-notas-credito.ts` | Verify only | Confirmar que no requiere cambios |
| Tests de los componentes/funciones arriba | Modified/New | Cobertura de los 3 casos de negocio + advertencia |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Excede el budget de revisión de 400 líneas (estimado 250-350) | Medium | Flagear para PRs encadenados: función pura + tests primero, wiring UI después |
| Romper el vínculo NC↔cuadre (`entryPoint`/`sesion_caja_id`) | Low si se respeta invariante 1 | Checklist de review explícito; ningún archivo de cuadre en el diff |
| Decisión de negocio pendiente bloquea diseño | Medium | 5 preguntas abiertas (ver abajo) deben resolverse antes de sdd-spec/design |
| Divergencia POS/admin | Low | Invariante 4 + componente y funciones compartidas obligatorias |

## Preguntas abiertas (pendientes de respuesta del owner, heredadas de la exploración)

1. Label exacto de la vista solo-confirmación cuando remanente = 0.
2. ¿La opción "Solo cancelar deuda" reemplaza o convive con "Crédito a favor" cuando remanente = 0?
3. Advertencia de descuadre: ¿soft-confirm (AlertDialog, como hoy en `RefundTesoreriaForm`) o hard-block?
4. ¿El copy debe distinguir efectivo vs transferencia/tarjeta en la advertencia?
5. ¿Se acepta mantener bloqueado `AJUSTE_CXC` con remanente > 0, o se quiere explorar el split explícito como change futuro?

## Rollback Plan

Revertir el commit/PR restaura el comportamiento actual (dos botones incondicionales, sin desglose ni advertencia). No destructivo — sin cambios de schema, datos, ni al motor.

## Dependencies

- Compatibilidad con el change hermano `nc-cuadre-origen-pos-vs-adm` (branch `feat/cuadre-nc-origen-pos-vs-adm`) — no debe generar conflictos de merge sobre los mismos archivos de cuadre.
- Reusa infraestructura existente: `calcularMontoDisponibleRefund`, `OrigenReversoSelector`, patrón `AlertDialog` de `RefundTesoreriaForm`.

## Success Criteria

- [ ] Caso 1 (remanente 0) muestra vista solo-confirmación, sin botones engañosos
- [ ] Casos 2/3 (remanente > 0) muestran desglose antes de elegir método
- [ ] Advertencia de descuadre aparece en NC TOTAL + cobro real + modalidad sin desembolso
- [ ] Movimientos en `movimientos_metodo_cobro` (origen='NCR') idénticos a hoy para intención equivalente
- [ ] `entryPoint` / `sesion_caja_id` / vínculo de cuadre intactos (verificado en diff)
- [ ] Cero cambios en `use-notas-credito.ts::crearNotaCredito`
- [ ] POS y admin reutilizan las mismas funciones puras y el mismo `OrigenReversoSelector`
- [ ] Suite de tests de `src/features/ventas` en GREEN, incluida cobertura nueva
