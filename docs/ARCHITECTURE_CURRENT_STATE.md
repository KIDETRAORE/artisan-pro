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
    - `node scripts/guards/guard-profiles-misuse.mjs` (profiles can only be queried for `id, role, full_name, company_name, email, created_at`) 
    (no business fields allowed)
    - `node scripts/guards/guard-quota-writes.mjs`
  - Frontend guard:
    - `node scripts/guards/guard-no-console.mjs`
  - Note: `scripts/guards/guard-no-ts-ignore.mjs` exists in the repo (no `@ts-ignore`) but is not currently wired into `guards:all`.
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
  - `apps/backend/database/migrations/2026-02-28_add_subscriptions_stripe_fields.sql`
  - `apps/backend/database/migrations/2026-02-28_create_consume_ai_quota_rpc.sql`

> Note: `apps/backend/database/schema.sql` still contains the earlier baseline schema. The effective schema is: `schema.sql` + migrations.

### 4) Frontend plan normalization fixes (lowercase only)
- Frontend now treats plan as **lowercase** (`"free" | "pro"`) and normalizes API values:
  - `apps/frontend/src/context/user.context.tsx`: `normalizePlan`, `normalizeStatus`, `isProActive`
  - `apps/frontend/src/App.tsx`: uses normalizers (no more `"FREE" | "PRO"` typed plan)

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

## Pré-check (avant appel IA) : middleware `checkQuota` (lecture-only)
- lit `subscriptions` → si PRO active : bypass
- lit `ai_quota` → refuse si `used + weight > limit`
- ne fait aucun reset, aucune écriture DB.

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

Note : le backend peut encore contenir un type legacy en uppercase (ex: `"FREE" | "PRO"`), mais **toute logique** (comparaison/écriture/persistance) doit passer par `normalizePlan()` et ne doit jamais persister autre chose que lowercase en DB.

---

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

---

# Format erreurs

Format unique pour toutes les erreurs API :

```
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

---

# Endpoints clés (routes réellement montées)

## Public
- `GET /health/*`
- `POST /stripe/webhook` — raw body (AVANT `express.json`)

## Auth (via Supabase Bearer token / `authMiddleware`)
- `POST /stripe/*`
- `GET|POST /dashboard/*`
- `POST /devis/*`

## IA (auth + permission AI_USE + quota pre-check)
- `/ai/*`
- `/assistant/*`
- `/compta/*`
- `/vision/*`
- `/vocal/*`

## Admin
- `/automation/*` — `requireRole("admin")` + permissions + quota

---

# Known debt / Orphans (non montés)

- `user.routes.ts`
- `usage.routes.ts`
- `relance.routes.ts`

Ces routes existent dans `apps/backend/src/routes/` mais ne sont pas montées dans le router principal.

---

# 🚨 NON-NEGOTIABLE BACKEND CONSTRAINTS (ANTI-REGRESSION RULES)

These rules MUST NEVER be violated in future refactors, file rewrites, or new feature additions.

If a future change contradicts these rules, it is considered a regression.

---

## 1️⃣ Unified Error Response Format (MANDATORY)

All API errors MUST follow:

```
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
- `throw new HttpError(status, code, message, details)`

Handled centrally by `error.middleware.ts`.

No exception.

---

## 2️⃣ profiles Table Is NOT A Cache

The table `public.profiles` contains ONLY:

- `id`
- `full_name`
- `company_name`
- `email`
- `role`
- `created_at`

It MUST NEVER contain:
- plan
- subscription_status
- quota fields
- monthly counters
Note:
The `email` column is allowed for read purposes only.
It must never be logged or used as a business logic source.

All subscription logic → `public.subscriptions`  
All quota logic → `public.ai_quota` + RPC `consume_ai_quota`

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

- Stripe v20 only
- Runtime-only fields accessed via `(obj as any)`
- No `@ts-ignore`
- No custom Stripe type overrides

---

## 5️⃣ Single Source of Truth

Subscriptions → `public.subscriptions`  
Quota → `public.ai_quota`  
Authentication → Supabase Auth  

`profiles` is NOT business logic storage.

---

## 6️⃣ Regression Detection

### Automated
- `npm run guards:all`
- Git hooks (pre-commit / pre-push)
- GitHub Actions: `.github/workflows/guards.yml`

### Manual searches

```
Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'success\s*:\s*false\s*,\s*error\s*:\s*["'']'

Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'profiles\.plan|monthly_quota_|quota_reset_|subscription_status'

Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'update\("ai_quota"\)|\.update\({[^}]*used'

Select-String -Path "apps/frontend/src/**/*.{ts,tsx}" -Pattern "console\."

Select-String -Path "apps/**/*.{ts,tsx}" -Pattern "@ts-ignore"
```

If any violation appears → fix required.

---

# 🔐 ARCHITECTURAL IMMUTABILITY PROTOCOL

## 1️⃣ Session Boot Sequence (MANDATORY)

1. Upload FULL project ZIP  
2. Require complete scan of ALL files  
3. Require reading of:
   - `ARCHITECTURE_CURRENT_STATE.md`
   - Database schema (`schema.sql` + migrations)

No assumptions allowed.

---

## 2️⃣ No Full File Regeneration Without Justification

Full rewrites are forbidden unless:
- File is fundamentally broken
- Structural redesign required
- Explicitly requested

Preferred: targeted patches only.

---

## 3️⃣ Mandatory Post-Modification Verification

Run:

```
Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'success\s*:\s*false\s*,\s*error\s*:\s*["'']'
```

```
Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'profiles\.plan|monthly_quota_|quota_reset_|subscription_status'
```

```
Select-String -Path "apps/backend/src/**/*.ts" -Pattern 'update\("ai_quota"\)|\.update\({[^}]*used'
```

Expected result: NONE (except RPC definition).

---

## 4️⃣ Error Handling Architecture Is Immutable

Allowed:
- `return sendError(...)`
- `throw new HttpError(...)`

Forbidden:
- Any custom error JSON shape

---

## 5️⃣ Quota System Rules (Immutable)

Pre-check → read-only  
Consumption → RPC only  
No manual increments  

---

## 6️⃣ profiles Table Is Structural Only

`profiles` contains only:
- `id`
- `full_name`
- `company_name`
- `email`
- `role`
- `created_at`

It is NOT:
- a cache
- a subscription store
- a quota store

PII rule:
- `profiles.email` MUST NEVER be logged.

Never business logic.

---

## 7️⃣ Stripe Integration Rules

- Stripe v20
- `(obj as any)` for runtime fields
- No `@ts-ignore`
- `subscriptions` is source of truth

---

## 8️⃣ Decision Hierarchy

1. `ARCHITECTURE_CURRENT_STATE.md`
2. Database schema
3. Production logic
4. Minimal change principle

---

## 9️⃣ Stability Principle

Evolve by:
- Adding layers
- Improving modules
- Internal refactor

Never break invariants.

---

## 🔟 Definition of Regression

- Forbidden error shapes
- Business logic in `profiles`
- Quota writes outside RPC
- Duplicate middleware logic
- Breaking unified response format

---

# 11 Input Validation Rules (Immutable)

All external inputs must be validated using Zod schemas.

Applies to:
- req.body
- req.params
- req.query

No controller may access raw request data without prior validation.

Mandatory Pattern:
- Define Zod schema
- Use `validateStrip(schema, target)`
- Use only validated data

Multipart:
- Zod for text fields
- Multer for file
- Runtime mime-type validation

Forbidden:
- Manual validation without Zod
- Direct casting from `req.body` without schema

Architectural Objective:
- Strict API contracts
- No silent inconsistencies
- OpenAPI-ready structure

🔒 This rule is considered architecturally immutable.