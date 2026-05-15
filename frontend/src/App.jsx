import React, { useEffect, useState, useRef } from 'react'
import remarkGfm from 'remark-gfm';
import './App.css'
import axios from 'axios'
import ReactMarkdown from 'react-markdown';
import MarketRadar from './MiniRadarChart';
import TradingChart from './TradingChart';
import rehypeRaw from 'rehype-raw';
import CyberpunkClock from './components/CyberpunkClock';
import { Search, TrendingUp, Globe, Zap, Activity, BarChart3, BrainCircuit, TerminalSquare, Home, Database, X, Sun, Moon, FileText, ChevronDown, ChevronUp, Menu, User} from 'lucide-react'

function App() {
  // CONFIG: USER STATE & AUTH MANAGEMENT
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('omni_user') || null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [authForm, setAuthForm] = useState({ username: '', password: '', isRegister: false });

  // CONFIG: THEME ENGINE
  const [theme, setTheme] = useState('dark');
  const isDark = theme === 'dark';

  useEffect(() => {
    if (currentUser) {
        const savedTheme = localStorage.getItem(`omni_theme_${currentUser}`);
        if (savedTheme) setTheme(savedTheme);
    }
  }, [currentUser]);

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

  const handleAuthSubmit = (e) => {
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

    const usersDB = JSON.parse(localStorage.getItem('omni_users_db') || '{}');
    const lowerInput = cleanUsername.toLowerCase();
    const existingUserKey = Object.keys(usersDB).find(key => key.toLowerCase() === lowerInput);

    if (isRegister) {
      if (existingUserKey) {
        setAuthError('Bí danh này đã có người sử dụng! Vui lòng chọn tên khác.');
        return;
      }
      usersDB[cleanUsername] = { password: password };
      localStorage.setItem('omni_users_db', JSON.stringify(usersDB));
      
    } else {
      if (!existingUserKey) {
        setAuthError('Tài khoản không tồn tại! Vui lòng tạo tài khoản mới.');
        return;
      }
      if (usersDB[existingUserKey].password !== password) {
        setAuthError('Mật khẩu truy cập không đúng! Kiểm tra lại.');
        return;
      }
      
      cleanUsername = existingUserKey; 
    }

    localStorage.setItem('omni_user', cleanUsername);
    setCurrentUser(cleanUsername);
  };

  // LOGIC: INTERACTION INTERFACES
  const [isManualTwitch, setIsManualTwitch] = useState(false);
  const handleCatClick = () => {
    setIsManualTwitch(true);
    setTimeout(() => setIsManualTwitch(false), 500);
  };

  const handleGoHome = () => {
    setMarketData(null);
    setChartData(null);
    setAiReport(null);
    setInput('');
    if (currentUser) fetchUserHistory();
  };
  const [derivChartData, setDerivChartData] = useState(null);
  const [derivInterval, setDerivInterval] = useState('5 phút');
  const [derivRadar, setDerivRadar] = useState(null);

  const [activeMode, setActiveMode] = useState('VN_STOCKS');
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
  
  const eventSourceRef = useRef(null);
  const lastActionPriceRef = useRef(null); 
  const lastNewsCountRef = useRef(0);
  
  const [showLogs, setShowLogs] = useState(false);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [loadingAiNews, setLoadingAiNews] = useState(false);
  const [marketData, setMarketData] = useState(null);
  const [aiReport, setAiReport] = useState(null);
  const [logs, setLogs] = useState([]);
  const [chartData, setChartData] = useState(null);
  const [vnIndexData, setVnIndexData] = useState([]);
  const [activeInterval, setActiveInterval] = useState('1 ngày');
  const [hnxIndexData, setHnxIndexData] = useState([]);
  const [vn30Data, setVn30Data] = useState([]);
  const [errorAlert, setErrorAlert] = useState('');
  const [userHistory, setUserHistory] = useState([]);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const volumeProfile = React.useMemo(() => {
    if (!derivChartData || derivChartData.length === 0) return null;
    
    const binsCount = 12; // Chia làm 12 vùng giá
    let minPrice = Math.min(...derivChartData.map(d => d.low));
    let maxPrice = Math.max(...derivChartData.map(d => d.high));
    
    if (maxPrice === minPrice) { maxPrice += 1; minPrice -= 1; } // Chống lỗi nến ngang
    
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
                pocPrice = bins[binIndex].priceCenter; // Cập nhật vùng kẹt hàng lớn nhất
            }
        }
    });

    return { bins: bins.reverse(), maxVol, pocPrice }; // Reverse để hiển thị giá cao ở trên
  }, [derivChartData]);
  useEffect(() => {
    if (currentUser) fetchUserHistory();
  }, [currentUser]);

  const fetchUserHistory = async () => {
    if (!currentUser) return;
    try {
        const res = await axios.get(`http://localhost:3001/api/user-history/${currentUser}`);
        if (res.data.success) {
            setUserHistory(res.data.data); 
        }
    } catch (error) {
        console.error("Lỗi lấy lịch sử:", error);
    }
  };

  const [clock, setClock] = useState({ time: '00:00:00', ms: '000' });

  useEffect(() => {
    const updateTime = () => {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        
        setClock({ time: `${hh}:${mm}:${ss}`, ms: ms });

        const day = now.getDay();
        const totalMinutes = now.getHours() * 60 + now.getMinutes();
        const isOpen = day >= 1 && day <= 5 && totalMinutes >= 540 && totalMinutes <= 900;
        setMarketOpen(isOpen);

        requestAnimationFrame(updateTime); 
    };
    requestAnimationFrame(updateTime);
  }, []);

  useEffect(() => {
    const fetchRadarData = async () => {
      try {
        const [vnRes, hnxRes, vn30Res, intelRes] = await Promise.all([
          axios.get('http://localhost:3001/api/history/VNINDEX'),
          axios.get('http://localhost:3001/api/history/HNX'),
          axios.get('http://localhost:3001/api/history/VN30'),
          axios.get('http://localhost:3001/api/market-radar') 
        ]);

        if (vnRes.data?.data) setVnIndexData(vnRes.data.data.slice(-30));
        if (hnxRes.data?.data) setHnxIndexData(hnxRes.data.data.slice(-30));
        if (vn30Res.data?.data) setVn30Data(vn30Res.data.data.slice(-30));
        if (intelRes.data?.success) setMarketIntel(intelRes.data.data);

        addLog(marketOpen ? '[OK] Radar quét Live.' : '[OK] Radar tĩnh (Thị trường đóng).');
      } catch (error) {
        console.error("Lỗi lấy dữ liệu Radar:", error);
      }
    };

    fetchRadarData(); 
    
    let interval;
    if (marketOpen) {
        interval = setInterval(fetchRadarData, 60000); 
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
                // Gọi song song Chart 5M và Radar Basis
                const [chartRes, radarRes] = await Promise.all([
                    axios.get(`http://localhost:3001/api/history/VN30F1M?interval=${derivInterval}`),
                    axios.get('http://localhost:3001/api/deriv-radar') // 🚀 Gọi API mới
                ]);
                
                if (chartRes.data?.success && chartRes.data.data.length > 0) {
                    setDerivChartData(chartRes.data.data);
                }
                if (radarRes.data?.success) {
                    setDerivRadar(radarRes.data.data); // 🚀 Hứng dữ liệu Basis
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

  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30))
  }

  useEffect(() => {
    const loadSymbols = async () => {
      try {
        setLoadingSymbols(true)
        addLog('Đang tải danh sách mã...')
        const response = await axios.get('http://localhost:3001/api/symbols')
        setAllStocks(response.data)
        addLog(`Đã nạp ${response.data.length} mã chứng khoán`)
      } catch (err) {
        addLog('Lỗi kết nối Backend')
      } finally {
        setLoadingSymbols(false)
      }
    }
    loadSymbols()
  }, [])

  useEffect(() => {
    if (!input.trim() || loadingMarket) {
      setSuggestions([])
      return
    }
    const keyword = input.toUpperCase()
    const filtered = allStocks
      .filter(stock =>
        stock.symbol.startsWith(keyword) ||
        stock.name?.toUpperCase().includes(keyword)
      )
      .slice(0, 10)
    setSuggestions(filtered)
  }, [input, allStocks, loadingMarket])

  const fetchMarketData = async () => {
    setActiveInterval('1 ngày');
    if (!input) return;
    const symbol = input.toUpperCase();

    const exists = allStocks.some(s => s.symbol === symbol);
    if (!exists && !symbol.startsWith('VN30')) {
        addLog(`Cảnh báo: Mã [${symbol}] không tồn tại trong hệ thống!`);
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
    addLog(`Đang khởi tạo đa luồng cho mã ${symbol}...`);

    try {
      axios.get(`http://localhost:3001/api/history/${symbol}`).then(res => {
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
          addLog(`[OK] Đã khớp Giá & Biểu đồ.`);
        }
      });

      await axios.get(`http://localhost:3001/api/info/${symbol}?user=${currentUser}`).then(res => {
        if (res.data?.success) {
          setMarketData(prev => ({ ...prev, ...res.data.data }));
          if (res.data.logs && res.data.logs.length > 0) {
              res.data.logs.forEach(logMsg => addLog(logMsg));
          } else {
              addLog(`[OK] Đã nạp Hồ sơ doanh nghiệp.`);
          }
        }
      });

      await new Promise((resolve) => {
        const source = new EventSource(`http://localhost:3001/api/news/${symbol}`);
        eventSourceRef.current = source;

        source.onmessage = (event) => {
          const newsItem = JSON.parse(event.data);
          setMarketData(prev => {
            if (!prev) return prev;
            const currentNews = prev.deepNewsData || [];
            if (currentNews.some(n => n.link === newsItem.link)) return prev;
            return { ...prev, deepNewsData: [...currentNews, newsItem] };
          });
        };

        const closeAll = () => {
          if (eventSourceRef.current) eventSourceRef.current.close();
          setLoadingMarket(false);
          setFetchProgress(100);
          resolve();
        };

        source.addEventListener('done', closeAll);
        source.addEventListener('error', closeAll);
      });

    } catch (err) {
      addLog(`Lỗi hệ thống: ${err.message}`);
      setLoadingMarket(false);
    }
  };

  const stopNewsStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setLoadingMarket(false); 
    setFetchProgress(100);
    addLog('Đã ngắt luồng tin tức theo lệnh!');
  };

  const handleAiAnalysis = async () => {
    if (!marketData || !chartData) {
        addLog(`[Lỗi] Thiếu dữ liệu biểu đồ để AI phân tích!`);
        return;
    }
    setAnalyzing(true);
    addLog(`Đang biên dịch khối dữ liệu đa chiều cho AI...`);
    
    const optimizedNews = (marketData.deepNewsData || []).slice(0, 10).map(n => ({
        title: n.title,
        date: n.date
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

    try {
      const response = await axios.post(`http://localhost:3001/api/analyze/${marketData.stockInfo.symbol}`, aiPayload);
      setAiReport(response.data.aiReport);
      addLog(`[OK] OMNI DUCK hoàn tất chiến lược và đã lưu Database!`);
      setShowLogs(false);
      if (currentUser && typeof fetchUserHistory === 'function') {
          fetchUserHistory();
      }
    } catch (err) {
      addLog('Lỗi xử lý AI: Tràn bộ nhớ hoặc mất kết nối');
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  }

  const fetchAiNews = async () => {
    if (!marketData?.stockInfo?.symbol) return;
    const symbol = marketData.stockInfo.symbol;
    
    setLoadingAiNews(true);
    addLog(`🕵️‍♂️ Agent OMNI DUCK đi rà quét tin tức mạng cho ${symbol}...`);

    try {
        const res = await axios.get(`http://localhost:3001/api/ai-news/${symbol}`);
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
                    .map(n => ({ ...n, isAiGenerated: true }));

                addLog(`[OK] Phân tích AI: Thêm ${brandNewAiArticles.length} tin mới, Nâng cấp màu tím cho các tin cũ quan trọng.`);

                return {
                    ...prev,
                    deepNewsData: [...brandNewAiArticles, ...currentNews] 
                };
            });
        } else {
            addLog(`Không tìm thấy tin tức nào từ AI.`);
        }
    } catch (error) {
        addLog(`Lỗi khi AI săn tin tức.`);
    } finally {
        setLoadingAiNews(false);
    }
  };

  const handleIntervalChange = async (newInterval) => {
    setActiveInterval(newInterval);
    if (!marketData || !marketData.stockInfo.symbol) return;
    const symbol = marketData.stockInfo.symbol;
    
    addLog(`Đang tải dữ liệu biểu đồ khung: ${newInterval}...`);

    try {
      const res = await axios.get(`http://localhost:3001/api/history/${symbol}?interval=${newInterval}`);
      const hData = res.data?.data || [];
      if (hData.length > 0) {
        setChartData([...hData]); 
        addLog(`[OK] Đã cập nhật biểu đồ sang khung ${newInterval}`);
      } else {
        addLog(`[Cảnh báo] Không có dữ liệu cho khung ${newInterval}`);
      }
    } catch (err) {
      addLog(`Lỗi tải biểu đồ khung ${newInterval}`);
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
            addLog(`⚡ [LỆNH KHẨN] Kích hoạt Action Panel do: ${triggerReason}`);

            try {
                const latestNewsTitle = currentNewsCount > 0 ? marketData.deepNewsData[currentNewsCount - 1].title : 'Không có';
                const isDerivativeMode = marketData.stockInfo.symbol.startsWith('VN30F');
                
                const res = await axios.post(`http://localhost:3001/api/action-panel/${marketData.stockInfo.symbol}`, {
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
                const res = await axios.get(`http://localhost:3001/api/history/${symbol}?interval=${activeInterval}`);
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
  
  // LOGIC: SYSTEMATIC ANALYSIS RATIO
  const renderMarketOverview = () => {
    // Nếu chưa có data thì hiển thị loading
    if (!marketIntel || !vnIndexData || vnIndexData.length < 2) {
      return (
        <div className={`shrink-0 h-[180px] border-t flex items-center justify-center ${isDark ? 'border-white/10 bg-[#0B0F14]' : 'border-slate-300 bg-white'}`}>
          <div className="flex flex-col items-center opacity-50">
            <Activity size={24} className="mb-2 animate-pulse" />
            <p className="text-xs font-black uppercase tracking-[0.2em]">OMNI DUCK ĐANG TÍNH TOÁN MA TRẬN...</p>
          </div>
        </div>
      );
    }

    // MAP MÀU THEO TRẠNG THÁI
    const colorMap = {
        bullish: isDark ? 'text-emerald-400' : 'text-emerald-600',
        bearish: isDark ? 'text-red-400' : 'text-red-600',
        warning: isDark ? 'text-yellow-400' : 'text-yellow-600',
        neutral: isDark ? 'text-slate-400' : 'text-slate-600'
    };
    
    // Dùng optional chaining (?.) để tránh sập app nếu API trả về thiếu trường dữ liệu
    const statusColor = colorMap[marketIntel?.statusType] || colorMap.neutral;
    const isUp = parseFloat(marketIntel?.indexChangePct || 0) >= 0;

    const emeraldBadge = isDark ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border border-emerald-300';
    const redBadge = isDark ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-red-100 text-red-700 border border-red-300';

    return (
      <div className={`shrink-0 border-t p-5 flex flex-col z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.1)] ${isDark ? 'border-white/10 bg-[#0B0F14]' : 'border-slate-300 bg-slate-50'}`}>
        
        {/* HEADER: VN-INDEX */}
        <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
                <Globe size={18} className={statusColor} />
                <h3 className={`text-sm font-black uppercase tracking-[0.2em] ${UI.textBold}`}>Hệ Sinh Thái VN-INDEX</h3>
            </div>
            <div className={`px-2 py-1 rounded text-[11px] font-black tracking-widest border ${isUp ? (isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-400 text-emerald-600') : (isDark ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-red-50 border-red-400 text-red-600')}`}>
                VN-INDEX: {isUp ? '+' : ''}{marketIntel?.indexChangePct}%
            </div>
        </div>

        {/* Tech index */}
        <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={`p-3 rounded-lg border flex flex-col justify-center shadow-sm ${isDark ? 'bg-black/40 border-white/5' : 'bg-white border-slate-200'}`}>
                <p className={`text-[9px] font-bold uppercase tracking-widest ${UI.textMuted}`}>Trạng thái Hệ thống</p>
                <p className={`text-[13px] font-black uppercase mt-1 ${statusColor}`}>{marketIntel?.marketStatus || 'ĐANG CẬP NHẬT'}</p>
            </div>
            <div className={`p-3 rounded-lg border flex flex-col justify-center shadow-sm ${isDark ? 'bg-black/40 border-white/5' : 'bg-white border-slate-200'}`}>
                <p className={`text-[9px] font-bold uppercase tracking-widest ${UI.textMuted}`}>Lan tỏa Dòng tiền</p>
                <p className={`text-[13px] font-black uppercase mt-1 ${UI.textBold}`}>{marketIntel?.breadthRatio}% Mã Tăng</p>
            </div>
        </div>
        
        {/*AI */}
        <p className={`text-[11px] italic font-medium mb-3 line-clamp-1 ${UI.textMuted}`}>
           <Zap size={10} className="inline mr-1 text-yellow-500"/> {marketIntel?.diagnosticDesc || 'Đang chờ đánh giá chuyên sâu từ hệ thống...'}
        </p>

        {/* Industry Group*/}
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
                <span className={`w-16 shrink-0 text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-emerald-500' : 'text-emerald-600'}`}>Hút Tiền:</span>
                <div className="flex gap-2 flex-wrap">
                    {marketIntel?.strongSectors && marketIntel.strongSectors.length > 0 ? marketIntel.strongSectors.map((sec, idx) => {
                        // Trích xuất tên ngành và các mã leader
                        const name = sec.name || sec; // Dự phòng trường hợp data cache bị cũ
                        const tickers = sec.tickers && sec.tickers.length > 0 ? sec.tickers.join(', ') : '';
                        
                        return (
                            <span key={name || idx} className={`px-2.5 py-1 text-[10px] font-black rounded shadow-sm flex items-center gap-1.5 ${emeraldBadge}`}>
                                {name}
                                {tickers && <span className="opacity-80 font-bold tracking-normal text-[9px]">({tickers})</span>}
                            </span>
                        );
                    }) : <span className={`text-[10px] italic ${UI.textMuted}`}>Không có dòng tiền dẫn dắt</span>}
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                <span className={`w-16 shrink-0 text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-red-500' : 'text-red-600'}`}>Rút Vốn:</span>
                <div className="flex gap-2 flex-wrap">
                    {marketIntel?.weakSectors && marketIntel.weakSectors.length > 0 ? marketIntel.weakSectors.map((sec, idx) => {
                        const name = sec.name || sec;
                        const tickers = sec.tickers && sec.tickers.length > 0 ? sec.tickers.join(', ') : '';
                        
                        return (
                            <span key={name || idx} className={`px-2.5 py-1 text-[10px] font-black rounded shadow-sm flex items-center gap-1.5 ${redBadge}`}>
                                {name}
                                {tickers && <span className="opacity-80 font-bold tracking-normal text-[9px]">({tickers})</span>}
                            </span>
                        );
                    }) : <span className={`text-[10px] italic ${UI.textMuted}`}>Áp lực bán không rõ rệt</span>}
                </div>
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`w-full h-screen flex flex-col overflow-hidden font-sans antialiased transition-colors duration-300 ${UI.main}`}>
      
      {/* AUTH SCREEN CONTAINER */}
      {!currentUser && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-[#05080C] bg-[radial-gradient(ellipse_at_center,rgba(250,204,21,0.05),transparent_50%)]">
            <div className="w-[400px] p-8 rounded-3xl border border-white/10 bg-[#0B0F14]/90 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-yellow-400 flex items-center justify-center text-black shadow-[0_0_20px_rgba(250,204,21,0.4)] mb-6">
                    <TrendingUp size={32} />
                </div>
                <h2 className="text-2xl font-black text-white tracking-widest uppercase mb-1">OMNI DUCK</h2>
                <p className="text-[10px] text-yellow-500 tracking-[0.3em] uppercase font-bold mb-6">System Authorization</p>
                
                {authError && (
                    <div className="w-full bg-red-500/10 border border-red-500/50 text-red-400 text-xs font-bold p-3 rounded-lg mb-4 text-center animate-pulse">
                        ⚠️ {authError}
                    </div>
                )}
                
                <form onSubmit={handleAuthSubmit} className="w-full flex flex-col gap-4">
                    <input 
                        type="text" 
                        placeholder="Nhập tên đăng nhập (Tối thiểu 3 ký tự)" 
                        className="w-full h-12 bg-black/50 border border-white/10 rounded-xl px-4 text-white text-sm font-bold outline-none focus:border-yellow-400/50 transition-colors"
                        value={authForm.username}
                        onChange={e => setAuthForm({...authForm, username: e.target.value})}
                    />
                    <input 
                        type="password" 
                        placeholder="Mật khẩu (Tối thiểu 6 ký tự)" 
                        className="w-full h-12 bg-black/50 border border-white/10 rounded-xl px-4 text-white text-sm font-bold outline-none focus:border-yellow-400/50 transition-colors"
                        value={authForm.password}
                        onChange={e => setAuthForm({...authForm, password: e.target.value})}
                    />
                    <button type="submit" className="w-full h-12 mt-2 bg-yellow-400 hover:bg-yellow-300 text-black font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-[0_0_15px_rgba(250,204,21,0.3)]">
                        {authForm.isRegister ? 'Tạo Tài Khoản' : 'Truy Cập Hệ Thống'}
                    </button>
                </form>
                <button 
                    onClick={() => {
                      setAuthForm({...authForm, isRegister: !authForm.isRegister});
                      setAuthError(''); 
                    }} 
                    className="mt-6 text-xs text-slate-400 hover:text-yellow-400 transition-colors"
                >
                    {authForm.isRegister ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
                </button>
            </div>
        </div>
      )}

      {/* TERMINAL MAIN CONTAINER */}
      <div className={`w-full h-full flex flex-col transition-opacity duration-500 ${!currentUser ? 'opacity-0 pointer-events-none blur-md' : 'opacity-100'}`}>
      <header className={`relative z-[999] border-b px-6 py-1 flex items-center justify-between shrink-0 w-full transition-colors duration-300 ${UI.header}`}>

        {/* CONTAINER BRAND LOGO */}
        <div className="flex items-center gap-4 w-[350px] shrink-0">
          <div className="w-11 h-11 rounded-xl bg-yellow-400 flex items-center justify-center text-black font-black shadow-lg shadow-yellow-400/20">
            <TrendingUp size={22} />
          </div>
          <div className="hidden sm:block">
            <h1 className={`text-xl font-black tracking-tight leading-none ${UI.textBold}`}>
              OMNI <span className="text-yellow-400 italic">DUCK</span>
            </h1>
            <p className={`text-[9px] uppercase tracking-widest font-bold mt-1 ${UI.textMuted}`}>
              Quantitative Terminal
            </p>
          </div>
        </div>

        {/* CONTAINER SEARCH & CLOCK CONTROL */}
        <div className="flex-1 flex items-center justify-center gap-8 relative px-4">
              <button 
                  onClick={handleGoHome}
                  title="Trở về Trang chủ (Lịch sử lệnh)"
                  className={`flex-shrink-0 h-12 w-12 flex items-center justify-center rounded-2xl border transition-all active:scale-95 hover:bg-yellow-400 hover:text-black hover:border-yellow-400 ${UI.btnLog}`}
              >
                  <Home size={20} />
              </button>

          <div className="w-full max-w-xl relative">
              <div className={`absolute top-full mt-3 left-1/2 transform -translate-x-1/2 z-[9999] px-6 py-2 bg-red-500/95 backdrop-blur-md text-white font-black text-xs tracking-widest rounded-full shadow-2xl transition-all duration-500 pointer-events-none
                ${errorAlert ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-4 invisible'}`}
              >
                {errorAlert}
              </div>

              <div className={`flex items-center h-12 border rounded-2xl px-4 focus-within:border-yellow-400/50 transition-all ${UI.searchBg}`}>
                <Search size={18} className="text-yellow-400 mr-3" />
                <input
                type="text"
                placeholder={activeMode === 'VN_DERIVATIVES' ? "Chế độ Phái sinh: VN30F1M (Cố định)" : "Nhập mã cổ phiếu..."}
                className={`flex-1 bg-transparent outline-none text-base font-bold uppercase ${UI.searchInput}`}
                value={activeMode === 'VN_DERIVATIVES' ? "VN30F1M" : input} 
                onChange={(e) => { setInput(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                onKeyDown={(e) => e.key === 'Enter' && fetchMarketData()}
                onFocus={() => setShowSuggestions(true)}
                disabled={loadingMarket || activeMode === 'VN_DERIVATIVES'} 
              />
                <button onClick={fetchMarketData} disabled={loadingMarket || !input} className="h-8 px-6 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-black text-xs transition-all active:scale-95 disabled:opacity-50">
                  SEARCH
                </button>
              </div>

              {showSuggestions && suggestions.length > 0 && (
  <div
    className={`absolute top-[calc(100%+8px)] left-0 right-0 border rounded-2xl overflow-y-auto max-h-[420px] z-[99999] shadow-2xl backdrop-blur-2xl ${UI.card}`}
    style={{ isolation: 'isolate' }}
  >
    {suggestions.map(stock => (
      <button
        key={stock.symbol}
        onClick={() => {
          setInput(stock.symbol)
          setSuggestions([])
          setShowSuggestions(false)
        }}
        className={`w-full flex items-center justify-between px-5 py-4 transition-all border-b last:border-0 text-left group ${UI.cardHover}`}
      >
        <div className="flex flex-col min-w-0">
          <p className={`font-black text-base group-hover:text-yellow-500 transition-colors ${UI.textBold}`}>
            {stock.symbol}
          </p>
          <span className={`text-[11px] truncate mt-1 ${UI.textMuted}`}>
            {stock.name}
          </span>
        </div>
        <span
          className={`text-[10px] font-black uppercase bg-slate-500/10 px-2 py-1 rounded shrink-0 ml-3 ${UI.textMuted}`}
        >
          {stock.exchange}
        </span>
      </button>
    ))}
  </div>
)}
          </div>

          <div className="flex items-center gap-4 shrink-0 select-none ml-20">
            <CyberpunkClock marketOpen={marketOpen} theme={theme} />
            <div
              className={`px-4 py-2 rounded-2xl border font-black uppercase tracking-widest text-[11px]
              ${marketOpen
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-[0_0_18px_rgba(16,185,129,0.25)]'
                : 'bg-red-500/10 text-red-400 border-red-500/40 shadow-[0_0_18px_rgba(239,68,68,0.25)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full animate-pulse
                  ${marketOpen ? 'bg-emerald-400' : 'bg-red-400'}`}
                />
                {marketOpen ? 'Market OPEN' : 'Market CLOSED'}
              </div>
            </div>
          </div>
        </div>

        {/* CONTAINER UTILITIES & ACCOUNT DROPDOWN */}
        <div className="flex items-center justify-end gap-3 w-[350px] shrink-0 relative">
          <button onClick={handleToggleTheme} className={`p-2.5 rounded-xl border transition-all ${UI.btnLog}`}>
            {isDark ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} />}
          </button>
          
          <button onClick={() => setShowLogs(!showLogs)} className={`flex items-center gap-2 px-4 h-10 rounded-xl text-[10px] font-black uppercase border transition-all ${showLogs ? 'bg-yellow-400 text-black border-yellow-400' : UI.btnLog}`}>
            <TerminalSquare size={16} />
            <span className="hidden xl:inline">{showLogs ? 'CLOSE' : 'LOGS'}</span>
          </button>

          <div className="relative">
              <button 
                onClick={() => setShowUserMenu(!showUserMenu)} 
                className={`p-2.5 rounded-xl border transition-all ${showUserMenu ? 'bg-emerald-500 border-emerald-500 text-black' : UI.btnLog}`}
              >
                <Menu size={18} />
              </button>

              {showUserMenu && (
    <div className={`absolute top-full right-0 mt-3 w-64 rounded-2xl border shadow-2xl overflow-hidden z-[9999] animate-in slide-in-from-top-2 fade-in duration-200 ${isDark ? 'bg-[#10151C] border-white/10' : 'bg-white border-slate-300'}`}>
        {/* THÔNG TIN USER */}
        <div className={`p-4 border-b ${isDark ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50'}`}>
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 to-emerald-400 flex items-center justify-center text-black">
                    <User size={20} />
                </div>
                <div>
                    <p className={`text-[10px] uppercase tracking-widest font-black ${UI.textMuted}`}>Hệ thống Omni Duck</p>
                    <p className={`font-black text-sm truncate ${UI.textBold}`}>{currentUser}</p>
                </div>
            </div>
        </div>

        {/* BỘ CHỌN THỊ TRƯỜNG */}
        <div className="p-2 flex flex-col gap-1">
            <button onClick={() => { setActiveMode('VN_STOCKS'); setShowUserMenu(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeMode === 'VN_STOCKS' ? 'bg-yellow-400 text-black' : (isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700')}`}>
                <Activity size={16} /> 1. Chứng khoán VN
            </button>

            <button onClick={() => { setActiveMode('VN_DERIVATIVES'); setShowUserMenu(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeMode === 'VN_DERIVATIVES' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : (isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700')}`}>
                <Zap size={16} /> 2. Phái sinh VN
            </button>

            <button onClick={() => { setActiveMode('CRYPTO'); setShowUserMenu(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeMode === 'CRYPTO' ? 'bg-blue-500 text-white' : (isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700')}`}>
                <Globe size={16} /> 3. Tài sản số (Crypto)
            </button>

            <button disabled className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm opacity-40 grayscale cursor-not-allowed text-left">
                <Database size={16} /> 4. Quốc tế (Update sau)
            </button>
        </div>

        {/* ĐĂNG XUẤT */}
        <div className="p-2 border-t border-white/5">
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-500/10 font-bold text-sm transition-colors text-left">
                <X size={16} /> Đăng xuất hệ thống
            </button>
        </div>
    </div>
)}
          </div>
        </div>
      </header>

      {/* GRID CONTAINER: 3 COLUMNS SYSTEM */}
      <div className="flex-1 overflow-hidden flex relative w-full">
{/* ========================================================= */}
        {/* CHẾ ĐỘ 1: CHỨNG KHOÁN VIỆT NAM (CƠ SỞ)                    */}
        {/* ========================================================= */}
        {activeMode === 'VN_STOCKS' && (
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
                        {marketData.companyProfile?.companyName}
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

                  <div className={`rounded-xl p-4 border mb-5 ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                    <p className="text-[10px] uppercase tracking-widest text-yellow-500 font-black mb-1 flex items-center gap-2"><Activity size={12} /> Tổng quan doanh nghiệp</p>
                    <p className={`text-[11px] leading-relaxed italic line-clamp-2 ${UI.textMuted}`}>{marketData.companyProfile?.overview}</p>
                  </div>

                  <button
                    onClick={handleAiAnalysis}
                    disabled={analyzing}
                    className={`w-full h-12 rounded-xl hover:bg-yellow-400 hover:text-black font-black transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 mb-6 ${isDark ? 'bg-white text-black' : 'bg-slate-900 text-white'}`}
                  >
                    <BrainCircuit size={18} />
                    {analyzing ? 'AI ĐANG TƯ DUY...' : 'PHÂN TÍCH VỚI OMNI DUCK'}
                  </button>

                  <div className={`h-[6px] w-full shrink-0 relative overflow-hidden rounded-full ${isDark ? 'bg-white/5' : 'bg-slate-200'}`}>
                    {loadingMarket && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400 to-transparent animate-shimmer shadow-[0_0_15px_rgba(250,204,21,1)]" style={{ backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite linear' }} />}
                  </div>
              </div>

              {/* ROW PANEL: NEWS STREAM */}
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

                  {(marketData.deepNewsData || []).map((news, index) => (
                    <a key={index} href={news.link} target="_blank" rel="noopener noreferrer" className={`block rounded-2xl p-4 transition-all cursor-pointer group border ${UI.cardHover} ${news.isAiGenerated ? (isDark ? 'bg-[#1a1025] border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-purple-50 border-purple-400') : (isDark ? 'bg-[#10151C]' : 'bg-white')}`}>
                      <h3 className={`font-bold text-sm leading-snug transition-colors ${news.isAiGenerated ? 'text-purple-400 group-hover:text-purple-300' : `group-hover:text-yellow-500 ${UI.textNormal}`}`}>
                          {news.title}
                      </h3>
                      <div className="mt-3 flex justify-between items-center gap-3">
                        <div className="flex gap-2 items-center flex-1 min-w-0">
                           <span className={`shrink-0 text-[9px] px-2 py-1 rounded font-black uppercase tracking-widest ${news.isAiGenerated ? 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.5)]' : (isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500')}`}>
                             {news.isAiGenerated ? 'AI FOUND' : `SOURCE ${index + 1}`}
                           </span>
                           <span className={`text-[10px] font-medium truncate ${UI.textMuted}`}>
                               {news.date && <span className={`${news.isAiGenerated ? 'text-purple-300' : 'text-yellow-500'} font-bold mr-1`}>{news.date}</span>}
                               <span className="opacity-60 italic">• {news.source || news.link || 'Internet'}</span>
                           </span>
                        </div>
                        <Globe size={14} className={`shrink-0 ${news.isAiGenerated ? 'text-purple-500' : UI.textMuted} group-hover:text-yellow-500 transition-colors`} />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        {renderMarketOverview()}
        </div>

        {/* GRID COLUMN 2: ANALYTICAL VIEW & CHARTS */}
        <div className={`flex-1 overflow-y-auto p-8 lg:p-12 relative transition-colors duration-300 ${UI.rightCol} border-r ${UI.border}`}>
          
          {!marketData && !analyzing && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-700">
                <div className="flex items-center justify-between border-b pb-4 mb-2">
                    <div>
                        <h2 className={`text-2xl font-black tracking-tight ${UI.textBold}`}>CÁC MÃ GẦN ĐÂY</h2>
                        <p className={`text-[10px] uppercase tracking-[0.2em] font-bold text-yellow-500 mt-1`}>Personal Intelligence Feed</p>
                    </div>
                    <button onClick={fetchUserHistory} className={`p-2 rounded-lg border ${UI.btnLog}`}><Activity size={16}/></button>
                </div>

                <div className="grid grid-cols-1 gap-4">
    {userHistory.slice(0, historyLimit).map((item, idx) => {
        const changePercent = parseFloat(item.changePercent) || 0;
        const isUp = changePercent > 0;
        const isDown = changePercent < 0;
        const formattedPercent = Math.abs(changePercent).toFixed(2);

        return (
            <div 
                key={idx}
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
                        <p className="text-[10px] font-bold text-slate-500 uppercase whitespace-normal leading-tight">
                            {item.companyName || 'N/A'}
                        </p>
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
                        <p className="text-[9px] font-bold text-slate-500 italic">
                            Cập nhật: {new Date(item.timestamp).toLocaleString('vi-VN')}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-y-1.5 min-w-[110px] shrink-0 pl-4">
                    <span className={`px-4 py-1.5 rounded-full font-black text-[10px] uppercase border tracking-tight ${
                        item.lastAction?.includes('MUA') ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 
                        item.lastAction?.includes('BÁN') ? 'bg-red-500/20 text-red-400 border-red-500/30' : 
                        'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    }`}>
                        {item.lastAction || 'QUAN SÁT'}
                    </span>
                </div>
            </div>
        );
    })}
</div>

                {userHistory.length > historyLimit && (
                    <button 
                        onClick={() => setHistoryLimit(prev => prev + 3)}
                        className={`w-full py-4 rounded-2xl border-2 border-dashed font-black text-[10px] tracking-[0.3em] uppercase transition-all ${UI.btnLog}`}
                    >
                        Tải thêm dữ liệu (+3)
                    </button>
                )}
            </div>
          )}

          {marketData && chartData && (
            <div className={`mb-8 border rounded-[40px] p-8 shadow-xl transition-colors duration-300 flex flex-col h-[600px] ${UI.card}`}>
              <div className={`flex items-center gap-3 mb-6 pb-4 border-b shrink-0 ${UI.border}`}>
                <BarChart3 className="text-yellow-500" size={24} />
                <h3 className={`font-black tracking-widest uppercase text-lg ${UI.textBold}`}>Biểu đồ Kỹ thuật ({marketData.stockInfo.symbol})</h3>
              </div>
              <div className="flex-1 w-full min-h-0 relative rounded-xl overflow-hidden">
                <TradingChart key={marketData.stockInfo.symbol} data={chartData} theme={theme} onIntervalChange={handleIntervalChange} />
              </div>
            </div>
          )}

          {showLogs && (
            <div className={`absolute top-4 right-8 w-96 border rounded-2xl shadow-2xl z-[200] overflow-hidden ${isDark ? 'bg-black/90 border-white/10' : 'bg-white/95 border-slate-200'}`}>
              <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                <span className={`text-[10px] font-black uppercase tracking-widest ${UI.textMuted}`}>Terminal Output</span>
                <button onClick={() => setShowLogs(false)} className={`${UI.textMuted} hover:${UI.textBold}`}><X size={16} /></button>
              </div>
              <div className={`p-4 h-64 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1 ${isDark ? 'text-emerald-400/80' : 'text-emerald-600'}`}>
                {logs.map((log, index) => <div key={index} className={`border-b pb-1 last:border-0 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>{log}</div>)}
              </div>
            </div>
          )}

          {!marketData && !analyzing && !aiReport && (
            <div className={`h-full rounded-[40px] border-2 border-dashed flex flex-col items-center justify-center ${isDark ? 'border-white/5 text-slate-700' : 'border-slate-200 text-slate-400'}`}>
              <BarChart3 size={80} className="mb-6 opacity-20" />
              <p className="uppercase tracking-[0.3em] text-[10px] font-black opacity-50">Hệ thống đang chờ lệnh</p>
            </div>
          )}

          {analyzing && (
            <div className={`h-full rounded-[40px] border flex flex-col items-center justify-center shadow-xl ${UI.card}`}>
              <div className="w-16 h-16 rounded-full border-4 border-yellow-400 border-t-transparent animate-spin mb-8" />
              <h2 className="text-yellow-500 font-black text-sm tracking-[0.3em] uppercase animate-pulse">OMNI DUCK ĐANG TƯ DUY...</h2>
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
                        </div>
                    </div>
                    <p className={`text-sm font-bold italic ${UI.textNormal}`}>
                        Lý do: {actionData.reason}
                    </p>
                </div>
              )}

              <div className={`flex items-center gap-5 mb-10 pb-8 border-b ${UI.border}`}>
                <div className="w-16 h-16 rounded-3xl bg-yellow-400 text-black flex items-center justify-center shadow-xl shadow-yellow-400/20 shrink-0"><Zap size={28} /></div>
                <div>
                  <h2 className={`text-3xl lg:text-4xl font-black tracking-tight uppercase ${UI.textBold}`}>Strategic Intelligence</h2>
                  <p className="text-yellow-500 uppercase tracking-[0.3em] text-[10px] font-black mt-2">Omni Duck AI Framework</p>
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
                <div className="flex-1 min-h-0"><MarketRadar data={vnIndexData} theme={theme} color="#facc15" /></div>
              </div>
              <div className="flex-1 p-3 flex flex-col">
                <span className="text-[9px] font-black text-sky-400 mb-1">HNX-INDEX</span>
                <div className="flex-1 min-h-0"><MarketRadar data={hnxIndexData} theme={theme} color="#38bdf8" /></div>
              </div>
            </div>
            <div className="h-3/5 p-4 flex flex-col">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">VN30 Premium</span>
                <Activity size={14} className="text-emerald-500" />
              </div>
              <div className="flex-1 min-h-0 rounded-xl bg-black/20 border border-white/5 overflow-hidden">
                <MarketRadar data={vn30Data} theme={theme} color="#10b981" />
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
</>
      )}
      {/* ========================================================= */}
        {/* CHẾ ĐỘ 2: PHÁI SINH VIỆT NAM (VN30F1M)                    */}
        {/* ========================================================= */}
        {activeMode === 'VN_DERIVATIVES' && (
         
            <>
                {/* CỘT TRÁI PHÁI SINH: VN30 ENGINE & BASIS RADAR */}
                <div className={`w-[450px] border-r flex flex-col shrink-0 overflow-hidden relative h-full transition-colors duration-300 ${UI.leftCol} animate-in fade-in slide-in-from-left-4`}>
                    
                    {/* 🚀 1. HEADER CARD: GIÁ & BASIS */}
                    <div className={`p-6 border-b shadow-xl relative transition-colors duration-300 ${UI.card}`}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <div className="flex items-end gap-2">
                                    <h2 className="text-4xl font-black tracking-tighter text-orange-500 leading-none">
                                        VN30F1M
                                    </h2>
                                    <span className="p-1 px-2 bg-orange-500/10 text-orange-500 rounded text-[10px] font-black uppercase tracking-widest mb-1">
                                        LIVE
                                    </span>
                                </div>
                                <p className={`text-[11px] font-bold mt-2 uppercase tracking-widest ${UI.textMuted}`}>
                                    Hợp đồng tương lai VN30
                                </p>
                            </div>

                            <div className="text-right">
                                <p className={`text-[10px] uppercase tracking-widest font-black mb-1 ${UI.textMuted}`}>Giá Hiện Tại</p>
                                <h2 className={`text-3xl font-black leading-none ${UI.textBold}`}>
                                    {derivRadar?.vn30f1m || '---'}
                                </h2>
                                {/* Biến động giá so với phiên trước */}
                                <div className={`flex items-center justify-end gap-1 font-black text-sm mt-2 ${Number(derivRadar?.change) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {Number(derivRadar?.change) >= 0 ? '▲' : '▼'}
                                    <span>{Math.abs(derivRadar?.change || 0)} ({derivRadar?.changePercent || 0}%)</span>
                                </div>
                            </div>
                        </div>

                        {/* 🚀 BOX BASIS: ĐIỂM NHẤN PHÁI SINH */}
                        <div className="grid grid-cols-2 gap-3 mt-6">
<div className={`p-3 rounded-2xl border flex flex-col items-center ${isDark ? 'bg-black/40 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
                                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">VN30 INDEX</span>
                                <span className="text-lg font-black text-white">{derivRadar?.vn30 || '---'}</span>
                            </div>
                            <div className={`p-3 rounded-2xl border flex flex-col items-center shadow-lg transition-all duration-500 ${!derivRadar ? 'bg-black/40 border-white/5' : Number(derivRadar.basis) >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                                <span className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1 ${!derivRadar ? 'text-slate-500' : Number(derivRadar.basis) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>ĐỘ LỆCH (BASIS)</span>
                                <span className={`text-lg font-black ${!derivRadar ? 'text-slate-500' : Number(derivRadar.basis) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {derivRadar?.basis > 0 ? `+${derivRadar.basis}` : derivRadar?.basis || '---'}
                                </span>
                            </div>
                        </div>
                    </div> 

                    {/* 🚀 2. PHẦN CUỘN: TRỤ DẪN DẮT & WIDGETS */}
                    <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                        <h3 className="text-[11px] font-black text-slate-400 uppercase mb-4 tracking-widest">Trụ dẫn dắt VN30</h3>
                        <div className="flex flex-col gap-3">
                            {derivRadar?.influencers?.map(stock => (
                                <div key={stock.symbol} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isDark ? 'bg-white/5 border-white/5' : 'bg-white border-slate-200'}`}>
                                    <span className="font-black text-sm text-yellow-400 w-12">{stock.symbol}</span>
                                    <div className="flex-1 mx-4 h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                                        <div 
                                            className={`${Number(stock.change) >= 0 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'} h-full transition-all duration-500`} 
                                            style={{width: `${Math.min(Math.abs(Number(stock.change)) * 20, 100)}%`}}
                                        ></div>
                                    </div>
                                    <span className={`text-[11px] font-black w-14 text-right ${Number(stock.change) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {stock.change > 0 ? '+' : ''}{stock.change}%
                                    </span>
                                </div>
                            ))}
                        </div>
                        
                        {/* WIDGET OI & FOREIGN */}
                        <div className="mt-8 grid grid-cols-2 gap-4 pb-10">
    <div className={`p-4 rounded-2xl border ${isDark ? 'bg-black/40 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Vị thế mở (OI)</p>
        <p className={`text-lg font-black ${UI.textBold}`}>{derivRadar?.oi?.toLocaleString() || '---'}</p>
    </div>
    <div className={`p-4 rounded-2xl border ${isDark ? 'bg-black/40 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Ngoại Long (Net)</p>
        <p className="text-lg font-black text-orange-500">+{derivRadar?.foreignNet || '---'}</p>
    </div>
</div>
                    </div>
                </div>

               {/* CỘT PHẢI PHÁI SINH: EXECUTION FLOW */}
<div className={`flex-1 overflow-y-auto p-8 relative transition-colors duration-300 ${UI.rightCol} animate-in fade-in`}>
    
    {/* HEADER CHIẾN THUẬT */}
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
            <Zap className="text-orange-500" size={24} />
            <h3 className={`font-black tracking-widest uppercase text-lg ${UI.textBold}`}>Derivatives Execution Flow</h3>
        </div>
        <div className="flex gap-2">
            <span className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-500 text-[10px] font-black uppercase">Scalping Mode ON</span>
        </div>
    </div>

    {/* CHART AREA WITH VOLUME PROFILE MOCKUP */}
    <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="col-span-3 h-[500px] bg-black/40 rounded-3xl border border-orange-500/20 overflow-hidden shadow-2xl relative">
            {derivChartData ? (
                <TradingChart 
                    data={derivChartData} 
                    theme={theme} 
                    onIntervalChange={setDerivInterval} 
                />
            ) : (
                <div className="flex-1 h-full flex flex-col items-center justify-center opacity-30">
                    <BarChart3 size={60} className="animate-pulse" />
                </div>
            )}
        </div>

        {/* VOLUME PROFILE SIDEBAR: Nhìn vùng giá kẹt lệnh */}
        <div className="col-span-1 bg-black/20 rounded-3xl border border-white/5 p-4 flex flex-col">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4">Volume Profile (Intraday)</p>
            <div className="flex-1 flex flex-col gap-1 justify-around">
                {[2085, 2080, 2075, 2070, 2065].map(price => (
                    <div key={price} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400 w-8">{price}</span>
                        <div className="flex-1 h-3 bg-slate-800 rounded-sm overflow-hidden flex">
                            <div className="bg-orange-500/40 h-full" style={{width: `${Math.random() * 80}%`}}></div>
                        </div>
                    </div>
                ))}
            </div>
            <p className="text-[9px] font-bold text-orange-400 mt-4 text-center italic">Vùng tranh chấp mạnh: 2072.5</p>
        </div>
    </div>

    {/* AI SCALPING ASSISTANT: Nơi ra lệnh thực chiến */}
    <div className={`p-6 rounded-[32px] border-2 transition-all duration-500 ${isDark ? 'bg-[#10151C] border-orange-500/30 shadow-[0_0_30px_rgba(249,115,22,0.1)]' : 'bg-orange-50 border-orange-200'}`}>
        <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/40"><BrainCircuit size={20}/></div>
            <div>
                <h4 className={`text-sm font-black uppercase tracking-widest ${UI.textBold}`}>AI Scalping Assistant</h4>
                <p className="text-[9px] font-bold text-orange-500 uppercase">Real-time Strategy Engine</p>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-500">
                    <TrendingUp size={16} />
                    <span className="text-xs font-black uppercase tracking-widest">Kịch bản LONG</span>
                </div>
                <p className={`text-xs leading-relaxed italic ${UI.textMuted}`}>
                    "Ưu tiên LONG nếu Basis co hẹp về -1.5 và VCB giữ được mốc tham chiếu. Cản mạnh tại 2085."
                </p>
            </div>
            <div className="space-y-4 border-l border-white/10 pl-8">
                <div className="flex items-center gap-2 text-red-500">
                    <Activity size={16} />
                    <span className="text-xs font-black uppercase tracking-widest">Kịch bản SHORT</span>
                </div>
                <p className={`text-xs leading-relaxed italic ${UI.textMuted}`}>
                    "Canh SHORT khi VN30F1M thủng 2068 với Volume lớn. Trụ VHM đang có dấu hiệu bị xả mạnh."
                </p>
            </div>
        </div>
    </div>
</div>
            </>
        )}

        {/* ========================================================= */}
        {/* CHẾ ĐỘ 3: CRYPTO TERMINAL                                 */}
        {/* ========================================================= */}
        {activeMode === 'CRYPTO' && (
            <div className="flex-1 flex flex-col items-center justify-center opacity-50 animate-in zoom-in-95 duration-500">
                <Globe size={80} className="text-blue-500 mb-6" />
                <h2 className="text-3xl font-black text-blue-500 tracking-[0.3em] uppercase">Tài sản số</h2>
                <p className="text-sm font-bold mt-2 text-slate-400 uppercase tracking-widest">Khu vực đang được phát triển...</p>
            </div>
        )}

        </div>
      </div>
      

      {/* COMPONENT: FULL PDF MODAL VIEWER */}
      {showPdfModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 lg:p-12">
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