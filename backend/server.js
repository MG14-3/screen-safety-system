// ═══════════════════════════════════════════════════════════════════
//  Screen Safety System — Node.js / Express / MongoDB Atlas Backend
//  Endpoints:
//    POST   /api/logs                  ← Python script posts detection events
//    GET    /api/logs?limit=50         ← React dashboard reads logs
//    POST   /api/commands              ← React dashboard queues a command
//    GET    /api/commands/latest       ← Python polls for pending commands
//    PATCH  /api/commands/:id/execute  ← Python marks command done
//    GET    /api/status                ← React status card
//    GET    /health                    ← Healthcheck
// ═══════════════════════════════════════════════════════════════════

require("dotenv").config();
const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── MongoDB Connection ────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅  MongoDB Atlas connected"))
  .catch((err) => {
    console.warn("⚠️   MongoDB connection failed — running in memory-only mode.");
    console.warn("    Set MONGO_URI in backend/.env to persist data.");
    console.warn("   ", err.message);
  });

// ─── Mongoose Schemas ──────────────────────────────────────────────────────────
const logSchema = new mongoose.Schema(
  {
    distance:   { type: Number, default: 999 },
    age:        { type: Number, default: null },
    brightness: { type: Number, default: 100 },
    action:     { type: String, default: "UNKNOWN" },
    timestamp:  { type: Date,   default: Date.now },
  },
  { versionKey: false }
);

const commandSchema = new mongoose.Schema(
  {
    command:   { type: String, required: true },  // SYSTEM_ON | SYSTEM_OFF | FORCE_SAFE
    status:    { type: String, default: "pending" }, // pending | executed
    timestamp: { type: Date,   default: Date.now },
    executedAt:{ type: Date,   default: null },
  },
  { versionKey: false }
);

const Log     = mongoose.model("Log",     logSchema);
const Command = mongoose.model("Command", commandSchema);

// ── In-memory fallback (when MongoDB is offline) ──────────────────────────────
const memLogs     = [];
const memCommands = [];
let   memIdCounter = 1;

// ─── Helper: is MongoDB connected? ────────────────────────────────────────────
const isMongoConnected = () => mongoose.connection.readyState === 1;

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    mongo:  isMongoConnected() ? "connected" : "offline",
    uptime: process.uptime(),
  });
});

// ── POST /api/logs ─────────────────────────────────────────────────────────────
app.post("/api/logs", async (req, res) => {
  const { distance = 999, age = null, brightness = 100, action = "UNKNOWN" } = req.body;
  const entry = { distance, age, brightness, action, timestamp: new Date() };

  if (isMongoConnected()) {
    try {
      const saved = await Log.create(entry);
      return res.status(201).json(saved);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // fallback
  const record = { _id: String(memIdCounter++), ...entry };
  memLogs.unshift(record);
  if (memLogs.length > 200) memLogs.pop();
  res.status(201).json(record);
});

// ── GET /api/logs ──────────────────────────────────────────────────────────────
app.get("/api/logs", async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  if (isMongoConnected()) {
    try {
      const logs = await Log.find().sort({ timestamp: -1 }).limit(limit);
      return res.json(logs);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.json(memLogs.slice(0, limit));
});

// ── GET /api/status ────────────────────────────────────────────────────────────
app.get("/api/status", async (req, res) => {
  if (isMongoConnected()) {
    try {
      const latest = await Log.findOne().sort({ timestamp: -1 });
      return res.json(latest || {});
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  res.json(memLogs[0] || {});
});

// ── POST /api/commands ─────────────────────────────────────────────────────────
app.post("/api/commands", async (req, res) => {
  const { command } = req.body;
  const VALID = ["SYSTEM_ON", "SYSTEM_OFF", "FORCE_SAFE", "RELEASE_SAFE"];
  if (!VALID.includes(command)) {
    return res.status(400).json({ error: `Unknown command. Use one of: ${VALID.join(", ")}` });
  }

  const entry = { command, status: "pending", timestamp: new Date(), executedAt: null };

  if (isMongoConnected()) {
    try {
      const saved = await Command.create(entry);
      return res.status(201).json(saved);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const record = { _id: String(memIdCounter++), ...entry };
  memCommands.unshift(record);
  res.status(201).json(record);
});

// ── GET /api/commands/latest ───────────────────────────────────────────────────
// Returns the oldest pending command (FIFO)
app.get("/api/commands/latest", async (req, res) => {
  if (isMongoConnected()) {
    try {
      const cmd = await Command.findOne({ status: "pending" }).sort({ timestamp: 1 });
      if (!cmd) return res.status(204).end();
      return res.json(cmd);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const cmd = [...memCommands].reverse().find((c) => c.status === "pending");
  if (!cmd) return res.status(204).end();
  res.json(cmd);
});

// ── PATCH /api/commands/:id/execute ───────────────────────────────────────────
app.patch("/api/commands/:id/execute", async (req, res) => {
  const { id } = req.params;

  if (isMongoConnected()) {
    try {
      const cmd = await Command.findByIdAndUpdate(
        id,
        { status: "executed", executedAt: new Date() },
        { new: true }
      );
      if (!cmd) return res.status(404).json({ error: "Command not found" });
      return res.json(cmd);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const cmd = memCommands.find((c) => c._id === id);
  if (!cmd) return res.status(404).json({ error: "Command not found" });
  cmd.status     = "executed";
  cmd.executedAt = new Date();
  res.json(cmd);
});

// ── GET /api/commands ──────────────────────────────────────────────────────────
app.get("/api/commands", async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;

  if (isMongoConnected()) {
    try {
      const cmds = await Command.find().sort({ timestamp: -1 }).limit(limit);
      return res.json(cmds);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.json(memCommands.slice(0, limit));
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("═".repeat(60));
  console.log("  SafeScreen Backend — Running");
  console.log(`  API Server  →  http://localhost:${PORT}`);
  console.log(`  Health      →  http://localhost:${PORT}/health`);
  console.log("═".repeat(60));
});
