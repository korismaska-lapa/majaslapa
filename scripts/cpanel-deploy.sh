#!/bin/bash
# Runs from the cPanel Git clone directory.
set -eu

DEPLOYPATH="/home/korismas/maskastests.cpanel.site"
APP_VENV="/home/korismas/nodevenv/maskastests.cpanel.site"
mkdir -p "$DEPLOYPATH/tmp"
LOG="$DEPLOYPATH/tmp/deploy.log"
exec >>"$LOG" 2>&1
echo "=== $(date -Iseconds) deploy start ==="

echo "Copying files to $DEPLOYPATH"
RSYNC="$(command -v rsync || true)"
if [ -n "$RSYNC" ]; then
  echo "Using $RSYNC"
  "$RSYNC" -a \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude 'tmp/' \
    --exclude 'media/' \
    --exclude 'public/media/voices/' \
    --exclude 'public/media/uploads/' \
    --exclude '.htaccess' \
    --exclude '.cpanel.yml' \
    ./ "$DEPLOYPATH/"
else
  echo "rsync not found, using tar"
  /bin/tar -cf - \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='tmp' \
    --exclude='media' \
    --exclude='public/media/voices' \
    --exclude='public/media/uploads' \
    --exclude='.htaccess' \
    --exclude='.cpanel.yml' \
    . | /bin/tar -xf - -C "$DEPLOYPATH"
fi

NPM=""
NODE=""
for version in 22 20 18 16 14; do
  if [ -x "$APP_VENV/$version/bin/npm" ]; then
    NPM="$APP_VENV/$version/bin/npm"
    NODE="$APP_VENV/$version/bin/node"
    break
  fi
done
if [ -z "$NPM" ]; then
  for candidate in \
    /opt/alt/alt-nodejs22/root/usr/bin/npm \
    /opt/alt/alt-nodejs20/root/usr/bin/npm \
    /opt/alt/alt-nodejs18/root/usr/bin/npm
  do
    if [ -x "$candidate" ]; then
      NPM="$candidate"
      NODE="$(dirname "$candidate")/node"
      break
    fi
  done
fi

cd "$DEPLOYPATH"
if [ -n "$NPM" ]; then
  echo "Using $($NODE -v) / npm $($NPM -v)"
  PATH="$(dirname "$NPM"):$PATH"
  export PATH
  $NPM install --omit=dev --no-audit --no-fund --no-progress
else
  echo "ERROR: Node 16+ was not found. In cPanel open Setup Node.js App and switch this app from Node 10 to Node 20, then deploy again."
  exit 1
fi

/bin/touch "$DEPLOYPATH/tmp/restart.txt"
echo "=== $(date -Iseconds) deploy ok ==="
