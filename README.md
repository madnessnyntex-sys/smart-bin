 Smart Trash Bin with Rice Vendo

Rice in exchange for recyclable trash. Midterm requirement #1 (initial prototype).

- `frontend/`: Next.js 14 + Tailwind CSS dashboard
- `backend/`: Node.js + Express + MySQL API

Run it

1. Database. Either use Docker (`docker compose up -d` from this folder), or open MySQL Workbench and run `backend/schema.sql`.
2. Backend
   ```
   cd backend
   cp .env.example .env   
   npm install
   npm run dev
   ```
3. Frontend (second terminal)
   ```
   cd frontend
   npm install
   npm run dev
   ```
4. Open http://localhost:3000. "Drop item in bin" fakes a detection so you can demo without hardware.

Tests: `cd backend && npm test` (no database needed).

How the bin talks to the backend

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

API

| Method | Route | Auth | What it does |
|---|---|---|---|
| POST | /api/device/detections | device key | Log a detection, take rice out of the hopper |
| POST | /api/device/heartbeat | device key | Marks the bin online |
| GET | /api/summary?days=7 | none | Totals, counts per item, items per day |
| GET | /api/detections/recent | none | Last 10 detections |
| GET | /api/devices | none | Bins, rice left, online/offline |
| GET | /api/waste-types | none | Items and rice reward each |
| POST | /api/devices/:id/refill | `Authorization: Bearer ADMIN_TOKEN` | Add rice to a hopper |
| POST | /api/dev/simulate | none, off in production | Demo helper |

Design notes

- Detection + rice deduction happen in one transaction with the device row locked, so the hopper can't go negative.
- The reward rule lives in `backend/src/rewards.js` as a pure function, and it's tested.
- Request bodies and query strings are validated with zod. Errors come back as JSON with the same shape.
- helmet, rate limiting, CORS locked to the frontend origin, request size limit.

## Not done yet

- The dashboard has no login. Fine for a prototype, add auth before putting it online.
- No migration tool, just `schema.sql`.
- The camera model / Arduino code isn't part of this requirement.
