# SPAF Backend

The server side of SPAF — Operations OS: MySQL schema, authentication,
permissions, and the API the front end will read from.

**Installed and exercised.** Run against Laravel 13 on a real database:
migrations, seeders, the 46-test suite, and a full day walked end to end
through the HTTP API — order, approve, consolidate, lock, purchase, receive,
quality check, allocate, pack, challan, dispatch, deliver short, invoice and
settle. Nine bugs surfaced doing it; all are fixed. See "What is not here".

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
| `app/Http/Middleware/CheckPermission.php` | Server-side `perm:<module>,<action>` on every route |
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

## What the first real run found

Static checks had passed on all of this. Running it found nine faults that only
appear against a live database:

| Fault | Why it mattered |
|---|---|
| `can` middleware alias collided with Laravel's own | Every guarded route returned 403 without `CheckPermission` ever running — and the negative permission tests passed for the wrong reason. Renamed to `perm`. |
| Allocation handed out more than arrived | Rounding each share to the nearest step let several lines round up together: 26 kg available was allocated as 26.5. Shares now round down and the remainder is given out one step at a time down the route. |
| `resetStage()` silently did nothing | It used `update()`, and the quantity columns are deliberately not fillable, so re-allocating a line threw instead of re-planning it. |
| Order workflow updates silently dropped | `approved_by`, `approved_at`, `locked_at` and the three status columns were missing from `$fillable`, so approval never recorded who, and packing, dispatch and invoicing never moved the order's status. |
| `password` missing from `$fillable` | Creating a user through the API failed on a NOT NULL column. |
| Three relationships referenced but never defined | `Order::invoice`, `ChallanItem::orderItem`, `InvoiceItem::orderItem` — dispatch, invoicing and settlement all hit them. |
| Packing held a stale allocated quantity | The sheet snapshotted the allocation when first opened, so stock arriving later never reached the floor. Unpacked lines now follow the current allocation. |
| Re-allocating broke a foreign key | Allocations are updated in place rather than deleted, because packing rows point at them. |
| `users.email_verified_at` missing | Laravel's own factory and auth scaffolding expect it. |

Two `.env` notes: a value containing a space needs quoting (`ADMIN_NAME="Your Name"`),
and Sanctum's migration has to be published before the first `migrate`.

---

## What is not here

- **PDF rendering** for challans and invoices. The data is all there; only the
  printable output is missing.
- **Notifications** — the front end derives them; the server pushes none.
- **The front end still talks to its own browser store.** Wiring it to this API
  is the next piece of work, and until it happens the two halves hold separate
  data.

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
        // Not 'can' — Laravel already uses that alias for gate authorisation.
        'perm' => App\Http\Middleware\CheckPermission::class,
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
It also loads the real masters (5 routes, 5 suppliers, 40 customers, ~125 items
and their price list) from `database/seeders/data/masters.json`, exported from
the front end's own seed so the two never diverge. Re-run it any time — it is
idempotent, keyed on each record's business code:

```bash
php artisan db:seed --class='Database\Seeders\MasterSeeder'
```

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
ADMIN_NAME="Your Name"

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
