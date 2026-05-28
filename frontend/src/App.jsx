import React, { useEffect, useState, useRef, useCallback } from 'react'
import './App.css'
import axios from 'axios'
import { X, FileText} from 'lucide-react'
//// import components
import AppHeader from './components/AppHeader';
import CryptoTab from './components/CryptoTab';
import PaperTradingTab from './components/PaperTradingTab';
import VnStocksTab from './components/VnStocksTab';
import AuthScreen from './components/AuthScreen';
import DerivativesTab from './components/DerivativesTab';
import DraggableLog from './components/DraggableLog';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

axios.defaults.baseURL = API_BASE_URL;

axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';

function App() {
  // CONFIG: USER STATE & AUTH MANAGEMENT
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('omni_user') || null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [authForm, setAuthForm] = useState({ username: '', password: '', isRegister: false });

// CONFIG: THEME ENGINE
const [theme, setTheme] = useState(() => {
  const savedTheme = localStorage.getItem(`omni_theme_${currentUser}`);
  return savedTheme || 'dark';
});
const isDark = theme === 'dark';

const handleToggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    setTheme(newTheme);
    if (currentUser) {
        localStorage.setItem(`omni_theme_${currentUser}`, newTheme);
    }
  };
  // LOGIC: AUTHENTICATION HANDLERS
  const [authError, setAuthError] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('omni_user');
    setCurrentUser(null);
    setShowUserMenu(false);
    setMarketData(null); 
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError(''); 

    const { username, password, isRegister } = authForm;
    let cleanUsername = username.trim();

    if (cleanUsername.length < 3) {
      setAuthError('Tên truy cập phải có ít nhất 3 ký tự!');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setAuthError('Tên truy cập không được chứa dấu cách hoặc ký tự đặc biệt!');
      return;
    }
    if (password.length < 6) {
      setAuthError('Mật khẩu bảo mật phải có từ 6 ký tự trở lên!');
      return;
    }

    try {
      if (isRegister) {
        const res = await axios.post('/api/auth/register', { username: cleanUsername, password });
        if (res.data.success) {
          setAuthForm(prev => ({ ...prev, isRegister: false }));
          setAuthError('Đăng ký thành công! Hãy ấn lại nút đăng nhập để truy cập hệ thống.');
        }
      } else {
        const res = await axios.post('/api/auth/login', { username: cleanUsername, password });
        if (res.data.success) {
          localStorage.setItem('omni_user', res.data.username);
          setCurrentUser(res.data.username);
        }
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || 'Lỗi kết nối đến cổng Auth của máy chủ!';
      setAuthError(errorMsg);
    }
  };

  // LOGIC: INTERACTION INTERFACES
  const [isManualTwitch, setIsManualTwitch] = useState(false);
  const handleCatClick = () => {
    setIsManualTwitch(true);
    setTimeout(() => setIsManualTwitch(false), 500);
  };

  const handleGoHome = () => {
    //[FIX] Close chat before going home
    vnStocksCloseChatRef.current?.();
    setMarketData(null);
    setChartData(null);
    setAiReport(null);
    setInput('');
    if (currentUser) fetchUserHistory();
  };
  const [derivChartData, setDerivChartData] = useState(null);
  const [derivInterval, setDerivInterval] = useState('5 phút');
  const [derivRadar, setDerivRadar] = useState(null);

  const [activeMode, setActiveMode] = useState(() => {
    return localStorage.getItem('lastActiveMode') || 'VN_STOCKS';
});
useEffect(() => {
    if (activeMode) {
        localStorage.setItem('lastActiveMode', activeMode);
    }
}, [activeMode]);

  const [demoPosition, setDemoPosition] = useState(0);       
  const [demoEntryPrice, setDemoEntryPrice] = useState(0);    
  const [demoVolume, setDemoVolume] = useState(1);
  const [marketIntel, setMarketIntel] = useState(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [actionData, setActionData] = useState(null);
  const [isUpdatingAction, setIsUpdatingAction] = useState(false);
  const [input, setInput] = useState('');
  const [allStocks, setAllStocks] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSymbols, setLoadingSymbols] = useState(false);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [showExtraStats, setShowExtraStats] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('');
  
  const eventSourceRef = useRef(null);
  const lastActionPriceRef = useRef(null); 
  const lastNewsCountRef = useRef(0);
  // [FIX] Ref to close VnStocks chat when switching tab /home
  const vnStocksCloseChatRef = useRef(null);
  
  const [showLogs, setShowLogs] = useState(false);
  const [showVolInfo, setShowVolInfo] = useState(false);
  const [showLeaderInfo, setShowLeaderInfo] = useState(false);

  const [fetchProgress, setFetchProgress] = useState(0);
  const [loadingAiNews, setLoadingAiNews] = useState(false);
  const [marketData, setMarketData] = useState(null);
  const [aiReport, setAiReport] = useState(null);
  const [aiAnalysisDuration, setAiAnalysisDuration] = useState(null);
  const [logs, setLogs] = useState([]);
  const [chartData, setChartData] = useState(null);
  const [vnIndexData, setVnIndexData] = useState([]);
  const [activeInterval, setActiveInterval] = useState('1 ngày');
  const [hnxIndexData, setHnxIndexData] = useState([]);
  const [vn30Data, setVn30Data] = useState([]);
  const [errorAlert, setErrorAlert] = useState('');
  const [userHistory, setUserHistory] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);  
  const [expandedSymbol, setExpandedSymbol] = useState(null);
  const [lastAiVnTime, setLastAiVnTime] = useState(null);
  const [lastAiVnSnapshot, setLastAiVnSnapshot] = useState(null);
  // STATE AI PHÁI SINH VN
  const [aiDerivReport, setAiDerivReport] = useState(null);
  const [analyzingDeriv, setAnalyzingDeriv] = useState(false);
  const [derivNews, setDerivNews] = useState([]);
  const [lastNewsSave, setLastNewsSave] = useState('');
  const [refreshingNews, setRefreshingNews] = useState(false);
  const [exportingDeriv, setExportingDeriv] = useState(false);
  const [macroContext, setMacroContext] = useState(null);
   
  const [lastAiDerivTime, setLastAiDerivTime]       = useState(null);  
  const [lastAiDerivSnapshot, setLastAiDerivSnapshot] = useState(null);

// =========================================================
  // STATE & LOGIC: ĐẦU TƯ GIẢ LẬP (PAPER TRADING)
  // =========================================================
  const [portfolio, setPortfolio] = useState(null);
  const [paperMarket, setPaperMarket] = useState('VN_STOCKS'); 
  const [paperSymbol, setPaperSymbol] = useState('');  
  const [paperSearchInput, setPaperSearchInput] = useState('');  
  const [paperVolume, setPaperVolume] = useState(10000);
  const [paperChartData, setPaperChartData] = useState(null);
  const [paperInterval, setPaperInterval] = useState('1 ngày');
  
  const [paperOrderType, setPaperOrderType] = useState('MP');  
  const [paperLimitPrice, setPaperLimitPrice] = useState('');
  const [paperSuggestions, setPaperSuggestions] = useState([]);
  const [showPaperSuggestions, setShowPaperSuggestions] = useState(false);
  const [showPaperHelp, setShowPaperHelp] = useState(false);
 
  // GỌI API LẤY TIN TỨC PHÁI SINH TAB ON
  useEffect(() => {
      if (activeMode === 'VN_DERIVATIVES') {
          addLog('[HỆ THỐNG] Đang kết nối Database tin tức Vĩ mô Phái sinh...');
          axios.get('/api/deriv-news')
              .then(res => { 
                  if (res.data.success) {
                      setDerivNews(res.data.data); 
                      addLog(`[THÀNH CÔNG] Nạp hoàn tất ${res.data.data.length} bản tin Vĩ mô.`);
                  } else {
                      addLog('[CẢNH BÁO] Kết nối thành công nhưng không có dữ liệu trả về.');
                  }
              })
              .catch(err => {
                  addLog(`[LỖI] Mất kết nối Trạm tin tức Phái sinh: ${err.message}`);
              });
      }
  }, [activeMode]);
    // GỌI LẤY TIN TỨC NGAY
  const handleRefreshDerivNews = async () => {
      setRefreshingNews(true);
      addLog('[HỆ THỐNG] Đang khởi chạy tiến trình quét dữ liệu vĩ mô...');
      try {
          const res = await axios.post('/api/deriv-news/refresh');
          if (res.data.success) {
              setDerivNews(res.data.data);
              setLastNewsSave(res.data.lastSave);
              addLog(`[THÀNH CÔNG] Cập nhật ma trận tin tức hoàn tất. Bản ghi: ${res.data.lastSave}`);
          }
      } catch (error) {
          addLog(`[LỖI] Không thể đồng bộ luồng quét tin: ${error.message}`);
      } finally {
          setRefreshingNews(false);
      }
  };
// LGOCI GỌI AI PHÁI SINH VN
const handleAiDerivAnalysis = async (forceRefresh = false) => {
    if (!derivRadar || !derivChartData) return addLog('[CẢNH BÁO] Trống dữ liệu phái sinh VN. AI từ chối phân tích.');
 
    const now = Date.now();
    const MIN_INTERVAL_MS = 5 * 60 * 1000;  
 
    const currentSnapshot = {
        score:       derivAnalysis.score,
        basis:       derivRadar.basisSpeed,
        totalImpact: (derivRadar.influencers||[]).reduce((s,x)=>s+(parseFloat(x.realImpact)||0),0).toFixed(2),
        oiTrend:     derivRadar.oiTrend,
    };
 
    const isSignificantChange = lastAiDerivSnapshot && (
        Math.abs((currentSnapshot.score        - lastAiDerivSnapshot.score))         >= 15  || 
        Math.abs((parseFloat(currentSnapshot.basis)       - parseFloat(lastAiDerivSnapshot.basis)))       >= 1.5 || 
        Math.abs((parseFloat(currentSnapshot.totalImpact) - parseFloat(lastAiDerivSnapshot.totalImpact))) >= 1.0 || 
        currentSnapshot.oiTrend !== lastAiDerivSnapshot.oiTrend                                             
    );
 
    const timeSinceLast = lastAiDerivTime ? now - lastAiDerivTime : Infinity;
    const enoughTimeElapsed = timeSinceLast >= MIN_INTERVAL_MS;
 
if (!forceRefresh && aiDerivReport && !isSignificantChange && !enoughTimeElapsed) {
        const remainSec = Math.round((MIN_INTERVAL_MS - timeSinceLast) / 1000);
        addLog(`[AI CACHE] Sử dụng báo cáo Phái sinh đã lưu. Thử lại sau ${remainSec}s.`);
        return;
    }
    setAnalyzingDeriv(true);
    addLog('[HỆ THỐNG] Đang đóng gói dữ liệu Phái sinh đa chiều cho AI...');
    try {
        const payload = {
            currentF1M:  derivRadar.vn30f1m,
            vn30:        derivRadar.vn30,
            basis:       derivRadar.basis,
            speed:       derivRadar.basisSpeed,
            poc:         volumeProfile?.pocPrice || 0,
            pocDistance: (((derivRadar.vn30f1m - volumeProfile?.pocPrice) / volumeProfile?.pocPrice) * 100).toFixed(2),
            oi:          derivRadar.oi,
            oiTrend:     derivRadar.oiTrend,
            fNet:        derivRadar.foreignNet,
            ema3:        derivAnalysis.ema3,
            ema8:        derivAnalysis.ema8,
            atr:         derivAnalysis.atr,
            totalImpact: currentSnapshot.totalImpact,
            score:       derivAnalysis.score,
            mechTrend:   derivAnalysis.mechTrend,
            mechAction:  derivAnalysis.mechAction,
            rrRatio:     derivAnalysis.rrRatio,
            sl:          derivAnalysis.sl,
            tp1:         derivAnalysis.tp1,
            tp2:         derivAnalysis.tp2,
            newsHeadlines: (derivNews || []).slice(0, 5).map(n => `[${n.sentiment}] ${n.title}`).join('\n'),
        };
 
        const res = await axios.post('/api/analyze-derivatives', payload);
        if (res.data.success) {
            setAiDerivReport(res.data.data);       
            setLastAiDerivTime(now);                
            setLastAiDerivSnapshot(currentSnapshot);  
        }

    } catch (err) {
        addLog('AI Derivatives error: ' + err.message);
    } finally {
        setAnalyzingDeriv(false);
    }
};
const handleExportDeriv = async () => {
    if (!derivRadar || !derivChartData) return addLog('[LỖI] Chưa có dữ liệu Phái sinh để xuất tệp.');
    setExportingDeriv(true);
    addLog('[EXPORT] Đang tổng hợp dữ liệu chuẩn bị xuất tệp...');
    try {
        const res = await axios.post('/api/deriv-export', {
            derivRadar,
            derivAnalysis,
            volumeProfile,
            derivChartData,
            derivInterval,
        });
 
        if (res.data.success) {
            const blob = new Blob(
                [JSON.stringify(res.data.data, null, 2)],
                { type: 'application/json' }
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const now = new Date();
            const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
            a.download = `VN30F1M_export_${stamp}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (res.data.data?.macroContext) setMacroContext(res.data.data.macroContext);
            const summary = res.data.data.newsSentimentSummary;
          addLog(`[EXPORT] Xuất tệp hoàn tất. Tổng hợp ${summary.total} tin và ${(derivChartData||[]).length} nến.`);
        }

    } catch (err) {
        addLog(`[LỖI] Quá trình Export thất bại: ${err.message}`);
    } finally {
        setExportingDeriv(false);
    }
};
  
   useEffect(() => {
      if (currentUser && activeMode === 'PAPER_TRADING') {
          axios.get(`/api/portfolio/${currentUser}`)
              .then(res => { if(res.data.success) setPortfolio(res.data.data); })
              .catch(err => console.error("Lỗi tải ví ảo:", err));
      }
  }, [currentUser, activeMode]);

   useEffect(() => {
      setPaperSymbol('');
      setPaperSearchInput('');
      setPaperChartData(null);
  }, [paperMarket]);

   useEffect(() => {
      if (!paperSearchInput.trim() || activeMode !== 'PAPER_TRADING') {
          setPaperSuggestions([]);
          return;
      }
      const keyword = paperSearchInput.trim().toUpperCase();
      const filtered = allStocks.filter(stock => 
          (stock.symbol?.toUpperCase() || '').includes(keyword)
      ).slice(0, 10);
      setPaperSuggestions(filtered);
  }, [paperSearchInput, allStocks, activeMode]);

   const executePaperSearch = (symbolToSearch) => {
      if (!symbolToSearch) return;
      const cleanSymbol = symbolToSearch.toUpperCase();
      setPaperSymbol(cleanSymbol);
      setPaperSearchInput(cleanSymbol);
      setShowPaperSuggestions(false);
      
       axios.get(`/api/history/${cleanSymbol}?interval=${paperInterval}`)
          .then(res => {
              if (res.data.success && res.data.data.length > 0) {
                  setPaperChartData(res.data.data);
                  addLog(`[DEMOTRADE] Đã tải dữ liệu realtime mã ${cleanSymbol}`);
              } else {
                  setPaperChartData(null);
                  setErrorAlert(`Không tìm thấy dữ liệu biểu đồ cho mã ${cleanSymbol}!`);
                  setTimeout(() => setErrorAlert(''), 3000);
              }
          }).catch(() => setPaperChartData(null));
  };

   useEffect(() => {
      if (paperSymbol) executePaperSearch(paperSymbol);
  }, [paperInterval]);

   const handlePaperTrade = async (type) => {
      if (!paperChartData || paperChartData.length === 0) {
          setErrorAlert("Chưa có dữ liệu giá realtime để khớp lệnh!");
          setTimeout(() => setErrorAlert(''), 3000); return;
      }
      
      let currentPrice = paperChartData[paperChartData.length - 1].close;
      if (paperMarket === 'VN_STOCKS' && currentPrice < 1000) currentPrice *= 1000;

       let executionPrice = currentPrice;
      if (paperOrderType === 'LO') {
          const limitVal = Number(paperLimitPrice);
          if (!limitVal || limitVal <= 0) {
              setErrorAlert("Vui lòng nhập giá đặt LO hợp lệ!");
              setTimeout(() => setErrorAlert(''), 3000); return;
          }
          executionPrice = limitVal; 
      }
      const isAssetMarketOpen = (paperMarket === 'CRYPTO' || paperMarket === 'GLOBAL') ? true : marketOpen;

      try {
          const res = await axios.post('/api/portfolio/trade', {
              username: currentUser,
              assetType: paperMarket,
              symbol: paperSymbol.toUpperCase(),
              type: type,
              orderType: paperOrderType, 
              volume: Number(paperVolume),
              price: executionPrice,
              isMarketOpen: isAssetMarketOpen
          });
          
          if (res.data.success) {
              setPortfolio(res.data.data);
              if (res.data.isPending) {
                  addLog(`[DEMOTRADE] Lệnh ${type} ${paperOrderType} ${paperSymbol} đã được đưa vào hàng đợi.`);
              } else {
                  addLog(`[DEMOTRADE] Đã khớp ${type} ${paperVolume} ${paperSymbol} tại giá ${executionPrice.toLocaleString('vi-VN')}`);
              }
          }
      } catch (error) {
          setErrorAlert(error.response?.data?.message || "Lỗi khớp lệnh!");
          setTimeout(() => setErrorAlert(''), 3000);
      }
  };
const handleCancelOrder = async (orderId) => {
      try {
          const res = await axios.post('/api/portfolio/cancel-order', {
              username: currentUser,
              orderId: orderId
          });
          if (res.data.success) {
              setPortfolio(res.data.data);
              addLog(`[DEMOTRADE] Đã hủy lệnh chờ thành công, giải phóng nguồn vốn.`);
          }
      } catch (error) {
          setErrorAlert(error.response?.data?.message || "Lỗi khi thực thi hủy lệnh!");
          setTimeout(() => setErrorAlert(''), 3000);
      }
  };
  // ================================================
// VOLUME PROFILE  
// ================================================
const volumeProfile = React.useMemo(() => {
    if (!derivChartData || derivChartData.length === 0) return null;
    
    const binsCount = 12;
    let minPrice = Math.min(...derivChartData.map(d => d.low));
    let maxPrice = Math.max(...derivChartData.map(d => d.high));
    
    if (maxPrice === minPrice) { 
        maxPrice += 1; 
        minPrice -= 1; 
    }
    
    const binSize = (maxPrice - minPrice) / binsCount;
    const bins = Array.from({ length: binsCount }, (_, i) => ({
        priceCenter: (minPrice + (i + 0.5) * binSize).toFixed(1),
        volume: 0
    }));

    let maxVol = 0;
    let pocPrice = 0;
    derivChartData.forEach(candle => {
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        const binIndex = Math.min(Math.floor((typicalPrice - minPrice) / binSize), binsCount - 1);
        
        if (binIndex >= 0 && binIndex < binsCount) {
            bins[binIndex].volume += candle.volume;
            if (bins[binIndex].volume > maxVol) {
                maxVol = bins[binIndex].volume;
                pocPrice = bins[binIndex].priceCenter;
            }
        }
    });

    return { bins: bins.reverse(), maxVol, pocPrice };
}, [derivChartData]);
  // ================================================
// DERIVATIVES ANALYSIS ENGINE  
// ================================================
const derivAnalysis = React.useMemo(() => {
    if (!derivChartData || derivChartData.length < 10 || !derivRadar) {
        return {
            score: 50,
            mechTrend: "ĐANG QUÉT...",
            mechAction: "QUAN SÁT",
            mechColor: "text-yellow-500",
            bgColor: "bg-yellow-500/10 border-yellow-500/30",
            currentF1M: derivRadar?.vn30f1m || 0,
            poc: 0,
            speed: 0,
            totalImpact: 0,
            oiUp: false,
            fNet: 0,
            atr: "3.5",
            sl: "0",
            tp1: "0",
            tp2: "0",
            rrRatio: "1.0",
            shortTermTrend: 0,
            ema3: "0.0",
            vwap: "0.0",
            sessionHigh: "0.0",
            sessionLow: "0.0",
            cvd: 0,
            roc5: "0.0",
            oiInterpretation: { label: 'ĐANG QUÉT...', color: 'text-slate-500' },
            ema8: "0.0"
        };
    }
    const currentF1M = derivRadar.vn30f1m || 0;
    const poc = derivRadar.poc || currentF1M;
    const speed = parseFloat(derivRadar.basisSpeed) || 0;
    const totalImpact = parseFloat(derivRadar.totalImpact || 0);
    const oiUp = derivRadar.oiTrend?.includes("TĂNG") || false;
    const fNet = derivRadar.foreignNet || 0;

    // === SHORT TERM TREND - EMA 3 vs EMA 8 ===
    const closes = derivChartData.slice(-12).map(c => c.close);
    const ema = (data, period) => {
        let result = data[0];
        const k = 2 / (period + 1);
        for (let i = 1; i < data.length; i++) {
            result = data[i] * k + result * (1 - k);
        }
        return result;
    };
    const ema3 = ema(closes, 3);
    const ema8 = ema(closes, 8);
    const shortTermTrend = ema3 > ema8 ? 1 : ema3 < ema8 ? -1 : 0;

    // === ATR ===
    const atr = derivChartData.slice(-5).reduce((sum, c, i, arr) => {
        if (i === 0) return sum;
        const tr = Math.max(
            c.high - c.low,
            Math.abs(c.high - arr[i-1].close),
            Math.abs(c.low - arr[i-1].close)
        );
        return sum + tr;
    }, 0) / 5 || 3.5;
    // VWAP
    const vwap = derivChartData.reduce((acc, c) => {
        const tp = (c.high + c.low + c.close) / 3;
        acc.tpv += tp * (c.volume || 1);
        acc.vol += (c.volume || 1);
        return acc;
    }, { tpv: 0, vol: 0 });
    const vwapPrice = vwap.vol > 0 ? (vwap.tpv / vwap.vol).toFixed(1) : currentF1M;

    // Session High / Low
    const sessionHigh = Math.max(...derivChartData.map(c => c.high));
    const sessionLow = Math.min(...derivChartData.map(c => c.low));

    // CVD (Cumulative Volume Delta)
    const cvd = derivChartData.reduce((sum, c) => {
        const delta = c.close >= c.open 
            ? (c.volume || 0) 
            : -(c.volume || 0);
        return sum + delta;
    }, 0);

    // ROC (Rate of Change 5 nến)
    const roc5 = derivChartData.length >= 6
        ? ((derivChartData.at(-1).close - derivChartData.at(-6).close) 
          / derivChartData.at(-6).close * 100).toFixed(2)
        : 0;

    // OI Interpretation
    const oiInterpretation = (() => {
        const priceUp = derivRadar?.change > 0;
        if (oiUp && priceUp)  return { label: 'LONG MỚI VÀO', color: 'text-emerald-500' };
        if (oiUp && !priceUp) return { label: 'SHORT MỚI VÀO', color: 'text-red-500' };
        if (!oiUp && priceUp) return { label: 'SHORT ĐANG ĐÓNG', color: 'text-emerald-300' };
        return { label: 'LONG ĐANG ĐÓNG', color: 'text-red-300' };
    })();

    // === CONFLUENCE SCORE 0-100 ===
    let score = 50;
    score += Math.min(Math.max(speed * 8, -25), 25);           
    score += Math.min(Math.max(totalImpact * 7, -20), 20);     
    score += oiUp ? 12 : -8;                                    
    score += Math.min(Math.max(fNet / 80, -18), 18);            
    score += currentF1M > poc ? 10 : -10;                      
    score = Math.round(Math.min(Math.max(score, 0), 100));

    // === MECHANICAL ACTION ===
    let mechTrend = "SIDEWAY";
    let mechAction = "QUAN SÁT";
    let mechColor = "text-yellow-500";
    let bgColor = "bg-yellow-500/10 border-yellow-500/30";

    if (score >= 68 && shortTermTrend === 1) {
        mechTrend = "BULLISH STRONG";
        mechAction = "CANH LONG";
        mechColor = "text-emerald-500";
        bgColor = "bg-emerald-500/10 border-emerald-500/30";
    } else if (score <= 32 && shortTermTrend === -1) {
        mechTrend = "BEARISH STRONG";
        mechAction = "CANH SHORT";
        mechColor = "text-red-500";
        bgColor = "bg-red-500/10 border-red-500/30";
    } else if (score >= 55 && shortTermTrend === 1) {
        mechTrend = "BULLISH BIAS";
        mechAction = "QUAN SÁT LONG";
        mechColor = "text-emerald-400";
        bgColor = "bg-emerald-500/10 border-emerald-500/30";
    } else if (score <= 45 && shortTermTrend === -1) {
        mechTrend = "BEARISH BIAS";
        mechAction = "QUAN SÁT SHORT";
        mechColor = "text-red-400";
        bgColor = "bg-red-500/10 border-red-500/30";
    }

    // === SL / TP / RR ===
    const sl = shortTermTrend === 1 
        ? currentF1M - atr * 1.5 
        : currentF1M + atr * 1.5;
    const tp1 = shortTermTrend === 1 
        ? currentF1M + atr * 1 
        : currentF1M - atr * 1;
    const tp2 = shortTermTrend === 1 
        ? currentF1M + atr * 2.2 
        : currentF1M - atr * 2.2;
    const rrRatio = (Math.abs(tp1 - currentF1M) / Math.abs(sl - currentF1M) || 1).toFixed(1);
    
    const mechReasonParts = [];
     // Basis
    if (Math.abs(speed) > 0.5) {
        mechReasonParts.push(
            speed > 0
                ? `Basis đang xé rộng nhanh (+${speed} đ/nhịp), F1M kéo xa Index`
                : `Basis đang thu hẹp nhanh (${speed} đ/nhịp), F1M kéo về Index`
        );
    }
     // EMA cross
    if (shortTermTrend === 1)  mechReasonParts.push(`EMA3 (${ema3.toFixed(1)}) cắt lên trên EMA8 (${ema8.toFixed(1)}) — xu hướng ngắn hạn tăng`);
    if (shortTermTrend === -1) mechReasonParts.push(`EMA3 (${ema3.toFixed(1)}) cắt xuống dưới EMA8 (${ema8.toFixed(1)}) — xu hướng ngắn hạn giảm`);
     // Lực trụ
    if (Math.abs(totalImpact) > 0.5) {
        mechReasonParts.push(
            totalImpact > 0
                ? `10 trụ dẫn dắt tổng lực +${totalImpact} điểm (hỗ trợ bên mua)`
                : `10 trụ dẫn dắt tổng lực ${totalImpact} điểm (áp lực bên bán)`
        );
    }
    // OI
    mechReasonParts.push(oiUp
        ? `OI tăng → dòng tiền mới đang vào thị trường`
        : `OI giảm → đang có làn sóng đóng vị thế`
    );
    // Khối ngoại
    if (Math.abs(fNet) > 100) {
        mechReasonParts.push(
            fNet > 0
                ? `Khối ngoại mua ròng +${fNet} HĐ (áp lực Long)`
                : `Khối ngoại bán ròng ${fNet} HĐ (áp lực Short)`
        );
    }
    // Giá vs POC
    const pocVal = parseFloat(poc) || currentF1M;
    const pocDist = ((currentF1M - pocVal) / pocVal * 100); 
    mechReasonParts.push(
        currentF1M > pocVal
            ? `Giá trên POC (${pocVal}) khoảng ${pocDist}% — vùng kẹt lệnh đang làm hỗ trợ`
            : `Giá dưới POC (${pocVal}) khoảng ${Math.abs(pocDist)}% — đang bị kháng cự từ vùng kẹt lệnh`
    );
    // Confluence score
    mechReasonParts.push(`Confluence Score tổng hợp: ${score}/100`);
 
    const mechReason = mechReasonParts.join('. ') + '.';

    return {
        score,
        mechTrend,
        mechAction,
        mechColor,
        bgColor,
        currentF1M,
        poc,
        speed,
        totalImpact,
        oiUp,
        fNet,
        atr: atr.toFixed(1),
        sl: sl.toFixed(1),
        tp1: tp1.toFixed(1),
        tp2: tp2.toFixed(1),
        rrRatio,
        shortTermTrend,
        ema3: ema3.toFixed(1),
         vwap: vwapPrice,
        sessionHigh: sessionHigh.toFixed(1),
        sessionLow: sessionLow.toFixed(1),
        cvd,
        roc5,
        oiInterpretation,
        ema8: ema8.toFixed(1),
        mechReason,  
        pocDistance: pocDist.toFixed(2) + '%',
    };
}, [derivChartData, derivRadar]);

  useEffect(() => {
    if (currentUser) fetchUserHistory();
  }, [currentUser]);

  const fetchUserHistory = async () => {
    if (!currentUser) return;
    try {
        const res = await axios.get(`/api/user-history/${currentUser}`);
        if (res.data.success) {
            setUserHistory(res.data.data); 
        }
    } catch (error) {
        console.error("Lỗi lấy lịch sử:", error);
    }
  };
  const fetchHeatmap = useCallback(async () => {
      setLoadingHeatmap(true);
      try {
          const res = await axios.get('/api/market-heatmap');
          if (res.data.success) setHeatmapData(res.data.data);
      } catch(e) {}
      finally { setLoadingHeatmap(false); }
  }, []);

  useEffect(() => {
      if (activeMode === 'VN_STOCKS') fetchHeatmap();
  }, [activeMode]);

  const [clock, setClock] = useState({ time: '00:00:00', ms: '000' });

  useEffect(() => {
    const updateTime = () => {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');

        setClock(prev => {
            const newTime = `${hh}:${mm}:${ss}`;
            //Only update when the seconds change to avoid constant re-rendering
            if (prev.time === newTime && prev.ms === ms) return prev;
            return { time: newTime, ms };
        });

        const day = now.getDay();
        const totalMinutes = now.getHours() * 60 + now.getMinutes();
        const isOpen = day >= 1 && day <= 5 && totalMinutes >= 540 && totalMinutes <= 900;
        setMarketOpen(isOpen);
    };

//Use setInterval instead of requestAnimationFrame — updating once per second is enough
    updateTime(); 
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchRadarData = async () => {
      axios.all([
        axios.get('/api/history/VNINDEX').catch(() => null),
        axios.get('/api/history/HNX').catch(() => null),
        axios.get('/api/history/VN30').catch(() => null),
      ]).then(([vnRes, hnxRes, vn30Res]) => {
        if (vnRes?.data?.data)  setVnIndexData(vnRes.data.data.slice(-30));
        if (hnxRes?.data?.data) setHnxIndexData(hnxRes.data.data.slice(-30));
        if (vn30Res?.data?.data) setVn30Data(vn30Res.data.data.slice(-30));
        addLog('[HỆ THỐNG] Đồng bộ biểu đồ chỉ số (VN-INDEX / HNX / VN30).');
      }).catch(() => {});

      // ── Luồng 2: QuantEngine — chạy độc lập, không block luồng 1 ──────────
      axios.get('/api/market-radar').then(intelRes => {
        if (intelRes?.data?.success) setMarketIntel(intelRes.data.data);
        if (intelRes?.data?.isLive) {
          addLog('[HỆ THỐNG] Radar cập nhật ma trận thị trường (Realtime).');
        } else if (intelRes?.data?._fromLock) {
          addLog('[HỆ THỐNG] Radar đang tính toán, dùng cache tạm thời...');
        } else {
          addLog('[HỆ THỐNG] Nạp dữ liệu thị trường cuối phiên từ Database.');
        }
        if (intelRes?.data?.logs?.length) {
          intelRes.data.logs.forEach(log => addLog(log));
        }
      }).catch(error => {
        addLog(`[LỖI] Hệ thống Radar mất kết nối máy chủ: ${error.message}`);
      });
    };

    fetchRadarData(); 
    
    let interval;
    if (marketOpen) {
        interval = setInterval(fetchRadarData, 60000); 
    } else {
        addLog('[HỆ THỐNG] Thị trường đóng cửa. Tạm ngưng tiến trình đồng bộ Realtime.');
    }
    
    return () => {
        if (interval) clearInterval(interval);
    };
    
  }, [marketOpen, activeMode]);

// LOGIC: TỰ ĐỘNG NẠP ĐỒ THỊ PHÁI SINH
  useEffect(() => {
    if (activeMode === 'VN_DERIVATIVES') {
        const fetchDerivData = async () => {
            try {
                const [chartRes, radarRes] = await Promise.all([
                    axios.get(`/api/history/VN30F1M?interval=${derivInterval}`),
                    axios.get('/api/deriv-radar')
                ]);
                
                if (chartRes.data?.success && chartRes.data.data.length > 0) {
                    setDerivChartData(chartRes.data.data);
                }
                
                if (radarRes.data?.success) {
                    setDerivRadar(radarRes.data.data); 
                }
            } catch (error) {
                console.error("Lỗi nạp dữ liệu Phái sinh:", error);
            }
        };

        fetchDerivData();
        let timer;
        if (marketOpen) timer = setInterval(fetchDerivData, 10000); 
        return () => clearInterval(timer);
    }
  }, [activeMode, derivInterval, marketOpen]);

    const UI = {
    main: isDark ? 'bg-[#06080B] text-white' : 'bg-[#F8FAFC] text-black',
    header: isDark ? 'bg-[#0B0F14]/90 border-white/5' : 'bg-white border-slate-300 shadow-sm',
    searchBg: isDark ? 'bg-[#121821] border-white/10' : 'bg-white border-slate-400 shadow-inner', 
    searchInput: isDark ? 'text-white placeholder:text-slate-500' : 'text-black placeholder:text-slate-600 font-black', 
    leftCol: isDark ? 'bg-[#080C11] border-white/5' : 'bg-[#F1F5F9] border-slate-300', 
    rightCol: isDark ? 'bg-[#05080C]' : 'bg-white',
    card: isDark ? 'bg-[#10151C] border-white/5' : 'bg-white border-slate-300 shadow-md',
    cardHover: isDark ? 'hover:bg-white/5 border-white/5' : 'hover:bg-slate-100 border-slate-400',
    textBold: isDark ? 'text-white' : 'text-black',
    textNormal: isDark ? 'text-slate-200' : 'text-slate-800',
    textMuted: isDark ? 'text-slate-400' : 'text-slate-600',
    border: isDark ? 'border-white/5' : 'border-slate-300',
    btnLog: isDark ? 'bg-[#121821] text-slate-400 border-white/10 hover:text-white' : 'bg-white text-slate-700 border-slate-300 hover:text-black hover:bg-slate-100 shadow-sm'
  };

    const addLog = useCallback((msg) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30))
    }, []);
  useEffect(() => {
    const loadSymbols = async () => {
      try {
        setLoadingSymbols(true)
        addLog('[HỆ THỐNG] Đang tải danh sách mã...')
        const response = await axios.get('/api/symbols')
        setAllStocks(response.data)
        addLog(`[HỆ THỐNG] Đã nạp ${response.data.length} mã chứng khoán`)
      } catch (err) {
        addLog('[LỖI] Kết nối Backend thất bại')
      } finally {
        setLoadingSymbols(false)
      }
    }
    loadSymbols()
  }, [])

  // LOGIC: (SMART SEARCH)
  useEffect(() => {
    if (!input.trim() || loadingMarket) {
      setSuggestions([]);
      return;
    }
    
    const keyword = input.trim().toUpperCase();
    
    const removeAccents = (str) => {
      return str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() : '';
    };
    
    const cleanKeyword = removeAccents(keyword);

    const filtered = allStocks
      .filter(stock => {
          const sym = stock.symbol?.toUpperCase() || '';
          const cName = removeAccents(stock.companyName || stock.name || '');
          return sym.includes(keyword) || cName.includes(cleanKeyword);
      })
      .sort((a, b) => {
          const aSym = a.symbol?.toUpperCase() || '';
          const bSym = b.symbol?.toUpperCase() || '';
          
          if (aSym === keyword) return -1;
          if (bSym === keyword) return 1;
          
          const aStarts = aSym.startsWith(keyword);
          const bStarts = bSym.startsWith(keyword);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          
          return 0;
      })
      .slice(0, 10); 
      
    setSuggestions(filtered);
  }, [input, allStocks, loadingMarket]);
    const fetchMarketData = async (forceSymbol) => {
      setActiveInterval('1 ngày');
      const symbol = forceSymbol ? forceSymbol.toUpperCase() : input.toUpperCase();
      if (!symbol) return;
      const exists = allStocks.some(s => s.symbol === symbol);
      
      // TÌM kiểm mã chứng khoán  
      if (!exists && !symbol.startsWith('VN30')) {
          addLog(`[CẢNH BÁO] Mã cổ phiếu [${symbol}] không hợp lệ hoặc đã hủy niêm yết.`);
          setErrorAlert(`MÃ CỔ PHIẾU "${symbol}" KHÔNG TỒN TẠI HOẶC ĐÃ HỦY NIÊM YẾT!`);
          setSuggestions([]);
          setShowSuggestions(false);
          setTimeout(() => setErrorAlert(''), 4000); 
          return; 
      }

      const localStock = allStocks.find(s => s.symbol === symbol);

      setSuggestions([]);
      setShowSuggestions(false);
      setAiReport(null);
      setChartData(null);
      setLoadingMarket(true);
      setFetchProgress(20);

      setMarketData({
        stockInfo: { symbol, currentPrice: '...', change: 0, changePercent: 0, marketCap: '...', pe: '...', totalVolume: '...', foreignBuy: '...', companyName: localStock ? localStock.name : 'Đang tìm kiếm...', exchange: localStock ? localStock.exchange : 'VNX' },
        companyProfile: { companyName: localStock ? localStock.name : '...', overview: 'Đang kết nối dữ liệu tài chính...' },
        deepNewsData: []
      });
        addLog(`[HỆ THỐNG] Khởi tạo đa luồng phân tích mã ${symbol}...`);
    try {
      axios.get(`/api/history/${symbol}`).then(res => {
        const hData = res.data?.data || [];
        if (hData.length > 0) {
          setChartData(hData);
          const latest = hData[hData.length - 1];
          const prev = hData[hData.length - 2] || latest;
          setMarketData(prevData => ({
            ...prevData,
            stockInfo: {
              ...prevData.stockInfo,
              currentPrice: (latest.close * 1000).toLocaleString('vi-VN'),
              change: (latest.close - prev.close) * 1000,
              changePercent: prev.close ? ((latest.close - prev.close) / prev.close) * 100 : 0,
              totalVolume: latest.value ? latest.value.toLocaleString('vi-VN') : '...'
            }
          }));
          addLog(`[THÀNH CÔNG] Đồng bộ Giá & Biểu đồ kỹ thuật.`);
        }
      });

      await axios.get(`/api/info/${symbol}?user=${currentUser}`).then(res => {
        if (res.data?.success) {
          setMarketData(prev => ({ ...prev, ...res.data.data }));
          if (res.data.logs && res.data.logs.length > 0) {
              res.data.logs.forEach(logMsg => addLog(logMsg));
          } else {
            addLog(`[THÀNH CÔNG] Đồng bộ Hồ sơ doanh nghiệp.`);
          }
        }
      });

      // ── Preload tin vĩ mô từ DerivNews DB  ──
 
      axios.get('/api/deriv-news')
        .then(res => {
          const macroNews = res.data?.data || [];
          if (macroNews.length > 0) {
            setMarketData(prev => {
              if (!prev) return prev;
              const existingLinks = new Set((prev.deepNewsData || []).map(n => n.link));
              const fresh = macroNews
                .filter(n => !existingLinks.has(n.link))
                .map(n => ({ ...n, source: n.source || 'Vĩ mô', isMacro: true, fetchedAt: new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}) }));

              if (fresh.length === 0) return prev;
              addLog(`[DB] Nạp ${fresh.length} tin vĩ mô từ Database.`);
              return { ...prev, deepNewsData: [...(prev.deepNewsData || []), ...fresh] };
            });
          }
        })
        .catch(() => {});

      await new Promise((resolve) => {
  const newsUrl = `${API_BASE_URL}${API_BASE_URL.endsWith('/') ? '' : '/'}api/news/${symbol}`;
  const controller = new AbortController();
  eventSourceRef.current = controller;

  const closeAll = () => {
    controller.abort();
    setLoadingMarket(false);
    setFetchProgress(100);
    resolve();
  };

  fetch(newsUrl, {
    headers: {
      'ngrok-skip-browser-warning': 'true',
      'Accept': 'text/event-stream',
    },
    signal: controller.signal,
  }).then(async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data?.type === 'done') { closeAll(); return; }
            data.fetchedAt = new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit', second: '2-digit'}); 
            setMarketData(prev => {
              if (!prev) return prev;
              const currentNews = prev.deepNewsData || [];
              if (currentNews.some(n => n.link === data.link)) return prev;
              return { ...prev, deepNewsData: [data, ...currentNews] };
            });
          } catch {}
        }
        if (line === 'event: done') { closeAll(); return; }
      }
    }
    closeAll();
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      addLog(`[LỖI]: stream tin tức thất bại! ${err.message}`);
    }
    closeAll();
  });
});

    } catch (err) {
      addLog(`[LỖI]: Hệ thống - ${err.message}`);
      setLoadingMarket(false);
    }
  };

  const stopNewsStream = () => {
  if (eventSourceRef.current) {
     if (typeof eventSourceRef.current.close === 'function') {
      eventSourceRef.current.close(); 
    } else if (typeof eventSourceRef.current.abort === 'function') {
      eventSourceRef.current.abort();  
    }
    eventSourceRef.current = null;
  }
};
// Logic ai button
const handleAiAnalysis = async (forceRefresh = false) => {
    if (!marketData || !chartData) {
       addLog(`[CẢNH BÁO] Trống dữ liệu biểu đồ. AI từ chối phân tích.`);
        return;
    }

    const now = Date.now();
    const MIN_INTERVAL_MS = 5 * 60 * 1000;

    const currentSnapshot = {
        price: marketData.stockInfo.currentPrice,
        newsCount: marketData.deepNewsData?.length || 0,
    };

    const isSignificantChange = lastAiVnSnapshot && (
        currentSnapshot.price !== lastAiVnSnapshot.price ||
        currentSnapshot.newsCount > lastAiVnSnapshot.newsCount + 2
    );

    const timeSinceLast = lastAiVnTime ? now - lastAiVnTime : Infinity;
    const enoughTimeElapsed = timeSinceLast >= MIN_INTERVAL_MS;

    if (!forceRefresh && aiReport && !isSignificantChange && !enoughTimeElapsed) {
        const remainSec = Math.round((MIN_INTERVAL_MS - timeSinceLast) / 1000);
        addLog(`[AI CACHE] Truy xuất báo cáo AI đã lưu. Thử lại sau ${remainSec}s.`);
        return;
    }

    setAnalyzing(true);
    setAiAnalysisDuration(null);
    const startTime = performance.now();
    setAnalysisStep('🔍 Khởi tạo engine phân tích...');
    addLog(`[AI CORE] Khởi chạy thuật toán cho mã ${marketData.stockInfo.symbol}...`);

    const steps = [
      { delay: 800,  msg: '📄 Đang tải báo cáo tài chính PDF...' },
      { delay: 2500, msg: '📊 Phân tích bảng cân đối kế toán...' },
      { delay: 4500, msg: '💰 Phân tích kết quả kinh doanh (P&L)...' },
      { delay: 6500, msg: '🔄 Phân tích lưu chuyển tiền tệ...' },
      { delay: 8500, msg: '📈 Tính toán chỉ số tài chính (ROE, P/E, EPS...)' },
      { delay: 10500, msg: '📰 Phân tích tin tức & sentiment thị trường...' },
      { delay: 13000, msg: '🕯️ Phân tích kỹ thuật (MACD, RSI, Bollinger)...' },
      { delay: 15500, msg: '🏭 So sánh với trung bình ngành...' },
      { delay: 18000, msg: '🧠 AI tổng hợp & sinh báo cáo chiến lược...' },
      { delay: 21000, msg: '✍️ Đang viết khuyến nghị đầu tư...' },
    ];
    const stepTimers = steps.map(s => setTimeout(() => setAnalysisStep(s.msg), s.delay));

    addLog(`[AI CORE] Đang gửi bóc tách dữ liệu BCTC cho mã ${marketData.stockInfo.symbol}...`);
    const optimizedNews = (marketData.deepNewsData || []).slice(0, 20).map(n => ({
        title:     n.title,
        date:      n.date,
        sentiment: n.sentiment || 'neutral',
        link:      n.link    || null,
        content:   n.content && n.content !== n.title && n.content.length > 80
                     ? n.content.substring(0, 2000)
                     : null,
    }));

    const aiPayload = {
        stockInfo: marketData.stockInfo,
        companyProfile: {
            overview: marketData.companyProfile?.overview,
            companyName: marketData.companyProfile?.companyName
        },
        technicalData: chartData.slice(-30),
        marketContext: vnIndexData.slice(-5),
        news: optimizedNews,
        user: currentUser,
        timestamp: new Date().toISOString()
    };

    // ── DEBUG: In toàn bộ data feed ra console ──
    console.group(`🦆 OMNI DUCK — AI Data Feed [${marketData.stockInfo.symbol}]`);
    console.log('📊 stockInfo:', aiPayload.stockInfo);
    console.log('🏢 companyProfile:', aiPayload.companyProfile);
    console.log('📈 technicalData (30 nến):', aiPayload.technicalData);
    console.log('🌐 marketContext (VN-INDEX 5 ngày):', aiPayload.marketContext);
    console.log('📰 news (10 tin):', aiPayload.news);
    console.log('📦 Full JSON (copy để test):', JSON.stringify(aiPayload, null, 2));
    console.groupEnd();

    try {
        const response = await axios.post(`/api/analyze/${marketData.stockInfo.symbol}`, aiPayload);
        const endTime = performance.now(); 
        setAiAnalysisDuration(((endTime - startTime) / 1000).toFixed(1)); 

        setAiReport(response.data.aiReport);
        setLastAiVnTime(now);
        setLastAiVnSnapshot(currentSnapshot);
        addLog(`[THÀNH CÔNG] AI hoàn tất chiến lược và đã lưu vào Database.`);
        setShowLogs(false);
        if (response.data.actionPanelData) setActionData(response.data.actionPanelData);
        if (currentUser) fetchUserHistory();
    } catch (err) {
        addLog('[LỖI] Xử lý AI thất bại: Tràn bộ nhớ hoặc mất kết nối API.');
        console.error(err);
    } finally {
        stepTimers.forEach(t => clearTimeout(t));
        setAnalyzing(false);
        setAnalysisStep('');
    }
};
  useEffect(() => {
  const handleEsc = (e) => {
    if (e.key === 'Escape' && showLogs) {
      setShowLogs(false);
    }
  };
  window.addEventListener('keydown', handleEsc);
  return () => window.removeEventListener('keydown', handleEsc);
}, [showLogs]);

  const fetchAiNews = async () => {
    if (!marketData?.stockInfo?.symbol) return;
    const symbol = marketData.stockInfo.symbol;
    
    setLoadingAiNews(true);
    addLog(`[AI CORE] Đang rà quét mạng lưới thông tin cho mã ${symbol}...`);   
    try {
        const res = await axios.get(`/api/ai-news/${symbol}`);
        const aiArticles = res.data?.data || []; 
        
        if (aiArticles.length > 0) {
            setMarketData(prev => {
                const currentNews = [...(prev.deepNewsData || [])];
                
                aiArticles.forEach(aiItem => {
                    const existingIndex = currentNews.findIndex(n => n.link === aiItem.link);
                    if (existingIndex !== -1) {
                        currentNews[existingIndex].isAiGenerated = true; 
                    }
                });

                const existingLinks = new Set(currentNews.map(n => n.link));
                const brandNewAiArticles = aiArticles
                    .filter(n => !existingLinks.has(n.link))
                    .map(n => ({ ...n, isAiGenerated: true,
                    fetchedAt: new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})  
                }));

                addLog(`[THÀNH CÔNG] Mạng lưới AI lọc được ${brandNewAiArticles.length} tin tức độc quyền.`);     

                return {
                    ...prev,
                    deepNewsData: [...brandNewAiArticles, ...currentNews] 
                };
            });
        } else {
            addLog(`[CẢNH BÁO] Không có tin tức mới được AI trích xuất.`);
        }
    } catch (error) {
        addLog(`[LỖI] Tìm kiếm tin tức AI mất kết nối tới máy chủ.`);
    } finally {
        setLoadingAiNews(false);
    }
  };

  const handleIntervalChange = async (newInterval) => {
    setActiveInterval(newInterval);
    if (!marketData || !marketData.stockInfo.symbol) return;
    const symbol = marketData.stockInfo.symbol;
    
    addLog(`[HỆ THỐNG] Đang tải dữ liệu biểu đồ khung: ${newInterval}...`);

    try {
      const res = await axios.get(`/api/history/${symbol}?interval=${newInterval}`);
      const hData = res.data?.data || [];
      if (hData.length > 0) {
        setChartData([...hData]); 
        addLog(`[HỆ THỐNG] Đã cập nhật biểu đồ sang khung ${newInterval}`);
      } else {
        addLog(`[CẢNH BÁO] Không có dữ liệu cho khung ${newInterval}`);
      }
    } catch (err) {
      addLog(`[CẢNH BÁO] Lỗi tải biểu đồ khung ${newInterval}`);
    }
  };

  // LOGIC: ACTION PANEL MONITORING LOOP
  useEffect(() => {
    let actionTimer;
    if (aiReport && marketData && marketData.stockInfo) {
        const fetchActionPanel = async () => {
            const currentPriceStr = marketData.stockInfo.currentPrice || '0';
            const currentPriceNum = parseInt(currentPriceStr.replace(/\./g, ''), 10);
            const currentNewsCount = marketData.deepNewsData?.length || 0;

            let shouldUpdate = false;
            let triggerReason = "";

            if (!lastActionPriceRef.current) {
                shouldUpdate = true;
                triggerReason = "Khởi tạo lệnh lần đầu";
            } else {
                const priceDiffPercent = Math.abs(currentPriceNum - lastActionPriceRef.current) / lastActionPriceRef.current;
                if (priceDiffPercent >= 0.015) { 
                    shouldUpdate = true;
                    triggerReason = `Giá biến động mạnh (${(priceDiffPercent * 100).toFixed(2)}%)`;
                } else if (currentNewsCount > lastNewsCountRef.current) { 
                    shouldUpdate = true;
                    triggerReason = `Có tin tức/sự kiện mới xuất hiện`;
                }
            }

            if (!shouldUpdate) return; 

            setIsUpdatingAction(true);
            addLog(`[CẢNH BÁO] Đã kích hoạt Action Panel khẩn cấp. Lý do: ${triggerReason}`);

            try {
                const latestNewsTitle = currentNewsCount > 0 ? marketData.deepNewsData[currentNewsCount - 1].title : 'Không có';
                const isDerivativeMode = marketData.stockInfo.symbol.startsWith('VN30F');
                
                const res = await axios.post(`/api/action-panel/${marketData.stockInfo.symbol}`, {
                    currentPrice: marketData.stockInfo.currentPrice,
                    changePercent: marketData.stockInfo.changePercent,
                    totalVolume: marketData.stockInfo.totalVolume,
                    buyVolume: marketData.stockInfo.buyVolume,
                    sellVolume: marketData.stockInfo.sellVolume,
                    triggerReason: triggerReason,
                    latestNews: latestNewsTitle,
                    isDerivative: isDerivativeMode,
                    basis: isDerivativeMode ? (derivRadar?.basis || 0) : null,
                    pocPrice: isDerivativeMode ? (volumeProfile?.pocPrice || 0) : null,
                    influencers: isDerivativeMode ? (derivRadar?.influencers || []) : null
                });
                
                if (res.data && res.data.data) {
                    setActionData(res.data.data);
                    lastActionPriceRef.current = currentPriceNum;
                    lastNewsCountRef.current = currentNewsCount;
                }
            } catch (e) {
                // Silent catch
            } finally {
                setIsUpdatingAction(false);
            }
        };

        actionTimer = setInterval(fetchActionPanel, 15000); 
        fetchActionPanel(); 
    }
    return () => clearInterval(actionTimer);
  }, [aiReport, marketData?.stockInfo?.currentPrice, marketData?.deepNewsData?.length]);

  // LOGIC: REALTIME SYNC LOOP
  useEffect(() => {
    let timer;
    if (marketData && marketData.stockInfo && marketData.stockInfo.symbol) {
        timer = setInterval(async () => {
            if (!marketOpen) return; 

            try {
                const symbol = marketData.stockInfo.symbol;
                const res = await axios.get(`/api/history/${symbol}?interval=${activeInterval}`);
                const hData = res.data?.data || [];
                
                if (hData.length > 0) {
                    const latest = hData[hData.length - 1];
                    const prev = hData[hData.length - 2] || latest;
                    
                    setMarketData(prevData => ({
                        ...prevData,
                        stockInfo: {
                            ...prevData.stockInfo,
                            currentPrice: (latest.close * 1000).toLocaleString('vi-VN'),
                            change: (latest.close - prev.close) * 1000,
                            changePercent: prev.close ? ((latest.close - prev.close) / prev.close) * 100 : 0,
                            totalVolume: latest.volume ? latest.volume.toLocaleString('vi-VN') : prevData.stockInfo.totalVolume
                        }
                    }));
                    setChartData(hData);
                }
            } catch (error) { /* Silent catch */ }
        }, 5000); 
    }
    return () => clearInterval(timer);
  }, [marketData?.stockInfo?.symbol, activeInterval, marketOpen]);
  
  return (
    <div className={`w-full h-screen flex flex-col overflow-hidden font-sans antialiased transition-colors duration-300 ${UI.main}`}>
      
      {/* AUTH SCREEN CONTAINER */}
        {!currentUser && (
        <AuthScreen
            authForm={authForm} setAuthForm={setAuthForm}
            authError={authError} handleAuthSubmit={handleAuthSubmit}
        />
        )}

      {/* TERMINAL MAIN CONTAINER */}
      <div className={`w-full h-full flex flex-col transition-opacity duration-500 ${!currentUser ? 'opacity-0 pointer-events-none blur-md' : 'opacity-100'}`}>
        <AppHeader
        isDark={isDark} UI={UI} theme={isDark ? 'dark' : 'light'}
        activeMode={activeMode} 
        marketOpen={activeMode === 'CRYPTO' ? true : marketOpen}
        input={input} setInput={setInput}
        showSuggestions={showSuggestions} setShowSuggestions={setShowSuggestions}
        suggestions={suggestions} setSuggestions={setSuggestions}
        showLogs={showLogs} setShowLogs={setShowLogs}
        showUserMenu={showUserMenu} setShowUserMenu={setShowUserMenu}
        errorAlert={errorAlert}
        loadingMarket={loadingMarket}
        currentUser={currentUser}
        setActiveMode={(mode) => {
        vnStocksCloseChatRef.current?.();
        setActiveMode(mode);
        }} handleLogout={handleLogout}
        handleGoHome={handleGoHome} handleToggleTheme={handleToggleTheme}
        fetchMarketData={fetchMarketData} executePaperSearch={executePaperSearch}
        />

      {/* GRID CONTAINER: 3 COLUMNS SYSTEM */}
      <div className="flex-1 overflow-hidden flex relative w-full">

        {/* ========================================================= */}
        {/* CHẾ ĐỘ 1: CHỨNG KHOÁN VIỆT NAM (CƠ SỞ)                    */}
        {/* ========================================================= */}
        {activeMode === 'VN_STOCKS' && (
        <VnStocksTab
            isDark={isDark} UI={UI}
            allStocks={allStocks}
            marketData={marketData}
            chartData={chartData}
            aiReport={aiReport}
            analyzing={analyzing}
            analysisStep={analysisStep}
            loadingMarket={loadingMarket}
            loadingAiNews={loadingAiNews}
            activeInterval={activeInterval}
            showExtraStats={showExtraStats} setShowExtraStats={setShowExtraStats}
            showVolInfo={showVolInfo} setShowVolInfo={setShowVolInfo}
            actionData={actionData}
            isUpdatingAction={isUpdatingAction}
            setShowPdfModal={setShowPdfModal}
            vnIndexData={vnIndexData}
            hnxIndexData={hnxIndexData}
            vn30Data={vn30Data}
            marketIntel={marketIntel}
            handleAiAnalysis={handleAiAnalysis}
            handleIntervalChange={handleIntervalChange}
            fetchAiNews={fetchAiNews}
            stopNewsStream={stopNewsStream}

            fetchUserHistory={fetchUserHistory}
            userHistory={userHistory}
            setInput={setInput}
            fetchMarketData={fetchMarketData}
            heatmapData={heatmapData}
            loadingHeatmap={loadingHeatmap}
            lastAiVnTime={lastAiVnTime}
            currentUser={currentUser}
            onRequestCloseChat={(fn) => { vnStocksCloseChatRef.current = fn; }}
            aiAnalysisDuration={aiAnalysisDuration}

        />
        )}
        {/* ========================================================= */}
        {/* CHẾ ĐỘ 2: PHÁI SINH VIỆT NAM (VN30F1M)                    */}
        {/* ========================================================= */}
        {activeMode === 'VN_DERIVATIVES' && (
          <DerivativesTab
            lastNewsSave={lastNewsSave}
            refreshingNews={refreshingNews}
            handleRefreshDerivNews={handleRefreshDerivNews}
            derivNews={derivNews}
            aiDerivReport={aiDerivReport}
            analyzingDeriv={analyzingDeriv}
            handleAiDerivAnalysis={handleAiDerivAnalysis}
            isDark={isDark} UI={UI}
            derivRadar={derivRadar}
            derivChartData={derivChartData}
            derivInterval={derivInterval} setDerivInterval={setDerivInterval}
            derivAnalysis={derivAnalysis}
            volumeProfile={volumeProfile}
            showLeaderInfo={showLeaderInfo} setShowLeaderInfo={setShowLeaderInfo}
            showVolInfo={showVolInfo} setShowVolInfo={setShowVolInfo}
            demoPosition={demoPosition} setDemoPosition={setDemoPosition}
            demoEntryPrice={demoEntryPrice} setDemoEntryPrice={setDemoEntryPrice}
            demoVolume={demoVolume} setDemoVolume={setDemoVolume}
            addLog={addLog}
            handleExportDeriv={handleExportDeriv}
            exportingDeriv={exportingDeriv}
            lastAiDerivTime={lastAiDerivTime}
            macroContext={macroContext}
        />
        )}
        {/* ========================================================= */}
        {/* CHẾ ĐỘ 3: CRYPTO TERMINAL - HỖ TRỢ LIGHT/DARK MODE      */}
        {/* ========================================================= */}
        {activeMode === 'CRYPTO' && (
            <CryptoTab
                isDark={isDark}
                UI={UI}
                addLog={addLog}
            />
        )}
        {/* ========================================================= */}
        {/* CHẾ ĐỘ 5: GIẢ LẬP ĐẦU TƯ (PAPER TRADING)          */}
        {/* ========================================================= */}
        {activeMode === 'PAPER_TRADING' && (
        <PaperTradingTab
            isDark={isDark} UI={UI}
            currentUser={currentUser}
            portfolio={portfolio}
            allStocks={allStocks}
            paperMarket={paperMarket} setPaperMarket={setPaperMarket}
            paperSymbol={paperSymbol}
            paperSearchInput={paperSearchInput} setPaperSearchInput={setPaperSearchInput}
            paperSuggestions={paperSuggestions}
            showPaperSuggestions={showPaperSuggestions} setShowPaperSuggestions={setShowPaperSuggestions}
            paperVolume={paperVolume} setPaperVolume={setPaperVolume}
            paperOrderType={paperOrderType} setPaperOrderType={setPaperOrderType}
            paperLimitPrice={paperLimitPrice} setPaperLimitPrice={setPaperLimitPrice}
            paperChartData={paperChartData}
            paperInterval={paperInterval} setPaperInterval={setPaperInterval}
            showPaperHelp={showPaperHelp} setShowPaperHelp={setShowPaperHelp}
            marketOpen={marketOpen}
            expandedSymbol={expandedSymbol} setExpandedSymbol={setExpandedSymbol}
            executePaperSearch={executePaperSearch}
            handlePaperTrade={handlePaperTrade}
            handleCancelOrder={handleCancelOrder}
        />
        )}
    </div>
</div>
    {/* Hiển thị log*/}
      {showLogs && (
        <DraggableLog 
          isDark={isDark} 
          logs={logs} 
          onClose={() => setShowLogs(false)} 
        />
      )}
     {/* COMPONENT: FULL PDF MODAL VIEWER */}
      {showPdfModal && (
        <div 
            className="fixed inset-0 flex items-center justify-center p-6 lg:p-12 pt-24" 
            style={{ zIndex: 999999 }}
        >
            <div 
                className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
                onClick={() => setShowPdfModal(false)}
            />
            <div className={`relative w-full max-w-6xl h-full flex flex-col rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border ${isDark ? 'bg-[#1e1e1e] border-white/10' : 'bg-gray-100 border-gray-300'} animate-in zoom-in-95 duration-200`}>
                <div className={`h-14 flex items-center justify-between px-6 border-b shrink-0 ${isDark ? 'bg-[#121212] border-white/10' : 'bg-white border-gray-300'}`}>
                    <div className="flex items-center gap-3">
                        <FileText size={18} className="text-yellow-400" />
                        <h3 className={`font-black tracking-widest uppercase text-sm ${UI.textBold}`}>
                            Báo cáo phân tích chuyên sâu: {marketData.stockInfo.symbol}
                        </h3>
                    </div>
                    <button 
                        onClick={() => setShowPdfModal(false)} 
                        className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-100 text-red-500'}`}
                    >
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>
                <div className="flex-1 w-full relative bg-white">
                    <iframe 
                        src={`${marketData.reportPdf}#toolbar=1&navpanes=0&view=FitH`} 
                        className="absolute inset-0 w-full h-full border-none" 
                        title="PDF Full Viewer"
                   />
                </div>
            </div>
        </div>
      )}
      
    </div>
  );
}

export default App;