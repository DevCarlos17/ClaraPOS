# Spec: cxc-cxp-boton-importar-saldos

## Requirement: Boton "Importar Saldos" usa la variante visual primaria

El boton "Importar Saldos" SHALL usar la variante primaria/azul (`bg-primary`,
equivalente a `variant="default"` de `src/components/ui/button.tsx`) en la
pantalla de Cuentas por Cobrar y en la pantalla de Cuentas por Pagar. El
boton NO SHALL usar `variant="outline"`.

El cambio SHALL ser puramente visual: icono (`UploadSimple`), texto
("Importar Saldos") y `onClick` (abre `ImportarCxcModal`/`ImportarCxpModal`)
SHALL permanecer sin cambios.

### Scenario: Boton en Cuentas por Cobrar es primario/azul

- **GIVEN** un usuario Propietario (`isOwner === true`) en la pantalla
  `/clientes/cuentas-por-cobrar`
- **WHEN** la pagina renderiza el `PageHeader`
- **THEN** el boton "Importar Saldos" SHALL exponer `data-variant="default"`
  (no `"outline"`)
- **AND** al hacer click SHALL invocar `setModalImportarAbierto(true)`
  (abre `ImportarCxcModal`)

### Scenario: Boton en Cuentas por Pagar es primario/azul

- **GIVEN** un usuario Propietario (`isOwner === true`) en la pantalla
  `/compras/cxp`
- **WHEN** la pagina renderiza el `PageHeader`
- **THEN** el boton "Importar Saldos" SHALL exponer `data-variant="default"`
  (no `"outline"`)
- **AND** al hacer click SHALL invocar `setModalImportarAbierto(true)`
  (abre `ImportarCxpModal`)

### Scenario: Boton no visible para no-Propietario (comportamiento preexistente, sin cambio)

- **GIVEN** un usuario con `isOwner === false`
- **WHEN** la pagina renderiza en cualquiera de las dos pantallas
- **THEN** el boton "Importar Saldos" NO SHALL renderizarse (comportamiento
  ya existente, este cambio no lo modifica)
