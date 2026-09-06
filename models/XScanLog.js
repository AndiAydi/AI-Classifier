/**
 * XScanLog — audit trail of every scan cycle against X.
 * Tracks queries, results, errors, and timing for observability.
 */
const mongoose = require("mongoose");
const { Schema } = mongoose;

const XScanLogSchema = new Schema(
  {
    mode: { type: String, enum: ["live", "mock", "replay"], required: true },
    query: String,
    language: String,
    max_results: { type: Number, default: 100 },

    started_at: { type: Date, default: Date.now },
    finished_at: Date,
    duration_ms: Number,

    stats: {
      tweets_fetched: { type: Number, default: 0 },
      new_comments: { type: Number, default: 0 },
      duplicates_skipped: { type: Number, default: 0 },
      classified: { type: Number, default: 0 },
      flagged_users: { type: Number, default: 0 },
      actions_triggered: { type: Number, default: 0 },
    },

    status: { type: String, enum: ["running", "success", "partial", "failed"], default: "running" },
    error: String,

    // Token / quota
    api_quota_used: Number,
    api_quota_remaining: Number,
  },
  { timestamps: true }
);

XScanLogSchema.index({ started_at: -1 });
XScanLogSchema.index({ status: 1, started_at: -1 });

module.exports = mongoose.model("XScanLog", XScanLogSchema);
