# Design: Precio Venta Bs editable + cascada bidireccional (sandbox Tasa Paralela, modo manual)

## Technical Approach

Todo el cambio vive en `producto-form.tsx`, rama `modoRecalculo === 'manual'`. Cero formulas nuevas de negocio: se componen `calcularPrecioPreservandoMargenD`, `calcularMargenPreservandoPvp`, `usdToBs`/`bsToUsd` en 3 funciones puras nuevas (una por campo editable), y `calcularPreviewNivel` deja de CALCULAR en modo manual — solo LEE el estado ya sincronizado por los handlers. Los modos 'margen'/'mantener_pvp' no se tocan.

## Architecture Decisions

| Decision | Choice | Alternativas rechazadas | Rationale |
|---|---|---|---|
| Fuente de verdad en modo manual | Cada `onChange` escribe los 3 campos (margen, PVP$, PVP Bs) imperativamente; `calcularPreviewNivel('manual')` solo lee state/refs, no deriva nada | `useEffect` de sincronización entre los 3 campos | Mismo patrón imperativo que `handleConfirmarSandbox`/`handlePrecioVentaUsdChange`. Evita loops de efectos y el riesgo de que el render "pise" lo que el usuario acaba de tipear |
| Mascara completa en PVP $/Bs del sandbox | Dar a los 2 campos nuevos el contrato COMPLETO (`*FullRef` + `*Completo` setter + onFocus `toFullDisplay`/onBlur `toMaskedDisplay`), igual que los campos reales | Patrón simple sin ref que hoy tiene Margen manual vecino | Estos 2 campos alimentan `setPrecioVentaCompleto` (persistencia 8-decimales) vía "Confirmar". Margen NUNCA se persiste (regla #10) → no necesita ref; PVP $/Bs sí, para no repetir el bug de `sdd/producto-form-mascara-decimales` |
| Reuso de matemática | 3 funciones puras nuevas en `producto-precio-gating.ts` que COMPONEN las 3 funciones existentes + `usdToBs`/`bsToUsd` | Inline duplicado en 9 handlers (3 campos × 3 niveles) | Reduce 9 call-sites a 3 funciones testeables una sola vez; los 9 handlers quedan como wrappers finos (parse + set) |
| Bloqueo de "Confirmar" | Helper `hayMargenNegativoManual()` (lee state directo, sin memo) usado en `disabled` del botón Y como guard temprano dentro de `handleConfirmarSandbox` | Clamp del margen a 0 (como hace `handleMargenChange` del form real) | Clampear ocultaría el margen negativo real; el objetivo es AVISAR y BLOQUEAR, no corregir en silencio |
| Columna Bs en la tabla | `<th>`/`<td>` condicionados a `modoRecalculo === 'manual'` | Columna siempre visible en los 3 modos | Proposal acota el alcance a modo manual; cero diff en JSX de 'margen'/'mantener_pvp' |

## Data Flow (modo manual)

```
onChange Margen%  ──┐
onChange PVP $     ──┼──► cascadaDesde{Margen,PvpUsd,PvpBs}Manual(costoContable, valor, tasaInterna)
onChange PVP Bs    ──┘         │
                                ▼
                    { margenPct, pvpUsd, pvpBs }  (Decimal)
                                │
                    ┌───────────┼────────────┐
                    ▼           ▼             ▼
            setSbManualMargen  setSbManualPvpUsdCompleto  setSbManualPvpBsCompleto
            (string, sin ref)  (ref full + display 2dec)  (ref full + display 2dec)

calcularPreviewNivel('manual')  →  LEE los 3 states/refs de arriba, no recalcula nada
handleConfirmarSandbox          →  usa calcularPreviewNivel (sin cambios de firma)
```

## State / Refs nuevos (por nivel: Detal/Mayor/Especial = ×3)

```ts
// Display (igual patrón que sbManualMargenDetal existente)
const [sbManualPvpUsdDetal, setSbManualPvpUsdDetal] = useState('')
const [sbManualPvpBsDetal, setSbManualPvpBsDetal] = useState('')
// Precisión completa (mismo patrón que precioVentaUsdFullRef)
const sbManualPvpUsdDetalFullRef = useRef(0)
const sbManualPvpBsDetalFullRef = useRef(0)
```
×3 niveles = 6 `useState` + 6 `useRef` nuevos. **Margen manual NO recibe ref** (nunca se persiste, regla #10; su string ya es "crudo" sin ciclo mask/reveal).

Setters `*Completo` nuevos (6, mismo molde que `setPrecioVentaCompleto`):
```ts
function setSbManualPvpUsdDetalCompleto(fullValue: number, displayVal: string) {
  sbManualPvpUsdDetalFullRef.current = fullValue
  setSbManualPvpUsdDetal(displayVal)
}
```

## Funciones puras nuevas — `producto-precio-gating.ts`

```ts
export interface CascadaManualResultado { margenPct: Decimal; pvpUsd: Decimal; pvpBs: Decimal }

export function cascadaDesdeMargenManual(costo: Decimal, margenPct: Decimal, tasaInterna: Decimal): CascadaManualResultado {
  const pvpUsd = calcularPrecioPreservandoMargenD(costo, margenPct)
  return { margenPct, pvpUsd, pvpBs: usdToBs(pvpUsd, tasaInterna) }
}
export function cascadaDesdePvpUsdManual(costo: Decimal, pvpUsd: Decimal, tasaInterna: Decimal): CascadaManualResultado {
  return { margenPct: calcularMargenPreservandoPvp(costo, pvpUsd), pvpUsd, pvpBs: usdToBs(pvpUsd, tasaInterna) }
}
export function cascadaDesdePvpBsManual(costo: Decimal, pvpBs: Decimal, tasaInterna: Decimal): CascadaManualResultado {
  const pvpUsd = bsToUsd(pvpBs, tasaInterna)
  return { margenPct: calcularMargenPreservandoPvp(costo, pvpUsd), pvpUsd, pvpBs }
}
```
Import nuevo en `producto-precio-gating.ts`: `usdToBs`/`bsToUsd` desde `src/lib/currency.ts` (no existía antes en ese archivo).

## Handlers — `producto-form.tsx` (9 nuevos: 3 campos × 3 niveles; patrón Detal mostrado)

```ts
function handleSbManualMargenDetalChange(val: string) {
  setSbManualMargenDetal(val) // crudo, sin mascara (igual que hoy)
  const costo = calcularCostoContablePreview()
  const margenN = parseFloat(val)
  if (!costo || isNaN(margenN) || tasaValor <= 0) return
  const { pvpUsd, pvpBs } = cascadaDesdeMargenManual(costo, new Decimal(margenN), new Decimal(tasaValor))
  setSbManualPvpUsdDetalCompleto(pvpUsd.toNumber(), toMaskedDisplay(pvpUsd.toNumber()))
  setSbManualPvpBsDetalCompleto(pvpBs.toNumber(), toMaskedDisplay(pvpBs.toNumber()))
}

function handleSbManualPvpUsdDetalChange(val: string) {
  const num = parseFloat(val)
  setSbManualPvpUsdDetalCompleto(isNaN(num) ? 0 : num, val) // val crudo, NUNCA el display mascarado
  const costo = calcularCostoContablePreview()
  if (!costo || isNaN(num) || tasaValor <= 0) return
  const { margenPct, pvpBs } = cascadaDesdePvpUsdManual(costo, new Decimal(num), new Decimal(tasaValor))
  setSbManualMargenDetal(margenPct.toFixed(2))
  setSbManualPvpBsDetalCompleto(pvpBs.toNumber(), toMaskedDisplay(pvpBs.toNumber()))
}

function handleSbManualPvpBsDetalChange(val: string) {
  const num = parseFloat(val)
  setSbManualPvpBsDetalCompleto(isNaN(num) ? 0 : num, val)
  const costo = calcularCostoContablePreview()
  if (!costo || isNaN(num) || tasaValor <= 0) return
  const { margenPct, pvpUsd } = cascadaDesdePvpBsManual(costo, new Decimal(num), new Decimal(tasaValor))
  setSbManualMargenDetal(margenPct.toFixed(2))
  setSbManualPvpUsdDetalCompleto(pvpUsd.toNumber(), toMaskedDisplay(pvpUsd.toNumber()))
}
```
`onFocus`/`onBlur` de PVP $/Bs replican el patrón exacto de los campos reales (L2869-2902): `onFocus={() => x.current > 0 && setX(toFullDisplay(xFullRef.current))}`, `onBlur={() => setX(val.trim() === '' ? '' : toMaskedDisplay(xFullRef.current))}`. Margen manual mantiene su `onChange` sin focus/blur (sin cambios de UX en ese input, solo cambia a qué función apunta el `onChange`).

## Branch isolation — `calcularPreviewNivel` (L1143-1170)

```ts
if (modoRecalculo === 'manual') {
  const margenStr = nivel === 'detal' ? sbManualMargenDetal : nivel === 'mayor' ? sbManualMargenMayor : sbManualMargenEspecial
  const pvpFull = nivel === 'detal' ? sbManualPvpUsdDetalFullRef.current : nivel === 'mayor' ? sbManualPvpUsdMayorFullRef.current : sbManualPvpUsdEspecialFullRef.current
  return { margenPct: parseFloat(margenStr) || 0, pvpUsd: pvpFull }
}
```
Ya NO llama `calcularPrecioPreservandoMargenD` en esta rama: los 3 campos ya quedaron sincronizados por el handler que se usó para editar (cualquiera de los 3), así que leer es suficiente y nunca "pisa" al que el usuario editó último. Ramas `'mantener_pvp'`/`'margen'` (L1152-1169) quedan byte-idénticas.

`handleSetModoRecalculo('manual')` (L1230-1239) extiende el pre-fill: además de los 3 margenes, llama `setSbManualPvpUsdXCompleto(precioVentaUsdFullRef.current, ...)` y, si `tasaValor > 0`, `setSbManualPvpBsXCompleto(usdToBs(...).toNumber(), ...)` por nivel — mismo criterio "arranca desde el valor real vigente" que ya aplica a margen.

## Bloqueo de margen negativo

```ts
function hayMargenNegativoManual(): boolean {
  if (modoRecalculo !== 'manual') return false
  return [sbManualMargenDetal, nivel2 ? sbManualMargenMayor : null, nivel3 ? sbManualMargenEspecial : null]
    .some((m) => m !== null && parseFloat(m) < 0)
}
```
Usado en `disabled={hayMargenNegativoManual()}` del botón "Confirmar cambios" (estilo gris + `cursor-not-allowed`) y como guard temprano (`if (hayMargenNegativoManual()) return`) al inicio de `handleConfirmarSandbox` (defensa en profundidad si algo llama la función sin pasar por el botón). Mensaje por fila (junto al input de Margen, mismo estilo que `avisoMargenNegativo` existente): **"Margen negativo en este nivel."** Mensaje junto al botón cuando está bloqueado: **"No se puede confirmar: hay niveles con margen negativo."**

## Guards / Decimal

- `calcularCostoContablePreview()` ya garantiza `costoFactura>0 && tasaParalela>0 && tasaValor>0` antes de que la tabla exista → dentro de los handlers, `costo` nunca es `null` cuando `tasaValor>0` también se valida explícitamente (doble guard, barato).
- `calcularMargenPreservandoPvp`/`bsToUsd` tienen guard interno propio (costo/pvp ≤0 → 0; tasa≤0 → 0 sin dividir) — defensa adicional, no se depende solo de ellos.
- Redondeo SOLO en el argumento `displayVal` de cada `*Completo` (`toMaskedDisplay`, 2 decimales) o en `margenPct.toFixed(2)`; el ref/`.toNumber()` guarda la cadena Decimal sin truncar.
- Ningún handler nuevo lee `parseFloat` sobre un string ya enmascarado — siempre `val` crudo del evento o `xFullRef.current`.

## File Changes

| File | Action | Description |
|---|---|---|
| `producto-precio-gating.ts` | Modify | +3 funciones puras (`cascadaDesde{Margen,PvpUsd,PvpBs}Manual`) + import `usdToBs`/`bsToUsd` |
| `producto-precio-gating.test.ts` | Modify | +tests para las 3 cascadas nuevas y para `calcularMargenPreservandoPvp` (sin cobertura hoy) |
| `producto-form.tsx` | Modify | L482-526: +6 useState +6 useRef. L1143-1170: bifurca rama 'manual'. L1230-1239: extiende pre-fill. L2657-2730: columna Bs condicional + inputs PVP$/Bs + mensajes de margen negativo + `disabled` en "Confirmar" |

## Testing Strategy

| Capa | Qué testear | Cómo |
|---|---|---|
| Unit (`producto-precio-gating.test.ts`, vitest) | `calcularMargenPreservandoPvp`: costo/pvp ≤0 →0; caso normal | Valores Decimal fijos, `yarn test:run` |
| Unit | `cascadaDesdeMargenManual`: margen normal, margen muy negativo (clamp PVP a 0 vía `calcularPrecioPreservandoMargenD`), margen=0 | Igual |
| Unit | `cascadaDesdePvpUsdManual`: pvp>costo (margen+), pvp<costo (margen−), pvp=0 | Igual |
| Unit | `cascadaDesdePvpBsManual`: tasa normal; round-trip USD→Bs→USD≈original (tolerancia Decimal) | Igual |
| Integración (manual, sin runner E2E hoy) | Modos 'margen'/'mantener_pvp' sin regresión tras el cambio | Smoke test manual en sandbox antes de PR (no hay cobertura automatizada del form) |

Tests se escriben ANTES del JSX (mandato del usuario + proposal), ya que las 3 funciones son 100% independientes del componente.

## Migration / Rollout

No migration required. Cambio aislado a `modoRecalculo === 'manual'`; revertir el commit restaura el comportamiento anterior (sin schema/persistencia nuevos).

## Open Questions

Ninguna — las 2 decisiones abiertas de `sdd-explore` (contrato de máscara en PVP$/Bs, aviso de margen negativo) quedaron resueltas arriba.
