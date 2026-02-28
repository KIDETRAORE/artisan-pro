Choix quota

Source de vérité quota : table ai_quota (monthly_limit, used, reset_at).

Consommation atomique : uniquement via RPC PostgreSQL public.consume_ai_quota(uid uuid, amt int) (transaction + FOR UPDATE + reset mensuel + incrément).

Pré-check (avant appel IA) : middleware checkQuota (lecture-only) :

lit subscriptions → si PRO active : bypass

lit ai_quota → refuse si used + weight > limit

ne fait aucun reset, aucune écriture DB.

Consommation réelle (après succès IA) : quotaService.recordUsage(...) appelle la RPC consume_ai_quota.

Suppression cache UI : aucune écriture quota/plan dans profiles (pas de monthly_quota_*, quota_reset_at, etc.).

Poids : FEATURE_WEIGHTS (ex: vision, compta…) → amt >= 1 garanti.

Choix plan

DB standard : subscriptions.plan stocké en lowercase uniquement : free | pro.

Normalization unique : helper central normalizePlan(plan?: string|null) -> "free"|"pro".

Status unique : helper normalizeStatus(status?: string|null) -> SubscriptionStatus.

Eligibilité PRO : isProActive(plan, status) (pro + active/trialing).

Règle : toute comparaison/écriture plan passe par normalizePlan (pas de .toUpperCase() / .toLowerCase() dispersés).

Choix auth

Format unique req.user (backend) :

{ id: string; email?: string; role: "user" | "admin"; permissions: Permission[] }

Injection : authMiddleware :

valide le Bearer token via Supabase

récupère role depuis profiles.role (fallback "user")

récupère permissions depuis user.app_metadata.permissions (filtrées via union)

Typing : augmentation Express dans apps/backend/src/types/express/index.d.ts (declare global namespace Express { interface Request { user?: AuthUser } })

Règle : aucun req as any pour req.user en dehors de cas exceptionnels (Stripe runtime typing ok).

Format erreurs

Format unique pour toutes les erreurs API :

{
  "success": false,
  "error": { "code": "string", "message": "string" },
  "details": {},
  "requestId": "string"
}

Helper unique : sendError(req, res, status, code, message, details?).

Middleware global : error.middleware.ts :

gère ZodError → 400 + validation_error + details.issues

gère QuotaError → 403/429 selon mapping + meta en details

gère HttpError → status + code/message

fallback → 500 internal_error

Règle : validate.middleware, auth.middleware, cors, 404, checkQuota doivent tous utiliser sendError (pas de { message } ou { success:false, error:"..." }).

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

POST /vocal/... (upload audio en multipart, déjà en place)

Billing / Stripe

POST /stripe/webhook — raw body (AVANT express.json)

endpoints checkout/portal si présents (ex: /stripe/checkout, /stripe/portal)

Quota / Usage

GET /quota (si tu exposes l’état)

RPC DB : consume_ai_quota(uid, amt) (source de vérité conso)