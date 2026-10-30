# Design: Fix trigger `actualizar_saldo_cliente()` — `saldo_actual` deja de auto-sanarse

## Part 0 — Composición real de `saldo_actual` (evidencia, no suposición)

### 0.1 Trigger vigente (migrations/0115, última `CREATE OR REPLACE` — confirmado por grep: nada posterior lo redefine excepto 0118, que SOLO agrega una rama `REV` sin tocar el resto)

```sql
-- IF/ELSIF superior: computa/valida NEW.saldo_nuevo (alimenta el AUDIT de movimientos_cuenta)
IF NEW.tipo IN ('FAC','NDB')      THEN NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
ELSIF NEW.tipo IN ('PAG','NCR')   THEN NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
ELSIF NEW.tipo IN ('SAF','SAFV')  THEN -- confía en el valor de la app, solo ASSERT |Δ|=monto
ELSIF NEW.tipo = 'REV' (0118)     THEN -- ASSERT saldo_nuevo = saldo_anterior+monto (dirección fija)
END IF; -- SAL, SAFC, SAFR: NEW.saldo_nuevo queda tal cual llegó del INSERT, sin validar

UPDATE clientes SET
  saldo_actual = NEW.saldo_nuevo,                              -- ← EL BUG: siempre verbatim
  saf_disponible = CASE WHEN tipo='SAFC' THEN +monto
                        WHEN tipo IN ('SAF','SAFR','SAFV') THEN GREATEST(0, saf_disponible-monto)
                        ELSE saf_disponible END,                -- delta ATÓMICO en vivo (0102/0115)
  saldo_pendiente_usd = CASE WHEN tipo IN ('FAC','NDB','REV') THEN +monto
                             WHEN tipo IN ('PAG','NCR','SAF','SAFV') THEN GREATEST(0, saldo_pendiente_usd-monto)
                             ELSE saldo_pendiente_usd END       -- delta ATÓMICO en vivo (0110/0115)
WHERE id = NEW.cliente_id;
```

**La asimetría exacta**: `saf_disponible` y `saldo_pendiente_usd` se recalculan **en vivo** desde el valor actual de la fila (`columna ± NEW.monto`, dentro del mismo `UPDATE`, sin input de la app) desde 0102/0110. `saldo_actual` nunca recibió ese tratamiento — sigue dependiendo de `NEW.saldo_nuevo`, que para FAC/NDB/PAG/NCR es `NEW.saldo_anterior` (anchor **de la app**, leído de su caché local, potencialmente stale) `± monto`, y para SAF/SAFV/SAFC/SAFR/REV/SAL es el valor que la app calculó y mandó, punto. Si la caché local del cliente (`use-cxc.ts`) no reflejó una corrección previa del servidor (p. ej. el REV del paso 2 del repro), el PAG del paso 3 ancla sobre ese valor viejo y el trigger lo copia sin cuestionarlo.

### 0.2 Por qué NO es un race condition residual (evidencia directa)

0060/0088 prohibieron leer `saldo_actual` en vivo porque el PATCH que la app mandaba a Supabase sobre `clientes.saldo_actual` podía llegar antes o después del INSERT en `movimientos_cuenta`, y leer el valor "ya pisado por el PATCH" duplicaba la resta. **Ese PATCH ya no existe para esta columna**: `connector.ts:132` —

```ts
clientes: ['saldo_actual', 'saf_disponible', 'saldo_pendiente_usd'],
```

`saldo_actual` está en `TRIGGER_MANAGED_PATCH_COLUMNS` **desde la primera versión de este mecanismo** (confirmado por `git log -S`, commit que introdujo el array con exactamente `['saldo_actual']`, antes de que `saf_disponible` existiera). El connector strip-ea esa columna de todo PATCH a Supabase (`connector.ts:616-626`) — la escritura local a SQLite sigue para reactividad de UI, pero nunca sube. El único camino server-side que toca `saldo_actual` es este trigger. Leerlo en vivo **dentro del mismo `UPDATE`** (mismo row-lock que ya protege `saf_disponible`/`saldo_pendiente_usd` desde 0102/0110, sin querys nuevas) es exactamente tan seguro como esas dos columnas hermanas — cero reintroducción de 0060/0088.

### 0.3 Fórmula canónica (derivada, no inventada)

Semántica confirmada en 3 lugares independientes:
- `migrations/0062` (repair): clientes con deuda sin SAF → `saldo_actual = SUM(ventas.saldo_pend_usd)`. Saldos **negativos** (crédito) se dejan intactos explícitamente ("SAF credits, a favor").
- `migrations/0089` (repair ledger-replay): confirma signo — SAF consumido *resta* cuando el running balance es `>=0` (deuda), *suma* cuando es `<0` (crédito ya a favor).
- Frontend, 3 citas literales: `cxc-cliente-reporte.tsx:144` *"saldoLedger: balance crudo del ledger... realidad contable"*; `use-ventas.ts:1198` *"saldo_actual baja a negativo"* al aplicar SAF; `cxc-cliente-reporte.tsx:141` *"NO usar cliente.saldo_actual para deuda: es un valor neteado"*. El código de negocio **ya trata `saldo_actual` como neteado y nunca lo usa para decisiones de SAF/CxC** (esas usan `saf_disponible`/`saldo_pendiente_usd` directos) — el blast radius del bug es de visualización (lista de clientes, Kardex, KPIs), no de lógica de negocio crítica, aunque sigue siendo un bug financiero real.

**Fórmula**: `saldo_actual = saldo_pendiente_usd − saf_disponible`, con una única excepción histórica: `SAL` (import de saldo inicial legacy, `use-importar-cxc.ts:249-258`) escribe un **ancla absoluta** (`saldoAnterior + monto`) que **no** pasa por `saldo_pendiente_usd` (no-op documentado: *"el saldo inicial importado no se contabiliza como factura real"*) ni por `saf_disponible`. Probado por inducción: como toda operación (incl. SAL) es aditiva, en cualquier punto `saldo_actual = Σ(SAL.monto) + saldo_pendiente_usd_actual − saf_disponible_actual` — la fórmula "resta/derivada" (pendiente−saf) y la "relativa" (saldo_actual_viejo + Δpendiente − Δsaf) coinciden siempre que no haya ancla SAL; con ancla SAL, solo la **relativa** preserva el valor importado (ver 1.2).

## Part 1 — Fix del trigger

### Decisión central

| Opción | Por qué se descarta / elige |
|---|---|
| `saldo_actual = saldo_pendiente_usd_new − saf_disponible_new` (absoluta) | Matemáticamente correcta SIN histórico `SAL`, pero **borra el ancla legacy** en el primer movimiento no-SAL posterior (ver 1.2) — descartada. |
| `saldo_actual = saldo_actual_viejo + Δpendiente − Δsaf` (relativa, elegida) | Mismo resultado que la absoluta cuando no hay drift de ancla, pero preserva cualquier ancla (SAL u otra) porque opera como delta sobre el valor YA persistido, igual que `saf_disponible`/`saldo_pendiente_usd`. Cero queries nuevas, mismo row-lock, mismas 2 expresiones `CASE` ya existentes reutilizadas para derivar el delta (`nuevo − viejo`, el `GREATEST` ya absorbe los pisos). |
| Leer `clientes.saldo_actual` vía subquery/CTE aparte | Reintroduce una lectura previa fuera del `UPDATE` — innecesario, el valor viejo ya está disponible sin calificar en el mismo `SET`. |

### 1.1 SQL exacto (reemplaza solo la línea `saldo_actual = NEW.saldo_nuevo`; `saf_disponible`/`saldo_pendiente_usd` quedan byte-idénticos a 0115/0118)

```sql
saldo_actual = CASE
  WHEN NEW.tipo = 'SAL' THEN NEW.saldo_nuevo              -- ancla absoluta, sin cambios (0088)
  ELSE
    saldo_actual                                           -- valor VIVO, no NEW.saldo_anterior
    + (CASE WHEN NEW.tipo IN ('FAC','NDB','REV') THEN NEW.monto
            WHEN NEW.tipo IN ('PAG','NCR','SAF','SAFV')
                 THEN GREATEST(0, saldo_pendiente_usd - NEW.monto) - saldo_pendiente_usd
            ELSE 0 END)
    - (CASE WHEN NEW.tipo = 'SAFC' THEN NEW.monto
            WHEN NEW.tipo IN ('SAF','SAFR','SAFV')
                 THEN saf_disponible - GREATEST(0, saf_disponible - NEW.monto)
            ELSE 0 END)
END,
```

Toda referencia sin calificar (`saldo_actual`, `saldo_pendiente_usd`, `saf_disponible`) resuelve a la fila **previa** al `UPDATE` (semántica estándar de Postgres en una lista `SET`) — exactamente el mismo mecanismo que ya usan las dos columnas hermanas.

### 1.2 Prueba con el repro exacto del owner (cliente test 8, $1)

| Paso | tipo | monto | pendiente antes→después | saf | saldo_actual viejo | Δp | Δsaf | **saldo_actual nuevo** |
|---|---|---|---|---|---|---|---|---|
| 1a | FAC | 1 | 0→1 | 0 | 0 | +1 | 0 | 1 |
| 1b | PAG | 1 | 1→0 | 0 | 1 | −1 | 0 | **0** |
| 2 | REV | 1 | 0→1 | 0 | 0 | +1 | 0 | **1** ✓ ("sube a 1 OK") |
| 3 | PAG | 1 | 1→0 | 0 | 1 | −1 | 0 | **0** ✓ (bug: antes quedaba en 1) |
| 4 | REV | 1 | 0→1 | 0 | 0 | +1 | 0 | **1** ✓ (bug: antes daba 2) |

Nótese que el paso 3 usa `saldo_actual=1` como punto de partida — el valor **vivo en la fila**, no lo que la app creyera localmente. Eso es exactamente lo que auto-sana el bug sin importar qué tan stale esté la caché del cliente.

Caso ancla SAL (no rompe créditos legítimos): cliente con `SAL` import $500 (pendiente=0, saf=0, actual=500). Nueva venta a crédito FAC $100: Δp=+100, Δsaf=0 → `actual = 500+100−0 = 600` ✓ (se preserva el ancla). Caso SAF puro (crédito a favor, sin deuda): `SAFC $100` → Δp=0, Δsaf=+100 → `actual = 0+0−100 = −100` ✓ (negativo = favor, igual que 0062/0089).

### 1.3 Implicación en la app (`use-cxc.ts`, `reversarPagoEnTx` L2030-2038, y análogos PAG/SAF)

| Pregunta | Respuesta |
|---|---|
| ¿Sigue haciendo falta `ventaDeltaReal`/el clamp de PR #284? | **Sí, más que antes**. `NEW.monto` alimenta directamente el nuevo delta de `saldo_actual` (no solo `saldo_pendiente_usd`) — un `monto` inflado ahora corrompería DOS columnas en vez de una. El clamp pasa de "protege 1 columna" a "protege 2". |
| ¿`NEW.saldo_nuevo`/`saldo_anterior` calculados por la app se vuelven basura? | No. Siguen siendo: (a) el valor del AUDIT inmutable `movimientos_cuenta.saldo_nuevo` (snapshot histórico por fila), (b) el input de la asserción SAF/SAFV y la asserción REV (0118) — ambas siguen validando consistencia de ese snapshot, (c) el valor que la app escribe LOCALMENTE en SQLite para reactividad inmediata de UI antes del próximo sync-down. Lo único que deja de hacer es **gobernar** `clientes.saldo_actual` en el servidor. |
| ¿Puede la UI local mostrar transitoriamente un valor distinto al servidor? | Sí, mismo tipo de latencia eventual ya aceptado para la race de 0096 (fuera de alcance) — se resuelve solo en el próximo sync-down. |

## Part 2 — Reconciliación (sustituye 0118 Parte 1)

### Por qué 0118 queda obsoleta para este caso

0118 detecta drift comparando `SUM(ventas.saldo_pend_usd)` vs `clientes.saldo_pendiente_usd`, y aplica **el mismo delta** a `saldo_actual`. Falla en 2 formas:
1. **Ciega al caso exacto del bug**: en el paso 3 del repro, `saldo_pendiente_usd` ya está correcto (0, sin drift) pero `saldo_actual` está mal (1) — 0118 nunca lo detecta porque ambos chequeos comparten el mismo delta anclado en `saldo_pendiente_usd`.
2. **Bug latente independiente, descubierto en esta investigación**: la CTE `real` de 0118 no filtra `ventas.tipo != 'SALDO_INICIAL'` — la fila sintética que crea `use-importar-cxc.ts` para un import `SAL` SIEMPRE tiene `saldo_pend_usd = monto completo` (nunca 0, confirmado línea 177-178 del archivo), mientras `clientes.saldo_pendiente_usd` deliberadamente la excluye. Cualquier cliente con historial `SAL` haría que 0118 "corrija" de más, duplicando el monto importado.

### Diseño corregido — dos chequeos de drift INDEPENDIENTES (no un delta compartido)

```sql
WITH deuda AS (
  SELECT v.cliente_id, v.empresa_id, SUM(CAST(v.saldo_pend_usd AS NUMERIC)) AS deuda_real
  FROM ventas v
  WHERE v.status != 'ANULADA' AND v.tipo != 'SALDO_INICIAL'   -- fix: excluye el ancla SAL
  GROUP BY v.cliente_id, v.empresa_id
), sal AS (
  SELECT mc.cliente_id, mc.empresa_id, SUM(mc.monto) AS sal_total
  FROM movimientos_cuenta mc WHERE mc.tipo = 'SAL'
  GROUP BY mc.cliente_id, mc.empresa_id
), objetivo AS (
  SELECT c.id, c.empresa_id,
         COALESCE(d.deuda_real, 0) AS pendiente_obj,
         COALESCE(d.deuda_real, 0) + COALESCE(s.sal_total, 0) - CAST(c.saf_disponible AS NUMERIC) AS actual_obj
  FROM clientes c
  LEFT JOIN deuda d ON d.cliente_id = c.id AND d.empresa_id = c.empresa_id
  LEFT JOIN sal   s ON s.cliente_id = c.id AND s.empresa_id = c.empresa_id
), drift AS (
  SELECT o.* FROM objetivo o JOIN clientes c ON c.id = o.id
  WHERE ABS(o.pendiente_obj - CAST(c.saldo_pendiente_usd AS NUMERIC)) > 0.005
     OR ABS(o.actual_obj    - CAST(c.saldo_actual AS NUMERIC))        > 0.005   -- chequeo INDEPENDIENTE
)
UPDATE clientes c SET
  saldo_pendiente_usd = d.pendiente_obj,
  saldo_actual        = d.actual_obj,
  updated_at = NOW()
FROM drift d WHERE d.id = c.id;
-- envuelto en PERFORM set_config('clarapos.trigger_context','mov_cuenta',TRUE) — mismo canal oficial.
```

Verificación: cliente test 8 tras el repro completo (deuda_real=1, sal=0, saf=0) → `actual_obj=1` (objetivo correcto tras el fix, no 2). Cliente test 6 (reportado en −2): cualquiera sea su `deuda_real`/`saf_disponible` real, el objetivo se computa con la misma fórmula general sin casos especiales por cliente.

**Disposición de 0118**: migración **no mergeada** (`origin/develop` solo llega a 0117; 0118 vive únicamente en la rama `feat/fix-saldo-cliente-reconciliacion`, commit `95e1ba3b`, PR #285 sin abrir/mergear). Recomendación: **reemplazar en el mismo archivo** (mismo número `0118`) — Parte 1 (reconciliación) se sustituye por el SQL de arriba; Parte 2 (`CREATE OR REPLACE FUNCTION`, assertion REV) se **extiende** para incluir también el fix de §1.1. No hay razón para un número nuevo (0119): nunca se desplegó, no hay historial de producción que preservar separado.

## Part 3 — Tests, orden de despliegue, riesgos

### Casos de prueba (manual `BEGIN;...ROLLBACK;` — no hay infra de tests contra Postgres en el repo, mismo patrón que 0102/0110/0115/0118)

| # | Caso | Verifica |
|---|---|---|
| TC1 | Repro 4 pasos exacto | paso 3→0, paso 4→1 (no 2) |
| TC2 | Cliente con `SAFC $100` sin deuda | `saldo_actual` termina en −100 (favor), nunca se rompe |
| TC3 | Cliente con ancla `SAL $500` + `FAC $100` posterior | `saldo_actual=600`, el ancla no se pierde |
| TC4 | `SAFV` en venta con SAF parcial (total $100, SAF $50) | pendiente final=50, saf final=0, actual final=50 |
| TC5 | Reconciliación: cliente con drift solo en `saldo_actual` (pendiente ya correcto) | 0118 lo ignoraba; el nuevo chequeo independiente lo corrige |
| TC6 | Reconciliación idempotente | 2da corrida → 0 filas |
| TC7 | Reconciliación en cliente con historial `SAL` | `deuda_real` excluye `SALDO_INICIAL`, no duplica |
| TC8 | Assertion REV (0118) con `saldo_nuevo` inconsistente | sigue rechazando (P0001) — ver siguiente punto |

**¿La assertion REV de 0118 sigue teniendo sentido?** Sí, pero cambia de propósito: antes defendía (parcialmente) `saldo_actual` contra basura; ahora `saldo_actual` ya no lee `NEW.saldo_nuevo` para `REV`, así que la assertion defiende exclusivamente la integridad del **audit trail inmutable** (`movimientos_cuenta.saldo_nuevo`) — un dato histórico sigue mereciendo ser consistente aunque ya no gobierne la columna viva. Se mantiene sin cambios.

### Orden de despliegue

1. **Trigger primero** (`CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()` con el fix de §1.1 + assertion REV ya existente).
2. **Reconciliación después, en el mismo archivo/transacción**, para que los valores corregidos no queden expuestos a una próxima inserción bajo el trigger viejo. La reconciliación hace `UPDATE` directo sobre `clientes` (nunca pasa por el trigger, que solo dispara en INSERT de `movimientos_cuenta`) — el orden interno Parte1/Parte2 dentro del archivo no afecta corrección, pero se mantiene trigger-luego-reconciliación por claridad narrativa (mismo criterio que 0118 original).
3. Todo en una sola migración 0118 (reemplazada), una sola transacción `BEGIN;...COMMIT;`.

### Riesgos residuales

- La reconciliación asume `saf_disponible` como terreno confiable (no implicado en este bug, auto-sanado desde 0102 sin incidentes reportados) — si algún cliente tuviera drift *también* en `saf_disponible` por una causa no relacionada, el objetivo de `saldo_actual` heredaría ese error. Mitigado por el mismo argumento que 0118 ya aceptó como warning no bloqueante.
- La causa raíz del stale-read/race original en la app (migration 0096) sigue fuera de alcance — este fix hace el síntoma no-persistible server-side, no corrige la latencia de sincronización local.

## Open Questions

- [ ] ¿Vale la pena, como mejora futura (fuera de este cambio), agregar assertions de consistencia a `SAFC`/`SAFR` igual que `SAF`/`SAFV`/`REV`? No bloqueante, no solicitado.
- [ ] Confirmar con el owner: ¿`0118` se reemplaza in-place (recomendado) o se prefiere un nuevo número `0119` por preferencia de trazabilidad en PR #285?
