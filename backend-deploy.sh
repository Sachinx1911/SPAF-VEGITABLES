#!/usr/bin/env bash
# SPAF Backend — Hostinger deploy.
#
# Credentials are NOT kept in this file. Copy deploy.conf.example to
# deploy.conf, fill it in, and keep it out of git:
#
#   cp deploy.conf.example deploy.conf
#   $EDITOR deploy.conf
#   scp -P <port> backend-deploy.sh deploy.conf <user>@<host>:~/
#   ssh <user>@<host> 'bash ~/backend-deploy.sh'
#
# Written against Laravel 13 on Hostinger Business (LiteSpeed, PHP 8.2+).

set -euo pipefail

CONF="$(dirname "$0")/deploy.conf"
if [ ! -f "$CONF" ]; then
  echo "deploy.conf not found next to this script. Copy deploy.conf.example and fill it in." >&2
  exit 1
fi
# shellcheck source=/dev/null
. "$CONF"

for var in APP_DOMAIN DB_NAME DB_USER DB_PASS ADMIN_EMAIL ADMIN_NAME PUBLIC_HTML; do
  if [ -z "${!var:-}" ]; then echo "deploy.conf is missing $var" >&2; exit 1; fi
done

APP_DIR="$HOME/spaf-api"
SRC_DIR="$HOME/spaf-source"

# ── 1. Laravel skeleton ────────────────────────────────────────────────────
cd "$HOME"
if [ ! -f "$APP_DIR/artisan" ]; then
  composer create-project laravel/laravel spaf-api --prefer-dist --no-interaction
fi
cd "$APP_DIR"
composer require laravel/sanctum --no-interaction

# ── 2. SPAF source ─────────────────────────────────────────────────────────
if [ ! -d "$SRC_DIR" ]; then
  git clone https://github.com/Sachinx1911/SPAF-VEGITABLES.git "$SRC_DIR"
else
  git -C "$SRC_DIR" pull --ff-only
fi

cp -r "$SRC_DIR/backend/app/."      "$APP_DIR/app/"
cp -r "$SRC_DIR/backend/database/." "$APP_DIR/database/"
cp    "$SRC_DIR/backend/routes/api.php" "$APP_DIR/routes/api.php"

# The SPAF schema creates its own users table, with role_key, customer_id and
# the rest. Laravel's default users migration would create a conflicting one.
rm -f "$APP_DIR/database/migrations/0001_01_01_000000_create_users_table.php"

# Sanctum's migration has to be on disk before the first migrate.
cd "$APP_DIR"
php artisan vendor:publish --provider='Laravel\Sanctum\SanctumServiceProvider' --no-interaction
php artisan config:publish cors --no-interaction 2>/dev/null || true

# ── 3. bootstrap/app.php — routes, prefix, middleware ─────────────────────
# routes/api.php is not loaded by default in Laravel 11+, and apiPrefix must be
# empty because the app is mounted at /api by the symlink in step 6 — the URL
# already carries the prefix before Laravel sees the path.
php <<'PHPEOF'
<?php
$path = 'bootstrap/app.php';
$f = file_get_contents($path);

if (!str_contains($f, "api: __DIR__")) {
    $needle = "web: __DIR__.'/../routes/web.php',";
    $f = str_replace($needle, $needle . "\n        api: __DIR__.'/../routes/api.php',\n        apiPrefix: '',", $f);
    echo "api routes registered\n";
}

if (!str_contains($f, "'perm' =>")) {
    $inject = "\n        \$middleware->alias([\n"
        . "            'perm' => App\\Http\\Middleware\\CheckPermission::class,\n"
        . "            'scope.customer' => App\\Http\\Middleware\\ScopeToCustomer::class,\n"
        . "        ]);";
    foreach ([
        '->withMiddleware(function (Middleware $middleware): void {',
        '->withMiddleware(function (Middleware $middleware) {',
    ] as $p) {
        if (str_contains($f, $p)) { $f = str_replace($p, $p . $inject, $f); echo "middleware registered\n"; break; }
    }
}

file_put_contents($path, $f);
PHPEOF

# ── 4. helpers.php autoload ────────────────────────────────────────────────
php <<'PHPEOF'
<?php
$path = 'composer.json';
$j = json_decode(file_get_contents($path), true);
$files = $j['autoload']['files'] ?? [];
if (!in_array('app/Support/helpers.php', $files, true)) {
    $files[] = 'app/Support/helpers.php';
    $j['autoload']['files'] = $files;
    file_put_contents($path, json_encode($j, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
    echo "helpers.php added to autoload\n";
}
PHPEOF
composer dump-autoload --no-interaction

# ── 5. .env ────────────────────────────────────────────────────────────────
# The API is mounted at /api on the app's own origin, so FRONTEND_URL and
# APP_URL are the same host and no cross-origin exception is needed.
cat > .env <<ENV
APP_NAME="SPAF Operations OS"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://${APP_DOMAIN}
APP_KEY=

LOG_CHANNEL=single
LOG_LEVEL=error

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=${DB_NAME}
DB_USERNAME=${DB_USER}
DB_PASSWORD=${DB_PASS}

CACHE_STORE=file
SESSION_DRIVER=file
SESSION_SECURE_COOKIE=true
SESSION_DOMAIN=${APP_DOMAIN}

SANCTUM_STATEFUL_DOMAINS=${APP_DOMAIN}
FRONTEND_URL=https://${APP_DOMAIN}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_NAME="${ADMIN_NAME}"
ENV
chmod 600 .env

php artisan key:generate --force

# ── 6. Mount the API at /api on the front end's origin ────────────────────
ln -sfn "$APP_DIR/public" "$PUBLIC_HTML/api"

# ── 7. Migrate and seed ────────────────────────────────────────────────────
php artisan migrate --seed --force

echo ""
echo "========================================================"
echo " COPY THE ADMIN PASSWORD ABOVE — it is shown only once   "
echo "========================================================"
echo ""

# ── 8. Permissions and caches ─────────────────────────────────────────────
chmod -R 755 storage bootstrap/cache
php artisan storage:link 2>/dev/null || true
php artisan config:cache
php artisan route:cache

echo "Add this cron job in hPanel -> Advanced -> Cron Jobs (every minute):"
echo "* * * * * php ${APP_DIR}/artisan schedule:run >> /dev/null 2>&1"
echo ""
echo "Backend deploy complete. API is live at https://${APP_DOMAIN}/api"
