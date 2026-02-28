# ARCHITECTURE_CURRENT_STATE (ArtisanPro)

> This document is the **single source of truth** for the current architecture + the anti-regression rules.
> It is meant to be read at the beginning of each new session.

---

## ✅ Changelog (only the fixes made during THIS chat)

### 1) Anti-regression guards added (repo-level)
- Added **Husky hooks**:
  - `.husky/pre-commit` → runs `npx lint-staged`
  - `.husky/pre-push` → runs `npm run guards:all`
- Added **lint-staged** config (root `package.json`) to block regressions on staged files:
  - Backend guards:
    - `node scripts/guards/guard-error-shape.mjs`
    - `node scripts/guards/guard-profiles-misuse.mjs` (profiles can only be queried for `id, role, full_name, created_at`)
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

### 3) DB ↔ code alignment for Stripe subscriptions
- The live DB table `public.subscriptions` is expected to include Stripe fields (source of truth for billing):
  - `stripe_customer_id`, `stripe_subscription_id`, `current_period_end`, `updated_at` (+ base fields)
- In the repo, this alignment is now captured via SQL migrations:
  - `apps/backend/database/migrations/20260228_add_subscriptions_stripe_fields.sql`

> Note: `apps/backend/database/schema.sql` still contains the earlier baseline schema. The effective schema is: `schema.sql` + migrations.

### 4) Frontend plan normalization fixes (lowercase only)
- Frontend now treats plan as **lowercase** (`"free" | "pro"`) and normalizes API values:
  - `apps/frontend/src/context/user.context.tsx`: `normalizePlan`, `normalizeStatus`, `isProActive`
  - `apps/frontend/src/App.tsx`: uses normalizers (no more `"FREE" | "PRO"` typed plan)

---

# Choix quota

Source de vérité quota : table `ai_quota` (`monthly_limit`, `used`, `reset_at`).

Consommation atomique : uniquement via RPC PostgreSQL `public.consume_ai_quota(uid uuid, amt int)` (transaction + `FOR UPDATE` + reset mensuel + incrément).

Pré-check (avant appel IA) : middleware **checkQuota** (lecture-only) :

- lit `subscriptions` → si PRO active : bypass
- lit `ai_quota` → refuse si `used + weight > limit`
- ne fait aucun reset, aucune écriture DB.

Consommation réelle (après succès IA) : `quotaService.recordUsage(...)` appelle la RPC `consume_ai_quota`.

Suppression cache UI : aucune écriture quota/plan dans `profiles` (pas de `monthly_quota_*`, `quota_reset_at`, etc.).

Poids : `FEATURE_WEIGHTS` (ex: vision, compta…) → `amt >= 1` garanti.

# Choix plan

DB standard : `subscriptions.plan` stocké en lowercase uniquement : `free | pro`.

Normalization unique : helper central `normalizePlan(plan?: string|null) -> "free"|"pro"`.

Status unique : helper `normalizeStatus(status?: string|null) -> SubscriptionStatus`.

Eligibilité PRO : `isProActive(plan, status)` (`pro` + `active/trialing`).

Règle : toute comparaison/écriture plan passe par `normalizePlan` (pas de `.toUpperCase()` / `.toLowerCase()` dispersés).

# Choix auth

Format unique `req.user` (backend) :

`{ id: string; email?: string; role: "user" | "admin"; permissions: Permission[] }`

Injection : `authMiddleware` :

- valide le Bearer token via Supabase
- récupère `role` depuis `profiles.role` (fallback `"user"`)
- récupère permissions depuis `user.app_metadata.permissions` (filtrées via union)

Typing : augmentation Express dans `apps/backend/src/types/express/index.d.ts`:

`declare global namespace Express { interface Request { user?: AuthUser } }`

Règle : aucun `req as any` pour `req.user` en dehors de cas exceptionnels (Stripe runtime typing ok).

# Format erreurs

Format unique pour toutes les erreurs API :

```json
{
  "success": false,
  "error": { "code": "string", "message": "string" },
  "details": {},
  "requestId": "string"
}
```

Helper unique : `sendError(req, res, status, code, message, details?)`.

Middleware global : `error.middleware.ts` :

- gère `ZodError` → 400 + `validation_error` + `details.issues`
- gère `QuotaError` → 403/429 selon mapping + meta en details
- gère `HttpError` → status + code/message
- fallback → 500 `internal_error`

Règle : `validate.middleware`, `auth.middleware`, `cors`, `404`, `checkQuota` doivent tous utiliser `sendError` (pas de `{ message }` ou `{ success:false, error:"..." }`).

# Endpoints clés

## Auth
- POST `/auth/register`
- POST `/auth/login`
- POST `/auth/refresh`
- POST `/auth/logout`
- GET `/auth/me`

## Vision (multipart)
- POST `/vision/analyze` — `multipart/form-data`, champ fichier image, auth + precheck quota, consommation quota après succès.
- GET `/vision/history`
- GET `/vision/:id`

## Devis / Vocal (si présents)
- POST `/devis/...` (selon ton routing)
- POST `/vocal/...` (upload audio en multipart)

## Billing / Stripe
- POST `/stripe/webhook` — raw body (AVANT `express.json`)
- endpoints checkout/portal si présents (ex: `/stripe/checkout`, `/stripe/portal`)

## Quota / Usage
- GET `/quota` (si exposé)
- RPC DB : `consume_ai_quota(uid, amt)` (source de vérité conso)

---

# 🚨 NON-NEGOTIABLE BACKEND CONSTRAINTS (ANTI-REGRESSION RULES)

These rules MUST NEVER be violated in future refactors, file rewrites, or new feature additions.

If a future change contradicts these rules, it is considered a regression.

---

## 1️⃣ Unified Error Response Format (MANDATORY)

All API errors MUST follow this structure:

```json
{
  "success": false,
  "error": {
    "code": "string_code",
    "message": "Human readable message"
  },
  "details": "optional"
}
```

### ❌ Forbidden patterns

- `res.json({ success:false, error:"..." })`
- `res.status(...).json({ error:"..." })`
- `res.json({ success:false, message:"..." })`

### ✅ Allowed patterns only

- `return sendError(req, res, status, code, message, details?)`
- **OR** `throw new HttpError(status, code, message, details)`

Handled centrally by `error.middleware.ts`.

No exception.

---

## 2️⃣ profiles Table Is NOT A Cache

The table `public.profiles` contains ONLY:

- `id`
- `full_name`
- `role`
- `created_at`

It MUST NEVER contain:
- plan
- subscription_status
- email
- quota fields
- monthly counters

All subscription logic → `public.subscriptions`
All quota logic → `public.ai_quota` + RPC `consume_ai_quota`

Any reference to:
- `profiles.plan`
- `profiles.email`
- `monthly_quota_*`
- `quota_reset_at`
- `subscription_status`

is a regression.

---

## 3️⃣ Quota Architecture Rules

Quota check:
- Performed by `quotaMiddleware` / `checkQuota`
- **READ-ONLY**
- Never writes to DB

Quota consumption:
- **ONLY** via RPC: `consume_ai_quota(uid, amt)`
- Called **AFTER** successful AI execution

Never manually `UPDATE ai_quota.used` outside RPC.

---

## 4️⃣ Stripe v20 Constraints

When accessing Stripe runtime-only fields:
- `(obj as any).current_period_end`
- `(invoice as any).subscription`

No `@ts-ignore` allowed.

No custom Stripe type overrides.

---

## 5️⃣ Single Source of Truth

Subscriptions:
→ `public.subscriptions`

Quota:
→ `public.ai_quota`

Authentication:
→ Supabase Auth

`profiles` is NOT business logic storage.

---

## 6️⃣ Regression Detection

### Automated (recommended)
- `npm run guards:all`
- Git hooks:
  - pre-commit: `lint-staged` runs guards on staged files
  - pre-push: runs `guards:all`

### Manual searches

```powershell
Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'success\s*:\s*false\s*,\s*error\s*:\s*["'']'

Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'profiles\.plan|monthly_quota_|quota_reset_|subscription_status'

Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'update\("ai_quota"\)|\.update\({[^}]*used'
```

If any violation appears → fix required.

---

# 🔐 ARCHITECTURAL IMMUTABILITY PROTOCOL
## (Mandatory Workflow For Every New Session)

This protocol defines how the project must evolve without introducing regressions.

It applies to:
- New features
- Refactors
- File rewrites
- Hotfixes
- Stripe updates
- Quota updates
- Error handling changes

If this protocol is not followed, the architecture is considered unstable.

---

# 1️⃣ Session Boot Sequence (MANDATORY)

At the beginning of every new ChatGPT session:

1. Upload FULL project ZIP
2. Require a complete scan of ALL files
3. Require reading of:
   - `ARCHITECTURE_CURRENT_STATE.md`
   - Database schema (`schema.sql` + migrations, or Supabase dump)

No assumptions allowed.
No partial memory allowed.
No inferred structure allowed.

All decisions must be based on the uploaded code only.

---

# 2️⃣ No Full File Regeneration Without Justification

Rule:

Full file rewrites are forbidden unless:
- The file is fundamentally broken
- The architecture requires structural redesign
- Explicitly requested

Preferred method:
- Provide targeted patches
- Replace specific blocks only
- Preserve untouched logic

Reason:
Full rewrites increase regression risk.

---

# 3️⃣ Mandatory Post-Modification Verification

After any backend modification, the following checks MUST be run:

### Error shape validation

```powershell
Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'success\s*:\s*false\s*,\s*error\s*:\s*["'']'
```

Expected result: **NONE**

---

### profiles misuse validation

```powershell
Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'profiles\.plan|monthly_quota_|quota_reset_|subscription_status'
```

Expected result: **NONE**

---

### Quota write validation

```powershell
Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'update\("ai_quota"\)|\.update\({[^}]*used'
```

Expected result:
- Only inside RPC definition (if present)
- Never inside middleware or controller.

---

If any violation appears → modification is rejected.

---

# 4️⃣ Error Handling Architecture Is Immutable

All errors MUST follow:

```json
{
  "success": false,
  "error": {
    "code": "...",
    "message": "..."
  },
  "details": "optional"
}
```

Allowed mechanisms:
- `return sendError(...)`
- `throw new HttpError(...)`

Forbidden:
- `res.json({ success:false, error:"..." })`
- `res.json({ error:"..." })`
- `res.json({ success:false, message:"..." })`

---

# 5️⃣ Quota System Rules (Immutable)

Pre-check:
- `checkQuota` (or `quotaMiddleware`)
- **READ-ONLY**
- No DB writes

Consumption:
- Only via RPC `consume_ai_quota(uid, amt)`
- Only after successful AI execution

No manual increment of `ai_quota.used` allowed.

---

# 6️⃣ profiles Table Is Structural Only

`profiles` contains only:
- `id`
- `full_name`
- `role`
- `created_at`

It is NOT:
- a cache
- a subscription store
- a quota store
- an email store

All subscription logic → `subscriptions`
All quota logic → `ai_quota`

---

# 7️⃣ Stripe Integration Rules

- Stripe v20 only
- Runtime-only fields accessed via `(obj as any)`
- No `@ts-ignore`
- `subscriptions` table is single source of truth

---

# 8️⃣ Decision Hierarchy

When in doubt:

1. `ARCHITECTURE_CURRENT_STATE.md`
2. Database schema
3. Existing production logic
4. Minimal change principle

Never redesign unless explicitly requested.

---

# 9️⃣ Stability Principle

The system must evolve by:

- Adding layers
- Improving modules
- Refactoring internally

But never by breaking invariants defined in this document.

---

# 🔟 Definition of Regression

A regression is:

- Reintroducing forbidden error shapes
- Writing business logic into `profiles`
- Writing quota outside RPC
- Creating duplicate middleware logic
- Breaking unified response format

Any regression invalidates the change.
