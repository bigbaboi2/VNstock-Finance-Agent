import chalk from 'chalk';

//==========================================
//CORE QUANTITATIVE ENGINE v2.0
//==========================================
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

        //----------------------------------------
        //1. MARKET WIDTH
        //----------------------------------------
        const totalAdvDec = marketBreadth.up + marketBreadth.down;
        const breadthRatio = totalAdvDec > 0 ? (marketBreadth.up / totalAdvDec) * 100 : 50;

        const breadthSource = marketBreadth._isReal ? 'thực' : (marketBreadth._isFallback ? 'ước tính' : 'raw');
        console.log(chalk.cyan(`[QUANT] BreadthRatio=${breadthRatio.toFixed(1)}% (nguồn: ${breadthSource}, ↑${marketBreadth.up} ↓${marketBreadth.down})`));

        //----------------------------------------
        //2. SEGMENTATION + SPS CALCULATION v2
        //----------------------------------------
        let sectorRawData = {};
        let totalActiveVolume = 0;
        let totalMarketCapProxy = 0;

        console.log(chalk.cyan(`[QUANT] activeVolumeStocks: ${activeVolumeStocks.length} mã`));
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
                sectorRawData[sector] = {
                    totalVolume: 0,
                    sumChangePct: 0,
                    sumMomentum3d: 0,  
                    count: 0,
                    netForeignVal: 0,
                    totalMarketCap: 0, 
                    weightedUp: 0,     
                    weightedDown: 0,  
                    stocks: []
                };
            }

            const cap = stock.marketCapProxy || 1;
            sectorRawData[sector].totalVolume += stock.volume;
            sectorRawData[sector].sumChangePct += stock.changePct;
            sectorRawData[sector].sumMomentum3d += (stock.momentum3d ?? stock.changePct); 
            sectorRawData[sector].count += 1;
            sectorRawData[sector].totalMarketCap += cap;

            //=== FIX 5: Weighted breadth theo marketCapProxy ===
            if (stock.changePct > 0.05) sectorRawData[sector].weightedUp += cap;
            else if (stock.changePct < -0.05) sectorRawData[sector].weightedDown += cap;

            sectorRawData[sector].stocks.push({ symbol: stock.symbol, changePct: stock.changePct });
            totalActiveVolume += stock.volume;
            totalMarketCapProxy += cap;
        });

        console.log(chalk.cyan(`[QUANT] Ngành đã phân loại: ${Object.keys(sectorRawData).join(', ') || 'KHÔNG CÓ'}`));

        //Integrate foreignFlow into each industry
        const processForeignFlow = (flowList, isBuy) => {
            (flowList || []).forEach(item => {
                const dbMatch = symbolsDatabase.find(s => s.symbol === item.symbol);
                const sector = dbMatch?.sector || 'KHÁC';
                if (sectorRawData[sector]) {
                    sectorRawData[sector].netForeignVal += isBuy ? item.value : -Math.abs(item.value);
                }
            });
        };
        processForeignFlow(foreignFlow.topBuy, true);
        processForeignFlow(foreignFlow.topSell, false);

        //----------------------------------------
        //3. SPS v2 SCORING
        //----------------------------------------
        let sectorScores = [];
        for (const [sector, data] of Object.entries(sectorRawData)) {
            if (sector === 'KHÁC' || data.count === 0) continue;

            const avgChange = data.sumChangePct / data.count;

            const avgMomentum3d = data.sumMomentum3d / data.count;

            const volShare = totalActiveVolume > 0
                ? (data.totalVolume / totalActiveVolume) * 100
                : 0;

            const volAmplifier = Math.max(0.5, Math.min(2.0, volShare / 10));

            let foreignScore = 0;
            if (data.netForeignVal > 100_000_000_000) foreignScore = 3;
            else if (data.netForeignVal < -100_000_000_000) foreignScore = -3;
            else foreignScore = (data.netForeignVal / 100_000_000_000) * 3;

            const totalCap = data.totalMarketCap || 1;
            const weightedBreadthRatio = data.weightedUp / totalCap;  
            const weightedBreadthScore = (weightedBreadthRatio - 0.5) * 2; 

            const sps = (avgChange * 0.6 + avgMomentum3d * 0.4) * volAmplifier
                        + foreignScore
                        + weightedBreadthScore * 0.5;

            const sortedStocks = data.stocks.sort((a, b) => b.changePct - a.changePct);
            const topGainers = sortedStocks.slice(0, 2).map(s => s.symbol);
            const topLosers = sortedStocks.slice().reverse().slice(0, 2).map(s => s.symbol);

            sectorScores.push({
                name: sector,
                sps,
                avgChange,
                avgMomentum3d,      
                volShare,
                foreignFlow: data.netForeignVal,
                weightedBreadthRatio,
                topGainers,
                topLosers
            });
        }

        console.log(chalk.cyan(`[QUANT] sectorScores (${sectorScores.length} ngành):`));
        sectorScores.forEach(s => console.log(
            chalk.cyan(`  ${s.name}: sps=${s.sps.toFixed(3)}, avgChange=${s.avgChange.toFixed(2)}%, m3d=${s.avgMomentum3d.toFixed(2)}%, vol=${s.volShare.toFixed(1)}%`)
        ));

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

        console.log(chalk.green(`[QUANT] strongSectors: ${strongSectors.map(s => s.name).join(', ') || 'TRỐNG'}`));
        console.log(chalk.red(`[QUANT] weakSectors: ${weakSectors.map(s => s.name).join(', ') || 'TRỐNG'}`));

        //----------------------------------------
        //4. MARKET SCENARIO FORMAT
        //----------------------------------------
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
                breadthSource,       
                foreignNetValue: foreignFlow.netValue || 0,  
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