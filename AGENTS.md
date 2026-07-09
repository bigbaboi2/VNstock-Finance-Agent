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
