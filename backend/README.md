# SPAF Backend

The server side of SPAF — Operations OS: MySQL schema, authentication,
permissions, and the API the front end will read from.

**Code complete, not yet executed.** Every module named in `routes/api.php`
now has a controller behind it. Nothing has run against a real database yet —
the first `php artisan migrate` on the server is the real test. See
"What is not here".

---

## Why this exists

The front end keeps the whole database in `localStorage` and checks the password
in JavaScript. That is fine for a demo and unfixable in the browser:

- the password lives in the shipped bundle, because that is where the check runs
- every customer, price, invoice and payment is editable from devtools
- permissions hide screens but cannot protect data, since there is no server
- each browser holds its own separate copy — the packing floor and the office
  never see the same numbers

Moving those to a server is the entire point of this folder.

---

## What is here

| Path | What it does |
|---|---|
| `database/migrations/…_create_spaf_schema.php` | All 32 tables, one per interface in `src/types/models.ts`, with foreign keys and indexes |
| `app/Models/` (31 files) | Every table, with relationships, casts, and the rules that belong on the record |
| `database/seeders/RoleSeeder.php` | The full permission matrix — the same grid the UI renders and the API enforces |
| `database/seeders/DatabaseSeeder.php` | Roles, settings, and one admin with a generated password |
| `app/Http/Controllers/` (18) | Auth, orders, consolidation, purchase, receiving, quality check, allocation, packing, challan, driver, invoice, payment, outstanding, ledger, masters, portal, reports, admin |
| `app/Domain/Allocator.php` | The proportional shortage split, ported from the tested TypeScript |
| `app/Console/Commands/WriteDailySnapshot.php` | The cron job behind the dashboard's day-on-day figures |
| `tests/Feature/` (4) | Quantity chain, permissions, finance, allocation |
| `app/Http/Middleware/CheckPermission.php` | Server-side `can:<module>,<action>` on every route |
| `app/Http/Middleware/ScopeToCustomer.php` | A portal token can only ever read its own customer's rows |
| `app/Support/helpers.php` | `activity_log()` and `setting()` |
| `routes/api.php` | 80 endpoints, each carrying its permission |

### The two rules, enforced in code

**Item + Unit is the SKU.** `items` has `unique(name, unit)`, and every line
table carries the unit it was transacted in. Nothing converts between units.

**The quantity chain is never overwritten.** `order_items` has twelve nullable
columns, `qty_ordered` through `qty_paid`. `OrderItem::recordStage()` is the only
way to fill one: it refuses to write `qty_ordered` at all, and refuses to
overwrite a stage that already holds a value. Approving with a reduced quantity
therefore records the reduction in `qty_approved` and leaves what the customer
asked for intact — which is what makes a shortfall explainable weeks later.

Locking a day and generating the purchase requirement happen in one
transaction. A locked day with no requirement leaves the buyer with nothing to
act on; a requirement without a lock can be invalidated by an order edited a
minute later.

---

## What is not here

**None of it has run yet.** It is written and statically verified — every file
passes `php -l`, every route resolves to a method that exists, and every model
column matches the migration — but no `composer install`, no `artisan migrate`,
no test run. Expect to fix things on the first install; that is normal and the
tests exist to catch it.

Still genuinely missing:

- **An importer** for the existing customer and item masters. Until then the
  database starts empty and masters go in through the UI or by SQL.
- **PDF rendering** for challans and invoices. The data is all there; only the
  printable output is not.
- **Notifications** — the front end derives them; the server does not push any.

---

## Installing on Hostinger

Business Web Hosting has everything needed: SSH, Composer, PHP 8.x, MySQL and
cron. No Docker, Redis or WebSockets anywhere in this design.

Laravel must **not** sit inside `public_html`, or its `.env` becomes
downloadable — and that file holds the database password.

```
/home/uXXXXXXX/
├── public_html/          ← the React build
└── spaf-api/             ← Laravel, not web-reachable
    └── public/           ← api.yourdomain.com points here
```

```bash
cd ~
composer create-project laravel/laravel spaf-api
cd spaf-api
composer require laravel/sanctum
```

Copy `app/`, `database/` and `routes/api.php` from this folder over the fresh
install, then register the middleware in `bootstrap/app.php`:

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias([
        'can' => App\Http\Middleware\CheckPermission::class,
        'scope.customer' => App\Http\Middleware\ScopeToCustomer::class,
    ]);
})
```

Load the helpers by adding to `composer.json`:

```json
"autoload": { "files": ["app/Support/helpers.php"] }
```

Then `composer dump-autoload`, and:

```bash
php artisan migrate --seed
```

The seeder prints the generated admin password once. Copy it — it is not stored.

### Environment

```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.yourdomain.com

DB_CONNECTION=mysql
DB_DATABASE=uXXXXXXX_spaf
DB_USERNAME=uXXXXXXX_spaf
DB_PASSWORD=…

ADMIN_EMAIL=you@yourdomain.com
ADMIN_NAME=Your Name

SESSION_SECURE_COOKIE=true
SANCTUM_STATEFUL_DOMAINS=yourdomain.com
```

`APP_DEBUG=false` is not optional. With it on, any error page prints the stack
trace and parts of the configuration to whoever triggered it.

Remove `ADMIN_PASSWORD` from `.env` after the first seed if you set one.

---

## Connecting the front end

The store is already the only place that touches data — pages call
`src/store/*Actions.ts` and read through `src/domain/*`, never the database
directly. That seam is where the API goes: each action becomes a call.

Two things change in the browser at that point:

- the token replaces the local session, and the store stops persisting the
  database to `localStorage`
- `can()` in `src/lib/nav.ts` keeps deciding what to *render*, while the server
  independently decides what to *return* — the same check, enforced twice

Because the API is on a subdomain, also allow it in CORS (`config/cors.php`) and
widen the CSP `connect-src` in `public/.htaccess`, or the browser blocks every
call with no visible error.
