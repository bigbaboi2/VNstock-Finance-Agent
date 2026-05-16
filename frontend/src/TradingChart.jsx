import React, { useEffect, useRef, useState } from 'react';
import { init, dispose, registerIndicator, registerOverlay } from 'klinecharts';
import { 
  Pencil, MoveHorizontal, Baseline, Type, Trash2, 
  Settings2, ChevronDown, Check, BarChart2, Clock, RefreshCw, ChevronLeft, ChevronRight
} from 'lucide-react';
// ==========================================================
// ĐĂNG KÝ CÔNG CỤ VẼ CHỮ (CUSTOM TEXT OVERLAY LÕI CỨNG)
// ==========================================================
registerOverlay({
  name: 'omni_text_v2', 
  totalStep: 1, // 🚀 KHẲNG ĐỊNH CHỈ CẦN 1 CLICK LÀ VẼ XONG
  needDefaultPointFigure: false,  
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigure: ({ overlay, coordinates }) => { 
    if (!coordinates || coordinates.length === 0) return [];
    
    // Lấy màu từ cấu hình Tool
    const color = overlay.styles?.text?.color || '#FF9600';
    
    const figures = [
      {
        type: 'text',
        attrs: {
          x: coordinates[0].x, 
          y: coordinates[0].y,
          text: overlay.extendData || '',
          align: 'center', // 🚀 Đổi thành center cho nó ngay chính giữa mũi tên chuột
          baseline: 'middle'
        },
        styles: { color: color, size: 14, family: 'Inter, sans-serif', weight: 'bold' }
      }
    ];
    
    // Nút tròn kéo thả
    if (overlay.selected) {
      figures.push({
        type: 'circle',
        attrs: { x: coordinates[0].x, y: coordinates[0].y, r: 4 }, 
        styles: { color: color, style: 'fill' }
      });
    }
    return figures;
  }
});
// ==========================================================
// LÕI CUSTOM VOLUME & BẮN TỌA ĐỘ KÉP (CHẠY VĨNH VIỄN)
// ==========================================================
registerIndicator({
  name: 'TV_VOL_OVERLAY',
  shortName: 'VOL',
  calcParams: [true], // [0] = true (Hiện Cột), false (Ẩn Cột)
  
  // FIX LỖI CRASH KHI BẬT MA/BOLL: Bắt buộc phải tạo mảng mới để không xung đột vùng nhớ với các chỉ báo khác!
  calc: (dataList) => {
    return dataList.map(k => ({
      volume: k.volume || 0,
      open: k.open || 0,
      close: k.close || 0
    }));
  },

  draw: ({ ctx, bounding, visibleRange, indicator, xAxis, yAxis }) => {
    const { height } = bounding;
    const dataList = indicator.result;
    const dataLen = dataList.length;
    if (dataLen === 0) return true;

    const showVol = indicator.calcParams[0];

    // 🚀 BƯỚC 1: TÍNH barWidth VÀ maxVol TRƯỚC KHI VẼ
    const p0 = xAxis.convertToPixel(0);
    const p1 = xAxis.convertToPixel(1);
    const barWidth = Math.max(Math.abs(p1 - p0) * 0.8, 1); 

    let maxVol = 0;
    // Quét tìm Max Volume trong vùng đang nhìn thấy để tính tỷ lệ độ cao cột
    for (let i = visibleRange.from; i < visibleRange.to; i++) {
        if (dataList[i] && dataList[i].volume > maxVol) maxVol = dataList[i].volume;
    }

    // 🚀 BƯỚC 2: CẬP NHẬT TỌA ĐỘ KÉP (DÙNG CHO NHÃN GIÁ BÁM MÉP)

    const latestData = dataList[dataLen - 1];
    let edgeIndex = Math.min(visibleRange.to - 1, dataLen - 1);
    const edgeData = dataList[edgeIndex];

    if (latestData && edgeData && yAxis) {
        window.__omniduck_dual_tags = {
            showVol: showVol,
            latest: {
                price: latestData.close,
                priceY: yAxis.convertToPixel(latestData.close),
                vol: latestData.volume || 0,
                volY: height - (maxVol > 0 ? ((latestData.volume || 0) / maxVol) * (height * 0.25) : 0),
                isUp: latestData.close >= latestData.open
            },
            edge: {
                isLatest: edgeIndex === dataLen - 1, 
                price: edgeData.close,
                priceY: yAxis.convertToPixel(edgeData.close),
                vol: edgeData.volume || 0,
                volY: height - (maxVol > 0 ? ((edgeData.volume || 0) / maxVol) * (height * 0.25) : 0),
                isUp: edgeData.close >= edgeData.open
            }
        };
        window.dispatchEvent(new Event('omniduck_update_dual_tags'));
    }

    // 🚀 BƯỚC 3: VẼ CỘT VOLUME (CHỈ VẼ KHI ĐƯỢC BẬT)
    if (showVol && maxVol > 0) {
        for (let i = visibleRange.from; i < visibleRange.to; i++) {
          const data = dataList[i];
          if (!data || !data.volume) continue;
          
          const isUp = data.close >= data.open;
          const x = xAxis.convertToPixel(i);
          const barHeight = (data.volume / maxVol) * (height * 0.25);
          const y = height - Math.max(barHeight, 1);

          ctx.fillStyle = isUp ? 'rgba(8, 153, 129, 0.35)' : 'rgba(242, 54, 69, 0.35)';
          ctx.fillRect(x - barWidth / 2, y, barWidth, Math.max(barHeight, 1));
        }
    }
    return true; 
  },
  createTooltipDataSource: () => ({ name: '', calcParamsText: '', values: [] })
});

export default function TradingChart({ data, theme, onIntervalChange, currentInterval }) {
  const chartContainerRef = useRef(null);
  const chartInstance = useRef(null);
  const [interval, setInterval] = useState(currentInterval || '1 ngày');

  const [showIntervalMenu, setShowIntervalMenu] = useState(false);
  const priceLabelLatestRef = useRef(null); 
  const volLabelLatestRef = useRef(null);   
  const priceLabelEdgeRef = useRef(null);   
  const volLabelEdgeRef = useRef(null);     
  const topBarRef = useRef(null);
  
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [activeMain, setActiveMain] = useState([]); 
  const [activeSub, setActiveSub] = useState(['VOL']); 
  const [chartType, setChartType] = useState('candle_solid'); 

  const [activeOverlay, setActiveOverlay] = useState(null);
const [inlineInput, setInlineInput] = useState(null);
  const isAddingTextRef = useRef(false);
  const [isAddingTextState, setIsAddingTextState] = useState(false); 
  const [overlayColor, setOverlayColor] = useState('#FF9600');
  const isFinishingRef = useRef(false); 
  const [textColor, setTextColor] = useState('#FF9600');
  const handleFinishText = (text) => {
      if (isFinishingRef.current) return;
      isFinishingRef.current = true;

      if (text && text.trim() && inlineInput) {
          // Bắt buộc phải có thêm dataIndex phòng hờ click vào khoảng trắng
          const point = { value: inlineInput.value };
          if (inlineInput.timestamp) point.timestamp = inlineInput.timestamp;
          if (inlineInput.dataIndex !== undefined) point.dataIndex = inlineInput.dataIndex;

          chartInstance.current?.createOverlay({
              name: 'custom_text', 
              extendData: { text: text.trim(), color: overlayColor }, // 🚀 BẮN MÀU VÀ CHỮ VÀO LÕI
              points: [point], 
              lock: false,
              onSelected: (info) => {
                  if (info) setActiveOverlay({ id: info.overlay?.id || info.id });
              },
              onDeselected: () => setActiveOverlay(null)
          });
      }
      
      setInlineInput(null); 
      setIsAddingTextState(false);
      isAddingTextRef.current = false;
      setTimeout(() => { isFinishingRef.current = false; }, 100);
  };
const handleScrollLeft = () => {
    if (chartInstance.current) chartInstance.current.scrollByDistance(chartInstance.current.getBarSpace());
  };
  const handleScrollRight = () => {
    if (chartInstance.current) chartInstance.current.scrollByDistance(-chartInstance.current.getBarSpace());
  };
  const handleResetChart = () => {
    if (chartInstance.current) {
      chartInstance.current.setBarSpace(6); // Trả độ zoom (độ rộng nến) về mặc định
      chartInstance.current.scrollToRealTime(); // Cuộn bay thẳng về cây nến mới nhất
    }
  };
  const isDark = theme === 'dark';
  const prevIntervalRef = useRef(interval);

  // ==========================================================
  // 1. KHỞI TẠO BIỂU ĐỒ & UI
  // ==========================================================
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = init(chartContainerRef.current);
      
      chartInstance.current.createIndicator({ name: 'TV_VOL_OVERLAY', calcParams: [true] }, true, { id: 'candle_pane' });
      activeSub.forEach(ind => {
        if (ind !== 'VOL') chartInstance.current.createIndicator(ind, false, { id: `pane_${ind}`, height: 120 });
      });
    }

    const chart = chartInstance.current;
    const upColor = '#089981';   
    const downColor = '#F23645'; 
    const noChangeColor = upColor;
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.12)'; 
    chart.setCustomApi({
        formatDate: (dateTimeFormat, timestamp, format, type) => {
            const d = new Date(timestamp); 
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = d.getMonth() + 1; // 1 đến 12
            const yyyy = d.getFullYear();
            const hh = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            
            // 🚀 XỬ LÝ TRỤC X ĐÁY BIỂU ĐỒ (Zoom linh hoạt như TradingView)
            if (type === 2 || type === 'xAxis') {
                switch (format) {
                    case 'YYYY': return `${yyyy}`; // Zoom cực xa chỉ hiện Năm
                    case 'YYYY-MM': return `${String(mm).padStart(2,'0')}/${yyyy}`; // Xa vừa
                    case 'MM-DD': return `${dd}/${String(mm).padStart(2,'0')}`; // Gần
                    case 'YYYY-MM-DD': return `${dd}/${String(mm).padStart(2,'0')}/${yyyy}`;
                    case 'HH:mm': return `${hh}:${min}`; // Khung siêu nhỏ
                    case 'MM-DD HH:mm': return `${dd}/${String(mm).padStart(2,'0')} ${hh}:${min}`;
                    default: return `${dd}/${String(mm).padStart(2,'0')}/${yyyy}`;
                }
            }
            
            // 🚀 XỬ LÝ NHÃN CON TRỎ CHUỘT BÁM THEO (Loại bỏ 7h sáng rác)
            // Nếu giờ là 07:00 hoặc 00:00 -> Đích thị là nến Ngày/Tuần/Tháng -> Bỏ giờ phút đi
            const isDaily = (hh === '07' && min === '00') || (hh === '00' && min === '00');
            
            if (isDaily) {
                return `${dd} Tháng ${mm}, ${yyyy}`;
            } else {
                return `${dd} Tháng ${mm}, ${yyyy} ${hh}:${min}`;
            }
        }
    });
    chart.setStyles({
      grid: { show: true, horizontal: { show: true, color: gridColor, style: 'solid', size: 1 }, vertical: { show: true, color: gridColor, style: 'solid', size: 1 } },
      separator: { size: 1, color: gridColor, fill: false, activeBackgroundColor: 'transparent' },
      candle: {
        type: chartType === 'heikin_ashi' ? 'candle_solid' : chartType,        
        bar: { 
            upColor, 
            downColor, 
            noChangeColor: noChangeColor,           // Áp dụng màu Xanh
            upBorderColor: upColor, 
            downBorderColor: downColor, 
            noChangeBorderColor: noChangeColor,     // Áp dụng màu Xanh
            upWickColor: upColor, 
            downWickColor: downColor, 
            noChangeWickColor: noChangeColor        // Áp dụng màu Xanh
        },
        margin: { top: 0.2, bottom: 0.05 }, 
        priceMark: { show: false }, 
        tooltip: { showRule: 'none' } 
      },
      indicator: {
        ohlc: { upColor, downColor },
        bars: [{ upColor, downColor, noChangeColor: noChangeColor }], 
        lines: [
            { style: 'solid', size: 1.5, color: '#FF9600' },
            { style: 'solid', size: 1.5, color: '#9D65C9' },
            { style: 'solid', size: 1.5, color: '#2196F3' },
            { style: 'solid', size: 1.5, color: '#E11D74' },
            { style: 'solid', size: 1.5, color: '#01C5C4' }
        ],
        tooltip: { showRule: 'always', text: { family: 'Inter, sans-serif', size: 12, color: isDark ? '#9CA3AF' : '#4B5563', weight: '600' } }
      },
      xAxis: { show: true, height: 35, axisLine: { color: isDark ? '#374151' : '#D1D5DB' }, tickText: { color: isDark ? '#9CA3AF' : '#6B7280', family: 'Inter, sans-serif', size: 11, weight: '500' } },
      yAxis: { show: true, width: 60, axisLine: { color: isDark ? '#374151' : '#D1D5DB' }, tickText: { color: isDark ? '#9CA3AF' : '#6B7280', family: 'Inter, sans-serif', size: 11, weight: '500' } },
      crosshair: {
        show: true,
        horizontal: { line: { show: true, style: 'dashed', color: isDark ? '#4B5563' : '#9CA3AF' }, text: { show: true, color: '#ffffff', size: 11, family: 'Inter, sans-serif', paddingLeft: 4, paddingRight: 4, paddingTop: 4, paddingBottom: 4, backgroundColor: isDark ? '#374151' : '#6B7280' } },
        vertical: { line: { show: true, style: 'dashed', color: isDark ? '#4B5563' : '#9CA3AF' }, text: { show: true, color: '#ffffff', size: 11, family: 'Inter, sans-serif', paddingLeft: 4, paddingRight: 4, paddingTop: 4, paddingBottom: 4, backgroundColor: isDark ? '#374151' : '#6B7280' } }
      },
      overlay: {
        point: {
          color: '#df8d1aff',
          borderColor: 'rgba(255, 150, 0, 0.3)',
          borderSize: 4,
          radius: 3, // Làm to chấm tròn lên 6px để dễ cầm nắm
          activeColor: '#FF9600',
          activeBorderColor: 'rgba(255, 150, 0, 0.5)',
          activeBorderSize: 4,
          activeRadius: 5, // Khi chạm vào sẽ nở to ra 8px
        },
        line: { color: '#FF9600', size: 2 },
        polygon: { style: 'fill', color: '#FF9600', fill: { color: 'rgba(255, 150, 0, 0.1)' } }
      }
    });

    const handleChartClick = (e) => {
        if (isAddingTextRef.current && chartContainerRef.current) {
            const rect = chartContainerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const coords = chart.convertFromPixel([{ x, y }], { paneId: 'candle_pane' });
            
            if (coords && coords.length > 0) {
                isAddingTextRef.current = false;
                setIsAddingTextState(false); 
                
                setInlineInput({ 
                    x, y, 
                    timestamp: coords[0].timestamp, 
                    dataIndex: coords[0].dataIndex, // 🚀 BẮT BUỘC PHẢI CÓ DÒNG NÀY 
                    value: coords[0].value 
                });
            }
        }
    };

    const domContainer = chartContainerRef.current;
    // Dùng tham số "true" (Capture phase) để chặn bắt click trước khi KlineCharts kịp "nuốt"
    domContainer.addEventListener('click', handleChartClick, true);

    chart.subscribeAction('onScroll', () => setActiveOverlay(null));
    chart.subscribeAction('onZoom', () => setActiveOverlay(null));

    // Dọn dẹp sự kiện khi component load lại
    return () => {
        domContainer.removeEventListener('click', handleChartClick, true);
    };
  }, [theme, isDark, chartType]);

  
  // ==========================================================
  // 1.5. VÒNG ĐỜI HỦY BIỂU ĐỒ (TÁCH RIÊNG)
  // ==========================================================
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => { if (chartInstance.current) chartInstance.current.resize(); });
    if (chartContainerRef.current) resizeObserver.observe(chartContainerRef.current);
    return () => {
      resizeObserver.disconnect();
      if (chartInstance.current && chartContainerRef.current) { 
        dispose(chartContainerRef.current); 
        chartInstance.current = null; 
      }
    };
  }, []);
// ==========================================================
  // 2. NẠP DỮ LIỆU & THUẬT TOÁN HEIKIN ASHI
  // ==========================================================
  useEffect(() => {
    if (!chartInstance.current || !data || data.length === 0) return;
    
    // 🚀 LÕI PHÂN TÍCH NGÀY THÁNG "BỌC THÉP" (Xử lý mọi định dạng từ Backend)
    const formattedData = data.map(d => {
        let parsedTimestamp = 0;
        let timeVal = d.time || d.date; // Đề phòng API trả về biến d.date thay vì d.time

        if (timeVal !== undefined && timeVal !== null) {
            // Trường hợp 1: Backend trả về chuỗi số (VD: "1715669400") -> Ép về kiểu Số
            if (typeof timeVal === 'string' && !isNaN(timeVal) && timeVal.trim() !== '') {
                timeVal = Number(timeVal);
            }

            // Trường hợp 2: Số nguyên (UNIX Timestamp)
            if (typeof timeVal === 'number') {
                parsedTimestamp = timeVal > 9999999999 ? timeVal : timeVal * 1000;
            } 
            // Trường hợp 3: Chuỗi văn bản Ngày Tháng
            else if (typeof timeVal === 'string') {
                if (timeVal.includes('/')) {
                    const datePart = timeVal.split(' ')[0]; 
                    const parts = datePart.split('/');
                    
                    if (parts.length === 3) {
                        // Nếu là định dạng YYYY/MM/DD
                        if (parts[0].length === 4) {
                            parsedTimestamp = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]).getTime();
                        } else {
                            // Mặc định: DD/MM/YYYY (Việt Nam)
                            parsedTimestamp = new Date(parts[2], parseInt(parts[1]) - 1, parts[0]).getTime();
                        }
                    } else if (parts.length === 2) {
                        // Nếu là MM/YYYY (Gom nến theo tháng)
                        parsedTimestamp = new Date(parts[1], parseInt(parts[0]) - 1, 1).getTime();
                    }
                } else {
                    // Chuẩn quốc tế YYYY-MM-DD
                    let timeStr = timeVal.includes(' ') && !timeVal.includes('T') ? timeVal.replace(' ', 'T') : timeVal;
                    parsedTimestamp = new Date(timeStr).getTime();
                }
            }
        }

        return {
            timestamp: parsedTimestamp, 
            open: Number(d.open) || 0, 
            high: Number(d.high) || 0, 
            low: Number(d.low) || 0, 
            close: Number(d.close) || 0, 
            volume: Number(d.value) || Number(d.volume) || 0
        };
    }).filter(d => !isNaN(d.timestamp) && d.timestamp > 0).sort((a, b) => a.timestamp - b.timestamp);

    let displayData = formattedData;

    // 🧠 THUẬT TOÁN HEIKIN ASHI
    if (chartType === 'heikin_ashi') {
        displayData = [];
        for (let i = 0; i < formattedData.length; i++) {
            const curr = formattedData[i];
            if (i === 0) {
                displayData.push({ ...curr });
            } else {
                const prevHA = displayData[i - 1];
                const haClose = (curr.open + curr.high + curr.low + curr.close) / 4;
                const haOpen = (prevHA.open + prevHA.close) / 2;
                const haHigh = Math.max(curr.high, haOpen, haClose);
                const haLow = Math.min(curr.low, haOpen, haClose);
                displayData.push({
                    ...curr,
                    open: haOpen,
                    high: haHigh,
                    low: haLow,
                    close: haClose
                });
            }
        }
    }

    // ==========================================
    // 🚀 FIX LỖI 2: LOGIC THÔNG MINH KIỂM TRA DỮ LIỆU MỚI BẰNG NHẬN DIỆN MẢNG
    // ==========================================
    const currentDataList = chartInstance.current.getDataList();
    
    // Kiểm tra cấu trúc mảng để tự động biết đây là Khung Giờ Mới hay chỉ là Nhịp Realtime
    const isNewDataset = 
        currentDataList.length === 0 || 
        (currentDataList[0] && displayData[0] && currentDataList[0].timestamp !== displayData[0].timestamp) ||
        Math.abs(currentDataList.length - displayData.length) > 5;

    if (isNewDataset) {
        // Đổi khung giờ -> Xóa sạch vẽ lại từ đầu
        chartInstance.current.applyNewData(displayData);
    } else {
        // Vẫn khung giờ cũ -> Chỉ cập nhật nến cuối cùng để không bị trôi vị trí cuộn chuột của người dùng
        chartInstance.current.updateData(displayData[displayData.length - 1]);
    }
    
    window.dispatchEvent(new Event('omniduck_update_dual_tags'));

  }, [data, chartType]);
  // ==========================================================
  // 3. ĐIỀU KHIỂN DÒNG THÔNG TIN NẾN (CẬP NHẬT TỨC THÌ)
  // ==========================================================
  useEffect(() => {
    const updateTopBar = (targetData) => {
        if (!topBarRef.current) return;
        let dData = targetData;
        if (!dData) {
            const dataList = chartInstance.current?.getDataList();
            if (dataList && dataList.length > 0) dData = dataList[dataList.length - 1];
            else return;
        }

        const color = dData.close >= dData.open ? '#089981' : '#F23645';
        const labelColor = isDark ? '#9CA3AF' : '#6B7280';
        const valColor = isDark ? '#F1F5F9' : '#111827';
        const bgColor = isDark ? 'rgba(11, 15, 20, 0.7)' : 'rgba(255, 255, 255, 0.8)';
        
        
        const d = new Date(dData.timestamp); 
        let hh = String(d.getHours()).padStart(2, '0');
        let min = String(d.getMinutes()).padStart(2, '0');
        
        const isDaily = (hh === '07' && min === '00') || (hh === '00' && min === '00');
        
        const timeStr = isDaily 
            ? `${String(d.getDate()).padStart(2,'0')} Tháng ${d.getMonth()+1}, ${d.getFullYear()}`
            : `${String(d.getDate()).padStart(2,'0')} Tháng ${d.getMonth()+1}, ${d.getFullYear()} ${hh}:${min}`;

        let volStr = dData.volume.toString();
        if (dData.volume >= 1000000) volStr = (dData.volume / 1000000).toFixed(2) + 'M';
        else if (dData.volume >= 1000) volStr = (dData.volume / 1000).toFixed(1) + 'K';

        topBarRef.current.innerHTML = `
            <div style="display: flex; gap: 14px; font-family: Inter, sans-serif; background: ${bgColor}; padding: 6px 12px; border-radius: 6px; backdrop-filter: blur(4px); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div><span style="color: ${labelColor}">Time: </span><span style="color: ${valColor}">${timeStr}</span></div>
                <div><span style="color: ${labelColor}">Open: </span><span style="color: ${color}">${dData.open.toFixed(2)}</span></div>
                <div><span style="color: ${labelColor}">High: </span><span style="color: ${color}">${dData.high.toFixed(2)}</span></div>
                <div><span style="color: ${labelColor}">Low: </span><span style="color: ${color}">${dData.low.toFixed(2)}</span></div>
                <div><span style="color: ${labelColor}">Close: </span><span style="color: ${color}">${dData.close.toFixed(2)}</span></div>
                <div><span style="color: ${labelColor}">Volume: </span><span style="color: ${color}">${volStr}</span></div>
            </div>
        `;
    };

    const crosshairHandler = (params) => {
        if (params && params.dataIndex !== undefined) {
            const dataList = chartInstance.current?.getDataList();
            if (dataList) updateTopBar(dataList[params.dataIndex]);
        } else updateTopBar();
    };

    if (chartInstance.current) chartInstance.current.subscribeAction('onCrosshairChange', crosshairHandler);
    updateTopBar(); // Gọi ngay 1 lần để đổi màu tức thì khi gạt Theme

    return () => { if (chartInstance.current) chartInstance.current.unsubscribeAction('onCrosshairChange', crosshairHandler); };
  }, [isDark, data]);

  // ==========================================================
  // 4. ĐIỀU KHIỂN NHÃN GIÁ & VOLUME BÁM MÉP (DUAL TAGS)
  // ==========================================================
  useEffect(() => {
    const formatVol = (v) => {
        if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
        if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
        return v.toString();
    };
    const formatPrice = (p) => Number.isInteger(p) ? p.toString() : p.toFixed(2);

    const updateDualTags = () => {
        const info = window.__omniduck_dual_tags;
        if (!info || !priceLabelLatestRef.current || !volLabelLatestRef.current) return;
        
        const { latest, edge, showVol } = info;
        const colorLatest = latest.isUp ? '#089981' : '#F23645'; 
        
        // NHÃN GIÁ HIỆN TẠI (LUÔN HIỆN)
        priceLabelLatestRef.current.style.display = 'block';
        priceLabelLatestRef.current.style.top = `${latest.priceY - 11}px`;
        priceLabelLatestRef.current.innerText = formatPrice(latest.price);
        priceLabelLatestRef.current.style.backgroundColor = colorLatest;
        priceLabelLatestRef.current.style.color = '#ffffff';

        // NHÃN VOL HIỆN TẠI (CHỈ HIỆN KHI ĐƯỢC BẬT VOL)
        if (showVol) {
            volLabelLatestRef.current.style.display = 'block';
            volLabelLatestRef.current.style.top = `${latest.volY - 11}px`;
            volLabelLatestRef.current.innerText = formatVol(latest.vol);
            volLabelLatestRef.current.style.backgroundColor = colorLatest;
            volLabelLatestRef.current.style.color = '#ffffff';
        } else {
            volLabelLatestRef.current.style.display = 'none';
        }

        if (priceLabelEdgeRef.current && volLabelEdgeRef.current) {
            if (edge.isLatest) {
                priceLabelEdgeRef.current.style.display = 'none';
                volLabelEdgeRef.current.style.display = 'none';
            } else {
                const colorEdge = edge.isUp ? '#089981' : '#F23645';
                const bgEdge = isDark ? '#0B0F14' : '#ffffff';

                // NHÃN GIÁ QUÁ KHỨ
                priceLabelEdgeRef.current.style.display = 'block';
                priceLabelEdgeRef.current.style.top = `${edge.priceY - 11}px`;
                priceLabelEdgeRef.current.innerText = formatPrice(edge.price);
                priceLabelEdgeRef.current.style.backgroundColor = bgEdge;
                priceLabelEdgeRef.current.style.color = colorEdge;
                priceLabelEdgeRef.current.style.border = `1px solid ${colorEdge}`;

                // NHÃN VOL QUÁ KHỨ (CHỈ HIỆN KHI ĐƯỢC BẬT VOL)
                if (showVol) {
                    volLabelEdgeRef.current.style.display = 'block';
                    volLabelEdgeRef.current.style.top = `${edge.volY - 11}px`;
                    volLabelEdgeRef.current.innerText = formatVol(edge.vol);
                    volLabelEdgeRef.current.style.backgroundColor = bgEdge;
                    volLabelEdgeRef.current.style.color = colorEdge;
                    volLabelEdgeRef.current.style.border = `1px solid ${colorEdge}`;
                } else {
                    volLabelEdgeRef.current.style.display = 'none';
                }
            }
        }
    };

    window.addEventListener('omniduck_update_dual_tags', updateDualTags);
    return () => { window.removeEventListener('omniduck_update_dual_tags', updateDualTags); };
  }, [isDark]);

  // ==========================================================
  // 5. MENU CHỈ BÁO 
  // ==========================================================
  const toggleIndicator = (name, isMain) => {
    if (!chartInstance.current) return;
    if (isMain) {
      if (activeMain.includes(name)) {
        chartInstance.current.removeIndicator('candle_pane', name);
        setActiveMain(prev => prev.filter(ind => ind !== name));
      } else {
        chartInstance.current.createIndicator(name, true, { id: 'candle_pane' });
        setActiveMain(prev => [...prev, name]);
      }
    } else {
      if (activeSub.includes(name)) {
        if (name === 'VOL') {
            // KHÔNG XÓA CHỈ BÁO ĐỂ GIỮ NHÃN GIÁ, CHỈ TRUYỀN LỆNH ẨN CỘT
            chartInstance.current.overrideIndicator({ name: 'TV_VOL_OVERLAY', calcParams: [false] }, 'candle_pane');
        } else { 
            chartInstance.current.removeIndicator(`pane_${name}`); 
        }
        setActiveSub(prev => prev.filter(ind => ind !== name));
      } else {
        if (name === 'VOL') {
            // TRUYỀN LỆNH HIỆN LẠI CỘT
            chartInstance.current.overrideIndicator({ name: 'TV_VOL_OVERLAY', calcParams: [true] }, 'candle_pane');
        } else { 
            chartInstance.current.createIndicator(name, false, { id: `pane_${name}`, height: 120 }); 
        }
        setActiveSub(prev => [...prev, name]);
      }
    }
  };

    useEffect(() => {
    const handleKeyDown = (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && activeOverlay) {
            if (chartInstance.current) {
                chartInstance.current.removeOverlay(activeOverlay.id);
                setActiveOverlay(null);
            }
        }
    };
    
    // Chỉ sử dụng handleKeyDown, đã xóa bỏ handleInteraction gây lỗi
    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeOverlay]);
  
  return (
  
    <div className="w-full h-full relative flex flex-col">
      
      {/* 1. TOOLBAR CHỨA MENU THẢ XUỐNG ĐÃ SỬA LỖI CHÌM */}
      <div className={`flex items-center gap-3 pb-3 mb-3 border-b shrink-0 relative z-[9999] ${isDark ? 'border-white/10' : 'border-slate-200'}`} style={{ isolation: 'isolate' }}>
        
        {/* MENU CHỌN KHUNG THỜI GIAN (INTERVAL) */}
        <div className="relative z-[100]">
          <button 
            onClick={() => { setShowIntervalMenu(!showIntervalMenu); setShowTypeMenu(false); setShowIndicatorMenu(false); }} 
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[11px] font-black uppercase shadow-sm transition-all
              ${showIntervalMenu ? 'bg-blue-500 text-white border-blue-500' : (isDark ? 'bg-[#10151C] border-blue-500/30 text-blue-500 hover:bg-blue-500 hover:text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-blue-500 hover:text-white hover:border-blue-500')}
            `}
          >
            <Clock size={14} /> {interval} <ChevronDown size={14} className={showIntervalMenu ? 'rotate-180' : ''} />
          </button>
          
          {showIntervalMenu && (
            <div className={`absolute top-[calc(100%+8px)] left-0 w-40 rounded-2xl border shadow-2xl py-2 z-[99999] backdrop-blur-xl overflow-y-auto max-h-[350px] ${isDark ? 'bg-[#0B0F14]/95 border-white/10' : 'bg-white border-slate-200'}`}>
              <p className="px-5 py-2 text-[9px] font-black text-slate-500 uppercase mb-1">Phút</p>
              {['1 phút', '3 phút', '5 phút', '15 phút', '30 phút'].map(time => (
                <button 
                  key={time} 
                  onClick={() => { 
                    setInterval(time); 
                    setShowIntervalMenu(false); 
                    if (onIntervalChange) onIntervalChange(time);
                  }} 
                  className={`w-full text-left px-5 py-2 text-xs font-bold transition-all ${interval === time ? 'bg-blue-500 text-white' : (isDark ? 'text-slate-300 hover:bg-blue-500 hover:text-white' : 'text-slate-700 hover:bg-blue-500 hover:text-white')}`}
                >
                  {time}
                </button>
              ))}
              <div className="h-px bg-white/5 my-1"></div>
              <p className="px-5 py-2 text-[9px] font-black text-slate-500 uppercase mb-1">Giờ & Ngày</p>
              {['1 giờ', '2 giờ', '4 giờ', '1 ngày', '1 tuần', '1 tháng', '1 năm'].map(time => (
                <button 
                  key={time} 
                  onClick={() => { 
                    setInterval(time); 
                    setShowIntervalMenu(false);
                    if (onIntervalChange) onIntervalChange(time);
                  }} 
                  className={`w-full text-left px-5 py-2 text-xs font-bold transition-all ${interval === time ? 'bg-blue-500 text-white' : (isDark ? 'text-slate-300 hover:bg-blue-500 hover:text-white' : 'text-slate-700 hover:bg-blue-500 hover:text-white')}`}
                >
                  {time}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* MENU CHỌN LOẠI BIỂU ĐỒ (CHART TYPE) */}
        <div className="relative z-[90]">
          <button 
            onClick={() => { setShowTypeMenu(!showTypeMenu); setShowIndicatorMenu(false); setShowIntervalMenu(false); }} 
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[11px] font-black uppercase shadow-sm transition-all
              ${showTypeMenu ? 'bg-emerald-500 text-white border-emerald-500' : (isDark ? 'bg-[#10151C] border-emerald-500/30 text-emerald-500 hover:bg-emerald-500 hover:text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-emerald-500 hover:text-white hover:border-emerald-500')}
            `}
          >
            <BarChart2 size={14} /> 
            {
              chartType === 'candle_solid' ? 'Nến Đặc' : 
              chartType === 'candle_up_stroke' ? 'Nến Rỗng' : 
              chartType === 'candle_stroke' ? 'Nến Viền' :
              chartType === 'ohlc' ? 'Hình Thanh' : 
              chartType === 'area' ? 'Vùng (Area)' : 
              chartType === 'heikin_ashi' ? 'Heikin Ashi' : 'Nến'
            } 
            <ChevronDown size={14} className={showTypeMenu ? 'rotate-180' : ''} />
          </button>
          
          {showTypeMenu && (
            <div className={`absolute top-[calc(100%+8px)] left-0 w-48 rounded-2xl border shadow-2xl py-2 z-[99999] backdrop-blur-xl overflow-hidden ${isDark ? 'bg-[#0B0F14]/95 border-white/10' : 'bg-white border-slate-200'}`}>
              {[
                { id: 'candle_solid', label: 'Nến Đặc (Solid)' }, 
                { id: 'candle_up_stroke', label: 'Nến Rỗng (Hollow)' }, 
                { id: 'candle_stroke', label: 'Nến Viền (Stroke)' },
                { id: 'ohlc', label: 'Hình Thanh (Bar)' },
                { id: 'area', label: 'Biểu đồ Vùng (Area)' },
                { id: 'heikin_ashi', label: 'Mô hình Heikin Ashi' }
              ].map(type => (
                <button 
                  key={type.id} 
                  onClick={() => { setChartType(type.id); setShowTypeMenu(false); }} 
                  className={`w-full flex items-center justify-between px-5 py-2.5 text-xs font-bold transition-all ${chartType === type.id ? 'bg-emerald-500 text-white' : (isDark ? 'text-slate-300 hover:bg-emerald-500 hover:text-white' : 'text-slate-700 hover:bg-emerald-500 hover:text-white')}`}
                >
                  {type.label} {chartType === type.id && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* MENU ĐƯỜNG PHÂN TÍCH (INDICATORS) */}
        <div className="relative z-[80]">
          <button 
            onClick={() => { setShowIndicatorMenu(!showIndicatorMenu); setShowTypeMenu(false); setShowIntervalMenu(false); }} 
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[11px] font-black uppercase shadow-sm transition-all
              ${showIndicatorMenu ? 'bg-yellow-500 text-black border-yellow-500' : (isDark ? 'bg-[#10151C] border-yellow-500/30 text-yellow-500 hover:bg-yellow-500 hover:text-black' : 'bg-white border-slate-300 text-slate-700 hover:bg-yellow-500 hover:text-black hover:border-yellow-500')}
            `}
          >
            <Settings2 size={14} /> Đường Phân Tích <ChevronDown size={14} className={showIndicatorMenu ? 'rotate-180' : ''} />
          </button>
          
          {showIndicatorMenu && (
            <div className={`absolute top-[calc(100%+8px)] left-0 w-60 rounded-2xl border shadow-2xl py-3 z-[99999] backdrop-blur-xl overflow-hidden ${isDark ? 'bg-[#0B0F14]/95 border-white/10' : 'bg-white border-slate-200'}`}>
              <p className="px-5 py-2 text-[9px] font-black text-slate-500 uppercase mb-1">Chỉ báo nến</p>
              {['MA', 'BOLL', 'SAR'].map(ind => (<button key={ind} onClick={() => toggleIndicator(ind, true)} className={`w-full flex items-center justify-between px-5 py-2.5 text-xs font-bold transition-all ${activeMain.includes(ind) ? 'bg-yellow-500 text-black' : (isDark ? 'text-slate-300 hover:bg-yellow-500 hover:text-black' : 'text-slate-700 hover:bg-yellow-500 hover:text-black')}`}>{ind} {activeMain.includes(ind) && <Check size={14} />}</button>))}
              <div className="h-px bg-white/5 my-2"></div>
              <p className="px-5 py-2 text-[9px] font-black text-slate-500 uppercase mb-1">Chỉ báo phụ</p>
              {['VOL', 'MACD', 'RSI', 'KDJ'].map(ind => (<button key={ind} onClick={() => toggleIndicator(ind, false)} className={`w-full flex items-center justify-between px-5 py-2.5 text-xs font-bold transition-all ${activeSub.includes(ind) ? 'bg-yellow-500 text-black' : (isDark ? 'text-slate-300 hover:bg-yellow-500 hover:text-black' : 'text-slate-700 hover:bg-yellow-500 hover:text-black')}`}>{ind} {activeSub.includes(ind) && <Check size={14} />}</button>))}
            </div>
          )}
        </div>
      </div>

      {/* 2. KHU VỰC BIỂU ĐỒ & THANH CÔNG CỤ VẼ */}
      <div className="flex-1 flex flex-row relative min-h-0 bg-black/5 rounded-2xl overflow-hidden border border-white/5">
        
        {/* SIDEBAR VẼ KỸ THUẬT */}
        <div className={`w-14 shrink-0 border-r flex flex-col items-center py-4 gap-4 z-[100] relative ${isDark ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
          {['segment', 'straightLine', 'fibonacciLine', 'text'].map((t, i) => (
            <button 
              key={t} 
              title={['Vẽ Đoạn thẳng (Trendline)', 'Vẽ Đường thẳng (Infinite)', 'Thước Fibonacci', 'Chèn Text'][i]}
              onClick={(e) => {
                  e.stopPropagation();
                  if (t === 'text') {
                      isAddingTextRef.current = true;
                      setIsAddingTextState(true);
                  } else {
                      isAddingTextRef.current = false;
                      setIsAddingTextState(false);
                      chartInstance.current?.createOverlay({ 
                          name: t, 
                          lock: false,
                          // 🚀 ÁP DỤNG ĐỒNG BỘ MÀU CHUNG CHO CÁC TOOL CÒN LẠI
                          styles: {
                              line: { color: overlayColor, size: 2 },
                              polygon: { style: 'fill', color: overlayColor, fill: { color: `${overlayColor}20` } }, // Cả nền Fibo cũng đổi màu theo
                              point: { color: overlayColor, borderColor: `${overlayColor}40`, activeColor: overlayColor, activeBorderColor: `${overlayColor}80` }
                          },
                          onSelected: (info) => {
                              if (info) setActiveOverlay({ id: info.overlay?.id || info.id });
                          },
                          onDeselected: () => setActiveOverlay(null)
                      });
                  }
              }} 
              className={`p-3 rounded-xl transition-all shadow-sm ${
                 (t === 'text' && isAddingTextState) 
                 ? 'bg-yellow-400 text-black' 
                 : 'hover:bg-yellow-400 hover:text-black text-slate-500'
              }`}
            >
              {[<Pencil size={18} key="pencil"/>, <MoveHorizontal size={18} key="move"/>, <Baseline size={18} key="baseline"/>, <Type size={18} key="type"/>][i]}
            </button>
          ))}
          <div className="w-8 h-px bg-white/5 my-2"></div>
          
          {/* NÚT XÓA TẤT CẢ */}
          <button 
            onClick={() => { 
                chartInstance.current?.removeOverlay(); 
                setActiveOverlay(null); 
            }} 
            title="Xóa tất cả hình vẽ"
            className="p-3 hover:bg-red-500 hover:text-white rounded-xl text-red-500 transition-all"
          >
            <Trash2 size={18} />
          </button>
        </div>

        {/* KHUNG CHỨA KLINECHARTS CORE */}
        <div className="flex-1 relative w-full h-full overflow-hidden">
          <div ref={chartContainerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          
          {/* 🚀 BẢNG CHỌN MÀU CHO TẤT CẢ CÔNG CỤ VẼ */}
          <div className="absolute top-3 right-4 z-[85] flex items-center gap-2 bg-[#10151C]/90 border border-white/10 px-3 py-2 rounded-xl backdrop-blur-md shadow-2xl">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-1">Màu vẽ:</span>
            {[
              { hex: '#FF9600', name: 'Cam' },
              { hex: '#089981', name: 'Xanh lá' },
              { hex: '#F23645', name: 'Đỏ' },
              { hex: '#2196F3', name: 'Xanh dương' },
              { hex: '#EAB308', name: 'Vàng' },
              { hex: '#FFFFFF', name: 'Trắng' }
            ].map(c => (
              <button
                key={c.hex}
                title={c.name}
                onClick={() => setOverlayColor(c.hex)}
                className={`w-4 h-4 rounded-full transition-all border relative ${overlayColor === c.hex ? 'scale-125 border-white shadow-[0_0_10px_rgba(255,255,255,0.6)]' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>

          {/* 🚀 KHUNG MỜ GÕ CHỮ TRỰC TIẾP TRÊN CHART (ĐÃ FIX LỖI DOUBLE ENTER) */}
          {inlineInput && (
              <input
                 autoFocus
                 type="text"
                 placeholder="GHI CHÚ..."
                 className="absolute bg-[#10151C] font-black px-4 py-2 rounded-lg border-2 shadow-[0_0_20px_rgba(0,0,0,0.5)] outline-none"
                 style={{ 
                    zIndex: 999999, 
                    left: inlineInput.x, 
                    top: inlineInput.y, 
                    transform: 'translate(0, -50%)', 
                    minWidth: '150px',
                    color: overlayColor, // Chữ đang gõ sẽ đổi màu theo bảng màu luôn!
                    borderColor: overlayColor, 
                    caretColor: overlayColor
                 }}
                 onBlur={(e) => handleFinishText(e.target.value)}
                 onKeyDown={(e) => {
                     if (e.key === 'Enter') handleFinishText(e.target.value);
                     if (e.key === 'Escape') { 
                         setInlineInput(null); 
                         setIsAddingTextState(false); 
                     }
                 }}
              />
          )}
          {activeOverlay && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-[#10151C]/90 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-2xl animate-in slide-in-from-top-4">
                <div className="flex items-center gap-2 text-yellow-500">
                    <Pencil size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Đã chọn đường vẽ</span>
                </div>
                <div className="w-px h-4 bg-white/10"></div>
                <button
                    className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-3 py-1.5 rounded-lg font-black text-[10px] uppercase transition-all border border-red-500/20 hover:border-red-500"
                    onClick={(e) => {
                        e.stopPropagation(); 
                        if (chartInstance.current) {
                            chartInstance.current.removeOverlay(activeOverlay.id);
                            setActiveOverlay(null);
                        }
                    }}
                >
                    <Trash2 size={14} /> Xóa bỏ
                </button>
            </div>
          )}
          {/* THÔNG TIN NẾN REALTIME OVERLAY */}
          <div ref={topBarRef} style={{ position: 'absolute', top: '8px', left: '16px', zIndex: 50, pointerEvents: 'none', fontSize: '11px', fontWeight: '600' }} />

          {/* NHÃN ĐỘC LẬP BÁM MÉP PHẢI */}
          <div ref={priceLabelLatestRef} style={{ display: 'none', position: 'absolute', right: '3px', width: '38px', height: '22px', lineHeight: '22px', textAlign: 'center', fontSize: '11px', fontFamily: 'Inter, sans-serif', fontWeight: '700', borderRadius: '2px', zIndex: 49, pointerEvents: 'none', transition: 'top 0.05s linear' }} />
          <div ref={volLabelLatestRef} style={{ display: 'none', position: 'absolute', right: '3px', width: '38px', height: '22px', lineHeight: '22px', textAlign: 'center', fontSize: '11px', fontFamily: 'Inter, sans-serif', fontWeight: '700', borderRadius: '2px', zIndex: 49, pointerEvents: 'none', transition: 'top 0.05s linear' }} />

          <div ref={priceLabelEdgeRef} style={{ display: 'none', position: 'absolute', right: '3px', width: '38px', height: '22px', lineHeight: '20px', textAlign: 'center', fontSize: '11px', fontFamily: 'Inter, sans-serif', fontWeight: '700', borderRadius: '2px', zIndex: 50, pointerEvents: 'none', boxSizing: 'border-box', transition: 'top 0.05s linear' }} />
          <div ref={volLabelEdgeRef} style={{ display: 'none', position: 'absolute', right: '3px', width: '38px', height: '22px', lineHeight: '20px', textAlign: 'center', fontSize: '11px', fontFamily: 'Inter, sans-serif', fontWeight: '700', borderRadius: '2px', zIndex: 50, pointerEvents: 'none', boxSizing: 'border-box', transition: 'top 0.05s linear' }} />
        
          {/* THANH ĐIỀU HƯỚNG CUỘN NẾN DƯỚI ĐÁY */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-[100]">
            <button onClick={handleScrollLeft} title="Lùi 1 nến" className={`p-2 rounded-xl border backdrop-blur-md shadow-lg transition-all ${isDark ? 'bg-[#10151C]/80 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800' : 'bg-white/80 border-slate-300 text-slate-600 hover:text-black hover:bg-slate-100'}`}>
              <ChevronLeft size={16} />
            </button>
            
            <button onClick={handleResetChart} title="Reset biểu đồ" className={`p-2 rounded-xl border backdrop-blur-md shadow-lg transition-all ${isDark ? 'bg-[#10151C]/80 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800' : 'bg-white/80 border-slate-300 text-slate-600 hover:text-black hover:bg-slate-100'}`}>
              <RefreshCw size={16} />
            </button>
            
            <button onClick={handleScrollRight} title="Tiến 1 nến" className={`p-2 rounded-xl border backdrop-blur-md shadow-lg transition-all ${isDark ? 'bg-[#10151C]/80 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800' : 'bg-white/80 border-slate-300 text-slate-600 hover:text-black hover:bg-slate-100'}`}>
              <ChevronRight size={16} />
            </button>
          </div>
        
        </div>
      </div>

    </div>
  );
}
