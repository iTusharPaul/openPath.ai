require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");

const roadmapRoutes = require("./routes/roadmap.routes");
const authRoutes = require("./routes/auth.routes");
const { ensureSchema } = require("./db/db");

const app = express();


app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend (public/)
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", authRoutes);
app.use("/api", roadmapRoutes);

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

async function startServer() {
  await ensureSchema();

  app.listen(PORT, () => {
    console.log("Server running on port", PORT);
  });
}

startServer().catch(err => {
  console.error("Failed to start server", err);
  process.exit(1);
});