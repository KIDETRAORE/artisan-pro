# ArtisanPro 🏗️ - Intelligence Artificielle pour le BTP

ArtisanPro est une application PWA (Progressive Web App) "tout-en-un" conçue pour simplifier la gestion quotidienne des artisans du bâtiment grâce à l'IA générative (Google Gemini).

## 🚀 Vision du Projet
L'objectif est de réduire la charge administrative des artisans directement sur le chantier :
- **Devis vocaux** : Transformer une dictée en PDF chiffré.
- **Suivi photo** : Analyser l'avancement via vision par ordinateur.
- **Audit compta** : Extraire un bilan de santé financier depuis un Excel/CSV.
- **Expert technique** : Accès instantané aux normes DTU via assistant.

---

## 🏗️ Architecture Globale

Le projet suit une séparation stricte **Frontend** (Client-side) / **Backend** (Server-side) pour garantir la sécurité des clés d'API et la persistance des données.

### 1. Frontend (Vite + React)
- **Framework** : React 19 (ESM).
- **Styling** : Tailwind CSS (Design system orienté "Mobile First").
- **Services** : 
    - `apiGateway` : Couche d'abstraction qui normalise les échanges avec le backend.
    - `authService` : Gestion de la session via le SDK Supabase.
- **State Management** : Hooks personnalisés (`useAssistant`, `useAccounting`) pour découpler l'UI de la logique métier.

### 2. Backend (Express + Node.js)
- **Langage** : TypeScript / ES Modules.
- **Middlewares** : 
    - `auth.ts` : Validation des tokens JWT Supabase.
    - `rateLimit.ts` : Protection contre le spam (30 req/min).
    - `quota.ts` : Vérification des crédits IA avant traitement.
    - `validate.ts` : Validation des schémas de données et sécurité des fichiers.

---

## 🔐 Flux d'Authentification & Sécurité

ArtisanPro utilise **Supabase Auth** pour une sécurité de niveau entreprise.

1. **Login** : L'utilisateur s'authentifie sur le frontend via `supabase.auth.signInWithPassword`.
2. **Token JWT** : Supabase renvoie un `access_token` (JWT) valide.
3. **Appel API** : Le frontend inclut ce token dans le header `Authorization: Bearer <token>`.
4. **Validation Backend** : 
   - Le backend utilise le `SUPABASE_JWT_SECRET` pour vérifier l'intégrité du token.
   - L'identifiant unique de l'artisan (`user_id`) est extrait de la clé `sub` du JWT.
   - Toute requête sans token valide est rejetée (401).

---

## 🧠 Intégration IA (Google Gemini)

Le backend orchestre les appels aux modèles Gemini selon la tâche :
- **Gemini 3 Pro** : Assistant technique (Raisonnement complexe).
- **Gemini 3 Flash** : Devis et Relances (Rapidité & Coût).
- **Gemini 2.5 Flash Image** : Analyse de photos (Vision).

### Protection de la vie privée
- **Image Sanitizer** : Avant d'être envoyée à l'IA, chaque photo de chantier passe par un service de nettoyage (`sharp`) qui supprime les métadonnées EXIF (coordonnées GPS, modèle d'appareil) pour respecter le RGPD.

---

## 📊 Gestion des Quotas

Le système de quota est persistant en base de données :
- **Table `ai_quota`** : Stocke le forfait mensuel (ex: 100 crédits).
- **Table `ai_usage`** : Journalise chaque appel réussi pour audit.
- **Feature Caps** : Certaines fonctions coûteuses (Vision) ont des plafonds spécifiques (ex: 15 photos/mois) pour éviter les abus de coûts d'infrastructure.

---

## 🛠️ Instructions de Production

### Variables d'Environnement Requises
| Variable | Description | Source |
| :--- | :--- | :--- |
| `API_KEY` | Clé Google GenAI | Google AI Studio |
| `SUPABASE_URL` | URL de votre projet | Supabase Settings |
| `SUPABASE_ANON_KEY` | Clé publique client | Supabase Settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé admin (Backend uniquement) | Supabase Settings |
| `SUPABASE_JWT_SECRET` | Secret de signature des tokens | Supabase API Settings |

### Déploiement
1. **Frontend** : Déployer le dossier `dist/` sur un hébergeur statique (Vercel, Netlify) avec redirection `SPA` activée (voir `vercel.json`).
2. **Backend** : Déployer sur un environnement Node.js (Render, Railway, Fly.io).
3. **Database** : Exécuter le script SQL fourni dans l'interface Supabase pour créer les tables `ai_quota` et `ai_usage` ainsi que la fonction RPC `increment_quota`.

---

## 📱 Installation PWA
ArtisanPro est installable sur smartphone :
- **iOS** : Partager > Sur l'écran d'accueil.
- **Android** : Menu > Installer l'application.
Le `sw.js` (Service Worker) gère la mise en cache pour permettre un affichage rapide même en zone blanche (chantier).