# ClaraPOS Agenda Module — Documentation Index

**Generated:** May 21, 2026
**Module:** Citas (Appointments) / Calendar / Scheduling
**Status:** Production Ready with Active Enhancements

---

## Quick Navigation

### For Project Managers
- **START HERE:** [`SEARCH_RESULTS_SUMMARY.md`](./SEARCH_RESULTS_SUMMARY.md) — 5-minute overview of what exists and status
- **DETAIL:** [`AGENDA_MODULE_FINDINGS.md`](./AGENDA_MODULE_FINDINGS.md) — Full 30-minute deep-dive with roadmap

### For Developers
- **CHEATSHEET:** [`AGENDA_QUICK_REFERENCE.md`](./AGENDA_QUICK_REFERENCE.md) — Immediately usable code snippets
- **DETAILS:** [`AGENDA_MODULE_FINDINGS.md`](./AGENDA_MODULE_FINDINGS.md) — Full architecture and patterns

### For DevOps
- **Deployment:** See "Deployment Checklist" in [`AGENDA_MODULE_FINDINGS.md`](./AGENDA_MODULE_FINDINGS.md#deployment-checklist)
- **Database:** See "Schema" and "Migrations" sections

### For QA/Testing
- **Test Recommendations:** See "Testing Recommendations" in [`AGENDA_MODULE_FINDINGS.md`](./AGENDA_MODULE_FINDINGS.md#testing-recommendations)
- **Known Gaps:** See "Known Gaps & Future Work" in [`AGENDA_MODULE_FINDINGS.md`](./AGENDA_MODULE_FINDINGS.md#known-gaps--future-work)

---

## Document Overview

### 1. SEARCH_RESULTS_SUMMARY.md (This Layer)

**Purpose:** Provide a quick index and overview of findings

**Contents:**
- Summary of search queries executed
- High-value findings table
- File inventory (hooks, components, migrations)
- Git history (last 10 commits)
- Data model summary
- Architecture highlights (5 key points)
- Recent work focus (past date blocking)
- Integration points (PowerSync, Supabase, Ventas, etc.)
- Specification alignment vs. task.md
- Testing & deployment status

**Length:** ~2,500 words | **Read Time:** 5-10 minutes

**Use When:** You need a quick overview or want to know what's implemented

---

### 2. AGENDA_MODULE_FINDINGS.md (The Detailed Report)

**Purpose:** Comprehensive technical report suitable for architecture reviews and long-term planning

**Contents:**
- Executive summary with status icons
- Current implementation status (production details)
- Database schema (63 tables, 9 domains, detailed field descriptions)
- Frontend architecture (file structure, patterns, conventions)
- Recent enhancements (last 4 commits broken down)
- Key hooks & data layer (with code snippets)
- Main calendar component (FullCalendar integration details)
- Wizard component (flow, validation)
- Audit & logging (immutable trail)
- Business rules implemented (state machines, financial decoupling, past date blocking, breaks, exceptions)
- Integration points (PowerSync, Ventas, Google Calendar, etc.)
- Configuration & customization (tenant settings)
- Known gaps & future work (detailed table)
- Code quality assessment
- Recent commits deep-dive
- Testing recommendations (unit, integration, E2E)
- Deployment checklist
- Files summary table

**Length:** ~11,000 words | **Read Time:** 30-45 minutes

**Use When:** You need comprehensive technical understanding, writing specs, or doing architecture review

---

### 3. AGENDA_QUICK_REFERENCE.md (The Cheatsheet)

**Purpose:** Quick developer reference with copy-paste-ready code

**Contents:**
- File map (copy-paste folder structure)
- Common tasks (10 real-world scenarios with code examples):
  1. Fetch appointments in date range
  2. Get available slots
  3. Create appointment
  4. Start/finish (state transitions)
  5. Reschedule via drag & drop
  6. Cancel appointment
  7. Fetch/update tenant settings
  8. Manage staff schedules
  9. Set break times
  10. Add schedule exception
- Data model quick reference (state diagrams)
- Validation & constraints
- Common patterns (tenant isolation, atomicity, snapshots)
- Routes reference
- Permissions check
- CSS classes (FullCalendar)
- Debugging tips
- Known limitations
- Related documentation links

**Length:** ~2,000 words | **Read Time:** 10-15 minutes (reference use)

**Use When:** Implementing features, debugging, or need quick code examples

---

## Key Findings at a Glance

### ✅ What's Done

| Feature | Status | Details |
|---------|--------|---------|
| Core scheduling | ✅ Production | `use-citas.ts` + `calendario-citas.tsx` |
| Offline support | ✅ Production | PowerSync sync rules configured |
| Multi-professional | ✅ Production | `cita_trabajadores` N:N relationships |
| Bimonetary | ✅ Production | USD base + Bs snapshot via tasa |
| Breaks & exceptions | ✅ Production | `horarios_descansos` + `horarios_excepciones` |
| Drag-and-drop | ✅ Production | Rescheduling with audit logging |
| Past date blocking | ✅ Recent (May 20-21) | 3-layer validation (UI + form + connector) |
| Google Calendar | ✅ Integrated | OAuth foundation, bi-directional in progress |
| Audit trail | ✅ Production | Immutable `cita_log` table |
| Admin config | ✅ Production | Tenant settings in `empresas.config` |

### ⏳ What's Not Yet Done (Phase 2)

| Feature | Gap | Impact | Effort |
|---------|-----|--------|--------|
| Race condition protection | SELECT FOR UPDATE missing | Low (offline-first mitigates) | Medium |
| Automated no-show | Edge Function cron missing | Medium (manual process today) | Low-Medium |
| Complex scheduling | Multi-service time resolution UI incomplete | Low (SMBs don't need yet) | High |
| KPI dashboards | Using duracion_real_min data but no UI | Low (tracking exists) | Medium |
| Clinical integration | No patient histories linked | Low (scheduled for Phase 3) | High |
| Test suite | Zero tests | Medium (financial module risk) | High |

---

## Code Statistics

```
Total Lines of Code:        ~4,500+
Hooks (9):                  ~1,500 lines
Components (12+):           ~2,500 lines
Migrations (2):             ~700 lines
Schemas:                    ~50 lines

Recent Activity:
  - 6 commits in last 24 hours (May 20-21)
  - 10 commits in last week
  - 15+ commits this month

Code Quality:
  - TypeScript: 100% typed
  - Validation: Zod schemas
  - Transactions: Atomic via PowerSync
  - Audit: Full immutable trail
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        React 19 Frontend                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Components (UI Layer)                                   │   │
│  │  - FullCalendar (calendario-citas.tsx)                  │   │
│  │  - Multi-step Wizard (nueva-cita-wizard.tsx)           │   │
│  │  - Staff Schedule Manager (horarios-staff-page.tsx)    │   │
│  │  - Work Panel Kanban (panel-trabajo.tsx)               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ↕                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Hooks (Data Layer)                                      │   │
│  │  - use-citas (CRUD + mutations)                         │   │
│  │  - use-horarios-staff (slot availability)              │   │
│  │  - use-agenda-config (tenant settings)                 │   │
│  │  - use-cita-log (audit trail)                          │   │
│  │  - use-google-calendar (sync)                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────────┐
│                      PowerSync (Local SQLite)                   │
│  Offline-first: all reads/writes to SQLite, sync to Supabase   │
└─────────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────────┐
│                 Supabase PostgreSQL (Source of Truth)           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Citas Domain (9 tables):                                 │  │
│  │  - citas (master appointments)                           │  │
│  │  - citas_servicios (line items)                         │  │
│  │  - cita_trabajadores (worker assignments)               │  │
│  │  - cita_log (immutable audit)                           │  │
│  │  - horarios_staff (work schedules)                      │  │
│  │  - horarios_descansos (break times)                     │  │
│  │  - horarios_excepciones (schedule overrides)            │  │
│  │  - horarios_plantillas (reusable templates)             │  │
│  │  - cita_items_extras (add-on items)                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│  RLS Policies: Enterprise_id filtering + immutability triggers  │
└─────────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────────┐
│              Integrations (External Services)                   │
│  - Supabase Auth (JWT tokens for users)                        │
│  - Google Calendar (OAuth, bi-directional sync)                │
│  - Ventas (Sales transactions, checkout integration)           │
│  - Clientes (Customer master data)                             │
│  - Configuración (Tenant settings)                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Reference Quick Links

### Core Hooks
- `src/features/citas/hooks/use-citas.ts` — Main CRUD operations
- `src/features/citas/hooks/use-horarios-staff.ts` — Slot availability logic
- `src/features/citas/hooks/use-agenda-config.ts` — Tenant configuration

### Main Components
- `src/features/citas/components/calendario/calendario-citas.tsx` — FullCalendar
- `src/features/citas/components/wizard/nueva-cita-wizard.tsx` — Creation flow
- `src/features/citas/components/horarios/horarios-staff-page.tsx` — Schedule management

### Database
- `backend/migrations/0003_citas_module.sql` — Initial schema
- `backend/migrations/0005_citas_enhanced.sql` — Enhancements

### Related Features (in task.md)
- See `WORKFLOW_CLARAPOS.md` for complete business rules
- See `PLANIFICACION.md` for implementation roadmap
- See `CLAUDE.md` for project conventions

---

## Common Questions Answered

### Q: Is the agenda module production-ready?
**A:** YES. It's in production with active enhancements. Recent work (May 20-21) focused on past date blocking.

### Q: Does it support offline usage?
**A:** YES. Full offline-first via PowerSync. All reads/writes to SQLite sync automatically.

### Q: Can it handle multiple professionals?
**A:** YES. `cita_trabajadores` supports N workers per appointment. UI wizard currently simplified to 1, can be extended.

### Q: How are payments handled?
**A:** Bimonetary (USD base + Bs via exchange rate). Creates linked `venta` record if checkout is POS or CREDITO.

### Q: What about past date prevention?
**A:** 3-layer defense: UI selectAllow callback + Zod validation + PowerSync connector validation (implemented May 20-21).

### Q: Is there a test suite?
**A:** NO. High-priority gap for financial accuracy. Recommend adding before scaling to large operations.

### Q: How are state transitions managed?
**A:** Clear state machine: RESERVADA → EN_PROCESO → REALIZADA / CANCELADA. Financial status independent.

### Q: What's the audit trail?
**A:** Immutable `cita_log` table records every action (CREAR, DRAG_AND_DROP, INICIAR, FINALIZAR, CANCELAR) with before/after snapshots.

### Q: What about Google Calendar sync?
**A:** OAuth foundation in place. Reads/writes cita events to Google Calendar. Bi-directional sync in progress.

---

## Next Steps for Development

### Immediate (High Priority)
1. Add test suite (unit + integration) — Financial accuracy critical
2. Implement race condition protection (SELECT FOR UPDATE)
3. Add no-show automation (Edge Function)

### Short Term (Medium Priority)
1. Enhance multi-professional scheduling UI
2. Add sobreturno (overbooking) confirmation workflow
3. Build KPI dashboard using performance data

### Medium Term (Lower Priority)
1. Implement clinical integration (patient histories)
2. Add advanced reporting (utilization, efficiency)
3. Optimize slot calculation for large datasets (edge function)

---

## Support & Maintenance

### Current Maintainers
- Carlos (last commits on May 20-21, 2026)

### Documentation Authors
- Claude Code Agent (May 21, 2026)

### Known Issues
- See "Known Gaps & Future Work" in AGENDA_MODULE_FINDINGS.md
- No test suite (high risk)
- No race condition protection yet

### Review Process
- Code reviews recommended before major changes
- Test coverage should increase before scaling
- Database backups before migrations

---

## Document Versions

| Document | Version | Last Updated | Purpose |
|----------|---------|--------------|---------|
| SEARCH_RESULTS_SUMMARY.md | 1.0 | May 21, 2026 | Index & quick overview |
| AGENDA_MODULE_FINDINGS.md | 1.0 | May 21, 2026 | Comprehensive technical report |
| AGENDA_QUICK_REFERENCE.md | 1.0 | May 21, 2026 | Developer cheatsheet |
| AGENDA_DOCUMENTATION_INDEX.md | 1.0 | May 21, 2026 | Navigation & summary (this doc) |

---

## How to Use These Documents

### Scenario 1: "I just joined the team, help me understand the citas module"
1. Read **AGENDA_DOCUMENTATION_INDEX.md** (this document) — 5 min
2. Read **SEARCH_RESULTS_SUMMARY.md** — 10 min
3. Skim **AGENDA_QUICK_REFERENCE.md** file map — 5 min
4. Read **AGENDA_MODULE_FINDINGS.md** sections 1-4 — 20 min
**Total: ~40 minutes**

### Scenario 2: "I need to add a feature to the calendar"
1. Reference **AGENDA_QUICK_REFERENCE.md** for code examples — 5 min
2. Consult **AGENDA_MODULE_FINDINGS.md** for architecture details — 15 min
3. Look at recent commits in git for patterns — 10 min
**Total: ~30 minutes**

### Scenario 3: "I'm debugging a bug in the scheduler"
1. Check **AGENDA_QUICK_REFERENCE.md** debugging tips — 5 min
2. Review **AGENDA_MODULE_FINDINGS.md** business rules section — 10 min
3. Inspect git log for related recent changes — 5 min
**Total: ~20 minutes**

### Scenario 4: "I need to present module status to leadership"
1. Use **SEARCH_RESULTS_SUMMARY.md** status tables — 10 min
2. Reference **AGENDA_MODULE_FINDINGS.md** executive summary + findings table — 10 min
3. Highlight recent work and gaps — 5 min
**Total: ~25 minutes**

---

## Contact & Questions

**For architectural questions:** See AGENDA_MODULE_FINDINGS.md or consult recent commits by Carlos

**For code examples:** See AGENDA_QUICK_REFERENCE.md

**For implementation details:** See component source files linked in AGENDA_MODULE_FINDINGS.md

**For business rules:** See task.md (in this repo) or WORKFLOW_CLARAPOS.md (in parent Nexo folder)

---

**All Documents Generated:** May 21, 2026
**Total Documentation:** ~15,000+ words across 4 comprehensive guides
**Confidence Level:** HIGH (direct source code inspection + git history analysis)
