# ARCHITECTURE_CURRENT_STATE (ArtisanPro)

This document is the single source of truth for the current scanned state of the project.  
It is based on the uploaded ZIP content and the uploaded database schema.  
No assumption is allowed beyond what is present in the scanned files.

## 1) Active repository structure

### Active application paths

The active app paths used by CI, root guards, and the main repo structure are:

- `apps/backend`
- `apps/frontend`

### Duplicate mirrored tree present in the repository

A second mirrored tree also exists:

- `apps/apps/backend`
- `apps/apps/frontend`

This mirrored tree is not the primary source of truth for the current repo orchestration, because:

- root `package.json` guards target `apps/backend` and `apps/frontend`
- GitHub CI workflows run in `apps/backend` and `apps/frontend`
- the main active paths referenced by the repo are `apps/backend / apps/frontend`

### Architectural rule

Unless explicitly stated otherwise, all future work must treat these as the active source paths:

- `apps/backend/**`
- `apps/frontend/**`

The duplicated `apps/apps/**` tree must be treated as a parallel copy, not as the primary runtime source.

---

## 2) Monorepo / tooling state

### Root-level tooling

Root `package.json` currently contains:

- Husky
- lint-staged
- root guard scripts
- no root workspace orchestration
- no root TypeScript build pipeline for both apps together

### Root Git hooks

Current hooks:

- `.husky/pre-commit` → `npx lint-staged`
- `.husky/pre-push` → `npm run guards:all`

### Root scripts

Current root script:

- `npm run guards:all`

Current implementation runs backend guard scans and frontend no-console checks.

---

## 3) CI / deployment targeting

### GitHub CI

`.github/workflows/ci.yml` targets:

Backend working directory:

- `apps/backend`

Frontend working directory:

- `apps/frontend`

This confirms the active build targets.

### Docker / infra

Current root `docker-compose.yml` provisions:

- Redis

No full local orchestration of backend + frontend currently exists in the scanned state.

---

## 4) Backend runtime architecture

### Backend stack

The backend currently uses:

- Node.js
- Express
- TypeScript
- BullMQ
- Redis
- Supabase
- Stripe
- Zod
- Multer
- Google Gemini

### Backend entrypoints

Primary runtime files:

- `apps/backend/src/server.ts`
- `apps/backend/src/app.ts`

### Server boot

`server.ts` currently:

- creates the HTTP server
- starts the main API
- imports the AI worker
- starts the automation scheduler
- starts the invoice reminders scheduler
- imports reminder workers

### App bootstrap

`app.ts` currently mounts middleware in the following order:

- security middleware
- observability middleware
- Stripe webhook raw-body route
- global rate limit
- CORS
- JSON/urlencoded parsers
- cookie parser
- dev logger
- OpenAPI routes
- direct `/ai/expert` route mount
- main router `/`
- 404 handler
- global error handler

### Important behavior

`startInvoiceRemindersScheduler()` is currently called in both:

- `apps/backend/src/app.ts`
- `apps/backend/src/server.ts`

So the current scanned state includes duplicate scheduler startup.

---

## 5) Backend routing map

### Central router

Main router file:

- `apps/backend/src/routes/index.ts`

### Public route

- `/health`

### Authenticated business routes

Mounted route families include:

- `/stripe`
- `/dashboard`
- `/devis`
- `/quotes`
- `/invoices`
- `/clients`
- `/projects`
- `/usage`
- `/integrations`
- `/ai`
- `/assistant`
- `/compta`
- `/vision`
- `/vocal`
- `/automation`

### Root mounted routers

Some routers are mounted at `/` because the path is defined inside the router:

- invoice lines
- project expenses
- project accounting imports

### Direct mount outside central router

Expert routes are mounted directly in `app.ts`:

- `/ai/expert/*`

This separation avoids double mounting.

---

## 6) Backend middleware architecture

Current middleware families include:

- `auth.middleware.ts`
- `can.middleware.ts`
- `error.middleware.ts`
- `httpLogger.middleware.ts`
- `observability.middleware.ts`
- `quota.middleware.ts`
- `rateLimit.middleware.ts`
- `requirePermission.middleware.ts`
- `requireRole.middleware.ts`
- `security.middleware.ts`
- `validate.middleware.ts`

### Auth runtime shape

`authMiddleware` injects:

```ts
req.user = {
  id: string,
  email?: string,
  role: "user" | "admin" | "free" | "pro",
  permissions: Permission[]
}
Auth sources of truth

Authentication flow:

Token validation → Supabase Auth

Role lookup → public.profiles.role

Permissions → user.app_metadata.permissions if present

Fallback permissions → derived from role

7) Error response architecture
Current helper

apps/backend/src/utils/apiError.ts

Helper function

sendError(req, res, status, code, message)

Error response format
{
  "success": false,
  "error": {
    "code": "string",
    "message": "string"
  },
  "requestId": "string"
}
Error middleware

error.middleware.ts additionally supports:

Zod validation errors

Multer errors

QuotaError

HttpError

Stripe signature errors

unknown exceptions

Important note

sendError() does not currently support a details parameter.

However the error middleware can attach details.

8) Validation architecture

Validation system uses:

Zod schemas

validateStrip(schema, target)

Validated inputs include:

req.body

req.params

Multipart rule

For multipart routes:

Multer handles files

MIME validation checks file types

Zod validates body fields

Controllers must not rely on unvalidated input.

9) Database source of truth

Primary provisioning source:

apps/backend/supabase/migrations/*

Legacy SQL also exists:

apps/backend/database/schema.sql

apps/backend/database/migrations/*

These must be treated as legacy snapshots, not provisioning truth.

10) Core business tables

The scanned schema confirms the presence of these tables:

subscriptions

ai_quota

ai_logs

ai_usage

quotes

invoices

invoice_lines

clients

projects

project_expenses

dashboard_stats

integrations

integration_tokens

integration_sync_state

external_id_map

accounting_events

expert_conversations

expert_messages

vision_analyses

user_usage

user_usage_view

ai_exports

stripe_events

profiles

11) Profiles table rule

profiles currently contains:

id

email

full_name

company_name

role

created_at

profiles must not become the business source of truth for:

plan

subscription

quota

12) Subscription architecture
Source of truth

public.subscriptions

Relevant fields

plan

status

current_period_end

stripe_customer_id

stripe_subscription_id

Backend helpers

apps/backend/src/domain/plan.ts

Frontend normalization

apps/frontend/src/context/user.context.tsx

Canonical frontend plan values

free | pro

13) Quota architecture
Source of truth

public.ai_quota

Columns

user_id

monthly_limit

used

reset_at

Quota service

apps/backend/src/services/quota.service.ts

Atomic consumption

RPC → consume_ai_quota(uid, amt)

Node code must never directly update ai_quota.used.

14) AI / BullMQ architecture
Queue files

queues/ai.queue.ts

workers/ai.worker.ts

Async flow

request validated

quota pre-check

job enqueue

worker executes AI

quota consumed

status retrieved via /ai/status/:jobId

Status normalization

waiting / delayed / paused → pending

active → processing

completed → completed

failed → failed

Ownership check ensures users can only read their own jobs.

15) Gemini AI service
Core file

services/ai/gemini.service.ts

AI types

assistant

devis

compta

vision

relance

vocal

expert

Current model

gemini-2.5-flash

Retry logic handles

429

timeouts

internal errors

Compta outputs must be strict JSON.

16) AI persistence
Tables used

ai_logs

ai_usage

ai_exports

ai_logs contains:

feature

prompt

response

response_json

tokens_used

status

created_at

Endpoint

GET /ai/compta/latest

Returns:

{
  "report": {},
  "createdAt": "string",
  "id": "string"
}

If none exists:

200

report: null

17) Expert chat persistence
Tables

expert_conversations

expert_messages

Persistence handled by

services/expertConversation.service.ts

Expert history is stored server-side.

18) Stripe architecture
Routes

stripe.routes.ts

stripe.webhook.ts

Webhook must remain mounted before JSON body parser.

Subscription source of truth

subscriptions

Stripe events table

stripe_events

Typing rule

Runtime fields accessed via (obj as any).

No @ts-ignore.

19) Quotes / invoices / projects
Confirmed modules

quotes

invoices

invoice lines

clients

projects

project expenses

integrations

Dashboard KPIs are generated via:

RPC get_dashboard_kpis

Quotes support:

quote → invoice conversion

Invoices support:

reminders

payment page

invoice editor

invoice lines editor

dedicated creation route /invoices/new

Invoice lifecycle rules

Current invoice lifecycle states used by backend/frontend rules:

draft

sent

paid

overdue

canceled

Invoice editability rules

Current enforced business rules are:

draft

header editable

invoice lines editable

invoice deletable

sent

only client_email, due_date, project_id remain editable

invoice lines locked

deletion forbidden

overdue

only client_email, due_date, project_id remain editable

invoice lines locked

deletion forbidden

paid

read-only

deletion forbidden

canceled

read-only

deletion forbidden

Invoice creation workflow

The current frontend/backend workflow is:

click Nouvelle facture

navigate to /invoices/new

no invoice is created on button click

invoice is created only when the header is first saved

creation uses draft mode

then the UI redirects to /invoices/:id

Invoice lines source-of-truth rule

invoice_lines changes now trigger a backend recomputation of invoice totals via:

RPC recompute_invoice_totals_cents

This applies after:

line creation

line update

line deletion

So invoice totals in DB remain the source of truth, not only the frontend display.

20) Dashboard architecture
Backend endpoint

GET /dashboard

Response includes

user

subscription

features

quota

kpis

optional copilot snapshot

Frontend files

Dashboard.tsx

DashboardRevenue.tsx

DashboardUnpaid.tsx

DashboardQuotes.tsx

App.tsx hydrates global session state.

Feature pages may also call /dashboard.

21) Frontend architecture
Stack

React

TypeScript

Vite

React Router

Zustand

Supabase client

Tailwind

Zod

Main files

App.tsx

Layout.tsx

user.context.tsx

auth.store.ts

Protected routes render under Layout.tsx.

Invoice frontend routing

Current invoice routing is explicitly split into:

/invoices

/invoices/new

/invoices/:id

This route split must be preserved so creation mode and detail mode are not conflated.

Invoice detail UI behavior

InvoiceDetail.tsx currently supports:

creation mode (/invoices/new)

existing invoice mode (/invoices/:id)

header edit permissions derived from invoice status

line edit permissions derived from invoice status

delete button enabled only for draft invoices

read-only messaging for locked statuses

22) Frontend compta persistence
Store

store/comptaReport.store.ts

Backend restore endpoint

GET /ai/compta/latest

Backend ai_logs.response_json is the persistent source.

Frontend store is a cache.

23) Expert UI architecture
Files

ExpertHubPanel.tsx

ExpertChatPanel.tsx

AiModePanel.tsx

AssistantPanel.tsx

Layout.tsx manages expert UI state and open events.

Conversation persistence lives server-side.

24) Theme system

Theme classes in:

index.css

Themes:

classic

midnight

sunset

Theme store:

uiTheme.store.ts

Experience modes:

embedded-lite

embedded-panel

Some legacy Tailwind slate utilities still exist in global CSS.

25) Guard system

Guard scripts include:

guard-ai-queue-precheck

guard-error-shape

guard-no-console

guard-no-hardcoded-ui-colors

guard-no-pg

guard-no-ts-ignore

guard-profiles-misuse

guard-quota-writes

lint-staged currently enforces:

Backend:

error shape

profiles misuse

quota writes

Frontend:

no-console

The hardcoded color guard exists but is not fully wired.

26) Immutable architecture rules

A change is considered a regression if it:

breaks unified error shape

stores plan/quota in profiles

bypasses quota RPC

breaks Stripe webhook ordering

treats apps/apps/* as primary source

removes plan normalization

breaks AI job ownership checks

breaks compta persistence

introduces uncontrolled polling

recreates an invoice immediately on click from the invoice list instead of using /invoices/new

allows invoice line mutation outside draft

allows deletion of non-draft invoices

27) Known inconsistencies

The current codebase contains:

duplicate apps/apps tree

duplicate invoice reminder scheduler startup

mixed uppercase/lowercase plan values

sendError without details parameter

UI color guard not wired into main pipeline

legacy Tailwind slate utilities in index.css

/ai/compta/latest returns 200 + null instead of 404

redundant auth guards in dashboard routes

These are part of the scanned architecture.

28) Session workflow rule

At the beginning of any architecture session:

upload latest project ZIP

scan entire repository

read this document first

verify DB statements against migrations and schema

avoid relying on past chat memory

29) Final stability rule

Any modification that violates the rules defined in this document is considered a critical architectural regression.

🔒 This rule is considered architecturally immutable.