---
name: understand-project-structure
description: Skill to help AI agents understand the directory structure, file purposes, and overall architecture of the VNstock-Finance-Agent project to save tokens and locate files quickly.
---

# VNstock-Finance-Agent: Project Structure Guide

When working on this project, use this guide to quickly locate the correct files and understand the architecture without needing to manually explore the directory tree. This saves context tokens and time.

> [!NOTE]
> **For a deep-dive into the core business logic, final outputs, and execution flow of major files, please read:**
> [PROJECT_ARCHITECTURE_DETAIL.md](file:///g:/ProjectFinance/.agents/skills/project-structure-guide/references/PROJECT_ARCHITECTURE_DETAIL.md)

## High-Level Architecture

The project is a full-stack application:
- **Backend**: Node.js + Express (located in `/src`, `/models`).
- **Frontend**: React + Vite (located in `/frontend`).
- **CLI**: A command-line tool for interacting with the system (located in `/cli`).
- **Database**: MongoDB (Mongoose models in `/models`).

---

## Backend Directory (`/src` & `/models`)

### `/models`
Contains Mongoose database schemas.
- `AiBehavior.js`: AI behavior configurations.
- `AutoTrade.js`: Auto-trading rules/logs.
- `CryptoCoin.js`, `Stock.js`, `DerivNews.js`: Data models for various financial instruments.
- `User.js`, `UserOrder.js`: User data and portfolio tracking.
- `Portfolio.js`, `Setting.js`: User portfolio and system settings.

### `/src/controllers`
Handles incoming HTTP requests, invokes services, and sends HTTP responses.
- `ai.controller.js`: AI-related endpoints.
- `auth.controller.js`: Authentication.
- `autoTrade.controller.js`: Automated trading logic.
- `crypto.controller.js`, `market.controller.js`, `derivatives.controller.js`: Financial data endpoints.
- `portfolio.controller.js`: Portfolio management.

### `/src/routes`
Express route definitions mapping URLs to controllers.
- `api.js`: Main router combining all routes.
- `*.routes.js`: Specific feature routes (e.g., `ai.routes.js`, `crypto.routes.js`).

### `/src/services`
Core business logic, external API integrations, and heavy lifting.
- `aiService.js`: Integration with AI models.
- `autoTradeEngine.js`, `quantEngine.js`, `hedgeFundEngine.js`: Trading and quantitative analysis logic.
- `cryptoService.js`, `marketInsightService.js`: Financial data processing.
- `telegramService.js`, `telegram_signal_gateway.py`: Telegram bot and signal integrations.
- `multiProviderRouter.js`: Routing requests to multiple data providers.

### `/src/jobs`
Cron jobs and background tasks.
- `cryptoUpdater.js`, `derivUpdater.js`: Background updaters for financial data.
- `newsCron.js`: Fetching news periodically.
- `portfolioMatcher.js`: Matching user portfolios with market data.

### `/src/fetchers` & `/src/scrapers`
Modules to retrieve external data.
- **Fetchers** (`cafefService.js`, `tcbsService.js`): API clients for financial data providers.
- **Scrapers** (`cafefMarketScraper.js`, `googleNewsDecoder.js`, `vnNewsSearch.js`): Web scraping utilities for news and market data.

### `/src/utils` & `/src/middlewares`
- **utils**: Shared helpers (e.g., `browserManager.js` for headless browsers).
- **middlewares**: Express middlewares (e.g., `configMiddleware.js`).

### `/src/server.js`
The main entry point for the backend server.

---

## Frontend Directory (`/frontend`)

React + Vite frontend application.

### `/frontend/src/components`
Reusable React UI components.
- **Tabs/Pages**: `AutoDuckTab.jsx`, `CryptoTab.jsx`, `DerivativesTab.jsx`, `VnStocksTab.jsx`, `PaperTradingTab.jsx`.
- **UI Widgets**: `CyberpunkClock.jsx`, `MarketOverview.jsx`, `MarketRadar.jsx`, `TradingChart.jsx`, `StockChart.jsx`.
- **Layout/Global**: `AppHeader.jsx`, `UserMenu.jsx`, `DraggableLog.jsx`.
- **AI Integration**: `StockAiChat.jsx`.

### `/frontend/src/services`
Frontend API client logic.
- `api.js`: Axios/Fetch configurations to call the backend.

### `/frontend/src/App.jsx` & `main.jsx`
Main React application roots and routing.

### `/frontend/src/index.css` & `App.css`
Global styling (utilizing TailwindCSS usually, check `tailwind.config.js`).

---

## CLI Directory (`/cli`)
A terminal interface for the app.
- `omni-cli.js`: Main CLI entry point.
- `apiClient.js`: Client to communicate with the backend.
- `screenmanager.js` & `/views`: Handles CLI screen rendering for different markets (crypto, stock, deriv).

## Root Files
- `omni-manager.bat`: Script to start/manage the application stack.
- `.env` & `.env.example`: Environment variables (API keys, DB URIs).

---

## Best Practices for Agents
1. **Adding a new endpoint**: Update `/src/routes/X.routes.js` -> Create/Update `/src/controllers/X.controller.js` -> Create/Update `/src/services/XService.js`.
2. **Adding a UI feature**: Create component in `/frontend/src/components/`, update `/frontend/src/services/api.js` if a new endpoint is needed.
3. **Database Changes**: Update the schema in `/models/` first.
