/**
 * AI-Classifier System v2.0 — Express server entry
 */
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const config = require("./config/env");
const db = require("./config/db");

const apiRoutes = require("./routes/api");
const xRoutes = require("./routes/x");
const viewRoutes = require("./routes/views");
const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// --- Security & middleware ---
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.env === "production" ? "combined" : "dev"));
app.use(requestLogger);

// --- Rate limiting on /api ---
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { ok: false, error: "Too many requests, please slow down." },
});
app.use("/api", apiLimiter);

// --- View engine ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// --- Static ---
app.use(express.static(path.join(__dirname, "public")));

// --- Routes ---
app.use("/api", apiRoutes);
app.use("/api/x", xRoutes);
app.use("/", viewRoutes);

// --- 404 (for non-API) ---
app.use((req, res) => {
  if (req.originalUrl.startsWith("/api/")) {
    return res.status(404).json({ ok: false, error: "Endpoint not found" });
  }
  res.status(404).render("404", { title: "Not Found", activeNav: "" });
});

// --- Error handler ---
app.use(errorHandler);

// --- Boot ---
async function boot() {
  await db.connect();

  // seed default prompt if none exists
  try {
    const PromptTemplate = require("./models/PromptTemplate");
    const exists = await PromptTemplate.findOne({ is_active: true });
    if (!exists) {
      const fs = require("fs");
      const promptFile = config.prompt.file;
      if (fs.existsSync(promptFile)) {
        const content = fs.readFileSync(promptFile, "utf8");
        const m = content.match(/v(\d+\.\d+)/);
        const version = m ? `v${m[1]}` : "v2.0";
        await PromptTemplate.create({
          name: "default",
          version,
          content,
          notes: "Auto-imported from system-v2.md on first boot",
          is_active: true,
          created_by: "system",
        });
        console.log("✓ Seeded default prompt from file");
      }
    }
  } catch (e) {
    console.warn("Prompt seed skipped:", e.message);
  }

  app.listen(config.port, () => {
    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  AI-Classifier v2.0  —  ${config.env}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Dashboard:  http://localhost:${config.port}`);
    console.log(`  API:        http://localhost:${config.port}/api`);
    console.log(`  Health:     http://localhost:${config.port}/api/health`);
    console.log(`  MongoDB:    ${config.mongodb.uri.replace(/\/\/.*@/, "//***@")}`);
    console.log(`  Gemini:     ${config.gemini.model}  (key ${config.gemini.apiKey ? "✓" : "✗ MISSING"})`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");
  });
}

boot().catch((err) => {
  console.error("Boot failed:", err);
  process.exit(1);
});

module.exports = app;
