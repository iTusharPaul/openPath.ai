require("dotenv").config();

const express = require("express");

const roadmapRoutes = require("./routes/roadmap.routes");

const app = express();

app.use(express.json());

app.use("/api", roadmapRoutes);

const PORT = 5000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});