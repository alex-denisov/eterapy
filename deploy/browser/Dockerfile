# B698 — браузерный сервис для площадок без API (сейчас: Дзен).
#
# Отдельный образ, а НЕ слой релизного образа приложения: chromium весил четверть
# релиза и был снят в B664. Здесь он живёт один и выкатывается своим темпом.
#
# Patchright вместо Playwright: совместимая замена, закрывающая следы CDP
# (`Runtime.enable`, именование изолированных миров, `navigator.webdriver`),
# по которым антифрод Яндекса отличает драйвер от человека. Разбор выбора —
# в тикете B698.
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    PATCHRIGHT_BROWSERS_PATH=/opt/browsers \
    NODE_ENV=production

# Xvfb — чтобы Chromium шёл НЕ в headless: headless-режим отдаёт себя десятком
# признаков, а окно под виртуальным экраном не отличается от настольного.
# x11vnc + websockify — окно входа владельца; наружу порт не публикуется,
# доступ идёт проксирующим маршрутом админки.
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb x11vnc novnc websockify fonts-liberation fonts-noto-color-emoji \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
      ca-certificates tzdata dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Europe/Moscow

WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npx patchright install chromium \
    && npm cache clean --force

COPY server.mjs entrypoint.sh ./
RUN chmod +x entrypoint.sh && mkdir -p /profile

EXPOSE 7801
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["./entrypoint.sh"]
