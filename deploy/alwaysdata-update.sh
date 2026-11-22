#!/bin/sh
# Автообновление сервера на alwaysdata: забирает свежий код из GitHub (публичный репозиторий, без паролей и токенов)
# и перезапускает портал, если код изменился. Запускается по расписанию (alwaysdata → Advanced → Scheduled tasks).
# data/db.json и data/exam-sync.json не в git — reset их не трогает.
set -eu
REPO="${KU_PORTAL_REPO_DIR:-$HOME/ku-portal}"
APP="${KU_PORTAL_APP_DIR:-$HOME/ku-portal-mysql-new/KU-Portal}"
mkdir -p "$APP"
cd "$REPO"
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  git merge --quiet --ff-only origin/main
fi
COMMIT="$(git rev-parse HEAD)"
APP_COMMIT="$(cat "$APP/.release-commit" 2>/dev/null || true)"
if [ "$APP_COMMIT" != "$COMMIT" ]; then
  ARCHIVE="$(mktemp)"
  trap 'rm -f "$ARCHIVE"' EXIT HUP INT TERM
  git archive --format=tar HEAD > "$ARCHIVE"
  tar -xf "$ARCHIVE" -C "$APP"
  printf '%s\n' "$COMMIT" > "$APP/.release-commit.tmp"
  mv "$APP/.release-commit.tmp" "$APP/.release-commit"
  echo "$(date '+%F %T') обновлено до $(git rev-parse --short HEAD)"
  # Обновлённый процесс видит .restart рядом с server.js и перезапускается.
  date > "$APP/.restart"
fi
