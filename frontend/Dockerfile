# Stage 1: Build with Vite (env vars available at compile time)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Serve static output
FROM node:22-alpine AS runtime
RUN npm i -g serve@14
WORKDIR /srv
COPY --from=build /app/dist ./dist/
ENV PORT=3000
EXPOSE 3000
CMD ["serve", "dist", "-s", "-l", "tcp://0.0.0.0:3000"]
