const jwt = require("jsonwebtoken");

const { pool } = require("../db/db");

function getTokenFromRequest(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

async function requireAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "JWT secret is not configured" });
    }

    const payload = jwt.verify(token, secret);
    const result = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [payload.userId]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Authentication required" });
    }

    req.user = result.rows[0];
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireAuth };