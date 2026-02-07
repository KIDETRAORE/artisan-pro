# 1. Image de base (Node 20)
FROM node:20-slim

# 2. Installation des dépendances système pour Sharp (nécessaire sur Debian slim)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 3. Répertoire de travail
WORKDIR /app

# 4. Copie des fichiers de dépendances
COPY package*.json ./

# 5. Installation des dépendances (y compris tsx pour le runtime)
RUN npm install

# 6. Copie du reste du code source
COPY . .

# 7. Exposition du port défini dans votre env.ts
EXPOSE 3001

# 8. Commande de démarrage (utilise le script "start" de votre package.json)
CMD ["npm", "start"]