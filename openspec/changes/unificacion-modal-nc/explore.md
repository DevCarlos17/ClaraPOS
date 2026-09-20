# Exploracion: Unificar la seccion "info de NC" de los dos modales de Nota de Credito (POS y Admin/Tesoreria)

> Exploracion READ-ONLY. Ningun archivo de codigo fue modificado. Todas las citas son `archivo:linea` reales, leidas del branch `develop` en el estado actual del repo.

## A. Localizacion y estructura de ambos modales

### A.1 Modal ADMIN (ruta "Facturas Emitidas")

- Ruta: `src/routes/_app/ventas/facturas-emitidas.tsx:13` — envuelto en `RequirePermission permission={PERMISSIONS.SALES_VOID}` (`ventas.anular`), con `fallback={<AccessDeniedPage />}`. El gate de ACCESO a la pantalla completa es a nivel de ruta.
- Contenedor: `src/features/ventas/components/facturas-empresa-tab.tsx:298-339` (`FacturasEmpresaTab`) — mantiene `facturaSeleccionada`/`modalOpen` y monta:
  ```
  facturas-empresa-tab.tsx:327  <CrearNcrModal isOpen={modalOpen} onClose={...} factura={facturaSeleccionada} />
  ```
  El boton "Aplicar nota de credito" que dispara `handleAplicarNc` vive en `facturas-empresa-tab.tsx:246-265`, deshabilitado cuando `f.tiene_reverso_total === 1` (`facturas-empresa-tab.tsx:250`).
- Modal raiz: `src/features/ventas/components/crear-ncr-modal.tsx` (**468 lineas**), exporta `CrearNcrModal` (`crear-ncr-modal.tsx:83`).
- Arbol de componentes del modal admin (todo en el MISMO archivo, sin sub-componentes propios de layout, solo reuso de piezas ya compartidas):
  ```
  CrearNcrModal (dialog nativo)
  ├── FacturaDetallePanel        (factura-detalle-panel.tsx)      — reusado, compartido
  ├── [gate: !puedeEmitirNc]     — mensaje "reversada totalmente"
  ├── Deposito de reingreso      — <NativeSelect> inline JSX (crear-ncr-modal.tsx:281-297)
  ├── Tipo de NC (Total/Parcial) — botones inline JSX (crear-ncr-modal.tsx:303-334)
  ├── Origen del reverso         — botones inline JSX "Devolver dinero"/"Credito a favor" (crear-ncr-modal.tsx:343-367)
  ├── Motivo de anulacion        — <input> inline, condicional (crear-ncr-modal.tsx:376-387) O intercalado via motivoSlot
  └── Contenido especifico del flujo (gateado por tipoNc + origenReverso, crear-ncr-modal.tsx:395-438):
      ├── SeleccionLineasNc      (PARCIAL, cualquier origen)      — reusado, compartido
      ├── RefundTesoreriaForm    (TOTAL + DEVOLVER_DINERO)        — reusado, compartido
      └── Warning irreversible   (TOTAL + CREDITO_A_FAVOR)         — inline JSX
  ```
- Tests: `src/features/ventas/components/__tests__/crear-ncr-modal.test.tsx` (**438 lineas**).

### A.2 Modal POS ("Facturas Emitidas - Sesion Actual")

- Trigger: boton en `src/features/ventas/components/pos-terminal.tsx:1401-1405` (`<NotaCreditoPosModal isOpen={showNotaCreditoModal} onClose={...} sesion={sesion} />`), montado como sibling del carrito de venta — sin ninguna guarda de ruta/permiso adicional a nivel de pantalla (el POS-terminal en si mismo tiene sus propios gates de acceso, no especificos de NC).
- Modal raiz: `src/features/ventas/components/nota-credito-pos-modal.tsx` (**840 lineas**), exporta `NotaCreditoPosModal` (`nota-credito-pos-modal.tsx:135`).
- Arbol de componentes del modal POS (layout de DOS columnas — lista izquierda + detalle derecha — a diferencia del admin, que es un `<dialog>` de una sola columna centrado en UNA factura ya elegida por el llamador):
  ```
  NotaCreditoPosModal (dialog nativo, layout 2 columnas)
  ├── Columna izquierda: lista + buscador de facturas de la SESION ACTIVA
  │   └── FacturaBadges          (nota-credito-pos-modal.tsx:93-114) — local a este archivo
  └── Columna derecha ("nc-pos-columna-detalle", nota-credito-pos-modal.tsx:532-724):
      ├── FacturaDetallePanel    (factura-detalle-panel.tsx, hideFacturaTitle) — reusado, compartido
      ├── [gate: !puedeEmitirNc] — mensaje "reversada totalmente"
      └── [gate: ncSectionRevealed] — seccion de emision, oculta hasta boton "Emitir nota de credito":
          ├── Tipo de NC (Total/Parcial)     — botones inline JSX (nota-credito-pos-modal.tsx:563-596), MISMO markup que crear-ncr-modal.tsx:303-334 (duplicado, no extraido)
          ├── Modalidad de liquidacion       — <NativeSelect> con 4 opciones (nota-credito-pos-modal.tsx:598-616) — SIN equivalente en admin
          ├── Deposito de reingreso de stock — condicional PIN B (nota-credito-pos-modal.tsx:618-654) — variante MAS COMPLEJA que la de admin
          ├── Motivo de anulacion            — <input> inline (nota-credito-pos-modal.tsx:656-665)
          └── Contenido especifico del flujo (gateado SOLO por tipoNc, nota-credito-pos-modal.tsx:667-721):
              ├── SeleccionLineasNc  (PARCIAL) — reusado, compartido, con prop extra `depositoInvalido`
              ├── Warning irreversible + boton dedicado (TOTAL) — inline JSX
              └── Estado neutro "Selecciona Total o Parcial" (sin tipo elegido)
  ```
- Ademas monta, fuera del `<dialog>` principal: `SupervisorPinDialog` (PIN A, `nota-credito-pos-modal.tsx:789-811`), `SupervisorPinDialog` (PIN B, `nota-credito-pos-modal.tsx:816-823`), `ConsultaFacturaModal` para "Reimprimir" (`nota-credito-pos-modal.tsx:828-837`).
- Tests: `src/features/ventas/components/__tests__/nota-credito-pos-modal.test.tsx` (**1516 lineas** — la superficie con, por lejos, mas cobertura de los dos modales).

### A.3 Que es "la seccion NC-info del lado derecho" en cada uno

- **Admin**: TODO el contenido dentro del `<dialog>` de `CrearNcrModal`, ya que el modal es de una sola columna (no hay "lado izquierdo") — el "lado derecho" conceptual del pedido del usuario corresponde 1:1 al body completo de `crear-ncr-modal.tsx:269-441`.
- **POS**: literalmente la columna derecha `data-testid="nc-pos-columna-detalle"` (`nota-credito-pos-modal.tsx:532-724`), en contraste con la columna izquierda `data-testid="nc-pos-columna-lista"` (`nota-credito-pos-modal.tsx:446-530`) que NO tiene equivalente en absoluto en el modal admin (admin recibe la factura ya elegida por prop, `crear-ncr-modal.tsx:37`).

## B. Logica condicional / disclosure (zona de MAYOR riesgo)

Tabla de TODO el disclosure logic mapeado, con el estado que lo dispara y el archivo:linea exacto:

| Disclosure | Admin (file:line) | POS (file:line) | Estado que lo dispara |
|---|---|---|---|
| Reveal-gate general de la seccion NC | Ninguno — siempre visible tras `puedeEmitirNc` | `ncSectionRevealed` (`nota-credito-pos-modal.tsx:189,561`) — oculta TODO hasta boton "Emitir nota de credito" en el footer (`:763`) | Boton dedicado, `false` por default, resetea en 3 puntos (cierre modal `:227`, seleccion de factura `:503`, "Volver" `:741`) |
| Tipo de NC (Total/Parcial) preseleccion | `tipoNc` arranca en `null` (`:93`), SIN default — comentario explicito en `:71-81` explica el bug que esto corrige | `tipoNc` arranca en `null` (`:161`), mismo criterio ("ningun tipo se preselecciona ni siquiera con reverso parcial previo", comentario `:156-160`) | Botones "Total"/"Parcial" |
| Boton "Total" oculto si ya no es opcion valida | `puedeTotal && (...)` (`crear-ncr-modal.tsx:306`) | `puedeTotal && (...)` (`nota-credito-pos-modal.tsx:568`) — **markup IDENTICO**, duplicado byte-a-byte | `puedeElegirTipoTotal(lineas, reversos)` (`notas-credito-ui.ts:300-306`) — funcion PURA COMPARTIDA |
| Auto-downgrade Total→Parcial si deja de ser valido | `useEffect` (`crear-ncr-modal.tsx:138-140`): `if (!puedeTotal && tipoNc==='TOTAL') setTipoNc('PARCIAL')` | **NO EXISTE** en POS — si `puedeTotal` se vuelve `false` con `tipoNc==='TOTAL'` ya elegido, el boton "Total" simplemente desaparece de la UI pero `tipoNc` NO se reasigna (posible gap de UX en POS, no arreglado por este change; documentar y NO corregir a menos que se decida en Design) | `puedeTotal` |
| "Parcial" revela `SeleccionLineasNc` | `tipoNc === 'PARCIAL' && origenReverso` (`crear-ncr-modal.tsx:395`) — **requiere AMBOS** tipoNc Y origenReverso | `tipoNc === 'PARCIAL'` (`nota-credito-pos-modal.tsx:667`) — **solo requiere tipoNc** (POS no tiene concepto de `origenReverso`, tiene `modalidad` con default `'EFECTIVO_REAL'` ya seteado desde el montaje, `:148`) | `tipoNc` (+`origenReverso` solo en admin) |
| "Origen del reverso" (Devolver dinero / Credito a favor) | Selector propio, botones (`crear-ncr-modal.tsx:343-367`), arranca en `null` (`:94`) | **NO EXISTE** — reemplazado conceptualmente por "Modalidad de liquidacion" (select de 4 opciones) | Exclusivo de admin |
| "Devolver dinero" revela `RefundTesoreriaForm` | `tipoNc === 'TOTAL' && origenReverso === 'DEVOLVER_DINERO'` (`crear-ncr-modal.tsx:407`) — **SOLO para tipo TOTAL**, PARCIAL+Devolver-dinero cae en `AJUSTE_CXC` sin UI que lo alcance (comentario explicito `:216-224`) | **NO EXISTE en absoluto** — POS nunca ofrece `RefundTesoreriaForm` ni la modalidad `REFUND_TESORERIA` (excluida a proposito de `MODALIDADES_POS`, `nota-credito-pos-modal.tsx:59-64` y comentario `:55-58`) | Exclusivo de admin |
| "Credito a favor" revela warning irreversible + boton "Confirmar Anulacion" en el FOOTER del modal | `tipoNc === 'TOTAL' && origenReverso === 'CREDITO_A_FAVOR'` (`crear-ncr-modal.tsx:427`), boton en footer `:454-462` | El warning+boton equivalente para TOTAL vive DENTRO de la seccion (no en el footer del modal) — `tipoNc === 'TOTAL'` (`nota-credito-pos-modal.tsx:686-712`), SIN distincion de "origen" porque no existe ese concepto en POS | `tipoNc==='TOTAL'` (+`origenReverso==='CREDITO_A_FAVOR'` solo en admin) |
| Campo "Motivo" — posicion condicional | Se muestra DEBAJO de "Origen del reverso" en TODOS los flujos MENOS TOTAL+DevolverDinero (`crear-ncr-modal.tsx:376`); en ese caso especial se intercala DENTRO de `RefundTesoreriaForm` via `motivoSlot` (`:414-425`, `RefundTesoreriaForm.motivoSlot` prop, `refund-tesoreria-form.tsx:84-90,317`) | Se muestra SIEMPRE en la MISMA posicion fija, sin slot ni condicional (`nota-credito-pos-modal.tsx:656-665`) | `tipoNc`+`origenReverso` combinados, solo en admin |
| "Modalidad de liquidacion" (select 4 opciones) | **NO EXISTE** — reemplazada por "Origen del reverso" (2 botones, semantica distinta) | Select con `MODALIDADES_POS` (`nota-credito-pos-modal.tsx:59-64,598-616`): `EFECTIVO_REAL`/`SALDO_FAVOR`/`AJUSTE_CXC`/`COMPENSACION_VENTA`. Default `'EFECTIVO_REAL'` (`:148`). Warning ambar cuando `EFECTIVO_REAL` esta elegida — "afecta el cuadre de la sesion activa" (`:611-615`) | Exclusivo de POS. Alimenta directo `modalidad` en `crearNotaCredito` (`:334`) — el motor decide `aplicaReglaDeOro` (egreso real de caja) SOLO cuando `entryPoint==='POS' && modalidad==='EFECTIVO_REAL' && sesionCajaActivaId && venta.sesion_caja_id===sesionCajaActivaId` (`use-notas-credito.ts:737-741`) |
| Deposito de reingreso — libre vs gateado por PIN | Selector SIEMPRE desbloqueado, sin PIN (`crear-ncr-modal.tsx:281-297`) — comentario explicito: la ruta ya esta protegida por `SALES_VOID` a nivel de acceso, pedir PIN encima seria "friccion redundante" (`:278-280`, `:64` del docblock) | Selector BLOQUEADO por default ("Automatico (riel de deposito principal)" + boton "Cambiar deposito" que exige PIN B, `nota-credito-pos-modal.tsx:622-634`); solo tras `pinDepositoAutorizado` se muestra el `<NativeSelect>` real (`:636-648`) | `pinDepositoAutorizado` (solo POS) |
| Emision de la NC (accion final) — PIN | SIN PIN (mismo argumento de "ruta ya gateada") | PIN A: `hasPermission(PERMISSIONS.SALES_NOTA_CREDITO)` decide si emite directo o pide `SupervisorPinDialog` (`nota-credito-pos-modal.tsx:369-384,391-401`) | `hasPermission(PERMISSIONS.SALES_NOTA_CREDITO)` (solo POS) |

### B.1 "Modalidad de liquidacion" — que dispara y equivalente admin

`MODALIDADES_POS` (`nota-credito-pos-modal.tsx:59-64`) ofrece 4 valores (excluye deliberadamente `REFUND_TESORERIA`, reservado al modulo Tradicional segun comentario `:55-58`). El valor elegido alimenta directo `modalidad` en el payload de `crearNotaCredito` (`nota-credito-pos-modal.tsx:334`). Dentro del motor (`use-notas-credito.ts:737-741`), `EFECTIVO_REAL` es la UNICA modalidad POS que activa la "Regla de Oro": egreso real en `movimientos_metodo_cobro` que afecta el cuadre de la sesion de caja activa (`use-notas-credito.ts:1173-1217`).

El admin **NO tiene un select "Modalidad de liquidacion"** — su selector equivalente es "Origen del reverso" (2 botones), que mapea a solo 2 de las 5 `LiquidacionModalidad` posibles: `'CREDITO_A_FAVOR'` → `modalidad: 'SALDO_FAVOR'` (`crear-ncr-modal.tsx:225`) y `'DEVOLVER_DINERO'` (TOTAL) → `modalidad: 'REFUND_TESORERIA'` (`crear-ncr-modal.tsx:189`). El admin NUNCA ofrece `EFECTIVO_REAL`, `AJUSTE_CXC` (solo como fallback de tipo no cubierto, comentario `:216-224`) ni `COMPENSACION_VENTA` como opciones EXPLICITAS de UI — ninguna vincula sesion de caja activa (el admin nunca pasa `entryPoint: 'POS'`, siempre `'TRADICIONAL'`, `crear-ncr-modal.tsx:188,215`).

## C. Comparacion Shared vs Different (nucleo del analisis)

### C.1 Tabla de sub-secciones — presente en POS / Admin / ambos

| Sub-seccion | POS | Admin | Comportamiento |
|---|---|---|---|
| Panel de detalle fiscal (`FacturaDetallePanel`) | Si (`hideFacturaTitle`) | Si (default) | **YA COMPARTIDO** — mismo componente, prop `hideFacturaTitle` (`factura-detalle-panel.tsx:46-53`) parametriza la unica diferencia |
| Historial de reversos (dentro de `FacturaDetallePanel`) | Si (`agruparReversosPorNc`) | Si (`agruparReversosPorNc`) | **YA COMPARTIDO** — misma funcion pura (`notas-credito-ui.ts:486-505`) |
| Badge de reverso (TOTAL/PARCIAL) en el panel | Si (`badgesPorVenta[facturaId]`, via `useBadgesReversoSesion`) | Si (`badgeReverso` local, via `puedeEmitirNcAdicional`/`puedeElegirTipoTotal` sobre `useReversosFactura`) | **Fuente distinta pero MISMA formula pura** (`calcularEstadoReversoLineas`) |
| Gate "ya reversada totalmente" | Si (`!puedeEmitirNc`, `:549-559`) | Si (`!puedeEmitirNc`, `:272-275`) | Markup casi identico, mismo texto literal, NO extraido a componente |
| Tipo de NC (Total/Parcial) | Si | Si | **Markup duplicado byte-a-byte** (misma estructura de botones, misma logica de `puedeTotal`) |
| Origen del reverso / Modalidad de liquidacion | Modalidad (select 4 op.) | Origen (2 botones) | **CONCEPTOS DISTINTOS, UI distinta, semantica parcialmente solapada** (ver B.1) |
| Deposito de reingreso de stock | Si, gateado por PIN B | Si, libre | **Mismo campo, gating radicalmente distinto** |
| Motivo de anulacion | Si, posicion fija | Si, posicion condicional (slot) | Mismo campo `<input>`, JSX casi identico, posicion distinta |
| `SeleccionLineasNc` (PARCIAL) | Si (+ prop `depositoInvalido`) | Si (sin esa prop) | **YA COMPARTIDO** — mismo componente (`seleccion-lineas-nc.tsx`), la unica diferencia es que POS pasa `depositoInvalido` para su gate de PIN B |
| `RefundTesoreriaForm` (Devolver dinero) | **NO EXISTE** | Si (TOTAL + Devolver dinero) | Exclusivo de admin — engine YA soporta ambos flujos, solo la UI de admin lo expone |
| Warning "accion irreversible" + boton confirmar | Si (dentro de la seccion, con boton dedicado) | Si (warning dentro de la seccion, boton en el FOOTER del modal) | Mismo texto/estructura visual, distinta UBICACION del boton de confirmar |
| PIN A (emitir sin permiso) | Si | **NO** (ruta ya gateada por `SALES_VOID`) | Exclusivo de POS |
| PIN B (cambiar deposito) | Si | **NO** (deposito siempre libre) | Exclusivo de POS |
| Lista de facturas (columna izquierda) | Si, escopeada a sesion activa | **NO** (factura llega por prop) | Exclusivo de POS — no es parte de la "seccion NC-info", es la seleccion previa |
| Reveal-gate de toda la seccion NC | Si (`ncSectionRevealed`) | **NO** (siempre visible) | Exclusivo de POS |
| Boton "Reimprimir" / `ConsultaFacturaModal` | Si | **NO** | Exclusivo de POS |
| "Editar metodos de pago" (placeholder) | Si | **NO** | Exclusivo de POS |

### C.2 Ya compartido vs duplicado — resumen ejecutivo

**YA EFECTIVAMENTE UNIFICADO** (el motor y varias piezas de UI puras/presentacionales YA son compartidas, sin flag POS/ADMIN):
- El escritor atomico `crearNotaCredito` (`use-notas-credito.ts:665-1469`) — UN SOLO camino de escritura para POS y admin, parametrizado por `entryPoint`/`modalidad`/`tipo`/`egresoParams`/`depositoReingresoId`.
- `FacturaDetallePanel` (componente de presentacion completo, incluye watermark, tabla de lineas, totales, pagos, evolucion/reversos) — parametrizado solo por `hideFacturaTitle`.
- `SeleccionLineasNc` (flujo PARCIAL completo: stepper por linea, validacion, preview de montos) — parametrizado solo por `depositoInvalido`.
- Todas las funciones puras de gating/calculo: `puedeEmitirNcAdicional`, `puedeElegirTipoTotal`, `calcularReversoPorLinea`, `agruparReversosPorNc`, `resolverBadgesFactura`, `calcularBadgesReversoPorVenta`, `derivarLineasNcParcial`, `previewMontoBsNc` (todas en `notas-credito-ui.ts`, cero duplicacion).
- `RefundTesoreriaForm` (`refund-tesoreria-form.tsx`, 628 lineas) — ya diseñado explicitamente como sub-formulario AISLADO reusable (comentario `:29-36`), con `motivoSlot` como punto de extension para intercalar contenido del llamador SIN acoplarse a Notas de Credito.
- Mapeo `toTipoImpuestoLinea` — duplicado literal en ambos archivos (`crear-ncr-modal.tsx:30-32`, `nota-credito-pos-modal.tsx:43-45`), trivial, candidato obvio a extraer.
- `buildReciboDataDesdeFacturaGuardada` — misma funcion, mismo mapeo (Design §Decision 5, comentarios cruzados en ambos archivos).

**DUPLICADO** (dos implementaciones JSX del mismo concepto visual, sin componente compartido):
- Bloque "Tipo de NC" (Total/Parcial): botones con clases Tailwind IDENTICAS en `crear-ncr-modal.tsx:303-334` y `nota-credito-pos-modal.tsx:563-596`.
- Bloque "Deposito de reingreso de stock": mismo titulo/label, pero estructura interna DIFERENTE (admin siempre `<NativeSelect>`; POS condicional "Automatico" vs `<NativeSelect>` tras PIN B).
- Campo "Motivo de anulacion": `<input>` con las mismas clases Tailwind, en ambos archivos, sin extraer.
- Warning "Esta accion es irreversible": mismo texto/estructura visual (icono `Warning`, fondo rojo), en ambos archivos, sin extraer.
- Gate "ya reversada totalmente": mismo texto literal, en ambos archivos.

## D. Write path y schemas

### D.1 `crearNotaCredito` ya soporta ambos entry points

`CrearNotaCreditoParams` (`use-notas-credito.ts:200-256`) YA expone exactamente los parametros de discriminacion que separan POS de admin:

```ts
entryPoint: 'POS' | 'TRADICIONAL'          // use-notas-credito.ts:212
sesionCajaActivaId?: string                // use-notas-credito.ts:214 — solo relevante si entryPoint==='POS'
modalidad: LiquidacionModalidad            // use-notas-credito.ts:216
egresoParams?: EgresoParams                // use-notas-credito.ts:225 — solo consumido por REFUND_TESORERIA
tipo?: 'TOTAL' | 'PARCIAL'                 // use-notas-credito.ts:232
lineas?: LineaNcSeleccionada[]             // use-notas-credito.ts:240
depositoReingresoId?: string               // use-notas-credito.ts:255
```

Dentro de la transaccion, la unica rama de comportamiento real condicionada por `entryPoint` es la "Regla de Oro" (`sesionCajaIdParaNc`, `use-notas-credito.ts:720`; `aplicaReglaDeOro`, `:737-741`) — TODO lo demas (validacion de lineas, desglose fiscal, reingreso de stock, generacion de asientos) es CIEGO a `entryPoint`. Esto confirma: **el motor esta unificado desde antes de este change** — la duplicacion vive EXCLUSIVAMENTE en la capa de UI (JSX de los dos modales), no en la logica de negocio ni en el schema de datos.

Llamadas reales:
- Admin, TOTAL/PARCIAL sin refund: `crear-ncr-modal.tsx:183-193` (`emitirNcRefund`, modalidad `REFUND_TESORERIA`) y `crear-ncr-modal.tsx:207-229` (`emitirNc`, modalidad `SALDO_FAVOR`/`AJUSTE_CXC`) — SIEMPRE `entryPoint: 'TRADICIONAL'`, NUNCA pasa `sesionCajaActivaId`.
- POS: `nota-credito-pos-modal.tsx:321-367` (`emitirNc`) — SIEMPRE `entryPoint: 'POS'`, SIEMPRE `sesionCajaActivaId: sesion.id`, `modalidad` viene del select `MODALIDADES_POS`.

### D.2 Schemas — no hay Zod dedicado, tipos TS compartidos

No existe un schema Zod para el payload de NC en ninguno de los dos modales (confirmado por ausencia de import de `zod` en `crear-ncr-modal.tsx`, `nota-credito-pos-modal.tsx`, `use-notas-credito.ts`) — la validacion vive en funciones puras TS (`derivarLineasNcParcial`, `assertGateAntiFraudeNoDesembolso`, guards inline dentro de la transaccion). Los TIPOS SI son compartidos: `CrearNotaCreditoParams`, `FacturaParaAnular`, `LineaNcSeleccionada`, `EgresoTesoreriaLinea`, `LiquidacionModalidad` — todos exportados desde `use-notas-credito.ts` e importados sin modificacion en ambos modales.

## E. Factibilidad de unificacion y riesgos

### E.1 Propuesta de alto nivel (NO es diseño detallado — solo la forma)

Un componente `NcInfoSection` parametrizado recibiria props del estilo:

```ts
interface NcInfoSectionProps {
  entryPoint: 'POS' | 'TRADICIONAL'
  factura: FacturaParaAnular
  puedeEmitirNc: boolean
  puedeTotal: boolean
  tipoNc: 'TOTAL' | 'PARCIAL' | null
  onTipoNcChange: (tipo: 'TOTAL' | 'PARCIAL') => void
  // POS-only:
  modalidad?: LiquidacionModalidad
  onModalidadChange?: (m: LiquidacionModalidad) => void
  sesionActiva?: SesionCaja
  // Admin-only:
  origenReverso?: OrigenReverso | null
  onOrigenReversoChange?: (o: OrigenReverso) => void
  // Deposito, con gating distinto por entryPoint:
  depositoElegidoId: string | null
  onDepositoChange: (id: string | null) => void
  depositoGateado?: boolean          // true en POS sin PIN B autorizado
  onSolicitarPinDeposito?: () => void
  // Motivo, con posicion condicional (via slot pattern, YA existe precedente en RefundTesoreriaForm.motivoSlot)
  motivo: string
  onMotivoChange: (m: string) => void
  motivoPosicion?: 'inline' | 'slot'
  // Callbacks de accion
  onConfirmarTotal: () => void
  onConfirmarParcial: (lineas: LineaNcSeleccionada[]) => void
  onConfirmarRefund?: (lineas: EgresoTesoreriaLinea[]) => void  // solo admin
  loading: boolean
}
```

El precedente de `motivoSlot` en `RefundTesoreriaForm` (`refund-tesoreria-form.tsx:84-90`) demuestra que el patron "slot de composicion" YA es aceptado en esta base de codigo para resolver exactamente este tipo de divergencia posicional sin acoplar el componente compartido al dominio del llamador.

### E.2 Riesgos concretos de unificar

1. **Forma de estado incompatible entre POS y admin**: POS usa `modalidad: LiquidacionModalidad` (un solo select); admin usa `origenReverso: 'DEVOLVER_DINERO' | 'CREDITO_A_FAVOR'` (2 botones) que INTERNAMENTE se traduce a `modalidad` distinta segun `tipoNc` (`crear-ncr-modal.tsx:225`, ver B.1). Unificar el estado sin preservar esta traduccion asimetrica podria reintroducir el bug que el comentario `:71-81` de `crear-ncr-modal.tsx` describe explicitamente como YA CORREGIDO (emision con `modalidad` nunca elegida por el usuario).
2. **"Modalidad de liquidacion" es exclusivamente POS**: si el componente compartido expone un select generico de modalidad, hay que impedir por diseño que `REFUND_TESORERIA` aparezca como opcion en POS (exclusion deliberada, `nota-credito-pos-modal.tsx:55-58`) y que `EFECTIVO_REAL`/`COMPENSACION_VENTA` aparezcan como opciones explicitas en admin (nunca se ofrecieron ahi).
3. **`RefundTesoreriaForm` es admin-only HOY**: es la seccion de mayor complejidad (628 lineas, cuentas de tesoreria + sesiones activas + gate de saldo a favor con `AlertDialog`). Antes de unificar la seccion "NC-info" hay que decidir explicitamente si POS ALGUNA VEZ debe ofrecer refund a tesoreria (fuera de alcance segun el diseño actual, comentario `nota-credito-pos-modal.tsx:55-58`) — si la respuesta es "no", el componente unificado debe soportar OMITIR esta sub-seccion enteramente para `entryPoint==='POS'`, no solo ocultarla condicionalmente.
4. **Gating de PIN es estructuralmente distinto, no solo visual**: el deposito de reingreso en POS tiene un ESTADO INTERMEDIO (`pinDepositoAutorizado`) que no existe en admin. Forzar un componente unico con una prop booleana simple (`depositoGateado`) es viable, pero el flujo de apertura del `SupervisorPinDialog` (`nota-credito-pos-modal.tsx:816-823`) vive FUERA del `<dialog>` principal y depende de estado (`showPinDeposito`) que hoy es privado del modal POS — habria que decidir si ese dialog tambien se extrae o si se deja como responsabilidad del llamador (probablemente lo segundo, via callback `onSolicitarPinDeposito`).
5. **Posicion del boton de confirmacion difiere**: admin lo pone en el FOOTER del `<dialog>` (`crear-ncr-modal.tsx:454-462`), POS lo pone DENTRO de la seccion (`nota-credito-pos-modal.tsx:704-711`). Si el componente compartido incluye el boton, hay que decidir un slot/posicion unica o parametrizar donde se renderiza — riesgo de romper el layout visual de alguno de los dos modales si se fuerza una sola posicion.
6. **`emisionGen`/remount-key en POS**: el modal POS usa un contador `emisionGen` (`nota-credito-pos-modal.tsx:170-179,675`) para forzar remount de `SeleccionLineasNc` tras cada emision exitosa y evitar doble-submit — el modal admin SIEMPRE cierra tras emitir (`crear-ncr-modal.tsx:195,231`, `onClose()`) por lo que nunca necesito este patron. Si el componente unificado se monta para AMBOS casos, debe soportar el ciclo de vida "permanece abierto, refresca en vivo" (POS) Y "cierra inmediatamente" (admin) sin que uno rompa al otro.
7. **Responsividad movil solo probada en POS**: el `<dialog>` de POS tiene clases explicitas mobile-first (`w-screen h-dvh ... md:w-full md:max-w-4xl`, `nota-credito-pos-modal.tsx:429`) y un layout de 2 columnas que colapsa a 1 en mobile (`:445-448`, `:532-534`). El admin es fijo `max-w-2xl` sin ese tratamiento (`crear-ncr-modal.tsx:244`) — la seccion compartida NO puede asumir el ancho de contenedor de ninguno de los dos sin verificar en ambos contextos.
8. **Cobertura de tests desigual**: POS tiene 1516 lineas de test (`nota-credito-pos-modal.test.tsx`), admin solo 438 (`crear-ncr-modal.test.tsx`), `RefundTesoreriaForm` tiene su propia suite de 721 lineas (`refund-tesoreria-form.test.tsx`). Cualquier extraccion de componente compartido DEBE, como minimo, migrar los tests de comportamiento COMPARTIDO (Tipo de NC, gate "reversada totalmente", Motivo) a un test del componente extraido, y dejar en cada modal SOLO los tests de su logica especifica (Modalidad/PIN en POS; Origen del reverso/RefundTesoreriaForm en admin) — riesgo real de perder cobertura si se borra codigo sin portar sus tests primero.
9. **Ambos modales estan marcados "FROZEN" en comentarios existentes**: `factura-detalle-panel.tsx:186-188` dice explicitamente "2 modales de NC FROZEN (`nota-credito-pos-modal.tsx`, `crear-ncr-modal.tsx`) nunca pasan `evolucion`" — sugiere que ya hubo una decision deliberada de NO tocar/generalizar estos archivos en changes previos (`notas-credito-ui-pos`, `nc-refund-tesoreria`). El nuevo change debe justificar por que ahora si se justifica tocarlos, y coordinar con cualquier trabajo futuro que dependa de que sigan "congelados" byte-a-byte (p.ej. Consulta/Reimprimir, que SI usa `evolucion`).

### E.3 Estrategia de slicing recomendada (excede el budget de 400 lineas)

Dado el tamaño de los archivos involucrados (468 + 840 + 628 + tests ⇒ >3000 lineas totales solo en los archivos "NC-info"), la unificacion completa en una sola PR es inviable bajo el budget de revision. Slices logicos sugeridos, cada uno con inicio/fin claro y verificable de forma independiente:

1. **Slice 0 (prep, sin riesgo funcional)**: extraer las piezas 100% identicas sin ninguna logica condicional cross-modal — `toTipoImpuestoLinea` (duplicado trivial) y el bloque "ya reversada totalmente" (mismo texto literal) a un componente/util compartido. Cero cambio de comportamiento, tests existentes deben seguir pasando sin tocarlos.
2. **Slice 1**: extraer el bloque "Tipo de NC" (Total/Parcial) a un componente presentacional puro (`TipoNcSelector`), con props `puedeTotal`/`tipoNc`/`onChange` — es el UNICO bloque 100% identico en JSX/logica entre ambos modales hoy. Migrar los tests correspondientes de ambas suites a la suite del nuevo componente.
3. **Slice 2**: extraer el campo "Motivo de anulacion" a un componente compartido que soporte el patron slot YA validado (`RefundTesoreriaForm.motivoSlot`) para la posicion condicional del admin.
4. **Slice 3 (mayor riesgo, requiere Design explicito)**: unificar "Origen del reverso" (admin) y "Modalidad de liquidacion" (POS) bajo un modelo de datos comun, preservando la traduccion asimetrica de `modalidad` documentada en B.1 — este slice es donde vive el riesgo #1/#2 de arriba y probablemente merece su propio proposal/design antes de tocar codigo.
5. **Slice 4 (mayor riesgo)**: unificar el gating de "Deposito de reingreso" (libre en admin vs PIN B en POS) bajo una prop de gating generica, sin migrar el `SupervisorPinDialog` fuera del modal que lo posee hoy.
6. **Slice 5 (opcional, evaluar ultimo)**: unificar el warning irreversible + boton de confirmacion final, decidiendo una posicion unica (footer vs inline) — el de mayor impacto visual, candidato a validar con el usuario antes de construir.

Cada slice preserva el comportamiento de AMBOS modales verificado por sus tests existentes (mas los tests migrados/nuevos del componente extraido) antes de avanzar al siguiente.

## Ready for Proposal

**Si.** El engine (`crearNotaCredito`) ya esta completamente unificado y parametrizado — el trabajo de unificacion es puramente de capa UI, con limites claros de riesgo ya identificados (E.2) y una estrategia de slicing concreta (E.3). Recomiendo que `sdd-propose` arranque acotando el ALCANCE al Slice 1 (Tipo de NC) como primer entregable, dejando Slices 3/4 (Modalidad/Origen y gating de deposito) para un proposal separado dado su riesgo mas alto y la necesidad de una decision de producto explicita sobre si POS debe ganar `REFUND_TESORERIA` o si admin debe ganar `EFECTIVO_REAL`/`COMPENSACION_VENTA` como opciones de UI (fuera del alcance de una simple extraccion de componente).
