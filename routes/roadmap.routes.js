const express = require("express");
const router = express.Router();

const {
  generateRoadmap,
  getLatestRoadmapForUser,
  listRoadmapsForUser,
  getRoadmapForUser,
  updateRoadmapProgressForUser
} = require("../services/roadmapGenerator");
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

router.get("/roadmaps", async (req, res) => {
  try {
    const roadmaps = await listRoadmapsForUser(req.user.id);
    res.json({ roadmaps });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load roadmaps" });
  }
});

router.get("/roadmaps/:id", async (req, res) => {
  try {
    const roadmap = await getRoadmapForUser(req.user.id, req.params.id);
    if (!roadmap) {
      return res.status(404).json({ error: "Roadmap not found" });
    }
    return res.json({ roadmap });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load roadmap" });
  }
});

router.patch("/roadmaps/:id/progress", async (req, res) => {
  try {
    const completedConcepts = Array.isArray(req.body?.completed_concepts)
      ? req.body.completed_concepts
      : [];

    const roadmap = await updateRoadmapProgressForUser(
      req.user.id,
      req.params.id,
      completedConcepts
    );

    if (!roadmap) {
      return res.status(404).json({ error: "Roadmap not found" });
    }

    return res.json({ roadmap });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update progress" });
  }
});

module.exports = router;