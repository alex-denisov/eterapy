# syntax=docker/dockerfile:1
# B473 — immutable release image for eterapy (web + worker share it).
# Build context = repo root. CI builds this once per SHA; VMs only run it.
#
# NEXT_PUBLIC_* are BUILD-time (inlined into client bundles) — changing the
# domain means rebuilding the image with different build args. Everything else
# is runtime env supplied by the VM's .env file.
#
# B667 — рантайм собран из трассированного дерева, а не из установленных
# node_modules. `npm ci --omit=dev` давал 1.1 ГБ из 2.0 ГБ образа, и платили за
# это четыре ноды при каждой выкатке. Дерево готовит
# `web/scripts/build-standalone.mjs`: он же кладёт бандлы воркеров и CLI Prisma
# и падает, если чего-то не хватает. Разбор трёх развилок — в тикете B667.

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
# B664: `trace` и `types` нужны сборке и редактору, но не runtime — это 31 МБ
# в каждом образе на каждой из четырёх нод. `cache` выбрасывался и раньше.
#
# B667: `npm run build` = сборка Next + досборка standalone-дерева. Второй шаг
# сам проверяет полноту дерева и валит сборку, если движка запросов, бандла
# воркера или CLI миграций в нём нет.
RUN npx prisma generate && npm run build && rm -rf .next/cache .next/trace .next/types
# B657: владелец выставляется в отбрасываемой стадии, а не в runner — иначе
# `chown -R` создаёт вторую копию всех затронутых файлов отдельным слоем.
# Писать во время работы нужно только в `.next` (ISR-кеш) и `public` (uploads —
# том).
RUN chown -R node:node .next/standalone/web/.next .next/standalone/web/public

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# B664 — chromium снят из образа. 699 МБ из 2.74 ГБ, то есть четверть каждого
# релиза, на каждой из четырёх нод, при хроническом дефиците диска eterapy-1.
#
# Он был нужен ровно одному механизму — браузерному выпуску в Дзен. Этот путь
# не работает и работать не может: он требует `DZEN_BROWSER_STORAGE_STATE`,
# слепок авторизованной сессии, который в проде не задан ни разу; выпуск в Дзен
# с B620 идёт размеченной лентой, а слепок сессии объявлен запасным механизмом
# и после подтверждения ленты выводится из периметра вовсе.
#
# Шрифты остаются: ими рисуются обложки публикаций (`next/og`), а это живой
# путь, в отличие от браузера.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-liberation fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
# Всё дерево рантайма — один каталог: `/app/node_modules` (трассированные
# пакеты + CLI Prisma) и `/app/web` (сервер, статика, public, бандлы воркеров,
# схема и миграции).
COPY --from=build /app/web/.next/standalone /app
WORKDIR /app/web
# Проверка миграционного пути на сборке, а не на выкатке: `--version` поднимает
# schema-engine, то есть доказывает и CLI, и нативный бинарь. Отсутствие любого
# из них иначе всплыло бы контейнером `migrate`, который останавливает web.
#
# `prisma.config.ts` не грузится без `DATABASE_URL` даже ради `--version` —
# отсюда заглушка на один шаг. Настоящий адрес приходит из `.env` ноды.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma --version
USER node
EXPOSE 3000
CMD ["npm", "start", "--", "--port", "3000", "--hostname", "0.0.0.0"]
