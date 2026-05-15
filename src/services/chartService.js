const { getHistoricalData } = require("../providers/vnstockProvider");

async function fetchChartData(symbol) {
  return await getHistoricalData(symbol);
}

module.exports = {
  fetchChartData
};