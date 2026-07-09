# AGENTS.md

## Cursor Cloud specific instructions

OMNI DUCK is a full-stack finance terminal. Standard install/run commands live in `README.md` (Quick Start) and the `scripts` sections of `package.json` (root) and `frontend/package.json`. Notes below are only the non-obvious, environment-specific gotchas.

### Services (all run in dev/watch mode)

| Service | Dir | Start command | Port | Notes |
|---------|-----|---------------|------|-------|
| MongoDB | — | `mongod --dbpath /data/db --bind_ip 127.0.0.1 --port 27017` | 27017 | Must be running before the backend; backend `process.exit(1)`s if it can't connect. |
| Backend (Express) | repo root | `npm run dev:backend` | 3001 | Reads root `.env`. |
| Frontend (Vite + React) | `frontend/` | `npm run dev` | 5173 | Vite proxies `/api` → `localhost:3001`; open the app here. |
| PDF parser (FastAPI, optional) | `Convertpdf/` | `python Convertpdf.py` | 8000 | Only needed for TCBS PDF report analysis. Requires heavy `docling` deps; skip unless working on PDF parsing. |

MongoDB and the frontend must be started as background processes (e.g. separate tmux sessions); none of them are launched by the update script.

### Non-obvious gotchas

- **Node version / `--use-system-ca`:** `npm run dev:backend` runs `node --use-system-ca`, a flag that only exists on Node ≥ 22.15. The base image's default `node` (`/exec-daemon/node`) is 22.14 and will crash with `bad option: --use-system-ca`. A newer Node 22 is installed via nvm and set as the default; `~/.bashrc` prepends it to `PATH` so login shells (including tmux `bash -l`) resolve `node` to the nvm version. Always start the backend from a login shell so the flag works.
- **Frontend install needs `--legacy-peer-deps`:** `recharts@2.10.4` declares a React 16/17/18 peer dependency but the app is on React 19, so a plain `npm install` in `frontend/` fails with `ERESOLVE`. Use `npm install --legacy-peer-deps`.
- **`.env`:** copy from `.env.example.en` → `.env` at repo root. For local dev only `MONGODB_URI` matters to boot; set it to `mongodb://127.0.0.1:27017/omniduck`. AI provider keys (Gemini/Groq/etc.) are optional — without them the server still boots and serves market data; only AI analysis features degrade (warnings, not crashes). `PORT` is hardcoded to 3001 in `src/server.js` and is not read from `.env`.
- **`scripts/` is gitignored:** the `diag:*` / `test:*` npm scripts reference files under `scripts/` that are not in the repo, so those npm scripts will not run here. There is no real automated test suite (`npm test` just errors by design).
- **Lint:** `cd frontend && npm run lint` works but the repo currently has many pre-existing ESLint errors (unused `React` imports, etc.); a non-zero exit is expected and is not caused by environment setup.
- **Hello-world check:** register + login via the UI at `http://localhost:5173` (register button = "Đăng ký"), or hit `POST /api/auth/register` and `POST /api/auth/login`. Auth stores users in MongoDB with plaintext passwords.

### Multi-environment conflict prevention (cloud VM vs local machine)

The cloud VM and a developer's local machine are fully separate hosts, so ports (`3001`/`5173`/`27017`) never clash across them. Conflicts only arise through **shared external resources referenced in `.env`**. The cloud `.env` is configured to minimize these:

- **Shared MongoDB (e.g. Atlas):** if the cloud and local point `MONGODB_URI` at the same cluster, **both** backends run their startup background jobs against the same DB — AutoDuck scheduler, `newsCron`, `vnStockNewsPrefetch`, `symbolUpdater`/`cryptoSymbolUpdater`, `marketInsight` (all wired in `src/server.js`). This causes duplicate writes, double scraping load, and doubled AI-quota usage. Mitigations: run only one instance's pipeline at a time (the Telegram `/stop` command locks the pipeline, but the lock is a DB `Setting` so it affects both instances), or use a **separate database name / cluster** for the cloud if you need true isolation. Atlas also enforces a **Network Access (IP allowlist)** — the cloud VM's egress IP is dynamic across sessions, so allowlisting typically requires `0.0.0.0/0`; otherwise the backend fails to connect and `process.exit(1)`s.
- **Telegram:** one bot token allows only one webhook. The cloud `.env` keeps `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`/`TELEGRAM_ADMIN_CHAT_ID` **empty** so the cloud never fights the local machine for the webhook. Set a token on the cloud only if using a *different* bot.
- **ngrok:** don't run `dev:tunnel` on the cloud — the frontend reaches the backend via the Vite `/api` proxy, so no tunnel is needed, and a shared `NGROK_DOMAIN` only allows one active tunnel.
- **AI providers:** the cloud is configured to use **only Gemini** (`GEMINI_API_KEY_MAIN`/`_ACTION`/`_INSIGHT` set; `GROQ`/`CEREBRAS`/`SAMBANOVA`/`OPENROUTER`/`DEEPINFRA`/`MISTRAL` left empty). The multi-provider router (`src/services/multiProviderRouter.js`) skips empty-key providers and falls back to Gemini. A single free Gemini key is shared quota, so the always-on AutoDuck/insight schedulers will consume it.

### Broker / live-trading impact on a shared DB

Real orders are only placed by AutoDuck when a user has an Auto Duck package (`UserOrder`) with `executionMode === 'LIVE'` and an attached `exchangeConnectionId` (`src/services/autoTradeEngine.js` → `executeLiveEntry`/`executeLiveExit`). Because a shared Atlas DB carries those connections and the encrypted keys, running a second backend on the same DB could otherwise place **duplicate real orders**.

Safeguard in place: exchange API keys are stored AES-256-GCM encrypted with `ENCRYPTION_KEY` (`src/services/encryptionService.js`), and `getCredentials()` in `exchangeBrokerService.js` decrypts them just before calling the exchange. The cloud VM intentionally uses a **different `ENCRYPTION_KEY` than local**, so GCM auth-tag verification fails and `decrypt()` throws → the cloud cannot decrypt local's stored keys and any live entry/exit is logged `FAILED` instead of hitting the exchange. Net effect: **the cloud never executes real trades against broker connections created on the local machine.** Do NOT copy the local `ENCRYPTION_KEY` onto the cloud unless you deliberately want the cloud to trade live (and even then, ensure only one instance runs the pipeline to avoid double orders). Paper trading and SIM AutoDuck are unaffected.
