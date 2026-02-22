# Étape de build
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install && npm run build

# Étape de production
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Sécurité : Créer un utilisateur non-root
RUN addgroup -S artisan && adduser -S artisanuser -G artisan
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm install --only=production

USER artisanuser

# Healthcheck pour Docker/Kubernetes
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

EXPOSE 8080
CMD ["node", "dist/server.js"]