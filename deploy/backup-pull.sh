#!/bin/sh
# Копия базы KU Portal с сервера alwaysdata на свой компьютер — защита на случай потери аккаунта хостинга.
# Каждый день — отдельная папка ГГГГ-ММ-ДД (неизменённые файлы — жёсткие ссылки на прошлую копию, место почти не занимают),
# копии старше KU_BACKUP_KEEP_DAYS дней удаляются. Установка таймера (Linux, systemd) — docs/BACKEND.md, «Копия базы вне сервера».
# Настройки через окружение: KU_BACKUP_HOST, KU_BACKUP_KEY, KU_BACKUP_DIR, KU_BACKUP_REMOTE_DIR, KU_BACKUP_KEEP_DAYS.
set -eu
HOST="${KU_BACKUP_HOST:-ku-portal@ssh-ku-portal.alwaysdata.net}"
KEY="${KU_BACKUP_KEY:-$HOME/.ssh/ku_portal}"
DEST="${KU_BACKUP_DIR:-$HOME/Documents/KU-Portal/backups}"
KEEP_DAYS="${KU_BACKUP_KEEP_DAYS:-60}"
# Confirmed persistent database path on Alwaysdata; it is outside the new code directory.
# Set KU_BACKUP_REMOTE_DIR relative to the SSH home if the site uses a custom KU_DATA_DIR.
REMOTE_DATA="${KU_BACKUP_REMOTE_DIR:-ku-portal/data}"
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
  -e "ssh -F /dev/null -i '$KEY' -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=20" "$HOST:$REMOTE_DATA/" "$partial/" \
  || fail "сервер недоступен или нет доступа по ключу"
# A valid empty users list is possible. Encrypted JSON can only be checked as an intact AES-GCM envelope here.
python3 -c 'import base64,json,sys; d=json.load(open(sys.argv[1])); plain=isinstance(d,dict) and all(isinstance(d.get(k),list) for k in ("users","grades","schedule","subjects")); enc=False
if isinstance(d,dict) and d.get("_kuEncrypted")==1 and d.get("alg")=="A256GCM":
 try:
  iv=base64.b64decode(d["iv"],validate=True); tag=base64.b64decode(d["tag"],validate=True); payload=base64.b64decode(d["data"],validate=True); enc=len(iv)==12 and len(tag)==16 and len(payload)>0
 except (KeyError,TypeError,ValueError): pass
assert plain or enc' "$partial/db.json" \
  || fail "db.json из $REMOTE_DATA отсутствует, повреждён или имеет неизвестный формат — проверьте KU_BACKUP_REMOTE_DIR; предыдущие копии не тронуты"
rm -rf -- "$target"; mv "$partial" "$target"
touch "$target" # срок хранения — от дня копии, а не от даты папки на сервере (её переносит rsync -a)
find "$DEST" -maxdepth 1 -type d -name "$DAY_GLOB" -mtime +"$KEEP_DAYS" -exec rm -rf -- {} +
echo "$(date '+%F %T') копия сохранена: $target ($(du -sh "$target" | cut -f1))"
