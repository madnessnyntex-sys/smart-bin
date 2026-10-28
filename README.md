# Smart Trash Bin with Rice Vendo

Rice in exchange for recyclable trash. Midterm requirement #1 (initial prototype).

- `frontend/`: Next.js 14 + Tailwind CSS dashboard
- `backend/`: Node.js + Express + MySQL API
- `arduino/`: Arduino Uno sketch (ultrasonic sensor, sorting flap, rice gate). See `arduino/README.md` for wiring
- `bridge/`: Node script that passes messages between the Arduino (USB serial) and the backend. See `bridge/README.md`

## Run it

1. Database. Either use Docker (`docker compose up -d` from this folder), or open MySQL Workbench and run `backend/schema.sql`.
2. Backend
   ```
   cd backend
   cp .env.example .env   
   npm install
   npm run dev
   ```
   In `.env`, set `JWT_SECRET` (long and random) and `REGISTER_CODE` (the invite code people need to create a dashboard account).
   Already have the database from before? Run `backend/schema.sql` again. It only adds the new `users` table.
3. Frontend (second terminal)
   ```
   cd frontend
   npm install
   npm run dev
   ```
4. Open http://localhost:3000. You'll land on the login page. Click "I have an invite code" and create an account with your `REGISTER_CODE`.
   "Drop item in bin" fakes a detection so you can demo without hardware.

5. With the hardware: upload the sketch from `arduino/`, then run the bridge (`bridge/README.md`).

Tests: `cd backend && npm test` and `cd bridge && npm test` (no database or hardware needed).

## How the bin talks to the backend

Each bin has an API key. It sends it in the `x-api-key` header, and only a hash is stored in MySQL.
The dev key from the seed data is `dev-bin-key-change-me`.

```
POST /api/device/detections
x-api-key: dev-bin-key-change-me
{ "item": "Water bottle", "confidence": 0.93 }

-> { "id": 12, "item": "Water bottle", "action": "DISPENSE", "rice_grams": 20, "stock_left": 4980 }
```

`action` is what the Arduino should do: `DISPENSE` runs the rice servo, `REJECT` runs the reject
servo, `OUT_OF_STOCK` means it's recyclable but the hopper is empty. Items the camera model
labels with something unknown are saved as "Unrecognized" and rejected, so the data isn't lost.

## API

| Method | Route | Auth | What it does |
|---|---|---|---|
| POST | /api/device/detections | device key | Log a detection, take rice out of the hopper |
| POST | /api/device/heartbeat | device key | Marks the bin online |
| POST | /api/auth/register | invite code in the body | Create a dashboard account, returns a login token |
| POST | /api/auth/login | none | Log in, returns a login token |
| GET | /api/auth/me | login token | Which user the token belongs to |
| GET | /api/summary?days=7 | login token | Totals, counts per item, items per day |
| GET | /api/detections/recent | login token | Last 10 detections |
| PATCH | /api/detections/:id | login token | Fix a wrong detection: body `{ "item": "Soda can" }`. The old rice goes back and the new item is judged again |
| DELETE | /api/detections/:id | login token | Delete a wrong detection and put its rice back into the hopper count |
| GET | /api/devices | login token | Bins, rice left, online/offline |
| GET | /api/waste-types | login token | Items and rice reward each |
| POST | /api/devices/:id/refill | login token or `ADMIN_TOKEN` | Add rice to a hopper (never above its capacity). The dashboard's "Refill rice" button uses this |
| POST | /api/dev/simulate | login token, off in production | Demo helper |

A "login token" is sent as `Authorization: Bearer <token>`. It comes from register/login and lasts 8 hours.

## Deploying on Vercel

The website and the API are two separate Vercel projects made from this one GitHub repo, plus a MySQL database
hosted somewhere else (Vercel doesn't host MySQL). The Arduino and the bridge stay on your computer and talk to the deployed API.

**1. Hosted MySQL.** Create a MySQL 8 database with any provider that allows connections from the internet
(for example Aiven, TiDB Cloud or Railway; check what their free plans include). Note its host, port, user, password and database name.
Then create the tables from your computer (PowerShell shown; `BIN_API_KEY` is a new long random secret for the bin, keep it):

```
cd backend
$env:DB_HOST="..."; $env:DB_PORT="..."; $env:DB_USER="..."; $env:DB_PASSWORD="..."; $env:DB_NAME="..."
$env:DB_SSL="true"; $env:BIN_API_KEY="<long random secret>"
npm run db:init
```

It refuses to run against a remote database without `BIN_API_KEY`, because otherwise the bin would keep the public dev key.

**2. API project.** On Vercel: Add New > Project > import this repo > set **Root Directory** to `backend`. Add these Environment Variables:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | 32+ random characters (the API won't start without it) |
| `REGISTER_CODE` | the invite code for new dashboard accounts |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | from your database provider |
| `DB_SSL` | `true` |
| `CORS_ORIGIN` | the website's address, set in step 4 |
| `ADMIN_TOKEN` | optional, only for scripts that call the refill endpoint |

Deploy, then open `https://<your-api>.vercel.app/api/health`. You should see `{"status":"ok"}`.

**3. Website project.** Add New > Project > same repo > **Root Directory** `frontend` (Vercel detects Next.js). Environment Variables:
`NEXT_PUBLIC_API_URL` = the API's address from step 2 (no slash at the end), and `NEXT_PUBLIC_ENABLE_SIMULATOR` = `false`. Deploy.

**4. Let the website call the API.** In the API project set `CORS_ORIGIN` to the website's address
(several can be listed with commas) and redeploy the API. Variables only take effect on the next deploy.
`NEXT_PUBLIC_API_URL` is baked in when the website is built, so redeploy the website too if you change it.

**5. Use it.** Open the website, create an account with your `REGISTER_CODE`. For the bin, set `API_URL` in `bridge/.env` to the API's address
and `DEVICE_API_KEY` to your `BIN_API_KEY`.

Things to know:
- **No simulator online.** `/api/dev/simulate` is switched off in production. To demo without the bin, send a detection yourself:
  `curl -X POST <api>/api/device/detections -H "x-api-key: <BIN_API_KEY>" -H "Content-Type: application/json" -d '{"item":"Soda can"}'`.
- **Rate limits are weaker.** The limits are counted in memory, and Vercel can run several copies of the API at once, each with its own count.
  The "10 failed logins per 15 minutes" limit is therefore not reliable online. Use a strong password.
- **Every website address needs permission.** Vercel gives each preview deployment its own address. Only addresses listed in `CORS_ORIGIN` can use the API.
- **First request after a quiet spell is slower**, because Vercel starts the API from scratch.

## Design notes

- Detection + rice deduction happen in one transaction with the device row locked, so the hopper can't go negative.
- The reward rule lives in `backend/src/rewards.js` as a pure function, and it's tested.
- Request bodies and query strings are validated with zod. Errors come back as JSON with the same shape.
- helmet, rate limiting, CORS locked to the frontend origin, request size limit.
- Editing or deleting a detection only corrects the records and the hopper count. Rice that already came out of the bin can't come back. Rice given back never pushes the count above the hopper's capacity.
- Dashboard passwords are stored only as bcrypt hashes. Login tokens are JWTs signed with `JWT_SECRET`. Login and register allow 10 failed tries per 15 minutes.
- The browser keeps the token in localStorage. A script injected into the page could read it (XSS), which is fine for a prototype. An httpOnly cookie would be safer.

## Not done yet

- No migration tool, just `schema.sql`.
- The Vercel setup is prepared and tested locally, but it hasn't been deployed to Vercel yet.
- The sketch and the bridge haven't been run on the real hardware yet. The bridge is tested against a fake backend and a scratch database.
- The camera model isn't connected. `bridge/classify.js` is the empty spot for it, and until then you pick the item in the terminal.
