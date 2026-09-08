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
chmod 644 "$DEPLOYPATH/index.html" "$DEPLOYPATH/server.mjs" "$DEPLOYPATH/package.json" \
  "$DEPLOYPATH/send-mail.php" "$DEPLOYPATH/admin-api.php" "$DEPLOYPATH/content-api.php" 2>/dev/null || true
if [ -f "$DEPLOYPATH/.htaccess" ]; then
  chmod 644 "$DEPLOYPATH/.htaccess"
fi
if [ -d "$DEPLOYPATH/assets" ]; then
  find "$DEPLOYPATH/assets" -type d -exec chmod 755 {} +
  find "$DEPLOYPATH/assets" -type f -exec chmod 644 {} \;
fi

pick_node() {
  NPM=""
  NODE=""
  for version in 22 20 18 16; do
    if [ -x "$APP_VENV/$version/bin/npm" ]; then
      NPM="$APP_VENV/$version/bin/npm"
      NODE="$APP_VENV/$version/bin/node"
      return 0
    fi
    if [ -x "$APP_VENV/$version/bin/node" ]; then
      NODE="$APP_VENV/$version/bin/node"
      [ -x "$APP_VENV/$version/bin/npm" ] && NPM="$APP_VENV/$version/bin/npm"
      return 0
    fi
  done
  for candidate in \
    /opt/alt/alt-nodejs22/root/usr/bin/npm \
    /opt/alt/alt-nodejs20/root/usr/bin/npm \
    /opt/alt/alt-nodejs18/root/usr/bin/npm \
    /opt/alt/alt-nodejs16/root/usr/bin/npm \
    /opt/cpanel/ea-nodejs22/bin/npm \
    /opt/cpanel/ea-nodejs20/bin/npm \
    /opt/cpanel/ea-nodejs18/bin/npm
  do
    if [ -x "$candidate" ]; then
      NPM="$candidate"
      NODE="$(dirname "$candidate")/node"
      return 0
    fi
  done
  return 1
}

pick_node || true
if [ -z "$NODE" ] && command -v cloudlinux-selector >/dev/null 2>&1; then
  echo "Trying cloudlinux-selector to enable Node 20"
  set +e
  cloudlinux-selector set --json --interpreter nodejs --version 20 --app-root "$DEPLOYPATH" --startup-file server.mjs
  set -e
  pick_node || true
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

HTACCESS="$DEPLOYPATH/.htaccess"
if [ -f "$HTACCESS" ]; then
  if ! grep -q "MASKA SPA" "$HTACCESS"; then
    echo "Adding SPA rewrite for inner pages"
    cat >> "$HTACCESS" << 'EOF'

# MASKA SPA
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteCond %{REQUEST_METHOD} GET
RewriteCond %{REQUEST_URI} !^/api/
RewriteCond %{REQUEST_URI} !^/send-mail\.php
RewriteCond %{REQUEST_URI} !^/admin-api\.php
RewriteCond %{REQUEST_URI} !^/content-api\.php
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
</IfModule>
EOF
  fi
  if grep -q "MASKA SPA" "$HTACCESS" && ! grep -q "REQUEST_METHOD" "$HTACCESS"; then
    echo "SPA rewrite GET-only so /api is never HTML"
    sed -i "s/RewriteEngine On/RewriteEngine On\\nRewriteCond %{REQUEST_METHOD} GET/" "$HTACCESS"
  fi
  if grep -q "MASKA SPA" "$HTACCESS" && ! grep -q 'REQUEST_URI.*admin-api' "$HTACCESS"; then
    echo "Excluding PHP APIs from SPA rewrite"
    sed -i '/RewriteCond %{REQUEST_URI} !\^\/send-mail/a RewriteCond %{REQUEST_URI} !^/admin-api.php\
RewriteCond %{REQUEST_URI} !^/content-api.php' "$HTACCESS"
  fi
  if ! grep -q "MASKA PHP" "$HTACCESS"; then
    echo "Letting Apache/PHP handle mail, admin and content without Node"
    cat >> "$HTACCESS" << 'EOF'

# MASKA PHP
<FilesMatch "^(send-mail|admin-api|content-api)\.php$">
  PassengerEnabled off
</FilesMatch>
EOF
  fi
  if grep -q "SetEnv ADMIN_PASSWORD" "$HTACCESS"; then
    echo "Clearing plaintext ADMIN_PASSWORD from .htaccess"
    sed -i "s/^[[:space:]]*SetEnv ADMIN_PASSWORD .*/# Admin password is encoded in server.mjs and admin-api.php/" "$HTACCESS"
  fi
fi

{
  echo "maska-build php-admin1"
  date -Iseconds
  echo "index.html -> $(grep -o 'index-[A-Za-z0-9_-]*\.js' "$DEPLOYPATH/index.html" || echo missing)"
  echo "node=$NODE"
  echo "npm=$NPM"
  if [ -z "$NODE" ]; then
    echo "PHP_ADMIN: Node 16+ is still missing; login and content use PHP until Setup Node.js App is switched to Node 20."
  fi
  echo "Passenger: $(grep PassengerNodejs "$HTACCESS" 2>/dev/null || echo missing)"
} > "$DEPLOYPATH/deploy-check.txt"

if [ -n "$NODE" ] && [ -f "$HTACCESS" ]; then
  echo "Pointing Passenger at $NODE"
  sed -i "s|PassengerNodejs \".*\"|PassengerNodejs \"$NODE\"|" "$HTACCESS"
fi
if [ -n "$NPM" ]; then
  echo "Using $($NODE -v) / npm $($NPM -v)"
  PATH="$(dirname "$NPM"):$PATH"
  export PATH
  $NPM install --omit=dev --no-audit --no-fund --no-progress
else
  echo "Node 16+ was not found for npm install. Admin and mail still work through PHP."
fi

/bin/touch "$DEPLOYPATH/tmp/restart.txt"
echo "Permissions: $(ls -ld "$DEPLOYPATH")"
echo "Passenger: $(grep PassengerNodejs "$HTACCESS" 2>/dev/null || true)"
echo "=== $(date -Iseconds) deploy ok ==="
