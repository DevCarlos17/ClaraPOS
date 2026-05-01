# Plan: Estilo Elevado - ClaraPOS

## Contexto

Se aplicó un nuevo estilo visual al **Dashboard**:

- Background: `#f1f5f9` (slate-100, gris azulado suave) — definido en `src/index.css`
- Cards: `rounded-xl bg-card shadow-md p-X` (sin border, con sombra)
- KPI cards: icono con colores suaves (`bg-{color}-100 text-{color}-600`)

**Regla de conversion:**

```
ANTES: rounded-xl border bg-card p-X
AHORA: rounded-xl bg-card shadow-md p-X
```

Modales: el `shadow-md` va en el contenedor externo. Las secciones internas (divisores, `bg-muted`) se dejan como están.

---

## Pantallas a Adaptar

### Modulo: Ventas

| #   | Pantalla           | Archivos                                                                                                                                                                                  | Estado       |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | Notas de Credito   | `src/features/ventas/components/notas-credito-page.tsx` + `crear-ncr-modal.tsx`                                                                                                           | ✅ Listo |
| 2   | POS Terminal       | `src/features/ventas/components/pos-terminal.tsx` + `linea-items.tsx` + `cliente-selector.tsx` + `producto-buscador.tsx` + `facturas-espera-modal.tsx` + `nuevo-cliente-rapido-modal.tsx` | ⬜ Pendiente |
| 3   | Reportes de Ventas | `src/routes/_app/ventas/reportes.tsx`                                                                                                                                                     | ⬜ Pendiente |
| 4   | Cuadre de Caja     | `src/features/reportes/components/cuadre-page.tsx` + sub-componentes                                                                                                                      | ⬜ Pendiente |

---

## Flujo de Trabajo

1. Implementar una pantalla completa
2. **PAUSA** — usuario verifica en el navegador
3. Ajustar si es necesario, luego continuar con la siguiente

---

## Notas

- El estado `⬜ Pendiente` cambia a `✅ Listo` cuando el usuario aprueba
- Si hay ajustes menores post-aprobacion, anotarlos aqui
