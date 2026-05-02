# Integración Tasa BCV — API Automática

## Objetivo

Conectar el botón "Automatica" del modal de tasa de cambio con la API externa del BCV, permitiendo obtener y registrar la tasa vigente en un solo flujo sin escribirla manualmente.

---

## Archivos modificados

### `.env`

```diff
+ VITE_TASA_API_URL=/proxy/bcv/latest?currency=USD
```

> En producción (una vez resuelto CORS) cambiar a la URL completa:
> `VITE_TASA_API_URL=https://nexo21-tax-rate-api.onrender.com/api/rates/bcv/latest?currency=USD`

---

### `vite.config.ts`

Se agregó un proxy en el servidor de desarrollo para evitar el error CORS. El navegador llama a `/proxy/bcv/...` y Vite lo reenvía server-to-server al API real.

```diff
  server: {
    allowedHosts: true,
+   proxy: {
+     '/proxy/bcv': {
+       target: 'https://nexo21-tax-rate-api.onrender.com',
+       changeOrigin: true,
+       rewrite: (path) => path.replace(/^\/proxy\/bcv/, '/api/rates/bcv'),
+     },
+   },
  },
```

> Este bloque se elimina una vez que la API tenga los headers CORS configurados.

---

### `src/features/configuracion/hooks/use-tasas.ts`

Se agregaron tres elementos nuevos al final del archivo:

**1. Tipo de respuesta de la API**

```typescript
interface TasaApiResponse {
  source: string;
  currency: string;
  value: string; // "489.55470000"
  date_text: string; // "Valor del 2026-05-04"
  fetched_at: string;
  success: boolean;
  error: string | null;
}
```

**2. Función de fetch**

```typescript
export async function fetchTasaFromApi(): Promise<{
  valor: number;
  dateText: string;
}>;
```

- Llama a `VITE_TASA_API_URL`
- Valida `data.success === true`
- Parsea `data.value` (string) a número
- Lanza errores descriptivos en cada punto de fallo

**3. Hook de estado**

```typescript
export function useFetchTasaApi(): {
  fetchTasa: () => Promise<number>;
  isFetching: boolean;
  apiDateText: string | null; // ej: "Valor del 2026-05-04"
};
```

- Gestiona `isFetching` para deshabilitar controles y mostrar spinner
- Expone `apiDateText` para mostrarlo bajo el input después de obtener la tasa

---

### `src/features/configuracion/components/tasa-update-modal.tsx`

Reemplazó el stub `handleAutomatica` (que solo mostraba un toast "proximamente") por la implementación real:

- Importa `useFetchTasaApi`
- `handleAutomatica` llama a `fetchTasa()`, pre-rellena el input con el valor y muestra el `date_text` del BCV
- El botón "Automatica" muestra spinner + texto "Consultando..." durante el fetch
- `console.log` de debug en éxito y error (puede removerse en producción)

---

### `src/features/configuracion/components/tasa-form.tsx`

Se actualizó el formulario de la página de configuración de tasas (independiente del modal):

- Agrega botón `RefreshCw` junto al input numérico
- Mismo comportamiento que el modal: llama a la API, pre-rellena el campo

---

## Flujo completo

```
Usuario presiona "Automatica"
  → fetch("/proxy/bcv/latest?currency=USD")          [dev: Vite proxy]
  → https://nexo21-tax-rate-api.onrender.com/...     [prod: directo con CORS]
  → { success: true, value: "489.5547", date_text: "Valor del ..." }
  → input pre-relleno con "489.5547"
  → usuario presiona "Guardar manual"
  → crearTasa(489.5547, empresaId, userId)
  → kysely → PowerSync SQLite local
  → PowerSync Cloud → Supabase PostgreSQL
  → useTasaActual() / useTasasHistorial() se actualizan reactivamente
```

---

## Pendiente — Fix CORS en producción

La API `nexo21-tax-rate-api.onrender.com` está hecha en **Django**. Para que el browser pueda llamarla directamente desde producción:

```bash
pip install django-cors-headers
```

`settings.py`:

```python
INSTALLED_APPS = [
    'corsheaders',
    ...
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # debe ir primero
    'django.middleware.common.CommonMiddleware',
    ...
]

# Opción simple (API pública)
CORS_ALLOW_ALL_ORIGINS = True

# Opción restringida (recomendado)
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://tu-dominio-clarapos.com",
]
```

Luego redeploy en Render. Una vez verificado:

1. Cambiar `.env`: `VITE_TASA_API_URL=https://nexo21-tax-rate-api.onrender.com/api/rates/bcv/latest?currency=USD`
2. Eliminar el bloque `proxy` de `vite.config.ts`
