# 画面・API（web）とワーカー（worker）を同じ依存から作る。VPS にもそのまま持っていける。
FROM node:22-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY . .
RUN npm run build

# 画面と API
FROM node:22-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]

# ワーカー。取得に yt-dlp を使う（Twitch の取得ツールは #6 で足す）。マイグレーションもここから流せる。
FROM base AS worker
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates curl \
  && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*
COPY . .
CMD ["npm", "run", "worker"]
