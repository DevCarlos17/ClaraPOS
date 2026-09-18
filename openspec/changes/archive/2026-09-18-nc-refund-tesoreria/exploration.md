# Exploration: NC "Devolver dinero" vía Tesorería (REFUND_TESORERIA)

## Hipótesis inicial (confirmada)

Slice 6 (`notas-credito`, `tasks.md` líneas 195-208) diseña `REFUND_TESORERIA`
como un egreso **single-source, single-currency, monto-completo**. El spec de
hoy pide mucho más: selección banco/caja-fuerte con saldo visible, conversión
multi-moneda a la tasa histórica de la factura, tope al monto de la NC con
remanente a SAFC, reglas de sobregiro diferenciadas, y **arquitectura
multi-fuente** (varias cuentas de tesorería, y a futuro + sesión de caja,
para un solo vuelto). Ninguna de estas 6 dimensiones estaba contemplada en
Slice 6 más allá de "existe una tabla destino con `validado=0`".

## DELTA table — spec de hoy vs Slice 6

| Requisito de hoy | Estado | Evidencia |
|---|---|---|
| Sub-opción "Sesión de caja activa" (deshabilitada) + "Tesorería" | **NEW** | No existe ningún selector de origen de tesorería en la UI. `crear-ncr-modal.tsx` L257-284 solo tiene el shell "Devolver dinero" (disabled) / "Credito a favor". Ningún sub-menú. |
| Elegir banco O caja fuerte específicos | **PARTIAL** | El catálogo existe (`useCuentasTesoreria()`), pero Slice 6/Design Decision 4-5 nunca definen cómo una cuenta de tesorería concreta llega a `crearNotaCredito`. `EgresoCajaParams` (línea 108-111 de `use-notas-credito.ts`) es `{ metodoCobroId: string; monto: number }` — **NO tiene campo de banco/caja fuerte**. Es la forma pensada para el egreso del cajón POS (`metodos_cobro`), no para tesorería. Desajuste estructural real, no solo ausencia de UI. |
| Monto ingresado en la MONEDA de la cuenta elegida | **NEW** | `EgresoCajaParams.monto: number` no lleva moneda. Ningún dato en Slice 6 distingue Bs/USD para el monto de refund. |
| Conversión a la tasa ORIGINAL de la factura/NC | **NEW** | Slice 6 nunca menciona conversión. El patrón de conversión multi-moneda SÍ existe (`use-cxc.ts` `aplicarPagoFacturaEnTx`, L605-646, `_esBancoBS`/`bsToUsd`/`usdToBs`) pero usa la tasa VIGENTE del pago (`tasaD` = `params.tasa`), no `venta.tasa`/`tasa_historica`. Usar la tasa histórica de la NC es una aplicación NUEVA de ese patrón, no una reutilización directa. |
| Mostrar "cuánto queda pendiente por devolver" tras la conversión | **NEW** | No hay cálculo de remanente-por-fuente en ningún artefacto previo. |
| Refund = TOTAL de la NC | **PARTIAL** | El "monto total ya liquidable" (`remanenteALiquidar`, `use-notas-credito.ts` L914) existe como concepto genérico de Step B, pero Slice 6 nunca lo conecta a un único egreso REFUND_TESORERIA por el monto completo. |
| Refund PARCIAL → resto pasa a SAFC | **NEW** | Step B ya tiene una rama SAFC (`SALDO_FAVOR`/`COMPENSACION_VENTA`, L916-971) pero es **una modalidad separada, mutuamente exclusiva** con `REFUND_TESORERIA` en el switch actual (`modalidad` es un solo valor). Combinar "parte en efectivo real + parte SAFC" **dentro de la misma modalidad REFUND_TESORERIA** no está diseñado — hoy son ramas `if/else if` excluyentes, no composables. |
| Prohibir refund > monto NC | **NEW** (implícito, no validado) | No hay guard explícito. El único tope hoy es el trigger Postgres `validate_nota_credito_insert` (topea `total_usd` acumulado por factura, no el monto de refund vs NC). |
| Saldo disponible visible en el selector banco/caja fuerte | **NEW** (dato existe, wiring no) | `saldo_actual` ya está expuesto crudo por `useCuentasTesoreria()`/`useCajasFuerteActivas()` — el DATO está listo, pero ninguna UI de NC lo consume aún. |
| Caja fuerte: no permitir retiro > disponible | **PARTIAL** (patrón existe, no reusable) | Guard real y probado hoy, pero **duplicado inline 3 veces** (`use-traspasos.ts` L165-167→ no bloquea ahí en realidad, ver abajo; el bloqueo real está en L867-871 `crearTraspasoTesoreriaASesion` y en `consolidarMetodoATesoreriaEnTx` L859-871). Nunca extraído a función pura. |
| Banco: SÍ puede sobregirarse, gobernado por regla de negocio | **PARTIAL, engañoso** | Hoy los bancos YA pueden quedar negativos — pero por **ausencia total de validación**, no por una regla de negocio deliberada. Grep completo de `src/features/tesoreria` no encontró un solo `if (montoNum > saldoBanco...)` guard para ningún egreso de banco. "Permitir sobregiro" hoy = "nadie lo valida", no una política. |
| Regla de sobregiro **por usuario** | **NEW — no existe en absoluto** | Grep de `sobregiro\|overdraft\|permite_sobregiro` en `src/` → 0 resultados. Sin columna en `usuarios`, `roles`, `bancos_empresa`, sin slug en `permisos`. Requiere schema/config nuevo. |
| Multi-fuente (una NC financiada por N cuentas de tesorería) | **NEW — confirmada la hipótesis** | `EgresoCajaParams` es un objeto único, no un array. Ningún precedente de "N líneas de egreso para un solo documento" existe en el código (ni traspasos, que son 1↔1). |
| Extensible a futuro: Tesorería + Sesión de caja combinados | **NEW (arquitectura)** | Ningún artefacto contempla mezclar dos "tipos de fuente" (tesorería vs sesión) en una sola operación. |

**Conclusión de la hipótesis**: confirmada. Slice 6 era single-source/single-currency/monto-completo. El spec de hoy agrega 6 dimensiones nuevas: multi-moneda-a-tasa-histórica, saldo disponible visible, sobregiro diferenciado banco/caja-fuerte, regla de sobregiro por usuario (NUEVA, sin precedente), tope al monto de NC con remanente a SAFC, y arquitectura multi-fuente. La única pieza que sobrevive intacta de Slice 6 es el **destino de la escritura** (`movimientos_bancarios`/`mov_caja_fuerte` con `validado=0`, sin schema nuevo para ESO) y el **gate anti-fraude** (`assertGateAntiFraudeNoDesembolso` ya permite `egresoParams` para `REFUND_TESORERIA`, Spec `notas-credito-liquidacion` línea 65).

## Inventario de activos reusables (archivo + línea exacta)

1. **Saldo disponible — ya calculado y expuesto, sin agregación necesaria**:
   `caja_fuerte.saldo_actual` y `bancos_empresa.saldo_actual` son columnas
   directas (no vistas/agregados) mantenidas por cada mutación de tesorería.
   Expuestas por `useCuentasTesoreria()` (`src/features/tesoreria/hooks/use-cuentas-tesoreria.ts`
   L32-98) y `useCajasFuerteActivas()` (`use-caja-fuerte.ts` L36-45). **Reusable
   tal cual para el selector banco/caja-fuerte de la NC** — no hace falta
   escribir ninguna query nueva de agregación.

2. **Guard "no retirar más del disponible" (caja fuerte)** — existe pero
   **embebido, no extraído a función pura**:
   `use-traspasos.ts` L867-871 (`crearTraspasoTesoreriaASesion`):
   ```ts
   if (montoNum > saldoCajaAnt + 0.001) {
     throw new Error(`Saldo insuficiente en Tesoreria. Disponible: ${saldoCajaAnt.toFixed(2)}, Solicitado: ${params.monto}`)
   }
   ```
   Mismo patrón repetido en `consolidarMetodoATesoreriaEnTx` (L859-871, sección
   de egreso hacia caja fuerte) y en `enviar-efectivo-a-caja-modal.tsx` L88
   (validación de UI, duplicada del check de negocio). **3 copias del mismo
   `if`** — candidato claro a extraer a una función pura
   `assertSaldoSuficienteCajaFuerte(saldoActual, monto)` (mismo patrón que
   `notas-credito-fiscal.ts` ya estableció para funciones puras extraídas).

3. **CERO guard equivalente para bancos** — confirmado por grep exhaustivo:
   ningún `if` de "saldo insuficiente" toca `bancos_empresa` en ningún flujo
   de egreso (`crearTraspaso` origen BANCO en `use-traspasos.ts` L159-187 solo
   resta, nunca valida; `aplicarPagoFacturaEnTx` en `use-cxc.ts` solo hace
   INGRESO a banco, no egreso). Confirma que "los bancos pueden sobregirarse"
   hoy es un accidente de ausencia de validación, útil como punto de partida
   pero peligroso: implementar la regla de sobregiro-por-usuario significa
   **agregar** un guard nuevo (con bypass condicional), no reusar uno
   existente.

4. **Conversión multi-moneda cuenta↔USD-a-una-tasa dada** — patrón real y
   probado, `use-cxc.ts` L605-646 (dentro de `aplicarPagoFacturaEnTx`):
   ```ts
   const _esBancoBS = _bancoMonedaCodigo === 'VES'
   const _montoNativo = _esBancoBS
     ? (moneda === 'BS' ? monto : usdToBs(montoUsd, tasaD).toNumber())
     : (moneda === 'BS' ? bsToUsd(monto, tasaD).toNumber() : montoUsd.toNumber())
   ```
   Usa `tasaD = new Decimal(params.tasa)` — la tasa **del pago actual**, leída
   como parámetro de la función, NO `venta.tasa`. Para el refund, el
   requisito es reemplazar esa fuente de tasa por `notas_credito.tasa_historica`
   (que ya es `venta.tasa` congelada al emitir la NC, confirmado en
   `use-notas-credito.ts` L620/L589 `venta.tasa` → columna `tasa_historica`).
   El patrón de conversión es 100% reusable; la FUENTE de la tasa debe
   cambiar (nunca la vigente, siempre `notas_credito.tasa_historica`).
   Helpers puros disponibles: `usdToBs`/`bsToUsd`/`toStorageString`
   (`src/lib/currency.ts`).

5. **Patrón `validado=0` / conciliación pendiente** — confirmado sin cambios
   de schema necesarios: `movimientos_bancarios` (schema.ts L907-932) y
   `mov_caja_fuerte` (L954-977) ya tienen `validado`, `validado_por`,
   `validado_at`, `reversado`, `reverso_de`, `doc_origen_id`,
   `doc_origen_tipo`, `referencia`. **Ninguno tiene columna `moneda_id`** —
   la moneda del movimiento es implícita (la de la cuenta madre,
   `bancos_empresa.moneda_id`/`caja_fuerte.moneda_id`), lo cual es coherente
   con "el usuario ingresa el monto en la moneda de la cuenta elegida".

6. **SAFC inline (remanente a saldo a favor)** — `use-notas-credito.ts`
   L916-971, rama `SALDO_FAVOR`/`COMPENSACION_VENTA` dentro de Step B. Inserta
   `movimientos_cuenta` tipo `SAFC` con `doc_origen_id=ncrId`,
   `doc_origen_tipo='NOTA_CREDITO'`. Hoy es una rama EXCLUYENTE de
   `REFUND_TESORERIA` en el switch (`if (modalidad === 'SALDO_FAVOR' ...)
   else if (modalidad === 'AJUSTE_CXC') ...`) — para el nuevo requisito
   ("refund parcial + resto a SAFC EN LA MISMA operación") este bloque debe
   volverse **invocable desde dentro** de la rama `REFUND_TESORERIA` cuando
   `montoRefundEnUsd < remanenteALiquidar`, no solo desde su propia modalidad.

7. **Permiso por rol (precedente exacto para "regla por usuario")** —
   `use-permissions.ts` L10, `PERMISSIONS.SALES_NOTA_CREDITO = 'ventas.nota_credito'`,
   con infraestructura completa `permisos`+`rol_permisos`+`tenant_permisos`
   ya en producción. El "per-user overdraft rule" que pide el usuario encaja
   EXACTAMENTE en este patrón: un slug nuevo (ej. `tesoreria.sobregiro_banco`)
   otorgable por rol, consultado vía `usePermissions()` — no hace falta
   inventar un mecanismo nuevo de permisos, solo un slug nuevo.

## Gaps que requieren trabajo NUEVO (no reuso)

- **Forma de `egresoParams`/`EgresoCajaParams`**: la interfaz actual
  (`metodoCobroId`, `monto: number`) es la forma equivocada para tesorería —
  fue diseñada para el egreso del cajón POS vía `metodos_cobro`. Necesita
  reemplazo o campo hermano con `{ tipo: 'BANCO' | 'CAJA_FUERTE', cuentaId,
  montoNativo, monedaId }` — y para multi-fuente, un **array** de esas líneas.
- **Regla de sobregiro por usuario**: no existe en absoluto. Requiere decidir
  DÓNDE vive (ver fork (d) abajo) y un guard nuevo real para bancos (hoy no
  hay ninguno que desactivar/condicionar).
- **Conversión a tasa histórica de la NC**: aplicación nueva del patrón
  existente, con la tasa correcta (`notas_credito.tasa_historica`, no la
  vigente).
- **Wiring de saldo disponible en el selector de UI**: el dato existe, el
  componente de selección banco/caja-fuerte para NC no.
- **Tope NC + remanente a SAFC dentro de la misma modalidad**: hoy
  `REFUND_TESORERIA` y `SALDO_FAVOR` son ramas excluyentes; deben poder
  componerse.
- **Arquitectura multi-fuente**: array de líneas de egreso en vez de un
  objeto único, con su propio guard de "suma de líneas === monto a cubrir",
  y una función pura de conversión aplicada línea por línea (cada cuenta
  puede tener moneda distinta).

## Design forks para `sdd-design` (NO decididos aquí)

a) **Forma de `egresoParams`**: ¿objeto único reemplazado por un array desde
   ahora (`egresoLineas: EgresoTesoreriaLinea[]`), o un objeto único hoy con
   migración futura a array cuando se agregue sesión de caja? El requisito
   explícito de "diseñar para multi-fuente sin sobre-ingeniería ahora" empuja
   hacia un array desde el día 1 (costo marginal bajo, evita una migración de
   interfaz rompiendo callers después).

b) **¿Nueva tabla puente para multi-fuente NC↔tesorería, o basta con N filas
   en `movimientos_bancarios`/`mov_caja_fuerte` que comparten `doc_origen_id
   = ncrId`?** — Dado que ambas tablas ya soportan `doc_origen_id`/
   `doc_origen_tipo`, N filas con el mismo `doc_origen_id` podrían ser
   suficiente (sin tabla puente) siempre que ninguna consulta necesite
   "cuánto se refundió de ESTA NC" con JOIN complejo — verificar si el
   reporting de conciliación necesita esa agregación antes de descartar la
   tabla puente.

c) **Reconciliación numérica exacta SAFC + refund parcial**: ¿el remanente a
   SAFC se calcula como `remanenteALiquidar - sum(egresoLineas convertidas a
   USD a tasa_historica)`? ¿Qué pasa si la suma de líneas excede el
   remanente por error de redondeo de conversión (Bs→USD con decimales)?
   Definir tolerancia (mismo patrón `'0.01'` ya usado en el archivo).

d) **Dónde vive la regla de sobregiro por usuario**: (i) permiso nuevo
   (`tesoreria.sobregiro_banco`) vía `rol_permisos` — consistente con el
   patrón ya establecido y CERO schema nuevo fuera de un `INSERT INTO
   permisos` (mismo patrón que migración 0091 hizo para
   `ventas.nota_credito`); (ii) columna en `bancos_empresa`
   (`permite_sobregiro boolean`) — regla POR CUENTA, no por usuario, más
   simple pero no es lo que pide el spec de hoy; (iii) columna en `usuarios`
   — verdaderamente per-user pero rompe el patrón de roles ya establecido.
   Recomendación implícita (no decisión): (i) es la que respeta el patrón
   existente y el texto literal "per-user" (permisos ya son per-user vía rol).

e) **Qué tasa exactamente**: confirmado sin ambigüedad —
   `notas_credito.tasa_historica` (que a su vez es `venta.tasa` congelada al
   emitir, ver `use-notas-credito.ts` L620) — nunca `tasas_cambio` vigente.
   Esto NO es un fork, es un hecho verificado; se incluye aquí solo para que
   `sdd-design` lo cite con la referencia exacta.

## Superficie de test para TDD estricto (`yarn test:run`)

- `assertGateAntiFraudeNoDesembolso`: YA cubierto (permite `egresoParams`
  para `REFUND_TESORERIA` y `EFECTIVO_REAL`) — no requiere tests nuevos salvo
  que la forma de `egresoParams` cambie (ver fork a).
- Reemplazar el test `'crearNotaCredito: REFUND_TESORERIA rechaza como "no
  implementado"'` (línea 699-707 de `use-notas-credito.test.ts`) por la
  implementación real — este test se vuelve RED intencional al arrancar la
  implementación (TDD).
- Nueva función pura candidata (mirror de `notas-credito-fiscal.ts`):
  `convertirMontoRefundATasaHistorica(montoNativo, monedaCuenta, tasaHistorica)`
  — casos: cuenta en USD (pass-through), cuenta en Bs (bsToUsd), redondeo.
- Nueva función pura: `assertSaldoSuficienteCuenta(tipo, saldoActual, monto,
  permiteSobregiro)` — casos: caja fuerte SIEMPRE bloquea si excede
  (`permiteSobregiro` ignorado); banco bloquea salvo que `permiteSobregiro
  === true`.
- Nueva función pura: `calcularRemanenteRefundTesoreria(totalNc, lineasEgreso[])`
  — casos: cubre 100%, cubre parcial (resto a SAFC), intenta cubrir >100%
  (rechazado).
- Integración `crearNotaCredito` con `modalidad: 'REFUND_TESORERIA'`: inserta
  N filas en `movimientos_bancarios`/`mov_caja_fuerte` con `validado=0` y
  `doc_origen_id=ncrId`; CERO escritura en `movimientos_metodo_cobro` de la
  sesión activa (Regla de Oro, impacto $0.00 — ya escrito como escenario en
  el spec existente, línea 83-87 de `specs/notas-credito-liquidacion/spec.md`);
  remanente no cubierto genera SAFC correctamente encadenado.
- Componente: selector banco/caja-fuerte con saldo visible, sub-opción
  "Sesión de caja activa" deshabilitada, validación de tope al monto NC.

## Preguntas abiertas para el usuario (cambian el alcance)

1. La regla de sobregiro por usuario — ¿confirmás que es vía **rol/permiso**
   (patrón existente `ventas.nota_credito`) y no una columna nueva en
   `usuarios`? Esto determina si migración 0092 toca `permisos` (barato) o
   `usuarios` (más invasivo).
2. Para "refund parcial + resto a SAFC": ¿el cajero/admin ve el remanente y
   CONFIRMA explícitamente que el resto va a SAFC, o es automático y
   silencioso? Afecta el flujo de UI y si hace falta un paso de confirmación
   extra.
3. Multi-fuente en ESTE change: ¿implementamos el array de líneas de egreso
   desde ya (aunque la UI de este change solo permita elegir UNA cuenta a la
   vez), o el array es solo un placeholder de tipo sin UI multi-select
   todavía? Esto decide si el forecast de líneas de `sdd-tasks` incluye un
   selector multi-cuenta o no.

## Inventario de archivos afectados

- `src/features/ventas/hooks/use-notas-credito.ts` — reemplazar el `throw`
  de REFUND_TESORERIA (L370-372), redefinir/extender `EgresoCajaParams`
  (L108-111), conectar Step B con el nuevo branch.
- `src/features/ventas/utils/notas-credito-fiscal.ts` (o sibling nuevo,
  mismo patrón) — nuevas funciones puras de conversión/tope/saldo.
- `src/features/ventas/components/crear-ncr-modal.tsx` — sub-opción
  "Tesorería" bajo "Devolver dinero" (L257-284 hoy shell deshabilitado).
- `src/features/ventas/components/nota-credito-pos-modal.tsx` — confirmar
  si REFUND_TESORERIA se excluye del POS-express (precedente: Slice
  5a-2a.4 ya excluye REFUND_TESORERIA de ese modal — probable que siga
  Tradicional-only).
- `src/features/tesoreria/hooks/use-cuentas-tesoreria.ts` — reusar tal cual
  para el selector (sin cambios esperados, solo consumo).
- `src/features/tesoreria/hooks/use-traspasos.ts` — candidato a extraer el
  guard de saldo-suficiente-caja-fuerte a función pura compartida (opcional,
  reduce duplicación pero no es bloqueante).
- `migrations/00XX_*.sql` — solo si el fork (d) elige columna nueva en
  `bancos_empresa`/`usuarios`, o `INSERT INTO permisos` para el slug nuevo
  (camino más barato, ya con 3 precedentes idempotentes: 0048/0047/0091).
- `openspec/changes/notas-credito/specs/notas-credito-liquidacion/spec.md` —
  la Requirement "Modalidad REFUND_TESORERIA" existente necesita deltas
  nuevos (multi-fuente, conversión, tope+SAFC, sobregiro) — este change debe
  decidir si extiende ESE spec o crea uno propio (`nc-refund-tesoreria`).
