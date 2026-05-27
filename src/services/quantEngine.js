import chalk from 'chalk';

//==========================================
//CORE QUANTITATIVE ENGINE v4.0
//==========================================

//─── Dynamic SPS threshold based on daily fluctuations ─────────────────────────────────
const calcSpsThreshold = (indexChangePct) => {
    const abs = Math.abs(indexChangePct);
    if (abs > 1.5) return 0.6;
    if (abs > 1.0) return 0.5;
    if (abs > 0.5) return 0.35;
    if (abs > 0.2) return 0.25;
    return 0.15;
};

//─── FIX 1: Tính top gainers/losers/volume từ activeVolumeStocks ─────────────────────────
const calcTopStocks = (activeVolumeStocks) => {
    if (!activeVolumeStocks || activeVolumeStocks.length === 0) {
        return { topGainers: [], topLosers: [], topVolume: [] };
    }

    const valid = activeVolumeStocks.filter(s => s.currentPrice > 0 && s.volume > 0);

    //Top 5 strongest increases
    const topGainers = [...valid]
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, 5)
        .map(s => ({
            symbol:     s.symbol,
            changePct:  +s.changePct.toFixed(2),
            price:      s.currentPrice,
            volume:     s.volume,
            sector:     s.sector || null,
        }));

    //Top 5 strongest drops
    const topLosers = [...valid]
        .sort((a, b) => a.changePct - b.changePct)
        .slice(0, 5)
        .map(s => ({
            symbol:     s.symbol,
            changePct:  +s.changePct.toFixed(2),
            price:      s.currentPrice,
            volume:     s.volume,
            sector:     s.sector || null,
        }));

    //Top 5 liquidity (volume × price = transaction value)
    const topVolume = [...valid]
        .sort((a, b) => (b.volume * b.currentPrice) - (a.volume * a.currentPrice))
        .slice(0, 5)
        .map(s => ({
            symbol:      s.symbol,
            changePct:   +s.changePct.toFixed(2),
            price:       s.currentPrice,
            volume:      s.volume,
            valueTraded: Math.round(s.volume * s.currentPrice), 
            sector:      s.sector || null,
        }));

    return { topGainers, topLosers, topVolume };
};

export const analyzeMarketIntelligence = (vnIndexData, scrapedData, symbolsDatabase) => {
    try {
        if (!vnIndexData || vnIndexData.length < 2) {
            return {
                success: true,
                intelligence: {
                    indexChangePct: "0.00",
                    breadthRatio:   "50.0",
                    marketStatus:   "ĐANG QUÉT RADAR...",
                    statusType:     "neutral",
                    diagnosticDesc: "Hệ thống đang thu thập dữ liệu giá từ máy chủ...",
                    strongSectors: [], weakSectors: [], sectorDetails: [],
                    topGainers: [], topLosers: [], topVolume: [],
                }
            };
        }

        const { marketBreadth, foreignFlow, activeVolumeStocks } = scrapedData;

        const latestIndex  = vnIndexData[vnIndexData.length - 1];
        const prevIndex    = vnIndexData[vnIndexData.length - 2];
        const indexChangePct = ((latestIndex.close - prevIndex.close) / prevIndex.close) * 100;
        const spsThreshold   = calcSpsThreshold(indexChangePct);

        //─── FIX 1: Always calculate top stocks first, regardless of whether there are sectors or not ───────
        const { topGainers, topLosers, topVolume } = calcTopStocks(activeVolumeStocks);
        console.log(chalk.magenta(`[QUANT] ↑${topGainers.map(s => `${s.symbol}(+${s.changePct}%)`).join(' ')||'N/A'} | ↓${topLosers.map(s=>`${s.symbol}(${s.changePct}%)`).join(' ')||'N/A'} | Vol: ${topVolume.map(s=>s.symbol).join(' ')||'N/A'}`));

        //----------------------------------------
        //1. MARKET BREADTH
        //----------------------------------------
        const totalAdvDec  = marketBreadth.up + marketBreadth.down;
        const breadthRatio = totalAdvDec > 0 ? (marketBreadth.up / totalAdvDec) * 100 : 50;
        const breadthSource = marketBreadth._isReal ? `thực (${marketBreadth._source || 'api'})` : `ước tính (${marketBreadth._source || 'core'})`;


        //------------------------------------------
        //2. FALLBACK: no activeVolumeStocks
        //------------------------------------------
        if (!activeVolumeStocks || activeVolumeStocks.length === 0) {
            console.log(chalk.yellow('[QUANT] activeVolumeStocks rỗng — dùng breadth-only mode'));
            const { marketStatus, statusType, diagnosticDesc } = buildScenario(
                indexChangePct, breadthRatio, [], [], foreignFlow?.netValue || 0
            );
            return {
                success: true,
                _dataQuality: 'breadth_only',
                intelligence: {
                    indexChangePct: indexChangePct.toFixed(2),
                    breadthRatio:   breadthRatio.toFixed(1),
                    breadthSource,
                    foreignNetValue: foreignFlow?.netValue || 0,
                    marketStatus,
                    statusType,
                    diagnosticDesc: diagnosticDesc + ' (⚠ Dữ liệu ngành chưa đầy đủ)',
                    strongSectors: [], weakSectors: [], sectorDetails: [],
                    topGainers, topLosers, topVolume,
                }
            };
        }

        //------------------------------------------
        //3. SEGMENTATION — assign sectors to all codes
        //------------------------------------------
        const symbolsDbMap = Object.fromEntries(
            (symbolsDatabase || []).map(s => [s.symbol, s.sector]).filter(([, v]) => v)
        );

        let sectorRawData  = {};
        let totalActiveVol = 0;
        let totalMarketCap = 0;

        activeVolumeStocks.forEach(stock => {
            const sector = stock.sector || symbolsDbMap[stock.symbol];
            if (!sector) return;

            if (!sectorRawData[sector]) {
                sectorRawData[sector] = {
                    totalVolume: 0, sumChangePct: 0,
                    sumMomentum3d: 0, fullMomentumCount: 0,
                    count: 0, netForeignVal: 0,
                    totalMarketCap: 0, weightedUp: 0, weightedDown: 0,
                    stocks: []
                };
            }

            const cap = stock.marketCapProxy || 1;
            sectorRawData[sector].totalVolume     += stock.volume;
            sectorRawData[sector].sumChangePct    += stock.changePct;
            sectorRawData[sector].count           += 1;
            sectorRawData[sector].totalMarketCap  += cap;

            if (stock._hasFullMomentum !== false) {
                sectorRawData[sector].sumMomentum3d    += stock.momentum3d;
                sectorRawData[sector].fullMomentumCount += 1;
            }

            if      (stock.changePct >  0.05) sectorRawData[sector].weightedUp   += cap;
            else if (stock.changePct < -0.05) sectorRawData[sector].weightedDown += cap;

            sectorRawData[sector].stocks.push({ symbol: stock.symbol, changePct: stock.changePct });
            totalActiveVol += stock.volume;
            totalMarketCap += cap;
        });

        //------------------------------------------
        //4. FOREIGN FLOW → sector
        //------------------------------------------
        const processForeignFlow = (flowList, isBuy) => {
            (flowList || []).forEach(item => {
                const sector = item.sector || symbolsDbMap[item.symbol];
                if (!sector || !sectorRawData[sector]) return;
                sectorRawData[sector].netForeignVal += isBuy
                    ? item.value
                    : -Math.abs(item.value);
            });
        };
        processForeignFlow(foreignFlow.topBuy,  true);
        processForeignFlow(foreignFlow.topSell, false);

        //------------------------------------------
        //5. SPS v3 SCORING — dynamic threshold
        //------------------------------------------
        let sectorScores = [];
        for (const [sector, data] of Object.entries(sectorRawData)) {
            if (sector === 'KHÁC' || data.count === 0) continue;

            const avgChange = data.sumChangePct / data.count;

            const avgMomentum3d = data.fullMomentumCount > 0
                ? data.sumMomentum3d / data.fullMomentumCount
                : avgChange;

            const momentumReliability = data.count > 0
                ? data.fullMomentumCount / data.count
                : 0;

            const volShare     = totalActiveVol > 0 ? (data.totalVolume / totalActiveVol) * 100 : 0;
            const volAmplifier = Math.max(0.5, Math.min(2.0, volShare / 10));

            let foreignScore = 0;
            if (data.netForeignVal >  100_000_000_000) foreignScore =  3;
            else if (data.netForeignVal < -100_000_000_000) foreignScore = -3;
            else foreignScore = (data.netForeignVal / 100_000_000_000) * 3;

            const totalCap          = data.totalMarketCap || 1;
            const weightedBreadth   = (data.weightedUp - data.weightedDown) / totalCap;
            const weightedBreadthSc = weightedBreadth * 2;

            const momentumWeight = 0.4 * momentumReliability;
            const changeWeight   = 0.6 + 0.4 * (1 - momentumReliability);

            const sps = (avgChange * changeWeight + avgMomentum3d * momentumWeight) * volAmplifier
                      + foreignScore
                      + weightedBreadthSc * 0.5;

            const sorted     = [...data.stocks].sort((a, b) => b.changePct - a.changePct);
            const topGainers = sorted.slice(0, 2).map(s => s.symbol);
            const topLosers  = sorted.slice(-2).map(s => s.symbol).reverse();

            sectorScores.push({
                name: sector, sps, avgChange, avgMomentum3d,
                momentumReliability, volShare,
                foreignFlow: data.netForeignVal,
                weightedBreadth,
                topGainers, topLosers,
            });
        }

        sectorScores.sort((a, b) => b.sps - a.sps);
        console.log(chalk.cyan(`[QUANT] Breadth=${breadthRatio.toFixed(1)}% (↑${marketBreadth.up} ↓${marketBreadth.down}, ${breadthSource}) | SPS thr=${spsThreshold.toFixed(2)} | Ngành=${sectorScores.length}`));

        //------------------------------------------
        //6. STRONG /WEAK sectors — dynamic threshold
        //------------------------------------------
        let strongSectors = sectorScores
            .filter(s => s.sps > spsThreshold)
            .slice(0, 3)
            .map(s => ({ name: s.name, tickers: s.topGainers, sps: +s.sps.toFixed(2) }));

        if (strongSectors.length === 0 && sectorScores.length > 0) {
            strongSectors = sectorScores
                .slice(0, 2)
                .filter(s => s.avgChange > 0)
                .map(s => ({ name: s.name, tickers: s.topGainers, sps: +s.sps.toFixed(2) }));
        }

        let weakSectors = sectorScores
            .filter(s => s.sps < -spsThreshold)
            .slice(0, 3)
            .map(s => ({ name: s.name, tickers: s.topLosers, sps: +s.sps.toFixed(2) }));

        if (weakSectors.length === 0 && sectorScores.length > 0) {
            weakSectors = [...sectorScores]
                .reverse()
                .slice(0, 2)
                .filter(s => s.avgChange < 0)
                .map(s => ({ name: s.name, tickers: s.topLosers, sps: +s.sps.toFixed(2) }));
        }

        console.log(chalk.green(`[QUANT] Strong: ${strongSectors.map(s=>s.name).join(', ')||'—'}`) + chalk.red(` | Weak: ${weakSectors.map(s=>s.name).join(', ')||'—'}`));

        //----------------------------------------
        //7. MARKET SCENARIO
        //----------------------------------------
        const { marketStatus, statusType, diagnosticDesc } = buildScenario(
            indexChangePct, breadthRatio, strongSectors, weakSectors, foreignFlow?.netValue || 0
        );

        return {
            success: true,
            intelligence: {
                indexChangePct:  indexChangePct.toFixed(2),
                breadthRatio:    breadthRatio.toFixed(1),
                breadthSource,
                foreignNetValue: foreignFlow.netValue || 0,
                spsThreshold:    +spsThreshold.toFixed(2),
                marketStatus,
                statusType,
                diagnosticDesc,
                strongSectors,
                weakSectors,
                sectorDetails: sectorScores.slice(0, 6),
                topGainers,
                topLosers,
                topVolume,
            }
        };

    } catch (error) {
        console.error(chalk.red(`[QUANT ENGINE ERROR] ${error.message}`));
        return { success: false, error: error.message };
    }
};

//─── Scenario builder (breadth-only mode) ─────────────
function buildScenario(indexChangePct, breadthRatio, strongSectors, weakSectors, foreignNetValue) {
    let marketStatus = "ĐI NGANG TÍCH LŨY";
    let statusType   = "neutral";
    let diagnosticDesc = "Dòng tiền phân hóa, không có xu hướng rõ ràng.";

    const foreignBias = foreignNetValue > 200_000_000_000 ? ' Khối ngoại mua ròng mạnh hỗ trợ.'
                      : foreignNetValue < -200_000_000_000 ? ' Khối ngoại bán ròng gây áp lực.'
                      : '';

    if (indexChangePct > 0.5) {
        if (breadthRatio > 65) {
            marketStatus   = "BÙNG NỔ ĐÀ TĂNG";
            statusType     = "bullish";
            diagnosticDesc = `Giá tăng kèm dòng tiền lan tỏa diện rộng. Củng cố xu hướng tăng.${foreignBias}`;
        } else if (breadthRatio < 40) {
            marketStatus   = "XANH VỎ ĐỎ LÒNG (RỦI RO)";
            statusType     = "warning";
            diagnosticDesc = `Chỉ số bị bóp méo bởi trụ. Tiền rút khỏi Midcap/Penny. Cẩn trọng Bull Trap.${foreignBias}`;
        } else {
            marketStatus   = "TĂNG TRƯỞNG PHÂN HÓA";
            statusType     = "bullish";
            diagnosticDesc = `Dòng tiền tập trung cục bộ vào nhóm cổ phiếu dẫn dắt.${foreignBias}`;
        }
    } else if (indexChangePct < -0.5) {
        if (breadthRatio < 35) {
            marketStatus   = "ÁP LỰC BÁN THÁO";
            statusType     = "bearish";
            diagnosticDesc = `Bán tháo hoảng loạn trên diện rộng. Rủi ro gãy nền hỗ trợ.${foreignBias}`;
        } else if (breadthRatio > 50) {
            marketStatus   = "ĐỎ VỎ XANH LÒNG";
            statusType     = "neutral";
            diagnosticDesc = `Nhóm vốn hóa lớn đè chỉ số, nhưng tiền vẫn tìm cơ hội ở lớp cổ phiếu ngách.${foreignBias}`;
        } else {
            marketStatus   = "ĐIỀU CHỈNH LÀNH MẠNH";
            statusType     = "warning";
            diagnosticDesc = `Nhịp rũ bỏ thông thường. Chờ tín hiệu kiệt cung.${foreignBias}`;
        }
    } else {
        if (breadthRatio > 60) {
            marketStatus   = "TÍCH LŨY TÍCH CỰC";
            statusType     = "bullish";
            diagnosticDesc = `Đa số mã tăng nhẹ, dòng tiền tích lũy nền.${foreignBias}`;
        } else if (breadthRatio < 40) {
            marketStatus   = "PHÂN PHỐI ẨN";
            statusType     = "warning";
            diagnosticDesc = `Chỉ số đi ngang nhưng áp lực chốt lời ngầm đang diễn ra.${foreignBias}`;
        } else {
            diagnosticDesc += foreignBias;
        }
    }

    return { marketStatus, statusType, diagnosticDesc };
}