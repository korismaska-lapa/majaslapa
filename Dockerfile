# Production image for the Express + Vite MASKA site.
# Rehearsal MP3s in public/media/voices/ are excluded via .dockerignore
# and must be bind-mounted from the host (see docker-compose.yml).

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY content ./content
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5173

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.mjs ./
COPY content ./content
COPY public ./public
COPY --from=build /app/dist ./dist

RUN mkdir -p public/media/uploads public/media/voices

EXPOSE 5173
CMD ["node", "server.mjs", "--production"]
