#!/bin/bash
# Runs from the cPanel Git clone directory.
set -eu

DEPLOYPATH="/home/korismas/maskastests.cpanel.site"
APP_VENV="/home/korismas/nodevenv/maskastests.cpanel.site"
mkdir -p "$DEPLOYPATH/tmp"
LOG="$DEPLOYPATH/tmp/deploy.log"
exec >>"$LOG" 2>&1
echo "=== $(date -Iseconds) deploy start ==="

SRC="$(pwd -P)"
DST="$(cd "$DEPLOYPATH" && pwd -P)"

if [ "$SRC" = "$DST" ]; then
  echo "Git clone is already the live folder; skipping file copy"
else
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
      . | /bin/tar --no-same-permissions --no-same-owner -xf - -C "$DEPLOYPATH"
  fi
fi

# tar of "." can leave the site folder as 700, which Apache/LiteSpeed serves as 403
chmod 755 "$DEPLOYPATH"
chmod 644 "$DEPLOYPATH/index.html" "$DEPLOYPATH/server.mjs" "$DEPLOYPATH/package.json" 2>/dev/null || true
if [ -f "$DEPLOYPATH/.htaccess" ]; then
  chmod 644 "$DEPLOYPATH/.htaccess"
fi
if [ -d "$DEPLOYPATH/assets" ]; then
  find "$DEPLOYPATH/assets" -type d -exec chmod 755 {} +
  find "$DEPLOYPATH/assets" -type f -exec chmod 644 {} \;
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

for name in contact about concerts music join news login admin en; do
  if [ -d "$DEPLOYPATH/$name" ] && [ ! -f "$DEPLOYPATH/$name/index.html" ]; then
    echo "Removing leftover folder $name"
    rm -rf "$DEPLOYPATH/$name"
  fi
done

cd "$DEPLOYPATH"
rm -rf "$DEPLOYPATH/dist"
rm -f "$DEPLOYPATH/assets/index-CP4zyoKn.js" "$DEPLOYPATH/assets/index-DLStGuYu.css"
printf '%s\n' "maska-build form2" "$(date -Iseconds)" > "$DEPLOYPATH/deploy-check.txt"
echo "index.html -> $(grep -o 'index-[A-Za-z0-9_-]*\.js' "$DEPLOYPATH/index.html" || echo missing)"
if [ -n "$NPM" ]; then
  echo "Using $($NODE -v) / npm $($NPM -v)"
  PATH="$(dirname "$NPM"):$PATH"
  export PATH
  $NPM install --omit=dev --no-audit --no-fund --no-progress
  if [ -f "$DEPLOYPATH/.htaccess" ]; then
    echo "Pointing Passenger at $NODE"
    sed -i "s|^PassengerNodejs \".*\"|PassengerNodejs \"$NODE\"|" "$DEPLOYPATH/.htaccess"
    if ! grep -q "MASKA SPA" "$DEPLOYPATH/.htaccess"; then
      echo "Adding SPA rewrite for inner pages"
      cat >> "$DEPLOYPATH/.htaccess" << 'EOF'

# MASKA SPA
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteCond %{REQUEST_URI} !^/api/
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
</IfModule>
EOF
    fi
  fi
else
  echo "ERROR: Node 16+ was not found. In cPanel open Setup Node.js App and switch this app from Node 10 to Node 20, then deploy again."
  exit 1
fi

/bin/touch "$DEPLOYPATH/tmp/restart.txt"
echo "Permissions: $(ls -ld "$DEPLOYPATH")"
echo "Passenger: $(grep PassengerNodejs "$DEPLOYPATH/.htaccess" 2>/dev/null || true)"
echo "=== $(date -Iseconds) deploy ok ==="
