const express = require("express");
const router = express.Router();

const { generateRoadmap, getLatestRoadmapForUser } = require("../services/roadmapGenerator");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.post("/generate-roadmap", async (req, res) => {
  try {
    const result = await generateRoadmap(req.body, { userId: req.user.id });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Roadmap generation failed" });
  }
});

router.get("/roadmap/latest", async (req, res) => {
  try {
    const latestRoadmap = await getLatestRoadmapForUser(req.user.id);
    res.json({ roadmap: latestRoadmap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load roadmap" });
  }
});

module.exports = router;