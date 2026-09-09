# Design: Modo Exploración de Costo Continuo + "Fijar Costo"

## Technical Approach

Reemplaza el modelo "blur-and-anchor" por **exploración continua**: mientras ambos costos estén vacíos (o el costo vigente sea un *preview* del sistema), cada `onChange` de margen/PVP de cualquier nivel recalcula el costo en vivo desde ESE nivel. El usuario ajusta libremente y presiona **"Fijar costo"** para anclar y cascadear. Esto es una reescritura de `producto-precio-gating.ts` (nuevas funciones puras, Decimal, redondeo al final) y de la sección de costo/precios en `producto-form.tsx`. Precio final se mantiene en `onBlur` (ver Decisión 3).

## Architecture Decisions

### Decisión 1: Eliminar el ref "último nivel" — no hace falta

| Opción | Tradeoff | Verdict |
|---|---|---|
| Ref global `ultimoNivelEditadoRef` (lo sugerido originalmente) + `useEffect` que observa los 6 campos margen/PVP y diffea contra el ref | Es el anti-patrón `rerender-derived-state-no-effect`/`rerender-move-effect-to-event`: derivar estado (costo) de otro estado vía efecto duplica renders y complica el orden de escritura | Rechazado |
| Cada handler (`handleMargenMayorChange`, etc.) ya SABE su propio nivel — llama al recálculo inline pasando sus propios valores frescos (locales, no leídos de state) | Cero estado nuevo, cero riesgo de stale-closure (mismo motivo por el que `ejecutarBackCalcSiAplica` ya recibía `pvpOverrideUsd`) | **Elegido** |

El "nivel editado" nunca fue información que hubiera que *almacenar*: es el handler que se ejecuta. No hay ref, no hay estado para esto en el nuevo diseño.

### Decisión 2: Distinguir "preview del sistema" de "costo vacío" — reutilizar `costoBackCalculado`

El predicado de exploración no puede ser solo "ambos costos vacíos": en cuanto el primer recálculo escribe `costoUsd`, el campo deja de estar vacío y la exploración se cortaría tras el primer cálculo. Se reutiliza el booleano existente `costoBackCalculado` (semántica ampliada) como discriminador "este valor es un preview, no una decisión del usuario":

```ts
export function debeExplorarCosto(p: { costoUsd: string; costoBs: string; costoEsPreview: boolean }): boolean {
  if (p.costoEsPreview) return true
  return p.costoUsd.trim() === '' && p.costoBs.trim() === ''
}
```

Tipeo manual en Costo (USD/Bs) ya hace `setCostoBackCalculado(false)` (código existente) → sale de exploración por construcción, sin lógica extra. "Fijar costo" también hace `setCostoBackCalculado(false)` → mismo efecto (ver Decisión 4).

### Decisión 3: Precio final se mantiene en `onBlur` (scope reducido, flagueado)

El spec dice "MUST recalcular en CADA cambio... de margen, PVP o final". Los inputs de precio final son **no controlados** (`defaultValue` + `key={pf-...-${valor.toFixed(4)}}` que fuerza remount cuando el PVP fuente cambia). Si se recalculara por `onChange`, cada tecla escrita cambiaría el PVP fuente → cambiaría la `key` → remontaría el input a mitad de tipeo (el cursor/valor se resetea). Migrar a estado controlado string-crudo por campo (6 estados nuevos) es una reescritura mayor fuera de este alcance.

**Decisión**: precio final sigue en `onBlur` (ya llama al recálculo, ver Wiring). Margen y PVP (USD/Bs) de los 3 niveles sí son continuos por `onChange` — son controlados hoy, sin riesgo de remount. Se flaguea como scope reducido intencional, no un olvido.

### Decisión 4: "Fijar costo" no necesita estado propio

Visible cuando `debeExplorarCosto(...) && costoUsd.trim() !== '' && !esComboLocal`. Al click: `fijarCostoYCascada` recalcula PVP de los 3 niveles desde costo+márgenes actuales, escribe USD+Bs, y `setCostoBackCalculado(false)` → el predicado pasa a `false` (costo no vacío, no preview) → exploración termina, botón desaparece, precio final se recalcula solo (ya es derivado en cada render desde PVP+alícuota).

## Nuevas Funciones Puras (`producto-precio-gating.ts`)

```ts
export function debeExplorarCosto(p: { costoUsd: string; costoBs: string; costoEsPreview: boolean }): boolean

// costo = pvp / (1 + margen/100); null si pvp <= 0 (nada que calcular aún)
export function calcularCostoDesdeNivel(p: { pvpUsd: Decimal; margenPct: Decimal }): Decimal | null

// cascada al fijar: precio = costo * (1 + margenNivel/100), margen clamp >= 0
export function fijarCostoYCascada(p: {
  costoUsd: Decimal; margenDetalPct: Decimal; margenMayorPct: Decimal; margenEspecialPct: Decimal
}): { detalUsd: Decimal; mayorUsd: Decimal; especialUsd: Decimal }
```

`calcularCostoBsBackCalculado` se mantiene sin cambios (guard `tasa <= 0 → null`, reusado tal cual).

## Recálculo Centralizado (component-level, `producto-form.tsx`)

```ts
function recalcularCostoSiExplorando(pvpUsd: number, margenPct: number) {
  if (esComboLocal) return
  if (!debeExplorarCosto({ costoUsd, costoBs, costoEsPreview: costoBackCalculado })) return
  const costo = calcularCostoDesdeNivel({ pvpUsd: new Decimal(pvpUsd), margenPct: new Decimal(margenPct) })
  if (!costo) return
  setCostoUsd(costo.toFixed(2))
  const bs = calcularCostoBsBackCalculado(costo, new Decimal(tasaValor))
  if (bs) setCostoBs(bs.toFixed(2))
  setCostoBackCalculado(true)
}
```

**Prevención de loop**: escribe `costoUsd`/`costoBs`, nunca margen/PVP → no puede re-disparar los handlers de margen/PVP que la llamaron. `setCostoBackCalculado(true)` es idempotente (mismo valor en cada tecla mientras se explora), React no re-ejecuta efectos por esto (no hay efecto involucrado, es una llamada directa en el handler).

**Costo de render**: corre en cada tecla, pero solo mientras el modal de un producto está abierto y solo escribe 2-3 strings de estado local (`costoUsd`, `costoBs`, `costoBackCalculado`) — mismo orden de magnitud que los handlers de margen/PVP existentes, que ya re-renderizan el formulario en cada tecla hoy. Sin trabajo costoso (Decimal en un solo `dividedBy`), sin listas, sin memo necesario.

## Wiring por Nivel

| Input | Trigger | Llama con |
|---|---|---|
| Margen Detal/Mayor/Especial | `onChange` (ya existe) | `(pvpUsdActualDelNivel, margenEfectivoFresco)` |
| PVP USD Detal/Mayor/Especial | `onChange` (ya existe) | `(pvpFrescoUsd, margenActualDelNivel)` |
| PVP Bs Detal/Mayor/Especial | `onChange` (ya existe) | `(pvpFrescoDesdeUsd, margenActualDelNivel)` |
| Precio Final USD/Bs (3 niveles) | `onBlur` (ya existe) | `(baseUsdCalculada, margenActualDelNivel)` |

`onBlur={() => ejecutarBackCalcSiAplica()}` en margen/PVP Detal se **elimina** (queda redundante; el recálculo ya vive en `onChange`, igualando el patrón que mayor/especial ya usaban).

## REWORK desde la Implementación Actual

| Elemento actual | Acción |
|---|---|
| `ultimaFuenteMayorRef`, `ultimaFuenteEspecialRef`, `FuentePrecio` | **Eliminar** — sin reemplazo (Decisión 1) |
| `debeBackCalcularCosto`, `backcalcularCostoYCascada` | **Eliminar** — reemplazadas por `debeExplorarCosto` + `calcularCostoDesdeNivel` |
| `ejecutarBackCalcSiAplica` | **Eliminar** — reemplazada por `recalcularCostoSiExplorando`, llamada inline en 9 handlers de `onChange` en vez de 5 sitios de `onBlur` |
| `costoBackCalculado` | **Mantener, semántica ampliada**: ya no es solo "mostrar aviso", ahora también gatea `debeExplorarCosto` |
| `avisoMargenNegativo` | Sin cambios |
| `handleCostoUsdChange`/`handleCostoBsChange` | **Fix bidireccional**: si `val === ''`, limpiar el otro campo también (bug actual: guard `!isNaN` no cubre `''`) |
| `onBlur` en margen/PVP Detal (líneas ~1700, 1718, 1738) | **Eliminar** los `onBlur={() => ejecutarBackCalcSiAplica()}` |
| Botón "Fijar costo" | **Nuevo** — JSX condicional junto a Costos (línea ~1656, tras el grid Costo USD/Bs) |

## File Changes

| File | Action | Description |
|---|---|---|
| `producto-precio-gating.ts` | Modify | Quitar `FuentePrecio`/`debeBackCalcularCosto`/`backcalcularCostoYCascada`; agregar `debeExplorarCosto`, `calcularCostoDesdeNivel`, `fijarCostoYCascada` |
| `producto-precio-gating.test.ts` | Modify | Reescribir suites de las 3 funciones removidas; agregar casos de las 3 nuevas (canónico sin IVA, canónico con IVA, pvp<=0 → null, clamp margen negativo en cascada) |
| `producto-form.tsx` | Modify | Estado (quitar 2 refs), 1 función orquestadora nueva, 1 función de cascada al fijar, 9 sitios de wiring `onChange`, fix bidireccional Costo, botón "Fijar costo" |

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | `debeExplorarCosto` (preview/vacío/con valor), `calcularCostoDesdeNivel` (canónico, pvp=0→null, margen negativo defensivo), `fijarCostoYCascada` (cascada 3 niveles) | Vitest, puro, sin DOM |
| Component (manual) | Tipeo continuo en margen/PVP de los 3 niveles, aparición/desaparición de "Fijar costo", limpieza bidireccional, combos nunca exploran | Fuera de este scope, flag para `sdd-tasks` |

## Migration / Rollout

No requiere migración — cambio aislado a un componente y un módulo lib. Es rework sobre una rama en curso (`feat/producto-costo-backcalculo`), no sobre código en producción.

## Open Questions

- [ ] Confirmar con producto si el scope reducido de Decisión 3 (precio final en `onBlur`, no continuo) es aceptable, o si se prioriza una siguiente iteración con estado controlado por campo.
