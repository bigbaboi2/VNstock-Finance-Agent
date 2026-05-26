import axios from 'axios';
import { fetchCryptoData } from '../services/cryptoService.js';
export const getChartHistory = async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const interval = req.query.interval || '1 ngày'; 

    const isIndex = ['VNINDEX', 'HNX', 'VN30', 'UPCOM'].includes(ticker);
    let apiType = 'stock';
    if (isIndex) {
        apiType = 'index';
    } else if (ticker.startsWith('VN30F')) {
        apiType = 'derivative'; 
    }

    let resCode = '1D';
    let from;
    const to = Math.floor(Date.now() / 1000);
    let needsMonthYearAggregation = false; 
    let aggregateMinutes = 0; 

    switch (interval) {
        case '1 phút': resCode = '1'; from = to - (4 * 24 * 60 * 60); break; 
        case '3 phút': resCode = '1'; from = to - (4 * 24 * 60 * 60); aggregateMinutes = 3; break; 
        case '5 phút': resCode = '5'; from = to - (10 * 24 * 60 * 60); break;
        case '15 phút': resCode = '15'; from = to - (20 * 24 * 60 * 60); break;
        case '30 phút': resCode = '30'; from = to - (30 * 24 * 60 * 60); break;
        case '1 giờ': resCode = '30'; from = to - (45 * 24 * 60 * 60); aggregateMinutes = 60; break; 
        case '2 giờ': resCode = '30'; from = to - (60 * 24 * 60 * 60); aggregateMinutes = 120; break; 
        case '4 giờ': resCode = '30'; from = to - (60 * 24 * 60 * 60); aggregateMinutes = 240; break;
        case '1 ngày': resCode = '1D'; from = 946684800; needsMonthYearAggregation = false; break;
        case '1 tuần': resCode = '1W'; from = 946684800; needsMonthYearAggregation = false; break;
        case '1 tháng': resCode = '1D'; from = 946684800; needsMonthYearAggregation = true; break;
        case '1 năm': resCode = '1D'; from = 946684800; needsMonthYearAggregation = true; break;
        default: resCode = '1D'; from = 946684800; needsMonthYearAggregation = false; 
    }

    try {
        const dnseUrl = `https://services.entrade.com.vn/chart-api/v2/ohlcs/${apiType}?from=${from}&to=${to}&symbol=${ticker}&resolution=${resCode}`;
        const response = await axios.get(dnseUrl, { timeout: 8000 });

        let chartData = [];
        if (response.data && response.data.t) {
            const d = response.data;
            chartData = d.t.map((timestamp, index) => {
                const dateObj = new Date((timestamp * 1000) + (7 * 60 * 60 * 1000));
                const isIntraday = !['1D', '1W'].includes(resCode);
                const timeString = isIntraday 
                    ? dateObj.toISOString().replace('T', ' ').substring(0, 16) 
                    : dateObj.toISOString().split('T')[0];

                return {
                    _ts: timestamp, time: timeString, open: Number(d.o[index]),
                    high: Number(d.h[index]), low: Number(d.l[index]),
                    close: Number(d.c[index]), volume: Number(d.v[index]) || 0 
                };
            });
        }

        if (aggregateMinutes > 0 && chartData.length > 0) {
            const aggregated = [];
            let currentCandle = null;
            let bucketStart = 0;
            
            chartData.forEach(candle => {
                const intervalSeconds = aggregateMinutes * 60;
                const currentBucket = Math.floor(candle._ts / intervalSeconds) * intervalSeconds;
                
                if (!currentCandle || bucketStart !== currentBucket) {
                    if (currentCandle) aggregated.push(currentCandle);
                    bucketStart = currentBucket;
                    currentCandle = { ...candle }; 
                } else {
                    currentCandle.high = Math.max(currentCandle.high, candle.high);
                    currentCandle.low = Math.min(currentCandle.low, candle.low);
                    currentCandle.close = candle.close;
                    currentCandle.volume += candle.volume;
                }
            });
            if (currentCandle) aggregated.push(currentCandle);
            chartData = aggregated;
        }

        if (needsMonthYearAggregation && chartData.length > 0) {
            const aggregated = {};
            chartData.forEach(candle => {
                const key = interval === '1 tháng' ? candle.time.substring(0, 7) : candle.time.substring(0, 4);
                if (!aggregated[key]) {
                    aggregated[key] = {
                        time: interval === '1 tháng' ? `${key}-01` : `${key}-01-01`,
                        open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume
                    };
                } else {
                    if (candle.high > aggregated[key].high) aggregated[key].high = candle.high;
                    if (candle.low < aggregated[key].low) aggregated[key].low = candle.low;
                    aggregated[key].close = candle.close;
                    aggregated[key].volume += candle.volume;
                }
            });
            chartData = Object.values(aggregated);
        }

        if (resCode === '1D' && !needsMonthYearAggregation) {
            try {
                const from1M = to - (24 * 60 * 60);
                const dnse1MUrl = `https://services.entrade.com.vn/chart-api/v2/ohlcs/${apiType}?from=${from1M}&to=${to}&symbol=${ticker}&resolution=1`;
                const res1M = await axios.get(dnse1MUrl, { timeout: 5000 });
                if (res1M.data && res1M.data.t && res1M.data.t.length > 0) {
                    const mData = res1M.data;
                    const latestClose = Number(mData.c[mData.c.length - 1]);
                    const todayStr = new Date().toISOString().split('T')[0];
                    const lastCandle = chartData[chartData.length - 1];

                    if (lastCandle && lastCandle.time.includes(todayStr)) {
                        lastCandle.close = latestClose;
                        if (latestClose > lastCandle.high) lastCandle.high = latestClose;
                        if (latestClose < lastCandle.low) lastCandle.low = latestClose;
                    } else if (chartData.length > 0) {
                        chartData.push({
                            time: todayStr, open: Number(mData.o[0]),
                            high: Math.max(...mData.h.map(Number)), low: Math.min(...mData.l.map(Number)),
                            close: latestClose, volume: mData.v.reduce((sum, v) => sum + Number(v), 0)
                        });
                    }
                }
            } catch (err1M) {}
        }
        return res.status(200).json({ success: true, data: chartData });
    } catch (error) {
        return res.status(200).json({ success: false, data: [] });
    }
};

export const getCryptoHistory = async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const interval = req.query.interval || '1 ngày';   
    try {
        const data = await fetchCryptoData(symbol, interval); 
        return res.json({ success: true, data: data }); 
    } catch (e) {
        res.status(200).json({ success: false, data: null });
    }
};