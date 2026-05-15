const axios = require("axios");

async function getHistoricalData(symbol) {
  try {
    const url = `https://finfo-api.vndirect.com.vn/v4/stock_prices?q=code:${symbol}~date:gte:2025-01-01&sort=date&size=200`;

    const response = await axios.get(url);

    const data = response.data.data || [];

    return data.map(item => ({
      time: item.date,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.nmVolume
    }));

  } catch (error) {
    console.error("Chart fetch error:", error.message);
    return [];
  }
}

module.exports = {
  getHistoricalData
};