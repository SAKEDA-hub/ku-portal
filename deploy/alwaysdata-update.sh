#!/bin/sh
# Автообновление сервера на alwaysdata: забирает свежий код из GitHub (публичный репозиторий, без паролей и токенов)
# и перезапускает портал, если код изменился. Запускается по расписанию (alwaysdata → Advanced → Scheduled tasks).
# data/db.json и data/exam-sync.json не в git — reset их не трогает.
set -eu
APP="$HOME/ku-portal"
cd "$APP"
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  git reset -q --hard origin/main
  echo "$(date '+%F %T') обновлено до $(git rev-parse --short HEAD)"
  # alwaysdata сам запускает сайт заново после остановки процесса
  pkill -u "$(id -u)" -f "node $APP/server.js" || true
fi
