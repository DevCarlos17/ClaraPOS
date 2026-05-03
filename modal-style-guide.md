# ClaraPOS — Modal Style Guide

Guía de referencia para el estilo de modales (dialogs) del sistema POS. Basada en el diseño iOS elevated card aplicado a `avance-modal.tsx` y `prestamo-modal.tsx`.

---

## 1. Elemento raíz `<dialog>`

```tsx
<dialog
  ref={dialogRef}
  onClose={onClose}
  onClick={handleBackdropClick}
  className="backdrop:bg-black/60 backdrop:backdrop-blur-sm rounded-2xl p-0 w-full max-w-md shadow-2xl m-auto border-0 outline-none"
>
```

| Propiedad                   | Valor                         | Motivo                                      |
| --------------------------- | ----------------------------- | ------------------------------------------- |
| `backdrop:bg-black/60`      | fondo semitransparente        | contraste sin bloquear contexto             |
| `backdrop:backdrop-blur-sm` | blur suave del fondo          | profundidad visual iOS                      |
| `rounded-2xl`               | bordes muy redondeados        | lenguaje visual de card elevada             |
| `p-0`                       | sin padding propio            | lo maneja el header y el body               |
| `shadow-2xl`                | sombra pronunciada            | sensación de elevación                      |
| `border-0 outline-none`     | sin borde/outline del browser | el `<dialog>` nativo los agrega por defecto |

**Cerrar al hacer click en el backdrop:**

```tsx
function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
  if (e.target === dialogRef.current) onClose();
}
```

---

## 2. Header iOS con color de acento

El header comunica visualmente la naturaleza de la acción mediante un color de acento.

```tsx
{
  /* Header — ocupa el ancho completo, con gradiente de color */
}
<div className="bg-gradient-to-br from-[COLOR]-500/15 to-[COLOR]-400/5 px-6 pt-5 pb-4 border-b">
  <div className="flex items-center gap-2.5">
    {/* Pill del ícono con fondo suave del mismo color */}
    <div className="p-2 rounded-xl bg-[COLOR]-500/15">
      <IconName size={18} className="text-[COLOR]-600" weight="fill" />
    </div>
    <div>
      <h2 className="text-base font-semibold leading-tight">
        Título del Modal
      </h2>
      <p className="text-xs text-muted-foreground mt-0.5">
        Subtítulo descriptivo breve
      </p>
    </div>
  </div>
</div>;
```

### Paleta de colores por tipo de modal

| Modal                 | Color base | Gradiente header                       | Pill fondo          | Ícono              | Botón submit                             |
| --------------------- | ---------- | -------------------------------------- | ------------------- | ------------------ | ---------------------------------------- |
| Avance de efectivo    | amber      | `from-amber-500/15 to-amber-400/5`     | `bg-amber-500/15`   | `text-amber-600`   | `bg-amber-500 hover:bg-amber-600`        |
| Préstamo              | purple     | `from-purple-500/15 to-purple-400/5`   | `bg-purple-500/15`  | `text-purple-600`  | `bg-purple-600 hover:bg-purple-700`      |
| Ingreso de efectivo   | emerald    | `from-emerald-500/15 to-emerald-400/5` | `bg-emerald-500/15` | `text-emerald-600` | `bg-emerald-600 hover:bg-emerald-700`    |
| Retiro de efectivo    | red        | `from-red-500/15 to-red-400/5`         | `bg-red-500/15`     | `text-red-600`     | `bg-red-600 hover:bg-red-700`            |
| Peligro / Anulación   | red        | `from-red-500/15 to-red-400/5`         | `bg-red-500/15`     | `text-red-600`     | `bg-destructive hover:bg-destructive/90` |
| Neutral / Información | blue       | `from-blue-500/15 to-blue-400/5`       | `bg-blue-500/15`    | `text-blue-600`    | (default primary)                        |

> Los íconos del header siempre usan `weight="fill"` para mayor presencia visual.

---

## 3. Cuerpo del modal

```tsx
<div className="p-5">{/* contenido del form */}</div>
```

Padding `p-5` (20px) da aire sin ser excesivo.

---

## 4. Secciones / grupos dentro del form

Para agrupar campos relacionados (ej. campos USD y Bs de un mismo concepto):

```tsx
<div className="rounded-xl border bg-muted/20 p-3 space-y-1">
  <label className="text-xs font-medium text-muted-foreground">Etiqueta</label>
  {/* input */}
</div>
```

Grid de dos columnas cuando los grupos son paralelos:

```tsx
<div className="grid grid-cols-2 gap-3">
  <div className="rounded-xl border bg-muted/20 p-3 space-y-1">...</div>
  <div className="rounded-xl border bg-muted/20 p-3 space-y-1">...</div>
</div>
```

---

## 5. Inputs y Textareas

```tsx
<input
  className="no-spinner w-full rounded-lg border bg-background px-3 py-2 text-sm
             focus:outline-none focus:ring-1 focus:ring-ring
             disabled:opacity-50 disabled:cursor-not-allowed"
/>

<textarea
  className="w-full rounded-lg border bg-background px-3 py-2 text-sm
             focus:outline-none focus:ring-1 focus:ring-ring resize-none"
/>
```

Con error:

```tsx
className={`... ${errors.campo ? 'border-destructive' : ''}`}
```

**Nunca usar:** `border-gray-300`, `focus:ring-blue-500`, `rounded-md`, `disabled:bg-gray-50`

---

## 6. Segment control (selector de opciones mutuamente excluyentes)

```tsx
<div className="flex rounded-xl border bg-muted/30 overflow-hidden text-xs p-0.5 gap-0.5">
  {opciones.map(({ key, label, Icon }) => (
    <button
      key={key}
      type="button"
      onClick={() => setSelected(key)}
      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 font-medium
                  transition-all rounded-lg ${
                    selected === key
                      ? "bg-[COLOR]-500 text-white shadow-sm" // activo
                      : "text-muted-foreground hover:text-foreground hover:bg-background/60" // inactivo
                  }`}
    >
      <Icon size={13} weight={selected === key ? "fill" : "regular"} />
      {label}
    </button>
  ))}
</div>
```

---

## 7. Mensajes de error

Error de campo individual:

```tsx
{
  errors.campo && (
    <p className="text-destructive text-xs mt-1">{errors.campo}</p>
  );
}
```

Error general (ocupa ancho completo):

```tsx
{
  errors.general && (
    <p className="rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center p-2.5">
      {errors.general}
    </p>
  );
}
```

---

## 8. Alertas informativas (no errores)

```tsx
<p className="mt-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-xl px-3 py-2">
  Texto informativo...
</p>
```

---

## 9. Resumen / summary box

Para mostrar totales calculados antes de confirmar:

```tsx
<div className="rounded-xl bg-[COLOR]-50/80 border border-[COLOR]-200/60 p-3.5 space-y-1.5 text-sm">
  <p className="font-medium text-[COLOR]-900">Título del resumen</p>
  <div className="flex justify-between text-[COLOR]-800">
    <span>Concepto</span>
    <span>Valor</span>
  </div>
  <div className="flex justify-between font-semibold text-[COLOR]-900 border-t border-[COLOR]-200 pt-1.5">
    <span>Total</span>
    <span>Valor total</span>
  </div>
</div>
```

---

## 10. Fila de acciones (footer del form)

```tsx
<div className="flex justify-end gap-3 pt-2">
  <Button
    type="button"
    variant="outline"
    onClick={onClose}
    disabled={submitting}
  >
    Cancelar
  </Button>
  <Button
    type="submit"
    disabled={submitting || condicionExtra}
    className="bg-[COLOR]-600 hover:bg-[COLOR]-700 text-white"
  >
    {submitting ? "Registrando..." : "Confirmar Acción"}
  </Button>
</div>
```

Usar siempre el componente `Button` de `@/components/ui/button`. **Nunca** usar `<button>` raw para las acciones principales.

---

## 11. Tokens de diseño — Regla de oro

| ❌ NO usar (hardcoded)      | ✅ Usar (CSS token)     |
| --------------------------- | ----------------------- |
| `text-gray-700`             | `text-foreground`       |
| `text-gray-500`             | `text-muted-foreground` |
| `border-gray-300`           | `border`                |
| `bg-gray-100`               | `bg-muted`              |
| `bg-gray-50`                | `bg-muted/50`           |
| `bg-white`                  | `bg-background`         |
| `focus:ring-blue-500`       | `focus:ring-ring`       |
| `border-red-500`            | `border-destructive`    |
| `text-red-500`              | `text-destructive`      |
| `bg-red-50`                 | `bg-destructive/10`     |
| `rounded-md` (en secciones) | `rounded-xl`            |
| `rounded-lg` (en el dialog) | `rounded-2xl`           |

---

## 12. Estructura completa de referencia

```tsx
export function MiModal({ isOpen, onClose, modo }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [isOpen]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/60 backdrop:backdrop-blur-sm rounded-2xl p-0 w-full max-w-md shadow-2xl m-auto border-0 outline-none"
    >
      {/* Header */}
      <div className="bg-gradient-to-br from-[COLOR]-500/15 to-[COLOR]-400/5 px-6 pt-5 pb-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[COLOR]-500/15">
            <IconName size={18} className="text-[COLOR]-600" weight="fill" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Título</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Subtítulo</p>
          </div>
        </div>
      </div>
      {/* Body */}
      <div className="p-5">
        <FormComponent onClose={onClose} />
      </div>
    </dialog>
  );
}
```
