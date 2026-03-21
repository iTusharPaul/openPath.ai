const express = require("express");
const router = express.Router();

const { generateRoadmap } = require("../services/roadmapGenerator");

router.post("/generate-roadmap", async (req, res) => {
  try {
    const result = await generateRoadmap(req.body);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Roadmap generation failed" });
  }
});

module.exports = router;