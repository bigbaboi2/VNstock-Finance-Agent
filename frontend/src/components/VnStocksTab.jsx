import { 
  Activity, Zap, FileText, Database, BrainCircuit, 
  BarChart3, ChevronDown, ChevronUp, HelpCircle,
  ArrowLeft, MessageSquare, FileJson, ExternalLink,
  TrendingUp, TrendingDown, Minus, ShieldAlert, Radio, Newspaper, Bot,
  Loader2, CheckCircle2, XCircle, Globe, Clock,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import TradingChart from './TradingChart';
import MarketOverview from './MarketOverview';
import MarketRadar from './MarketRadar';
import { useState, useEffect, useRef } from 'react';
import StockAiChat from './StockAiChat';
import AtomLoader from './AtomLoader';

function CompanyOverview({ profile, isDark, UI }) {
  const [expanded, setExpanded] = useState(false);
  const p = profile;
  const hasDetail = p?.industry || p?.address;

  return (
    <div className={`rounded-xl border mb-5 overflow-hidden ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center justify-between px-4 pt-4 pb-2 transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}
      >
        <p className="text-[10px] uppercase tracking-widest text-yellow-500 font-black flex items-center gap-2">
          <Activity size={12} /> Tổng quan doanh nghiệp
        </p>
        {hasDetail && (
          expanded
            ? <ChevronUp size={14} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
            : <ChevronDown size={14} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
        )}
      </button>

      {hasDetail ? (
        <div className="px-4 pb-3 space-y-1.5">
          {p.industry        && <p className={`text-[11px] ${UI.textMuted}`}>🏭 <span className="font-bold">Ngành:</span> {p.industry}</p>}
          {p.listing_date    && <p className={`text-[11px] ${UI.textMuted}`}>📅 <span className="font-bold">GDĐT:</span> {p.listing_date}</p>}
          {p.charter_capital && <p className={`text-[11px] ${UI.textMuted}`}>💰 <span className="font-bold">Vốn điều lệ:</span> {p.charter_capital}</p>}
          {p.shares_listed   && <p className={`text-[11px] ${UI.textMuted}`}>📊 <span className="font-bold">CP niêm yết:</span> {p.shares_listed}</p>}
        </div>
      ) : (
        <div className="px-4 pb-4">
          <p className={`text-[11px] leading-relaxed italic whitespace-pre-line ${UI.textMuted}`}>{p?.overview}</p>
        </div>
      )}

      {expanded && hasDetail && (
        <div className={`px-4 pb-4 pt-3 border-t space-y-1.5 ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
          {p.address  && <p className={`text-[11px] ${UI.textMuted}`}>📍 {p.address}</p>}
          {p.phone    && <p className={`text-[11px] ${UI.textMuted}`}>📞 {p.phone}</p>}
          {p.email    && <a href={`mailto:${p.email}`} className="text-[11px] text-blue-400 hover:underline block">✉️ {p.email}</a>}
          {p.website  && <a href={p.website} target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 hover:underline block">🌐 {p.website}</a>}
          {p.description && (
            <div className={`mt-2 pt-2 border-t space-y-2 ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
              {p.description.split('\n\n').map((section, i) => (
                <p key={i} className={`text-[11px] leading-relaxed whitespace-pre-line ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {section}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VnStocksTab({
  isDark, UI,
  allStocks,
  marketData,
  chartData,
  aiReport,
  analyzing,
  analysisStep = '',
  loadingMarket,
  aiReportError,
  loadingAiNews,
  activeInterval,
  showExtraStats, setShowExtraStats,
  showVolInfo, setShowVolInfo,
  actionData,
  isUpdatingAction,
  setShowPdfModal,
  vnIndexData,
  hnxIndexData,
  vn30Data,
  marketIntel,
  handleAiAnalysis,
  handleIntervalChange,
  fetchAiNews,
  stopNewsStream,
  fetchUserHistory,
  userHistory,
  setInput,
  fetchMarketData,
  heatmapData = [],
  loadingHeatmap,
  lastAiVnTime,
  currentUser,
  onRequestCloseChat,  
  aiAnalysisDuration,
  pdfMode = 'turbo',
  setPdfMode,
}) 
{
  const [historyLimit, setHistoryLimit] = useState(3);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isExporting, setIsExporting]   = useState(false);
  const [exportStatus, setExportStatus] = useState(null);
  const aiError = aiReportError;

  useEffect(() => {
    if (onRequestCloseChat) {
      onRequestCloseChat(() => setIsChatOpen(false));
    }
  }, [onRequestCloseChat]);

  // ── LOADING ENTERTAINMENT ──
  const VN_STOCK_FACTS = [
    { type: 'fact', icon: '📊', text: 'HOSE (Sở GDCK TP.HCM) khai trương ngày 28/7/2000 với phiên đầu tiên chỉ có 2 mã: REE và SAM. Khớp lệnh 2 lần/ngày.' },
    { type: 'fact', icon: '🏛️', text: 'HNX (Sở GDCK Hà Nội) thành lập năm 2005, ban đầu là sàn OTC cho doanh nghiệp vừa và nhỏ, nay bao gồm cả thị trường trái phiếu chính phủ.' },
    { type: 'fact', icon: '📈', text: 'Biên độ dao động giá trên HOSE là ±7%/phiên, HNX ±10%/phiên, UPCoM ±15%/phiên. Riêng cổ phiếu ngày IPO có thể dao động không giới hạn.' },
    { type: 'fact', icon: '⏱️', text: 'Quy tắc T+2: Cổ phiếu mua ngày T sẽ được về tài khoản sau 2 ngày làm việc (T+2), và chỉ bán được sau đó.' },
    { type: 'fact', icon: '🌏', text: 'FTSE Russell xếp Việt Nam vào nhóm Frontier Market từ 2018. Mục tiêu nâng hạng lên Secondary Emerging Market đang được cơ quan quản lý thúc đẩy.' },
    { type: 'fact', icon: '💹', text: 'VN-Index được tính theo phương pháp vốn hóa thị trường (market-cap weighted), tương tự S&P 500 — cổ phiếu vốn hóa lớn ảnh hưởng chỉ số nhiều hơn.' },
    { type: 'fact', icon: '🏦', text: 'Nhóm ngân hàng chiếm tỷ trọng lớn nhất VN-Index, thường dao động 30–40% tổng vốn hóa toàn thị trường.' },
    { type: 'fact', icon: '💰', text: 'Thanh khoản HOSE những phiên sôi động có thể vượt 25.000 tỷ đồng (~1 tỷ USD), ngang ngửa các sàn lớn ở Đông Nam Á như SET (Thái Lan).' },
    { type: 'fact', icon: '📉', text: 'VN-Index từng giảm hơn 70% trong giai đoạn khủng hoảng 2007–2009, từ đỉnh ~1.170 điểm xuống còn ~235 điểm — mức giảm mạnh nhất lịch sử.' },
    { type: 'fact', icon: '🧾', text: 'Thuế TNCN khi bán cổ phiếu tại Việt Nam là 0,1% trên giá trị giao dịch (không phân biệt lãi hay lỗ), thu tại nguồn qua công ty chứng khoán.' },
    { type: 'fact', icon: '🔒', text: 'Room ngoại (foreign ownership limit) tối đa thông thường là 49% cho công ty thường, 30% cho ngân hàng, trừ trường hợp được cấp phép đặc biệt.' },
    { type: 'fact', icon: '📦', text: 'Lô tối thiểu khi đặt lệnh trên HOSE và HNX là 100 cổ phiếu. UPCoM cho phép đặt lẻ từ 1 cổ phiếu.' },
    { type: 'fact', icon: '🦅', text: 'VinFast (VFS) niêm yết trên Nasdaq năm 2023, trở thành công ty Việt Nam đầu tiên IPO trên sàn chứng khoán Mỹ.' },
    { type: 'fact', icon: '🏗️', text: 'Tập đoàn Vingroup là doanh nghiệp tư nhân có vốn hóa lớn nhất Việt Nam, hoạt động trải dài từ bất động sản, bán lẻ đến ô tô điện.' },
    { type: 'fact', icon: '🌾', text: 'Việt Nam là quốc gia xuất khẩu gạo top 3 thế giới — các mã cổ phiếu nông nghiệp như LTG, NSC thường biến động theo giá gạo quốc tế.' },
    { type: 'fact', icon: '⚡', text: 'Chỉ số HNX30 gồm 30 cổ phiếu vốn hóa lớn nhất sàn HNX, được cơ cấu lại 2 lần/năm vào tháng 1 và tháng 7.' },
    { type: 'fact', icon: '🔋', text: 'Cổ phiếu penny tại Việt Nam thường là cổ phiếu có giá dưới 10.000 đồng — biên độ ±7% tương đương chỉ vài trăm đồng/cổ.' },
    { type: 'fact', icon: '🎯', text: 'Lệnh ATO (At-the-Opening) và ATC (At-the-Closing) không có giá giới hạn — mục đích tạo thanh khoản tốt nhất lúc mở/đóng cửa.' },
    { type: 'fact', icon: '🏙️', text: 'TP.HCM đóng góp hơn 50% thanh khoản toàn thị trường chứng khoán Việt Nam nhờ mật độ nhà đầu tư và doanh nghiệp tập trung.' },
    { type: 'fact', icon: '💎', text: 'ROE (Return on Equity) trên 15% thường được coi là ngưỡng tốt tại Việt Nam — ngân hàng lớn thường đạt 18–22%.' },
    { type: 'fact', icon: '📡', text: 'Hệ thống giao dịch KRX (Hàn Quốc) được triển khai tại HOSE từ năm 2021, thay thế hệ thống cũ, hỗ trợ giao dịch T+0 trong tương lai.' },
    { type: 'fact', icon: '🌊', text: 'Sóng Elliott là lý thuyết phân tích kỹ thuật phổ biến tại Việt Nam — nhiều NĐT cá nhân dùng để dự đoán chu kỳ thị trường.' },
    { type: 'fact', icon: '🐋', text: '"Cá mập" trong thị trường VN ám chỉ tổ chức, quỹ lớn — hành vi của họ thường được theo dõi qua khối lượng giao dịch bất thường.' },
    { type: 'fact', icon: '📰', text: 'SSI Research, VNDirect và MBS là ba trung tâm phân tích được nhà đầu tư Việt Nam tham khảo nhiều nhất.' },
    { type: 'fact', icon: '🔮', text: 'P/B (Price-to-Book) dưới 1 nghĩa là cổ phiếu giao dịch thấp hơn giá trị sổ sách — có thể là cơ hội hoặc bẫy giá trị.' },
    { type: 'fact', icon: '🏆', text: 'Mã VCB (Vietcombank) thường được coi là "cổ phiếu chuẩn mực" nhờ thanh khoản cao, quản trị tốt và lợi nhuận ổn định.' },
    { type: 'fact', icon: '🌐', text: 'Dragon Capital và VinaCapital là hai quỹ ngoại lớn nhất đang hoạt động tại thị trường chứng khoán Việt Nam.' },
    { type: 'fact', icon: '📋', text: 'BCTC quý của doanh nghiệp niêm yết phải nộp trong 45 ngày sau khi kết thúc quý, BCTC năm trong 90 ngày.' },
    { type: 'fact', icon: '🏠', text: 'Cổ phiếu bất động sản chiếm 15–20% vốn hóa VN-Index, nhạy cảm nhất với chính sách lãi suất và tín dụng của NHNN.' },
    { type: 'fact', icon: '⚖️', text: 'Ủy ban Chứng khoán Nhà nước (SSC) là cơ quan quản lý thị trường vốn Việt Nam, trực thuộc Bộ Tài chính, thành lập năm 1996.' },
    { type: 'fact', icon: '🎪', text: 'IPO lớn nhất lịch sử TTCK Việt Nam là VHM (Vinhomes) năm 2018, huy động gần 14.000 tỷ đồng trong ngày đầu niêm yết.' },
    { type: 'fact', icon: '🔬', text: 'Phân tích cơ bản (FA) tập trung vào giá trị nội tại; phân tích kỹ thuật (TA) tập trung vào mẫu hình giá và khối lượng.' },
    { type: 'fact', icon: '💡', text: 'Chiến lược "mua và nắm giữ" dài hạn tại VN-Index từ 2009–2022 mang lại lợi suất trung bình ~12–15%/năm.' },
    { type: 'fact', icon: '🦁', text: 'Nhà đầu tư nước ngoài mua ròng kỷ lục trên HOSE thường xảy ra khi VND ổn định và lãi suất USD thấp.' },
    { type: 'fact', icon: '🎲', text: 'Giao dịch margin tại Việt Nam cho phép vay tối đa 50% giá trị danh mục — tỷ lệ 1:1, thấp hơn nhiều thị trường phát triển.' },
    { type: 'fact', icon: '🕰️', text: 'Phiên HOSE: Sáng 9:00–11:30, Chiều 13:00–14:30, ATC 14:30–14:45. HNX có thêm phiên thỏa thuận.' },
    { type: 'fact', icon: '🌱', text: 'ESG (Môi trường, Xã hội, Quản trị) đang trở thành tiêu chí quan trọng cho nhà đầu tư nước ngoài khi chọn cổ phiếu Việt Nam.' },
    { type: 'fact', icon: '🔥', text: '"Cháy tài khoản" xảy ra khi dùng margin quá mức — thị trường VN ghi nhận nhiều trường hợp trong giai đoạn 2021–2022.' },
    { type: 'fact', icon: '🧲', text: 'Chứng quyền có bảo đảm (CW) được giới thiệu tại HOSE từ năm 2019, cho phép đầu tư đòn bẩy với rủi ro giới hạn.' },
    { type: 'fact', icon: '🌍', text: 'GDP Việt Nam tăng trưởng bình quân 6–7%/năm trong 20 năm qua — một trong những nền kinh tế tăng trưởng nhanh nhất châu Á.' },
    { type: 'fact', icon: '🏭', text: 'Ngành sản xuất xuất khẩu (dệt may, điện tử, thủy sản) đóng góp lớn vào GDP nhưng có ít mã niêm yết chất lượng cao trên sàn.' },
    { type: 'fact', icon: '💳', text: 'Tài khoản chứng khoán tại VN cần xác thực eKYC — số lượng tài khoản mở mới kỷ lục trong 2020–2021 với hàng triệu NĐT mới.' },
    { type: 'fact', icon: '🛡️', text: 'Quỹ bảo vệ nhà đầu tư (IDF) được quản lý bởi VSD, bảo vệ tối đa 50 triệu đồng/nhà đầu tư.' },
    { type: 'fact', icon: '🚀', text: 'Cổ phiếu FPT tăng hơn 300% trong giai đoạn 2020–2023, nhờ tăng trưởng mảng công nghệ và AI toàn cầu.' },
    { type: 'fact', icon: '🎯', text: 'Sharpe Ratio đo lường lợi nhuận vượt trội so với rủi ro — danh mục tốt có Sharpe > 1, xuất sắc khi > 2.' },
    { type: 'fact', icon: '🔑', text: 'Đòn bẩy tài chính (D/E ratio) cao không nhất thiết xấu — ngân hàng VN thường có D/E 8–10x vì bản chất kinh doanh vốn.' },
    { type: 'fact', icon: '🌺', text: 'Mùa BCTC VN tập trung vào tháng 1 (Q4 sơ bộ), tháng 4 (Q4 chính thức + Q1), tháng 7–8 (Q2) và tháng 10 (Q3).' },
    { type: 'fact', icon: '🧩', text: 'VNMID theo dõi 70 cổ phiếu vốn hóa vừa, thường tăng trưởng tốt hơn VN-Index trong bull market do room tăng lớn hơn.' },
    { type: 'fact', icon: '💻', text: 'Giao dịch thuật toán (algo trading) chiếm ngày càng lớn thanh khoản HOSE, đặc biệt qua SSI, VCSC, HSC.' },
    { type: 'fact', icon: '🌙', text: '"January Effect" từng quan sát thấy trên TTCK VN: cổ phiếu vốn hóa nhỏ thường tăng mạnh vào đầu năm mới.' },
    { type: 'fact', icon: '🏅', text: 'VN-Index đạt đỉnh lịch sử ~1.500 điểm vào tháng 4/2022, sau đó điều chỉnh sâu do ảnh hưởng từ thị trường trái phiếu.' },
    { type: 'fact', icon: '📣', text: 'Insider trading bị phạt nặng tại VN — SSC tăng mức phạt lên đến 10 tỷ đồng và cấm hoạt động chứng khoán từ 2023.' },
    { type: 'quiz', icon: '🧠', question: 'VN30 theo dõi bao nhiêu cổ phiếu?', options: ['20 mã', '30 mã', '50 mã', '100 mã'], answer: 1 },
    { type: 'quiz', icon: '🧠', question: 'Lệnh ATO khớp vào thời điểm nào?', options: ['Cuối phiên chiều', 'Mở cửa phiên sáng', 'Giữa phiên liên tục', 'Bất kỳ lúc nào'], answer: 1 },
    { type: 'quiz', icon: '🧠', question: 'P/E = 15 nghĩa là gì?', options: ['Lợi nhuận gấp 15 lần giá', 'Mất 15 năm hoàn vốn theo LN hiện tại', 'Giá trị sổ sách gấp 15 lần', 'Tăng trưởng 15%/năm'], answer: 1 },
    { type: 'quiz', icon: '🧠', question: 'Margin call xảy ra khi nào?', options: ['Cổ phiếu tăng trần', 'Tài khoản lãi lớn', 'Tài sản ròng xuống dưới ngưỡng tối thiểu', 'Hết phiên giao dịch'], answer: 2 },
    { type: 'quiz', icon: '🧠', question: 'RSI trên 70 thường báo hiệu điều gì?', options: ['Vùng quá bán', 'Vùng quá mua', 'Xu hướng tăng mạnh', 'Cổ phiếu đang giảm'], answer: 1 },
    { type: 'quiz', icon: '🧠', question: 'MACD cắt Signal từ dưới lên là tín hiệu gì?', options: ['Bán ra', 'Mua vào (bullish)', 'Giữ nguyên', 'Không có ý nghĩa'], answer: 1 },
    { type: 'quiz', icon: '🧠', question: 'Biên độ dao động tối đa/phiên trên HOSE là?', options: ['±5%', '±7%', '±10%', '±15%'], answer: 1 },
    { type: 'quiz', icon: '🧠', question: 'Sàn nào cho phép đặt lô lẻ từ 1 cổ phiếu?', options: ['HOSE', 'HNX', 'UPCoM', 'Cả ba'], answer: 2 },
    { type: 'quiz', icon: '🧠', question: 'T+2 nghĩa là gì?', options: ['Mua 2 lần/ngày', 'Cổ phiếu về tài khoản sau 2 ngày', 'Lãi suất margin 2%', 'Khớp lệnh 2 lần'], answer: 1 },
    { type: 'quiz', icon: '🧠', question: 'Chỉ số nào đo lường lợi nhuận trên vốn chủ sở hữu?', options: ['P/E', 'EPS', 'ROE', 'EBITDA'], answer: 2 },
    { type: 'quiz', icon: '🧠', question: 'VN-Index được tính theo phương pháp nào?', options: ['Giá trung bình', 'Vốn hóa thị trường', 'Giá cao nhất/thấp nhất', 'Đồng đều các mã'], answer: 1 },
  ];

  const VN_FACTS_ONLY = VN_STOCK_FACTS.filter(c => c.type === 'fact');
  const VN_QUIZ_ONLY  = VN_STOCK_FACTS.filter(c => c.type === 'quiz');
  const randFrom = arr => arr[Math.floor(Math.random() * arr.length)];

//Keep track of displayed facts/quiz — don't show again
  const shownFactIndicesRef = useRef(new Set());
  const shownQuizIndicesRef = useRef(new Set());

  const pickUnseen = (arr, seenSet) => {
    if (seenSet.size >= arr.length) seenSet.clear();
    let attempts = 0;
    while (attempts < arr.length * 2) {
      const idx = Math.floor(Math.random() * arr.length);
      if (!seenSet.has(idx)) { seenSet.add(idx); return arr[idx]; }
      attempts++;
    }
    return arr[0];
  };

  const [loadingCard, setLoadingCard] = useState(() => {
    const idx = Math.floor(Math.random() * VN_FACTS_ONLY.length);
    shownFactIndicesRef.current.add(idx);
    return VN_FACTS_ONLY[idx];
  });
  const [quizSelected, setQuizSelected] = useState(null);
  const [cardFlip, setCardFlip] = useState(false);

  const advanceCard = (nextCard) => {
    setCardFlip(true);
    setTimeout(() => {
      setLoadingCard(nextCard);
      setQuizSelected(null);
      setCardFlip(false);
    }, 350);
  };

  useEffect(() => {
    if (!analyzing) {
      setQuizSelected(null);
      setCardFlip(false);
      shownFactIndicesRef.current.clear();
      shownQuizIndicesRef.current.clear();
      return;
    }
    if (loadingCard.type !== 'fact') return;
    const t = setTimeout(() => advanceCard(pickUnseen(VN_FACTS_ONLY, shownFactIndicesRef.current)), 15000);
    return () => clearTimeout(t);
  }, [analyzing, loadingCard]);

  // STATE CỦA BẢN ĐỒ NHIỆT
  const [heatmapView, setHeatmapView] = useState('sectors'); 
  const [heatmapSector, setHeatmapSector] = useState(null);
  const [hmColor, setHmColor] = useState('redGreen');
  const [hmShape, setHmShape] = useState('rectangle');
  const [hmMetric, setHmMetric] = useState('volume');
  const [hmHovered, setHmHovered] = useState(null);

  return (
    <>
        {/* GRID COLUMN 1: MARKET DATA & RADAR SUMMARY */}
        <div className={`w-[550px] border-r flex flex-col shrink-0 overflow-hidden relative h-full transition-colors duration-300 ${UI.leftCol}`}>
          <div className={`h-[6px] w-full shrink-0 z-50 relative overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-300'}`}>
            {loadingMarket && (
              <div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400 to-transparent animate-shimmer shadow-[0_0_15px_rgba(250,204,21,1)]"
                style={{ backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite linear' }}
              />
            )}
          </div>
          
          <div className="flex-1 flex flex-col overflow-y-auto min-h-0 custom-scrollbar">
              {!marketData ? (
                 <div className={`h-full flex flex-col items-center justify-center opacity-50 min-h-[400px] ${UI.textMuted}`}>
                    <Database size={48} className="mb-4" />
                    <p className="text-xs font-black uppercase">Waiting for Command</p>
                 </div>
              ) : (
                <div className="flex flex-col relative pb-4">

              {/* ROW PANEL: SYMBOL HEADINFO */}
              <div className={`shrink-0 p-6 border-b shadow-xl relative transition-colors duration-300 ${UI.card}`}>
                    <div className={`flex justify-between items-start mb-6 pb-6 border-b ${UI.border}`}>
                    <div>
                      <div className="flex items-end gap-2">
                        <h2 className={`text-5xl font-black tracking-tighter text-yellow-400 ${UI.textBold}`}>
                          {marketData.stockInfo.symbol}
                        </h2>
                        <span className="p-1 px-2 bg-emerald-500/10 text-emerald-500 rounded text-[10px] font-black uppercase tracking-widest mb-1">
                          {marketData.stockInfo?.exchange}
                        </span>
                      </div>
                      <p className={`text-[13px] font-medium mt-3 leading-tight italic max-w-[220px] ${UI.textNormal}`}>
                      {(marketData.companyProfile?.companyName && marketData.companyProfile.companyName !== marketData.stockInfo?.symbol) 
                          ? marketData.companyProfile.companyName 
                          : (allStocks.find(s => s.symbol === marketData.stockInfo?.symbol)?.companyName || 'Đang cập nhật...')}
                    </p>
                    </div>

                    <div className="text-right">
                      <p className={`text-[10px] uppercase tracking-widest font-black mb-1 ${UI.textMuted}`}>Giá Khớp Lệnh</p>
                      <h2 className={`text-3xl font-black leading-none ${UI.textBold}`}>
                        {marketData.stockInfo.currentPrice}
                      </h2>
                      <div className={`flex items-center justify-end gap-1 font-black text-sm mt-2 ${(marketData.stockInfo.change || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {(marketData.stockInfo.change || 0) >= 0 ? '▲' : '▼'}
                        <span>
                          {Math.abs(marketData.stockInfo.change || 0).toLocaleString('vi-VN')} 
                          {' '}
                          ({Number(marketData.stockInfo.changePercent || 0).toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={`grid grid-cols-4 gap-4 text-center mb-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    <div className={`p-3 rounded-xl border flex flex-col items-center justify-center ${isDark ? 'bg-[#1a1f2e] border-gray-700' : 'bg-gray-100 border-gray-200 shadow-sm'}`}>
                        <p className={`text-[10px] mb-2 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>VỐN HÓA</p>
                        <p className="font-black text-base lg:text-lg-2 leading-none whitespace-nowrap">{marketData.stockInfo.marketCap}</p>
                    </div>
                    <div className={`p-3 rounded-xl border flex flex-col items-center justify-center ${isDark ? 'bg-[#1a1f2e] border-gray-700' : 'bg-gray-100 border-gray-200 shadow-sm'}`}>
                        <p className={`text-[10px] mb-2 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>P/E</p>
                        <p className="font-black text-base lg:text-lg leading-none text-yellow-500 whitespace-nowrap">{marketData.stockInfo.pe}</p>
                    </div>
                    <div className={`p-3 rounded-xl border flex flex-col items-center justify-center ${isDark ? 'bg-[#1a1f2e] border-gray-700' : 'bg-gray-100 border-gray-200 shadow-sm'}`}>
                        <p className={`text-[10px] mb-2 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>TỔNG KL</p>
                        <p className="font-black text-base lg:text-lg leading-none whitespace-nowrap">{marketData.stockInfo.totalVolume}</p>
                    </div>
                    <div className={`p-3 px-4 rounded-xl border flex flex-col justify-center gap-2 ${isDark ? 'bg-[#1a1f2e] border-gray-700' : 'bg-gray-100 border-gray-200 shadow-sm'}`}>
                        <div className="flex justify-between items-center text-[13px] font-black text-emerald-500 leading-none">
                            <span className={`text-[6px] uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Mua</span>
                            <span className="whitespace-nowrap">{marketData.stockInfo.buyVolume}</span>
                        </div>
                        <div className="w-full h-2 flex rounded-full overflow-hidden bg-gray-800/20">
                            <div className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" style={{ width: '60%' }}></div>
                            <div className="h-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" style={{ width: '40%' }}></div>
                        </div>
                        <div className="flex justify-between items-center text-[13px] font-black text-red-500 leading-none">
                            <span className={`text-[6px] uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Bán</span>
                            <span className="whitespace-nowrap">{marketData.stockInfo.sellVolume}</span>
                        </div>
                    </div>
                  </div>

                  <div className="flex justify-center mb-4 mt-2">
                      <button 
                          onClick={() => setShowExtraStats(!showExtraStats)}
                          className={`flex items-center gap-1 text-[10px] font-black tracking-widest uppercase px-4 py-1.5 rounded-full border transition-all ${
                              isDark ? 'text-gray-400 border-gray-700 hover:bg-gray-800 hover:text-yellow-400 hover:border-yellow-400/50' : 'text-gray-500 border-gray-300 hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-400'
                          }`}
                      >
                          {showExtraStats ? <><ChevronUp size={14} /> THU GỌN CHỈ SỐ</> : <><ChevronDown size={14} /> XEM THÊM CHỈ SỐ TÀI CHÍNH</>}
                      </button>
                  </div>

                  {showExtraStats && (
                      <div className={`grid grid-cols-3 gap-4 text-center mb-6 p-4 rounded-xl border animate-in slide-in-from-top-2 fade-in duration-200 ${isDark ? 'bg-[#0f141e] border-gray-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                          <div>
                              <p className={`text-[10px] mb-1 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>EPS (Nghìn)</p>
                              <p className="font-black text-lg">{marketData.stockInfo.eps}</p>
                          </div>
                          <div>
                              <p className={`text-[10px] mb-1 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>P/B</p>
                              <p className="font-black text-lg">{marketData.stockInfo.pb}</p>
                          </div>
                          <div>
                              <p className={`text-[10px] mb-1 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>GT Sổ sách</p>
                              <p className="font-black text-lg">{marketData.stockInfo.bvps}</p>
                          </div>
                      </div>
                  )}

                  <CompanyOverview profile={marketData.companyProfile} isDark={isDark} UI={UI} />

                  {/* ── PDF MODE SELECTOR ─────────────────────────────── */}
                  {setPdfMode && (
                    <div className={`rounded-xl p-3 mb-2 border ${isDark ? 'bg-slate-800/60 border-slate-700/50' : 'bg-slate-100 border-slate-200'}`}>
                      <p className={`text-[10px] font-black tracking-widest uppercase mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        ⚡ CHẾ ĐỘ ĐỌC PDF BÁO CÁO
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { key: 'turbo',    label: 'TURBO',    icon: '⚡', desc: '3–8s · Nhanh nhất',     warn: 'Có thể lỗi bảng' },
                          { key: 'fast',     label: 'FAST',     icon: '🚀', desc: '20–40s · Nhẹ',          warn: 'Bảng cơ bản' },
                          { key: 'balanced', label: 'BALANCED', icon: '⚖️',  desc: '60–90s · Cân bằng',    warn: 'Bảng đầy đủ' },
                          { key: 'full',     label: 'FULL',     icon: '🔬', desc: '150–200s · Chậm nhất',  warn: 'PDF scan/ảnh' },
                        ].map(({ key, label, icon, desc, warn }) => {
                          const isActive = pdfMode === key;
                          const activeStyle = isDark
                            ? 'bg-yellow-400/20 border-yellow-400 text-yellow-400'
                            : 'bg-yellow-100 border-yellow-500 text-yellow-700';
                          const inactiveStyle = isDark
                            ? 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                            : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700';
                          return (
                            <button
                              key={key}
                              onClick={() => setPdfMode(key)}
                              className={`rounded-lg border px-2 py-1.5 text-left transition-all active:scale-95 ${isActive ? activeStyle : inactiveStyle}`}
                            >
                              <div className="flex items-center gap-1">
                                <span className="text-sm">{icon}</span>
                                <span className={`text-[10px] font-black tracking-wider ${isActive ? '' : ''}`}>{label}</span>
                                {isActive && <span className="ml-auto text-[8px] font-black">✓</span>}
                              </div>
                              <p className="text-[9px] mt-0.5 opacity-70">{desc}</p>
                              <p className={`text-[8px] mt-0.5 ${isActive ? 'opacity-60' : 'opacity-40'}`}>{warn}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                      onClick={handleAiAnalysis}
                      disabled={analyzing}
                      className={`w-full h-12 rounded-xl hover:bg-yellow-400 hover:text-black font-black transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 mb-2 ${isDark ? 'bg-white text-black' : 'bg-slate-900 text-white'}`}
                  >
                      <BrainCircuit size={18} />
                      {analyzing ? 'AI ĐANG TƯ DUY...' : 'PHÂN TÍCH VỚI OMNI DUCK'}
                  </button>
                  {marketData && (
                    <button
                      onClick={() => setIsChatOpen(true)}
                      className={`w-full h-12 rounded-xl font-black transition-all active:scale-95 flex items-center justify-center gap-3 mb-2 border
                        ${isDark
                          ? 'bg-yellow-400/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-400/20 hover:border-yellow-400/60'
                          : 'bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100 hover:border-yellow-400'
                        }`}
                    >
                      <MessageSquare size={18} />
                      {aiReport ? 'CHAT VỀ MÃ NÀY VỚI AI' : 'HỎI AI VỀ MÃ NÀY'}
                    </button>
                  )}
                  {marketData && (() => {
                    const handleExportData = async () => {
                      if (isExporting) return;
                      const sym = marketData.stockInfo?.symbol;
                      setIsExporting(true);
                      setExportStatus(null);
                      console.log(`[HỆ THỐNG] Đang lấy full AI feed từ server cho ${sym}...`);
                      try {
                        const optimizedNews = (marketData.deepNewsData || []).slice(0, 20).map(n => ({
                          title:     n.title,
                          date:      n.date,
                          sentiment: n.sentiment || 'neutral',
                          link:      n.link    || null,
                          content:   n.content && n.content !== n.title && n.content.length > 80
                                       ? n.content.substring(0, 2000)
                                       : null,
                        }));
                        const payload = {
                          stockInfo: marketData.stockInfo,
                          companyProfile: { overview: marketData.companyProfile?.overview, companyName: marketData.companyProfile?.companyName },
                          technicalData: chartData.slice(-30),
                          marketContext: vnIndexData.slice(-5),
                          news: optimizedNews,
                          user: currentUser,
                          timestamp: new Date().toISOString(),
                        };
                        const res = await fetch(`/api/debug-feed/${sym}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), });
                        if (!res.ok) { const text = await res.text(); throw new Error(`Server lỗi ${res.status}: ${text.slice(0, 300)}`); }
                        const json = await res.json();
                        
                        console.group(`🦆 FULL AI FEED [${sym}] — ${json._debugMeta?.totalSizeKB} KB`);
                        console.table(json._debugMeta);
                        console.log('📋 previousAnalysis:', json.data?.previousAnalysis ? json.data.previousAnalysis.slice(0, 300) + '...' : 'null');
                        console.log('🌐 marketContext (server):', json.data?.marketContext);
                        console.log('📄 tcbsMarkdownData:', json.data?.tcbsMarkdownData ? json.data.tcbsMarkdownData.slice(0, 300) + '...' : 'null');
                        console.log('📦 Full data:', json.data);
                        console.groupEnd();
                        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `ai-full-feed-${sym}-${Date.now()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        setExportStatus('success');
                        setTimeout(() => setExportStatus(null), 3000);
                      } catch (err) {
                        console.error('Export lỗi:', err);
                        setExportStatus('error');
                        setTimeout(() => setExportStatus(null), 4000);
                      } finally {
                        setIsExporting(false);
                      }
                    };
                    return (
                      <div className="relative mb-2">
                        <button
                          onClick={handleExportData}
                          disabled={isExporting}
                          title="Xuất TOÀN BỘ data thực tế AI nhận (gồm previousAnalysis, marketContext từ server, TCBS PDF...)"
                          className={`w-full h-9 rounded-xl font-black transition-all active:scale-95 flex items-center justify-center gap-2 border text-[11px] uppercase tracking-widest overflow-hidden relative
                            ${isExporting
                              ? isDark
                                ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 cursor-not-allowed'
                                : 'bg-yellow-50 text-yellow-600 border-yellow-300 cursor-not-allowed'
                              : exportStatus === 'success'
                                ? isDark
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                                  : 'bg-emerald-50 text-emerald-600 border-emerald-300'
                                : exportStatus === 'error'
                                  ? isDark
                                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                    : 'bg-red-50 text-red-500 border-red-200'
                                  : isDark
                                    ? 'bg-white/3 text-slate-500 border-white/8 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                                    : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300'
                            }`}
                        >
                          {/* Shimmer sweep khi đang export */}
                          {isExporting && (
                            <span
                              className="absolute inset-0 pointer-events-none"
                              style={{
                                background: isDark
                                  ? 'linear-gradient(90deg,transparent 0%,rgba(234,179,8,0.12) 50%,transparent 100%)'
                                  : 'linear-gradient(90deg,transparent 0%,rgba(234,179,8,0.18) 50%,transparent 100%)',
                                backgroundSize: '200% 100%',
                                animation: 'exportSweep 1.4s linear infinite',
                              }}
                            />
                          )}
                          <style>{`
                            @keyframes exportSweep {
                              from { background-position: 200% 0; }
                              to   { background-position: -200% 0; }
                            }
                          `}</style>

                          {isExporting ? (
                            <>
                              <Loader2 size={13} className="animate-spin shrink-0" />
                              <span>Đang lấy dữ liệu từ Server...</span>
                            </>
                          ) : exportStatus === 'success' ? (
                            <>
                              <CheckCircle2 size={13} className="shrink-0" />
                              <span>Xuất thành công!</span>
                            </>
                          ) : exportStatus === 'error' ? (
                            <>
                              <XCircle size={13} className="shrink-0" />
                              <span>Xuất thất bại — thử lại</span>
                            </>
                          ) : (
                            <>
                              <FileJson size={13} className="shrink-0" />
                              <span>Export Full AI Feed (Server)</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })()}
                 
                  {lastAiVnTime && (() => {
                      const elapsed = Date.now() - lastAiVnTime;
                      const canCall = elapsed >= 5 * 60 * 1000;
                      const remainSec = Math.max(0, Math.floor((5*60*1000 - elapsed)/1000));
                      const remainMin = Math.floor(remainSec / 60);
                      return (
                          <div className="flex items-center justify-between mb-4 px-1">
                              <span className={`text-[9px] font-mono ${UI.textMuted}`}>
                                  {canCall
                                      ? <span className="text-emerald-500 font-black">✓ Sẵn sàng phân tích mới</span>
                                      : `Còn ${remainMin}:${String(remainSec%60).padStart(2,'0')} để tối ưu`
                                  }
                              </span>
                              <button
                                  onClick={() => handleAiAnalysis(true)}
                                  disabled={analyzing}
                                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border transition-all disabled:opacity-30
                                      ${isDark?'border-white/10 text-slate-400 hover:border-yellow-500/40 hover:text-yellow-400':'border-slate-200 text-slate-400 hover:border-yellow-400 hover:text-yellow-600'}`}
                              >
                                  ↻ Phân tích lại ngay
                              </button>
                          </div>
                      );
                  })()}

                  <div className={`h-[6px] w-full shrink-0 relative overflow-hidden rounded-full ${isDark ? 'bg-white/5' : 'bg-slate-200'}`}>
                    {loadingMarket && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400 to-transparent animate-shimmer shadow-[0_0_15px_rgba(250,204,21,1)]" style={{ backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite linear' }} />}
                  </div>
              </div>

              <div className="p-6">
                  <div className="space-y-3">
                   <button onClick={fetchAiNews} disabled={loadingAiNews} className={`w-full mt-4 h-12 rounded-xl font-black text-xs tracking-widest uppercase transition-all flex items-center justify-center gap-2 border border-dashed ${loadingAiNews ? 'opacity-50 border-slate-500 text-slate-500 cursor-not-allowed' : (isDark ? 'border-purple-500/50 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500' : 'border-purple-400 text-purple-600 hover:bg-purple-50 hover:border-purple-500')}`}>
                    <BrainCircuit size={16} className={loadingAiNews ? "animate-pulse" : ""} />
                    {loadingAiNews ? 'ĐANG QUÉT MẠNG DEEP WEB...' : 'SĂN THÊM TIN BẰNG AI'}
                  </button>
                  <div className="flex items-center justify-between px-2 mb-4">
                    <h3 className={`text-[10px] uppercase tracking-[0.2em] font-black ${UI.textMuted}`}>Live News Stream</h3>
                    {loadingMarket ? (
                      <button onClick={stopNewsStream} className="flex items-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-3 py-1 rounded-full transition-all border border-red-500/30">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Dừng lấy tin</span>
                      </button>
                    ) : (
                      marketData.deepNewsData?.length > 0 && (
                        <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/30 animate-in fade-in slide-in-from-right-2">
                          <Zap size={10} fill="currentColor" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Thành công: {marketData.deepNewsData.length} bài báo</span>
                        </div>
                      )
                    )}
                  </div>

                  {(() => {
                    const newsList = marketData.deepNewsData || [];
                    const total = newsList.length;

                    // Helpers
                    const getSentimentBadge = (news) => {
                      if (news.isMacro)       return { label: 'Vĩ mô', icon: <Activity size={9}/>, cls: isDark ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-sky-50 text-sky-700 border border-sky-300' };
                      if (news.isAiGenerated) return { label: 'AI', icon: <Bot size={9}/>, cls: 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.5)]' };
                      const s = news.sentiment;
                      const m = news.mode;
                      if (s === 'positive')  return { label: 'Tích cực', icon: <TrendingUp size={9}/>,   cls: isDark ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-emerald-50 text-emerald-700 border border-emerald-300' };
                      if (s === 'negative')  return { label: 'Tiêu cực', icon: <TrendingDown size={9}/>, cls: isDark ? 'bg-red-500/20 text-red-400 border border-red-500/40'         : 'bg-red-50 text-red-700 border border-red-300' };
                      if (m === 'official')  return { label: 'Chính thức', icon: <Newspaper size={9}/>,  cls: isDark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'     : 'bg-blue-50 text-blue-700 border border-blue-300' };
                      if (m === 'rumor')     return { label: 'Tin đồn',   icon: <Radio size={9}/>,       cls: isDark ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'   : 'bg-amber-50 text-amber-700 border border-amber-300' };
                      if (m === 'negative')  return { label: 'Rủi ro',    icon: <ShieldAlert size={9}/>, cls: isDark ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40': 'bg-orange-50 text-orange-700 border border-orange-300' };
                      return { label: 'Tổng hợp', icon: <Minus size={9}/>, cls: isDark ? 'bg-white/5 text-slate-400 border border-white/10' : 'bg-slate-100 text-slate-500 border border-slate-200' };
                    };

                    const getCardStyle = (news) => {
                      if (news.isMacro)                  return isDark ? 'bg-[#080e18] border-sky-500/30' : 'bg-sky-50/60 border-sky-200';
                      if (news.isAiGenerated)           return isDark ? 'bg-[#1a1025] border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-purple-50 border-purple-400';
                      if (news.sentiment === 'negative') return isDark ? 'bg-[#130c0c] border-red-900/40'                                            : 'bg-red-50/50 border-red-200';
                      if (news.sentiment === 'positive') return isDark ? 'bg-[#071a10] border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.12)]' : 'bg-emerald-50 border-emerald-400';
                      return isDark ? 'bg-[#10151C] border-white/5' : 'bg-white border-slate-100';
                    };

                    return newsList.map((news, index) => {
                      const badge = getSentimentBadge(news);
                      const titleColor = news.isAiGenerated
                        ? 'text-purple-400 group-hover:text-purple-300'
                        : news.sentiment === 'negative'
                          ? `text-red-400 group-hover:text-red-300 ${isDark ? '' : 'text-red-600 group-hover:text-red-700'}`
                          : news.sentiment === 'positive'
                            ? `text-emerald-400 group-hover:text-emerald-300 ${isDark ? '' : 'text-emerald-700 group-hover:text-emerald-600'}`
                            : `group-hover:text-yellow-500 ${UI.textNormal}`;

                      const dateColor = news.isAiGenerated
                        ? 'text-purple-300'
                        : news.sentiment === 'positive'
                          ? 'text-emerald-400'
                          : 'text-yellow-500';

                      return (
                        <a key={index} href={news.link} target="_blank" rel="noopener noreferrer"
                          className={`block rounded-2xl p-4 transition-all cursor-pointer group border ${UI.cardHover} ${getCardStyle(news)}`}>
                          
                           <div className="flex items-center justify-between gap-2 mb-2">
                            <span className={`inline-flex items-center gap-1 shrink-0 text-[9px] px-2 py-[3px] rounded-full font-black uppercase tracking-widest ${badge.cls}`}>
                              {badge.icon}{badge.label}
                            </span>
                            <span className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${dateColor}`}>
                              {news.date || 'Tin tức mới'}
                            </span>
                          </div>

                          {/* Title */}
                          <h3 className={`font-bold text-sm leading-snug transition-colors ${titleColor}`}>
                            {news.title}
                          </h3>

                           <div className={`mt-3 pt-2 flex justify-between items-center gap-3 border-t ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                            <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 truncate ${news.isAiGenerated ? 'text-purple-400' : UI.textBold}`}>
                              {news.source ? (
                                <><Globe size={10} className="shrink-0" /> <span className="truncate">{news.source}</span></>
                              ) : (
                                <><Globe size={10} className="shrink-0" /> <span className="truncate">Internet</span></>
                              )}
                            </span>
                            
                            <div className="flex items-center gap-0 shrink-0">
                              <span className={`text-[11px] flex items-center gap-1 font-mono font-bold ${UI.textMuted}`}>
                                <Clock size={12} /> 
                                Ngày lấy tin: {news.fetchedAt || 'Đang đồng bộ'}
                              </span>
                              <ExternalLink size={12} className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${news.sentiment === 'positive' ? 'text-emerald-400' : news.isAiGenerated ? 'text-purple-400' : 'text-yellow-500'}`} />
                            </div>
                          </div>

                          </a>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
          <MarketOverview 
            isDark={isDark} UI={UI} 
            marketIntel={marketIntel} 
            vnIndexData={vnIndexData} 
          />
      </div>

        {/* GRID COLUMN 2: ANALYTICAL VIEW & CHARTS */}
        <div className={`flex-1 overflow-y-auto p-8 lg:p-12 relative transition-colors duration-300 ${UI.rightCol} border-r ${UI.border}`}>
            
          {marketData && chartData && (
            <div className={`mb-8 border rounded-[40px] p-8 shadow-xl transition-colors duration-300 flex flex-col h-[600px] ${UI.card}`}>
              <div className={`flex items-center gap-3 mb-6 pb-4 border-b shrink-0 ${UI.border}`}>
                <BarChart3 className="text-yellow-500" size={24} />
                <h3 className={`font-black tracking-widest uppercase text-lg ${UI.textBold}`}>Biểu đồ Kỹ thuật ({marketData.stockInfo.symbol})</h3>
              </div>
              <div className="flex-1 w-full min-h-0 relative rounded-xl overflow-hidden">
                  <TradingChart 
                      data={chartData}       
                      theme={isDark ? 'dark' : 'light'}
                      onIntervalChange={handleIntervalChange} 
                      currentInterval={activeInterval}
                  />              
              </div>
            </div>
          )}

        {!marketData && !analyzing && !aiReport && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-700">
            {/* HEADER */}
            <div className="flex items-center justify-between border-b pb-4 mb-2">
              <div>
                <h2 className={`text-2xl font-black tracking-tight ${UI.textBold}`}>CÁC MÃ GẦN ĐÂY</h2>
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-yellow-500 mt-1">Personal Intelligence Feed</p>
              </div>
              <button onClick={fetchUserHistory} className={`p-2 rounded-lg border ${UI.btnLog}`}><Activity size={16}/></button>
            </div>

            {/* USER HISTORY LIST */}
            <div className="grid grid-cols-1 gap-4">
              {userHistory.slice(0, historyLimit).map((item, idx) => {
                const changePercent = parseFloat(item.changePercent) || 0;
                const isUp = changePercent > 0;
                const isDown = changePercent < 0;
                const formattedPercent = Math.abs(changePercent).toFixed(2);
                return (
                  <div key={idx}
                    onClick={() => { setInput(item.symbol); fetchMarketData(item.symbol); }}
                    className={`group relative flex flex-row items-center justify-between p-4 rounded-xl border transition-all cursor-pointer w-full min-h-[75px]
                      ${isDark ? 'bg-[#10151C] border-white/5 hover:bg-white/5' : 'bg-white border-slate-200 hover:bg-gray-50'}`}
                  >
                    <div className={`absolute left-0 top-1/4 bottom-1/4 w-1 rounded-r-full ${
                      item.lastAction?.includes('MUA') ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' :
                      item.lastAction?.includes('BÁN') ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-yellow-500'
                    }`} />
                    <div className="flex flex-row items-center gap-6 min-w-0 flex-1 ml-2">
                      <div className="flex-1 flex flex-col items-start gap-y-0.5 min-w-0 pr-4">
                        <div className="flex items-center gap-1.5">
                          <h3 className={`text-xl font-black tracking-tighter text-yellow-400 ${UI.textBold}`}>{item.symbol}</h3>
                          <span className="text-[10px] font-bold text-slate-600 uppercase">/ {item.exchange}</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase whitespace-normal leading-tight">{item.companyName || 'N/A'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-y-0.5 whitespace-nowrap">
                        <p className={`text-lg font-black flex items-center gap-1.5 justify-end ${isUp ? 'text-emerald-500' : isDown ? 'text-red-500' : 'text-slate-400'}`}>
                          {(item.price || 0).toLocaleString('vi-VN').replace(/,/g, '.')}
                          <span className="text-[11px] font-bold flex items-center ml-0.5">
                            {isUp && <ChevronUp size={14} className="mr-0.5" />}
                            {isDown && <ChevronDown size={14} className="mr-0.5" />}
                            ({formattedPercent}%)
                          </span>
                        </p>
                        <p className="text-[9px] font-bold text-slate-500 italic">Cập nhật: {new Date(item.timestamp).toLocaleString('vi-VN')}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-y-1.5 min-w-[110px] shrink-0 pl-4">
                      <span className={`px-4 py-1.5 rounded-full font-black text-[10px] uppercase border tracking-tight ${
                        item.lastAction?.includes('MUA') ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                        item.lastAction?.includes('BÁN') ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                        'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      }`}>{item.lastAction || 'QUAN SÁT'}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {userHistory.length > historyLimit && (
              <button onClick={() => setHistoryLimit(prev => prev + 3)}
                className={`w-full py-4 rounded-2xl border-2 border-dashed font-black text-[10px] tracking-[0.3em] uppercase transition-all ${UI.btnLog}`}>
                Tải thêm dữ liệu (+3)
              </button>
            )}

            {/* SECTOR HEATMAP & DRILL-DOWN */}
            {(loadingHeatmap || heatmapData.length > 0) && (() => {
              const getWeight = (stock) => {
                try {
                  if (hmMetric === 'value') {
                    const v = (stock.price || 0) * (stock.volume || 0);
                    return isFinite(v) && v > 0 ? v : 1;
                  }
                  if (hmMetric === 'marketcap') {
                    const stockInfo = allStocks.find(s => s.symbol === stock.sym || s.symbol === stock.id);
                    if (stockInfo?.marketCap) {
                      const raw = String(stockInfo.marketCap).replace(/[^\d]/g, '');
                      const capNumber = parseFloat(raw);
                    return isFinite(capNumber) && capNumber > 0 ? capNumber : stock.volume || 1;
                    }
                    return stock.volume || 1; 
                  }
                  const vol = stock.volume || 1;
                  return isFinite(vol) && vol > 0 ? vol : 1;
                } catch { return 1; }
              };

              let hmData = [];
              let hmTotal = 0;

              if (heatmapView === 'sectors') {
                  hmData = heatmapData.map(sec => {
                      const weight = sec.stocks.reduce((sum, s) => sum + getWeight(s), 0);
                      return { id: sec.name, name: sec.name, changePct: sec.avgChange, weight };
                  });
                  hmTotal = hmData.reduce((sum, d) => sum + d.weight, 0);
              } else if (heatmapView === 'stocks' && heatmapSector) {
                  const sec = heatmapData.find(s => s.name === heatmapSector);
                  if (sec) {
                      hmData = sec.stocks.map(s => {
                          const info = allStocks.find(as => as.symbol === s.sym) || {};
                          return {
                              id: s.sym, name: s.sym, fullName: info.companyName || 'Đang cập nhật',
                              exchange: info.exchange || 'VNX', price: s.price,
                              changePct: s.changePct, weight: getWeight(s)
                          };
                      });
                      hmTotal = hmData.reduce((sum, d) => sum + d.weight, 0);
                  }
              }
              hmData.sort((a,b) => b.weight - a.weight);

              return (
              <>
              <div className="mt-8 border-t pt-6 border-white/10">
                <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between mb-4 gap-3">
                  <div className="flex items-center gap-3">
                     {heatmapView === 'stocks' && (
                         <button 
                            onClick={() => { setHeatmapView('sectors'); setHeatmapSector(null); }} 
                            className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded border transition-all ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'}`}
                         >
                            <ArrowLeft size={14}/> QUAY LẠI
                         </button>
                     )}
                    <h2 className={`text-sm font-black tracking-widest uppercase ${UI.textBold}`}>
                        {heatmapView === 'sectors' ? 'Bản đồ Nhiệt Ngành' : `NGÀNH: ${heatmapSector}`}
                    </h2>
                    {heatmapView === 'stocks' && (
                      <span className={`text-[9px] font-bold px-2 py-1 rounded border border-dashed animate-pulse ${isDark ? 'text-yellow-400 border-yellow-400/30' : 'text-yellow-600 border-yellow-400'}`}>
                        ✦ Double-click mã để phân tích
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                      <select
                        value={hmMetric}
                        onChange={e => setHmMetric(e.target.value)}
                        className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1.5 rounded cursor-pointer outline-none border transition-colors ${isDark ? 'bg-[#1a1f2e] text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'}`}
                      >
                        <option value="volume">📊 Tỷ lệ: Khối lượng GD</option>
                        <option value="value">💰 Tỷ lệ: Giá trị GD</option>
                        <option value="marketcap">🏢 Tỷ lệ: Vốn hóa</option>
                      </select>
                     <select value={hmShape} onChange={e=>setHmShape(e.target.value)} className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1.5 rounded cursor-pointer outline-none border transition-colors ${isDark ? 'bg-[#1a1f2e] text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'}`}>
                        <option value="rectangle">🟩 Dạng: Chữ nhật</option>
                        <option value="polygon">⬟ Dạng: Đa giác</option>
                        <option value="circle">⏺ Dạng: Hình tròn</option>
                     </select>
                     <select value={hmColor} onChange={e=>setHmColor(e.target.value)} className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1.5 rounded cursor-pointer outline-none border transition-colors ${isDark ? 'bg-[#1a1f2e] text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'}`}>
                        <option value="redGreen">🔴 Màu Cơ bản (+/-)</option>
                        <option value="monochrome">🔵 Đơn sắc (Vol)</option>
                     </select>
                  </div>
                </div>

                {loadingHeatmap ? (
                  <div className="grid grid-cols-5 gap-1.5 mb-6">
                    {Array(10).fill(0).map((_,i) => <div key={i} className={`rounded-lg h-[80px] animate-pulse ${isDark?'bg-white/5':'bg-slate-200'}`}/>)}
                  </div>
                ) : (() => {
                   // ── helper: color ──
                    const getBg = (changePct, rawPct) => {
                      if (hmColor === 'redGreen') {
                        if (changePct > 3)  return '#00c851';    
                        if (changePct > 1.5) return '#00a040';  
                        if (changePct > 0)  return '#28a745';  
                        if (changePct > -1.5) return '#e53935'; 
                        if (changePct > -3) return '#c62828';  
                        return '#8b0000';                        
                      }
                      return rawPct > 15 ? '#2563eb' : rawPct > 5 ? '#1d4ed8' : '#1e3a8a';
                    };
                  //polygon layout
                   if (hmShape === 'polygon') {
                    const minWeight = Math.min(...hmData.map(d => d.weight));
                    const maxWeight = Math.max(...hmData.map(d => d.weight));
                    const scaleHex = (w) => {
                      if (maxWeight === minWeight) return 130;
                      return 80 + 120 * Math.sqrt((w - minWeight) / (maxWeight - minWeight));
                    };
                    const items = hmData.map(d => ({ ...d, size: scaleHex(d.weight) }));
                    
                    const CX = 500, CY = 300;
                    const placed = [];
                    const hexOverlaps = (nx, ny, ns) => placed.some(p => {
                      const minDist = (p.size + ns) * 0.55;
                      return Math.hypot(p.cx - nx, p.cy - ny) < minDist;
                    });
                    
                    items.forEach((item, idx) => {
                      if (idx === 0) { placed.push({ ...item, cx: CX, cy: CY }); return; }
                      let angle = (idx % 2) * Math.PI, dist = (items[0].size + item.size) * 0.55 + 6;
                      let found = false;
                      while (!found && dist < 700) {
                        const nx = CX + Math.cos(angle) * dist;
                        const ny = CY + Math.sin(angle) * dist;
                        if (!hexOverlaps(nx, ny, item.size)) {
                          placed.push({ ...item, cx: nx, cy: ny });
                          found = true;
                        }
                        angle += 0.18;
                        if (angle > Math.PI * 6) { angle = 0; dist += item.size * 0.4 + 10; }
                      }
                      if (!found) placed.push({ ...item, cx: CX + 20 * idx, cy: CY + 20 * idx });
                    });
                    
                    const xs = placed.map(p => p.cx - p.size * 0.6);
                    const ys = placed.map(p => p.cy - p.size * 0.55);
                    const xe = placed.map(p => p.cx + p.size * 0.6);
                    const ye = placed.map(p => p.cy + p.size * 0.55);
                    const minX = Math.min(...xs) - 10, minY = Math.min(...ys) - 10;
                    const totalW = Math.max(...xe) - minX + 10, totalH = Math.max(...ye) - minY + 10;
                    
                    return (
                      <div className="mb-8 flex justify-center overflow-x-auto">
                        <div style={{ position: 'relative', width: totalW, height: totalH }}>
                          {placed.map((item) => {
                            const color = getBg(item.changePct, hmTotal > 0 ? (item.weight / hmTotal) * 100 : 0);
                            const w = item.size, h = item.size * 0.9;
                            const fs = Math.max(9, Math.min(15, item.size * 0.1));
                            return (
                              <div key={item.id}
                                onClick={() => { if (heatmapView === 'sectors') { setHeatmapSector(item.name); setHeatmapView('stocks'); } else { setInput(item.name); fetchMarketData(item.name); }}}
                                onMouseEnter={(e) => setHmHovered({ id: item.id, name: item.name, fullName: item.fullName || item.name, x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setHmHovered(null)}
                                onMouseMove={(e) => setHmHovered(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                                style={{
                                  position: 'absolute',
                                  left: item.cx - w / 2 - minX, top: item.cy - h / 2 - minY,
                                  width: w, height: h,
                                  clipPath: 'polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%)',
                                  background: color, cursor: 'pointer',
                                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                  transition: 'filter 0.15s, transform 0.15s',
                                }}
                                className="hover:brightness-125 hover:scale-105 hover:z-10"
                              >
                                <span style={{ fontSize: fs, fontWeight: 900, color: '#fff', lineHeight: 1.2, padding: '0 10px', textShadow: '0 1px 3px rgba(0,0,0,0.5)', textAlign: 'center' }}>{item.name}</span>
                                <span style={{ fontSize: fs + 1, fontWeight: 900, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)', marginTop: 3 }}>{item.changePct >= 0 ? '+' : ''}{item.changePct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                  //circle layout
                  if (hmShape === 'circle') {
                    const minW = Math.min(...hmData.map(d => d.weight));
                    const maxW = Math.max(...hmData.map(d => d.weight));
                     const scaleR = (w) => {
                      if (maxW === minW) return 70;
                      return 30 + 90 * Math.sqrt((w - minW) / (maxW - minW)); 
                    };
                    const items = hmData.map(d => ({ ...d, r: scaleR(d.weight) }));
                    
                     const CX = 500, CY = 280;  
                    const placed = [];
                    const overlaps = (nx, ny, nr) => placed.some(p => Math.hypot(p.cx - nx, p.cy - ny) < p.r + nr + 4);
                    
                    items.forEach((item, idx) => {
                      if (idx === 0) { placed.push({ ...item, cx: CX, cy: CY }); return; }
                      let angle = 0, dist = items[0].r + item.r + 6;
                      let found = false;
                      while (!found && dist < 600) {
                        const nx = CX + Math.cos(angle) * dist;
                        const ny = CY + Math.sin(angle) * dist;
                        if (!overlaps(nx, ny, item.r)) {
                          placed.push({ ...item, cx: nx, cy: ny });
                          found = true;
                        }
                        angle += 0.2;
                        if (angle > Math.PI * 2) { angle = 0; dist += item.r * 0.5 + 8; }
                      }
                      if (!found) placed.push({ ...item, cx: CX + dist * Math.cos(idx), cy: CY + dist * Math.sin(idx) });
                    });
                    
                    const xs = placed.map(p => p.cx - p.r), ys = placed.map(p => p.cy - p.r);
                    const xe = placed.map(p => p.cx + p.r), ye = placed.map(p => p.cy + p.r);
                    const minX = Math.min(...xs) - 10, minY = Math.min(...ys) - 10;
                    const totalW = Math.max(...xe) - minX + 10, totalH = Math.max(...ye) - minY + 10;
                    
                    return (
                      <div className="mb-8 flex justify-center overflow-x-auto">
                        <div style={{ position: 'relative', width: totalW, height: totalH }}>
                          {placed.map((item) => {
                            const color = getBg(item.changePct, hmTotal > 0 ? (item.weight / hmTotal) * 100 : 0);
                            const d = item.r * 2;
                            const fs = Math.max(9, Math.min(15, item.r * 0.24));
                            return (
                              <div key={item.id}
                                onClick={() => { if (heatmapView === 'sectors') { setHeatmapSector(item.name); setHeatmapView('stocks'); } else { setInput(item.name); fetchMarketData(item.name); }}}
                                onMouseEnter={(e) => setHmHovered({ id: item.id, name: item.name, fullName: item.fullName || item.name, x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setHmHovered(null)}
                                onMouseMove={(e) => setHmHovered(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                                style={{
                                  position: 'absolute',
                                  left: item.cx - item.r - minX, top: item.cy - item.r - minY,
                                  width: d, height: d, borderRadius: '50%', background: color,
                                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', border: '2px solid rgba(255,255,255,0.15)',
                                  boxShadow: `0 6px 30px ${color}66`, transition: 'filter 0.15s, transform 0.15s',
                                }}
                                className="hover:brightness-125 hover:scale-105 hover:z-10"
                              >
                                <span style={{ fontSize: fs, fontWeight: 900, color: '#fff', textAlign: 'center', padding: '0 8px', lineHeight: 1.2, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{item.name}</span>
                                <span style={{ fontSize: fs + 1, fontWeight: 900, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.7)', marginTop: 2 }}>{item.changePct >= 0 ? '+' : ''}{item.changePct}%</span>
                                {item.r > 50 && <span style={{ fontSize: Math.max(8, fs - 3), color: 'rgba(255,255,255,0.65)' }}>{(item.price || 0).toLocaleString('vi-VN')}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                   // ── RECTANGLE (treemap-style với proportional sizing) ──
                   return (
                     <div className="flex flex-wrap gap-1 mb-8 content-start" style={{ minHeight: '220px' }}>
                       {hmData.map(item => {
                         const rawPct = hmTotal > 0 ? (item.weight / hmTotal) * 100 : 0;
                          const pctWidth = Math.max(rawPct, 4);
                         const color = getBg(item.changePct, rawPct);
                          const minH = 60, maxH = 160;
                         const minW = Math.min(...hmData.map(d => d.weight));
                         const maxW = Math.max(...hmData.map(d => d.weight));
                         const heightPx = maxW === minW ? 100 : minH + (maxH - minH) * ((item.weight - minW) / (maxW - minW));
                         return (
                           <div
                             key={item.id}
                              onMouseEnter={(e) => setHmHovered({ 
                                id: item.id, 
                                name: item.name, 
                                fullName: item.fullName || item.name,
                                x: e.clientX, y: e.clientY 
                              })}
                              onMouseLeave={() => setHmHovered(null)}
                              onMouseMove={(e) => setHmHovered(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}  
                              onClick={() => { if (heatmapView === 'sectors') { setHeatmapSector(item.name); setHeatmapView('stocks'); } }}
                             onDoubleClick={() => { if (heatmapView === 'stocks') { setInput(item.name); fetchMarketData(item.name); } }}
                             style={{ width: `calc(${pctWidth}% - 4px)`, minHeight: heightPx, background: color, flexGrow: 1 }}
                             className="text-white rounded-md p-2 flex flex-col justify-between cursor-pointer hover:brightness-125 transition-all border border-black/10 shadow-sm group animate-in fade-in zoom-in-95 overflow-hidden active:scale-95"
                           >
                             <div className="flex flex-col relative z-10">
                               <span className="text-[11px] md:text-sm font-black uppercase leading-tight truncate drop-shadow-md">{item.name}</span>
                               {heatmapView === 'stocks' && <span className="text-[8px] font-medium opacity-80 truncate hidden md:block leading-tight mt-0.5 max-w-full drop-shadow-md">{item.fullName}</span>}
                             </div>
                             <div className="flex flex-col mt-1 relative z-10">
                               <span className="text-sm md:text-base font-black drop-shadow-md">{item.changePct >= 0 ? '+' : ''}{item.changePct}%</span>
                               {heatmapView === 'stocks' && <span className="text-[9px] font-bold opacity-80 drop-shadow-md">{(item.price || 0).toLocaleString('vi-VN')}</span>}
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   );
                })()}

                {heatmapView === 'sectors' && heatmapData.some(s => s.watchlist?.length > 0) && (
                  <>
                    <h2 className={`text-sm font-black tracking-widest uppercase mb-3 ${UI.textBold}`}>
                      Mã Tiềm Năng (Dòng Tiền Đột Biến) <span className="text-yellow-500">⚡</span>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                      {heatmapData
                        .flatMap(sec => (sec.watchlist || []).map(s => ({ ...s, sector: sec.name })))
                        .sort((a,b) => b.changePct - a.changePct)
                        .slice(0, 10)
                        .map((s, i) => (
                          <div key={i}
                            onClick={() => { setInput(s.sym); fetchMarketData(s.sym); }}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02]
                              ${isDark ? 'bg-[#10151C] border-white/5 hover:bg-white/10' : 'bg-white border-slate-200 hover:bg-gray-50'}`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-yellow-400 font-black text-lg w-10">{s.sym}</span>
                              <div className="flex flex-col">
                                  <span className={`text-[10px] font-bold truncate max-w-[140px] lg:max-w-[180px] ${UI.textNormal}`}>
                                      {allStocks.find(stock => stock.symbol === s.sym)?.companyName || 'Đang cập nhật...'}
                                  </span>
                                  <span className={`text-[8px] font-bold mt-0.5 ${UI.textMuted}`}>
                                      Ngành: {s.sector}
                                  </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-emerald-400 font-black text-sm">+{s.changePct}%</p>
                              <p className={`text-[10px] font-bold ${UI.textMuted}`}>{(s.price).toLocaleString('vi-VN')}</p>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </>)}
                   {/* MÃ GIẢM SÂU */}
                {heatmapView === 'sectors' && heatmapData.some(s => s.droplist?.length > 0) && (
                  <>
                    <h2 className={`text-sm font-black tracking-widest uppercase mb-3 mt-6 ${UI.textBold}`}>
                      Mã Giảm Sâu (Cảnh Báo Dòng Tiền) <span className="text-red-500">⚠️</span>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                      {heatmapData
                        .flatMap(sec => (sec.droplist || []).map(s => ({ ...s, sector: sec.name })))
                        .sort((a,b) => a.changePct - b.changePct)    
                        .slice(0, 10)
                        .map((s, i) => (
                          <div key={i}
                            onClick={() => { setInput(s.sym); fetchMarketData(s.sym); }}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02]
                              ${isDark ? 'bg-[#10151C] border-red-500/10 hover:bg-red-500/5' : 'bg-white border-red-200 hover:bg-red-50'}`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-red-400 font-black text-lg w-10">{s.sym}</span>
                              <div className="flex flex-col">
                                <span className={`text-[10px] font-bold truncate max-w-[140px] lg:max-w-[180px] ${UI.textNormal}`}>
                                  {allStocks.find(stock => stock.symbol === s.sym)?.companyName || 'Đang cập nhật...'}
                                </span>
                                <span className={`text-[8px] font-bold mt-0.5 ${UI.textMuted}`}>
                                  Ngành: {s.sector}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-red-400 font-black text-sm">{s.changePct}%</p>
                              <p className={`text-[10px] font-bold ${UI.textMuted}`}>{(s.price).toLocaleString('vi-VN')}</p>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </>
                )}
              </div>

              {/* TOOLTIP OVERLAY */}
                {hmHovered && (
                  <div style={{
                    position: 'fixed', left: hmHovered.x + 14, top: hmHovered.y - 10,
                    zIndex: 9999, pointerEvents: 'none',
                    background: isDark ? '#1a1f2e' : '#fff',
                    border: '1px solid rgba(250,204,21,0.4)',
                    borderRadius: 10, padding: '8px 14px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                    maxWidth: 240,
                  }}>
                    <p style={{ fontWeight: 900, fontSize: 13, color: '#facc15', marginBottom: 2 }}>{hmHovered.name}</p>
                    <p style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#475569', lineHeight: 1.4 }}>{hmHovered.fullName}</p>
                  </div>
              )}
              </>
              );
             })()}
           </div>      
          )} 

          {analyzing && (() => {
            const STEP_PROGRESS = {
              '🔍 Khởi tạo engine phân tích...':               5,
              '📄 Đang tải báo cáo tài chính PDF...':          12,
              '📊 Phân tích bảng cân đối kế toán...':          25,
              '💰 Phân tích kết quả kinh doanh (P&L)...':      38,
              '🔄 Phân tích lưu chuyển tiền tệ...':            50,
              '📈 Tính toán chỉ số tài chính (ROE, P/E, EPS...)': 62,
              '📰 Phân tích tin tức & sentiment thị trường...': 72,
              '🕯️ Phân tích kỹ thuật (MACD, RSI, Bollinger)...': 80,
              '🏭 So sánh với trung bình ngành...':             88,
              '🧠 AI tổng hợp & sinh báo cáo chiến lược...':   93,
              '✍️ Đang viết khuyến nghị đầu tư...':            97,
            };
            const syncedProgress = STEP_PROGRESS[analysisStep] ?? 3;

            return (
              <div className={`h-full rounded-[40px] border shadow-xl overflow-y-auto flex flex-col items-center px-8 pt-14 pb-12 ${UI.card}`}>
                <div className="flex flex-col items-center w-full max-w-sm gap-5">

                {/* Fact / Quiz card */}
                <div
                  className={`w-full rounded-2xl border transition-all duration-300 ${cardFlip ? 'opacity-0 scale-95' : 'opacity-100 scale-100'} ${isDark ? 'bg-white/5 border-green-500/20' : 'bg-slate-50 border-green-200'}`}
                >
                  {loadingCard.type === 'fact' ? (
                    <div className="p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{loadingCard.icon}</span>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>Bạn có biết?</span>
                      </div>
                      <p className={`text-sm leading-relaxed font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{loadingCard.text}</p>
                    </div>
                  ) : (
                    <div className="p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{loadingCard.icon}</span>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-green-400' : 'text-green-600'}`}>Câu hỏi nhanh</span>
                      </div>
                      <p className={`text-sm font-bold leading-snug ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{loadingCard.question}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {loadingCard.options.map((opt, i) => {
                          const isCorrect = i === loadingCard.answer;
                          const isSelected = quizSelected === i;
                          const revealed = quizSelected !== null;
                          let cls = `text-[11px] font-bold px-3 py-2 rounded-xl border text-left transition-all cursor-pointer `;
                          if (!revealed) cls += isDark ? 'border-white/10 text-slate-400 hover:border-yellow-400/50 hover:text-yellow-300' : 'border-slate-200 text-slate-500 hover:border-yellow-400 hover:text-yellow-700';
                          else if (isCorrect) cls += 'border-emerald-500 bg-emerald-500/15 text-emerald-400';
                          else if (isSelected) cls += 'border-red-500 bg-red-500/10 text-red-400';
                          else cls += isDark ? 'border-white/5 text-slate-600' : 'border-slate-100 text-slate-400';
                          return (
                            <button key={i} className={cls} onClick={() => {
                              setQuizSelected(i);
                              setTimeout(() => advanceCard(pickUnseen(VN_QUIZ_ONLY, shownQuizIndicesRef.current)), 1800);
                            }} disabled={revealed}>
                              {revealed && isCorrect ? '✓ ' : revealed && isSelected ? '✗ ' : ''}{opt}
                            </button>
                          );
                        })}
                      </div>
                      {quizSelected !== null && (
                        <p className={`text-[11px] font-bold ${quizSelected === loadingCard.answer ? 'text-emerald-400' : 'text-red-400'}`}>
                          {quizSelected === loadingCard.answer ? '🎉 Chính xác!' : `❌ Đáp án đúng: ${loadingCard.options[loadingCard.answer]}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {/* Hint text */}
                <p className={`text-[9px] font-medium tracking-widest  text-center ${isDark ? 'italic text-slate-600' : 'text-slate-400'}`}>
                  {loadingCard.type === 'fact' ? 'Đang lấy dữ liệu phân tích ai' : 'Chọn đáp án để tiếp tục'}
                </p>

                {/* Divider */}
                <div className={`w-full h-px ${isDark ? 'bg-white/5' : 'bg-slate-200'}`} />

                {/* AtomLoader */}
                <AtomLoader
                  message={analysisStep || 'OMNI DUCK ĐANG TƯ DUY...'}
                  progress={syncedProgress}
                />

                </div>{/* end inner cluster */}
              </div>
            );
          })()}

          {/* AI ERROR STATE */}
          {!analyzing && aiError && !aiReport && (
            <div className={`h-full rounded-[40px] border flex flex-col items-center justify-center px-10 shadow-xl ${UI.card}`}>
              <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-6 ${isDark ? 'bg-red-500/15' : 'bg-red-50'}`}>
                <span className="text-3xl">\u26a0\ufe0f</span>
              </div>
              <h2 className={`font-black text-sm tracking-[0.2em] uppercase mb-3 ${isDark ? 'text-red-400' : 'text-red-600'}`}>Ph\u00e2n t\u00edch th\u1ea5t b\u1ea1i</h2>
              <p className={`text-center text-sm leading-relaxed mb-6 max-w-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{aiError}</p>
              <button
                onClick={() => { handleAiAnalysis(true); }}
                className={`px-6 py-2.5 rounded-xl font-black text-xs tracking-widest uppercase transition-all active:scale-95 border ${isDark ? 'border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/10' : 'border-yellow-500 text-yellow-600 hover:bg-yellow-50'}`}
              >
                \u21bb Th\u1eed l\u1ea1i
              </button>
            </div>
          )}

          {aiReport && (
            <div className={`w-full border rounded-[40px] p-10 shadow-2xl transition-colors duration-300 relative overflow-hidden ${isDark ? 'bg-[#10151C] border-yellow-400/20' : 'bg-white border-yellow-400/40'}`}>
            {actionData && (
              <div className={`mb-10 p-6 rounded-2xl border-2 shadow-lg relative overflow-hidden ${
                  actionData.action.includes('MUA') ? 'border-emerald-500 bg-emerald-500/10' : 
                  actionData.action.includes('BÁN') ? 'border-red-500 bg-red-500/10' : 'border-yellow-500 bg-yellow-500/10'
              }`}>
                  <div className="absolute top-0 right-0 p-3 opacity-50">
                      {isUpdatingAction ? <div className="w-3 h-3 bg-yellow-400 rounded-full animate-ping"/> : <div className="w-3 h-3 bg-emerald-400 rounded-full"/>}
                  </div>
                  <div className="flex items-center gap-4 mb-4">
                      <div className={`px-4 py-1.5 rounded-lg font-black tracking-widest text-lg text-white shadow-lg ${
                          actionData.action.includes('MUA') ? 'bg-emerald-500 shadow-emerald-500/50' : 
                          actionData.action.includes('BÁN') ? 'bg-red-500 shadow-red-500/50' : 'bg-yellow-500 shadow-yellow-500/50'
                      }`}>
                          {actionData.action}
                      </div>
                      <span className={`font-black uppercase tracking-widest text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          Live Signal
                      </span>
                  </div>
                  
                  {/* KHUNG GIÁ NGẮN HẠN */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">ENTRY (Vào lệnh)</p>
                          <p className={`font-black text-lg ${UI.textBold}`}>{actionData.entry}</p>
                      </div>
                      <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                          <p className="text-[10px] text-red-400 font-black uppercase tracking-widest mb-1">STOPLOSS (Cắt lỗ)</p>
                          <p className={`font-black text-lg ${UI.textBold}`}>{actionData.stoploss}</p>
                      </div>
                      <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                          <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-1">TARGET (Chốt lời)</p>
                          <p className={`font-black text-lg ${UI.textBold}`}>{actionData.target}</p>
                          {/* HIỂN THỊ THỜI GIAN KỲ VỌNG  */}
                          {actionData.shortTermHorizon && (
                              <p className="text-[10px] text-slate-400 font-bold mt-1 italic">⏱ {actionData.shortTermHorizon}</p>
                          )}
                      </div>
                  </div>

                  {/* TIỂU PANEL DỰ PHÓNG DÀI HẠN */}
                  {actionData.longTermTarget && actionData.longTermTarget !== 'N/A' && (
                      <div className="mb-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 flex justify-between items-center">
                          <div>
                              <p className="text-[9px] text-yellow-500 font-black uppercase tracking-widest">Dự phóng Dài hạn (6-12 tháng)</p>
                              <p className={`text-base font-black mt-0.5 ${UI.textBold}`}>Mục tiêu: {actionData.longTermTarget} VNĐ</p>
                          </div>
                          <div className="text-right">
                              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Thời gian kỳ vọng</p>
                              <p className="text-sm font-black text-slate-300 mt-0.5">📅 {actionData.longTermHorizon || 'N/A'}</p>
                          </div>
                      </div>
                  )}

                  <p className={`text-sm font-bold italic ${UI.textNormal}`}>
                      Lý do: {actionData.reason}
                  </p>
              </div>
              
            )}
                    <div className={`flex flex-col lg:flex-row lg:items-center gap-5 mb-10 pb-8 border-b ${UI.border}`}>
                      <div className="w-16 h-16 rounded-3xl bg-yellow-400 text-black flex items-center justify-center shadow-xl shadow-yellow-400/20 shrink-0">
                        <Zap size={28} />
                      </div>
                      <div className="flex-1">
                        <h2 className={`text-3xl lg:text-4xl font-black tracking-tight uppercase ${UI.textBold}`}>Strategic Intelligence</h2>
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                            <p className="text-yellow-500 uppercase tracking-[0.3em] text-[10px] font-black">Omni Duck AI Framework</p>
                            
                            {/* BỘ ĐẾM THỜI GIAN AI */}
                            {aiAnalysisDuration && (
                                <div className={`flex items-center gap-3 px-3 py-1 rounded-full border text-[12px] font-black uppercase tracking-widest ${isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-600'}`}>
                                    <Clock size={13} /> Hoàn tất trong {aiAnalysisDuration} giây
                                </div>
                            )}
                        </div>
                      </div>
                    </div>
                  <div className={`prose max-w-none prose-headings:text-yellow-500 prose-headings:font-black prose-headings:italic prose-headings:uppercase prose-p:leading-loose prose-p:text-[16px] prose-strong:text-emerald-500 prose-strong:font-black prose-ul:list-disc prose-ul:pl-5 prose-li:mb-2 ${isDark ? 'prose-invert prose-p:text-slate-300 prose-li:text-slate-300' : 'prose-p:text-slate-700 prose-li:text-slate-700'}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{aiReport}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        {/* GRID COLUMN 3: EXCHANGES INDEX & RADAR PREVIEWS */}
        <div className={`w-[350px] lg:w-[450px] flex flex-col border-l transition-colors duration-300 ${UI.leftCol} pb-10`}> 
          <div className="h-1/2 flex flex-col border-b border-white/10">
            <div className="h-2/5 flex border-b border-white/10">
              <div className="flex-1 border-r border-white/10 p-3 flex flex-col">
                <span className="text-[9px] font-black text-yellow-500 mb-1">VN-INDEX</span>
                <div className="flex-1 min-h-0"><MarketRadar data={vnIndexData} theme={isDark ? 'dark' : 'light'} color="#facc15" /></div>
              </div>
              <div className="flex-1 p-3 flex flex-col">
                <span className="text-[9px] font-black text-sky-400 mb-1">HNX-INDEX</span>
                <div className="flex-1 min-h-0"><MarketRadar data={hnxIndexData} theme={isDark ? 'dark' : 'light'} color="#38bdf8" /></div>
              </div>
            </div>
            <div className="h-3/5 p-4 flex flex-col">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">VN30 Premium</span>
                <Activity size={14} className="text-emerald-500" />
              </div>
              <div className="flex-1 min-h-0 rounded-xl bg-black/20 border border-white/5 overflow-hidden">
                <MarketRadar data={vn30Data} theme={isDark ? 'dark' : 'light'} color="#10b981" />
              </div>
            </div>
          </div>

          <div className="h-1/2 flex flex-col overflow-hidden">
            <div className={`h-10 border-b flex items-center justify-between px-4 shrink-0 ${UI.header}`}>
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-yellow-500" />
                <span className={`text-[10px] font-black uppercase tracking-widest ${UI.textBold}`}>TCBS Analysis</span>
              </div>
              {marketData?.reportPdf && (
                <button 
                   onClick={() => setShowPdfModal(true)}
                   className="text-[10px] font-black tracking-widest bg-yellow-400 text-black px-4 py-1.5 rounded-full hover:bg-yellow-300 shadow-lg transition-all active:scale-95"
                >
                   OPEN PDF
                </button>
              )}
            </div>
            
            <div className={`flex-1 relative ${isDark ? 'bg-[#242424]' : 'bg-slate-100'}`}>
              {marketData?.reportPdf ? (
                <iframe src={`${marketData.reportPdf}#toolbar=1&navpanes=0&scrollbar=1`} className="w-full h-full border-none" title="TCBS Report Viewer" />
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-20">
                  <FileText size={32} className="mb-2" />
                  <p className="text-[9px] font-black uppercase">Waiting for Data</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <StockAiChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        ticker={marketData?.stockInfo?.symbol || ''}
        companyName={
          marketData?.companyProfile?.companyName ||
          marketData?.stockInfo?.companyName || ''
        }
        aiReport={aiReport}
        isDark={isDark}
        currentUser={currentUser}
      />
 
    </>
  );
}