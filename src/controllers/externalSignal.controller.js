import chalk from 'chalk';
import AutoTrade from '../../models/AutoTrade.js';
import Setting from '../../models/Setting.js';
import {
    analyzeTechnicalSignal,
    buildTradePlanFromSignal,
    getExecutionContextForAsset,
    fetchRealtimeQuote,
    fetchAnalysisCandles,
    getUsdVndRate,
    isVNMarketOpen,
    isATOPeriod,
    isATCPeriod
} from '../services/autoTradeEngine.js';
import { buildAutoTradeOpenMessage, sendTelegramMessage } from '../services/telegramService.js';

const MIN_INTERNAL_SCORE = 68; // Ngưỡng điểm nội bộ tối thiểu để chấp nhận tín hiệu ngoài
const EXTERNAL_SIGNAL_SECRET = process.env.EXTERNAL_SIGNAL_SECRET || 'default-secret-key-please-change';

const normalizeAssetType = (symbol) => {
    const s = symbol.toUpperCase();
    if (s.endsWith('USDT')) return 'CRYPTO';
    if (s.startsWith('VN30F')) return 'DERIVATIVES';
    // Mặc định là chứng khoán Việt Nam nếu không có dấu hiệu khác
    if (s.length >= 2 && s.length <= 5 && /^[A-Z0-9]+$/.test(s)) return 'VN_STOCK';
    return 'UNKNOWN';
};

export const processExternalSignal = async (req, res) => {
    // SECURITY GATE: Check for secret key
    const providedSecret = req.headers['x-signal-secret'];
    if (providedSecret !== EXTERNAL_SIGNAL_SECRET) {
        console.log(chalk.red.bold(`[EXTERNAL] FORBIDDEN: Invalid or missing secret key from ${req.ip}`));
        return res.status(403).json({ success: false, message: 'Forbidden: Invalid credentials.' });
    }

    const externalSignal = req.body;

    if (!externalSignal || !externalSignal.is_signal) {
        return res.status(400).json({ success: false, message: 'Payload không hợp lệ hoặc không phải tín hiệu.' });
    }

    const { symbol, direction, entry, take_profit, stop_loss, source_channel } = externalSignal;
    const assetType = normalizeAssetType(symbol);

    if (assetType === 'UNKNOWN') {
        console.log(chalk.yellow(`[EXTERNAL] Bỏ qua tín hiệu từ '${source_channel}': Không nhận diện được loại tài sản cho mã '${symbol}'.`));
        return res.json({ success: true, message: 'Unknown asset type, skipped.' });
    }

    console.log(chalk.cyan(`[EXTERNAL] Nhận tín hiệu ${direction} ${symbol} từ kênh '${source_channel}'. Bắt đầu thẩm định nội bộ...`));

    try {
        // 1. Lấy dữ liệu nến để phân tích
        const candles = await fetchAnalysisCandles(symbol, assetType);
        
        // 2. Chấm điểm tín hiệu bằng engine nội bộ
        const internalSignal = analyzeTechnicalSignal(candles);

        // 3. Kiểm tra tính tương thích
        const internalScore = direction === 'LONG' ? internalSignal.breakdown.longScore : internalSignal.breakdown.shortScore;
        const directionMatches = (direction === 'LONG' && internalSignal.direction === 'LONG') || (direction === 'SHORT' && internalSignal.direction === 'SHORT');

        if (!directionMatches || internalScore < MIN_INTERNAL_SCORE) {
            console.log(chalk.yellow(
                `[EXTERNAL] TỪ CHỐI ${symbol}: Hướng không khớp hoặc điểm nội bộ quá thấp. ` +
                `(External: ${direction}, Internal: ${internalSignal.direction}, Score: ${internalScore}/${MIN_INTERNAL_SCORE})`
            ));
            return res.json({ success: true, message: 'Signal rejected due to low internal score or direction mismatch.' });
        }

        console.log(chalk.green(`[EXTERNAL] THẨM ĐỊNH OK ${symbol}: Điểm nội bộ ${internalScore} > ${MIN_INTERNAL_SCORE}.`));

        // 4. Tạo kế hoạch giao dịch
        const quote = await fetchRealtimeQuote(symbol, assetType);
        const entryPrice = entry === 'market' ? quote.price : parseFloat(entry);
        
        // Sử dụng TP/SL từ tín hiệu ngoài nếu có, nếu không thì tự tính
        const takeProfitPrice = parseFloat(take_profit?.[0]) || (direction === 'LONG' ? entryPrice + internalSignal.atr * 2.5 : entryPrice - internalSignal.atr * 2.5);
        const stopLossPrice = parseFloat(stop_loss) || (direction === 'LONG' ? entryPrice - internalSignal.atr * 1.5 : entryPrice + internalSignal.atr * 1.5);

        // 5. TÍCH HỢP PHÂN BỔ VỐN THÔNG MINH
        const totalCapitalSetting = await Setting.findOne({ key: 'autoTradeTotalCapital' });
        const TOTAL_CAPITAL = Number(totalCapitalSetting?.value) || 5_000_000_000;
        const maxTradesSetting = await Setting.findOne({ key: 'autoTradeMaxConcurrent' });
        const MAX_CONCURRENT_TRADES = Number(maxTradesSetting?.value) || 7;

        const openTradesList = await AutoTrade.find({ status: { $in: ['OPEN', 'PENDING'] } });
        let currentAllocatedCapital = openTradesList.reduce((sum, t) => sum + (Number(t.investedAmount) || 0), 0);
        let currentOpenCount = openTradesList.length;

        if (currentOpenCount >= MAX_CONCURRENT_TRADES) {
            console.log(chalk.yellow(`[EXTERNAL] TỪ CHỐI ${symbol}: Đã đạt giới hạn ${MAX_CONCURRENT_TRADES} lệnh mở đồng thời.`));
            return res.json({ success: true, message: 'Signal rejected due to concurrent trade limit.' });
        }

        let availableCapital = TOTAL_CAPITAL - currentAllocatedCapital;
        if (availableCapital <= 0) {
            console.log(chalk.yellow(`[EXTERNAL] TỪ CHỐI ${symbol}: Hết vốn phân bổ.`));
            return res.json({ success: true, message: 'Signal rejected due to insufficient available capital.' });
        }

        let allocationPct = 0.05;
        if (internalScore >= 85) allocationPct = 0.20;
        else if (internalScore >= 78) allocationPct = 0.15;
        else if (internalScore >= 74) allocationPct = 0.10;

        let idealInvestedAmount = TOTAL_CAPITAL * allocationPct;
        let maxVolumeByRisk = Infinity;
        const riskUnit = Math.abs(entryPrice - stopLossPrice);
        const currentUsdRate = await getUsdVndRate();

        if (riskUnit > 0) {
            const riskAmountVND = TOTAL_CAPITAL * 0.02; // Rủi ro tối đa 2% tổng vốn cho mỗi lệnh
            maxVolumeByRisk = riskAmountVND / riskUnit;
            if (assetType === 'CRYPTO') {
                const riskAmountUSD = riskAmountVND / currentUsdRate;
                maxVolumeByRisk = riskAmountUSD / riskUnit;
            }
        }

        let investedAmount = Math.min(idealInvestedAmount, availableCapital);
        let volume = 0;

        if (assetType === 'CRYPTO') {
            const investedUSD = investedAmount / currentUsdRate;
            if (investedUSD < 10) {
                return res.json({ success: true, message: 'Skipped, insufficient capital for minimum crypto trade.' });
            }
            const rawVolume = investedUSD / entryPrice;
            volume = Math.min(parseFloat(rawVolume.toFixed(6)), maxVolumeByRisk);
            investedAmount = Math.round(volume * entryPrice * currentUsdRate);
        } else if (assetType === 'VN_STOCK') {
            const priceVND = entryPrice * 1000;
            volume = Math.floor(Math.min(investedAmount / priceVND, maxVolumeByRisk));
            volume = Math.floor(volume / 100) * 100; // Làm tròn lô 100
            const notionalVND = volume * priceVND;
            if (notionalVND < 5_000_000) { // Bỏ qua lệnh quá nhỏ
                return res.json({ success: true, message: 'Skipped, notional value too small for VN_STOCK.' });
            }
            investedAmount = Math.round(notionalVND);
        } else { // DERIVATIVES
            volume = Math.max(0, Math.floor(Math.min(investedAmount / 25_000_000, maxVolumeByRisk)));
            investedAmount = volume * 25_000_000;
        }

        if (volume <= 0) {
             console.log(chalk.yellow(`[EXTERNAL] Bỏ qua ${symbol}: Không đủ vốn hoặc rủi ro quá cao để vào lệnh.`));
             return res.json({ success: true, message: 'Skipped, insufficient capital or high risk for volume.' });
        }

        const isOutOfStandardHours = !isVNMarketOpen() || isATOPeriod() || isATCPeriod();
        const tradeStatus = (isOutOfStandardHours && assetType !== 'CRYPTO') ? 'PENDING' : 'OPEN';

        const newTrade = new AutoTrade({
            symbol,
            assetType,
            direction,
            entryPrice,
            takeProfitPrice,
            stopLossPrice,
            investedAmount,
            volume,
            aiScore: internalScore,
            confidence: 75, // Gán confidence mặc định cho tín hiệu ngoài
            reason: `Tín hiệu từ kênh chuyên gia '${source_channel}', đã được hệ thống OMNI DUCK thẩm định với điểm ${internalScore}.`,
            status: tradeStatus,
            marketCondition: 'EXTERNAL_SIGNAL',
            signalBreakdown: internalSignal.breakdown,
        });

        await newTrade.save();

        const telegramMessage = buildAutoTradeOpenMessage(newTrade, { confirmed: true, reason: newTrade.reason }, quote);
        await sendTelegramMessage(telegramMessage);

        console.log(chalk.green.bold(`[EXTERNAL EXECUTE] Đã vào lệnh ${direction} ${symbol} theo tín hiệu từ '${source_channel}'.`));
        return res.status(201).json({ success: true, data: newTrade });

    } catch (error) {
        console.error(chalk.red(`[EXTERNAL] Lỗi nghiêm trọng khi xử lý tín hiệu cho ${symbol}: ${error.message}`));
        return res.status(500).json({ success: false, message: error.message });
    }
};