# Exploration: Gestion Clientes saldo mismatch + estado de cuenta vacio

## Current State

ClaraPOS tiene DOS superficies de lectura de saldo de cliente que hoy usan fuentes de datos distintas, y esto es un divergencia **documentada y deliberada** (no un accidente aislado):

- `openspec/changes/cxc-saldo-favor-modelo/design.md` — Decision 6 clasifica explicitamente el modulo Clientes (`cliente-list.tsx`, `-detalle.tsx`, `-form.tsx`) como **OUT** del alcance de la correccion del modelo de saldo a favor, con la nota: *"Informational display; deactivation guard (`saldo_actual != 0`) still validly detects 'any open ledger entry' even unsplit. Follow-up relabel, not required for correctness."*
- `openspec/changes/cxc-saldo-favor-modelo/specs/cxc-deuda-lectura/spec.md` confirma: *"`clientes.saldo_actual` ... remains a combined ledger used elsewhere"* — es decir, el spec ASUME que Gestion Clientes seguira leyendo el campo neteado.

Esto significa: el bug reportado por el usuario es la consecuencia visible, no arreglada, de un follow-up que quedo pendiente cuando se corrigio el modulo CxC.

### Historial relevante de `clientes.saldo_actual` (por que CxC dejo de confiar en el)

`saldo_actual` tuvo multiples bugs de calculo historicos, todos parcheados via triggers Postgres sucesivos:
- `migrations/0057_fix_duplicate_trigger_and_saf_tipo.sql` — trigger duplicado + tipo SAF faltante en CHECK.
- `migrations/0060/0061/0062_*` — reparaciones de idempotencia/contexto/saldo tras fallos de trigger.
- `migrations/0088_fix_saf_trigger_sign.sql` — signo incorrecto en movimientos SAF.
- `migrations/0089_repair_saldo_actual_saf.sql` — replay completo de `movimientos_cuenta` por `(empresa_id, cliente_id)` para reparar `saldo_actual` corrompido.
- `migrations/0090_add_safc_tipo_movimientos_cuenta.sql` — introduce tipo `SAFC` (creacion de credito) separado de `SAF` (consumo), porque el modelo anterior neteaba ambos en un solo campo.

Como resultado, el equipo goveno la decision de que **CxC nunca vuelva a leer `saldo_actual` directamente** (ver `deuda-credito-cliente.ts`, `use-deuda-cliente.ts`, `use-cxc.ts` — todos con comentarios explicitos "NUNCA se lee clientes.saldo_actual aqui"). Gestion Clientes, en cambio, nunca migro a este nuevo modelo.

## Affected Areas

### Rutas
- `src/routes/_app/clientes/gestion.tsx` — pagina "Gestion Clientes" -> renderiza `ClienteList`.
- `src/routes/_app/clientes/cuentas-por-cobrar.tsx` — pagina "Cuentas por Cobrar" (funciona bien, confirmado por el usuario) -> renderiza `CxcList`.
- `src/routes/_app/clientes/index.tsx` — redirect a `/clientes/gestion`.

### Modulo "Gestion Clientes" (afectado — Bug #1 y #2)
- `src/features/clientes/hooks/use-clientes.ts`
  - `useClientes()` (linea 38-47): `SELECT * FROM clientes WHERE empresa_id = ?` — trae `saldo_actual` CRUDO de la tabla `clientes`, sin recalcular. Filtra empresa_id correctamente.
  - `useMovimientosClienteFiltrados()` (linea 95-126): trae el ledger `movimientos_cuenta` filtrado por `empresa_id + cliente_id`, con `ORDER BY fecha DESC, created_at DESC, rowid DESC` (fix reciente, commit `79e6428`) y `LIMIT 5` cuando no hay filtro de fechas.
  - `useCountMovimientosCliente()` (linea 128-140): cuenta total de movimientos, filtrado por empresa_id.
- `src/features/clientes/components/cliente-list.tsx` — tabla de clientes; columna "Saldo" (linea 200, 207, 244-246) usa `parseFloat(cli.saldo_actual)` directo del hook `useClientes()`. Boton "Ver detalle" (icono Eye, linea 269-280 y el menu contextual `handleVerDetalle`) abre `ClienteDetalle`.
- `src/features/clientes/components/cliente-detalle.tsx` — panel "Estado de Cuenta" (titulo linea 484). Consulta saldo con `SELECT saldo_actual FROM clientes WHERE id = ?` (linea 290-293, **sin filtro `empresa_id`** — ver Nota de seguridad abajo) y tabla de movimientos con `useMovimientosClienteFiltrados`.

### Modulo "Cuentas por Cobrar" (funciona bien — fuente de verdad correcta)
- `src/features/cxc/hooks/use-cxc.ts`
  - `DEUDA_CREDITO_CLIENTE_SELECT` (linea 83-91): calcula `deuda_usd = SUM(ventas.saldo_pend_usd WHERE saldo_pend_usd > 0.001)` y `credito_disponible_usd = MAX(0, SUM(SAFC) - SUM(SAF))` en `movimientos_cuenta`. **Nunca lee `saldo_actual` para estos dos valores** (solo lo trae como columna informativa adicional, no usada por la UI para el importe mostrado).
- `src/features/cxc/hooks/use-deuda-cliente.ts` — variantes batch/single de la misma logica, con comentario explicito: *"deliberadamente NO consulta ... clientes.saldo_actual (neteado)"*.
- `src/features/cxc/lib/deuda-credito-cliente.ts` — funciones puras `calcularCreditoDisponible` / `calcularDisponibleCredito`, ambas documentadas para nunca mezclar deuda y credito.
- `src/features/cxc/components/cxc-list.tsx` / `cxc-cliente-detalle.tsx` — consumen los hooks anteriores; `cxc-cliente-detalle.tsx` muestra **facturas pendientes** (`ventas`) + pagos (`pagos`), NO el ledger completo de `movimientos_cuenta` — es una vista distinta a la de Gestion Clientes.

### Escritura (para entender el blast radius — NO se toco nada de esto)
- `src/features/cxc/hooks/use-cxc.ts` — `aplicarPagoFacturaEnTx`, `registrarPagoFactura`, `registrarAbonoGlobal`: cada una hace `INSERT INTO movimientos_cuenta` + `UPDATE clientes SET saldo_actual = ...` DENTRO de la misma `writeTransaction` local. El comentario en linea 512-514 es clave: *"UPDATE directo para reflejar el cambio en SQLite local inmediatamente. En Supabase el trigger `actualizar_saldo_cliente` lo gestiona automaticamente via el INSERT de `movimientos_cuenta`; este UPDATE llega como no-op (mismo valor)."* — es decir, el cliente escribe el nuevo saldo dos veces (local optimista + trigger remoto reconciliador), patron necesario porque PowerSync no replica triggers de Postgres al SQLite local.
- `src/features/ventas/hooks/use-ventas.ts` (lineas ~895-1140) y `src/features/ventas/hooks/use-notas-credito.ts` (lineas ~805-990) — mismos INSERT a `movimientos_cuenta` desde venta a credito / notas de credito.
- `src/features/cxc/hooks/use-importar-cxc.ts` — import de saldos iniciales: SI inserta `movimientos_cuenta` (tipo `SAL`) y actualiza `saldo_actual`, correctamente.
- `migrations/0001_initial_schema.sql` (linea 186-201) — trigger `actualizar_saldo_cliente` (BEFORE INSERT en `movimientos_cuenta`) + triggers de inmutabilidad `trg_mov_cuenta_no_update/no_delete`.

## Data Flow (texto)

```
Venta a credito (POS) o Pago CxC
        |
        v
INSERT movimientos_cuenta (tipo FAC/PAG/NCR/NDB/SAF/SAFC/SAL)
        |
        +--> [LOCAL SQLite, misma writeTransaction]
        |     UPDATE clientes SET saldo_actual = <calculado en JS via calcularSaldoNuevoMovimientoCuenta>
        |     (optimista, visible de inmediato en la UI offline)
        |
        +--> [Supabase Postgres, tras sync PowerSync]
              trigger actualizar_saldo_cliente hace el mismo calculo server-side
              (reconciliador; en el caso feliz es no-op porque coincide con el UPDATE local)

Lectura "Gestion Clientes" (cliente-list.tsx, cliente-detalle.tsx):
        clientes.saldo_actual  --> muestra tal cual (valor NETEADO deuda-credito)

Lectura "Cuentas por Cobrar" (cxc-list.tsx, cxc-cliente-detalle.tsx):
        SUM(ventas.saldo_pend_usd)                     --> deuda_usd (nunca neteada)
        SUM(SAFC) - SUM(SAF) en movimientos_cuenta      --> credito_disponible_usd (nunca neteada)
```

Los dos numeros de CxC (`deuda_usd`, `credito_disponible_usd`) y el numero unico de Gestion Clientes (`saldo_actual`) **coinciden solo cuando el cliente nunca tuvo movimientos SAF/SAFC** (caso simple: solo FAC/PAG). En cuanto el cliente tiene saldo a favor (pago en exceso, nota de credito convertida a credito, etc.), `saldo_actual` muestra un numero neteado (ej. deuda 800 - credito 200 = 600) mientras CxC muestra 800 de deuda y 200 de credito por separado — coincidiendo con el reporte del usuario ("no muestra el saldo REAL").

## Bug #1 Hypothesis — Saldo mismatch en Gestion Clientes

**Hipotesis**: `ClienteList` (via `useClientes()`) y `ClienteDetalle` muestran `clientes.saldo_actual` — un valor legacy, NETEADO entre deuda y credito — mientras que `CxcList`/`CxcClienteDetalle` (via `useClientesConDeuda()`/`DEUDA_CREDITO_CLIENTE_SELECT`) muestran `deuda_usd` y `credito_disponible_usd` calculados frescos y SIN netear desde `ventas.saldo_pend_usd` y `movimientos_cuenta` respectivamente.

**Evidencia**:
- `src/features/clientes/hooks/use-clientes.ts:38-47` — `useClientes()` hace `SELECT * FROM clientes` (trae `saldo_actual` crudo).
- `src/features/clientes/components/cliente-list.tsx:207,244-246` — usa `parseFloat(cli.saldo_actual)` directo para la columna "Saldo".
- `src/features/cxc/hooks/use-cxc.ts:83-91` (`DEUDA_CREDITO_CLIENTE_SELECT`) — calcula `deuda_usd` y `credito_disponible_usd` de forma independiente, explicitamente SIN usar `saldo_actual` para el numero mostrado.
- `openspec/changes/cxc-saldo-favor-modelo/design.md` Decision 6 — marca el modulo Clientes como **OUT** de alcance, "follow-up relabel, not required for correctness" — confirma que el equipo SABIA de esta divergencia y la dejo pendiente.
- `openspec/changes/cxc-saldo-favor-modelo/specs/cxc-deuda-lectura/spec.md:5` — confirma textualmente que `saldo_actual` "remains a combined ledger used elsewhere" (i.e. en Clientes).

**Por que no es un bug de calculo sino de fuente de lectura**: `saldo_actual` en si mismo esta siendo mantenido correctamente por el trigger + el UPDATE local optimista (no hay evidencia de que el valor almacenado este mal). El problema es que **Gestion Clientes lee un campo cuya semantica (neteado) ya no es la que el negocio necesita mostrar** desde que se introdujo el modelo SAF/SAFC separado.

**No es un bug de multi-tenant**: `useClientes()` SI filtra por `empresa_id`. Correcto.

## Bug #2 Hypothesis — Estado de Cuenta vacio

**Hipotesis mas debil / no confirmada por analisis estatico.** El codigo actual de `cliente-detalle.tsx` + `useMovimientosClienteFiltrados` (que es lo que renderiza la seccion "Estado de Cuenta" al hacer click en "Ver detalle" desde `ClienteList`) **no muestra un defecto estructural obvio**:
- La query filtra correctamente por `empresa_id AND cliente_id` (`use-clientes.ts:105-121`).
- El ORDER BY tiene tiebreaker `rowid` (fix reciente, commit `79e6428 fix(clientes): usar rowid como tiebreaker definitivo en movimientos_cuenta`).
- `powersync-sync-rules.yaml:102` confirma que `movimientos_cuenta` SI esta en el bucket `by_empresa`, sincronizado correctamente — descartado como causa.
- El flujo de escritura (`aplicarPagoFacturaEnTx`, `use-ventas.ts`, `use-notas-credito.ts`, `use-importar-cxc.ts`) siempre inserta en `movimientos_cuenta` junto con la operacion principal, dentro de la misma `writeTransaction` — descartado un gap de escritura para el flujo de pagos/ventas/importacion.

**Lo que SI se pudo confirmar como sospechoso pero no concluyente**:
1. El historial git de esta zona (`use-clientes.ts`: `79e6428`, `9c49f28`, `2d3dfda`, `a8070ae`) muestra multiples fixes previos sobre ordenamiento y tracking de saldo en este mismo panel — sugiere que el "Estado de Cuenta" tuvo bugs reales en el pasado reciente, y es plausible que el reporte del usuario describa un estado anterior a `79e6428`, o que exista un bug remanente no visible por lectura estatica (race de datos, cache de PowerSync, o un build desplegado distinto al HEAD actual).
2. La query de saldo en el panel (`cliente-detalle.tsx:290-293`, `SELECT saldo_actual FROM clientes WHERE id = ?`) **no filtra por `empresa_id`** — no es funcionalmente el causante de "vacio" (el `id` es PK unico), pero es una violacion de la regla #11 de multi-tenant (toda query de negocio debe filtrar por `empresa_id`) y debe corregirse igual quando se toque este archivo.
3. `TIPO_LABELS` en `cliente-detalle.tsx:25-32` no incluye `SAFC` ni `SAL` — esos movimientos SI se mostrarian en la tabla (no la vacian), pero con la etiqueta cruda (`mov.tipo`) en lugar de un label amigable — defecto cosmetico menor, no el bug reportado.

**Recomendacion**: antes de proponer una correccion para el Bug #2, se necesita verificacion en runtime/manual (ver Open Questions) porque el analisis estatico del codigo actual no reproduce el sintoma "tabla vacia + sin saldo".

## Dependency / Blast-Radius Map

Tablas y triggers que NO deben romperse al tocar Gestion Clientes:

| Recurso | Por que es sensible |
|---|---|
| `clientes.saldo_actual` | Escrito por: trigger Postgres `actualizar_saldo_cliente` (inmutable, BEFORE INSERT en `movimientos_cuenta`) + UPDATE local optimista en 6 sitios distintos (`use-cxc.ts` x4, `use-ventas.ts`, `use-notas-credito.ts`, `use-importar-cxc.ts`). Cualquier cambio de "donde se lee" NO debe tocar "donde se escribe". |
| `movimientos_cuenta` | Inmutable (triggers `trg_mov_cuenta_no_update/no_delete`). Fuente de verdad para el ledger histórico y para `credito_disponible_usd` de CxC. Sincronizado via bucket `by_empresa` en PowerSync — cambios de query aqui son de solo lectura, seguros. |
| `ventas.saldo_pend_usd` | Fuente de `deuda_usd` en CxC. Actualizado por pagos/abonos/notas de credito. No tocar su logica de escritura. |
| CxC (`use-cxc.ts`, `cxc-list.tsx`, `cxc-cliente-detalle.tsx`) | **Ya funciona correctamente segun el usuario** — cualquier fix para Gestion Clientes debe ser aditivo/paralelo (ej. replicar la misma logica de `DEUDA_CREDITO_CLIENTE_SELECT` en `useClientes()` o un nuevo hook), nunca modificar los hooks de CxC existentes. |
| Caja / Cuadre de caja | Consume `movimientos_metodo_cobro`, `pagos`, `movimientos_bancarios` — no relacionado directamente con la lectura de `saldo_actual`, pero comparte las mismas transacciones atomicas (`aplicarPagoFacturaEnTx`) — cualquier cambio en el flujo de escritura de CxC (fuera de alcance de este bug) podria afectar Caja. |
| Tesoreria | Consume `bancos_empresa`, `movimientos_bancarios` — mismo comentario que Caja. |
| Toggle desactivar cliente (`cliente-list.tsx:71-102`, `actualizarCliente`) | Usa `parseFloat(cliente.saldo_actual) !== 0` como guard para bloquear desactivacion — si se cambia la fuente de lectura del saldo mostrado, este guard debe seguir funcionando (Decision 6 del design.md ya senala esto como "aun valido incluso sin split"). |

## Optimization Observations (sin rediseñar)

- **Gestion Clientes (`useClientes()`)**: trae TODOS los clientes de la empresa en una sola query (`SELECT *`), sin agregacion — es la query mas barata de las dos superficies (no hay subconsultas), pero muestra el dato "incorrecto" (neteado).
- **CxC (`DEUDA_CREDITO_CLIENTE_SELECT`)**: por cada cliente activo ejecuta **3 subconsultas correlacionadas** (`COUNT` facturas pendientes, `SUM` deuda, 2x `SUM` sobre `movimientos_cuenta` para credito) dentro de una subquery envuelta en otra query externa con filtro `WHERE deuda_usd > 0.001 OR credito_disponible_usd > 0.001`. Esto es un patron de agregacion-por-fila (N subconsultas x cliente) — funciona porque SQLite local es rapido y el dataset por empresa es pequeño, pero es la version "cara" comparada con simplemente leer `saldo_actual`. Si Gestion Clientes migra a este mismo patron para unificar, el costo de renderizar la lista completa de clientes (no solo los con deuda, como hace CxC) podria escalar peor — CxC ya filtra `WHERE deuda_usd > 0.001 OR credito_disponible_usd > 0.001` reduciendo el resultado antes de mostrarlo, pero Gestion Clientes necesita mostrar TODOS los clientes (con y sin deuda), por lo que las subconsultas correrian sobre el universo completo, no solo los morosos.
- **Estado de Cuenta (`useMovimientosClienteFiltrados`)**: bien indexado a nivel de intencion (filtra por cliente + empresa, limita a 5 sin filtro de fecha), pero no hay evidencia de un indice compuesto `(empresa_id, cliente_id, fecha)` en SQLite local — `schema.ts:631-654` declara la tabla `movimientos_cuenta` con `{ indexes: {} }` (sin indices explicitos declarados en PowerSync). Con volumen alto de movimientos por cliente esto podria degradar, aunque hoy no es el causante de ningun bug reportado.

## Open Questions

1. **Bug #2 requiere verificacion runtime**: con el codigo actual no se reproduce estaticamente "estado de cuenta vacio". Se necesita: (a) reproducir en un navegador/dispositivo real con un cliente que SI tenga movimientos, (b) inspeccionar la consola/devtools de PowerSync para confirmar que `useMovimientosClienteFiltrados` recibe `empresaId` no vacio y que la query realmente devuelve filas, (c) confirmar si el build que el usuario probo corresponde al HEAD actual o a una version anterior a los fixes `79e6428`/`9c49f28`.
2. **Alcance del fix de Bug #1**: ¿el fix debe (a) hacer que `ClienteList`/`ClienteDetalle` lean `deuda_usd`/`credito_disponible_usd` via la misma logica que CxC (replicando `DEUDA_CREDITO_CLIENTE_SELECT` o extrayendola a un hook compartido), mostrando deuda y credito por separado como en CxC; o (b) mostrar un unico "saldo" derivado (`deuda_usd - credito_disponible_usd`) solo para Gestion Clientes, aceptando que es informational segun Decision 6? Esto es una decision de producto/UX, no solo tecnica — afecta el diseño de la tabla y el guard de desactivacion.
3. **Guard de desactivacion** (`tieneMovimientos` + `saldo_actual !== 0`, `cliente-list.tsz:71-89`): si se cambia la fuente de saldo mostrado, ¿debe cambiar tambien la condicion que bloquea desactivar un cliente con deuda? Decision 6 dice que el guard actual "sigue siendo valido" — confirmar con el usuario si se acepta dejarlo como esta o si debe alinearse con `deuda_usd`.
4. **Seguridad multi-tenant menor**: la query de saldo en `cliente-detalle.tsx:290-293` no filtra por `empresa_id` (solo por `id` de cliente, que es PK unico) — no es la causa de ningun bug reportado, pero viola la regla #11 del proyecto y deberia corregirse en el mismo cambio si se toca este archivo.
5. **TIPO_LABELS incompleto** (`cliente-detalle.tsx:25-32`): falta mapping para `SAFC` y `SAL` — no vacia la tabla pero muestra la etiqueta cruda; confirmar si se corrige en el mismo cambio o se considera fuera de alcance.

## Skills Applied

- **Supabase / Supabase Postgres**: usados para leer criticamente el historial de triggers/migraciones de `movimientos_cuenta` y `clientes.saldo_actual`, y para entender el patron BEFORE INSERT trigger + UPDATE local optimista (gotcha de PowerSync: los triggers Postgres NO se replican al SQLite local, por lo que cada escritor debe simular el efecto del trigger localmente — confirmado en comentarios de `use-cxc.ts:512-514`).
- **Vercel React Best Practices**: relevante para la seccion de Optimization Observations (patron de N subconsultas por fila en `DEUDA_CREDITO_CLIENTE_SELECT` vs. lectura simple en `useClientes()`) — no se aplicaron cambios de codigo en esta fase (solo exploracion), pero se dejo la observacion para la fase de diseño.
