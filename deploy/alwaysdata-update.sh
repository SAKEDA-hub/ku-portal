#!/bin/sh
# Автообновление сервера на alwaysdata: забирает свежий код из GitHub (публичный репозиторий, без паролей и токенов)
# и перезапускает портал, если код изменился. Запускается по расписанию (alwaysdata → Advanced → Scheduled tasks).
# data/ не в git и не затрагивается: архив берётся напрямую из origin/main.
set -eu
REPO="${KU_PORTAL_REPO_DIR:-$HOME/ku-portal}"
APP="${KU_PORTAL_APP_DIR:-$HOME/ku-portal-mysql-new/KU-Portal}"
mkdir -p "$APP"
cd "$REPO"
git fetch -q origin main
COMMIT="$(git rev-parse origin/main)"
APP_COMMIT="$(cat "$APP/.release-commit" 2>/dev/null || true)"
if [ "$APP_COMMIT" != "$COMMIT" ]; then
  ARCHIVE="$(mktemp)"
  trap 'rm -f "$ARCHIVE"' EXIT HUP INT TERM
  git archive --format=tar "$COMMIT" > "$ARCHIVE"
  tar -xf "$ARCHIVE" -C "$APP"
  printf '%s\n' "$COMMIT" > "$APP/.release-commit.tmp"
  mv "$APP/.release-commit.tmp" "$APP/.release-commit"
  echo "$(date '+%F %T') обновлено до $(git rev-parse --short "$COMMIT")"
  # Обновлённый процесс видит .restart рядом с server.js и перезапускается.
  date > "$APP/.restart"
fi
