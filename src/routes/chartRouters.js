const express = require("express");
const router = express.Router();

const { fetchChartData } = require("../services/chartService");

router.get("/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    const data = await fetchChartData(symbol);

    res.json({
      success: true,
      symbol,
      data
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;