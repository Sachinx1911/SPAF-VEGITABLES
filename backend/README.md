# SPAF Backend — foundation

This folder holds the server-side foundation for SPAF — Operations OS: the
MySQL schema, the authentication that replaces the prototype's shared password,
the permission and customer-scoping middleware, and the full API route map.

**It is a foundation, not a finished backend.** Read "What is not here" before
planning around it.

---

## Why this exists

The front end today keeps the whole database in `localStorage` and checks the
password in JavaScript. That is fine for a demo and unfixable in the browser:

- the password lives in the shipped bundle, because that is where the check runs
- every customer, price, invoice and payment is editable from devtools
- permissions hide screens but cannot protect data, since there is no server

Moving those three things to a server is the entire point of this folder.

---

## What is here

| Path | What it does |
|---|---|
| `database/migrations/2026_09_17_000001_create_spaf_schema.php` | All 32 tables, one per interface in `src/types/models.ts`, with foreign keys and indexes |
| `app/Models/User.php` | Login by email or mobile, hashed password, cached permission matrix |
| `app/Http/Controllers/AuthController.php` | Login, logout, me, change password — rate limited, timing-safe, audited |
| `app/Http/Middleware/CheckPermission.php` | Server-side `can:<module>,<action>` for every route |
| `app/Http/Middleware/ScopeToCustomer.php` | A portal token can only ever read its own customer's rows |
| `routes/api.php` | The complete endpoint map, each already carrying its permission |

### The two rules, enforced in the schema

**Item + Unit is the SKU.** `items` has `unique(name, unit)`, and every line
table carries the unit it was transacted in. The same produce in another unit
cannot be merged by accident.

**The quantity chain is never overwritten.** `order_items` has twelve nullable
columns — `qty_ordered` through `qty_paid` — and each stage writes only its own.
`qty_ordered` is the sole non-nullable one. Approving fills `qty_approved` and
leaves `qty_ordered` alone; the API route for approval must reject any attempt
to write `qty_ordered`, which is the server-side version of the rule the front
end's test suite already guards.

---

## What is not here

These still have to be written. The route map names every one of them, so the
work is enumerable, but none of the controller bodies exist yet:

- **Controllers** — only `AuthController` is written. The other ~20 named in
  `routes/api.php` are signatures on paper.
- **Eloquent models** — only `User`. The remaining ~25 need writing, with their
  relationships.
- **The domain logic** — consolidation, purchase requirement generation,
  proportional allocation, challan generation, invoice-from-delivered-quantity,
  aging and ledger. These exist as tested pure functions in `src/domain/*.ts`
  and must be ported to PHP, keeping the same behaviour.
- **A migration from the seeded demo data** to real opening data.
- **Server-side tests.** The front end has 65; the backend has none yet.
- **Scheduled job** writing `daily_snapshots` (cron on cPanel).
- **File storage** for signatures, QC photos and delivery photos.

Rough order to build in: models → orders and consolidation → purchase,
receiving, QC → allocation, packing, challan → invoices, payments, ledger →
reports. Each slice can go live on its own, because the front end can read one
module from the API while the rest still come from the local store.

---

## Setting it up

Requires PHP 8.2+ and MySQL 8. On cPanel shared hosting both are normally
available; no Docker, Redis or WebSockets are needed anywhere in this design.

```bash
composer create-project laravel/laravel spaf-api
cd spaf-api
composer require laravel/sanctum
```

Copy `app/`, `database/` and `routes/api.php` from this folder over the fresh
install, then:

```bash
php artisan migrate
```

Register the middleware in `bootstrap/app.php`:

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias([
        'can' => App\Http\Middleware\CheckPermission::class,
        'scope.customer' => App\Http\Middleware\ScopeToCustomer::class,
    ]);
})
```

`activity_log()` used by the controller and middleware is a small helper that
writes one row to `audit_logs`; add it in `app/Support/helpers.php` and load it
from composer's `autoload.files`.

### Environment

```
APP_ENV=production
APP_DEBUG=false          # never true on a public host — leaks stack traces
APP_URL=https://yourdomain

DB_CONNECTION=mysql
DB_DATABASE=spaf
DB_USERNAME=…
DB_PASSWORD=…

SESSION_SECURE_COOKIE=true
SANCTUM_STATEFUL_DOMAINS=yourdomain
```

`.env` must never be committed. Confirm `APP_DEBUG=false` before going live.

---

## Connecting the front end

The front end's store is already the only place that touches data — pages call
`src/store/*Actions.ts` and read through `src/domain/*`, never the database
directly. That seam is where the API goes: each action becomes a call, and the
domain functions either move to the server or keep running on data the server
returned.

Two things change in the browser at that point:

- the token replaces the local session, and the store stops persisting the
  database to `localStorage`
- `src/lib/nav.ts`'s `can()` keeps deciding what to *render*, while the server
  independently decides what to *return* — matching checks, enforced twice
