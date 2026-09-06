/**
 * X Monitor API routes — live X browsing, flagged users, actions
 */
const express = require("express");
const router = express.Router();

const FlaggedUser = require("../models/FlaggedUser");
const XScanLog = require("../models/XScanLog");
const Comment = require("../models/Comment");
const xBrowser = require("../services/x_browser");
const xActions = require("../services/x_actions");

// ============================================================
// SCANNER
// ============================================================

/**
 * GET /api/x/status — current mode & quota
 */
router.get("/status", (req, res) => {
  res.json({
    ok: true,
    data: {
      mode: xBrowser.isLive() ? "live" : "mock",
      is_live: xBrowser.isLive(),
      description: xBrowser.isLive()
        ? "Connected to X API v2 — fetching real tweets"
        : "Mock mode — using synthesized tweets. Set X_BEARER_TOKEN and X_MODE=live to enable real X scanning.",
    },
  });
});

/**
 * POST /api/x/scan — trigger a scan cycle
 * Body: { query?, maxResults?, autoAction? }
 */
router.post("/scan", async (req, res, next) => {
  try {
    const result = await xBrowser.scan({
      query: req.body.query,
      maxResults: Math.min(parseInt(req.body.maxResults, 10) || 20, 100),
      autoAction: !!req.body.autoAction,
    });
    res.json({ ok: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/x/scans — list of scan logs
 */
router.get("/scans", async (req, res, next) => {
  try {
    const { limit = 20, skip = 0 } = req.query;
    const [items, total] = await Promise.all([
      XScanLog.find()
        .sort("-started_at")
        .skip(parseInt(skip, 10))
        .limit(Math.min(parseInt(limit, 10), 100))
        .lean(),
      XScanLog.countDocuments(),
    ]);
    res.json({ ok: true, data: items, total });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/x/scans/:id — single scan detail
 */
router.get("/scans/:id", async (req, res, next) => {
  try {
    const s = await XScanLog.findById(req.params.id).lean();
    if (!s) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, data: s });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// FLAGGED USERS
// ============================================================

/**
 * GET /api/x/users — flagged users with red labels
 * Query: risk_level, status, sort
 */
router.get("/users", async (req, res, next) => {
  try {
    const { risk_level, status, sort = "-risk_score", limit = 50, skip = 0 } = req.query;
    const filter = {};
    if (risk_level) filter.risk_level = risk_level;
    if (status) filter.status = status;

    const [items, total, byRisk] = await Promise.all([
      FlaggedUser.find(filter)
        .sort(sort)
        .skip(parseInt(skip, 10))
        .limit(Math.min(parseInt(limit, 10), 200))
        .lean(),
      FlaggedUser.countDocuments(filter),
      FlaggedUser.aggregate([
        { $group: { _id: "$risk_level", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({ ok: true, data: items, total, by_risk: byRisk });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/x/users/:id — user detail with risk history
 */
router.get("/users/:id", async (req, res, next) => {
  try {
    const user = await FlaggedUser.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ ok: false, error: "Not found" });

    // Get their recent comments
    const comments = await Comment.find({
      author_handle: user.handle,
      source: "x",
    })
      .sort("-createdAt")
      .limit(50)
      .lean();

    res.json({ ok: true, data: { ...user, comments } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/x/users/:id/action — manual action by operator
 * Body: { type: "hide_reply" | "report_user" | "block_user" | "dismiss" | "escalate", reason }
 */
router.post("/users/:id/action", async (req, res, next) => {
  try {
    const { type, reason } = req.body;
    if (!type) return res.status(400).json({ ok: false, error: "type required" });

    const validTypes = ["hide_reply", "report_user", "block_user", "dismiss", "escalate"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ ok: false, error: `invalid type. valid: ${validTypes.join(", ")}` });
    }

    const result = await xActions.manualAction(req.params.id, { type, reason, actor: req.body.actor || "admin" });
    res.json({ ok: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/x/users/:handle/comments — all comments by a handle
 */
router.get("/users/by-handle/:handle/comments", async (req, res, next) => {
  try {
    const items = await Comment.find({
      author_handle: req.params.handle.toLowerCase(),
    })
      .sort("-createdAt")
      .limit(100)
      .lean();
    res.json({ ok: true, data: items, total: items.length });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// LIVE FEED
// ============================================================

/**
 * GET /api/x/feed — most recent x-source comments
 */
router.get("/feed", async (req, res, next) => {
  try {
    const { limit = 30, min_hate_score = 0 } = req.query;
    const items = await Comment.find({
      source: "x",
      ...(min_hate_score > 0 ? { "classification.hate_score": { $gte: parseInt(min_hate_score, 10) } } : {}),
    })
      .sort("-createdAt")
      .limit(Math.min(parseInt(limit, 10), 100))
      .lean();
    res.json({ ok: true, data: items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
