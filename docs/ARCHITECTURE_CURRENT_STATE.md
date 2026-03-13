Architecture Current State Updated
ARCHITECTURE_CURRENT_STATE (ArtisanPro)

This document is the single source of truth for the current scanned state of the project. It reflects the repository state after the canonical accounting refactor has been stabilized. No assumption is allowed beyond what is present in the active code paths.

1) Active repository structure
Active application paths

The active app paths used by CI, root guards, and the main repo structure are:

apps/backend

apps/frontend

Duplicate mirrored tree present in the repository

A second mirrored tree may still exist:

apps/apps/backend

apps/apps/frontend

This mirrored tree is not the primary source of truth for current repo orchestration, because:

root tooling targets apps/backend and apps/frontend

GitHub CI targets apps/backend and apps/frontend

the active runtime and build paths are apps/backend / apps/frontend

Architectural rule

Unless explicitly stated otherwise, all future work must treat these as the active source paths:

apps/backend/**

apps/frontend/**

The duplicated apps/apps/** tree must be treated as a parallel copy, not as the primary runtime source.

2) Monorepo / tooling state
Root-level tooling

Root tooling currently contains:

Husky

lint-staged

root guard scripts

no root workspace orchestration for both apps together

no single root TypeScript build pipeline for backend + frontend together

Root Git hooks

Current hooks:

.husky/pre-commit → npx lint-staged

.husky/pre-push → npm run guards:all

Root scripts

Current root script:

npm run guards:all

This script is used for guard enforcement, not for full monorepo build orchestration.

3) CI / deployment targeting
GitHub CI

GitHub CI targets:

backend working directory: apps/backend

frontend working directory: apps/frontend

This confirms the active build targets.

Docker / infra

Current root docker-compose.yml provisions:

Redis

No full backend + frontend local orchestration is the primary source of truth in the scanned state.

4) Backend runtime architecture
Backend stack

The backend currently uses:

Node.js

Express

TypeScript

BullMQ

Redis

Supabase

Stripe

Zod

Multer

Google Gemini

Backend entrypoints

Primary runtime files:

apps/backend/src/server.ts

apps/backend/src/app.ts

Server boot

server.ts currently:

creates the HTTP server

starts the main API

imports background workers

starts schedulers used by the backend runtime

App bootstrap

app.ts mounts middleware in this order:

security middleware

observability middleware

Stripe webhook raw-body route

global rate limit

CORS

JSON/urlencoded parsers

cookie parser

dev logger

OpenAPI routes

direct /ai/expert route mount

main router /

404 handler

global error handler

Important behavior

Stripe webhook raw body remains mounted before JSON parsing. This ordering is architecturally critical and must not regress.

5) Backend routing map
Central router

Main router file:

apps/backend/src/routes/index.ts

Public route

/health

Public webhook route

/erp/webhooks

Authenticated business routes

Mounted route families include:

/stripe

/dashboard

/devis

/quotes

/sales-invoices

/purchase-bills

/payments

/clients

/projects

/usage

/integrations

/ai

/assistant

/compta

/vision

/vocal

/automation

Root mounted routers

Some routers are mounted at / because the path is defined inside the router:

invoice lines

project expenses

project accounting imports

Direct mount outside central router

Expert routes are mounted directly in app.ts:

/ai/expert/*

Legacy routing status

The legacy backend route family /invoices is no longer part of the active backend router. The canonical backend route family for customer invoices is now:

/sales-invoices

6) Backend middleware architecture

Current middleware families include:

auth.middleware.ts

can.middleware.ts

error.middleware.ts

httpLogger.middleware.ts

observability.middleware.ts

quota.middleware.ts

rateLimit.middleware.ts

requirePermission.middleware.ts

requireRole.middleware.ts

security.middleware.ts

validate.middleware.ts

Auth runtime shape

authMiddleware injects:

req.user = {
  id: string,
  email?: string,
  role: "user" | "admin" | "free" | "pro",
  permissions: Permission[]
}
Auth sources of truth

Authentication flow:

token validation → Supabase Auth

role lookup → public.profiles.role

permissions → user.app_metadata.permissions if present

fallback permissions → derived from role

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

error.middleware.ts supports:

Zod validation errors

Multer errors

QuotaError

HttpError

Stripe signature errors

unknown exceptions

Important note

sendError() does not currently support a details parameter. The centralized error middleware can still attach structured details.

8) Validation architecture

Validation system uses:

Zod schemas

route-level schema parsing

middleware validation helpers where applicable

Validated inputs include:

req.body

req.params

req.query

Multipart rule

For multipart routes:

Multer handles files

MIME validation checks file types

Zod validates body fields

Controllers must not rely on unvalidated input.

9) Database source of truth

Primary provisioning source:

apps/backend/supabase/migrations/*

Legacy SQL snapshots may still exist, but they are not the provisioning truth.

10) Canonical business tables

The application is now organized around the canonical accounting model. Key active tables include:

contacts

projects

sales_invoices

purchase_bills

invoice_lines

payments

payment_allocations if present in schema rollout

external_id_map

sync_events

subscriptions

ai_quota

ai_logs

ai_usage

quotes

integrations

integration_tokens

integration_sync_state

profiles

Legacy table status

The legacy invoices table and legacy backend invoice service/routes are no longer the active source of truth for customer invoices. Customer invoice runtime flows must use sales_invoices.

11) Profiles table rule

profiles currently contains identity / account fields such as:

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

free

pro

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

Quota consumption must use the dedicated RPC / service flow. Node code must not directly mutate ai_quota.used outside the approved quota path.

14) AI / BullMQ architecture
Queue files

queues/ai.queue.ts

workers/ai.worker.ts

integration and reminder workers in dedicated worker files

Async flow

Typical AI flow:

request validated

quota pre-check

job enqueue

worker executes AI

quota consumed

status retrieved by polling endpoint

Status normalization

Queue/job statuses normalize to:

pending

processing

completed

failed

Ownership checks ensure users can only read their own jobs.

15) Gemini AI service
Core file

services/ai/gemini.service.ts

AI types

Active feature families include:

assistant

devis

compta

vision

relance

vocal

expert

Current model family

Gemini remains the active AI provider in the scanned architecture. Compta outputs must remain strict JSON when structured output is required.

16) AI persistence
Tables used

ai_logs

ai_usage

ai_exports

ai_logs stores

feature

prompt

response

response_json

tokens_used

status

created_at

Important endpoint

GET /ai/compta/latest

Backend persisted ai_logs.response_json remains the durable source of truth for compta report restoration.

17) Expert chat persistence
Tables

expert_conversations

expert_messages

Persistence handler

services/expertConversation.service.ts

Expert history is stored server-side.

18) Stripe architecture
Routes

stripe.routes.ts

stripe.webhook.ts

Critical rule

Stripe webhook must remain mounted before JSON body parsing.

Subscription source of truth

subscriptions

Stripe events table

stripe_events

Typing rule

Runtime fields accessed through Stripe objects must use safe runtime access patterns compatible with the installed Stripe version. No @ts-ignore should be introduced for Stripe typing workarounds.

19) Canonical accounting architecture
Customer invoices

Customer invoices now use:

table: sales_invoices

route family: /sales-invoices

backend service: salesInvoices.service.ts

frontend service: salesInvoices.api.ts

Purchase bills

Supplier bills use:

table: purchase_bills

route family: /purchase-bills

backend service: purchaseBills.service.ts

Payments

Payments use:

table: payments

route family: /payments

Invoice lines

Invoice lines are shared canonical lines with explicit type separation:

table: invoice_lines

type = "sale" | "purchase"

Mapping / sync

External system mapping uses:

external_id_map

sync_events

Quotes conversion

Quotes convert into canonical customer invoices. Quote → invoice conversion now targets sales_invoices, not legacy invoices.

20) Sales invoice lifecycle rules
Canonical statuses

The canonical customer invoice lifecycle is:

draft

sent

paid

overdue

canceled

Editability rules

Current intended business rules are:

draft

header editable

invoice lines editable

invoice deletable

sent

limited header editing only

invoice lines locked

deletion forbidden

overdue

limited header editing only

invoice lines locked

deletion forbidden

paid

read-only

deletion forbidden

canceled

read-only

deletion forbidden

Totals rule

Canonical totals use:

subtotal_cents

tax_cents

total_cents

Legacy amount field names such as total_amount_cents are no longer canonical for customer invoices.

21) Purchase bill lifecycle rules
Canonical statuses

The canonical supplier bill lifecycle is:

draft

posted

paid

overdue

canceled

Totals rule

Canonical totals use:

subtotal_cents

tax_cents

total_cents

Origin type rule

Canonical origin_type for purchase bills is restricted to the purchase-bill model, not copied from legacy invoice enums.

22) Dashboard architecture
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

Dashboard UI includes:

Dashboard.tsx

DashboardRevenue.tsx

DashboardUnpaid.tsx

DashboardQuotes.tsx

Current state

Dashboard revenue and unpaid views are now aligned with canonical sales invoice flows rather than the removed legacy invoices service.

23) Frontend architecture
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

24) Frontend accounting routing
Canonical routes

The active accounting routes are:

/sales-invoices

/purchase-bills

/payments

Legacy route status

Legacy invoice pages have been neutralized or removed from active business flow. Any remaining legacy route references must be treated as compatibility / redirection only, not as active source paths.

Rule

New accounting work must target canonical routes and canonical services only.

25) Frontend compta persistence
Store

store/comptaReport.store.ts

Backend restore endpoint

GET /ai/compta/latest

Source of truth rule

Backend persisted compta analysis remains the durable source of truth. Frontend store is only a client-side cache / restore helper.

26) Expert UI architecture
Files

ExpertHubPanel.tsx

ExpertChatPanel.tsx

AiModePanel.tsx

AssistantPanel.tsx

Layout.tsx

Layout.tsx manages expert UI state and open events. Conversation persistence remains server-side.

27) Theme system
Theme files

index.css

uiTheme.store.ts

uiExperience.store.ts

Themes

classic

midnight

sunset

Experience modes

embedded-lite

embedded-panel

Some legacy utility classes may still exist in CSS, but they are not part of the accounting refactor source of truth.

28) Guard system

Guard scripts include checks such as:

error shape

no console in frontend guarded files

no ts-ignore

no direct quota writes

no profiles misuse

no hardcoded UI colors where applicable

The guard system remains an anti-regression layer, not a substitute for architecture review.

29) Immutable architecture rules

A change is considered a regression if it:

reintroduces /invoices as the active customer-invoice backend route family

makes legacy invoices the source of truth again for customer invoices

stores plan or quota in profiles

bypasses the approved quota flow

breaks Stripe webhook raw-body ordering

treats apps/apps/* as the primary source

removes plan normalization

breaks AI job ownership checks

breaks compta persistence restore flow

reintroduces uncontrolled invoice creation from obsolete list flows

allows sales invoice line mutation outside the allowed lifecycle states

mixes customer invoices and supplier bills back into one model

30) Current known residual debt

The major structural refactor is complete for the customer-invoice migration. Remaining debt is primarily:

documentation freshness

optional removal of stale comments / labels mentioning legacy invoice wording

optional cleanup of compatibility redirects if still present in UI

There is no known remaining blocking build error in the stabilized canonical accounting path.

31) Session workflow rule

At the beginning of any architecture session:

use the latest pushed repo state as the source of truth

read this document first

verify runtime routes and services against active files

avoid relying on outdated chat memory if repo state changed

32) Final stability rule

Any modification that violates the rules defined in this document is considered a critical architectural regression.

This rule is architecturally immutable.