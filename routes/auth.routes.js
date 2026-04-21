const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const { pool } = require("../db/db");
const { requireAuth } = require("../middleware/auth");
const { getLatestRoadmapForUser, listRoadmapsForUser } = require("../services/roadmapGenerator");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

function createToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT secret is not configured");
  }

  return jwt.sign(
    { userId: user.id, email: user.email },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function findUserByEmail(email) {
  return pool.query(
    "SELECT id, name, email, password_hash FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [email]
  );
}

router.post("/register", authLimiter, async (req, res) => {
  const client = await pool.connect();

  try {
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );
    if (existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, passwordHash]
    );

    const user = result.rows[0];
    const token = createToken(user);

    await client.query("COMMIT");

    res.status(201).json({
      user,
      token,
      roadmap: null
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(rollbackError);
    }
    console.error(error);
    res.status(500).json({ error: "Registration failed" });
  } finally {
    client.release();
  }
});

router.post("/login", authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await findUserByEmail(email);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = createToken(user);
    const [roadmap, roadmaps] = await Promise.all([
      getLatestRoadmapForUser(user.id),
      listRoadmapsForUser(user.id)
    ]);

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token,
      roadmap,
      roadmaps
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const [roadmap, roadmaps] = await Promise.all([
      getLatestRoadmapForUser(req.user.id),
      listRoadmapsForUser(req.user.id)
    ]);

    res.json({
      user: req.user,
      roadmap,
      roadmaps
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load account" });
  }
});

module.exports = router;