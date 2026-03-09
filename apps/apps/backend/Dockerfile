########################################
# 1) BUILD STAGE
########################################
FROM node:18-alpine AS builder

WORKDIR /app

# Toolchain pour modules natifs + libvips (si sharp)
RUN apk add --no-cache \
  python3 \
  make \
  g++ \
  vips-dev

# Installer deps (incluant devDeps) pour build TS
COPY package*.json ./
RUN npm ci

# Copier le code et build => dist/
COPY . .
RUN npm run build


########################################
# 2) PROD DEPS STAGE (sans devDependencies)
########################################
FROM node:18-alpine AS prod-deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev


########################################
# 3) RUNTIME STAGE
########################################
FROM node:18-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

# Runtime uniquement + wget pour healthcheck
RUN apk add --no-cache vips wget

# Sécurité: user non-root fourni par l'image node
USER node

# ✅ COPY seulement ce qui est nécessaire en prod
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/package*.json ./

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

EXPOSE 8080
CMD ["node", "dist/server.js"]