require("dotenv").config();

const express = require("express");
const path = require("path");

const roadmapRoutes = require("./routes/roadmap.routes");

const app = express();


app.use(express.json());

// Serve frontend (public/)
app.use(express.static(path.join(__dirname, "public")));

app.use("/api", roadmapRoutes);

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});