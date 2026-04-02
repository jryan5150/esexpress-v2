# ── Build stage ──────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npx vite build

# ── Production stage ─────────────────────────────────────
FROM node:22-alpine
RUN npm i -g serve
WORKDIR /app

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD serve dist -s -l tcp://0.0.0.0:${PORT:-3000}
