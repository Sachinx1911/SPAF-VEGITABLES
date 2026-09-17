# SPAF Backend

The server side of SPAF — Operations OS: MySQL schema, authentication,
permissions, and the API the front end will read from.

**Partly built.** Auth, orders and consolidation work; the rest of the modules
are mapped but not written. See "What is not here".

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
| `app/Http/Controllers/AuthController.php` | Login, logout, me, change password — rate limited, timing-safe, audited |
| `app/Http/Controllers/OrderController.php` | List, show, create, amend, approve, reject |
| `app/Http/Controllers/ConsolidationController.php` | Day matrix, item-quantity sheet, and the lock |
| `app/Http/Middleware/CheckPermission.php` | Server-side `can:<module>,<action>` on every route |
| `app/Http/Middleware/ScopeToCustomer.php` | A portal token can only ever read its own customer's rows |
| `app/Support/helpers.php` | `activity_log()` and `setting()` |
| `routes/api.php` | The complete endpoint map, each route already carrying its permission |

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

Named in `routes/api.php`, not yet written:

- **Controllers** — purchase, receiving, quality check, allocation, packing,
  challan, driver, invoice, payment, outstanding, ledger, reports, analytics,
  users, roles, settings, portal.
- **The domain logic those controllers need** — proportional allocation,
  challan generation from packing, invoice-from-delivered-quantity, aging, and
  the running ledger balance. These exist as tested pure functions in
  `src/domain/*.ts` and must be ported, keeping the same behaviour.
- **Server-side tests.** The front end has 86; the backend has none yet.
- **The scheduled job** that writes `daily_snapshots`.
- **File storage** for signatures, QC photos and delivery photos.
- **An importer** for the existing customer and item masters.

Rough order to build: purchase/receiving/QC → allocation/packing/challan →
finance → reports. Each slice can go live on its own, because the front end can
read one module from the API while the rest still come from the local store.

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
