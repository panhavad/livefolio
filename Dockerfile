# The bundle is static, so build it natively once and reuse it for every target platform.
FROM --platform=$BUILDPLATFORM node:24-alpine3.24 AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG APP_VERSION=""
ENV APP_VERSION=${APP_VERSION}
RUN npm run build

FROM node:24-alpine3.24 AS runtime

LABEL org.opencontainers.image.title="livefolio"

# Chromium renders project snapshots (and checks them for bot-check pages).
# The fonts cover Latin, most other scripts, CJK, and emoji.
RUN apk add --no-cache \
      chromium nss freetype harfbuzz ca-certificates \
      font-liberation font-noto font-noto-cjk font-noto-emoji

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    CHROME_PATH=/usr/bin/chromium \
    LIVEFOLIO_CHROME_NO_SANDBOX=1

WORKDIR /app

RUN mkdir -p /data && chown node:node /data

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY --from=build /app/dist ./dist

USER node

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/health || exit 1

CMD ["node", "server/index.js"]
