# QUICK MAP — PROJECTFINANCE (FOR AGENTS)

This is the shortest reliable map to navigate the codebase with minimal token cost.

## 1) If you only have 60 seconds

- Backend entry: `src/server.js`
- Main trading engine: `src/services/autoTradeEngine.js`
- AutoTrade APIs: `src/controllers/autoTrade.controller.js` + `src/routes/autoTrade.routes.js`
- Audit logs: `src/services/auditLogService.js`
- Frontend root: `frontend/src/App.jsx`
- API client (frontend): `frontend/src/services/api.js`

## 2) Where logs are actually written

Audit logs use:

- `AUTODUCK_AUDIT_LOG_DIR` (default `logs/autoduck`)
- resolved by `path.resolve(process.cwd(), AUTODUCK_AUDIT_LOG_DIR, date, channel.jsonl)`

So possible locations:

- `G:/ProjectFinance/logs/autoduck/...` (when started from repo root)
- `G:/ProjectFinance/src/logs/autoduck/...` (when started with cwd=`src`)

Always check both before assuming logs are missing.

## 3) File map by task

### A. API endpoint bug

1. `src/routes/*.routes.js`
2. `src/controllers/*.controller.js`
3. `src/services/*`
4. `models/*` (if DB involved)

### B. AutoDuck signal/filter/execution issue

1. `src/services/autoTradeEngine.js`
2. `src/services/entrySetupEngine.js`
3. `src/services/tradeContextService.js`
4. `src/services/exchangeBrokerService.js`
5. `src/services/tradeFunnelService.js`
6. `src/services/pipelineLogService.js`
7. `src/services/auditLogService.js`

### C. Frontend data mismatch

1. `frontend/src/components/*` (view)
2. `frontend/src/services/api.js` (request)
3. backend route/controller/service chain

## 4) Runtime flow cheatsheet

- `src/server.js` starts app and scheduler
- `startAutoDuckScheduler()` triggers periodic pipeline
- pipeline emits:
  - console logs (`pipelineLogService`, `tradeFunnelService`)
  - in-memory tails
  - JSONL file logs via `auditLogService`

## 5) Token-saving debugging recipe

1. Search exact symbol/function first.
2. Read only nearby lines and directly imported files.
3. Confirm env + cwd assumptions before touching code.
4. Modify smallest surface area possible.
