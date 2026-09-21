const express = require("express");
const cors = require("cors");

const { optimizeWarehouses } = require("./Optimization/optimizer");

const app = express();

// Use Render's dynamic port, or default to 3000 locally
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "backend is running",
  });
});

// Optimization API
app.post("/api/optimize", (req, res) => {
  try {
    console.log("Optimization request received");

    const result = optimizeWarehouses(req.body);

    console.log("Optimization completed");

    res.status(200).json(result);
  } catch (error) {
    console.error("Optimization error:", error);

    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
});

// START SERVER
// Removed "127.0.0.1" host binding so Render can accept public incoming traffic
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
});

// Catch server errors
server.on("error", (error) => {
  console.error("SERVER ERROR:", error);
});

// Keep process alive
process.on("SIGINT", () => {
  console.log("\nShutting down backend...");
  server.close(() => {
    process.exit(0);
  });
});