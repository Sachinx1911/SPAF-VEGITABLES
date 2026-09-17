# Deploying SPAF — Operations OS

## Build

```bash
npm ci
npm run build
```

`npm run build` runs three gates in order and stops at the first failure:

1. `tsc --noEmit` — type errors
2. `vitest run` — the 65-test suite
3. `vite build` — the production bundle into `dist/`

The result is plain static files. `base: './'` means `dist/` can sit at the
domain root or in any sub-directory.

## Upload

Copy **the contents of `dist/`** (not the folder itself) into `public_html/`,
or into a sub-directory if the app is not at the domain root.

`dist/.htaccess` must go up with it — it carries the HTTPS redirect and every
security header. It is a dotfile, so make sure the FTP client or cPanel File
Manager is set to **show hidden files**, otherwise it will be silently skipped.

## HTTPS

1. cPanel → **SSL/TLS Status** → run *AutoSSL* for the domain (free Let's Encrypt).
2. Wait for the certificate to show as active.
3. Load `https://yourdomain/` once and confirm the padlock.

Only then is the redirect in `.htaccess` doing anything useful. `Strict-Transport-Security`
is ignored by browsers over plain HTTP, so an incomplete certificate will look
like the header "isn't working" when the real cause is the certificate.

Do not add `; preload` to the HSTS header until the domain is confirmed
HTTPS-only — preloading is hard to undo.

## What `.htaccess` does

| Header | Effect |
|---|---|
| `Strict-Transport-Security` | Browser uses HTTPS for a year, no downgrade |
| `Content-Security-Policy` | Scripts load only from this origin; no inline script, no CDN |
| `X-Frame-Options: DENY` | Page cannot be framed — blocks clickjacking |
| `X-Content-Type-Options: nosniff` | A text file can never be executed as script |
| `Referrer-Policy` | Only the origin leaks to third parties, never the path |
| `Permissions-Policy` | Camera, mic, geolocation and payment APIs switched off |

It also forces HTTPS, caches hashed assets for a year while keeping
`index.html` uncached, gzips text responses, blocks dotfiles and source maps,
and disables directory listing.

### Verifying after upload

```bash
curl -sI https://yourdomain/ | grep -iE "strict-transport|content-security|x-frame|x-content-type"
```

All four should come back. If they do not, `mod_headers` is disabled on the
host — ask the provider to enable it.

## Known limits of this build

This is a **front-end prototype**. Everything below has to change before real
customer and money data goes in:

- **Authentication runs in the browser.** Every account shares one password,
  and the check happens in JavaScript the user controls. Anyone can read it
  from the bundle or bypass it with devtools.
- **All data lives in `localStorage`.** It is per-browser, editable by the
  person using it, and lost when site data is cleared. There is no server copy.
- **Permissions are UI-level only.** They hide screens; they do not protect
  data, because there is no server to enforce them.

The fix for all three is the same: move the database and auth behind an API.
`backend/` holds the schema and route plan for that work. Until it is in
place, treat this deployment as an internal demo, not a system of record.

## Rolling back

Each release is just a folder of files. Keep the previous `dist/` and swap the
directory back — there is no database migration to undo.
