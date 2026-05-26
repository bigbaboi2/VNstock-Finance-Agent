import chalk from 'chalk';

// ==========================================
// CORE QUANTITATIVE ENGINE: MARKET INTELLIGENCE
// ==========================================
export const analyzeMarketIntelligence = (vnIndexData, scrapedData, symbolsDatabase) => {
    try {
        if (!vnIndexData || vnIndexData.length < 2) {
            return {
                success: true, 
                intelligence: {
                    indexChangePct: "0.00",
                    breadthRatio: "50.0",
                    marketStatus: "ĐANG QUÉT RADAR...",
                    statusType: "neutral",
                    diagnosticDesc: "Hệ thống đang thu thập dữ liệu giá từ máy chủ...",
                    strongSectors: [],
                    weakSectors: [],
                    sectorDetails: []
                }
            };
        }

        const { marketBreadth, foreignFlow, activeVolumeStocks } = scrapedData;
        const latestIndex = vnIndexData[vnIndexData.length - 1];
        const prevIndex = vnIndexData[vnIndexData.length - 2];
        const indexChangePct = ((latestIndex.close - prevIndex.close) / prevIndex.close) * 100;

        // ------------------------------------------
        // 1. TÍNH TOÁN ĐỘ RỘNG THỊ TRƯỜNG  
        // ------------------------------------------
        const totalAdvDec = marketBreadth.up + marketBreadth.down;
        const breadthRatio = totalAdvDec > 0 ? (marketBreadth.up / totalAdvDec) * 100 : 50;

        // ------------------------------------------
        // 2. TÍNH TOÁN ĐIỂM SỨC MẠNH NGÀNH  
        // ------------------------------------------
        let sectorRawData = {};
        let totalActiveVolume = 0;

        // ── DEBUG LOG ──
        console.log(chalk.cyan(`[QUANT] activeVolumeStocks nhận được: ${activeVolumeStocks.length} mã`));
        console.log(chalk.cyan(`[QUANT] foreignFlow: topBuy=${foreignFlow.topBuy?.length || 0}, topSell=${foreignFlow.topSell?.length || 0}`));
        if (activeVolumeStocks.length > 0) {
            console.log(chalk.cyan(`[QUANT] Mẫu stock[0]: ${JSON.stringify(activeVolumeStocks[0])}`));
        }

         activeVolumeStocks.forEach(stock => {
 
            const dbMatch = symbolsDatabase.find(s => s.symbol === stock.symbol);
            const sector = stock.sector || dbMatch?.sector;

            if (!sector) {
                console.log(chalk.yellow(`[QUANT] Bỏ qua ${stock.symbol} - không có sector`));
                return;  
            }

            if (!sectorRawData[sector]) {
                sectorRawData[sector] = { totalVolume: 0, sumChangePct: 0, count: 0, netForeignVal: 0, stocks:[] };
            }
            sectorRawData[sector].totalVolume += stock.volume;
            sectorRawData[sector].sumChangePct += stock.changePct;
            sectorRawData[sector].count += 1;

            sectorRawData[sector].stocks.push({ symbol: stock.symbol, changePct: stock.changePct });
            totalActiveVolume += stock.volume;
        });

        // ── DEBUG LOG sau khi phân ngành ──
        console.log(chalk.cyan(`[QUANT] Các ngành đã phân loại: ${Object.keys(sectorRawData).join(', ') || 'KHÔNG CÓ NGÀNH NÀO'}`));
        console.log(chalk.cyan(`[QUANT] totalActiveVolume: ${totalActiveVolume}`));

         const processForeignFlow = (flowList, isBuy) => {
            flowList.forEach(item => {
                const dbMatch = symbolsDatabase.find(s => s.symbol === item.symbol);
                const sector = dbMatch?.sector || 'KHÁC';
                if (sectorRawData[sector]) {
                    sectorRawData[sector].netForeignVal += isBuy ? item.value : -Math.abs(item.value);
                }
            });
        };
        processForeignFlow(foreignFlow.topBuy, true);
        processForeignFlow(foreignFlow.topSell, false);

        // Chấm điểm SPS cho từng ngành
        let sectorScores = [];
        for (const [sector, data] of Object.entries(sectorRawData)) {
            if (sector === 'KHÁC' || data.count === 0) continue;

            const avgChange = data.sumChangePct / data.count; 
            const volShare = (data.totalVolume / totalActiveVolume) * 100; 

 
            const volAmplifier = Math.max(0.5, Math.min(2.0, volShare / 10));

            let foreignScore = 0;
            if (data.netForeignVal > 100000000000) foreignScore = 3; 
            else if (data.netForeignVal < -100000000000) foreignScore = -3; 
            else foreignScore = (data.netForeignVal / 100000000000) * 3;

 
            const sps = (avgChange * volAmplifier) + foreignScore;

            const sortedStocks = data.stocks.sort((a, b) => b.changePct - a.changePct);
            const topGainers = sortedStocks.slice(0, 2).map(s => s.symbol);
            const topLosers = sortedStocks.slice().reverse().slice(0, 2).map(s => s.symbol);

            sectorScores.push({
                name: sector,
                sps: sps,
                avgChange: avgChange,
                volShare: volShare,
                foreignFlow: data.netForeignVal,
                topGainers: topGainers, 
                topLosers: topLosers   
            });
        }
         console.log(chalk.cyan(`[QUANT] sectorScores (${sectorScores.length} ngành):`));
        sectorScores.forEach(s => console.log(chalk.cyan(`  ${s.name}: sps=${s.sps.toFixed(3)}, avgChange=${s.avgChange.toFixed(3)}%, volShare=${s.volShare.toFixed(1)}%`)));

        // Sắp xếp ngành từ mạnh nhất đến yếu nhất
        sectorScores.sort((a, b) => b.sps - a.sps);

     
        let strongSectors = sectorScores.filter(s => s.sps > 0.3).slice(0, 3).map(s => ({
            name: s.name,
            tickers: s.topGainers
        }));
        if (strongSectors.length === 0 && sectorScores.length > 0) {
            strongSectors = sectorScores.slice(0, 2).filter(s => s.avgChange > 0).map(s => ({
                name: s.name,
                tickers: s.topGainers
            }));
        }

  
        let weakSectors = sectorScores.filter(s => s.sps < -0.3).slice(0, 3).map(s => ({
            name: s.name,
            tickers: s.topLosers
        }));
        if (weakSectors.length === 0 && sectorScores.length > 0) {
            weakSectors = [...sectorScores].reverse().slice(0, 2).filter(s => s.avgChange < 0).map(s => ({
                name: s.name,
                tickers: s.topLosers
            }));
        }

        // ── DEBUG LOG kết quả filter ──
        console.log(chalk.green(`[QUANT] strongSectors (${strongSectors.length}): ${strongSectors.map(s=>s.name).join(', ') || 'TRỐNG'}`));
        console.log(chalk.red(`[QUANT] weakSectors (${weakSectors.length}): ${weakSectors.map(s=>s.name).join(', ') || 'TRỐNG'}`));

        // ------------------------------------------
        // 3. ĐỊNH DẠNG KỊCH BẢN THỊ TRƯỜNG CHUNG (MARKET VERDICT)
        // ------------------------------------------
        let marketStatus = "ĐI NGANG TÍCH LŨY";
        let statusType = "neutral";
        let diagnosticDesc = "Dòng tiền phân hóa, không có xu hướng rõ ràng.";

        if (indexChangePct > 0.5) {
            if (breadthRatio > 65) {
                marketStatus = "BÙNG NỔ ĐÀ TĂNG";
                statusType = "bullish";
                diagnosticDesc = "Giá tăng kèm dòng tiền lan tỏa diện rộng. Củng cố xu hướng tăng.";
            } else if (breadthRatio < 40) {
                marketStatus = "XANH VỎ ĐỎ LÒNG (RỦI RO)";
                statusType = "warning";
                diagnosticDesc = "Chỉ số bị bóp méo bởi trụ. Tiền rút khỏi Midcap/Penny. Cẩn trọng Bull Trap.";
            } else {
                marketStatus = "TĂNG TRƯỞNG PHÂN HÓA";
                statusType = "bullish";
                diagnosticDesc = "Dòng tiền tập trung cục bộ vào nhóm cổ phiếu dẫn dắt.";
            }
        } else if (indexChangePct < -0.5) {
            if (breadthRatio < 35) {
                marketStatus = "ÁP LỰC BÁN THÁO";
                statusType = "bearish";
                diagnosticDesc = "Bán tháo hoảng loạn trên diện rộng. Rủi ro gãy nền hỗ trợ.";
            } else if (breadthRatio > 50) {
                marketStatus = "ĐỎ VỎ XANH LÒNG";
                statusType = "neutral";
                diagnosticDesc = "Nhóm vốn hóa lớn đè chỉ số, nhưng tiền vẫn tìm cơ hội ở lớp cổ phiếu ngách.";
            } else {
                marketStatus = "ĐIỀU CHỈNH LÀNH MẠNH";
                statusType = "warning";
                diagnosticDesc = "Nhịp rũ bỏ thông thường. Chờ tín hiệu kiệt cung.";
            }
        } else {
            if (breadthRatio > 60) {
                marketStatus = "TÍCH LŨY TÍCH CỰC";
                statusType = "bullish";
            } else if (breadthRatio < 40) {
                marketStatus = "PHÂN PHỐI ẨN";
                statusType = "warning";
                diagnosticDesc = "Chỉ số đi ngang nhưng áp lực chốt lời ngầm đang diễn ra.";
            }
        }

        return {
            success: true,
            intelligence: {
                indexChangePct: indexChangePct.toFixed(2),
                breadthRatio: breadthRatio.toFixed(1),
                marketStatus,
                statusType,
                diagnosticDesc,
                strongSectors,
                weakSectors,
                sectorDetails: sectorScores.slice(0, 5) 
            }
        };

    } catch (error) {
        console.error(chalk.red(`[QUANT ENGINE ERROR] ${error.message}`));
        return { success: false, error: error.message };
    }
};