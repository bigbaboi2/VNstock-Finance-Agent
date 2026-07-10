import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI);

const getOrders = async () => {
    const ExchangeOrder = (await import('./models/ExchangeOrder.js')).default;
    const AutoTrade = (await import('./models/AutoTrade.js')).default;

    const orders = await ExchangeOrder.find().sort({ sentAt: -1 }).limit(10).lean();
    console.log("Recent Orders:");
    for (const o of orders) {
        console.log(`- ${o.symbol} | side: ${o.side} | purpose: ${o.purpose} | autoTradeId: ${o.autoTradeId}`);
        if (o.autoTradeId) {
            const t = await AutoTrade.findById(o.autoTradeId);
            console.log(`   -> AutoTrade: livePnl: ${t?.livePnl}, livePnlPercent: ${t?.livePnlPercent}`);
        }
    }
    process.exit(0);
};

getOrders();
