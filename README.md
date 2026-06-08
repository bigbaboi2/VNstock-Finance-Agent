<div align="center">

<img src="https://raw.githubusercontent.com/bigbaboi2/VNstock-Finance-Agent/main/frontend/public/favicon.svg" alt="OMNI DUCK" width="280" />

# OMNI DUCK - Vnstock Finance Agent
### Quantitative Finance Terminal — Vietnam & Global Markets

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb)](https://mongodb.com)
[![Gemini](https://img.shields.io/badge/AI-Multi--Provider-4285F4?style=flat-square&logo=google)](https://aistudio.google.com)
[![Status](https://img.shields.io/badge/Status-Active%20Development-brightgreen?style=flat-square)]()

**AI-Powered Trading & Analysis Platform for Vietnamese Stocks, Derivatives & Cryptocurrency**

[🚀 Quick Start](#-quick-start) · [📖 Features](#-core-features) · [🤖 AI System](#-ai-system) · [⚙️ Configuration](#️-environment-configuration) · [🗺️ Roadmap](#️-roadmap)

</div>

---

<!--
┌─────────────────────────────────────────────────────────────────┐
│                        TABLE OF CONTENTS                        │
├─────────────────────────────────────────────────────────────────┤
│  1. 🎯 Overview & Module Status                                 │
│  2. ✨ Core Features                                            │
│     2a. 📰 Vietnamese News Intelligence                         │
│     2b. 📄 PDF Docling System                                   │
│  3. 🗂️  Tabs                                                    │
│     3a. 📈 VN Stock Market                                      │
│     3b. 🔴 Derivatives & Futures                                │
│     3c. 🤖 AI System (→ Section 5)                              │
│     3d. 🎮 Paper Trading & Portfolio                            │
│     3e. 🪙 Cryptocurrency                                       │
│     3f. 🤖 Autotrading                                          │
│     3g. ✈️  Telegram connection                                 │
│  4. 🤖 AI System (Deep Dive)                                    │
│     4a. Multi-Provider Router                                    │
│     4b. 🏦 Debate Pipeline                                      │
│     4c. 📊 Market Intelligence Engine                           │
│  5. 🏗️  System Architecture                                     │
│  6. 🛠️  Technology Stack                                        │
│  7. 📦 Installation & Setup                                     │
│  8. ⚙️  Environment Configuration                               │
│  9. 🚀 Quick Start                                              │
│  10. 📡 API Endpoints                                           │
│  11. 💪 Strengths                                               │
│  12. 🗺️  Roadmap                                                │
│  13. 📁 Project Structure                                       │
│  14. 💻 Optional CLI UI                                         │
│  15. ⚠️  Disclaimer                                             │
└─────────────────────────────────────────────────────────────────┘
-->

---

## 🎯 Overview

**OMNI DUCK** is a full-stack AI-powered quantitative finance terminal built specifically for the Vietnamese market, with global crypto and derivatives coverage.

The platform combines real-time data scraping from 10+ Vietnamese financial sources, a multi-provider AI routing engine (Gemini, Groq, Cerebras, SambaNova), a multi-phase debate analysis pipeline, automated trading with technical indicators, and a React dashboard — all in a unified self-hosted stack.

```
┌──────────────────┬────────────────┬────────────────────────────────────────────┐
│ Module           │ Status         │ Notes                                      │
├──────────────────┼────────────────┼────────────────────────────────────────────┤
│ 📰 VN News       │ ✅ Strong      │ 5 direct RSS + Google News multi-query,   │
│    Scraping      │               │ Vietnamese sentiment NLP                    │
├──────────────────┼────────────────┼────────────────────────────────────────────┤
│ 📈 VN Stock      │ ✅ Strong      │ VNDirect, TCBS, CafeF, VNstock-py,        │
│    Analysis      │               │ FireAnt social                              │
├──────────────────┼────────────────┼────────────────────────────────────────────┤
│ 🤖 AI Debate     │ ✅ Strong      │ Multi-phase Bull/Bear/PM decision engine  │
│    Pipeline      │               │                                             │
├──────────────────┼────────────────┼────────────────────────────────────────────┤
│ 🔴 Derivatives   │ ✅ Working     │ VN30F1M, macro news, AI analysis          │
├──────────────────┼────────────────┼────────────────────────────────────────────┤
│ 🎮 Paper Trading │ ✅ Working     │ Virtual 10B VND, LO/ATO/ATC orders, P&L   │
├──────────────────┼────────────────┼────────────────────────────────────────────┤
│ 🪙 Crypto        │ ⚠️ Developing │ Basic CoinGecko/Binance data,              │
│                  │               │ limited signals                             │
├──────────────────┼────────────────┼────────────────────────────────────────────┤
│ 📊 Charts        │ ⚠️ Developing │ KlineCharts + Lightweight Charts,          │
│                  │               │ UX improvements ongoing                     │
├──────────────────┼────────────────┼────────────────────────────────────────────┤
│ 🔄 AutoTrading   │ ⚠️ Improving  │ Winrate improvements, AI                   │
└──────────────────┴────────────────┴────────────────────────────────────────────┘
```

---

## ✨ Core Features

### 📰 Vietnamese News Intelligence *(Strongest module)*

The news system abandoned Google News RSS as the primary source due to stale redirect URLs stored in MongoDB. It now uses **direct RSS + multi-mode Google search** for maximum freshness:

```
┌─────────────────────────────────────────────────────┐
│          5 Direct RSS Sources  (always-on)          │
│         market-hours-aware TTL                      │
├─────────────────────────────────────────────────────┤
│  • VietStock          • CafeF        • VnEconomy    │
│  • BaoDauTu           • TinNhanhChungKhoan          │
└─────────────────────────────────────────────────────┘
```

**Multi-mode Google News search** (per ticker):

| Mode | Window | Purpose |
|------|--------|---------|
| `official` | 90 days | Corporate disclosures, financials |
| `balanced` | 60 days | General market news |
| `negative` | 30 days | Sell-offs, margin calls, violations |
| `rumor` | 21 days | Unusual volume, insider activity |

```
┌──────────────────────────────────────────────────────────────────┐
│  🧠 Vietnamese Sentiment Analysis Tool                          │
├──────────────────────────────────────────────────────────────────┤
│  • Customizable keyword dictionary                               │
│  • Negative detection (45-character review window)               │
│  • Scores positive/negative catalysts                            │
│  • No reliance on English-only tools like VADER                  │
│  • Built-in AI-based sentiment recognition                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  🏷️  Ticker Alias Expansion                                      │
├──────────────────────────────────────────────────────────────────┤
│  TCB → "Techcombank" OR "Ngân hàng Kỹ Thương" OR TCB             │
│  100+ stocks: banking, real estate, steel, utilities sectors     │
│  (can be added more in source)                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  🔥 FireAnt Social Sentiment                                     │
├──────────────────────────────────────────────────────────────────┤
│  • Tiered in-memory cache (ticker vs. market-wide)               │
│  • TTL-aware                                                     │
│  • Systems use real user account for scrapping                   │
│    → use clone account to get Bearer in env                      │
└──────────────────────────────────────────────────────────────────┘
```

---

### <img src="https://cdn.simpleicons.org/googlegemini" width="18"> AI System

See [full section below](#-ai-system) for the complete Multi-Provider Router and Debate Pipeline architecture.

---

### ![PDF](https://img.shields.io/badge/PDF-Docling-EC1C24?logo=adobeacrobatreader&logoColor=white) PDF Docling System

The system uses a PDF data extraction method that utilizes local docking, employing a technique to read the AI-generated PDF as a fallback. With 4 modes:

| Mode | OCR | ML | Speed | Use Case | Notes |
|------|-----|----|--------|----------|-------|
| **turbo** (default) | ❌ | ❌ | ~3–8s | DEFAULT | PDF text-based (TCBS, SSI, VPS...) — sufficient for 99% of reports |
| **fast** | ❌ | ✅ | ~20–40s | FAST | Needs table extraction, not too slow |
| **balanced** | ❌ | ✅ | ~60–90s | ACCURATE | Complex financial tables |
| **full** | ✅ | ✅ | ~150–200s | ACCURATE | PDF scan / photo |

*By default, the system is calling the API to retrieve the daily updated financial report PDF file for the stock code from the TCBS source:*

```
┌─────────────────────────────────────────────────────────────┐
│                  PDF PROCESSING FLOW                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
          VnStocksTab (user request)
                       │
                       ▼
          Node.js  ai.controller.js
                       │  download PDF from:
                       │  https://static.tcbs.com.vn/oneclick/{TICKER}.pdf
                       ▼
          aiService.getMarkdownFromTcbsPdf()
                       │  POST multipart/form-data
                       ▼
          Python FastAPI  :8000/parse-pdf?mode=turbo
                       │  Docling → Markdown
                       ▼
          Node.js receives Markdown
                       │  clean → cache RAM + MongoDB (TTL 4h)
                       ▼
          hedgeFundEngine.js — Fundamental Analyst uses
```

---

### <img src="https://cdn.simpleicons.org/telegram/26A5E4" width="18"> Telegram Connection

```
┌──────────────────────────────────────────────────────────────────┐
│  📡 Telegram Integration                                         │
├──────────────────────────────────────────────────────────────────┤
│  • Connected to Telegram news sources, groups, and channels      │
│    as an additional independent news source                      │
│  • Filtered by AI before sending to autotradetab                 │
│  • Admin can manage system & monitor market via channel          │
│  • System updates: highly volatile stocks, order results, etc.   │
└──────────────────────────────────────────────────────────────────┘
```

**Available commands:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Command  │  Description                                         │
├───────────┼──────────────────────────────────────────────────────┤
│  /check   │  Dashboard: Total capital / in use, open orders,     │
│           │  30-day win rate                                     │
│  /stop    │  Lock pipeline (no new orders, old orders monitored) │
│  /start   │  Unlock pipeline                                     │
│  /help    │  Order list                                          │
└───────────┴──────────────────────────────────────────────────────┘
```

---

## 🗂️ Tabs

### 📈 Vietnamese Stock Market

- Real-time quotes: VNDirect, TCBS, CafeF
- Deep financials: P/E, P/B, ROE, EPS, revenue trends, dividends (TCBS markdown reports)
- Company profiles and sector classification
- Market heatmap by sector
- Floating AI stock chat (`StockAiChat`)
- Advanced charting: KlineCharts with SAR dots, BOLL shading, custom drawing toolbar

---

### 🔴 Derivatives & Futures

- VN30F1M futures tracking
- HNX Index futures
- Automated macro news scraping
- Pre-AI mechanical signal section with confluence score system and ATR-derived SL/TP
- AI derivatives analysis with live macro data: DXY, Dow Futures, USD/VND
- Sticky chart with action panel and AI debounce logic

---

### 🎮 Paper Trading & Portfolio

- Virtual portfolio — 10,000,000,000 VND starting balance
- Order types: LO (limit), ATO, ATC
- Multi-asset: stocks, crypto, derivatives
- Real P&L calculation with commission (configurable rate)
- Performance analytics dashboard

---

### 🪙 Cryptocurrency *(Developing)*

- Real-time prices via CoinGecko and Binance
- 1,000+ cryptocurrencies tracked
- Multi-timeframe charts
- Basic AI signal analysis
- Portfolio tracking

> **Note:** The crypto module is functional but less mature than the VN stock module. Signal quality and cross-exchange integration are ongoing improvement areas

---

### 🤖 Autotrading *(Developing)*

```
         ┌────────────────────────────┐
         │  startAutoDuckScheduler()  │
         └─────────────┬──────────────┘
                       │
      ┌───────┼────────┬─────────────────┐
      │       │        │                 │
      ▼       ▼        ▼                 ▼
 CRYPTO    VN_STOCK  DERIVATIVES   Exit Monitor
 15 min     15 min      15 min       30 sec
 24/7     Trading hrs Trading hrs   SL/TP Check

                      │
                      ▼
        ┌────────────────────────────┐
        │   runAutoTradePipeline()   │
        └─────────────┬──────────────┘
                      ▼
        1. Fetch Market Context
                      ▼
        2. Build Scan Universe
                      ▼
        3. Analyze Symbols
           ├─ Fetch OHLCV
           ├─ Technical Scoring
           ├─ Fetch News relate
           ├─ AI Confirmation
           └─ Execute Trade
                      ▼
        4. Exit & Learning Pipeline
           ├─ SL / TP
           ├─ Trailing Stop
           ├─ Timeout Exit
           ├─ Reversal Detection
           ├─ Record PnL
           └─ AI Trade Learning
```
> **Note:** The automated trading system is in a state of active development, Win rate is improving through ADX Wilder smoothing, Trading History, AI lessons, VWAP accuracy, and short-term hold logic (VN stocks: cap 5 days). currently offering only a system-wide perspective and employing virtual order matching based on actual fetched trade values. There are four selectable AI order entry modes.
> *Can be turned on/off in UI.

---

## <img src="https://cdn.simpleicons.org/googlegemini" width="18"> AI System

### Multi-Provider Router

OMNI DUCK does **not** rely on a single AI provider. The `multiProviderRouter.js` assigns each analytical role to a priority chain of providers, automatically falling back with exponential backoff when rate limits or errors occur.

```
┌──────────────────────────────────────────────────────────────────┐
│           ROLE MAP  (priority order → fallback chain)            │
├─────────────┬────────────────────────────────────────────────────┤
│ main        │ Gemini Pro → Gemini Flash → Groq                   │
│ tech        │ Groq → Cerebras → SambaNova → Gemini Flash         │
│ fundamental │ Cerebras → SambaNova → Groq → Gemini Flash         │
│ news        │ SambaNova → Groq → DeepInfra → Gemini Flash        │
│ bull        │ Groq → Cerebras → OpenRouter → Gemini Flash        │
│ bear        │ Cerebras → SambaNova → Groq → Gemini Flash         │
│ pm          │ Groq → Cerebras → Gemini Flash → Gemini Pro        │
│ derivatives │ Gemini Pro → Gemini Flash → Groq                   │
│ crypto      │ Groq → Gemini Flash → Cerebras                     │
│ json        │ Gemini Flash → Groq → Cerebras                     │
│ chat        │ Groq → Gemini Flash → Cerebras                     │
└─────────────┴────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚡ Rate Limit Handling                                          │
├──────────────────────────────────────────────────────────────────┤
│  • Each provider has a cooldown tracker in memory                │
│  • On 429/503 → provider blocked with exponential backoff        │
│    (up to 5 min)                                                 │
│  • Telegram alert fires on 1st and every 10th consecutive fail   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  🔄 Gemini Dynamic Model Selection  (at startup)                │
├──────────────────────────────────────────────────────────────────┤
│  gemini-2.5-pro → gemini-2.5-flash → gemini-2.0-flash            │
│               → gemini-1.5-flash → gemini-1.5-pro                │
│                                                                  │
│  Automatic updates based on the API can be supported,            │
│  not fixed — always uses latest available model without          │
│  code changes when Google releases updates.                      │
└──────────────────────────────────────────────────────────────────┘
```

---

### 🏦 Debate Pipeline (`hedgeFundEngine.js`)

The flagship analysis feature. For any Vietnamese stock ticker, the pipeline runs a structured multi-phase investment debate using specialized AI personas.

```
┌──────────────────────────────────────────────────────────────────┐
│  Phase 1 — Independent Analysis  (Parallel)                      │
├──────────────────────────────────────────────────────────────────┤
│  [Tech Analyst]        →  15-year VN market expert               │
│  [Fundamental Analyst] →  Credit risk + institutional fund PM    │
│  [Sentiment Analyst]   →  Market psychology + macro strategy     │
└──────────────────────────┬───────────────────────────────────────┘
                           │  (all 3 complete)
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 2 — Bull vs Bear Debate                                   │
├──────────────────────────────────────────────────────────────────┤
│  [Bull Opening]        →  Max 200 words, data-backed upside case │
│  [Bear Rebuttal]       →  Direct counter to each Bull point,     │
│                           downside price levels                  │
│  [Bull Final Defense]  →  Rebuts Bear using provided data only   │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 3 — Portfolio Manager Decision                            │
├──────────────────────────────────────────────────────────────────┤
│  [Chief PM — OMNI DUCK]                                          │
│  Evaluates: Tech credibility × Fundamental credibility           │
│             × Sentiment credibility                              │
│  Identifies: What market is pricing correctly vs. incorrectly    │
│                                                                  │
│  Output: RATING                                                  │
│    MUA MẠNH / MUA / NẮM GIỮ / GIẢM / BÁN / TRÁNH                 │
│   (Strong Buying / Buying / Holding / Selling Off / Selling /    │
│    Avoiding)                                                     │
│    + Entry zone, Stop-loss, Target 1, Target 2,                  │
│      Time horizon, Conviction                                    │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Action Panel Extraction                                         │
├──────────────────────────────────────────────────────────────────┤
│  Gemini Flash extracts structured JSON from PM report:           │
│  { action, entry, stoploss, target1, target2,                    │
│    horizon, conviction, reason }                                 │
└──────────────────────────────────────────────────────────────────┘
```

Each analyst persona is prompted with strict rules: no generic commentary, cite specific data, call out contradictions, no neutral verdict when data allows a conclusion.

---

### 📊 Market Intelligence Engine (`quantEngine.js`)

```
┌──────────────────────────────────────────────────────────────────┐
│  Proprietary calculations for automatic market diagnosis         │
├──────────────────────────────────────────────────────────────────┤
│  • Market Breadth     — advancing vs. declining ratio            │
│                         (Entrade → TCBS fallback)                │
│  • Sector Power Score — dynamic thresholds per sector,           │
│    (SPS)                weighted breadth                         │
│  • Foreign flow data  — real-time from CafeF market scraper      │
│  • Verdict            — Bull / Bear / Trap detection /           │
│                         Accumulation vs. Distribution            │
│  • CLI display        — sector pulse tables, breadth bars,       │
│                         box-drawing layouts                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              FRONTEND  (React 19 + Vite 8 + Tailwind)           │
│                                                                 │
│  VnStocksTab │ DerivativesTab │ CryptoTab │ PaperTradingTab     │
│  MarketOverview │ AutoDuckTab │ StockAiChat (floating)          │
│  TradingChart (KlineCharts) │ StockChart (Lightweight Charts)   │
└────────────────────────────┬────────────────────────────────────┘
                             │  REST / SSE  (port 3001)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND  (Node.js 18+ · Express 5)                 │
│                                                                 │
│  Services                        Scrapers                       │
│  ├─ multiProviderRouter.js   ──► Groq, Cerebras, SambaNova      │
│  ├─ aiService.js             ──► Gemini Pro/Flash (dynamic)     │
│  ├─ hedgeFundEngine.js       ──► Debate pipeline                │
│  ├─ quantEngine.js           ──► Market intelligence            │
│  ├─ autoTradeEngine.js       ──► Automated signals              │
│  ├─ cryptoService.js         ──► CoinGecko / Binance            │
│  ├─ tradeContextService.js   ──► Symbol normalization, TTL      │
│  ├─ telegramService.js       ──► Alerts & gateway               │
│  └─ cacheService.js          ──► In-memory + TTL                │
│                                                                 │
│  Scrapers                                                       │
│  ├─ vnNewsSearch.js          ──► RSS + Google News + FireAnt    │
│  ├─ cafefMarketScraper.js    ──► Foreign flow, sector data      │
│  ├─ contentScraper.js        ──► Full article extraction        │
│  └─ googleNewsDecoder.js     ──► Redirect URL decoder           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌──────────┐  ┌──────────────┐  ┌───────────────────┐
   │ MongoDB  │  │ External APIs│  │ Python Service    │
   │ Atlas    │  │ VNDirect     │  │ telegram_signal   │
   │          │  │ TCBS · CafeF │  │ _gateway.py       │
   └──────────┘  │ CoinGecko    │  └───────────────────┘
                 │ Binance      │
                 │ FireAnt      │
                 └──────────────┘
```

---

## 🛠️ Technology Stack

```
┌──────────────────┬────────────────────────────────────┬───────────────────────┐
│ Layer            │ Technology                         │ Version               │
├──────────────────┼────────────────────────────────────┼───────────────────────┤
│ Frontend         │ React + Vite                       │ 19.2.5 / 8.0.10       │
│ Styling          │ Tailwind CSS                       │ 3.4.19                │
│ Charting         │ KlineCharts + Lightweight Charts   │ 9.8.5 / 4.2.1         │
│ Backend          │ Node.js + Express                  │ 18.0.0+ / 5.2.1       │
│ Database         │ MongoDB + Mongoose                 │ Atlas / 9.6.2         │
│ AI — Primary     │ Google Gemini (dynamic model)      │ gemini-2.5-pro/flash  │
│ AI — Fast        │ Groq (llama/mixtral)               │ latest                │
│ AI — Reasoning   │ Cerebras + SambaNova               │ latest                │
│ Scraping         │ Axios + Cheerio + Puppeteer        │ —                     │
│ RSS Parsing      │ fast-xml-parser + rss-parser       │ —                     │
│ Process          │ PM2 + nodemon                      │ —                     │
│ Notifications    │ Telegram Bot API                   │ —                     │
└──────────────────┴────────────────────────────────────┴───────────────────────┘
```

---

## 📦 Installation & Setup

### Prerequisites

```bash
✓ Node.js >= 18.0.0
✓ npm >= 9.0.0
✓ MongoDB (local or MongoDB Atlas)
✓ Google Gemini API Key  →  https://aistudio.google.com/app/apikey  (free)
✓ Groq API Key           →  https://console.groq.com                (free tier)
```

### Step-by-Step

```bash
# 1. Clone the repository
git clone https://github.com/bigbaboi2/VNstock-Finance-Agent.git
cd VNstock-Finance-Agent-main

# 2. Install backend dependencies
npm install

# 3. Install frontend dependencies
cd frontend && npm install && cd ..

# 4. Create .env file (see configuration section below)
cp .env.example .env
# Fill in GEMINI_API_KEY_MAIN and MONGODB_URI at minimum

# 5. Start backend (Terminal 1)
npm run dev:backend
# → Server running at http://localhost:3001

# 6. Start frontend (Terminal 2)
cd frontend && npm run dev
# → App running at http://localhost:5173
```

---

## ⚙️ Environment Configuration

All configuration is contained in **a single `.env` file in the root directory** (Vite proxies through `localhost:3001`, no separate `.env` file needed in `/frontend`).

```env
# ╔══════════════════════════════════════════════════════════════╗
# ║               OMNI DUCK — ENVIRONMENT VARIABLES              ║
# ║                    (root .env )                              ║
# ╚══════════════════════════════════════════════════════════════╝
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🎯 REQUIRED — Main AI & Database
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Gemini — main key for analysis, streaming, reporting
# Fallback chain: GEMINI_API_KEY_MAIN → GEMINI_API_KEY → API_KEY
GEMINI_API_KEY_MAIN=AIza...

# Gemini — private key for action/JSON tasks (optional, reuse main key if left blank)
GEMINI_API_KEY_ACTION=AIza...

# MongoDB (get on official website of MongoDB)
# Local: mongodb://localhost:27017/omniduck
# Atlas: mongodb+srv://user:pass@cluster.mongodb.net/xxx
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/omniduck

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🤖 AI PROVIDERS — Fallback chain
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Groq — fast inference, role: tech / bull / pm / chat / crypto
# Free tier: https://console.groq.com
GROQ_API_KEY=gsk_...

# Cerebras — strong, reasoning role: fundamental / bear
# https://cloud.cerebras.ai
CEREBRAS_API_KEY=csk-...

# SambaNova — long-context, role: news / sentiment
# https://cloud.sambanova.ai
SAMBANOVA_API_KEY=...

# DeepInfra — secondary fallback for role news
# https://deepinfra.com
DEEPINFRA_API_KEY=...

# OpenRouter — final fallback for role bull
# https://openrouter.ai
OPENROUTER_API_KEY=sk-or-...

# URL to send Referer header when calling OpenRouter (default: http://localhost:3001)
APP_URL=http://localhost:3001

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 📰 NEWS & SOCIAL DATA
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# FireAnt — Social sentiment for VN stocks
# Get your token from: https://fireant.vn (login → DevTools → cookie/header)
FIREANT_TOKEN=your_fireant_token

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🪙 CRYPTOCURRENCY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# CoinGlass — liquidation data for crypto derivatives (optional)
# https://coinglass.com/pricing
COINGLASS_API_KEY=

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🔔 TELEGRAM - Important
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Bot token (create at t.me/BotFather)

# Fallback chain: TELEGRAM_BOT_TOKEN → TELEGRAM_TOKEN
TELEGRAM_BOT_TOKEN=your_bot_token

# Chat ID to receive system alerts (AI provider downtime, rate limit, etc.)
# Fallback chain: TELEGRAM_CHAT_ID → TELEGRAM_CHANNEL_ID
TELEGRAM_CHAT_ID=your_chat_id

# Private chat ID for admin (route /api/telegram)
TELEGRAM_ADMIN_CHAT_ID=your_admin_chat_id

# Webhook base URL for Telegram bot (optional, used with ngrok)
WEBHOOK_BASE_URL=https://your-ngrok-domain.ngrok-free.app

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🔐 SECURITY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Secret for external signal webhook (POST /api/external-signal)

# Default: 'default-secret-key-please-change' — SHOULD be changed in production. production
EXTERNAL_SIGNAL_SECRET=your_strong_secret_here

# Key to call admin reset endpoint
ADMIN_RESET_KEY=your_admin_reset_key

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ⚡ PERFORMANCE (customizable, with defaults)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# TTL cache for AI report (ms). Default: 900000 (15 minutes)
AI_REPORT_CACHE_TTL_MS=900000

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🌐 FRONTEND (Vite — read via import.meta.env)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Base URL backend (Vite proxy handles /api → localhost:3001)

VITE_API_BASE_URL=http://localhost:3001

# Price fluctuation threshold to trigger AI Active (optional, default: 0.015 = 1.5%)
VITE_AI_PRICE_SIGNIFICANT_THRESHOLD=0.015

# Minimum number of news items to trigger AI automatically (optional, default: 3)
VITE_AI_NEWS_SIGNIFICANT_COUNT_THRESHOLD=3
```
Note: **Backend hardcode `PORT=3001` in `server.js`. Variables like `PORT`, `NODE_ENV`, `JWT_SECRET`, `CORS_*`, `REDIS_*`, `CACHE_*` are not read from `.env` in the current code — no need to add them.

---

## 🚀 Quick Start

```bash
# Clone & install (~5 min)
git clone https://github.com/bigbaboi2/VNstock-Finance-Agent.git
cd VNstock-Finance-Agent-main
npm install && cd frontend && npm install && cd ..

# Minimum required keys (The free version will work, but it's recommended to upgrade the API to the paid version for the best buy/sell recommendations.:
# 1. Gemini: https://aistudio.google.com/app/apikey  (free)
# 2. MongoDB: https://cloud.mongodb.com              (free tier)
# 3. Groq: https://console.groq.com                 (free tier, for fallback)
...

# Add to .env, then:
npm run dev:backend      # Terminal 1 → http://localhost:3001
cd frontend && npm run dev  # Terminal 2 → http://localhost:5173
# Run service (Terminal 3, in parallel with backend and frontend)
cd Convertpdf
python Convertpdf.py
# → FastAPI at http://localhost:8000
```

---

## 📡 API Endpoints

```
┌──────────────────────────────────────────────────────────────────┐
│  📈 Market Data                                                  │
├──────────────────────────────────────────────────────────────────┤
│  GET  /api/market/symbols    Vietnamese stock list               │
│  GET  /api/market/heatmap    Sector heatmap                      │
│  GET  /api/market/quant      Market intelligence                 │
│                              (breadth, SPS, verdict)             │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  🔬 Stock Analysis                                               │
├──────────────────────────────────────────────────────────────────┤
│  GET  /api/stock/:ticker     Stock quote + fundamentals          │
│  POST /api/ai/analyze        AI analysis (single pass,           │
│                              auto provider)                      │
│  POST /api/ai/debate         Full hedge fund debate pipeline     │
│                              (SSE stream)                        │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  📰 News                                                         │
├──────────────────────────────────────────────────────────────────┤
│  GET  /api/news/:ticker      Stock-specific news + sentiment     │
│  GET  /api/news/market       Market-wide news feed               │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  🪙 Crypto                                                       │
├──────────────────────────────────────────────────────────────────┤
│  GET  /api/crypto/symbols    Cryptocurrency list                 │
│  GET  /api/crypto/:symbol    Crypto quote + AI signal            │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  🔴 Derivatives                                                  │
├──────────────────────────────────────────────────────────────────┤
│  GET  /api/deriv/symbols     Derivatives list                    │
│  GET  /api/deriv/macro       Macro news feed                     │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  🎮 Paper Trading                                                │
├──────────────────────────────────────────────────────────────────┤
│  GET  /api/portfolio/:userId Portfolio snapshot                  │
│  POST /api/portfolio/buy     Place buy order                     │
│  POST /api/portfolio/sell    Place sell order                    │
│  GET  /api/portfolio/history Trade history                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## 💪 Strengths

```
┌──────────────────────────┬───────────────────────────────────────────────────┐
│ Area                     │ Detail                                            │
├──────────────────────────┼───────────────────────────────────────────────────┤
│  VN News Pipeline        │ Direct RSS + multi-mode Google search,            │
│                          │ URL decoding, full Vietnamese NLP sentiment       │
│                          │ scoring                                           │
├──────────────────────────┼───────────────────────────────────────────────────┤
│  Debate AI               │ Multi-phase Bull/Bear/PM pipeline with            │
│                          │ role-specific prompts,                            │
│                          │ anti-generic-commentary rules                     │
├──────────────────────────┼───────────────────────────────────────────────────┤
│  AI Resilience           │ 5+ providers, per-role priority chains,           │
│                          │ exponential backoff,                              │
│                          │ Telegram alerts on failures                       │
├──────────────────────────┼───────────────────────────────────────────────────┤
│  Quant Engine            │ Real foreign flow, dynamic SPS thresholds,        │
│                          │ multi-source breadth fallback                     │
├──────────────────────────┼───────────────────────────────────────────────────┤
│  VN Market Depth         │ 100+ ticker alias expansions,                     │
│                          │ VN-specific terminology,                          │
│                          │ local sentiment dictionary                        │
└──────────────────────────┴───────────────────────────────────────────────────┘
```

---

## 🗺️ Roadmap

```
┌──────────────────────────────────────────────────────────────────┐
│  🔴 High Priority 🔴                                            │
├──────────────────────────────────────────────────────────────────┤
│  [ ] Chart performance — reduce render latency, smoother         │
│      KlineCharts updates, fix drag/freeze edge cases             │
│  [ ] Crypto module — stronger signals, cross-exchange            │
│      arbitrage detection, on-chain data integration              │
│  [ ] UI/UX polish — loading skeleton states, mobile              │
│      responsiveness, chart toolbar improvements                  │
│  [ ] Auto-trade win rate — ADX Wilder smoothing,                 │
│      VWAP/OBV/Stochastic RSI accuracy improvements               │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  🟡 Medium Priority 🟡                                          │
├──────────────────────────────────────────────────────────────────┤
│  [ ] Redis caching layer (replace in-memory TTL maps)            │
│  [ ] Database indexing for news and trade history collections    │
│  [ ] bcrypt password hashing                                     │
│  [ ] Unit tests (Jest) for quantEngine and sentiment scoring     │
│  [ ] WebSocket for real-time price pushes (replace polling)      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  🟢 Planned 🟢                                                  │
├──────────────────────────────────────────────────────────────────┤
│  [ ] E2E tests (Playwright/Cypress)                              │
│  [ ] Docker Compose production config                            │
│  [ ] Horizontal scaling support                                  │
│  [ ] Public watchlist sharing                                    │
│  [ ] Mobile app (React Native)                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
VNstock-Finance-Agent-main/
├── src/
│   ├── server.js
│   ├── config/
│   ├── controllers/
│   ├── routes/
│   ├── middlewares/
│   ├── jobs/                        # node-cron scheduled tasks
│   ├── services/
│   │   ├── aiService.js             # Gemini wrapper + dynamic model selection
│   │   ├── multiProviderRouter.js   # Multi-provider AI routing engine
│   │   ├── hedgeFundEngine.js       # Debate pipeline (Bull/Bear/PM)
│   │   ├── quantEngine.js           # Market intelligence engine
│   │   ├── autoTradeEngine.js       # Automated trading signals
│   │   ├── cryptoService.js
│   │   ├── tradeContextService.js
│   │   ├── telegramService.js
│   │   └── cacheService.js
│   ├── scrapers/
│   │   ├── vnNewsSearch.js          # VN news (RSS + Google + FireAnt)
│   │   ├── cafefMarketScraper.js    # Foreign flow + sector data
│   │   ├── contentScraper.js        # Full article extraction
│   │   └── googleNewsDecoder.js     # Google redirect URL decoder
│   ├── fetchers/
│   └── utils/
│       └── browserManager.js
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── VnStocksTab.jsx
│       │   ├── DerivativesTab.jsx
│       │   ├── CryptoTab.jsx
│       │   ├── PaperTradingTab.jsx
│       │   ├── AutoDuckTab.jsx
│       │   ├── MarketOverview.jsx
│       │   ├── TradingChart.jsx     # KlineCharts — SAR, BOLL, drawing tools
│       │   ├── StockChart.jsx       # Lightweight Charts
│       │   ├──....
│       │   └─ StockAiChat.jsx      # Floating draggable AI chat
│       └── App.jsx
├── package.json
└── .env                             # (need to create a file like the .env.example)
```

---

### 💻 Optional CLI UI

Users can use the CLI interface, replacing the complex frontend setup. This display style is being improved and currently supports 3 tabs: Vietnamese stocks, Vietnamese derivatives, and cryptocurrencies.

It's simple to use; just open the terminal in the root directory.*
```bash
cd cli
node cli/omni-cli.js
node cli/omni-cli.js
```

---

## ⚠️ Disclaimer

> **OMNI DUCK is a research and educational platform — not financial advice.**

All market analysis, trading signals, AI-generated reports, technical scores, forecasts, and recommendations provided by this system are intended **solely for informational and learning purposes**.

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚠️  Important Notice     ⚠️                                    │
│  By using this project, you acknowledge and agree that:          │
├──────────────────────────────────────────────────────────────────┤
│  📉📉 The authors and contributors are NOT LIABLE for any       │
│     financial losses or damages resulting from use               │
│  📊📊 Market data, AI analysis, and trading signals may contain │
│     errors, delays, inaccuracies, or incomplete information      │
│  🤖🤖 AI-generated insights are probabilistic in nature and     │
│     should not be considered professional financial advice       │
│  🏦🏦 This project does NOT provide brokerage, investment       │
│     advisory, portfolio management, or asset management          │
│  ⚖️⚖️  Users are solely responsible for all trading decisions   │
└──────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────┐
│  🚨 Risk Warning  🚨                                            │
│  Trading and investing in:                                       │
│    📈 Stocks  │  📉 Derivatives & Futures  │  ₿ Cryptocurrencies│
│  involves substantial risk and may result in the loss            │
│  of part or all invested capital.                                │
├──────────────────────────────────────────────────────────────────┤
│  ▸ Past performance does not guarantee future results.           │
│  ▸ Asset values can be highly volatile and may decline to zero.  │
└──────────────────────────────────────────────────────────────────┘
```

Before making any investment decision, consider consulting a qualified and licensed financial professional.

**Use this software entirely at your own risk.**

---

<div align="center">

**OMNI DUCK** — Designed for the Vietnamese stock trading community and foreigners interested in the Vietnamese market and cryptocurrencies.

[⭐ Star on GitHub](https://github.com/bigbaboi2/VNstock-Finance-Agent) · [🐛 Report Bug](https://github.com/bigbaboi2/VNstock-Finance-Agent/issues) · [💡 Request Feature](https://github.com/bigbaboi2/VNstock-Finance-Agent/discussions)

**Version:** 0.1.0 &nbsp;|&nbsp; **Status:** 🟡 Active Development &nbsp;|&nbsp; **License:** Non-commercial use

</div>
