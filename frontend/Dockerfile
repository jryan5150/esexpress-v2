# Cache-bust: 2026-04-02-v2
FROM node:22-alpine AS runtime
RUN npm i -g serve@14
WORKDIR /srv
COPY dist/ ./dist/
ENV PORT=3000
EXPOSE 3000
CMD ["serve", "dist", "-s", "-l", "tcp://0.0.0.0:3000"]
