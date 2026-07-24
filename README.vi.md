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

[Bắt đầu nhanh](#-bắt-đầu-nhanh) · [Xem giao diện](#-xem-giao-diện) · [Các tab](#-hướng-dẫn-các-tab) · [Tính năng](#-tính-năng-chính) · [CLI](#-cli-tùy-chọn) · [Cấu hình](#%EF%B8%8F-cấu-hình-môi-trường)

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

Album ảnh — lưới bìa bên dưới; mở thư mục con để xem thêm. Thu gọn thư mục mẹ để ẩn toàn bộ.

<details open>
<summary><b>📷 Album</b> · Bìa · CK VN · Crypto · Quốc tế · Auto Duck · Themes · CLI</summary>

<br/>

<details open>
<summary><b>▸ Bìa</b> — 7 tab chính</summary>

<table>
<tr>
<td align="center" width="33%"><b>1. CK VN</b><br/><img src="docs/screenshots/vn-stock-detail.png" width="100%" alt="CK VN — chi tiết &amp; AI"/></td>
<td align="center" width="33%"><b>2. Phái sinh</b><br/><img src="docs/screenshots/deriv.png" width="100%" alt="Phái sinh"/></td>
<td align="center" width="33%"><b>3. Crypto</b><br/><img src="docs/screenshots/crypto.png" width="100%" alt="Crypto"/></td>
</tr>
<tr>
<td align="center"><b>4. Quốc tế</b><br/><img src="docs/screenshots/international.png" width="100%" alt="International terminal"/></td>
<td align="center"><b>5. Giao dịch giả lập</b><br/><img src="docs/screenshots/paper-trading.png" width="100%" alt="Paper trading"/></td>
<td align="center"><b>6. Auto Duck</b><br/><img src="docs/screenshots/autotrade-1.png" width="100%" alt="Auto Duck"/></td>
</tr>
<tr>
<td align="center"><b>7. Broker</b><br/><img src="docs/screenshots/broker.png" width="100%" alt="Broker"/></td>
<td></td>
<td></td>
</tr>
</table>

</details>

<details>
<summary><b>▸ Chứng khoán VN</b> — chi tiết · tổng quan · tin · cấu hình AI</summary>

<table>
<tr>
<td align="center"><b>Chi tiết &amp; AI</b><br/><img src="docs/screenshots/vn-stock-detail.png" width="240" alt="Chi tiết mã &amp; báo cáo AI"/></td>
<td align="center"><b>Tổng quan</b><br/><img src="docs/screenshots/vn-stock-overview.png" width="240" alt="Tổng quan thị trường"/></td>
<td align="center"><b>Tin tức</b><br/><img src="docs/screenshots/vn-stock-news.png" width="240" alt="Tin tức"/></td>
<td align="center"><b>Cấu hình AI</b><br/><img src="docs/screenshots/vn-stock-ai-config.png" width="240" alt="Cấu hình AI"/></td>
</tr>
</table>

</details>

<details>
<summary><b>▸ Crypto</b> — terminal · chiến lược AI · tin</summary>

<table>
<tr>
<td align="center"><b>Crypto terminal</b><br/><img src="docs/screenshots/crypto.png" width="240" alt="Crypto terminal"/></td>
<td align="center"><b>Radar + chart</b><br/><img src="docs/screenshots/crypto-terminal.png" width="240" alt="Market radar và chart BTC"/></td>
<td align="center"><b>Chiến lược AI</b><br/><img src="docs/screenshots/crypto-ai-strategy.png" width="240" alt="AI quantitative strategy"/></td>
<td align="center"><b>Tin thị trường</b><br/><img src="docs/screenshots/crypto-news.png" width="240" alt="Tin BTC"/></td>
</tr>
</table>

</details>

<details>
<summary><b>▸ Quốc tế</b> — watchlist theo nước · chart Yahoo · TA · tin (không AI)</summary>

<table>
<tr>
<td align="center"><b>International terminal</b><br/><img src="docs/screenshots/international.png" width="480" alt="Tab Quốc tế — GOOGL"/></td>
</tr>
</table>

</details>

<details>
<summary><b>▸ Auto Duck</b> — vốn · hiệu suất · nhật ký</summary>

<table>
<tr>
<td align="center"><b>Vốn &amp; gói lệnh</b><br/><img src="docs/screenshots/autotrade-1.png" width="240" alt="Vốn"/></td>
<td align="center"><b>Hiệu suất</b><br/><img src="docs/screenshots/autotrade-2.png" width="240" alt="Hiệu suất"/></td>
<td align="center"><b>Nhật ký tín hiệu</b><br/><img src="docs/screenshots/autotrade-3.png" width="240" alt="Nhật ký"/></td>
</tr>
</table>

</details>

<details>
<summary><b>▸ Themes</b> — Sáng/Tối × Hiện tại · Tối giản · Siêu tối giản · Sách · cỡ chữ · đồng hồ · ngôn ngữ (vi/en) · lưu theo tài khoản</summary>

<table>
<tr>
<td align="center"><b>Light</b><br/><img src="docs/screenshots/theme-light-overview.png" width="240" alt="Theme sáng"/></td>
<td align="center"><b>Chế độ sách</b><br/><img src="docs/screenshots/theme-book-overview.png" width="240" alt="Chế độ sách"/></td>
<td align="center"><b>Sách · chart</b><br/><img src="docs/screenshots/theme-book-chart.png" width="240" alt="Chart chế độ sách"/></td>
<td align="center"><b>Sách · AutoDuck</b><br/><img src="docs/screenshots/theme-book-autoduck.png" width="240" alt="AutoDuck chế độ sách"/></td>
</tr>
<tr>
<td align="center" colspan="2"><b>Cài đặt phong cách</b><br/><img src="docs/screenshots/theme-style-settings.png" width="220" alt="Cài đặt phong cách"/></td>
<td align="center" colspan="2"><b>Menu phong cách</b><br/><img src="docs/screenshots/theme-style-menu.png" width="220" alt="Menu desktop"/></td>
</tr>
</table>

</details>

<details>
<summary><b>▸ CLI Terminal</b> — TUI (`node cli/omni-cli.js`) · equity · crypto · market radar</summary>

<table>
<tr>
<td align="center"><b>Equity workspace</b><br/><img src="docs/screenshots/cli-equity-workspace.png" width="240" alt="CLI equity"/></td>
<td align="center"><b>Equity detail</b><br/><img src="docs/screenshots/cli-equity-detail.png" width="240" alt="CLI detail"/></td>
<td align="center"><b>Equity chart</b><br/><img src="docs/screenshots/cli-equity-chart.png" width="240" alt="CLI chart"/></td>
</tr>
<tr>
<td align="center"><b>Crypto chart</b><br/><img src="docs/screenshots/cli-crypto-chart.png" width="240" alt="CLI crypto"/></td>
<td align="center"><b>Crypto news</b><br/><img src="docs/screenshots/cli-crypto-news.png" width="240" alt="CLI news"/></td>
<td align="center"><b>Market Radar</b><br/><img src="docs/screenshots/cli-market-radar.png" width="240" alt="CLI radar"/></td>
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
| 🪙 Crypto | ✅ Hoạt động | Fear & Greed, dominance, funding, liquidations, volume profile, AI signal + tin coin |
| 🌍 Quốc tế | ✅ Hoạt động | Tab 4 — watchlist theo nước (Mỹ/Nhật/Hàn/TQ–HK/Âu), Yahoo OHLC, điểm TA, tin sentiment (Google/Reddit/X); đề xuất Tech 70% + Tin 30% (**không AI**) |
| 🎮 Giao dịch giả lập | ✅ Hoạt động | 10 tỷ VND ảo, lệnh LO/ATO/ATC, P&L |
| 🔌 Broker / LIVE | ✅ Hoạt động | Binance, OKX, Bybit (crypto) + DNSE (CK VN) — testnet & live |
| 📄 Hệ thống PDF Docling | ✅ Hoạt động | Hugging Face Spaces (Gradio + `@spaces.GPU`), chuyển đổi PDF báo cáo TCBS sang Markdown (`Convertpdf/`) |
| 🔄 AutoTrading | ⚠️ Đang cải thiện | Tỷ lệ thắng, AI lessons, mô phỏng + LIVE |
| 🎨 Theme UI + i18n | ✅ Hoạt động | Sáng/Tối × Hiện tại/Tối giản/Siêu tối giản/Sách, cỡ chữ, đồng hồ, **vi/en** — đồng bộ `/api/auth/preferences` |

**Đăng nhập:** Đăng ký / đăng nhập theo user (MongoDB). Danh mục và preference UI gắn tài khoản. Mật khẩu đang lưu **plaintext** (tiện self-host — chưa cứng production; bcrypt nằm trên roadmap). API key sàn mã hóa AES-256-GCM bằng `ENCRYPTION_KEY`.

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

Menu người dùng có **7 tab** (deep link: `/vn-stocks`, `/vn-derivatives`, `/crypto`, `/international`, `/paper-trading`, `/auto-duck`, `/broker`). Ảnh xem ở [Xem giao diện](#-xem-giao-diện).

| # | Tab | Nội dung |
|---|-----|----------|
| 1 | **Chứng khoán VN** | Giá realtime (VNDirect, TCBS, CafeF), heatmap ngành, AI market intel, tranh luận, biểu đồ, chat AI nổi |
| 2 | **Phái sinh VN** | VN30F1M / HNX, tin vĩ mô, tín hiệu cơ học + AI (DXY, Dow, USD/VND) |
| 3 | **Crypto** | Market radar (Fear & Greed, dominance, funding, liquidations, top movers), nến đa khung + volume profile, chiến lược AI (RSI/MACD/CVD/ATR/VWAP → entry/SL/TP), tin coin có tag sentiment |
| 4 | **Quốc tế** | **Đã mở** (`/international`). Watchlist Mỹ / Nhật / Hàn / TQ–HK / Âu; Yahoo OHLC + chart đa khung; điểm TA; tin sentiment Google / Reddit / X; đề xuất **Tech 70% + Tin 30%** — **không LLM** |
| 5 | **Giao dịch giả lập** | 10 tỷ VND ảo; thị trường: CK VN · phái sinh · crypto · **global**; LO/ATO/ATC; P&L đa tài sản |
| 6 | **Tự động vào lệnh AI** | Scheduler (crypto 24/7, VN ~15 phút), risk 1–4, mô phỏng vs LIVE, AI lessons, audit/funnel log |
| 7 | **Kết nối sàn / Broker** | API sàn (Binance/OKX/Bybit crypto + DNSE CK VN), vị thế LIVE, lịch sử lệnh, cảnh báo quyền API |

**Pipeline Auto Duck (rút gọn):**

```
startAutoDuckScheduler() → runAutoTradePipeline()
  → Lấy context → Quét universe → Phân tích (OHLCV + kỹ thuật + tin + AI) → Vào/Thoát lệnh
```

Lệnh mô phỏng chạy nền để AI học; lệnh thật trên sàn hiển thị ở tab **Broker** khi bật LIVE và có kết nối TRADE active.

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

Kênh ops tùy chọn khi có `TELEGRAM_BOT_TOKEN`. Tin nhóm/kênh có thể nuôi Auto Duck (lọc AI). Cảnh báo admin: provider lỗi, biến động, kết quả lệnh.

| Nhóm | Lệnh |
|------|------|
| Tra cứu | `/market` · `/info <mã>` · `/insight` |
| Giám sát GD | `/check` · `/live` · `/sim` · `/pnl` · `/portfolio` · `/stats` · `/funnel` |
| Lệnh manual LIVE | `/trade` · `/close` · `/manual` |
| Hệ thống | `/health` · `/settings` · `/broker` · `/ai` · `/stop` · `/start` · `/help` |

Alias: `/mkt` → `/market`, `/i` → `/info`. Đầy đủ: `/help`.

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
│  FRONTEND  React 19 + Vite + Tailwind + i18n (vi/en)            │
│  VnStocks · Derivatives · Crypto · International · Paper        │
│  AutoDuck · Broker · StockAiChat · Charts · Style prefs         │
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
                             VNDirect, TCBS, Yahoo, Binance, DNSE…
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
| Dữ liệu thị trường | `FIREANT_TOKEN`, `COINGECKO_API_KEY`, `COINGLASS_API_KEY` | Tùy chọn |
| Telegram / tunnel | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_*_CHAT_ID`, `WEBHOOK_BASE_URL`, `FRONTEND_URL`, `NGROK_DOMAIN` | Tùy chọn |
| Prefetch tin VN | `VN_NEWS_PREFETCH_ENABLED` (+ TTL / universe) | Tùy chọn (cron làm nóng AutoDuck + tab CK) |
| Bảo mật | `EXTERNAL_SIGNAL_SECRET`, `ADMIN_RESET_KEY`, `ADMIN_CODE`, `ENCRYPTION_KEY` | Production |
| Frontend (Vite) | `VITE_API_BASE_URL`, `VITE_AI_PRICE_SIGNIFICANT_THRESHOLD` | Tùy chọn (tunnel / remote) |
| AutoTrade | UI: Auto Duck → Cấu hình AutoTrade (MongoDB `Setting`) | Admin |

> Backend hardcode `PORT=3001` trong `server.js`. Các biến như `PORT`, `JWT_SECRET`, `REDIS_*` **không** được đọc từ `.env` hiện tại. Key AI để trống sẽ bị router bỏ qua.

---

## 📡 API Endpoints

<details>
<summary><b>Bấm để xem danh sách endpoint</b></summary>

**Auth**
- `POST /api/auth/register` · `POST /api/auth/login`
- `GET /api/auth/preferences` · `POST /api/auth/preferences`

**Thị trường**
- `GET /api/market/symbols` · `GET /api/market/info/:ticker` · `GET /api/market/heatmap` · `GET /api/market/radar`
- `GET /api/market/home-news` · `GET /api/market/tcbs-pdf/:ticker`
- `GET /api/market-insight/today` · `GET /api/market-insight/history` · `POST /api/market-insight/scan`

**Cổ phiếu & AI**
- `POST /api/ai/analyze/:ticker` · `POST /api/ai/analyze/:ticker/stream` (SSE)
- `GET /api/ai/analyze/latest/:symbol` · `GET /api/ai/news/:ticker` · `GET /api/ai/ai-news/:ticker`
- `POST /api/ai/stock-chat/:ticker` · `POST /api/ai/action-panel/:ticker`
- `POST /api/ai/analyze-derivatives` · `GET /api/ai/provider-status`

**History**
- `GET /api/history/:ticker` · `GET /api/history/crypto/:symbol`

**Phái sinh**
- `GET /api/derivatives/radar` · `GET /api/derivatives/news` · `POST /api/derivatives/news/refresh`

**Crypto**
- `GET /api/crypto/symbols` · `GET /api/crypto/price/:symbol` · `GET /api/crypto/radar`
- `GET /api/crypto/funding` · `GET /api/crypto/liquidations` · `GET /api/crypto/top-movers`
- `GET /api/crypto/news/:symbol` · `GET /api/crypto/history/:symbol` · `POST /api/crypto/signal`

**Quốc tế (Tab 4)**
- `GET /api/international/markets` · `GET /api/international/search` · `GET /api/international/quotes`
- `GET /api/international/history/*symbol` · `GET /api/international/news/*symbol`
- `GET /api/international/proposal/*symbol`

**Giao dịch giả lập**
- `GET /api/portfolio/:username` · `POST /api/portfolio/trade` · `POST /api/portfolio/cancel-order`

**Auto Duck**
- `GET|POST /api/auto-trade/settings` · `GET|POST /api/auto-trade/env-config`
- `GET /api/auto-trade/user-order/:username` · `POST /api/auto-trade/user-order`
- `GET /api/auto-trade/ai-lessons` · `GET /api/auto-trade/pipeline-logs` · `GET /api/auto-trade/funnel-logs`
- `GET /api/auto-trade/analytics` · `POST /api/auto-trade/force-trigger` · `POST /api/auto-trade/export-live-stats`

**Broker / sàn**
- `GET /api/exchange-connections/:username` · `POST /api/exchange-connections`
- `POST /api/exchange-connections/:id/test` · `GET /api/exchange-connections/:id/balance`
- `GET /api/exchange-connections/orders/:username`

**Telegram**
- `POST /api/telegram/webhook` · `GET /api/telegram/set-webhook` · `GET /api/telegram/webhook-info`

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

TUI full-screen trên cùng API (equity · market radar · crypto · phái sinh). Ảnh: **[Xem giao diện → CLI Terminal](#-xem-giao-diện)**.

```bash
# Backend phải chạy ở :3001
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
- [x] Tab thị trường quốc tế (đã mở — TA + tin sentiment; không AI)

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
