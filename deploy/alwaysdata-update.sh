#!/bin/sh
# Автообновление сервера на alwaysdata: забирает свежий код из GitHub (публичный репозиторий, без паролей и токенов)
# и перезапускает портал, если код изменился. Запускается по расписанию (alwaysdata → Advanced → Scheduled tasks).
# data/ (db.json, exam-sync.json, backups/), .env и node_modules/ не в git — reset их не трогает.
# Зависимости (драйвер MySQL) ставятся из package-lock.json, когда он изменился или node_modules ещё нет —
# проверка при каждом запуске, а не только при новом коде.
set -eu
APP="$HOME/ku-portal"
cd "$APP"
restart=0
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  git reset -q --hard origin/main
  echo "$(date '+%F %T') обновлено до $(git rev-parse --short HEAD)"
  restart=1
fi
if [ -f package-lock.json ]; then
  want="$(sha256sum package-lock.json | cut -d' ' -f1)"
  have="$(cat .deps-hash 2>/dev/null || true)"
  if [ "$want" != "$have" ] || [ ! -d node_modules ]; then
    if command -v npm >/dev/null 2>&1 && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --silent; then
      echo "$want" > .deps-hash
      echo "$(date '+%F %T') зависимости установлены"
      restart=1
    else
      echo "$(date '+%F %T') ОШИБКА: npm ci не выполнен — портал работает без MySQL (на data/db.json)" >&2
    fi
  fi
fi
# сайт работает на другой машине alwaysdata (общий только диск): сервер видит обновление .restart,
# сохраняет базу и завершается, alwaysdata запускает его заново
if [ "$restart" = 1 ]; then date > "$APP/.restart"; fi
