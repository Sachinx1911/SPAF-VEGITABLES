#!/usr/bin/env bash
# SPAF Backend — Hostinger SSH deploy script
# Run this after SSHing into Hostinger:
#   ssh uXXXXXXX@your-server-ip
# Then paste the whole script (or run: bash backend-deploy.sh)
#
# Fill in these three values before running:
API_DOMAIN="api.yourdomain.com"        # subdomain you created for the API
DB_NAME="uXXXXXXX_spaf"              # Hostinger DB name (with prefix)
DB_USER="uXXXXXXX_spaf"              # Hostinger DB user (with prefix)
DB_PASS="YOUR_DB_PASSWORD_HERE"       # DB password from hPanel
ADMIN_EMAIL="admin@svproagro.in"      # your admin email
ADMIN_NAME="SPAF Admin"               # your admin name

set -e   # stop on first error

# ── 1. Fresh Laravel install ───────────────────────────────────────────────
cd ~
composer create-project laravel/laravel spaf-api --prefer-dist --quiet
cd spaf-api
composer require laravel/sanctum --quiet

# ── 2. Copy SPAF source files ──────────────────────────────────────────────
# Clone the repo (or upload backend/ via FTP and adjust paths below)
cd ~
if [ ! -d "spaf-source" ]; then
  git clone https://github.com/Sachinx1911/SPAF-VEGITABLES.git spaf-source
fi

cp -r ~/spaf-source/backend/app/*       ~/spaf-api/app/
cp -r ~/spaf-source/backend/database/*  ~/spaf-api/database/
cp    ~/spaf-source/backend/routes/api.php ~/spaf-api/routes/api.php

# ── 3. Register middleware in bootstrap/app.php ────────────────────────────
# Inserts the alias block just after ->withMiddleware(function (Middleware $middleware) {
php -r "
\$f = file_get_contents('bootstrap/app.php');
\$inject = \"
    \\\$middleware->alias([
        'perm' => App\\\Http\\\Middleware\\\CheckPermission::class,
        'scope.customer' => App\\\Http\\\Middleware\\\ScopeToCustomer::class,
    ]);
\";
\$f = str_replace(
  '->withMiddleware(function (Middleware \$middleware) {',
  '->withMiddleware(function (Middleware \$middleware) {' . \$inject,
  \$f
);
file_put_contents('bootstrap/app.php', \$f);
echo 'Middleware registered\n';
" 2>/dev/null || echo "bootstrap/app.php — check manually (pattern not found)"

# ── 4. Register helpers autoload in composer.json ─────────────────────────
php -r "
\$j = json_decode(file_get_contents('composer.json'), true);
\$j['autoload']['files'][] = 'app/Support/helpers.php';
file_put_contents('composer.json', json_encode(\$j, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
echo 'helpers.php added to autoload\n';
"
composer dump-autoload --quiet

# ── 5. Write .env ──────────────────────────────────────────────────────────
cat > .env <<ENV
APP_NAME="SPAF Operations OS"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://${API_DOMAIN}
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
SESSION_DOMAIN=.${API_DOMAIN#api.}

SANCTUM_STATEFUL_DOMAINS=${API_DOMAIN#api.}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_NAME="${ADMIN_NAME}"
ENV

# ── 6. Generate app key, run migrations + seed ────────────────────────────
php artisan key:generate
php artisan migrate --seed --force

echo ""
echo "========================================================"
echo " COPY THE ADMIN PASSWORD ABOVE — it is shown only once "
echo "========================================================"
echo ""

# ── 7. Permissions ────────────────────────────────────────────────────────
chmod -R 755 storage bootstrap/cache
php artisan storage:link 2>/dev/null || true
php artisan config:cache
php artisan route:cache

# ── 8. Cron — print the line to add in hPanel ─────────────────────────────
echo "Add this cron job in hPanel → Advanced → Cron Jobs (every minute):"
echo "* * * * * php $(pwd)/artisan schedule:run >> /dev/null 2>&1"
echo ""
echo "Backend deploy complete."
echo "Subdomain doc root must point to: $(pwd)/public"
