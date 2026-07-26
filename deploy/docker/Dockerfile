# syntax=docker/dockerfile:1
# B473 — immutable release image for eterapy (web + worker share it).
# Build context = repo root. CI builds this once per SHA; VMs only run it.
#
# NEXT_PUBLIC_* are BUILD-time (inlined into client bundles) — changing the
# domain means rebuilding the image with different build args. Everything else
# is runtime env supplied by the VM's .env file.

FROM node:22-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── full dependency install (build needs devDependencies) ──
FROM base AS deps
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
RUN npm ci --no-audit --no-fund

# ── production build ──
FROM deps AS build
COPY web web
ARG NEXT_PUBLIC_APP_URL=https://eterapy.com
ARG NEXT_PUBLIC_USE_SUBDOMAINS=true
ARG NEXT_PUBLIC_PRIMARY_DOMAIN_ONLY=false
ARG NEXT_PUBLIC_MAIN_DOMAIN=eterapy.com
ARG NEXT_PUBLIC_APP_DOMAIN=app.eterapy.com
ARG NEXT_PUBLIC_ADMIN_DOMAIN=admin.eterapy.com
ARG NEXT_PUBLIC_LIVEKIT_URL=wss://app.eterapy.com
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=eterapy_bot
# B548: analytics counter ids are public by nature (visible in page source);
# empty default keeps staging/local builds silent.
# B579: NEXT_PUBLIC_GA_MEASUREMENT_ID удалён — Google Analytics снят целиком
# (передача данных в GA в РФ под запретом). Переменной больше нет ни здесь, ни
# в workflow: вернуть счётчик одной правкой окружения нельзя по замыслу.
ARG NEXT_PUBLIC_YANDEX_METRIKA_ID=
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
  NEXT_PUBLIC_USE_SUBDOMAINS=$NEXT_PUBLIC_USE_SUBDOMAINS \
  NEXT_PUBLIC_PRIMARY_DOMAIN_ONLY=$NEXT_PUBLIC_PRIMARY_DOMAIN_ONLY \
  NEXT_PUBLIC_MAIN_DOMAIN=$NEXT_PUBLIC_MAIN_DOMAIN \
  NEXT_PUBLIC_APP_DOMAIN=$NEXT_PUBLIC_APP_DOMAIN \
  NEXT_PUBLIC_ADMIN_DOMAIN=$NEXT_PUBLIC_ADMIN_DOMAIN \
  NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL \
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME \
  NEXT_PUBLIC_YANDEX_METRIKA_ID=$NEXT_PUBLIC_YANDEX_METRIKA_ID \
  NODE_ENV=production \
  DATABASE_URL=postgresql://build:build@localhost:5432/build
WORKDIR /app/web
RUN npx prisma generate && npm run build && rm -rf .next/cache

# ── runtime assembly: prod deps + source + built .next ──
FROM base AS assemble
# prisma.config.ts refuses to load without DATABASE_URL even for `generate`;
# the real URL comes from the VM's .env at runtime.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
RUN npm ci --omit=dev --no-audit --no-fund
COPY web web
COPY --from=build /app/web/.next web/.next
WORKDIR /app/web
RUN npx prisma generate

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=assemble /app /app
# Runtime write surfaces only (ISR cache, uploads — uploads is volume-mounted).
RUN chown -R node:node /app/web/.next /app/web/public
WORKDIR /app/web
USER node
EXPOSE 3000
CMD ["npm", "start", "--", "--port", "3000", "--hostname", "0.0.0.0"]
