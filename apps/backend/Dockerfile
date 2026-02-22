########################################
# 1. ÉTAPE DE BUILD (BUILDER)
########################################
FROM node:20-slim AS builder

# Installation des outils de compilation nécessaires pour les modules natifs
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installation des dépendances
COPY package*.json ./
RUN npm ci

# Copie du code source et build TypeScript
COPY . .
# On active le build pour générer le dossier /dist indispensable en prod
RUN npm run build

########################################
# 2. ÉTAPE DE PRODUCTION (FINAL)
########################################
FROM node:20-slim

WORKDIR /app

# Installation de libvips (runtime) et wget (pour le healthcheck)
RUN apt-get update && apt-get install -y \
    libvips \
    wget \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# --- SÉCURITÉ NON-ROOT (PHASE 7) ---
# On crée un utilisateur système pour l'application
RUN groupadd -r artisan && useradd -r -g artisan artisanuser

# On ne copie que le nécessaire depuis le builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Installation des dépendances de production uniquement
RUN npm ci --omit=dev

# Attribution des droits à l'utilisateur non-root
RUN chown -R artisanuser:artisan /app
USER artisanuser

########################################
# 3. MONITORING & EXÉCUTION
########################################

# Healthcheck : vérifie l'état de l'API toutes les 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

EXPOSE 8080

# Utilisation de node directement au lieu de npm pour une meilleure gestion des signaux (SIGTERM)
CMD ["node", "dist/server.js"]