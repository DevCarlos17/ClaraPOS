# Producto Numeración Specification

## Purpose

Numeración de código de producto por empresa: `libre` (texto libre, default) vs `correlativo` (asignación server-side, gap-fill desde 1). Cubre config por tenant, formulario, PENDIENTE offline, exclusión operativa de PENDIENTE y concurrencia del gap-fill.

## Requirements

### Requirement: Modo de Numeración por Empresa
El sistema MUST exponer `inventario.numeracion_modo` (`'libre' | 'correlativo'`) en `empresas.config`, default `'libre'`. El cambio de modo MUST ser seguro en cualquier momento, sin migrar códigos existentes.

#### Scenario: SC-C3 — Cambio de modo mid-operación
- GIVEN empresa `libre` con códigos enteros y mixtos, WHEN cambia a `correlativo`, THEN asigna el primer entero libre sobre los existentes; códigos previos intactos. *(Automatizable: DB)*

### Requirement: Asignación Server-Side por Gap-Fill
En `correlativo`, el sistema MUST asignar código vía trigger `BEFORE INSERT`: primer entero ≥1 libre por `empresa_id`, ignorando códigos no enteros. El cliente MUST NOT enviar `codigo`. El cálculo MUST ser atómico bajo concurrencia (lock por empresa).

#### Scenario: SC-C1 — Sin códigos enteros previos
- GIVEN empresa sin códigos enteros, WHEN inserta producto en `correlativo`, THEN asigna código `1`.

#### Scenario: SC-C2 — Huecos existentes
- GIVEN códigos `{1,2,5,PRO-1}`, WHEN se insertan tres productos sucesivos, THEN se asignan `3`, `4`, `6`, ignorando `PRO-1`.

#### Scenario: SC-C4 — Solo códigos mixtos
- GIVEN códigos únicamente `PRO-1`, `DEP-5`, WHEN inserta producto en `correlativo`, THEN asigna código `1`.

#### Scenario: SC-X1 — Inserts concurrentes
- GIVEN dos inserts simultáneos, misma empresa, WHEN ambos triggers calculan gap-fill en paralelo, THEN cada uno recibe código distinto, sin violar `UNIQUE(empresa_id, codigo)`. *(Manual: staging)*

#### Scenario: SC-X2 — Reintento idempotente del conector
- GIVEN insert confirmado con código asignado, WHEN PowerSync reintenta el upload, THEN no duplica fila ni asigna segundo código. *(Manual: offline)*

### Requirement: Comportamiento del Campo Código en Formulario
El formulario MUST adaptar el input `codigo` según el modo: editable en `libre`, solo-lectura en `correlativo`.

#### Scenario: SC-F1 — Modo libre
- GIVEN empresa `libre`, WHEN abre formulario de nuevo producto, THEN `codigo` editable; "Último código creado: X — nombre" muestra el más reciente (determinístico).

#### Scenario: SC-F2 — Modo correlativo
- GIVEN empresa `correlativo`, WHEN abre formulario de nuevo producto, THEN `codigo` solo-lectura mostrando "Siguiente código: PENDIENTE (asignado por el servidor)".

### Requirement: Estado PENDIENTE para Creación Offline
En `correlativo`, un producto creado sin conexión MUST persistir localmente en PENDIENTE sin código, transicionando solo al confirmar el round-trip de sync.

#### Scenario: SC-F3 — Creación offline
- GIVEN empresa `correlativo` sin conexión, WHEN usuario guarda producto, THEN guarda localmente en PENDIENTE con `codigo` vacío/nulo.

#### Scenario: SC-F4 — Sync completa la asignación
- GIVEN producto PENDIENTE sin sync, WHEN sync confirma insert y trigger asigna código, THEN producto pasa a código asignado y queda usable. *(Manual: e2e offline→online)*

### Requirement: Exclusión de PENDIENTE en Flujos Operativos
Un producto PENDIENTE MUST NOT aparecer en buscadores operativos (POS, recetas, ajustes) y MUST aparecer en inventario con indicador visual.

#### Scenario: SC-E1 — Búsqueda POS
- GIVEN producto PENDIENTE, WHEN buscado en POS, THEN no aparece en resultados.

#### Scenario: SC-E2 — Selector de recetas
- GIVEN producto PENDIENTE, WHEN abre selector de receta, THEN no aparece en la lista.

#### Scenario: SC-E3 — Selector de ajustes
- GIVEN producto PENDIENTE, WHEN abre picker de ajustes, THEN no aparece en la lista.

#### Scenario: SC-E4 — Listado de inventario
- GIVEN producto PENDIENTE, WHEN visualiza listado de inventario, THEN aparece con indicador visual PENDIENTE.

### Requirement: Determinismo de "Último Código Creado" en Modo Libre
El sistema MUST garantizar `created_at` único por fila incluso en import masivo, para que "Último código creado" sea determinística.

#### Scenario: SC-B1 — Import masivo
- GIVEN import de N>1 productos en `libre`, WHEN cada fila inserta con timestamp propio (`localNow()` dentro del loop), THEN "Último código creado" muestra el más reciente, sin empates. *(Automatizable: unit test)*
