# Design: UX inteligente de Nota de Crédito sobre facturas con saldo a crédito

## Technical Approach

El motor (`use-notas-credito.ts::crearNotaCredito`) no cambia. Todo el trabajo es una función
pura nueva que decide QUÉ renderizar, más el wiring de esa decisión en el componente compartido
`OrigenReversoSelector` y en los dos modales (POS + admin) que ya lo consumen. La función pura
reutiliza `calcularMontoDisponibleRefund` (no la reimplementa) y usa el MISMO umbral `0.01` que
ya usa el motor en su propio gate de Step B (`use-notas-credito.ts:1229`,
`remanenteALiquidar.gt('0.01')`) — si la UI usara un umbral distinto, podría prometer un
desglose+opciones para un remanente que el motor trata como no-op, o viceversa.

## Architecture Decisions

| # | Decisión | Elegido | Alternativa descartada |
|---|----------|---------|------------------------|
| 1 | Umbral "sin remanente" | Reusar `0.01`, el mismo que el gate del motor (`use-notas-credito.ts:1229`) | Comparar contra literal `0` (Decimal exacto) — divergería del criterio real que usa el motor para decidir si Step B escribe algo |
| 2 | Tipo de retorno de la función pura | `Decimal` en los 3 campos numéricos (no `.toNumber()`) | Convertir a `number` — perdería precisión antes de tiempo (Regla #10: redondear solo al final); `formatUsd` ya acepta `Decimal` directamente (`DecimalInput`, `src/lib/currency.ts:7`) |
| 3 | Modalidad cuando `soloCancelaDeuda` y no hay `origenReverso` elegido | Defaultear a `resolverModalidadDesdeOrigen(origenReverso ?? 'CREDITO_A_FAVOR')` en el caller (`SALDO_FAVOR`) | Exponer `AJUSTE_CXC` — prohibido por spec cuando hay remanente, y aquí el remanente es 0 así que Step B es no-op de todas formas: cualquier modalidad produce el MISMO resultado (invariante #2) |
| 4 | Dónde vive el botón Confirmar cuando `soloCancelaDeuda` (TOTAL) | Relajar el gate existente: `origenReverso === 'CREDITO_A_FAVOR' \|\| vista.soloCancelaDeuda` en el mismo botón que ya existe | Crear un botón nuevo — duplicaría el JSX de "irreversible" + confirmar que ya existe en ambos modales |
| 5 | PARCIAL: bloqueo de confirmar sin elegir origen | Relajar `origenPendiente={origenReverso === null && !vista.soloCancelaDeuda}` (prop ya existe, pasada a `SeleccionLineasNc`) | Modificar `SeleccionLineasNc` — fuera de alcance (no está en Affected Areas del proposal) |
| 6 | `OrigenReversoSelector` — quién decide el copy | El propio componente, recibiendo `vista: VistaReversoNc` ya calculada (presentacional puro, sin fetch) | Pasar solo `soloCancelaDeuda: boolean` y calcular el copy en cada modal — duplicaría el texto exacto del spec en 2 lugares |

## Data Flow

```
factura.total_usd / factura.saldo_pend_usd (o suma de líneas PARCIAL)
        │
        ▼
resolverVistaReversoNc(totalUsdNc, saldoPendVenta)   [notas-credito-ui.ts, PURA]
   internamente: calcularMontoDisponibleRefund(...)  [SIN reimplementar]
        │
        ▼
{ totalUsdNc, montoAplicadoADeuda, montoDisponible, soloCancelaDeuda }
        │
        ▼
<OrigenReversoSelector vista={...} value={origenReverso} onChange={...} />
   soloCancelaDeuda=true  → copy 1 línea, SIN botones
   soloCancelaDeuda=false → desglose + botones "Devolver dinero"/"Crédito a favor"
        │
        ▼
Modal (crear-ncr-modal.tsx | nota-credito-pos-modal.tsx)
   TOTAL:   confirmar habilitado si origenReverso==='CREDITO_A_FAVOR' || vista.soloCancelaDeuda
   PARCIAL: origenPendiente relajado con el mismo OR
        │
        ▼
emitirNc(...) → modalidad: resolverModalidadDesdeOrigen(origenReverso ?? 'CREDITO_A_FAVOR')
        │
        ▼
crearNotaCredito()  ←── SIN CAMBIOS (motor intacto, Step A/B ya correctos)
```

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `src/features/ventas/utils/notas-credito-ui.ts` | Modify | Nueva `VistaReversoNc` + `resolverVistaReversoNc()`, reusa `calcularMontoDisponibleRefund` |
| `src/features/ventas/utils/__tests__/notas-credito-ui.test.ts` | Modify | 6 escenarios del spec + boundary (0.01) para `resolverVistaReversoNc` |
| `src/features/ventas/components/origen-reverso-selector.tsx` | Modify | Prop `vista` (requerida), render condicional (copy vs desglose+botones) |
| `src/features/ventas/components/__tests__/origen-reverso-selector.test.tsx` | Modify | Actualizar 4 tests existentes (nuevo prop `vista`) + 3 nuevos (solo-confirmación, desglose, boundary) |
| `src/features/ventas/components/crear-ncr-modal.tsx` | Modify | `useMemo` de `montoDisponibleParaRefund` → `vistaReversoNc`; relajar gate TOTAL + `origenPendiente` PARCIAL; `resolverModalidadDesdeOrigen(origenReverso ?? 'CREDITO_A_FAVOR')` |
| `src/features/ventas/components/nota-credito-pos-modal.tsx` | Modify | Igual que arriba (mismo patrón, mismo orden de cambios) |
| `src/features/ventas/components/__tests__/crear-ncr-modal.test.tsx` | Modify | 1-2 escenarios de integración: factura 100% crédito → vista solo-confirmación → confirmar emite `SALDO_FAVOR` |
| `src/features/ventas/components/__tests__/nota-credito-pos-modal.test.tsx` | Modify | Igual, ruta POS |
| `src/features/ventas/hooks/use-notas-credito.ts` | None | Verificado: Step A/B ya correctos, cero cambios (invariante #3) |

## Interfaces / Contracts

```ts
// notas-credito-ui.ts
export interface VistaReversoNc {
  totalUsdNc: Decimal
  montoAplicadoADeuda: Decimal
  montoDisponible: Decimal
  soloCancelaDeuda: boolean
}

export function resolverVistaReversoNc(
  totalUsdNc: DecimalInput,
  saldoPendVenta: DecimalInput
): VistaReversoNc {
  const total = new Decimal(totalUsdNc)
  const montoDisponible = calcularMontoDisponibleRefund(total, saldoPendVenta)
  const montoAplicadoADeuda = total.minus(montoDisponible)
  return {
    totalUsdNc: total,
    montoAplicadoADeuda,
    montoDisponible,
    soloCancelaDeuda: montoDisponible.lte('0.01'), // mismo umbral que use-notas-credito.ts:1229
  }
}
```

```tsx
// origen-reverso-selector.tsx
interface OrigenReversoSelectorProps {
  value: OrigenReverso | null
  onChange: (value: OrigenReverso) => void
  vista: VistaReversoNc
}
// vista.soloCancelaDeuda === true  → <p>Esta nota de crédito cancela {formatUsd(vista.montoAplicadoADeuda)} de la deuda pendiente de la factura.</p>
// vista.soloCancelaDeuda === false → "De {formatUsd(vista.totalUsdNc)}: {formatUsd(vista.montoAplicadoADeuda)} cancela deuda pendiente, {formatUsd(vista.montoDisponible)} disponible" + los 2 botones existentes (markup sin cambios)
```

Wiring en ambos modales (idéntico en los 2 archivos):

```ts
const vistaReversoNc = useMemo(() => {
  if (!factura) return resolverVistaReversoNc(0, 0)
  const totalUsdNc = tipoNc === 'PARCIAL' ? (estadoParcialConfirm?.totalUsdPreview ?? 0) : Number(factura.total_usd)
  return resolverVistaReversoNc(totalUsdNc, factura.saldo_pend_usd)
}, [factura, tipoNc, estadoParcialConfirm])

// donde antes se usaba montoDisponibleParaRefund (number) para RefundTesoreriaForm:
montoDisponibleUsd={vistaReversoNc.montoDisponible.toNumber()}   // sin tocar el contrato de RefundTesoreriaForm

// gate TOTAL relajado (mismo botón/JSX "irreversible" + confirmar que ya existe):
tipoNc === 'TOTAL' && (origenReverso === 'CREDITO_A_FAVOR' || vistaReversoNc.soloCancelaDeuda)

// gate PARCIAL relajado (misma prop, mismo componente SeleccionLineasNc sin tocar):
origenPendiente={origenReverso === null && !vistaReversoNc.soloCancelaDeuda}

// modalidad segura sin origenReverso elegido:
modalidad: resolverModalidadDesdeOrigen(origenReverso ?? 'CREDITO_A_FAVOR')
```

`resolverModalidadDesdeOrigen` y `debeUsarRefundTesoreria` NO cambian de firma — solo cambia qué
valor les pasa el caller cuando `origenReverso` es `null` por `soloCancelaDeuda`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (puro) | `resolverVistaReversoNc`: 100% contado (desglose), 100% crédito (solo-confirmación), mixta (desglose), PARCIAL ≤ saldo (solo-confirmación), PARCIAL > saldo (desglose), boundary remanente = 0.01 exacto | `notas-credito-ui.test.ts`, sin montar componentes — reusa fixtures ya existentes del archivo |
| Component | `OrigenReversoSelector`: render condicional (copy vs botones), breakdown text exacto del spec, boundary | `origen-reverso-selector.test.tsx` con `@testing-library/react` (patrón ya usado en el archivo) |
| Integration | Wiring completo: factura 100% crédito → confirmar sin elegir origen → `crearNotaCredito` recibe `modalidad: 'SALDO_FAVOR'` | Extender `crear-ncr-modal.test.tsx` / `nota-credito-pos-modal.test.tsx` con 1-2 casos nuevos cada uno (mock de `crearNotaCredito` ya existe en ambos) |
| Regression | `use-notas-credito.ts` (motor) | CERO tests nuevos/modificados — invariante #3, `use-notas-credito.test.ts` intacto |

## Slicing (presupuesto de revisión 400 líneas)

Estimado total ≈ 295-320 líneas (dentro del rango 250-350 del proposal). Dos slices posibles:

- **Slice A** (`notas-credito-ui.ts` + su test + `origen-reverso-selector.tsx` + su test): ~150-165
  líneas. Mergeable solo — la función pura y el selector quedan testeados en aislamiento antes de
  tocar ningún modal.
- **Slice B** (wiring en `crear-ncr-modal.tsx` + `nota-credito-pos-modal.tsx` + sus tests): ~140-155
  líneas. Depende del tipo `VistaReversoNc` de Slice A.

**Recomendación**: intentar **PR único** (295-320 líneas estimadas caben bajo el budget de 400)
salvo que, al implementar, el diff real se acerque a 350-380 líneas — este codebase documenta
mucho inline (ver comentarios extensos en `crear-ncr-modal.tsx`/`nota-credito-pos-modal.tsx`
actuales), lo que puede inflar el conteo más que el código puro. Si `sdd-apply` ve el diff
acumulado cruzar ~350 líneas antes de tocar el segundo modal, cortar ahí: Slice A ya es
mergeable y verificable de forma independiente (rollback trivial, sin dependencia de los modales).

## Migration / Rollout

No requiere migración. Cambio 100% de presentación — revertir el commit restaura el
comportamiento actual (botones incondicionales, sin desglose). Sin cambios de schema, sin
cambios al motor, sin feature flag necesario.

## Out of Scope (explícito)

- **Motor** (`use-notas-credito.ts::crearNotaCredito`): cero cambios, verificado correcto.
- **Advertencia soft-confirm de descuadre** (mencionada en `proposal.md` §In Scope, punto 3):
  **NO** está en los delta specs de `notas-credito-admin`/`notas-credito-pos` — la decisión del
  owner #4 ("NO reconciliation warning in this change") prevalece sobre el borrador del proposal.
  Este design NO la implementa. Si se necesita, es un change separado.
- **`AJUSTE_CXC` con remanente > 0** (split explícito): bloqueado explícitamente por ambos specs,
  posible change futuro.
- **Cuadre / SAF-in-drawer**: trabajo separado, ver exploración `sdd/nc-cuadre-sesion-fase2` /
  engram #4173 — ningún archivo de cuadre en este diff.
- **`entryPoint` / `notas_credito.sesion_caja_id`**: intactos, compatibilidad con
  `nc-cuadre-origen-pos-vs-adm` verificada por ausencia de esos archivos en File Changes.

## Open Questions

Ninguna bloqueante. Las 5 preguntas abiertas del proposal ya están resueltas por los owner
decisions inyectados en esta sesión (label exacto, no-convivencia con "Crédito a favor" cuando
remanente=0, AJUSTE_CXC fuera de alcance, sin advertencia, POS=admin idéntico).
