---
name: understand-project-structure
description: Fast onboarding map for ProjectFinance so agents can locate files, avoid path pitfalls, and spend fewer tokens when debugging or implementing features.
---

# ProjectFinance: Token-Saving Structure Guide

Use this file as a **2-minute map** before reading code. It is optimized for agents that need to find the right files fast, avoid duplicate exploration, and reduce context usage.

## Read Order (Mandatory)

1. Read this file first.
2. Read quick map: [QUICK_MAP.md](file:///g:/ProjectFinance/.agents/skills/project-structure-guide/references/QUICK_MAP.md)
3. Read deep architecture only if needed: [PROJECT_ARCHITECTURE_DETAIL.md](file:///g:/ProjectFinance/.agents/skills/project-structure-guide/references/PROJECT_ARCHITECTURE_DETAIL.md)

## High-Level System

- Backend: Node.js + Express in `/src`, models in `/models`
- Frontend: React + Vite in `/frontend`
- CLI: tools in `/cli`
- DB: MongoDB (Mongoose models)

## Critical Path Pitfall (Read Carefully)

### Audit log path depends on runtime cwd

- Config key: `AUTODUCK_AUDIT_LOG_DIR` (default `logs/autoduck`)
- Runtime resolution in `src/services/auditLogService.js` uses `path.resolve(process.cwd(), ...)`
- If backend starts from project root, logs go to `G:/ProjectFinance/logs/...`
- If backend starts from `src`, logs go to `G:/ProjectFinance/src/logs/...`

Always verify **both** locations when troubleshooting missing logs.

## Directory Map (What to read by task)

### Backend API changes

- Routes: `/src/routes/*.routes.js`
- Controllers: `/src/controllers/*.controller.js`
- Logic: `/src/services/*`
- Server entry: `/src/server.js`

Flow: `routes -> controller -> service -> model/external`

### AutoDuck / trading issues

- Main engine: `/src/services/autoTradeEngine.js`
- Funnel telemetry: `/src/services/tradeFunnelService.js`
- Pipeline logging: `/src/services/pipelineLogService.js`
- Audit persistence: `/src/services/auditLogService.js`
- Broker/live execution: `/src/services/exchangeBrokerService.js`
- Entry setup filters: `/src/services/entrySetupEngine.js`

### Frontend changes

- App shell/routing: `/frontend/src/App.jsx`
- API client: `/frontend/src/services/api.js`
- Feature UI: `/frontend/src/components/*`

### Data model changes

- Mongoose schemas: `/models/*`

## Fast Search Strategy (to save tokens)

1. Search symbol usage first (`rg` / exact symbol), do not read whole folders.
2. Read only target files + small windows around matches.
3. Avoid opening very large files fully unless necessary.
4. For AutoDuck questions, start from `autoTradeEngine.js` call sites and follow imports.

## Common Feature Entry Points

- AutoTrade APIs: `/src/controllers/autoTrade.controller.js`, `/src/routes/autoTrade.routes.js`
- Telegram webhook/setup: `/src/routes/telegram.routes.js`
- Security/CORS/env behavior: `/src/middlewares/configMiddleware.js`
- Scheduler start: `/src/server.js` -> `startAutoDuckScheduler()`

## Agent Best Practices (Project-specific)

1. Endpoint changes: update `route -> controller -> service` in one pass.
2. Keep `.env` as operational config; keep `.env.example` and `.env.example.en` synchronized as templates.
3. When debugging logs, check runtime cwd before changing code.
4. Prefer small, targeted reads over broad scans to reduce token use.
