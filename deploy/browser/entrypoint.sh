#!/bin/sh
# B698 — виртуальный экран, VNC и noVNC поднимаются до сервиса.
#
# Порядок важен: Chromium стартует НЕ headless и без готового :99 просто не
# запустится. Каждый процесс роняет контейнер при своей смерти — молча
# работающий сервис без экрана выглядел бы исправным и падал бы на первой
# публикации.
set -eu

: "${BROWSER_VNC_PORT:=7900}"
: "${BROWSER_SCREEN:=1280x900x24}"

Xvfb :99 -screen 0 "${BROWSER_SCREEN}" -nolisten tcp >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!

# Ждём экран, а не спим вслепую: на холодном старте Xvfb поднимается неровно.
for _ in $(seq 1 50); do
  if [ -e /tmp/.X11-unix/X99 ]; then break; fi
  sleep 0.2
done
[ -e /tmp/.X11-unix/X99 ] || { echo "Xvfb :99 не поднялся"; cat /tmp/xvfb.log; exit 1; }

# `-localhost` — VNC слушает только внутри контейнера; наружу его выводит
# websockify, а в интернет — только проксирующий маршрут админки.
x11vnc -display :99 -forever -shared -nopw -localhost -quiet -rfbport 5900 \
  >/tmp/x11vnc.log 2>&1 &
websockify --web=/usr/share/novnc "0.0.0.0:${BROWSER_VNC_PORT}" 127.0.0.1:5900 \
  >/tmp/websockify.log 2>&1 &

trap 'kill "${XVFB_PID}" 2>/dev/null || true' TERM INT
exec node server.mjs
