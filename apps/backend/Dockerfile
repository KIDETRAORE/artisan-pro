########################################
# 1. Image de base
########################################
FROM node:20-slim

########################################
# 2. Dépendances système (Sharp)
########################################
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

########################################
# 3. Répertoire de travail
########################################
WORKDIR /app

########################################
# 4. Dépendances Node
########################################
COPY package.json package-lock.json ./
RUN npm ci

########################################
# 5. Code source
########################################
COPY . .

########################################
# 6. Build TypeScript (si présent)
########################################
# ⚠️ à garder uniquement si tu compiles (tsc)
# RUN npm run build

########################################
# 7. Variables d'environnement
########################################
ENV NODE_ENV=production

########################################
# 8. Exposition du port API
########################################
EXPOSE 8080

########################################
# 9. Démarrage
########################################
CMD ["npm", "start"]
