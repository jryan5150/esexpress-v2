FROM node:22-alpine
RUN npm i -g serve
WORKDIR /app
COPY dist ./dist
EXPOSE 3000
CMD serve dist -s -l tcp://0.0.0.0:${PORT:-3000}
