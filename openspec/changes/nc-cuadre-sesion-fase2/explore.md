# NC en Cuadre — Fase 2: Exploración (egreso real de NC admin a sesión activa)

> Exploración READ-ONLY, sin tocar código de app. Continúa `openspec/changes/nc-cuadre-sesion/`
> (Fase 1, ya mergeada a `develop`) sobre la rama `feat/nc-cuadre-sesion-fase2` (= `develop` + Fase 1).
> Objetivo de Fase 2: que una NC ADMINISTRATIVA/TRADICIONAL que devuelve efectivo escriba un
> egreso real contra una sesión de caja ACTIVA, para que fluya al cuadre igual que una NC POS hoy.

---

## 0. Resumen ejecutivo (leer primero)

1. **El guard "Regla de Oro" que hoy bloquea el egreso para NC admin es una condición de 4
   términos en `crearNotaCredito`** (`use-notas-credito.ts` L641-645), no solo `entryPoint==='POS'`.
   Ver §1.

2. **Hallazgo nuevo, no anticipado en el contexto de la tarea — CAMBIA la dirección de diseño
   recomendada**: el módulo admin/TRADICIONAL (`crear-ncr-modal.tsx`) **ya tiene un seam de UI
   construido y deshabilitado** para exactamente este feature. `RefundTesoreriaForm`
   (`refund-tesoreria-form.tsx` L214-220) lista cada sesión de caja ACTIVA de la empresa
   (`useSesionesActivas()`) como una opción de "Origen" del reembolso, junto a "Tesorería" —
   pero la opción está `disabled` con la etiqueta literal `"(Proximamente)"`. Esto fue dejado
   deliberadamente por el change `nc-refund-tesoreria` (archivado, `proposal.md` línea 20:
   *"Sub-opción 'Sesión de caja activa' (permanece deshabilitada; la forma de datos debe
   permitir agregarla después)"*). **Fase 2 es, con alta probabilidad, la implementación de ESE
   seam ya diseñado** — no una extensión de la Regla de Oro POS. Ver §6.

3. **Las 3 estrategias de cálculo de efectivo divergen exactamente como anticipaba el contexto**:
   `useSaldoEfectivoBimonetario` (lista negra, incluye NCR) vs `cerrarSesionCaja` (lista blanca,
   excluye NCR) vs `useSaldoSesionCaja` (lista blanca propia, excluye NCR) — las tres
   MATEMÁTICAMENTE convergen hoy solo porque, en el único caso que ya escribe egresos NCR
   (POS+EFECTIVO_REAL+misma-sesión), el pago reversado y el egreso compensatorio viven en la
   misma sesión y se cancelan sin necesitar que ninguna lista los trate igual. Ver §2.

4. **El write path real (INSERT en `movimientos_metodo_cobro`, origen `'NCR'`) ya existe y es
   reusable tal cual** (`use-notas-credito.ts` L1091-1109) — el mecanismo de unificación no
   requiere tocar el INSERT en sí, sino decidir CUÁNDO se ejecuta (guard) y CON QUÉ
   `sesion_caja_id` (hoy siempre `sesionCajaActivaId` del cajero POS; para admin sería la sesión
   que el usuario elija de `useSesionesActivas()`). Ver §4.

5. **Riesgo estructural nuevo detectado**: el mecanismo actual de Regla de Oro (mirror 1:1 de
   cada `pago.metodo_cobro_id` de la venta) es rígido — no admite monto parcial por línea. El
   mecanismo ya construido para `REFUND_TESORERIA` (`egresoParams: EgresoTesoreriaLinea[]`,
   monto libre por línea + remanente a SAFC) es flexible y es el que ya alimenta la UI
   deshabilitada de "Sesión de caja activa". Son dos arquitecturas distintas — la Fase 2 debe
   decidir explícitamente cuál extender, no asumir que es la misma. Ver §6, Opciones A/B.

---

## 1. El guard "Regla de Oro" — ubicación exacta y condición completa

`src/features/ventas/hooks/use-notas-credito.ts`, función `crearNotaCredito`:

```ts
// L641-645
const aplicaReglaDeOro =
  entryPoint === 'POS' &&
  modalidad === 'EFECTIVO_REAL' &&
  !!sesionCajaActivaId &&
  venta.sesion_caja_id === sesionCajaActivaId
```

Los 4 términos, todos exigidos con AND:

1. `entryPoint === 'POS'` — el tipo `EntryPoint` (L187) solo admite `'POS' | 'TRADICIONAL'`. Todo
   llamado desde `crear-ncr-modal.tsx` (módulo admin) pasa `entryPoint: 'TRADICIONAL'` (L188, L215)
   — categóricamente excluido, sin importar el resto de las condiciones.
2. `modalidad === 'EFECTIVO_REAL'` — de las 5 modalidades (`LiquidacionModalidad`, L91-96), solo
   esta dispara el egreso. El módulo admin hoy NUNCA envía `EFECTIVO_REAL` — solo
   `SALDO_FAVOR`/`AJUSTE_CXC` (vía `emitirNc`, L225) o `REFUND_TESORERIA` (vía `emitirNcRefund`,
   L189). No hay ningún selector de UI admin que produzca `EFECTIVO_REAL` hoy.
3. `!!sesionCajaActivaId` — debe existir una sesión activa conocida por el llamador.
4. `venta.sesion_caja_id === sesionCajaActivaId` — la venta debe pertenecer a la MISMA sesión que
   está activa ahora mismo (garantiza que el pago reversado y el egreso compensatorio conviven en
   la misma sesión — condición necesaria para que el neteo de §2 cierre matemáticamente).

**Qué cambiaría para admin+sesión activa**: el término 1 necesitaría dejar de excluir
`'TRADICIONAL'` categóricamente, y el término 4 necesitaría redefinirse — para admin no hay
garantía de que `venta.sesion_caja_id` (potencialmente `NULL` si la venta es histórica, o de OTRA
sesión ya cerrada) coincida con la sesión activa elegida. Ver §5 para el análisis de esta
divergencia (cross-session).

El INSERT del egreso en sí (guardado por `aplicaReglaDeOro`) — L1083-1111:

```ts
if (aplicaReglaDeOro && pagosResult.rows) {
  for (let i = 0; i < pagosResult.rows.length; i++) {
    const pago = pagosResult.rows.item(i) as { id: string; metodo_cobro_id: string; monto: string }
    await tx.execute(
      `INSERT INTO movimientos_metodo_cobro
         (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
          doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
       VALUES (?, ?, ?, 'EGRESO', 'NCR', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), empresa_id, pago.metodo_cobro_id, pago.monto, ncrId, `NCR-${nroNcr}`,
       `Devolucion NCR ${nroNcr} - Venta ${venta.nro_factura}`, sesionCajaActivaId ?? null,
       now, now, usuario_id]
    )
  }
}
```

Un registro por cada `pago` no-reversado de la venta (L1078-1081, `SELECT ... WHERE venta_id = ?
AND is_reversed = 0`), con `monto` = monto nativo exacto del pago original (mirror 1:1, sin
posibilidad de monto parcial). Este mismo bloque corre HOY solo para POS — para Fase 2 es el
candidato natural a generalizar (Opción A, §6) o a dejar intacto mientras se construye un
mecanismo paralelo (Opción B, §6).

La reversa de pagos (`UPDATE pagos SET is_reversed = 1 ...`, L1116-1120) corre **siempre** para
`tipoNc === 'TOTAL'`, sin depender de `aplicaReglaDeOro` — esto YA ocurre hoy para NC admin. El
gap de Fase 2 es exclusivamente que no se compensa con el egreso.

---

## 2. Las 3 estrategias de cálculo de efectivo — confirmadas en código actual

### 2.1 `useSaldoEfectivoBimonetario` — lista negra, INCLUYE NCR (implícitamente)

`src/features/reportes/hooks/use-cuadre.ts` L859-958. Sub-queries relevantes de egresos/ingresos
manuales (L906-919, USD; L924-937, VES):

```sql
-- L916 (USD) / L934 (VES)
AND mmc.origen NOT IN ('VENTA', 'COBRO', 'PROPINA')
```

`'NCR'` no está en la lista negra → cualquier fila `origen='NCR'` (`tipo='EGRESO'`) SÍ se resta
en `saldoEsperadoUsd`/`saldoEsperadoBs` (fórmula L943-955). Además, la query de pagos
(L876-902) **no filtra `is_reversed`** — el pago original reversado sigue sumando íntegro. El
neteo depende 100% de que el egreso NCR exista para cancelarlo.

**Alimenta**: `cuadre-saldo-caja.tsx` L26 ("Saldo de caja"), `cuadre-conteo-fisico.tsx` L42
("Sistema" del método EFECTIVO — el número que efectivamente viaja a `cerrarSesionCaja()` como
`monto_sistema_usd` override).

### 2.2 `cerrarSesionCaja` — lista blanca, EXCLUYE NCR

`src/features/caja/hooks/use-sesiones-caja.ts`, función `cerrarSesionCaja` (L665-...). Dos puntos:

- **Total agregado** (`montoSistemaUsdFromDB`, L802-809): pagos con `COALESCE(p.is_reversed,0)=0`
  (L719, L735 — SÍ filtra reversados) + movimientos manuales con lista blanca explícita
  (L749-750, L777-778):
  ```sql
  AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO', 'VUELTO',
                      'INGRESO_TESORERIA', 'EGRESO_TESORERIA')
  ```
  `'NCR'` no está en esta lista → el egreso NCR se ignora aquí. Pero como el pago original YA se
  excluyó (`is_reversed=1`), el resultado neto es correcto para el caso feliz — por EXCLUSIÓN
  mutua, no por compensación.
- **Desglose por método** (`sesiones_caja_detalle`, `movsManualPorMetodoResult` L849-857): MISMA
  lista blanca (L855-856), mismo criterio de exclusión mutua.

**Nota crítica para Fase 2**: `montoSistemaUsdParam` (L807-809) — si el caller (UI del cuadre)
pasa un override, ese valor gana sobre el recálculo interno para el TOTAL agregado, pero el
desglose por método (`sesiones_caja_detalle`) SIEMPRE recalcula desde su propia query con su
propia lista blanca, ignorando el override. Si Fase 2 solo actualiza la lista negra de §2.1 sin
tocar esta lista blanca, el total en pantalla (vía override) puede diferir del desglose grabado
en `sesiones_caja_detalle` — mismo riesgo ya documentado en Fase 1 (Map A §4.4), ahora aplicable
también al nuevo egreso admin.

### 2.3 `useSaldoSesionCaja` — lista blanca propia, EXCLUYE NCR

`use-sesiones-caja.ts` L200-296. Pagos: `p.is_reversed = 0` (L216, filtra). Movimientos
manuales: lista blanca (L232-233):
```sql
AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO',
                    'INGRESO_TESORERIA', 'EGRESO_TESORERIA')
```
Nota: esta lista NO incluye `'VUELTO'` (a diferencia de las otras dos) — es una TERCERA variante,
no un duplicado exacto de ninguna de las anteriores. `'NCR'` tampoco está. Mismo patrón de
exclusión mutua que §2.2: el pago reversado desaparece (nunca contó), consistente en sí mismo.

**Alimenta**: el saldo "en vivo" que ve el cajero durante la sesión (no es parte del cuadre de
cierre, es un widget operacional aparte — confirmar consumidor exacto en fase de diseño si es
relevante para el alcance).

### 2.4 Por qué divergen y qué exige una regla unificada

Las tres arrancaron de necesidades distintas (cálculo "vivo" pre-cierre con compensación aditiva
vs. recálculo de cierre con exclusión mutua vs. saldo operacional del cajero) y **ninguna fue
diseñada pensando en un segundo origen de egreso NCR fuera de POS**. Si Fase 2 agrega un nuevo
egreso (mismo `origen='NCR'` o uno nuevo, ver §6) que puede aplicar a una sesión que NO es la del
cajero que ve `useSaldoSesionCaja`, o a una venta cuyo pago original NO vive en la misma sesión
elegida para el egreso, las tres estrategias pueden divergir en ese caso (a diferencia de hoy,
donde el caso feliz garantiza equivalencia). Cualquier diseño de unificación debe decidir
EXPLÍCITAMENTE:
- Si el nuevo egreso usa `origen='NCR'` (reusa las listas existentes, que YA tratan NCR de forma
  distinta en cada hook) o un origen nuevo (requiere tocar las 3 listas a la vez para mantener
  paridad).
- Si `useSaldoSesionCaja` necesita conocer NCR en absoluto, dado que hoy excluye por diseño
  (exclusión mutua vía `is_reversed`) — puede que NO necesite cambios si el pago reversado y el
  egreso viven ambos fuera de su query de "esta sesión de este cajero" (pregunta abierta si el
  admin puede targetear la sesión de OTRO cajero, ver §5).

---

## 3. Resolución de la sesión activa en el flujo de creación de NC

Dos hooks distintos, con alcance MUY diferente — esto es clave para el diseño de Fase 2:

1. **`useSesionActiva()`** (`use-sesiones-caja.ts` L173-191) — sesión ABIERTA del USUARIO ACTUAL
   únicamente:
   ```sql
   SELECT * FROM sesiones_caja
   WHERE empresa_id = ? AND status = 'ABIERTA' AND usuario_apertura_id = ?
   ORDER BY fecha_apertura DESC LIMIT 1
   ```
   Es el hook que usa el flujo POS (`nota-credito-pos-modal.tsx`, no leído línea a línea en esta
   pasada pero es el análogo directo al `sesionCajaActivaId` que recibe `crearNotaCredito`).

2. **`useSesionesActivas()`** (`use-sesiones-caja.ts` L83-107) — TODAS las sesiones ABIERTAS de
   la EMPRESA (sin filtrar por usuario), enriquecidas con `caja_nombre`:
   ```sql
   SELECT * FROM sesiones_caja WHERE empresa_id = ? AND status = 'ABIERTA' ORDER BY fecha_apertura ASC
   ```
   Es el hook YA CONSUMIDO por `refund-tesoreria-form.tsx` L107 para poblar el select
   `disabled` de "Sesión de caja activa" (L215-219, ver §6). Esto implica que el diseño de
   Fase 2 para el flujo admin probablemente necesita elegir ENTRE VARIAS sesiones activas
   (multi-caja), no una sola implícita — a diferencia de POS donde la sesión ya está resuelta
   por el usuario logueado.

**Para Fase 2, el admin (usuario nivel 1/2) NO tiene una "sesión activa propia"** en el sentido
de `useSesionActiva()` — su rol no necesariamente tiene una caja abierta a su nombre. El patrón
correcto a extender es `useSesionesActivas()` (selector explícito, ya wireado en la UI) —
`useSesionActiva()` no aplica a este flujo.

---

## 4. Write path — template exacto a seguir (POS-NC) y el mecanismo paralelo ya construido (REFUND_TESORERIA)

### 4.1 Template rígido — Regla de Oro (POS+EFECTIVO_REAL)

Ya citado completo en §1 — columnas: `id, empresa_id, metodo_cobro_id, tipo='EGRESO',
origen='NCR', monto, saldo_anterior=0, saldo_nuevo=0, doc_origen_id=ncrId,
doc_origen_ref='NCR-{nroNcr}', concepto, sesion_caja_id, fecha, created_at, created_by`. Un
INSERT por cada `pago` original de la venta (mirror 1:1, monto = `pago.monto` nativo exacto —
sin conversión, sin posibilidad de monto parcial ni de elegir un método distinto al original).

### 4.2 Template flexible — `REFUND_TESORERIA` (ya implementado, admin, hacia Tesorería)

`escribirEgresoTesoreriaEnTx` (L288-..., invocado en el branch `modalidad === 'REFUND_TESORERIA'`
L1230-1272) — recibe un ARRAY `EgresoTesoreriaLinea[]` (`{ destino: 'BANCO'|'CAJA_FUERTE',
cuentaId, montoEnMonedaCuenta, referencia? }`) construido LIBREMENTE por el usuario en
`RefundTesoreriaForm` (monto arbitrario por línea, no ligado a los pagos originales). Escribe en
`movimientos_bancarios`/`mov_caja_fuerte` (no en `movimientos_metodo_cobro`), con
`origen='REEMBOLSO_NCR'`, `doc_origen_id=ncrId`. El remanente no cubierto por las líneas cae a
SAFC (`calcularRemanenteRefund`, `notas-credito-refund.ts` L48-59) — con guard de tope
(`excedeTope`) evaluado ANTES de escribir nada.

**Diferencia arquitectónica clave**: este mecanismo NO exige que el monto coincida con los pagos
originales de la venta — el usuario elige cuánto reembolsar y por dónde, hasta el tope del saldo
disponible de la NC. Es el mecanismo que la UI YA expone para "Devolver dinero" en el módulo
admin, y es el que tiene el seam deshabilitado para "Sesión de caja activa" (§6).

---

## 5. Riesgos y preguntas abiertas confirmadas en código

1. **Tasa (bimonetario)**: confirmado en el motor — el egreso `REFUND_TESORERIA` usa
   `venta.tasa` (tasa histórica de la venta, L1258) vía `nativoAUsd`, NUNCA la tasa vigente del
   sistema. El egreso Regla de Oro usa `pago.monto` nativo sin reconversión (no necesita tasa
   porque no cruza moneda). Cualquier nuevo mecanismo de Fase 2 DEBE seguir el mismo patrón —
   `notas_credito.tasa_historica`/`venta.tasa`, nunca `tasaPromedio`/`tasaDelDia` del cuadre
   (trampa ya documentada en Map A §7 de Fase 1).

2. **Atomicidad**: todo el flujo ya vive dentro de un único `db.writeTransaction` (L593) —
   cualquier egreso nuevo debe insertarse DENTRO de esa misma transacción (no abrir una segunda).
   Ya es el patrón de ambos mecanismos existentes.

3. **Multi-tenant `empresa_id`**: `movimientos_metodo_cobro` ya recibe `empresa_id` explícito en
   el INSERT (L1098) — cualquier extensión debe mantenerlo. `useSesionesActivas()` ya filtra por
   `empresa_id` del usuario actual (L88) — el selector de sesión destino queda automáticamente
   acotado a la empresa correcta.

4. **Cross-session — ¿puede el admin targetear una factura de una sesión DISTINTA a la elegida
   para el egreso?** CONFIRMADO como pregunta abierta, no resuelta en código: `crear-ncr-modal.tsx`
   recibe la factura por prop desde `facturas-empresa-tab.tsx` (listado de TODAS las facturas de
   la empresa, sin filtro de sesión) — la venta puede pertenecer a CUALQUIER sesión (activa,
   cerrada, o inexistente si es histórica pre-sesiones). El seam de UI en
   `refund-tesoreria-form.tsx` lista las sesiones ACTIVAS de la empresa como "Origen" — sin
   ninguna relación visible con `venta.sesion_caja_id`. Esto sugiere que el diseño pretendido
   es: el admin elige LIBREMENTE cualquier sesión activa como destino del egreso, sin que
   necesariamente coincida con la sesión original de la venta — un modelo MÁS PERMISIVO que la
   Regla de Oro POS (que exige `venta.sesion_caja_id === sesionCajaActivaId`). Si esto es
   correcto, es una decisión de diseño explícita a validar con el usuario/product owner antes de
   construir — no se puede inferir con certeza solo del código. Si se decide que Fase 2 debe
   restringirse a "solo si la venta pertenece a la sesión elegida", eso reduce drásticamente el
   caso de uso real (la mayoría de NC admin son sobre facturas de sesiones ya cerradas).

5. **Divergencia PowerSync (SQLite local) vs Supabase (Postgres)**: el trigger
   `fn_validate_sesion_abierta` (migración 0041, `migrations/0041_cash_ledger_bimonetario.sql`
   L75-102) que RECHAZA cualquier INSERT en `movimientos_metodo_cobro` contra una sesión que no
   esté `'ABIERTA'`, y el CHECK constraint de `origen` (incluye `'NCR'` desde migración 0091,
   confirmado en `0091_notas_credito_schema.sql` L78-83) **solo existen en Postgres**. El schema
   de PowerSync (`src/core/db/powersync/schema.ts` L883-905, tabla `movimientos_metodo_cobro`)
   declara las columnas como `column.text` sin ningún CHECK ni trigger equivalente en SQLite
   local. Esto significa: **un bug en el guard de Fase 2 que permita escribir un egreso contra
   una sesión ya cerrada (o con un `sesion_caja_id` inválido) NO fallará en el momento de
   escritura local** — el INSERT SQLite tendrá éxito, la UI mostrará éxito al usuario, y el
   rechazo solo ocurrirá async cuando PowerSync intente subir el cambio a Supabase (fallo de
   sync silencioso desde la perspectiva del usuario, visible solo en el estado de
   sincronización). Cualquier guard de "sesión debe seguir ABIERTA" que Fase 2 agregue en el
   cliente debe ser tan estricto como el trigger Postgres, y el diseño debe considerar cómo
   comunicar un fallo de sync tardío si igual ocurre.

6. **Snapshot congelado de `sesiones_caja_detalle`**: ya documentado en Fase 1 (Map A §4.4/§6.3)
   — si el admin emite la NC DESPUÉS de que la sesión ya se cerró (aunque el egreso hoy se
   bloquea antes de eso por el trigger del punto 5), el desglose por método de esa sesión queda
   congelado sin reflejar el egreso. Refuerza que el guard "sesión debe estar ABIERTA" no es solo
   una restricción técnica sino la única forma de que el egreso llegue al cuadre en absoluto.

---

## 6. Comparación de enfoques (alto nivel — el diseño detallado es fase aparte)

### Opción A — Extender la Regla de Oro existente a `entryPoint === 'TRADICIONAL'`

Relajar el guard de §1 para que, cuando el admin elige explícitamente una sesión activa Y la
venta pertenece a esa sesión (o se decide permitir cualquier sesión, ver riesgo 4), se ejecute el
MISMO bloque de INSERT (§4.1) que ya usa POS — mirror 1:1 de cada `pago.metodo_cobro_id`.

- **Pros**: reusa código ya probado y ya cubierto por tests (`use-notas-credito.test.ts`
  L548-645). Cambio de guard, no de mecanismo — superficie de cambio pequeña en el motor.
- **Contras**: NO tiene UI construida para este camino — `crear-ncr-modal.tsx` no tiene ningún
  selector "EFECTIVO_REAL" ni "sesión de caja" hoy (solo "Devolver dinero"→Tesorería y "Crédito a
  favor"→SALDO_FAVOR). Habría que agregar UI nueva sin reusar el seam ya existente en
  `RefundTesoreriaForm`. El mecanismo rígido (mirror exacto de pagos) no encaja con la UX de
  "Devolver dinero" que ya permite monto/línea libres para Tesorería — sería una UX inconsistente
  entre "reembolsar a Tesorería" (flexible) y "reembolsar a sesión" (rígido, todo o nada).
- **Efort**: Medio (motor) + Medio-Alto (UI nueva no alineada con el patrón existente).

### Opción B — Implementar el seam ya diseñado: nuevo `destino` en `EgresoTesoreriaLinea`

Extender `EgresoTesoreriaLinea.destino` (`'BANCO' | 'CAJA_FUERTE'`) con un tercer valor (p. ej.
`'SESION_CAJA'`), y una nueva función paralela a `escribirEgresoTesoreriaEnTx` que en vez de
escribir en `movimientos_bancarios`/`mov_caja_fuerte` escriba en `movimientos_metodo_cobro` con
`origen='NCR'` (o uno nuevo) y `sesion_caja_id` = la sesión elegida por el admin en el select ya
existente (`refund-tesoreria-form.tsx` L215-219, hoy `disabled`). Reusa 100% la lógica de tope y
remanente-a-SAFC (`calcularRemanenteRefund`) y la UI de líneas/monto/referencia ya construida —
solo habilita el `option` deshabilitado y agrega el branch de escritura correspondiente.

- **Pros**: alineado 1:1 con el seam de UI ya construido y con la decisión de diseño ya tomada en
  `nc-refund-tesoreria` (`proposal.md` línea 20). UX consistente: "Devolver dinero" sigue siendo
  un único formulario con monto libre por línea, sin importar si el destino es un banco, la caja
  fuerte, o una sesión de caja. Reusa el guard de tope y el reparto a SAFC sin duplicar lógica.
- **Contras**: el monto es LIBRE (no ligado a los pagos originales de la venta) — a diferencia de
  la Regla de Oro POS, este mecanismo no "reversa un pago específico", solo agrega un egreso
  genérico a la sesión elegida. Esto es coherente con cómo ya funciona `REFUND_TESORERIA` hacia
  bancos/caja fuerte, pero es una semántica distinta a la Regla de Oro POS — debe decidirse si
  eso es aceptable o si se requiere trazabilidad más fina. También requiere decidir qué
  `metodo_cobro_id` usar en el INSERT (la Regla de Oro lo deriva de `pago.metodo_cobro_id`; este
  mecanismo no tiene un pago de origen 1:1 que lo determine — necesita resolverse en diseño, p.
  ej. método EFECTIVO por defecto de esa caja).
- **Effort**: Medio (motor: nueva función de escritura + tipo nuevo) + Bajo (UI: habilitar option
  ya existente + resolver selector de cuenta/método para ese origen).

**Observación no solicitada pero relevante**: dado el hallazgo de §0.2, la Opción B es la que el
código YA anticipa como camino — recomendarla no es una preferencia arbitraria de esta
exploración sino la lectura más directa de la intención de diseño dejada en el change anterior.
La decisión final de diseño debe confirmar esto explícitamente con el usuario antes de comprometerse,
dado que la Opción A también es viable y tiene menor riesgo de introducir una semántica nueva de
"egreso sin pago de origen".

---

## Resumen ejecutivo para el usuario (retorno)

Ver mensaje de retorno al orquestador.
