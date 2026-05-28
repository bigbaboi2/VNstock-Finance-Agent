
import Portfolio from '../../models/Portfolio.js';  

export const getPortfolio = async (req, res) => {
    try {
        let portfolio = await Portfolio.findOne({ username: req.params.username });
        if (!portfolio) {
            portfolio = new Portfolio({ username: req.params.username });
            await portfolio.save();
        }
        res.json({ success: true, data: portfolio });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const cancelOrder = async (req, res) => {
    const { username, orderId } = req.body;
    
    try {
        let portfolio = await Portfolio.findOne({ username });
        if (!portfolio) return res.status(404).json({ success: false, message: 'Không tìm thấy ví!' });

        const orderIndex = portfolio.pendingOrders.findIndex(o => o._id?.toString() === orderId);
        if (orderIndex === -1) {
            return res.status(400).json({ success: false, message: 'Lệnh không tồn tại hoặc đã được khớp từ trước!' });
        }

        const orderToCancel = portfolio.pendingOrders[orderIndex];

        if (orderToCancel.type === 'BUY') {
            const blockedValue = orderToCancel.volume * orderToCancel.targetPrice;
            portfolio.balance += blockedValue;
        }

        portfolio.pendingOrders.splice(orderIndex, 1);
        await portfolio.save();

        res.json({ success: true, data: portfolio, message: 'Đã hủy lệnh thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const tradeOrder = async (req, res) => {
    const { username, assetType, symbol, type, orderType, volume, price, isMarketOpen } = req.body;
    
    try {
        let portfolio = await Portfolio.findOne({ username });
        if (!portfolio) return res.status(404).json({ success: false, message: 'Không tìm thấy ví!' });

        const totalValue = volume * price;

        if (!isMarketOpen || orderType === 'ATO' || orderType === 'ATC' || orderType === 'LO') {
            if (type === 'BUY') {
                const updatedPortfolio = await Portfolio.findOneAndUpdate(
                        { username, balance: { $gte: totalValue } },
                        { $inc: { balance: -totalValue } },
                        { returnDocument: 'after' }
                );
                if (!updatedPortfolio) {
                    return res.status(400).json({ success: false, message: 'Số dư không đủ để đặt lệnh chờ!' });                
                }                
                portfolio = updatedPortfolio;
            }
            if (type === 'SELL') {
                const holding = portfolio.holdings.find(h => h.symbol === symbol);
                if (!holding || holding.volume < volume) {
                    return res.status(400).json({ success: false, message: 'Không đủ cổ phiếu khả dụng để đặt bán!' });
                }
            }

            await Portfolio.updateOne(
                { username },
                {
                    $push: {
                        pendingOrders: {
                            assetType,
                            symbol,
                            type,
                            orderType,
                            volume,
                            targetPrice: price,
                            status: 'PENDING'
                        }
                    }
                }
            );

            portfolio = await Portfolio.findOne({ username });
            return res.json({ success: true, isPending: true, data: portfolio, message: `Lệnh ${type} ${orderType} đã được đưa vào Sổ Lệnh chờ khớp!` });
        }

        let holdingIndex = portfolio.holdings.findIndex(h => h.symbol === symbol && h.assetType === assetType);
        let realizedPnL = 0;

        if (type === 'BUY') {
            const existingHolding = portfolio.holdings.find(h => h.symbol === symbol && h.assetType === assetType);
            if (existingHolding) {
                const oldVol = existingHolding.volume;
                const oldAvg = existingHolding.avgPrice;
                const newVol = oldVol + volume;
                const newAvg = ((oldVol * oldAvg) + totalValue) / newVol;

                const updatedPortfolio = await Portfolio.findOneAndUpdate(
                    {
                        username,
                        balance: { $gte: totalValue },
                        "holdings.symbol": symbol,
                        "holdings.assetType": assetType
                    },
                    {
                        $inc: { balance: -totalValue, "holdings.$.volume": volume },
                        $set: { "holdings.$.avgPrice": newAvg }
                    },
                    { returnDocument: 'after' }
                );

                if (!updatedPortfolio) {
                    return res.status(400).json({ success: false, message: 'Số dư không đủ để mua!' });
                }
                portfolio = updatedPortfolio;
            } else {
                const updatedPortfolio = await Portfolio.findOneAndUpdate(
                    {
                        username,
                        balance: { $gte: totalValue }
                    },
                    {
                        $inc: { balance: -totalValue },
                        $push: {
                            holdings: { assetType, symbol, volume, avgPrice: price }
                        }
                    },
                    { returnDocument: 'after' }
                );

                if (!updatedPortfolio) {
                    return res.status(400).json({ success: false, message: 'Số dư không đủ để mua!' });
                }
                portfolio = updatedPortfolio;
            }
        }
        else if (type === 'SELL') {
            const updatedPortfolio = await Portfolio.findOneAndUpdate(
                {
                    username,
                    holdings: {
                        $elemMatch: {
                            symbol,
                            assetType,
                            volume: { $gte: volume }
                        }
                    }
                },
                {
                    $inc: { "holdings.$.volume": -volume, balance: totalValue }
                },
                { returnDocument: 'after' }
            );

            if (!updatedPortfolio) {
                return res.status(400).json({ success: false, message: 'Không đủ số lượng tài sản để bán!' });
            }

            portfolio = updatedPortfolio;
            holdingIndex = portfolio.holdings.findIndex(h => h.symbol === symbol && h.assetType === assetType);
            const avgPrice = portfolio.holdings[holdingIndex]?.avgPrice || 0;
            realizedPnL = (price - avgPrice) * volume;

            if (holdingIndex >= 0 && portfolio.holdings[holdingIndex].volume <= 0) {
                portfolio.holdings.splice(holdingIndex, 1);
            }
        }

        portfolio.history.push({ assetType, symbol, type, volume, price, totalValue, realizedPnL });
        await portfolio.save();

        res.json({ success: true, isPending: false, data: portfolio, message: `Khớp lệnh MP ${type} thành công!` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};