const express = require("express");
const { getConfig, updateConfig, resetConfig } = require("./config");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(getConfig());
});

router.put("/", (req, res) => {
  try {
    res.json(updateConfig(req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/reset", (req, res) => {
  res.json(resetConfig());
});

module.exports = router;
