# ARCHITECTURE_CURRENT_STATE (ArtisanPro)

> This document is the **single source of truth** for the current architecture + the anti-regression rules.  
> It is meant to be read at the beginning of each new session.
>
> Note: `ARCHITECTURE_CURRENT_STATE2.md` has been renamed to **`ARCHITECTURE_CURRENT_STATE.md`** and we keep this name.

---

## ✅ Changelog (only the fixes made during THIS chat)

### 1) Anti-regression guards added (repo-level)
- Added **Husky hooks**:
  - `.husky/pre-commit` → runs `npx lint-staged`
  - `.husky/pre-push` → runs `npm run guards:all`
- Added **lint-staged** config (root `package.json`) to block regressions on staged files:
  - Backend guards:
    - `node scripts/guards/guard-error-shape.mjs`
    - `node scripts/guards/guard-profiles-misuse.mjs`
    - `node scripts/guards/guard-quota-writes.mjs`
  - Frontend guard: currently **no ESLint** in hooks (ESLint temporarily removed because `eslint` was not installed).
- Added script: `npm run guards:all` → `node scripts/guards/run-all.mjs`

### 2) Error response format regression fixed on key backend files
Replaced remaining forbidden patterns (`{ success:false, error:"..." }`) with **sendError(...)** in:
- `apps/backend/src/middlewares/rateLimit.middleware.ts`
- `apps/backend/src/middlewares/requireRole.middleware.ts`
- `apps/backend/src/routes/stripe.routes.ts`
- `apps/backend/src/routes/stripe.webhook.ts` (errors)
- `apps/backend/src/controllers/vision.controller.ts` (GET /vision/:id)
- `apps/backend/src/controllers/vocal.controller.ts` (413/415 in upload middleware)

### 3) DB schema is now provisioned via Supabase migrations (source of truth)
- ✅ **Source of truth (provisioning):** `apps/backend/supabase/migrations/*.sql`
  - Core tables: `20260302110000_create_core_tables.sql`
  - Quota RPCs: `ensure_ai_quota`, `consume_ai_quota`
  - Automation RPCs: `take_next_invoice_to_remind`, `mark_invoice_reminded`
  - DB guardrails: constraints/indexes/FKs via `20260302120300_audit_db_constraints_indexes_fk.sql`
  - Monthly analytics guardrails (optional): `user_usage` uniqueness + view (via dedicated migration if present)
- ⚠️ `apps/backend/database/schema.sql` is kept as a **legacy snapshot** (not used for provisioning).
- ⚠️ `apps/backend/database/migrations/*` are **legacy/manual SQL** (not applied by Supabase CLI unless ported into `supabase/migrations`).

### 4) Frontend plan normalization fixes (lowercase only)
- Frontend now treats plan as **lowercase** (`"free" | "pro"`) and normalizes API values:
  - `apps/frontend/src/context/user.context.tsx`: `normalizePlan`, `normalizeStatus`, `isProActive`
  - `apps/frontend/src/App.tsx`: uses normalizers (no more `"FREE" | "PRO"` typed plan)

### 5) ✅ New architectural rules to prevent “spam loops” + invalid AI JSON regressions
We observed 2 recurring failure modes during the chat:
- **Spam / loops**: repeated calls to `/dashboard` and high-frequency polling to `/ai/status/:id`.
- **Invalid JSON**: AI returns text / Markdown / malformed JSON → frontend schema parse fails → poor UX and sometimes polling confusion.

✅ We lock these new rules:

#### 5.1 Single “Dashboard hydration” owner (no duplicated fetch)
- **ONLY `App.tsx`** is allowed to fetch `/dashboard` for session hydration (plan/status/quota/user).
- Pages (ex: `Dashboard.tsx`) must **not** do extra “best effort” `/dashboard` calls unless there is a strict functional reason.
- Reason: duplicated `/dashboard` fetch creates noisy logs (`OPTIONS`, repeated “Utilisateur authentifié”), and makes it harder to detect real regressions.

#### 5.2 Polling is strictly single-instance + must always stop
Frontend polling for async AI jobs (e.g. `/ai/status/:jobId`) MUST follow:
- Only **one polling loop per jobId** (guard with `isPollingRef` or equivalent).
- Always clear polling in ALL terminal cases:
  - `status === "completed"`
  - `status === "failed"`
  - any thrown error / network error
  - component unmount (cleanup)
- Avoid overlapping requests:
  - Prefer a `setTimeout` loop (schedule next tick only after previous completes), OR
  - If using `setInterval`, ensure no concurrent in-flight tick (lock boolean) and always clear on completion.
- 429 backoff is allowed/encouraged; but it must not restart infinite loops.

#### 5.3 Backend must never “complete” with invalid compta payload
For `feature="compta"` (and any route expecting “strict JSON”), backend MUST guarantee:

- Persist BOTH:
  - `response_raw` (string, debug)
  - `response_json` (JSONB, validated payload)
- If AI output cannot be parsed or does not validate against the expected schema:
  - mark job as `failed`
  - return `status="failed"` with an error code like `invalid_ai_json`
  - NEVER mark as `completed` with a broken payload
- Reason: if backend returns “completed” with invalid content, frontend will fail Zod parse and user sees “JSON invalide”, plus polling logic becomes harder to reason about.

#### 5.4 Multi-device restore must return JSON (not a wrapper mismatch)
If frontend restores the last compta report via backend endpoint:
- Endpoint should return a JSON payload that is easy to validate.
- If the API returns a wrapper `{ success: true, report: ... }`, frontend must parse **`report`**, not the wrapper.
- “No report” should return **404 or 204** (both ok) and frontend handles silently.

---

# Choix quota

Source de vérité quota : table `ai_quota` (`monthly_limit`, `used`, `reset_at`).

## Immuable (non négociable)
- **`ai_quota.used` ne peut être modifié QUE via la RPC PostgreSQL** :
  - `public.consume_ai_quota(uid uuid, amt int)`
  - (transaction + `FOR UPDATE` + reset mensuel + incrément)

➡️ Interdit :
- tout `UPDATE ai_quota SET used = ...` en dehors de cette RPC
- tout `INSERT INTO ai_quota` depuis le code Node runtime
- toute requête SQL directe (`pool.query`) modifiant `ai_quota.used`

## Autorisé & contrôlé (init / paramétrage)
- La création de la ligne `ai_quota` (si absente) et l’ajustement de **`monthly_limit` / `reset_at`** sont autorisés **uniquement via des RPC dédiées et contrôlées** :
  - `public.ensure_ai_quota(uid uuid)`  
    (crée la row si absente, réaligne `reset_at` si nécessaire, ne touche jamais `used`)
  - `public.set_ai_quota_limit(uid uuid, new_limit int)` (si implémentée)  
    (modifie `monthly_limit` de manière contrôlée)

➡️ Interdit :
- tout `UPDATE ai_quota.monthly_limit` depuis Node
- tout `UPDATE ai_quota.reset_at` depuis Node

## Pré-check (avant appel IA) : middleware `quotaMiddleware` (lecture-only)
- lit `subscriptions` → si PRO active : bypass
- lit `ai_quota` → refuse si `used + weight > limit`
- ne fait aucun reset, aucune écriture DB.
- si quota dépassé → **403** avec `code="quota_exceeded"` et `details` (pour UI upgrade) :
  - `{ feature, used, limit, weight, resetAt }`

## Consommation réelle (après succès IA)
- `quotaService.recordUsage(...)` appelle exclusivement `consume_ai_quota`.

Suppression cache UI : aucune écriture quota/plan dans `profiles` (pas de `monthly_quota_*`, `quota_reset_at`, etc.).

Poids : `FEATURE_WEIGHTS` (ex: vision, compta…) → `amt >= 1` garanti.

---

# Choix plan

DB standard : `subscriptions.plan` stocké en lowercase uniquement : `free | pro`.

Normalization unique : helper central `normalizePlan(plan?: string|null) -> "free"|"pro"`.

Status unique : helper `normalizeStatus(status?: string|null) -> SubscriptionStatus`.

Eligibilité PRO : `isProActive(plan, status)` (`pro` + `active/trialing`).

Règle : toute comparaison/écriture plan passe par `normalizePlan` (pas de `.toUpperCase()` / `.toLowerCase()` dispersés).

---

# Choix auth

Format unique `req.user` (backend) :

```ts
{
  id: string;
  email?: string;
  role: "user" | "admin";
  permissions: Permission[];
}

Injection : authMiddleware :

valide le Bearer token via Supabase

récupère role depuis profiles.role (fallback "user")

récupère permissions depuis user.app_metadata.permissions (filtrées via union)

Typing : augmentation Express dans apps/backend/src/types/express/index.d.ts:
declare global namespace Express { interface Request { user?: AuthUser } }

Règle : aucun req as any pour req.user en dehors de cas exceptionnels (Stripe runtime typing ok).

Format erreurs

Format unique pour toutes les erreurs API :

{
  "success": false,
  "error": { "code": "string", "message": "string" },
  "requestId": "string",
  "details": {}
}

requestId est toujours présent (au minimum "unknown").

details est optionnel (présent uniquement quand utile : quota, validation, debug contrôlé).

Helper unique : sendError(req, res, status, code, message, details?).

Middleware global : error.middleware.ts :

gère ZodError → 400 + validation_error + details.issues

gère QuotaError → 403/429 selon mapping + meta en details

gère HttpError → status + code/message

fallback → 500 internal_error

Règle : validate.middleware, auth.middleware, cors, 404, quotaMiddleware doivent tous utiliser sendError (pas de { message } ou { success:false, error:"..." }).

Endpoints clés
Auth

POST /auth/register

POST /auth/login

POST /auth/refresh

POST /auth/logout

GET /auth/me

Vision (multipart)

POST /vision/analyze — multipart/form-data, champ fichier image, auth + precheck quota, consommation quota après succès.

GET /vision/history

GET /vision/:id

Devis / Vocal (si présents)

POST /devis/... (selon ton routing)

POST /vocal/... (upload audio en multipart)

Billing / Stripe

POST /stripe/webhook — raw body (AVANT express.json)

endpoints checkout/portal si présents (ex: /stripe/checkout, /stripe/portal)

AI async (BullMQ)

POST /ai/run

GET /ai/status/:jobId

GET /ai/export/:jobId?format=json|csv (si présent)

✅ Multi-device restore (compta):

GET /ai/compta/latest

MUST be auth-required (req.user.id)

MUST return last completed report for feature=compta

MUST return JSON payload (response_json) and not only raw text

🚨 NON-NEGOTIABLE BACKEND CONSTRAINTS (ANTI-REGRESSION RULES)

These rules MUST NEVER be violated in future refactors, file rewrites, or new feature additions.

If a future change contradicts these rules, it is considered a regression.

1️⃣ Unified Error Response Format (MANDATORY)

All API errors MUST follow this structure:

{
  "success": false,
  "error": {
    "code": "string_code",
    "message": "Human readable message"
  },
  "requestId": "string",
  "details": {}
}

requestId is ALWAYS present (at minimum "unknown").

details is OPTIONAL (can be omitted).

❌ Forbidden patterns

res.json({ success:false, error:"..." })

res.status(...).json({ error:"..." })

res.json({ success:false, message:"..." })

✅ Allowed patterns only

return sendError(req, res, status, code, message, details?)

OR throw new HttpError(status, code, message, details)

Handled centrally by error.middleware.ts. No exception.

2️⃣ profiles Table Is NOT A Cache

The table public.profiles contains ONLY:

id

full_name

company_name

email

role

created_at

It MUST NEVER contain:

plan

subscription_status

quota fields

monthly counters

Note:

email is allowed for read purposes only.

email must never be logged.

plan/status/quota must never be sourced from profiles.

All subscription logic → public.subscriptions
All quota logic → public.ai_quota + RPC consume_ai_quota

Any reference to:

profiles.plan

subscription_status

monthly_quota_*

quota_reset_at

is a regression.

3️⃣ Quota Architecture Rules

Quota check:

Performed by quotaMiddleware

READ-ONLY

Never writes to DB

Quota consumption:

ONLY via RPC: consume_ai_quota(uid, amt)

Called AFTER successful AI execution

Never manually UPDATE ai_quota.used outside RPC.

4️⃣ Stripe v20 Constraints

When accessing Stripe runtime-only fields:

(obj as any).current_period_end

(invoice as any).subscription

No @ts-ignore allowed.
No custom Stripe type overrides.

5️⃣ Single Source of Truth

Subscriptions → public.subscriptions
Quota → public.ai_quota
Authentication → Supabase Auth

AI usage events (runtime) → public.ai_usage

Monthly analytics (optional) → public.user_usage (+ public.user_usage_view)

profiles is NOT business logic storage.

DB provisioning source of truth → apps/backend/supabase/migrations/*

6️⃣ Regression Detection
Automated (recommended)

npm run guards:all

Git hooks:

pre-commit: lint-staged runs guards on staged files

pre-push: runs guards:all

Manual searches

Select-String -Path "apps/backend/src/**/.ts" -Pattern 'success\s:\sfalse\s,\serror\s:\s*["'']'

Expected result: NONE

Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'profiles.plan|subscription_status|monthly_quota_|quota_reset_at'

Expected result: NONE

Select-String -Path "apps/backend/src/**/*.ts" -Pattern '.update\(\s*["'']ai_quota["'']|\.update\(\{[^}]*used'

Expected result: only inside RPC definitions (DB), never in Node code

If any violation appears → fix required.

🔒 ARCHITECTURAL IMMUTABILITY PROTOCOL

(Mandatory Workflow For Every New Session)

This protocol defines how the project must evolve without introducing regressions.

It applies to:

New features

Refactors

File rewrites

Hotfixes

Stripe updates

Quota updates

Error handling changes

If this protocol is not followed, the architecture is considered unstable.

1️⃣ Session Boot Sequence (MANDATORY)

At the beginning of every new ChatGPT session:

Upload FULL project ZIP

Require a complete scan of ALL files

Require reading of:

ARCHITECTURE_CURRENT_STATE.md

Database schema (Supabase migrations + live DB)

No assumptions allowed.
No partial memory allowed.
No inferred structure allowed.
All decisions must be based on the uploaded code only.

2️⃣ No Full File Regeneration Without Justification

Rule:
Full file rewrites are forbidden unless:

The file is fundamentally broken

The architecture requires structural redesign

Explicitly requested

Preferred method:

Provide targeted patches

Replace specific blocks only

Preserve untouched logic

Reason: Full rewrites increase regression risk.

3️⃣ Mandatory Post-Modification Verification

After any backend modification, the following checks MUST be run:

Error shape validation
Select-String -Path "apps/backend/src/**/.ts" -Pattern 'success\s:\sfalse\s,\serror\s:\s*["'']'
Expected result: NONE

profiles misuse validation
Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'profiles.plan|subscription_status|monthly_quota_|quota_reset_at'
Expected result: NONE

Quota write validation
Select-String -Path "apps/backend/src/**/*.ts" -Pattern '.update\(\s*["'']ai_quota["'']|\.update\(\{[^}]*used'
Expected result: never in Node code, only DB/RPC

If any violation appears → modification is rejected.

4️⃣ Error Handling Architecture Is Immutable

All errors MUST follow:

{
  "success": false,
  "error": { "code": "...", "message": "..." },
  "requestId": "string",
  "details": {}
}

Allowed mechanisms:

return sendError(...)

throw new HttpError(...)

Forbidden:

res.json({ success:false, error:"..." })

res.json({ error:"..." })

res.json({ success:false, message:"..." })

5️⃣ Quota System Rules (Immutable)

Pre-check:

quotaMiddleware

READ-ONLY

No DB writes

Consumption:

Only via RPC consume_ai_quota(uid, amt)

Only after successful AI execution

No manual increment of ai_quota.used allowed.

6️⃣ profiles Table Is Structural Only

profiles contains only:

id

full_name

company_name

email

role

created_at

It is NOT:

a cache

a subscription store

a quota store

an email business-logic source

All subscription logic → subscriptions
All quota logic → ai_quota

7️⃣ Stripe Integration Rules

Stripe v20 only

Runtime-only fields accessed via (obj as any)

No @ts-ignore

subscriptions table is single source of truth

8️⃣ Decision Hierarchy

When in doubt:

ARCHITECTURE_CURRENT_STATE.md

Database schema (Supabase migrations + live DB)

Existing production logic

Minimal change principle

Never redesign unless explicitly requested.

9️⃣ Stability Principle

The system must evolve by:

Adding layers

Improving modules

Refactoring internally
But never by breaking invariants defined in this document.

🔟 Definition of Regression

A regression is:

Reintroducing forbidden error shapes

Writing business logic into profiles

Writing quota outside RPC

Creating duplicate middleware logic

Breaking unified response format

Reintroducing spam loops (duplicate hydration or uncontrolled polling)

Marking AI jobs “completed” with invalid compta JSON payload

Any regression invalidates the change.

11️⃣ Input Validation Rules (Immutable)

All external inputs must be validated using Zod schemas.
This applies to:

req.body

req.params

req.query

No controller is allowed to access raw request data without prior validation.

Mandatory Pattern:
Each route must:

Define a Zod schema

Use validateStrip(schema, target)

Only use validated data (no manual casting without schema)

✅ Example (Compliant)

const AiChatBodySchema = z.object({
  type: z.string().min(1).max(40).optional(),
  prompt: z.string().min(1).max(10_000),
  context: z.unknown().optional(),
});

router.post(
  "/chat",
  validateStrip(AiChatBodySchema, "body"),
  async (req, res) => {
    const { type, prompt, context } =
      req.body as z.infer<typeof AiChatBodySchema>;
  }
);

Multipart Special Case:
For multipart routes:

Zod validates text fields

Multer validates file presence and size

Runtime check validates mime-type

Forbidden Patterns:

const { type } = req.body as { type?: string };

if (!req.body.prompt) { ... }

Manual validation without Zod schema is not allowed.

Architectural Objective:

Enforce strict API contracts

Eliminate manual validation logic

Prevent silent runtime inconsistencies

Prepare for future OpenAPI generation


---

## 12️⃣ UI Theme System (Design Tokens)

ArtisanPro uses a **theme-based design system**.

All UI colors must rely on **CSS variables**, not hardcoded Tailwind colors.

### ❌ Forbidden

Do NOT use hardcoded colors such as:

bg-white  
text-slate-900  
border-slate-200  
bg-slate-50  
text-gray-500  

These break the theme system.

### ✅ Required

Use theme tokens instead:

bg-[var(--theme-bg)]  
bg-[var(--theme-card)]  
text-[var(--theme-text)]  
text-[var(--theme-muted)]  
border-[var(--theme-border)]

Primary color:

bg-[var(--theme-primary)]  
text-[var(--theme-primary-contrast)]

### Theme tokens defined in:

apps/frontend/src/index.css

.app-theme  
.app-theme-classic  
.app-theme-midnight  
.app-theme-sunset

### Goal

Guarantee that all UI components support:

- classic theme
- midnight theme
- sunset theme

### Rule

Hardcoded Tailwind color tokens in UI components are considered **architecture violations**.

🔒 This rule is considered architecturally immutable.