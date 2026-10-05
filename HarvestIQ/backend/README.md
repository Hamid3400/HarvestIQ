# HarvestIQ Backend

Secure API for **HarvestIQ**, an AI-powered agricultural marketplace for Nigerian smallholder farmers.
Built for the **OPay x Google National Innovation Challenge 2026** by **Team JimiGen**, Bamidele Olumilua University (Computer Science).

> Status: all feature work is complete and verified (Steps 1 to 10). Production build and Git setup are done (Step 11a to 11c). Production database region and hosting (Step 11d onward) are still to do. Payments currently use a **mock OPay**, so this build is not ready to hold real money yet (see "Before launching with real money").

---

## 1. What the backend does

| Area | What it provides |
|---|---|
| Accounts | Registration and login for farmers, buyers and processors, with secure sessions |
| Roles | Farmer, Buyer, Processor and Admin, enforced on every protected route |
| Marketplace | Farmers publish crop listings; buyers browse, search and order |
| Crop scanner | A farmer uploads a crop photo; Google Gemini returns quality, ripeness, health issues and harvest and storage advice in English, Yoruba, Hausa or Igbo |
| Wallet and ledger | Every buyer and farmer has a wallet backed by a permanent double-entry ledger |
| Escrow | Buyer money is held until delivery is confirmed, then released to the farmer |
| Disputes | A buyer can dispute a delivery; an admin decides who gets the money |
| Automatic deadlines | Overdue deliveries are refunded and unconfirmed deliveries are paid out automatically |

Not built yet: the mobile app (React Native), the Farmer Enlightenment video and audio module, the predictive price analytics engine, and real OPay integration.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js, ES modules | Matches the concept note |
| Language | TypeScript (strict) | Catches bugs before they ship |
| Web framework | Express 5 | Async errors reach the error handler automatically |
| Database | PostgreSQL on Neon | Real transactions, so a payment is never half-saved |
| ORM | Prisma 7 with the `pg` driver adapter | Type-safe, parameterized queries (blocks SQL injection) |
| Validation | Zod | Every input is checked against a strict shape |
| Passwords | argon2id | Current best practice, deliberately slow to crack |
| Sessions | JWT access tokens plus rotating refresh tokens | Short-lived access, revocable refresh |
| AI | Google Gemini via `@google/genai` | Crop image analysis |
| Logging | pino and pino-http | Structured logs with secrets redacted |
| Tests | Vitest | Fast unit tests |

## 3. Project structure

```
harvestiq-backend/
  prisma/
    schema.prisma            database tables
    migrations/              history of every database change
  prisma7.config.ts          Prisma CLI configuration
  scripts/
    make-admin.ts            promote an existing user to ADMIN
    ledger-check.ts          audit the ledger for correctness
  src/
    server.ts                app setup, middleware order, startup and shutdown
    config.ts                validated environment variables
    db.ts                    Prisma client, connection settings, startup retry
    errors.ts                AppError class for safe, intentional errors
    logger.ts                pino logger with redaction
    middleware/
      auth.ts                authenticate (verify token) and requireRole
      errorHandler.ts        one place that turns errors into safe responses
    utils/
      tokens.ts              access token signing, refresh token generation and hashing
    modules/
      auth/                  register, login, refresh, logout
      users/                 profile route
      listings/              crop listings
      orders/                orders, payment, delivery, refunds, disputes, settlement
      scans/                 Gemini crop scanner
      wallet/                ledger engine, wallet route, OPay webhook
      admin/                 dispute review and resolution
  tests/
    auth.test.ts
    ledger.test.ts
  .env.example               names of required variables (no secrets)
```

## 4. Getting started

Prerequisites: Node.js (22 or newer recommended), npm, a PostgreSQL database (this project uses Neon), and a Gemini API key from Google AI Studio.

```bash
npm install
cp .env.example .env        # on Windows: copy .env.example .env
# fill in .env (see the table below), never commit it
npx prisma migrate deploy   # apply database migrations
npm run dev                 # start with auto-restart on http://localhost:4000
```

Check it works: open `http://localhost:4000/health` and `http://localhost:4000/health/db`.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | no | `development` (default), `production` or `test` |
| `PORT` | no | Port to listen on (default 4000) |
| `CORS_ORIGINS` | no | Comma-separated website origins allowed to call the API from a browser. Mobile apps are not affected by CORS. Must not contain `localhost` in production |
| `DATABASE_URL` | yes | PostgreSQL connection string (use `sslmode=verify-full`) |
| `DIRECT_URL` | no | Direct (non-pooled) connection string for migrations, if configured in `prisma7.config.ts` |
| `JWT_ACCESS_SECRET` | yes | Random secret, at least 32 characters |
| `ACCESS_TOKEN_TTL_SECONDS` | no | Access token lifetime (default 900, so 15 minutes) |
| `REFRESH_TOKEN_TTL_DAYS` | no | Refresh token lifetime (default 30) |
| `GEMINI_API_KEY` | yes | Google Gemini key, kept server-side only |
| `GEMINI_MODEL` | no | Model name (default `gemini-3.8-flash`) |
| `OPAY_WEBHOOK_SECRET` | yes | Secret used to verify webhook signatures, at least 32 characters |
| `DELIVERY_DEADLINE_HOURS` | no | Hours a farmer has to mark a paid order delivered before auto-refund (default 168, so 7 days) |
| `CONFIRM_WINDOW_HOURS` | no | Hours a buyer has to confirm or dispute before auto-release (default 72) |
| `SWEEP_INTERVAL_SECONDS` | no | How often deadlines are checked (default 300) |
| `TRUST_PROXY_HOPS` | no | Number of proxies in front of the server (default 0; set to 1 behind a typical host) |

Generate a secret with: `node -p "crypto.randomBytes(48).toString('hex')"`.
Production secrets must be different from development secrets.

### npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Run the server with auto-restart (development) |
| `npm run build` | Generate the Prisma client and compile TypeScript into `dist/` |
| `npm start` | Run the compiled server (production) |
| `npm run typecheck` | Check types without producing files |
| `npm test` | Run the automated tests |
| `npm run ledger-check` | Audit the ledger (three correctness checks) |
| `npm run make-admin -- email` | Promote an existing account to ADMIN |
| `npm run db:deploy` | Apply migrations safely to a live database (never use `migrate dev` on production) |

## 5. How it was built, step by step

### Step 1: Project setup and first secure server
- **Goal:** a running server with safe defaults, and a repeatable project skeleton.
- **Built:** an Express app with Helmet (secure HTTP headers), CORS control, a 10 KB request size limit, and a `/health` route. TypeScript strict mode, `.gitignore` that keeps `.env` out of Git.
- **Verified:** `/health` returned `{"status":"ok"}`.

### Step 2: Validated configuration and central error handling
- **Goal:** the app refuses to start with bad configuration, and never leaks internals to clients.
- **Built:** `config.ts` validates every environment variable with Zod at startup. `AppError` for intentional errors and a central handler that logs real errors server-side and returns generic messages (debug detail only in development). Disabled the `x-powered-by` header.
- **Verified:** a bad `PORT` stopped the app with a clear message; unknown routes returned a clean 404.

### Step 3: Database with Neon and Prisma
- **Goal:** persistent, transactional storage.
- **Built:** Prisma 7 with the PostgreSQL adapter, the first migration (`User`, `RefreshToken`, `Role` enum), `db.ts` with a connection timeout and a startup retry, and a `/health/db` check.
- **Lesson:** Neon's free tier sleeps when idle, so the first connection can be slow. The startup retry and longer timeouts handle it.
- **Verified:** `/health/db` returned `connected`.

### Step 4: Registration and login
- **Goal:** secure accounts and sessions.
- **Built:** argon2id password hashing; Zod rules (10 to 128 character passwords, normalized emails); short-lived JWT access tokens (HS256, issuer checked); refresh tokens that are random, stored only as SHA-256 hashes, and **rotate on every use**. Reusing an already-used refresh token revokes all of that user's sessions (theft detection). Accounts lock for 15 minutes after 5 failed logins. Login gives the same error for a wrong email or wrong password and does equal work either way (no account discovery). Public registration cannot create ADMIN accounts. Auth routes are rate limited to 20 requests per 15 minutes.
- **Verified:** register, login, refresh once (works) and refresh twice (refused).

### Step 5: Protected routes and roles
- **Goal:** know who is calling and what they may do.
- **Built:** `authenticate` middleware (verifies token signature, algorithm and issuer, then loads the user from the database so deactivated accounts and role changes take effect immediately) and `requireRole`. `GET /api/users/me` returns a safe profile (never the password hash).
- **Verified:** profile with a token worked; no token gave 401; wrong role gave 403.

### Step 6: Marketplace
- **Goal:** farmers sell, buyers buy, without overselling.
- **Built:** `Listing` and `Order` tables. Money is stored as whole **kobo** integers (no decimals). Ownership is enforced inside database queries, so a farmer can only change their own listings, and others get "not found". Zod strips unknown fields (no mass assignment). Stock reservation is one atomic conditional update inside a transaction, so two buyers can never buy the same last kilograms. Each order stores a price snapshot. Public listing views hide farmer email and phone.
- **Verified:** browsing, ordering, over-ordering (refused), stock dropping and returning on cancel.

### Step 7: Gemini crop scanner
- **Goal:** AI crop analysis without exposing keys or accepting dangerous uploads.
- **Built:** `POST /api/scans` (farmers only). Login, role and a per-user limit (20 scans per hour) run **before** the upload is read. Uploads are held in memory only, limited to 4 MB, and the file type is verified from the **real bytes**, not the filename (JPEG, PNG or WebP only). Gemini's answer is treated as untrusted and must pass a strict Zod schema; the prompt tells the model to treat text inside images as data, not instructions, and to avoid recommending chemicals or doses. Advice language: English, Yoruba, Hausa or Igbo.
- **Verified:** a real tomato photo was analysed; a text file renamed to an image was refused (415); an oversized file was refused (413).

### Step 8: Wallet ledger, escrow and mock OPay
- **Goal:** handle money so it can never be created, lost or double-spent.
- **Built:**
  - A **double-entry ledger**: every movement is permanent rows that add up to exactly zero. Balances are sums of rows, not editable numbers.
  - **Row locking** before balance checks, so two simultaneous payments cannot both spend the same money.
  - **Idempotency keys** (unique per ledger transaction), so retries and duplicate webhooks cannot pay twice.
  - **Escrow:** pay moves money from the buyer's wallet to escrow; confirming delivery moves it to the farmer; a refund moves it back.
  - A **signed webhook** (`/api/webhooks/opay`): HMAC-SHA256 over the exact raw body, constant-time comparison, strict payload validation. It is a **mock** format, not OPay's real one.
  - A database trigger that makes ledger rows **immutable** (updates and deletes are rejected by PostgreSQL itself).
- **Verified:** deposits credited once and replays ignored; forged signatures refused; underfunded payments refused with full rollback; correct balances for pay, confirm and refund.

### Step 9: Hardening
- **Goal:** production-grade safety nets.
- **Built:** structured logging that redacts `Authorization` and signature headers; a global rate limit (120 requests per minute per IP); graceful shutdown that finishes in-flight requests; transaction timeouts suited to a slow database link; automated tests (registration rules, token handling, ledger rules); `.env.example`; a type-check script.
- **Dependency audit:** `npm audit` first reported 4 high issues, all inside the Prisma command-line tool's dependency chain. They were resolved safely with `overrides` for two helper packages (`deepmerge-ts`, `mysql2`), after which `npm audit` reported 0 vulnerabilities and all checks still passed. Retest after any Prisma upgrade, because forced versions can conflict.
- **Verified:** 7 of 7 tests passing, clean type-check, 0 audit findings.

### Step 10: Escrow safety (deadlines, disputes, admin)
- **Goal:** nobody's money can be frozen forever.
- **Built:**
  - Farmers mark orders **delivered**; the buyer then has a confirmation window.
  - If the farmer never delivers, a timer **auto-refunds** the buyer. If the buyer never responds, it **auto-releases** to the farmer.
  - Buyers can **dispute** a delivered order; the money stays frozen until an **admin** decides (release to farmer or refund to buyer). An admin cannot judge a dispute they are personally part of.
  - Admins can only be created by a script run with database access (`make-admin`), never through the API.
  - All settlement paths share the same two functions and the same atomic status guards, so a deadline and a manual action racing each other can never pay twice.
- **Verified:** dispute outcomes both ways with exact balances, non-admins refused, double resolution refused, and both automatic deadlines (tested with shortened clocks, then restored).
- **Audit:** `npm run ledger-check` passes three checks: all ledger entries sum to zero; escrow equals the value of unfinished orders; no wallet is overdrawn.

### Step 11a to 11c: Production build, proxy settings, Git hygiene
- **11a:** `npm run build` (generate Prisma client, compile to `dist/`) and `npm start` (run compiled code with JSON logs). `db:deploy` for production migrations.
- **11b:** `TRUST_PROXY_HOPS` so rate limiting and logs see real client addresses behind a host's proxy; the app refuses to start in production if `CORS_ORIGINS` contains `localhost`.
- **11c:** `.gitignore` keeps `.env`, `dist`, generated Prisma code and test images out of Git; `.env.example` documents required variables; first commit made. Check that no secrets were committed with: `git grep -n -E "npg_|AIza|neondb_owner"` (should print nothing).

**Still to do (Step 11d onward):** create a separate production database in a region close to Nigeria (London or Frankfurt), pick a host in the same region, set production environment variables, run `npm run db:deploy` against production, enable backups and uptime monitoring, and set cost alerts on the Gemini key.

## 6. API reference

All `/api/*` routes except auth and the webhook require `Authorization: Bearer <accessToken>`.

| Method and path | Who | What |
|---|---|---|
| `GET /health` | anyone | Server is up |
| `GET /health/db` | anyone | Database is reachable |
| `POST /api/auth/register` | anyone | Create account (role FARMER, BUYER or PROCESSOR) |
| `POST /api/auth/login` | anyone | Get access and refresh tokens |
| `POST /api/auth/refresh` | anyone with a refresh token | Rotate tokens |
| `POST /api/auth/logout` | anyone with a refresh token | Revoke a refresh token |
| `GET /api/users/me` | any user | Own profile |
| `GET /api/listings` | any user | Browse active listings (`crop`, `page`, `limit`) |
| `GET /api/listings/mine` | farmer | Own listings, all statuses |
| `GET /api/listings/:id` | any user | One active listing |
| `POST /api/listings` | farmer | Create listing |
| `PATCH /api/listings/:id` | farmer (owner) | Update listing |
| `DELETE /api/listings/:id` | farmer (owner) | Cancel listing |
| `POST /api/orders` | buyer, processor | Place an order |
| `GET /api/orders/mine` | buyer, processor | Own orders |
| `GET /api/orders/received` | farmer | Orders on own listings |
| `POST /api/orders/:id/cancel` | buyer, processor | Cancel an unpaid order |
| `POST /api/orders/:id/pay` | buyer, processor | Pay from wallet into escrow |
| `POST /api/orders/:id/deliver` | farmer | Mark delivered (starts confirmation window) |
| `POST /api/orders/:id/confirm` | buyer, processor | Confirm delivery, pay the farmer |
| `POST /api/orders/:id/refund` | farmer | Cancel a paid order and refund the buyer |
| `POST /api/orders/:id/dispute` | buyer, processor | Dispute a delivered order |
| `POST /api/scans` | farmer | Crop photo analysis (multipart: `image`, optional `language`) |
| `GET /api/wallet` | any user | Balance in kobo and recent entries |
| `POST /api/webhooks/opay` | OPay (signed) | Credit a deposit (mock format) |
| `GET /api/admin/disputes` | admin | Open disputes |
| `POST /api/admin/disputes/:id/resolve` | admin | Decide a dispute |

Note: `GET /api/users/admin-check` is a temporary test route from Step 5. Remove it before launch.

## 7. Order lifecycle

```
PENDING --pay--> PAID --deliver (farmer)--> DELIVERED --confirm (buyer)--> COMPLETED
   |               |                           |  \
 cancel          refund (farmer)             refund    dispute (buyer)
   |            or auto-refund after 7 days     |            |
   v               v                           v            v
CANCELLED       CANCELLED                   CANCELLED     DISPUTED --admin--> COMPLETED or CANCELLED

DELIVERED with no buyer response for 72 hours --auto-release--> COMPLETED
```

## 8. Security summary

- Passwords hashed with argon2id; never stored or logged in plain text.
- Short-lived access tokens; refresh tokens stored only as hashes, rotated on use, with reuse detection.
- Account lockout and per-route, per-user and global rate limits.
- Same error and equal timing for wrong email or password (no account discovery).
- Role checks on every protected route; roles read from the database on each request.
- Ownership enforced in database queries; unknown fields stripped from inputs.
- Money in whole kobo, double-entry ledger, row locking, idempotency keys, immutable ledger rows.
- Signed webhooks verified in constant time over the raw body.
- Uploads: size limit, in-memory only, real file type checked from bytes; AI output validated before use.
- Secrets only in environment variables; logs redact tokens and signatures; error responses never leak internals in production.
- Dependencies audited; zero known vulnerabilities at the time of Step 9.

## 9. Testing

```bash
npm run typecheck      # no output means no type errors
npm test               # 7 unit tests (registration rules, token handling, ledger rules)
npm run ledger-check   # three PASS lines expected
```

End-to-end flows (registration, orders, escrow, disputes, automatic deadlines) were verified by hand with PowerShell scripts against a development database. Converting those into automated integration tests against a separate test database is a good next step.

## 10. Troubleshooting (problems we actually hit)

| Symptom | Cause and fix |
|---|---|
| `P1001 Can't reach database server` or `Server has closed the connection` | The free Neon database was asleep or dropped an idle connection. Open `/health/db`, retry. The startup retry and pool settings reduce this. A database in a nearby region helps most |
| `A query cannot be executed on an expired transaction` | The database link is slow. Transaction timeouts are raised in `db.ts` |
| `Authentication required` on a route you just used | Access tokens last 15 minutes. Log in again |
| PowerShell says a variable or function is empty or unknown | Variables and functions live only in the terminal window where they were created |
| `Invalid signature` on the webhook | The signing secret does not match `OPAY_WEBHOOK_SECRET` in `.env` |
| `EPERM` during `npm install` or `npm ci` | A running node process (the dev server) holds files open. Stop it first. Do not use `npm ci --omit=dev` on a development machine |
| `TS6059 ... not under rootDir` during build | `tsconfig.json` `include` must be `["src"]` only |
| `migrate dev` versus `migrate deploy` | `dev` is for development and can propose resets. Use `npm run db:deploy` on live databases |

## 11. Known gaps and roadmap

Product gaps:
- No password reset and no email or phone verification.
- Expired refresh tokens are never cleaned up (needs a small scheduled job).
- No two-factor login for admins.
- No notifications when deadlines start or disputes open.
- Disputes have no photo evidence upload yet.
- Order and wallet amounts are 32-bit integers (cap of about 20 million naira per amount); move to `BigInt` if larger values are needed.
- The deadline timer runs inside the web server. Fine for one instance; a dedicated worker is cleaner at scale.

Features from the concept note not yet built: React Native app, Farmer Enlightenment video and audio lessons, predictive price analytics using weather and market data, real OPay payments and microloans.

## 12. Before launching with real money

1. **Replace the mock OPay.** OPay's real webhook format and signature scheme will differ from the mock. Rewrite the integration from OPay's own documentation once partner credentials are available. Tie every deposit to a deposit request created by this system, so a webhook can never credit money that was not expected, and reconcile the ledger against OPay settlement reports.
2. **Check the regulation.** Holding customer funds in wallets and escrow may be regulated in Nigeria. Speak to a Nigerian fintech lawyer about whether funds may be held directly or must be held by a licensed partner. Ask about the Nigeria Data Protection Act as well, because the system stores names, phone numbers, emails and photos. This README is not legal advice.
3. **Use a production database near the users**, separate from development data, with backups confirmed and scale-to-zero disabled if the plan allows.
4. **Serve over HTTPS only**, set `TRUST_PROXY_HOPS` correctly, and verify real client IPs appear in logs.
5. **Use new production secrets** for JWT, webhook and Gemini, and set a budget alert on the Gemini key.
6. **Add uptime monitoring and error alerts**, and keep running `npm audit` and the tests before every deploy.
