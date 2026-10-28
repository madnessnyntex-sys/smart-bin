# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Smart Trash Bin with Rice Vendo: a bin's camera classifies an item, and the backend decides whether to dispense rice, reject the item, or report that the hopper is empty. The repo has two independent packages (no root `package.json`):

- `backend/`: Node.js (CommonJS) + Express 4 + MySQL (`mysql2`), validation with zod
- `frontend/`: Next.js 14 (App Router, plain JS) + Tailwind dashboard

## Project rules

This is a school project (rice given for recyclable trash), so these rules apply to every change:

- The stack is required and must not be replaced: Next.js + Tailwind CSS (frontend), Node.js + Express + MySQL (backend).
- `npm test` in `backend/` must keep passing.
- Don't change existing API routes or the database schema without telling the user first. If the schema changes, update `backend/schema.sql`.
- Keep code simple and commented in plain language. The user has to be able to explain it to their teacher.
- Never commit `.env` files.

## Commands

Database (MySQL 8): `docker compose up -d` from the repo root, which auto-runs `backend/schema.sql` on first start. Without Docker, run `backend/schema.sql` in MySQL Workbench.

Backend (from `backend/`):
- `cp .env.example .env`, then `npm install`
- `npm run dev`: starts the API on :4000 with `node --watch`
- `npm start`: runs it without watch
- `npm test`: runs all tests; it uses Node's built-in `node --test` runner and needs no database
- `node --test test/rewards.test.js`: runs a single test file
- `node --test --test-name-pattern="refill" test/api.test.js`: runs tests matching a name
- `npm run db:init`: creates the tables in an existing database (for a hosted MySQL). It runs `schema.sql` minus its `CREATE DATABASE`/`USE` lines, and refuses a non-local `DB_HOST` unless `BIN_API_KEY` is set (it replaces the public dev bin key)

Frontend (from `frontend/`): `npm install`, `npm run dev` (:3000), `npm run build`, `npm start`. There is no lint or test setup. The API base URL comes from `NEXT_PUBLIC_API_URL` and defaults to `http://localhost:4000`.

## Architecture

**Backend request flow.** `server.js` boots, `app.js` (`createApp()`) wires helmet, CORS (locked to `CORS_ORIGIN`), a 10kb JSON body limit and a rate limiter, then mounts `routes.js` under `/api`. After that come `notFound` and `errorHandler` from `middleware.js`. `createApp()` is a factory so tests can `listen(0)` without starting the real server. Config is read from env only in `config.js`.

**Three kinds of caller, three kinds of auth** (all in `middleware.js`):
- Device (the bin/Arduino): `deviceAuth` checks the `x-api-key` header against a hash stored in `devices`. The raw key is never stored. The seed key is `dev-bin-key-change-me`.
- Admin: `adminAuth` checks `Authorization: Bearer ADMIN_TOKEN`. `POST /devices/:id/refill` uses `userOrAdminAuth`, which accepts either that token or a dashboard login token, because the browser can't hold `ADMIN_TOKEN` safely.
- Dashboard user: `userAuth` checks `Authorization: Bearer <JWT>` and guards every dashboard GET plus `/dev/simulate`. It only verifies the token's signature and expiry, with no DB lookup. Tokens come from `POST /auth/login` or `/auth/register`, last 8h and are signed with `JWT_SECRET`. Registration needs `REGISTER_CODE` (empty means registration is off). Password and token helpers are pure and live in `auth.js` (bcryptjs, jsonwebtoken). `config.js` refuses to start in production without a strong `JWT_SECRET`.

**Detection pipeline (`recordDetection` in `routes.js`).** This is the core of the app. It runs in one transaction via `withTransaction` from `db.js`:
1. `SELECT ... FOR UPDATE` locks the device row, so concurrent detections can't overspend the hopper.
2. It looks up the label in `waste_types`. An unknown label falls back to the seeded `Unrecognized` row, so the data is kept and the item is rejected.
3. It calls the pure `decideAction()` in `rewards.js`, which returns `DISPENSE`, `REJECT` or `OUT_OF_STOCK` plus the grams of rice.
4. It inserts a `detections` row and decrements `devices.rice_stock_grams`.

`PATCH` and `DELETE /detections/:id` fix wrong records. Both go through `lockDetection()`, which locks the device row before the detection row (same order as `recordDetection`, to avoid deadlocks). The stock math lives in `rewards.js` (`giveBackRice`, `correctDetection`), and an edit re-runs `decideAction` for the new item. Hard delete, no history is kept.

The `action` string in the response is the contract with the hardware, so the firmware only has to follow it. Change reward logic only in `rewards.js`, which is pure and unit-tested.

`POST /api/dev/simulate` reuses `recordDetection` with a fake confidence so the dashboard can be demoed without hardware. It is only registered when `NODE_ENV !== 'production'`. The device "online" status is derived in SQL: `last_seen_at` within the last 2 minutes.

**Errors.** Throw `HttpError(status, msg)` or let zod throw (schemas are in `schemas.js`). Wrap handlers in `asyncHandler`. `errorHandler` turns all of these into JSON, with zod issues in `details`. Malformed JSON gives 400, not 500. Tests assert this shape.

**Frontend.** `app/page.js` is a client dashboard made of components in `app/components/` (Stats, Hoppers, RefillControl, DailyChart, TopItems, RecentList, SimulatePanel). `page.js` polls summary, recent detections and devices every 5s through `app/lib/usePolling.js`, and `SimulatePanel` posts to `/api/dev/simulate`. All fetches go through the `api()` helper in `app/lib/api.js`. It sets `cache: 'no-store'`, attaches the saved login token, and turns network failures into a readable error. On a 401 it clears the token and sends the browser to `/login`; pass `{ auth: false }` for the login/register calls. API paths passed to `api()` include the `/api` prefix.

The token is kept in localStorage by `app/lib/auth.js`. The `Dashboard` component in `page.js` is a gate: it checks `/api/auth/me` before rendering `DashboardContent`, so nothing polls without a login. `app/login/page.js` handles both login and register. The frontend gate is only for convenience, since the backend enforces access.

## Testing notes

`test/api.test.js` only covers paths that resolve before any DB query (auth rejections, validation, 404, bad JSON). Dashboard routes need a login, so tests build a token with `signToken` from `auth.js`. Anything that touches MySQL has no automated test, so test DB-backed changes manually against the Docker DB, for example with `/api/dev/simulate`. Login and register are rate limited to 10 failed tries per 15 minutes per IP, so keep the number of failing auth requests in tests low.

## Deployment (Vercel)

Two Vercel projects from this repo: Root Directory `frontend` (Next.js, auto-detected) and `backend`. Steps are in the README. On Vercel the API is a serverless function: `backend/api/index.js` exports `createApp()` and `backend/vercel.json` rewrites every URL to it, so Express still sees the full `/api/...` path. `src/server.js` (`listen`) is only for running locally. MySQL is hosted elsewhere.

`config.js` adapts to Vercel: `VERCEL` (set by Vercel) turns on `trust proxy` (the rate limiter needs the visitor's real IP) and lowers the DB pool to 3. `CORS_ORIGIN` may be a comma-separated list. `DB_SSL=true` (optional `DB_SSL_CA`) enables TLS to the database. Production refuses to start without a 32+ character `JWT_SECRET`, and `/dev/simulate` is not registered, so the frontend needs `NEXT_PUBLIC_ENABLE_SIMULATOR=false`. `NEXT_PUBLIC_*` values are baked in at build time. The rate limiters are in memory, so on serverless they are per copy and only approximate. Not yet deployed to a real Vercel account; the setup was only tested locally.

## Gotchas

- There are no migrations. Schema changes mean editing `backend/schema.sql` and recreating the DB, because Docker only runs it on a fresh volume (`docker compose down -v`).
- `backend/dev.mwb` (a MySQL Workbench model) is untracked, and the camera model is not part of this repo.
- `bridge/` (Node, CommonJS, separate `package.json`; `npm test` there) is the serial-to-HTTP link: the Arduino's `DETECT` becomes `POST /api/device/detections` with the bin's `x-api-key`, and the backend's `action` (plus `rice_grams` for `DISPENSE`) becomes the line sent back. `core.js` holds the logic with the serial write and item picker injected, so tests use a fake backend instead of hardware; `bridge.js` is only the wiring (serialport, readline, heartbeat). `classify.js` is the empty hook for the camera model; while it returns `null`, `menu.js` asks in the terminal. `menu.js` duplicates the `waste_types` names (a test checks they match `schema.sql`). Never auto-retry a detection POST: there is no idempotency key, so a retry could count rice twice. Any problem sends `ERROR` (no rice).
- `arduino/smart_bin/smart_bin.ino` is the firmware (Uno R3, pins in `arduino/README.md`). It talks to the computer with one-line serial messages (`DETECT` out; `DISPENSE,<grams>`, `REJECT`, `OUT_OF_STOCK`, `ERROR` in), which are documented in `arduino/README.md`. The first three replies are the backend's `action` values, and `DISPENSE` carries the grams. Rice is only dispensed on an explicit `DISPENSE,<grams>`, and a missing reply times out to "no rice". No Arduino toolchain is installed on the dev machine, so the sketch has not been compiled by Claude; the user verifies it in the Arduino IDE.
