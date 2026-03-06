# Vote-Trace 360 — Telegram Bot

A stateless NestJS Telegram bot that lets citizens photo-report physical campaign assets (billboards, rallies, choppers, convoys) directly to the **Physical Assets Service**.

The bot has zero persistence — no database, no sessions. It receives a photo + caption, parses the metadata, and forwards everything to your existing service.

---

## Architecture

```
Citizen (Telegram)
      │  photo + caption
      ▼
 Telegram Bot  (this service)
      │  POST /api/v1/physical/upload
      │  x-bot-secret: <BOT_SECRET>
      ▼
 Physical Assets Service
      │  EXIF extraction, valuation,
      │  Supabase storage, reconciliation
      ▼
   Supabase / downstream systems
```

---

## Caption format

Citizens send a photo with a caption following this pattern:

```
Candidate Name, asset_type[, optional location]
```

| Field            | Required | Values                                     |
|------------------|----------|--------------------------------------------|
| `candidate_name` | Yes      | Free text, e.g. `James Otieno`             |
| `asset_type`     | Yes      | `billboard` \| `rally` \| `chopper` \| `convoy` |
| `location`       | No       | Free text, e.g. `Nairobi CBD`              |

**Examples:**
```
James Otieno, billboard, Nairobi CBD
Jane Doe, rally, Kisumu Town
John Kamau, chopper
```

---

## Prerequisites

- Node.js ≥ 18
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your Physical Assets Service running and reachable

---

## Setup

### 1. Install dependencies

```bash
cd telegram-bot
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
# From @BotFather
TELEGRAM_BOT_TOKEN=123456789:ABCdef...

# Base URL of your Physical Assets Service (no trailing slash)
API_BASE_URL=http://localhost:3001

# Shared secret — must match the value checked by your Physical Assets Service
BOT_SECRET=change_me_to_a_strong_secret
```

### 3. Run the bot

**Development (hot-reload):**
```bash
npm run start:dev
```

**Production:**
```bash
npm run build
npm run start:prod
```

The bot starts long-polling Telegram automatically on startup. A lightweight HTTP server also listens on port `3000` (configurable via `PORT` env var) for health/liveness checks.

---

## POST payload sent to Physical Assets Service

`POST /api/v1/physical/upload` — `multipart/form-data`

| Field            | Type   | Description                     |
|------------------|--------|---------------------------------|
| `image`          | file   | The photo (JPEG)                |
| `candidate_name` | string | Parsed from caption             |
| `asset_type`     | string | `billboard\|rally\|chopper\|convoy` |
| `location`       | string | Parsed from caption (optional)  |
| `source`         | string | Always `"telegram"`             |
| `uploaded_by`    | string | Telegram user ID                |

**Headers:**
```
x-bot-secret: <BOT_SECRET>
Content-Type: multipart/form-data; boundary=...
```

---

## Project structure

```
telegram-bot/
├── .env.example
├── .gitignore
├── nest-cli.json
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── src/
    ├── main.ts                              # Bootstrap
    ├── app.module.ts                        # Root module
    └── telegram/
        ├── telegram.module.ts               # TelegrafModule wiring
        ├── telegram.update.ts               # /start, photo, text handlers
        ├── caption.parser.ts                # Parses "Name, type, location"
        └── physical-assets.service.ts       # Downloads photo, POSTs to API
```

---

## Deploying

The bot only needs outbound internet access to:
- `api.telegram.org` — for long-polling and file downloads
- Your `API_BASE_URL` — for uploads

Any Node.js host works (Railway, Render, Fly.io, a plain VPS). No inbound ports are required when using long-polling.

**Docker example:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
ENV NODE_ENV=production
CMD ["node", "dist/main"]
```

Build before copying: `npm run build`
