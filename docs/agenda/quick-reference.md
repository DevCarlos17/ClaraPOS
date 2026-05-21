# ClaraPOS Agenda Module — Quick Developer Reference

## File Map

```
src/features/citas/
├── hooks/
│   ├── use-citas.ts                    ← Cita CRUD (create, update status, reschedule, log)
│   ├── use-horarios-staff.ts           ← Staff schedules + slot availability calculation
│   ├── use-horarios-descansos.ts       ← Break times per schedule
│   ├── use-horarios-excepciones.ts     ← Schedule overrides (day off, emergency block)
│   ├── use-horarios-plantillas.ts      ← Reusable templates
│   ├── use-cita-log.ts                 ← Audit trail
│   ├── use-cita-extras.ts              ← Add-on items during execution
│   ├── use-agenda-config.ts            ← Tenant settings (view default, slot duration, limits)
│   └── use-google-calendar.ts          ← OAuth sync with Google Calendar
├── components/
│   ├── calendario/                     ← FullCalendar views
│   ├── wizard/                         ← Multi-step creation (date→services→checkout)
│   ├── panel/                          ← Kanban work view
│   ├── horarios/                       ← Staff schedule configuration
│   └── config/                         ← Agenda settings editor
└── schemas/
    └── cita-schema.ts                  ← Zod validation
```

---

## Common Tasks

### 1. Fetch Appointments in a Date Range

```typescript
import { useCitasRango } from '@/features/citas/hooks/use-citas'

function MyComponent() {
  const { citas, isLoading } = useCitasRango(
    '2026-05-21T00:00:00Z',
    '2026-05-28T23:59:59Z'
  )
  // citas: Cita[] in chronological order
}
```

### 2. Get Available Slots for a Professional

```typescript
import { useSlotsDisponibles, useCitasRango } from '@/features/citas/hooks/use-horarios-staff'

function AvailabilityPicker({ profesionalId, fecha }) {
  const { citas } = useCitasRango(fecha + 'T00:00:00Z', fecha + 'T23:59:59Z')
  const slots = useSlotsDisponibles(profesionalId, fecha, citas, 30) // 30-min slots

  return slots.map(slot => (
    <button disabled={!slot.disponible}>
      {slot.horaInicio} - {slot.horaFin}
    </button>
  ))
}
```

### 3. Create an Appointment

```typescript
import { crearCita } from '@/features/citas/hooks/use-citas'
import { useCurrentUser } from '@/core/hooks/use-current-user'

async function handleCreate() {
  const { user } = useCurrentUser()

  const citaId = await crearCita({
    clienteId: 'uuid-cliente',
    profesionalId: 'uuid-profesional',
    fechaInicio: '2026-05-25T10:00:00Z',
    fechaFin: '2026-05-25T10:30:00Z',
    duracionMin: 30,
    servicios: [
      { productoId: 'svc-1', precioUsd: 50, duracionMin: 30 }
    ],
    checkoutTipo: 'RESERVA', // or 'POS' or 'CREDITO'
    totalUsd: 50,
    tasa: '45.50',
    empresaId: user?.empresa_id ?? '',
    userId: user?.id ?? '',
    notas: 'Optional notes',
    observaciones: 'Optional observations'
  })

  return citaId
}
```

### 4. Start/Finish Appointment (State Transitions)

```typescript
import {
  iniciarAtencion,
  finalizarCita
} from '@/features/citas/hooks/use-citas'

// Worker clicks "Iniciar" button
await iniciarAtencion(citaId, userId)

// Later, worker clicks "Terminar"
await finalizarCita(citaId, userId, cita.fecha_inicio, cita.duracion_min)
// This calculates duracion_real_min and desviacion_min automatically
```

### 5. Reschedule via Drag & Drop

```typescript
import { reprogramarCita, registrarCitaLog } from '@/features/citas/hooks/use-citas'

async function handleDragDrop(cita, newStart, newEnd) {
  await reprogramarCita(cita.id, newStart, newEnd, userId)

  // Log for audit trail
  await registrarCitaLog({
    empresaId,
    citaId: cita.id,
    usuarioId: userId,
    accion: 'DRAG_AND_DROP',
    datosNuevos: { fecha_inicio: newStart, fecha_fin: newEnd }
  })
}
```

### 6. Cancel Appointment

```typescript
import { cancelarCita } from '@/features/citas/hooks/use-citas'

// Note: cancelarCita sets finance_status = 'NULO'
// If there's a linked venta, handle rollback separately
await cancelarCita(citaId, userId)
```

### 7. Fetch/Update Tenant Settings

```typescript
import { useAgendaConfig, guardarAgendaConfig } from '@/features/citas/hooks/use-agenda-config'

function ConfigPanel() {
  const { config, empresaId } = useAgendaConfig()

  const handleSave = async () => {
    await guardarAgendaConfig(empresaId, {
      mostrar_agenda: true,
      limite_futuro_dias: 60, // Allow 60 days ahead instead of 30
      rango_grilla_default: 'mes', // Default to month view
      duracion_slot_default: 15, // 15-min slots instead of 30
      permitir_solapamiento_descanso: false
    })
  }
}
```

### 8. Manage Staff Schedules

```typescript
import { guardarHorariosProfesional } from '@/features/citas/hooks/use-horarios-staff'

async function saveProfessionalSchedule(profesionalId, empresaId) {
  await guardarHorariosProfesional(
    profesionalId,
    empresaId,
    [
      { diaSemana: 1, horaInicio: '08:00', horaFin: '17:00', isActive: true }, // Monday
      { diaSemana: 2, horaInicio: '08:00', horaFin: '17:00', isActive: true }, // Tuesday
      // ... Wed-Fri
      { diaSemana: 6, horaInicio: '08:00', horaFin: '12:00', isActive: true }, // Saturday (half day)
      { diaSemana: 0, horaInicio: '00:00', horaFin: '00:00', isActive: false }, // Sunday (off)
    ]
  )
}
```

### 9. Set Break Times (Lunch, Rest)

```typescript
import { crearDescanso } from '@/features/citas/hooks/use-horarios-descansos'

// Must associate with a horario_staff_id
await crearDescanso({
  horarioStaffId: 'uuid-horario',
  horaInicio: '12:00',
  horaFin: '13:00', // 1-hour lunch
  nombre: 'Almuerzo'
})
```

### 10. Add Schedule Exception (Emergency Block, Day Off)

```typescript
import { crearExcepcion } from '@/features/citas/hooks/use-horarios-excepciones'

await crearExcepcion({
  usuarioId: 'uuid-professional',
  fecha: '2026-05-30', // Specific date
  tipo: 'DIA_LIBRE', // or 'BLOQUEO_EMERGENCIA', 'HORARIO_MODIFICADO', 'OTROS'
  horaInicio: null,
  horaFin: null,
  descripcion: 'Medical appointment'
})
```

---

## Data Model Quick Ref

### Cita States

```
cita_status (Operational):
  RESERVADA     → appointment booked, not started
  EN_PROCESO    → worker started service (timestamp_inicio set)
  REALIZADA     → service completed (timestamp_fin + duracion_real_min set)
  CANCELADA     → cancelled (finance_status = NULO)

finance_status (Payment):
  PENDIENTE     → no payment yet (RESERVA or CREDITO)
  ABONADO       → partial payment
  PAGADO        → full payment
  NULO          → cancelled/voided
```

### Checkout Types

```
checkout_tipo:
  RESERVA       → no payment, just time reservation
  POS           → paid immediately, creates venta record
  CREDITO       → deferred payment via Cuentas por Cobrar
```

---

## Validation & Constraints

### Past Date Blocking (3-layer)

```
1. Frontend Zod Schema:
   cita.fecha_inicio must be >= today at 00:00

2. FullCalendar selectAllow:
   selectInfo.start < todayMidnight → rejected

3. PowerSync Connector Upload Validation:
   fecha_inicio < NOW() → upload blocked at sync time
```

### Break Overlap

**Config:** `permitir_solapamiento_descanso` (boolean)
- `false` (default): Breaks block slots completely
- `true`: Allows scheduling over breaks (business override)

### Future Days Limit

**Config:** `limite_futuro_dias`
- `0` = unlimited (can book 1 year ahead)
- `30` = only up to 30 days ahead
- Enforced in FullCalendar `validRange` prop

---

## Common Patterns

### Tenant Isolation

```typescript
// Always include empresa_id filter
const { user } = useCurrentUser()
const empresaId = user?.empresa_id ?? ''

const { citas } = useCitasRango(inicio, fin) // Already filtered by empresa_id inside hook
```

### Atomic Multi-Table Updates

```typescript
// Inside crearCita(), uses writeTransaction:
await db.writeTransaction(async (tx) => {
  await tx.execute('INSERT INTO citas (...) VALUES (...)')
  await tx.execute('INSERT INTO citas_servicios (...) VALUES (...)')
  await tx.execute('INSERT INTO cita_trabajadores (...) VALUES (...)')
})
// All-or-nothing: if any fails, all rollback
```

### Snapshot & Rollback

```typescript
// Before finalizarCita, optionally save state
await guardarSnapshot(citaId, { estado: 'snapshot_antes' })

// If error occurs later, can manually recover
const snapshot = JSON.parse(cita.snapshot_en_progreso)
```

---

## Routes

```
/app/citas/calendario       → FullCalendar main view
/app/citas/panel            → Kanban work panel
/app/citas/horarios-staff   → Staff schedule management
```

**New Appointment Modal:** Accessed via `NuevaCitaSheet` component
- No dedicated route; opens as sheet overlay
- Entry points: "Nueva Cita" button or click on calendar slot

---

## Permissions

```typescript
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'

const { hasPermission } = usePermissions()

// Check if user can manage citas
if (hasPermission(PERMISSIONS.CITAS_MANAGE)) {
  // Show edit/reschedule/cancel buttons
}
```

---

## CSS Classes (FullCalendar)

```css
.fc-slot-past                 /* Grayed-out past time slots */
.fc-event-selected            /* Selected appointment */
.fc-event-dragging            /* During drag operation */
.fc-col-time-frame            /* Time column */
.fc-timegrid-slot             /* Individual slot row (height: 32px) */
```

---

## Debugging Tips

### Enable Logging

```typescript
// In use-horarios-staff.ts, guardarHorariosProfesional() already has console.group logs
// Check browser DevTools Console for detailed SQL operations

console.group('💾 [guardarHorarios] Iniciando guardado')
console.log('  profesionalId:', profesionalId)
console.table(verificacion)
console.groupEnd()
```

### Verify PowerSync Sync

```typescript
// In browser console:
db.watch('SELECT COUNT(*) as cnt FROM citas').then(r => console.log('Citas count:', r[0].cnt))
```

### Test Slot Calculation Offline

```typescript
import { useSlotsDisponibles } from '@/features/citas/hooks/use-horarios-staff'

// In a debug component:
const slots = useSlotsDisponibles('prof-id', '2026-05-25', [], 30)
console.table(slots)
```

---

## Known Limitations

1. **No pagination on cita queries** — loads all citas for range (okay for SMBs, >10k/month needs optimization)
2. **Professional color limit** — only 10 hardcoded colors; repeats if >10 users
3. **No explicit race-condition locking** — SELECT FOR UPDATE not yet implemented
4. **No automated no-show transition** — manual process or Edge Function needed
5. **Google Calendar** — Uni-directional initially; bi-directional sync in progress

---

## Related Documentation

- **Full Spec:** See `task.md` (business rules, workflows, edge cases)
- **API/Schema:** See `backend/migrations/0003_citas_module.sql`
- **Error Handling:** See `connector.ts` validation layer
- **Testing:** See (none yet; high priority for financial accuracy)

---

**Last Updated:** 2026-05-21 | **Module Status:** Production | **Last Feature:** Past date blocking UI
