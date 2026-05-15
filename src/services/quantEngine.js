import chalk from 'chalk';

// ==========================================
// CORE QUANTITATIVE ENGINE: MARKET INTELLIGENCE
// ==========================================
export const analyzeMarketIntelligence = (vnIndexData, scrapedData, symbolsDatabase) => {
    try {
        const { marketBreadth, foreignFlow, activeVolumeStocks } = scrapedData;
        const latestIndex = vnIndexData[vnIndexData.length - 1];
        const prevIndex = vnIndexData[vnIndexData.length - 2];
        const indexChangePct = ((latestIndex.close - prevIndex.close) / prevIndex.close) * 100;

        // ------------------------------------------
        // 1. TÍNH TOÁN ĐỘ RỘNG THỊ TRƯỜNG (MARKET BREADTH)
        // ------------------------------------------
        const totalAdvDec = marketBreadth.up + marketBreadth.down;
        const breadthRatio = totalAdvDec > 0 ? (marketBreadth.up / totalAdvDec) * 100 : 50;

        // ------------------------------------------
        // 2. TÍNH TOÁN ĐIỂM SỨC MẠNH NGÀNH (SECTOR POWER SCORE - SPS)
        // ------------------------------------------
        let sectorRawData = {};
        let totalActiveVolume = 0;

        // Bóc tách top thanh khoản vào từng ngành
        activeVolumeStocks.forEach(stock => {
            const dbMatch = symbolsDatabase.find(s => s.symbol === stock.symbol);
            const sector = stock.sector || dbMatch?.sector || 'KHÁC';

            if (!sectorRawData[sector]) {
                sectorRawData[sector] = { totalVolume: 0, sumChangePct: 0, count: 0, netForeignVal: 0, stocks:[] };
            }
            sectorRawData[sector].totalVolume += stock.volume;
            sectorRawData[sector].sumChangePct += stock.changePct;
            sectorRawData[sector].count += 1;

            sectorRawData[sector].stocks.push({ symbol: stock.symbol, changePct: stock.changePct });
            totalActiveVolume += stock.volume;


        });

        // Bơm dữ liệu Khối ngoại vào cấu trúc ngành
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
            
            let foreignScore = 0;
            if (data.netForeignVal > 100000000000) foreignScore = 10; 
            else if (data.netForeignVal < -100000000000) foreignScore = -10; 
            else foreignScore = (data.netForeignVal / 100000000000) * 10;

            const sps = (avgChange * 10 * 0.4) + (volShare * 0.4) + (foreignScore * 0.2);

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
        // Sắp xếp ngành từ mạnh nhất đến yếu nhất
        sectorScores.sort((a, b) => b.sps - a.sps);
        const strongSectors = sectorScores.filter(s => s.sps > 2).slice(0, 3).map(s => ({
            name: s.name,
            tickers: s.topGainers
        }));
        
        const weakSectors = sectorScores.filter(s => s.sps < -2).slice(-3).map(s => ({
            name: s.name,
            tickers: s.topLosers
        }));

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
            // Biên độ hẹp (-0.5% đến 0.5%)
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
                sectorDetails: sectorScores.slice(0, 5) // Trả thêm 5 ngành top đầu để Frontend vẽ Chart nếu cần
            }
        };

    } catch (error) {
        console.error(chalk.red(`[QUANT ENGINE ERROR] ${error.message}`));
        return { success: false, error: error.message };
    }
};