---
name: verify
description: Build, run, and drive waxxor-op (Next.js + Auth.js credentials) to verify changes end-to-end over HTTP.
---

# Verifying waxxor-op

## Build & run

```bash
npm run build                 # production build (uses .env, NOT .env.local)
PORT=3111 npm run start       # run in background; poll /login until 200
```

DB is the real Neon instance — clean up any rows you create.

## Log in with curl (Auth.js v5 credentials)

Seed admin creds are in `.env` (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

```bash
CSRF=$(curl -s -c jar.txt localhost:3111/api/auth/csrf | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
curl -s -b jar.txt -c jar.txt -X POST localhost:3111/api/auth/callback/credentials \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=..." --data-urlencode "password=..."
# 302 -> / means success; then GET pages with -b jar.txt
```

## Invoking server actions with curl

Pages use React server actions (`<form action={fn}>`). To submit one:

1. GET the page, extract the hidden field names matching `\$ACTION_ID_[a-f0-9]+`.
   They appear in form/document order — form 1 on every page is the layout's
   sign-out form; subsequent IDs belong to the page's forms in order.
2. POST multipart to the same page URL with the action ID as an *empty-valued
   field name* plus the form fields:

```bash
curl -s -b jar.txt -D - -X POST localhost:3111/users -H 'Accept: text/x-component' \
  -F '$ACTION_ID_<hash>=' -F 'name=...' -F 'email=...'
```

3. `redirect()` in the action returns **303 with a `Location:` header** (body is
   empty — don't grep the body for the redirect). Plain revalidate returns 200.

## Gotchas

- JWT sessions cache the role at sign-in: after changing a user's role, re-login
  to observe `requireAdmin` behavior.
- `requireAdmin` redirects members to `/` (pages: 307; actions: 303 Location: /).
