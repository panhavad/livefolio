# The bundle is static, so build it natively once and reuse it for every target platform.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG APP_VERSION=""
ENV APP_VERSION=${APP_VERSION}
RUN npm run build

# The API server only uses Node built-ins, so the runtime needs no node_modules.
FROM node:24-alpine AS runtime

LABEL org.opencontainers.image.title="livefolio"

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

WORKDIR /app

RUN mkdir -p /data && chown node:node /data

COPY package.json ./
COPY server ./server
COPY --from=build /app/dist ./dist

USER node

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/health || exit 1

CMD ["node", "server/index.js"]
