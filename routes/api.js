/**
 * API routes — all return JSON
 */
const express = require("express");
const router = express.Router();

const Comment = require("../models/Comment");
const PromptTemplate = require("../models/PromptTemplate");
const ApiLog = require("../models/ApiLog");
const classifier = require("../services/classifier");
const prompts = require("../services/prompts");
const gemini = require("../services/gemini");

// ============================================================
// CLASSIFY
// ============================================================

/**
 * POST /api/classify
 * Body: { text, parent_text?, source?, external_id?, author_handle?, author_id? }
 */
router.post("/classify", async (req, res, next) => {
  try {
    const { text, parent_text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ ok: false, error: "text is required" });
    }
    if (text.length > 5000) {
      return res.status(400).json({ ok: false, error: "text max 5000 chars" });
    }

    const comment = await classifier.classify({
      text,
      parent_text,
      source: req.body.source || "api",
      external_id: req.body.external_id,
      author_handle: req.body.author_handle,
      author_id: req.body.author_id,
      userContext: {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    res.json({ ok: true, data: comment });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// COMMENTS
// ============================================================

/**
 * GET /api/comments — list with filters
 * Query: classification, status, min_hate_score, q (text search), limit, skip, sort
 */
router.get("/comments", async (req, res, next) => {
  try {
    const {
      classification,
      status,
      min_hate_score,
      max_hate_score,
      context_type,
      q,
      limit = 50,
      skip = 0,
      sort = "-createdAt",
    } = req.query;

    const filter = {};
    if (classification) filter["classification.classification"] = classification;
    if (status) filter.status = status;
    if (context_type) filter["classification.context_type"] = context_type;
    if (min_hate_score || max_hate_score) {
      filter["classification.hate_score"] = {};
      if (min_hate_score) filter["classification.hate_score"].$gte = parseInt(min_hate_score, 10);
      if (max_hate_score) filter["classification.hate_score"].$lte = parseInt(max_hate_score, 10);
    }
    if (q) filter.text = { $regex: q, $options: "i" };

    const [items, total] = await Promise.all([
      Comment.find(filter)
        .sort(sort)
        .skip(parseInt(skip, 10))
        .limit(Math.min(parseInt(limit, 10), 200))
        .lean(),
      Comment.countDocuments(filter),
    ]);

    res.json({ ok: true, data: items, total, limit: parseInt(limit, 10), skip: parseInt(skip, 10) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/comments/:id
 */
router.get("/comments/:id", async (req, res, next) => {
  try {
    const c = await Comment.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, data: c });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/comments/:id/review
 * Body: { classification, reason, action: 'approve'|'hide'|'dismiss' }
 */
router.patch("/comments/:id/review", async (req, res, next) => {
  try {
    const { classification, reason, action } = req.body;
    const c = await Comment.findById(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: "Not found" });

    if (classification) {
      c.human_override = {
        classification,
        reason: reason || "Manual review",
        at: new Date(),
      };
    }
    if (action === "hide") c.status = "actioned";
    else if (action === "dismiss") c.status = "dismissed";
    else if (action === "approve") c.status = "reviewed";

    c.reviewed_by = req.body.reviewed_by || "admin";
    c.reviewed_at = new Date();
    await c.save();
    res.json({ ok: true, data: c });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/comments/:id
 */
router.delete("/comments/:id", async (req, res, next) => {
  try {
    const c = await Comment.findByIdAndDelete(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, data: c });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// STATS
// ============================================================

/**
 * GET /api/stats — dashboard metrics
 */
router.get("/stats", async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days

    const [
      totalAll,
      totalLast7d,
      byClass,
      byContext,
      reviewQueue,
      avgLatencyAgg,
      hateScoreDist,
      apiLogs,
    ] = await Promise.all([
      Comment.countDocuments(),
      Comment.countDocuments({ createdAt: { $gte: since } }),
      Comment.aggregate([
        { $group: { _id: "$classification.classification", count: { $sum: 1 } } },
      ]),
      Comment.aggregate([
        { $match: { "classification.context_type": { $exists: true, $ne: null } } },
        { $group: { _id: "$classification.context_type", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Comment.countDocuments({
        status: "classified",
        "classification.hate_score": { $gte: 60 },
      }),
      Comment.aggregate([{ $group: { _id: null, avg: { $avg: "$latency_ms" } } }]),
      Comment.aggregate([
        {
          $bucket: {
            groupBy: "$classification.hate_score",
            boundaries: [0, 20, 40, 60, 80, 90, 101],
            default: "other",
            output: { count: { $sum: 1 } },
          },
        },
      ]),
      ApiLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalCost: { $sum: "$cost_estimate_usd" },
          },
        },
      ]),
    ]);

    const byClassification = { negative: 0, positive: 0, neutral: 0 };
    for (const r of byClass) byClassification[r._id] = r.count;

    res.json({
      ok: true,
      data: {
        total_all: totalAll,
        total_last_7d: totalLast7d,
        by_classification: byClassification,
        by_context: byContext,
        review_queue_count: reviewQueue,
        avg_latency_ms: Math.round(avgLatencyAgg[0]?.avg || 0),
        hate_score_distribution: hateScoreDist,
        api_logs_last_7d: apiLogs,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PROMPTS
// ============================================================

/**
 * GET /api/prompts — list all
 */
router.get("/prompts", async (req, res, next) => {
  try {
    const items = await PromptTemplate.find().sort("-createdAt").lean();
    res.json({ ok: true, data: items });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/prompts/active — get the currently active prompt
 */
router.get("/prompts/active", async (req, res, next) => {
  try {
    const p = await prompts.getActive();
    res.json({ ok: true, data: p });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/prompts — create new
 */
router.post("/prompts", async (req, res, next) => {
  try {
    const { name, version, content, notes, activate } = req.body;
    if (!name || !version || !content) {
      return res.status(400).json({ ok: false, error: "name, version, content required" });
    }
    if (activate) {
      await PromptTemplate.updateMany({}, { is_active: false });
    }
    const p = await PromptTemplate.create({
      name,
      version,
      content,
      notes,
      is_active: !!activate,
      created_by: req.body.created_by || "admin",
    });
    prompts.clearCache();
    res.json({ ok: true, data: p });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/prompts/:id/activate — set as active
 */
router.patch("/prompts/:id/activate", async (req, res, next) => {
  try {
    await PromptTemplate.updateMany({}, { is_active: false });
    const p = await PromptTemplate.findByIdAndUpdate(req.params.id, { is_active: true }, { new: true });
    if (!p) return res.status(404).json({ ok: false, error: "Not found" });
    prompts.clearCache();
    res.json({ ok: true, data: p });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/prompts/:id
 */
router.delete("/prompts/:id", async (req, res, next) => {
  try {
    const p = await PromptTemplate.findById(req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: "Not found" });
    if (p.is_active) {
      return res.status(400).json({ ok: false, error: "Cannot delete active prompt" });
    }
    await p.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// HEALTH
// ============================================================

/**
 * GET /api/health
 */
router.get("/health", async (req, res) => {
  const dbStatus = require("mongoose").connection.readyState; // 1 = connected
  const geminiStatus = await gemini.healthCheck().catch((e) => ({ ok: false, error: e.message }));
  res.json({
    ok: true,
    db: dbStatus === 1 ? "connected" : "disconnected",
    gemini: geminiStatus.ok ? "ready" : `error: ${geminiStatus.error}`,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
