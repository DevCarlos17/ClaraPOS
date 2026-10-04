# Departamento Código Specification

## Purpose

Asignación de `departamentos.codigo` movida del cliente (MAX+1 sobre SQLite local, causa de colisiones `23505` descartadas en silencio por PowerSync) al servidor, vía trigger `BEFORE INSERT` con gap-fill + advisory lock, replicando el patrón de `assign_codigo_producto` (`migrations/0099`). Sin columna `codigo_status` nueva: sentinel `codigo = ''` para "pendiente". No cubre visibilidad general de errores de sync ("Problema B").

## Requirements

### Requirement: Asignación Server-Side por Gap-Fill
El sistema MUST asignar `codigo` vía trigger `BEFORE INSERT ON departamentos`: primer entero ≥1 libre por `empresa_id`, calculado con gap-fill (no `MAX+1` simple). El cálculo MUST ser atómico bajo concurrencia vía `pg_advisory_xact_lock` con namespace propio (`hashtext(empresa_id || ':departamento')`), independiente del namespace de `productos`.

#### Scenario: SC-1 — Sin códigos previos
- GIVEN empresa sin departamentos con código entero, WHEN se inserta un departamento con `codigo=''`, THEN el servidor asigna `codigo='1'`.

#### Scenario: SC-2 — Huecos existentes
- GIVEN códigos enteros `{1,2,5}` para la empresa, WHEN se inserta un nuevo departamento, THEN el servidor asigna `3` (primer hueco), no `6`.

#### Scenario: SC-3 — Inserts concurrentes misma empresa
- GIVEN dos INSERTs casi simultáneos de departamentos de la misma empresa, WHEN ambos triggers calculan gap-fill en paralelo, THEN cada uno recibe un código distinto y consecutivo, sin violar `uq_departamentos_empresa_codigo`. *(Manual: staging/concurrencia)*

#### Scenario: SC-4 — Aislamiento multi-tenant
- GIVEN empresa A y empresa B sin departamentos previos, WHEN cada una inserta un departamento nuevo, THEN ambas reciben independientemente `codigo='1'` sin colisión entre sí.

### Requirement: Exclusión de Códigos Legacy Alfanuméricos
El cálculo de gap-fill MUST ignorar códigos que no sean puramente numéricos (filtro `codigo ~ '^\d+$'`). Códigos legacy alfanuméricos (`FAC`, `COR`, `CAP`) MUST seguir existiendo sin conflicto y MUST NOT participar del cálculo del siguiente entero libre.

#### Scenario: SC-5 — Convivencia con códigos legacy
- GIVEN departamentos existentes con códigos `FAC`, `COR`, `CAP` y ninguno entero, WHEN se inserta un departamento nuevo con `codigo=''`, THEN el servidor asigna `codigo='1'`, y los códigos legacy permanecen intactos.

### Requirement: No Colisión con Constraint Único
Un INSERT de `departamentos` con `codigo=''` MUST NOT ser rechazado por Postgres con `23505` sobre `uq_departamentos_empresa_codigo`, y por lo tanto PowerSync MUST NOT descartar la operación de upload como FATAL.

#### Scenario: SC-6 — Upload exitoso vía PowerSync
- GIVEN un departamento insertado localmente con `codigo=''`, WHEN PowerSync sube el INSERT a Postgres, THEN el trigger asigna un código válido antes del commit y la operación se confirma sin error `23505`.

### Requirement: Cliente No Calcula el Código
El cliente MUST NOT calcular ni enviar un `codigo` adivinado al crear un departamento. El INSERT local MUST enviar `codigo=''` como sentinel de pendiente.

#### Scenario: SC-7 — Creación offline-first
- GIVEN el dispositivo sin conexión, WHEN el usuario guarda un nuevo departamento, THEN el INSERT local se confirma instantáneamente con `codigo=''`, sin intentar adivinar un número.

#### Scenario: SC-8 — Sync completa la asignación
- GIVEN un departamento local pendiente (`codigo=''`) aún no sincronizado, WHEN la sincronización sube el INSERT y el trigger asigna el código, THEN el departamento recibe el código final vía el download path de PowerSync, reemplazando el sentinel local. *(Manual: e2e offline→online)*

### Requirement: Estado Pendiente en el Formulario
`departamento-form.tsx` MUST NOT pre-rellenar el input `codigo` con un valor calculado client-side. MUST mostrar un estado "PENDIENTE (asignado por el servidor)" en su lugar, consistente con el patrón ya usado en `producto-form.tsx`.

#### Scenario: SC-9 — Apertura de formulario nuevo departamento
- GIVEN el usuario abre el formulario de "Nuevo Departamento", WHEN el formulario renderiza, THEN el campo código es de solo lectura y muestra "PENDIENTE (asignado por el servidor)" en vez de un número precalculado.

### Requirement: Inmutabilidad de Código Preservada
El trigger `BEFORE INSERT` que reescribe `NEW.codigo` MUST NOT disparar ni debilitar el trigger existente `validate_departamento_update()` (`BEFORE UPDATE`). Una vez asignado por el servidor, `departamentos.codigo` MUST permanecer inmutable (regla de negocio #5).

#### Scenario: SC-10 — Asignación inicial no es un UPDATE
- GIVEN un INSERT nuevo de departamento sin fila previa, WHEN el trigger `BEFORE INSERT` reescribe `NEW.codigo`, THEN no se dispara `validate_departamento_update()` porque no existe una fila a actualizar.

#### Scenario: SC-11 — Intento de editar código asignado
- GIVEN un departamento con código ya asignado por el servidor, WHEN se intenta un `UPDATE ... SET codigo = ?`, THEN `validate_departamento_update()` revierte el cambio con `RAISE EXCEPTION`, igual que antes de este cambio.

### Requirement: Remediación de Huérfanos es Operativa, No Automática
La resolución de registros huérfanos existentes (departamento y producto descartados previamente por `23505`/`23503`) MUST ser una instrucción operativa post-deploy para que el usuario los recree manualmente. El sistema MUST NOT incluir tooling automático de reparación para este caso.

#### Scenario: SC-12 — Recreación manual post-deploy
- GIVEN el departamento huérfano `7cac7b70-590f-4255-91d6-d91aedb1022e` y su producto asociado, visibles solo en SQLite local tras el deploy del fix, WHEN el usuario los identifica, THEN los recrea manualmente (nuevo departamento + producto); no existe migración ni script que los repare automáticamente.
