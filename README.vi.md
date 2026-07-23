<div align="center">

<img src="https://raw.githubusercontent.com/bigbaboi2/VNstock-Finance-Agent/main/frontend/public/favicon.svg" alt="OMNI DUCK" width="280" />

# OMNI DUCK - Vnstock Finance Agent
### Terminal Tài chính Định lượng — Thị trường Việt Nam & Toàn cầu

[![Node.js](https://img.shields.io/badge/Node.js-22.15%2B-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb)](https://mongodb.com)
[![Gemini](https://img.shields.io/badge/AI-Multi--Provider-4285F4?style=flat-square&logo=google)](https://aistudio.google.com)
[![Status](https://img.shields.io/badge/Status-Đang%20phát%20triển-brightgreen?style=flat-square)]()

**Nền tảng phân tích & giao dịch AI cho chứng khoán VN, phái sinh & tiền mã hóa**

🇬🇧 [English version](README.md)

[Bắt đầu nhanh](#-bắt-đầu-nhanh) · [Xem giao diện](#-xem-giao-diện) · [Các tab](#-hướng-dẫn-các-tab) · [Tính năng](#-tính-năng-chính) · [Hệ thống AI](#-hệ-thống-ai) · [Cấu hình](#%EF%B8%8F-cấu-hình-môi-trường)

</div>

---

## 📋 Mục lục

1. [Xem giao diện](#-xem-giao-diện)
2. [Tổng quan](#-tổng-quan)
3. [Bắt đầu nhanh](#-bắt-đầu-nhanh)
4. [Hướng dẫn các tab](#-hướng-dẫn-các-tab)
5. [Tính năng chính](#-tính-năng-chính)
6. [Hệ thống AI](#-hệ-thống-ai)
7. [Kiến trúc](#%EF%B8%8F-kiến-trúc-hệ-thống)
8. [Cấu hình môi trường](#%EF%B8%8F-cấu-hình-môi-trường)
9. [API Endpoints](#-api-endpoints)
10. [Cấu trúc dự án](#-cấu-trúc-dự-án)
11. [CLI tùy chọn](#-cli-tùy-chọn)
12. [Lộ trình](#%EF%B8%8F-lộ-trình-phát-triển)
13. [Miễn trừ trách nhiệm](#%EF%B8%8F-miễn-trừ-trách-nhiệm)

---

## 📸 Xem giao diện

<details open>
<summary><b>Ảnh chụp màn hình</b> — 6 tab chính (bấm để thu gọn)</summary>

<table>
<tr>
<td align="center"><b>1. Chứng khoán VN</b><br/><img src="docs/screenshots/vn-stock-overview.png" width="240" alt="Tổng quan CK VN"/></td>
<td align="center"><b>2. Phái sinh</b><br/><img src="docs/screenshots/deriv.png" width="240" alt="Tab phái sinh"/></td>
<td align="center"><b>3. Crypto</b><br/><img src="docs/screenshots/crypto.png" width="240" alt="Tab crypto"/></td>
</tr>
<tr>
<td align="center"><b>5. Giao dịch giả lập</b><br/><img src="docs/screenshots/paper-trading.png" width="240" alt="Tab giao dịch giả lập"/></td>
<td align="center"><b>6. Tự động vào lệnh AI</b><br/><img src="docs/screenshots/autotrade-1.png" width="240" alt="Auto Duck tổng quan"/></td>
<td align="center"><b>7. Kết nối sàn / Broker</b><br/><img src="docs/screenshots/broker.png" width="240" alt="Tab broker"/></td>
</tr>
</table>

<details>
<summary><b>Chứng khoán VN</b> — 3 góc nhìn (tổng quan · tin tức · cấu hình AI)</summary>

<table>
<tr>
<td align="center"><b>Tổng quan thị trường</b><br/><img src="docs/screenshots/vn-stock-overview.png" width="240" alt="Tổng quan"/></td>
<td align="center"><b>Live News Stream</b><br/><img src="docs/screenshots/vn-stock-news.png" width="240" alt="Tin tức trực tiếp"/></td>
<td align="center"><b>Phân tích AI & PDF</b><br/><img src="docs/screenshots/vn-stock-ai-config.png" width="240" alt="Cấu hình AI"/></td>
</tr>
</table>

</details>

<details>
<summary><b>Tự động vào lệnh AI (Auto Duck)</b> — 3 góc nhìn (vốn · hiệu suất · nhật ký tín hiệu)</summary>

<table>
<tr>
<td align="center"><b>Quản lý vốn & gói lệnh</b><br/><img src="docs/screenshots/autotrade-1.png" width="240" alt="Quản lý vốn"/></td>
<td align="center"><b>Hiệu suất hệ thống</b><br/><img src="docs/screenshots/autotrade-2.png" width="240" alt="Hiệu suất"/></td>
<td align="center"><b>Nhật ký tín hiệu & AI Lessons</b><br/><img src="docs/screenshots/autotrade-3.png" width="240" alt="Nhật ký tín hiệu"/></td>
</tr>
</table>

</details>

</details>

---

## 🎯 Tổng quan

**OMNI DUCK** là terminal tài chính định lượng full-stack, tích hợp AI, xây dựng cho thị trường Việt Nam kèm phủ sóng crypto và phái sinh toàn cầu. Hệ thống kết hợp cào dữ liệu thời gian thực từ 10+ nguồn tài chính VN, engine định tuyến AI đa nhà cung cấp, pipeline tranh luận đa giai đoạn, giao dịch tự động với chỉ báo kỹ thuật, và dashboard React — tất cả self-hosted.

*Hệ thống cá nhân hóa phục vụ nhu cầu đầu tư trực tiếp; mọi góp ý và đóng góp đều được hoan nghênh.*

| Module | Trạng thái | Ghi chú |
|--------|------------|---------|
| 📰 Cào tin VN | ✅ Mạnh | 5 RSS trực tiếp + Google News, NLP sentiment tiếng Việt |
| 📈 Phân tích CK VN | ✅ Mạnh | VNDirect, TCBS, CafeF, VNstock-py, FireAnt |
| 🤖 Pipeline tranh luận AI | ✅ Mạnh | Bull/Bear/PM đa giai đoạn |
| 🔴 Phái sinh | ✅ Hoạt động | VN30F1M, tin vĩ mô, phân tích AI |
| 🎮 Giao dịch giả lập | ✅ Hoạt động | 10 tỷ VND ảo, lệnh LO/ATO/ATC, P&L |
| 🔌 Broker / LIVE | ✅ Hoạt động | Binance, OKX, Bybit (crypto) + DNSE (CK VN) — testnet & live |
| 🪙 Crypto | ⚠️ Đang phát triển | CoinGecko/Binance, tín hiệu còn hạn chế |
| 📊 Biểu đồ | ⚠️ Đang phát triển | KlineCharts + Lightweight Charts |
| 🔄 AutoTrading | ⚠️ Đang cải thiện | Tỷ lệ thắng, AI lessons, mô phỏng + LIVE |

**Đăng nhập:** Đăng ký / đăng nhập theo user (MongoDB). Cài đặt và danh mục gắn với tài khoản đang đăng nhập.

---

## 🚀 Bắt đầu nhanh

### Yêu cầu

| Thành phần | Ghi chú |
|------------|---------|
| Node.js ≥ 22.15, npm ≥ 9 | Backend dùng `--use-system-ca` (cần Node ≥ 22.15) |
| MongoDB | Local hoặc [Atlas](https://cloud.mongodb.com) — **bắt buộc để khởi động** |
| Python 3.10+ | Tuỳ chọn — chỉ khi parse PDF TCBS (`Convertpdf/`) |
| Gemini API key | [aistudio.google.com](https://aistudio.google.com/app/apikey) — khuyến nghị cho AI |
| Groq API key | [console.groq.com](https://console.groq.com) — fallback khuyến nghị |

### Cài đặt & chạy

```bash
# 1. Clone & cài dependency
git clone https://github.com/bigbaboi2/VNstock-Finance-Agent.git
cd VNstock-Finance-Agent
npm install
cd frontend && npm install --legacy-peer-deps && cd ..

# 2. Môi trường — copy template và đặt MongoDB
cp .env.example .env
# Bắt buộc để boot: MONGODB_URI  (vd. mongodb://127.0.0.1:27017/omniduck)
# Khuyến nghị cho AI: GEMINI_API_KEY_MAIN, GROQ_API_KEY
# Không có key AI thì server vẫn chạy; chỉ tính năng phân tích bị hạn chế.

# Terminal 1 — Backend (cổng 3001)
npm run dev:backend

# Terminal 2 — Frontend (cổng 5173)
cd frontend && npm run dev

# Tuỳ chọn — Parse PDF (cổng 8000, chỉ khi phân tích BCTC TCBS)
cd Convertpdf && python Convertpdf.py
```

Mở **http://localhost:5173** → đăng ký tài khoản → chọn tab từ menu (góc phải trên).

> Frontend bắt buộc `npm install --legacy-peer-deps` (recharts peer vs React 19). API trả phí không bắt buộc nhưng giúp giảm rate limit khi dùng nhiều.

---

## 🗂️ Hướng dẫn các tab

Menu người dùng có **7 tab** (tab 4 đang tắt — sắp ra mắt).

| # | Tab | Nội dung | Ảnh |
|---|-----|----------|-----|
| 1 | **Chứng khoán VN** | Giá realtime, heatmap ngành, AI market intel, tranh luận, biểu đồ, chat AI nổi | [tổng quan](docs/screenshots/vn-stock-overview.png) · [tin](docs/screenshots/vn-stock-news.png) · [cấu hình](docs/screenshots/vn-stock-ai-config.png) |
| 2 | **Phái sinh VN** | VN30F1M / HNX, tin vĩ mô, tín hiệu cơ học + AI (DXY, Dow, USD/VND) | [phái sinh](docs/screenshots/deriv.png) |
| 3 | **Crypto** | Giá CoinGecko/Binance, funding, fear & greed, biểu đồ đa khung, AI signal | [crypto](docs/screenshots/crypto.png) |
| 4 | **Quốc tế** | *Sắp ra mắt* — đang disabled trên UI | — |
| 5 | **Giao dịch giả lập** | Danh mục ảo 10 tỷ VND, LO/ATO/ATC, P&L đa tài sản | [paper-trading](docs/screenshots/paper-trading.png) |
| 6 | **Tự động vào lệnh AI** | Scheduler (crypto 24/7, VN 15 phút), risk 1–4, mô phỏng vs LIVE, AI lessons | [1](docs/screenshots/autotrade-1.png) · [2](docs/screenshots/autotrade-2.png) · [3](docs/screenshots/autotrade-3.png) |
| 7 | **Kết nối sàn / Broker** | API sàn (Binance/OKX/Bybit crypto + DNSE CK VN), vị thế LIVE, lịch sử lệnh, cảnh báo quyền API | [broker](docs/screenshots/broker.png) |

**Pipeline Auto Duck (rút gọn):**

```
startAutoDuckScheduler() → runAutoTradePipeline()
  → Lấy context → Quét universe → Phân tích (OHLCV + kỹ thuật + tin + AI) → Vào/Thoát lệnh
```

Lệnh mô phỏng chạy nền để AI học; lệnh thật trên sàn hiển thị ở tab **Broker** khi bật chế độ LIVE và có kết nối TRADE active.

---

## ✨ Tính năng chính

### 📰 Tình báo tin tức Việt Nam *(module mạnh nhất)*

**RSS trực tiếp (luôn bật):** VietStock, CafeF, VnEconomy, BaoDauTu, TinNhanhChungKhoan.

**Chế độ tin trên UI** (chọn trong tab CK VN):

| Chế độ | Key | Tốc độ | Đánh đổi |
|--------|-----|--------|----------|
| NHANH | `fast` | Cao nhất | Ít nguồn, ưu tiên cache |
| CÂN BẰNG | `balanced` | Cân bằng | Google + RSS + trang tìm kiếm (mặc định) |
| CHUYÊN SÂU | `deep` | Chậm hơn | Chỉ nguồn chính thống |
| ULTRA | `ultra` | Chậm nhất | Mọi nguồn kể cả tin đồn — nhiễu cao hơn |

**Chiến lược truy vấn Google (backend, theo mã):**

| Mode | Cửa sổ | Mục đích |
|------|--------|----------|
| `official` | 90 ngày | Công bố, BCTC |
| `balanced` | 60 ngày | Tin thị trường chung |
| `negative` | 30 ngày | Bán tháo, vi phạm |
| `rumor` | 21 ngày | Khối lượng bất thường |

**Khác:** Sentiment từ điển từ khóa tiếng Việt, 100+ alias mã CK, FireAnt social (cần `FIREANT_TOKEN`).

---

### 📄 Hệ thống PDF Docling

BCTC TCBS: `https://static.tcbs.com.vn/oneclick/{TICKER}.pdf` → Python FastAPI `:8000/parse-pdf` → Markdown → analyst cơ bản.

| Mode | OCR | ML | Thời gian | Dùng khi |
|------|-----|----|-----------|----------|
| **turbo** (mặc định) | ❌ | ❌ | ~3–8s | PDF text (99% báo cáo) |
| **fast** | ❌ | ✅ | ~20–40s | Cần trích bảng |
| **balanced** | ❌ | ✅ | ~60–90s | Bảng tài chính phức tạp |
| **full** | ✅ | ✅ | ~150–200s | PDF scan / ảnh |

---

### ✈️ Telegram

- Nguồn tin nhóm/kênh bổ sung; lọc AI trước khi vào Auto Duck
- Cảnh báo admin: provider lỗi, mã biến động mạnh, kết quả lệnh

| Lệnh | Mô tả |
|------|-------|
| `/check` | Vốn, lệnh mở, tỷ lệ thắng 30 ngày |
| `/stop` | Khóa pipeline (theo dõi lệnh cũ) |
| `/start` | Mở khóa pipeline |
| `/help` | Danh sách lệnh |

---

## 🤖 Hệ thống AI

### Định tuyến đa nhà cung cấp

`multiProviderRouter.js` gán mỗi vai trò một chuỗi ưu tiên, backoff khi 429/503. Cảnh báo Telegram khi lỗi liên tiếp.

| Vai trò | Chuỗi ưu tiên |
|---------|---------------|
| main | Gemini Pro → Gemini Flash → Groq → Cerebras |
| tech | Groq → Cerebras → SambaNova → Gemini Flash |
| fundamental | Cerebras → SambaNova → Groq → Gemini Flash |
| news | SambaNova → Groq → DeepInfra → Gemini Flash |
| bull | Groq → Cerebras → OpenRouter → Gemini Flash |
| bear | SambaNova → Groq → Gemini Flash |
| pm | Groq → Cerebras → Gemini Flash → Gemini Pro |
| derivatives | Gemini Pro → Gemini Flash → Groq |
| crypto / chat | Groq → Gemini Flash → Cerebras |
| json / action | Gemini Flash → Groq → Cerebras |

Gemini quét model động khi chạy (ưu tiên bản mới + Pro). Fallback offline: `2.5-flash` → `2.5-flash-lite` → `2.5-pro` → `1.5-pro`.

---

### 🏦 Pipeline tranh luận (`hedgeFundEngine.js`)

Với mỗi mã VN, tranh luận đầu tư có cấu trúc:

1. **Giai đoạn 1 — Phân tích độc lập (song song):** Kỹ thuật · Cơ bản (có PDF) · Sentiment
2. **Giai đoạn 2 — Bull vs Bear:** Mở đầu → Phản biện → Bảo vệ cuối
3. **Giai đoạn 3 — PM:** Xếp hạng `MUA MẠNH / MUA / NẮM GIỮ / GIẢM / BÁN / TRÁNH` + entry, SL, target, horizon
4. **Action panel:** Gemini Flash trích JSON cho panel giao dịch UI

---

### 📊 Market Intelligence (`quantEngine.js`)

- Độ rộng thị trường (Entrade → TCBS fallback)
- Sector Power Score (SPS)
- Dòng tiền nước ngoài từ CafeF
- Verdict: Bull / Bear / Trap / Tích lũy vs Phân phối

---

## 🏗️ Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND  React 19 + Vite + Tailwind                           │
│  VnStocksTab │ DerivativesTab │ CryptoTab │ PaperTradingTab       │
│  AutoDuckTab │ BrokerConnectionTab │ StockAiChat │ Charts         │
└────────────────────────────┬────────────────────────────────────┘
                             │  REST / SSE  (cổng 3001)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND  Node.js 22.15+ · Express 5                            │
│  multiProviderRouter │ hedgeFundEngine │ quantEngine            │
│  autoTradeEngine │ exchangeBrokerService │ telegramService      │
└──────────────┬──────────────────────┬───────────────────────────┘
               ▼                      ▼
          MongoDB Atlas          API bên ngoài + Python :8000
```

| Tầng | Công nghệ |
|------|-----------|
| Frontend | React 19, Vite 8, Tailwind 3, KlineCharts, Lightweight Charts |
| Backend | Node 22.15+, Express 5, Mongoose 9 |
| AI | Gemini, Groq, Cerebras, SambaNova, DeepInfra, OpenRouter |
| Vận hành | PM2 / nodemon, Telegram Bot API |

---

## ⚙️ Cấu hình môi trường

Toàn bộ cấu hình trong **một file `.env` ở thư mục gốc** (Vite proxy `/api` → `localhost:3001`).

**Template:** [`.env.example`](.env.example) (tiếng Việt) · [`.env.example.en`](.env.example.en) (English)

| Nhóm | Biến chính | Bắt buộc |
|------|-----------|----------|
| Cốt lõi | `MONGODB_URI` | ✅ (boot) |
| AI | `GEMINI_API_KEY_MAIN` (+ tùy chọn `_ACTION` / `_INSIGHT`) | Khuyến nghị |
| AI dự phòng | `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `SAMBANOVA_API_KEY`, `DEEPINFRA_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY` | Khuyến nghị |
| Dữ liệu thị trường | `FIREANT_TOKEN`, `COINGLASS_API_KEY` | Tùy chọn |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`… | Tùy chọn |
| Bảo mật | `EXTERNAL_SIGNAL_SECRET`, `ADMIN_RESET_KEY`, `ENCRYPTION_KEY` | Production |
| Frontend | `VITE_API_BASE_URL`, `VITE_AI_PRICE_SIGNIFICANT_THRESHOLD` | Tùy chọn |

> Backend hardcode `PORT=3001` trong `server.js`. Các biến như `PORT`, `JWT_SECRET`, `REDIS_*` **không** được đọc từ `.env` hiện tại. Key AI để trống sẽ bị router bỏ qua.

---

## 📡 API Endpoints

<details>
<summary><b>Bấm để xem danh sách endpoint</b></summary>

**Auth**
- `POST /api/auth/register` · `POST /api/auth/login`

**Thị trường**
- `GET /api/market/symbols` · `GET /api/market/heatmap` · `GET /api/market/radar`
- `GET /api/market-insight/today` · `GET /api/market-insight/history`

**Cổ phiếu & AI**
- `GET /api/market/info/:ticker`
- `POST /api/ai/analyze/:ticker` · `POST /api/ai/analyze/:ticker/stream` (SSE)
- `GET /api/ai/news/:ticker` · `POST /api/ai/stock-chat/:ticker`
- `POST /api/ai/analyze-derivatives` · `POST /api/ai/action-panel/:ticker`

**Phái sinh**
- `GET /api/derivatives/radar` · `GET /api/derivatives/news`

**Crypto**
- `GET /api/crypto/symbols` · `GET /api/crypto/price/:symbol` · `GET /api/crypto/radar`
- `GET /api/crypto/funding` · `POST /api/crypto/signal`

**Giao dịch giả lập**
- `GET /api/portfolio/:username` · `POST /api/portfolio/trade`

**Auto Duck**
- `GET /api/auto-trade/settings` · `POST /api/auto-trade/settings`
- `GET /api/auto-trade/user-order/:username` · `GET /api/auto-trade/ai-lessons`
- `POST /api/auto-trade/force-trigger`

**Broker / sàn**
- `GET /api/exchange-connections/:username` · `POST /api/exchange-connections`
- `POST /api/exchange-connections/:id/test` · `GET /api/exchange-connections/orders/:username`

**Telegram**
- `POST /api/telegram/webhook` · `GET /api/telegram/set-webhook`

</details>

---

## 📁 Cấu trúc dự án

```
ProjectFinance/
├── src/                      # Backend Express
├── models/                   # Mongoose schemas
├── frontend/src/components/  # Các tab UI
├── cli/                      # Giao diện terminal (omni-cli.js)
├── Convertpdf/               # Tuỳ chọn — Python parse PDF (:8000)
├── docs/screenshots/         # Ảnh README
├── .env.example
└── omni-manager.bat
```

> Thư mục `scripts/` (diag / test local) bị gitignore, không đi kèm khi clone repo.

---

## 💻 CLI tùy chọn

Giao diện terminal thay cho React — CK VN, phái sinh, crypto.

```bash
# Từ thư mục gốc dự án
node cli/omni-cli.js

# Windows: double-click omni-manager.bat
```

---

## 🗺️ Lộ trình phát triển

**Ưu tiên cao**
- [ ] Hiệu năng biểu đồ KlineCharts
- [ ] Crypto — tín hiệu mạnh hơn, dữ liệu đa sàn
- [ ] UI/UX — mobile, skeleton loading
- [ ] Tỷ lệ thắng Auto-trade — ADX, VWAP, OBV
- [ ] Tab thị trường quốc tế (đang tắt trên UI)

**Trung bình:** Redis cache · index DB · bcrypt · Jest · WebSocket giá

**Dài hạn:** E2E test · Docker Compose · watchlist công khai · app mobile

---

## ⚠️ Miễn trừ trách nhiệm

> **OMNI DUCK là nền tảng nghiên cứu và giáo dục — không phải tư vấn đầu tư.**

Mọi phân tích, tín hiệu, báo cáo AI chỉ nhằm mục đích **tham khảo và học tập**. Tác giả **không chịu trách nhiệm** về thiệt hại tài chính. Dữ liệu và AI có thể sai lệch hoặc trễ. Người dùng tự chịu trách nhiệm mọi quyết định giao dịch.

Đầu tư chứng khoán, phái sinh và crypto có rủi ro cao. Kết quả quá khứ không đảm bảo tương lai.

**Sử dụng phần mềm hoàn toàn do bạn tự chịu rủi ro.** Hãy tham khảo chuyên gia tài chính có giấy phép trước khi đầu tư.

---

<div align="center">

**OMNI DUCK** — Dành cho cộng đồng đầu tư Việt Nam và người theo dõi thị trường toàn cầu.

[⭐ Star trên GitHub](https://github.com/bigbaboi2/VNstock-Finance-Agent) · [🐛 Báo lỗi](https://github.com/bigbaboi2/VNstock-Finance-Agent/issues) · [💡 Đề xuất tính năng](https://github.com/bigbaboi2/VNstock-Finance-Agent/discussions)

**Phiên bản:** 1.0.0 · **Trạng thái:** Đang phát triển · **Giấy phép:** Phi thương mại

</div>
