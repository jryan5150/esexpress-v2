# ── Build stage ──────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# bcrypt requires native build tools
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx tsc --noCheck
RUN npm prune --omit=dev

# ── Production stage ─────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
# Runtime assets — JSON artifacts served by diag endpoints (e.g. the
# flywheel discovery report consumed by /diag/scope-discovery).
COPY --from=build /app/resources ./resources

EXPOSE 3000
CMD ["node", "dist/server.js"]
