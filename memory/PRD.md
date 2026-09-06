# Across Pipeline Dashboard – PRD / Handoff

## Purpose
Lightweight management dashboard + document repository for Across (Trading & Logistics).
Pipeline: Approach → Penawaran → PO → Schedule → BAST → Invoice In → Invoice Out → Closed.
Users upload final documents + fill 3–7 key fields; management sees Omzet, Margin, Piutang, Utang, Stok, progress & alerts automatically.

## Stack
- Next.js 15 (App Router, JS), shadcn/ui, Tailwind, SWR, recharts, sonner
- MongoDB (UUID ids), single catch-all API `app/api/[[...path]]/route.js`
- Auth: email/password (scrypt), cookie session `across_session` (also Bearer token)
- Files: local disk `/app/uploads` (override `UPLOAD_DIR`), metadata in `documents` collection

## Demo users (password `across123`)
admin@across.id (Admin), management@across.id (read-only), sales@across.id, ops@across.id, finance@across.id

## Key files
- `lib/stage-config.js` – config-driven definitions (columns, form sections, statuses) for all 7 stages + stock
- `components/across/stage-page.jsx` – generic list/table/cards, form drawer, detail drawer (reused by stage pages + project detail)
- `components/across/app-shell.jsx` – sidebar, topbar (⌘K search, alerts bell, user menu), mobile bottom nav
- `components/across/documents.jsx` – drag & drop uploader w/ progress, attachment list (preview/download/replace/delete)
- `app/(app)/dashboard`, `projects/[id]` (central timeline & tabs), `summary` (charts), `settings`

## Data logic
- Project rollup (backend `recomputeProject`): revenue/HPP from Approved (or latest) quotation, PO qty sum, delivered = Delivered schedules, remaining, completion %, current stage, status (Belum Jalan/Ongoing/Partial/Finish; manual override allowed).
- Omzet basis from Settings: invoice_out (default) | po_value | completed_project.
- Piutang = Σ invoice-out outstanding; Utang = Σ invoice-in outstanding; Stok = Σ manual stock value.
- Alerts: quotation w/o file, PO w/o schedule, overdue schedule, delivered w/o BAST, invoice due ≤7d / overdue, stale project.

## Status
- Backend: tested 100% by testing agent (auth, CRUD, RBAC, rollup, upload, dashboard/summary).
- Frontend: verified via screenshots (desktop + 390px); not yet run through frontend testing agent.

## Backlog / ideas
- Chunked upload for very large files; S3 storage option
- Notification emails/WA; audit log; export to Excel
