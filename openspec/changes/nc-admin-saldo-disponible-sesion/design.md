# Design: Saldo disponible de sesión en refund a Sesión de caja activa

## Technical Approach

`refund-tesoreria-form.tsx` ya muestra saldo disponible por cuenta en la rama
Tesorería del Select 2 (`formatEnMonedaCuenta`, L303). La rama Sesión (L306-311)
lista "Efectivo USD"/"Efectivo Bs" sin saldo y sin tope. El cambio agrega
ambos, mirando el hook ya existente y reactivo `useSaldoSesionCaja(sesionCajaId)`
(`use-sesiones-caja.ts:200-304`), usado hoy en `prestamo-modal`/`avance-modal`/
`ingreso-retiro-modal`. Cero lógica nueva de cálculo de saldo (Regla de Oro del
archivo, L34-35): solo se consume el hook y se compara.

Bloqueo arquitectónico: el JSX por línea vive INLINE dentro de
`lineas.map(...)` (L232) en el componente padre. Llamar un hook ahí, con un
`sesionCajaId` que varía por iteración, viola Rules of Hooks. Se extrae esa
línea a un componente propio de nivel de módulo, `LineaEgresoRefund`, que
llama `useSaldoSesionCaja(...)` de forma incondicional (con argumento
condicional — válido). Esto también respeta `rerender-no-inline-components`
(vercel-react-best-practices): el componente se define fuera del render del
padre, no dentro.

## Architecture Decisions

### Decision: Extraer `LineaEgresoRefund` como componente hermano exportado localmente

**Choice**: Nuevo componente de módulo (no exportado fuera del archivo) justo
debajo de `RefundTesoreriaForm`, recibe `linea` + callbacks por props. El
padre sigue dueño de `lineas` (state), `agregarLinea`/`quitarLinea`/
`actualizarLinea`, `handleConfirm*`, `puedeConfirmar`. El hijo NO conoce
`onConfirm`, `montoDisponibleUsd`, `tasaHistorica` ni el resto de líneas —
extracción quirúrgica, cero repaso de lógica ajena.

**Alternatives considered**: (a) mover TODO el estado de líneas al hijo
(rechazado: `calcularRemanenteRefund`/`excedeTope`/`handleConfirm` necesitan
las N líneas juntas en el padre); (b) un hook custom
`useLineaEgresoRefund(linea)` sin componente propio (rechazado: igual haría
falta un componente wrapper para invocar el hook por iteración — no resuelve
el problema de Rules of Hooks, solo lo esconde).

**Rationale**: Minimiza el diff, preserva 100% la lógica de agregación en el
padre, resuelve el problema de hooks de la forma estándar de React (mover el
hook al componente que varía por iteración).

### Decision: Lift-state del guard vía callback + `useEffect` en el hijo

**Choice**: El hijo calcula `excedeSaldoSesion` (boolean) durante el render y
lo reporta al padre con `onExcedeSaldoSesionChange(linea.key, excede)` dentro
de un `useEffect` (dependencias: `[linea.key, excede, onExcedeSaldoSesionChange]`).
El padre guarda `excedePorLinea: Record<string, boolean>` y expone el
callback envuelto en `useCallback` con guard de no-op
(`prev[key] === excede ? prev : {...}`) para evitar loops y renders extra.

**Alternatives considered**: (a) calcular `excede` en el padre pasando
`saldoUsd/saldoBs` hacia arriba (rechazado: mismo problema, solo cambia QUÉ
dato se levanta, no evita el efecto — y separa el cálculo de dónde vive el
dato fuente, más difícil de leer); (b) llamar `onExcedeSaldoSesionChange`
directo en el cuerpo del render del hijo sin `useEffect` (rechazado: es
`setState` de OTRO componente durante el render — React lo advierte/prohíbe,
"Cannot update a component while rendering a different component").

**Rationale**: Sincronizar estado derivado ENTRE componentes (no dentro del
mismo) es el caso legítimo de `useEffect` — no es el anti-patrón
`rerender-derived-state-no-effect` (ese aplica a derivar estado PROPIO en vez
de calcularlo inline; acá el padre no puede calcularlo inline porque el dato
fuente vive en un hook que solo el hijo puede invocar por Rules of Hooks). El
guard de no-op + `useCallback([])` en el padre asegura que el efecto no
dispare loops (mismo patrón que `rerender-functional-setstate`).

### Decision: Guard de validación NO gatea por `isLoading`, salvo la comparación en sí

**Choice**: El LABEL de saldo ("Efectivo USD — $0.00 disponible" durante el
`isLoading` inicial) replica Tesorería y NO se oculta ni gatea — transitorio,
igual que L303 no gatea sobre `cuentas` cargando. La VALIDACIÓN sí gatea:
`excedeSaldoSesion` se calcula como `false` mientras `isLoading` es `true`.

**Alternatives considered**: gatear ambos igual (rechazado: crearía un falso
positivo de "excede" mientras `saldoUsd`/`saldoBs` transitan por 0 al montar
el hook, bloqueando `Confirmar` sin motivo real); no gatear ninguno
(rechazado: mismo falso positivo, ahora visible al usuario).

**Rationale**: DISPLAY es cosmético (un "$0.00" que dura un tick no rompe
nada); VALIDATE bloquea el botón — un falso positivo ahí es un bug de UX real
que el pedido original no pidió pero que se cuela si se copia el patrón de
Tesorería sin ajuste. Documentado explícitamente porque es una desviación
deliberada del mirror literal pedido.

## Data Flow

    RefundTesoreriaForm (padre)
      │ useCuentasTesoreria() ─────────────┐
      │ useSesionesActivas() ──────────────┤ (una sola vez, igual que hoy)
      │ useMetodosPagoActivos() ───────────┘
      │
      │ lineas.map(linea) ──→ <LineaEgresoRefund linea cuentas sesionesActivas
      │                          efectivoUsd efectivoBs puedeQuitar
      │                          onActualizar onQuitar
      │                          onExcedeSaldoSesionChange />
      │                                │
      │                                │ useSaldoSesionCaja(esSesion ? sesionId : undefined)
      │                                │   → { saldoUsd, saldoBs, isLoading }
      │                                │ excede = !isLoading && Decimal(monto).gt(Decimal(saldo))
      │                                │ useEffect → onExcedeSaldoSesionChange(key, excede)
      │                                ▼
      │  excedePorLinea (state) ◄──────┘
      │
      ▼
    excedeSaldoSesion = lineas.some(l => excedePorLinea[l.key])
    puedeConfirmar = ...&& !haySesionYaNoActiva && !excedeSaldoSesion

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `src/features/ventas/utils/notas-credito-refund.ts` | Modify | Agregar función pura `excedeSaldoDisponible(montoNativo, saldoDisponible): boolean` (Decimal.gt), hermana de `nativoAUsd`/`calcularRemanenteRefund` — cero I/O, cero React. |
| `src/features/ventas/utils/__tests__/notas-credito-refund.test.ts` | Modify | Tests unitarios de `excedeSaldoDisponible` (excede, igual al tope, por debajo, strings con más de 2 decimales). |
| `src/features/ventas/components/refund-tesoreria-form.tsx` | Modify | Extraer `LineaEgresoRefund`; agregar `useSaldoSesionCaja` en el hijo; labels con saldo en rama Sesión (Select 2); `excedePorLinea` + `handleExcedeSaldoSesionChange` en el padre; nuevo mensaje `text-destructive`; `puedeConfirmar` extendido. |
| `src/features/ventas/components/__tests__/refund-tesoreria-form.test.tsx` | Modify | Mock de `useSaldoSesionCaja` (agregado al mock existente de `use-sesiones-caja`); escenarios nuevos: label con saldo por moneda, y monto que excede deshabilita `Confirmar` + muestra el mensaje. |

Sin archivos nuevos: el helper puro se agrega al archivo hermano ya
existente, y el componente extraído vive en el mismo archivo (no exportado
fuera de él, sin necesidad de un archivo propio).

## Interfaces / Contracts

```ts
// notas-credito-refund.ts — nueva función pura
export function excedeSaldoDisponible(
  montoNativo: DecimalInput,
  saldoDisponible: DecimalInput
): boolean {
  return new Decimal(montoNativo).greaterThan(new Decimal(saldoDisponible))
}

// refund-tesoreria-form.tsx — nuevo componente hijo (module-scope, no exportado)
interface LineaEgresoRefundProps {
  linea: LineaFormState
  cuentas: ReturnType<typeof useCuentasTesoreria>['cuentas']
  sesionesActivas: ReturnType<typeof useSesionesActivas>['sesiones']
  efectivoUsd: ReturnType<typeof useMetodosPagoActivos>['metodos'][number] | undefined
  efectivoBs: ReturnType<typeof useMetodosPagoActivos>['metodos'][number] | undefined
  puedeQuitar: boolean
  onActualizar: (patch: Partial<LineaFormState>) => void
  onQuitar: () => void
  onExcedeSaldoSesionChange: (key: string, excede: boolean) => void
}
```

Label rama Sesión (Select 2), espejo exacto de `formatEnMonedaCuenta` (L303):

```tsx
{efectivoUsd && (
  <option value={efectivoUsd.id}>Efectivo USD — {formatUsd(saldoUsd)} disponible</option>
)}
{efectivoBs && (
  <option value={efectivoBs.id}>Efectivo Bs — {formatBs(saldoBs)} disponible</option>
)}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|---------------|----------|
| Unit | `excedeSaldoDisponible` (nueva, pura, Decimal hasta 8 decimales) | Vitest puro, sin React, en `notas-credito-refund.test.ts` — RED primero (strict TDD). |
| Component | `LineaEgresoRefund` vía `RefundTesoreriaForm` (no se testea aislado — no se exporta fuera del archivo) | RTL, `useSaldoSesionCaja` mockeado junto a `useSesionesActivas` en el mismo `vi.mock('@/features/caja/hooks/use-sesiones-caja', ...)` ya presente en el test file. |
| Integration | Selección de "Efectivo USD"/"Efectivo Bs" en una línea con Origen=Sesión muestra el saldo correcto; ingresar un monto mayor al saldo deshabilita "Confirmar" y muestra el mensaje; bajar el monto al límite lo rehabilita. | Extensión de `refund-tesoreria-form.test.tsx` (patrón `userEvent` ya usado en el archivo). |

## Migration / Rollout

No migration required. Sin cambios de schema ni de datos — solo UI y una
función pura nueva. Feature flag no aplica (cambio aislado a un formulario
admin, sin exposición pública).

## Empresa_id defense-in-depth (decisión NO tomada en este cambio)

`useSaldoSesionCaja` no filtra por `empresa_id` en sus 3 queries (L204, L210-219,
L222-237) — hoy es seguro porque `sesionCajaId` siempre llega pre-filtrado por
`empresa_id` desde `useSesionesActivas()`/el caller. **Recomendación: dejarlo
como deuda documentada, NO tocar en este cambio.** El hook es compartido por
3 componentes productivos (`prestamo-modal`, `avance-modal`,
`ingreso-retiro-modal`); agregar el filtro acá es refactor transversal fuera
del alcance quirúrgico de este PR y merece su propio change/PR con sus propios
tests de regresión para los 3 call sites existentes.

## Slicing / Size

Un solo PR. Estimado: ~90-120 líneas netas (`refund-tesoreria-form.tsx`
~70-90 líneas modificadas/movidas por la extracción + ~10 nuevas de guard/
label; `notas-credito-refund.ts` ~8 líneas; ambos test files +~40-60 líneas
de escenarios nuevos). Total bien por debajo del budget de 400 líneas — no
se recomienda chaining.

## Open Questions

- [ ] Ninguna — todas las decisiones bloqueantes quedaron resueltas arriba.
