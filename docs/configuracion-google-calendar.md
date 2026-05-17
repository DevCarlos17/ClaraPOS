# Configuración de Google Calendar en ClaraPOS

Cada usuario (profesional) puede conectar su propia cuenta de Google para que sus citas de ClaraPOS aparezcan automáticamente en su Google Calendar personal.

---

## 1. Crear un Proyecto en Google Cloud Console

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Haz clic en el selector de proyectos (arriba a la izquierda) → **Nuevo Proyecto**
3. Nombre: `ClaraPOS` (o el que prefieras)
4. Haz clic en **Crear**

---

## 2. Habilitar la API de Google Calendar

1. Con el proyecto seleccionado, ve al menú lateral → **APIs y servicios** → **Biblioteca**
2. Busca `Google Calendar API`
3. Haz clic en el resultado → **Habilitar**

---

## 3. Configurar la Pantalla de Consentimiento OAuth

1. Ve a **APIs y servicios** → **Pantalla de consentimiento de OAuth**
2. Tipo de usuario: **Externo** → **Crear**
3. Completa los campos obligatorios:
   - **Nombre de la app**: `ClaraPOS`
   - **Correo de asistencia**: tu correo
   - **Correo del desarrollador**: tu correo
4. Haz clic en **Guardar y continuar**
5. En **Permisos (Scopes)**, haz clic en **Agregar o quitar permisos**
   - Busca y agrega: `https://www.googleapis.com/auth/calendar.events`
   - Busca y agrega: `https://www.googleapis.com/auth/calendar.freebusy`
6. Haz clic en **Guardar y continuar** hasta finalizar

> **Estado de publicación**: Para pruebas, el estado puede quedarse en **En prueba**.
> Los correos de Google Workspace o G Suite no tienen este límite.
> Para producción, solicita la verificación de la app en Google.

---

## 4. Crear Credenciales OAuth 2.0

1. Ve a **APIs y servicios** → **Credenciales**
2. Haz clic en **Crear credenciales** → **ID de cliente de OAuth**
3. Tipo de aplicación: **Aplicación web**
4. Nombre: `ClaraPOS Web`
5. En **URIs de redireccionamiento autorizados**, agrega exactamente:

   ```
   https://TU_PROYECTO.supabase.co/functions/v1/google-calendar-auth
   ```

   Reemplaza `TU_PROYECTO` con el subdomain de tu proyecto Supabase (lo encuentras en
   **Supabase Dashboard → Settings → API → Project URL**).

6. Haz clic en **Crear**
7. Copia el **Client ID** y el **Client Secret** — los necesitarás en el paso siguiente

---

## 5. Configurar Variables de Entorno en Supabase

1. Ve a tu **Supabase Dashboard** → **Edge Functions** → **Manage secrets**
   (o Settings → Edge Functions → Secrets)
2. Agrega los siguientes secrets:

   | Nombre                   | Valor                              |
   |--------------------------|-------------------------------------|
   | `GOOGLE_CLIENT_ID`       | El Client ID del paso anterior      |
   | `GOOGLE_CLIENT_SECRET`   | El Client Secret del paso anterior  |

   > `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya existen automáticamente en las Edge Functions.

---

## 6. Aplicar la Migración de Base de Datos

Ejecuta en el **SQL Editor de Supabase Dashboard** (en orden):

```sql
-- Primero (si no lo has hecho):
-- backend/migrations/0003_citas_module.sql

-- Luego:
-- backend/migrations/0004_google_calendar.sql
```

---

## 7. Desplegar las Edge Functions

Desde tu terminal, con la [Supabase CLI](https://supabase.com/docs/guides/cli) instalada y autenticada:

```bash
cd backend

# Autenticarse (si no lo has hecho)
supabase login

# Enlazar con tu proyecto (obtén el project-ref en Supabase Dashboard → Settings → General)
supabase link --project-ref TU_PROJECT_REF

# Desplegar las dos funciones
supabase functions deploy google-calendar-auth --no-verify-jwt
supabase functions deploy google-calendar-sync
```

> `--no-verify-jwt` en `google-calendar-auth` es necesario porque Google redirige al callback
> sin un JWT de Supabase (es una redirección OAuth del navegador, no una llamada autenticada).
> El state codificado en Base64 es el mecanismo de seguridad para el callback.

---

## 8. Uso por el Usuario Final

1. El usuario inicia sesión en ClaraPOS normalmente
2. Va al menú lateral → **Mi Perfil**
3. En la sección **Integraciones**, hace clic en **Conectar con Google**
4. Se abre una ventana de Google para autorizar el acceso al calendario
5. Al aceptar, la ventana se cierra y el estado cambia a **Conectado**

A partir de ese momento:
- Cuando se agenda una cita con ese profesional → se crea automáticamente un evento en su Google Calendar
- Cuando la cita se completa o cancela → el evento se actualiza en Google Calendar
- Al ver los slots disponibles en el wizard → se consulta Google Calendar para bloquear horarios ya ocupados

---

## Notas Técnicas

- Los tokens OAuth se almacenan en la tabla `google_calendar_tokens` **solo en Supabase** (no se sincronizan a PowerSync por seguridad)
- El `refresh_token` permite renovar el acceso sin que el usuario tenga que volver a autorizar
- Todos los eventos se crean en el calendario `primary` del usuario (configurable en la tabla)
- La sincronización es **best-effort**: si Google Calendar falla, la cita en ClaraPOS no se ve afectada
- Cada profesional gestiona su propia conexión de forma independiente

---

## Troubleshooting

| Problema | Causa probable | Solución |
|----------|----------------|----------|
| "Error al obtener tokens" | Client ID/Secret incorrectos | Verifica los secrets en Supabase |
| "redirect_uri_mismatch" | La URI en Google Cloud no coincide | Verifica el URI exacto en Google Console |
| El popup no se cierra | Bloqueador de popups activo | Permitir popups para el dominio de ClaraPOS |
| "Token refresh failed" | `refresh_token` perdido | El usuario debe reconectar su cuenta |
| Los eventos no aparecen | Profesional sin tokens | Verificar que el profesional conectó su cuenta en Mi Perfil |
