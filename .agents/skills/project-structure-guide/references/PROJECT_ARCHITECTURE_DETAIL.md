# BẢN ĐỒ CHI TIẾT KIẾN TRÚC VÀ LOGIC HỆ THỐNG PROJECTFINANCE

Tài liệu này cung cấp cái nhìn chuyên sâu (deep-dive) vào logic thực thi, nhiệm vụ, và kết quả đầu ra của từng nhóm file quan trọng nhất trong dự án. Tài liệu này dành cho AI Agent hoặc lập trình viên cần hiểu rõ nghiệp vụ trước khi sửa code.

> Gợi ý đọc nhanh trước khi vào deep-dive:
> - `../QUICK_MAP.md` (tóm tắt đường đi ngắn nhất)
> - `../SKILL.md` (quy tắc đọc tiết kiệm token)

---

## 1. Tầng Dịch vụ Lõi (Core Services) - `/src/services/`

Đây là "bộ não" của toàn bộ hệ thống, xử lý thuật toán giao dịch và giao tiếp AI.

### `aiService.js`
- **Nhiệm vụ**: Quản lý giao tiếp với Google Gemini AI (cả Pro và Flash) với cơ chế tự động chuyển đổi model (Auto-Switch) khi bị giới hạn rate-limit (Lỗi 429).
- **Logic Thực thi**: 
  1. Gửi file BCTC (PDF) lên trạm AI Docling (hoặc fallback sang Gemini Vision) để bóc tách bảng số liệu thành Markdown.
  2. Tổng hợp dữ liệu thị trường (giá, volume, tin tức) và đưa vào prompt đặc chế của "Giám đốc Phân tích OMNI DUCK".
  3. Cung cấp tính năng "Săn tin tức" (searchNewsWithAI) theo các chế độ (official, balanced, negative, rumor).
- **Kết quả cuối**: Trả về các Báo cáo phân tích chuyên sâu (Markdown) chứa các nhận định thị trường, đánh giá vĩ mô, và Quyết định Hành động (Mua/Bán/Đứng ngoài) dưới định dạng JSON.

### `autoTradeEngine.js`
- **Nhiệm vụ**: Động cơ giao dịch tự động định lượng (Quant Trading Engine).
- **Logic Thực thi**:
  1. Chạy vòng lặp phân tích trên danh sách các mã chứng khoán/crypto.
  2. Tính toán hàng loạt chỉ báo kỹ thuật (EMA, ATR, RSI, MACD, Volume Surge, OBV, VWAP, Bollinger Bands, ADX, Candlestick Patterns).
  3. Áp dụng mức độ rủi ro (Risk Config từ Level 1: Thận trọng đến Level 4: Liều lĩnh) để đưa ra điểm số (Score).
  4. Quản lý việc chốt lời/cắt lỗ (Trailing Stop, Partial Scale-out - chốt lời từng phần).
- **Kết quả cuối**: Phát lệnh giao dịch ảo (Paper Trading) hoặc thật (Live) thông qua `ExchangeBroker`, đồng thời gửi cảnh báo qua Telegram.

### `auditLogService.js` / `pipelineLogService.js` / `tradeFunnelService.js`
- **Nhiệm vụ**:
  - `pipelineLogService.js`: log tiến trình pipeline + buffer RAM
  - `tradeFunnelService.js`: tóm tắt funnel (qualified/reject reason/top candidates)
  - `auditLogService.js`: lưu JSONL theo ngày, có thể mã hóa AES-256-GCM
- **Lưu ý quan trọng về đường dẫn log**:
  - Log path resolve theo `process.cwd()`
  - Cùng một `AUTODUCK_AUDIT_LOG_DIR=logs/autoduck` nhưng có thể ghi vào:
    - `G:/ProjectFinance/logs/autoduck/...` hoặc
    - `G:/ProjectFinance/src/logs/autoduck/...`
  - Phụ thuộc thư mục chạy server

### `cryptoService.js` / `marketInsightService.js`
- **Nhiệm vụ**: Phục vụ dữ liệu tài chính cho Frontend và AI.
- **Logic Thực thi**: Tính toán các điểm số kỹ thuật (Technicals) nhanh chóng từ chuỗi nến (candles) và cache lại dữ liệu (như Chỉ số Sợ hãi & Tham lam, Vốn hóa thị trường).
- **Kết quả cuối**: Cung cấp API Data Objects gọn nhẹ, chứa xu hướng (BULLISH/BEARISH) và các mốc Giá chặn (SL, TP1, TP2).

### `telegramService.js`
- **Nhiệm vụ**: Giao tiếp một chiều và hai chiều với người dùng qua Telegram.
- **Kết quả cuối**: Bắn các tin nhắn Alert (Cảnh báo biến động, Báo cáo PnL hàng ngày, Khớp lệnh) lên kênh Telegram đã cấu hình.

---

## 2. Tầng Tác vụ Chạy Ngầm (Cron Jobs) - `/src/jobs/`

### `cryptoUpdater.js` / `derivUpdater.js`
- **Nhiệm vụ**: "Lazy updater" - Chỉ chạy khi có người dùng mở hệ thống/tab tương ứng để tiết kiệm tài nguyên.
- **Logic Thực thi**: Gọi API từ các nguồn bên thứ 3 (Alternative.me, CoinGecko) mỗi 5-15 phút.
- **Kết quả cuối**: Cập nhật dữ liệu vào biến toàn cục (Global Cache RAM) để các request API có thể đọc ngay lập tức (zero latency).

### `newsCron.js`
- **Nhiệm vụ**: Quét tin tức liên tục.
- **Kết quả cuối**: Lưu các bản tin nóng vào Database (`DerivNews`, `Stock`) để dùng làm Context cho AI đánh giá Sentiment (tâm lý thị trường) khi ra quyết định.

---

## 3. Tầng Cào Dữ Liệu & API Bên Ngoài (Scrapers & Fetchers)

### `fetchers/cafefService.js`, `fetchers/tcbsService.js`
- **Nhiệm vụ**: Cầu nối API chính thống tới các nguồn dữ liệu tài chính Việt Nam.
- **Logic**: Fetch dữ liệu lịch sử giá (OHLCV), thông tin hồ sơ doanh nghiệp.
- **Kết quả cuối**: Raw JSON data để `autoTradeEngine` và `marketInsightService` chế biến.

### `scrapers/googleNewsDecoder.js` / `vnNewsSearch.js`
- **Nhiệm vụ**: Tìm kiếm và bóc tách tin tức từ Google News hoặc các báo mạng VN.
- **Kết quả cuối**: Danh sách các bài báo có Title, Link, Sentiment.

---

## 4. Tầng Cơ Sở Dữ Liệu (Models) - `/models/`

Sử dụng Mongoose để giao tiếp với MongoDB.
- `AutoTrade.js`: Lưu cấu hình chạy auto cho từng mã lệnh, từng người dùng (Trạng thái ON/OFF, mức vốn).
- `UserOrder.js`: Lưu trữ nhật ký giao dịch (Entry, Take Profit, Stoploss, Trạng thái Khớp lệnh, PnL - Lời/lỗ).
- `AiBehavior.js`: Lưu trữ các tùy chỉnh hành vi của bot AI (Độ rủi ro, Tính cách).

---

## 5. Tầng Giao Diện Người Dùng (Frontend - React/Vite)

Nằm trong `/frontend/src/components/`. Hệ thống thiết kế theo phong cách giao diện tương lai (Cyberpunk / Terminal).
- `StockAiChat.jsx`: Component chat trực tiếp với OMNI DUCK AI, cho phép hỏi đáp và hiển thị markdown/bảng dữ liệu.
- `TradingChart.jsx`: Nhúng biểu đồ TradingView Lightweight Charts để vẽ nến giá, volume, và các marker điểm Mua/Bán.
- `MarketRadar.jsx`: Bảng điều khiển (Dashboard) hiển thị tín hiệu real-time từ các mã chứng khoán/crypto đang được scan. Cập nhật liên tục từ Backend API.

---

## TỔNG KẾT LUỒNG DỮ LIỆU (DATA FLOW MẪU CHO AUTO TRADING)

1. **Trigger**: `autoTradeEngine` đến chu kỳ tick (VD: 15 phút/lần).
2. **Fetch Data**: Engine gọi `fetchers` (ENTRADE, Binance) để lấy nến OHLCV mới nhất.
3. **Indicator Calc**: Tính toán Technical Analysis (MACD, RSI...). Nếu có tín hiệu đột biến -> Chuyển sang bước AI.
4. **Context Gathering**: Đọc tin tức mới nhất từ `newsCron.js` cache, fetch dữ liệu BCTC PDF.
5. **AI Evaluation**: Gửi tất cả cho `aiService.js`. Gemini AI trả về lệnh `LONG/SHORT/QUAN SÁT`.
6. **Execution**: Nếu AI khuyên MUA và Technical ủng hộ -> Lưu vào `UserOrder` (DB), trừ vốn khả dụng.
7. **Notification**: `telegramService.js` bắn thông báo lên Telegram báo lệnh vừa khớp.
