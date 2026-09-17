# Deploying SPAF — Operations OS to Hostinger

Written for **Hostinger Business Web Hosting** (LiteSpeed, hPanel). The same
steps work on any cPanel host; where Hostinger differs it is called out.

---

## Read this first

The app ships in two halves and they go live at different times.

| | What it is | Ready? |
|---|---|---|
| **Frontend** | The whole UI. Keeps its data in the browser. | **Yes — deploy today** |
| **Backend** | Laravel API + MySQL. Real logins, shared data. | Schema and auth only |

Until the backend is finished, a live frontend means:

- **each browser has its own separate data** — what the packing floor enters
  does not reach the office screen
- **every account shares one password**, and it is readable in the shipped code
- nothing is backed up server-side; clearing site data wipes that browser's copy

So step 1 gets a real, working URL the team can open and try. Treat it as an
internal trial, not the system of record, until step 2 lands.

---

## Step 1 — Frontend (today)

### 1.1 Build

On your own machine:

```bash
npm ci
npm run build
```

Three gates run in order and stop at the first failure: `tsc --noEmit`, then
the 86-test suite, then the bundle. A green run leaves everything in `dist/`.

### 1.2 Upload

In hPanel → **Files → File Manager**, open `public_html`.

Upload **the contents of `dist/`**, not the `dist` folder itself. When you are
done, `public_html/index.html` must exist — not `public_html/dist/index.html`.

Fastest way: zip the contents of `dist/`, upload the zip, then use File
Manager's **Extract**.

> **`.htaccess` is a hidden file.** In File Manager turn on
> **Settings → Show hidden files** before uploading, or it is silently skipped
> and every security header is lost. After extracting, confirm
> `public_html/.htaccess` is listed.

### 1.3 SSL

hPanel → **Websites → your domain → Security → SSL**. Hostinger issues a free
certificate automatically; if it is not active yet, click **Install SSL** and
wait a few minutes.

Then decide **one** place to force HTTPS — not both:

- **Recommended:** leave hPanel's *Force HTTPS* switched **off** and let the
  `.htaccess` rule do it (already in the file).
- Or switch hPanel's *Force HTTPS* **on**, and comment out the three
  `RewriteCond`/`RewriteRule` HTTPS lines in `.htaccess`.

Turning on both causes a redirect loop and the site stops loading.

### 1.4 Verify

```bash
curl -sI https://yourdomain.com | grep -iE "strict-transport|content-security|x-frame|x-content-type"
```

All four headers should come back. If they are missing, `mod_headers` is not
active — open a Hostinger support ticket, it is enabled by default on Business.

Then open the site and check:

- the login page appears (the demo buttons and the printed password are
  **not** there — they are stripped from production builds)
- signing in works and the dashboard loads
- a couple of screens with charts render

### 1.5 First login

Accounts come from the seeded demo data. Admin:

- **Email:** `rajesh.patil@svproagro.in`
- **Password:** `spaf@123`

Change this the moment the backend is live. Until then the same password opens
every account, so do not put anything confidential in.

---

## Step 2 — Backend (next)

Hostinger Business has everything the API needs: SSH, Composer, PHP 8.x,
MySQL and cron. See `backend/README.md` for what is built and what is not.

### 2.1 Database

hPanel → **Databases → MySQL Databases**. Create a database and a user, give
the user all privileges, and note the four values — Hostinger prefixes the
names, e.g. `u123456789_spaf`.

### 2.2 Where the code goes

Laravel must **not** sit inside `public_html`, or its `.env` becomes
downloadable. Put the app one level up and point a subdomain at its `public`
folder:

```
/home/uXXXXXXX/
├── public_html/          ← the React build (step 1)
└── spaf-api/             ← Laravel lives here, not web-accessible
    └── public/           ← api.yourdomain.com points here
```

1. hPanel → **Domains → Subdomains** → create `api.yourdomain.com`.
2. Set its document root to `/spaf-api/public`.
3. Issue SSL for the subdomain too.

### 2.3 Install

SSH in (hPanel → **Advanced → SSH Access** for the credentials):

```bash
cd ~
composer create-project laravel/laravel spaf-api
cd spaf-api
composer require laravel/sanctum
```

Copy `backend/app`, `backend/database` and `backend/routes/api.php` from this
repo over the fresh install, then:

```bash
php artisan migrate
```

Set PHP to 8.2 or newer first: hPanel → **Advanced → PHP Configuration**.

### 2.4 `.env`

```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.yourdomain.com

DB_CONNECTION=mysql
DB_HOST=localhost
DB_DATABASE=uXXXXXXX_spaf
DB_USERNAME=uXXXXXXX_spaf
DB_PASSWORD=…

SESSION_SECURE_COOKIE=true
SANCTUM_STATEFUL_DOMAINS=yourdomain.com
```

`APP_DEBUG=false` is not optional — with it on, any error page prints the stack
trace and parts of the configuration to whoever triggered it.

### 2.5 Connect the two halves

The API is on a different origin from the app, so two things change:

- **CORS** — allow `https://yourdomain.com` in `config/cors.php`.
- **CSP** — `connect-src 'self'` in `.htaccess` blocks a subdomain. Change it to
  `connect-src 'self' https://api.yourdomain.com`, or the browser will refuse
  every API call with no obvious error.

### 2.6 Cron

hPanel → **Advanced → Cron Jobs**, once a minute:

```
php /home/uXXXXXXX/spaf-api/artisan schedule:run >> /dev/null 2>&1
```

This is what writes the daily snapshot the dashboard compares against.

---

## Re-deploying the frontend

```bash
npm run build
```

Upload the new `dist/` contents over the old ones. Asset filenames are hashed,
so browsers pick up the new build immediately; `index.html` is served
uncached, which is what makes that work.

Keep the previous `dist/` folder. Rolling back is just putting those files
back — there is no database change to reverse.

---

## If something goes wrong

| Symptom | Cause |
|---|---|
| Blank page, 404 on assets | `dist` folder uploaded instead of its contents |
| Redirect loop | hPanel *Force HTTPS* **and** the `.htaccess` rule both on |
| 500 error | A directive the host disallows — comment out `Options -Indexes`, then the hardening block |
| Headers missing from `curl` | `.htaccess` not uploaded (hidden file), or `mod_headers` off |
| Site loads, API calls fail | CORS not set, or CSP `connect-src` still `'self'` |
| Styles missing | `base: './'` changed in `vite.config.ts` — it must stay relative |
