#!/bin/sh
# Копия базы KU Portal с сервера alwaysdata на свой компьютер — защита на случай потери аккаунта хостинга.
# Каждый день — отдельная папка ГГГГ-ММ-ДД (неизменённые файлы — жёсткие ссылки на прошлую копию, место почти не занимают),
# копии старше KU_BACKUP_KEEP_DAYS дней удаляются. Установка таймера (Linux, systemd) — docs/BACKEND.md, «Копия базы вне сервера».
# Настройки через окружение: KU_BACKUP_HOST, KU_BACKUP_KEY, KU_BACKUP_DIR, KU_BACKUP_KEEP_DAYS.
set -eu
HOST="${KU_BACKUP_HOST:-ku-portal@ssh-ku-portal.alwaysdata.net}"
KEY="${KU_BACKUP_KEY:-$HOME/.ssh/ku_portal}"
DEST="${KU_BACKUP_DIR:-$HOME/Documents/KU-Portal/backups}"
KEEP_DAYS="${KU_BACKUP_KEEP_DAYS:-60}"
DAY_GLOB='20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]'

fail() {
  echo "$(date '+%F %T') ОШИБКА: $1" >&2
  if command -v notify-send >/dev/null 2>&1; then notify-send -u critical 'KU Portal' "Копия базы не сделана: $1" || true; fi
  exit 1
}
umask 077
mkdir -p "$DEST"
day="$(date +%F)"; target="$DEST/$day"; partial="$target.partial"
prev="$(find "$DEST" -maxdepth 1 -type d -name "$DAY_GLOB" ! -name "$day" | sort | tail -n 1)"
rm -rf -- "$partial"
rsync -a --delete --exclude 'ku-corpus.json.gz' --exclude '*.tmp' ${prev:+--link-dest="$prev"} \
  -e "ssh -i '$KEY' -o BatchMode=yes -o ConnectTimeout=20" "$HOST:ku-portal/data/" "$partial/" \
  || fail "сервер недоступен или нет доступа по ключу"
# копия должна читаться: главная база — корректный JSON со списком пользователей
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert isinstance(d.get("users"), list) and d["users"]' "$partial/db.json" \
  || fail "db.json в копии не читается или в нём нет пользователей — старые копии не тронуты"
rm -rf -- "$target"; mv "$partial" "$target"
touch "$target" # срок хранения — от дня копии, а не от даты папки на сервере (её переносит rsync -a)
find "$DEST" -maxdepth 1 -type d -name "$DAY_GLOB" -mtime +"$KEEP_DAYS" -exec rm -rf -- {} +
echo "$(date '+%F %T') копия сохранена: $target ($(du -sh "$target" | cut -f1))"
