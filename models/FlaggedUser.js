/**
 * FlaggedUser — aggregates risk per X user across multiple comments.
 * When a user's comment is classified with hate_score ≥ threshold, we
 * track them here and compute cumulative risk for the dashboard "red label".
 *
 * This is OUR internal red-label system. X itself doesn't expose a
 * public "label this user" API, so we maintain a local risk registry
 * that the dashboard visualizes and operators can act on.
 */
const mongoose = require("mongoose");
const { Schema } = mongoose;

const ActionEntrySchema = new Schema(
  {
    type: { type: String, enum: ["hide_reply", "report_user", "block_user", "dismiss", "escalate"], required: true },
    comment_id: { type: Schema.Types.ObjectId, ref: "Comment" },
    reason: String,
    actor: { type: String, default: "system" }, // system | admin
    result: { type: String, enum: ["success", "failed", "pending", "mocked"], default: "pending" },
    error: String,
  },
  { timestamps: { createdAt: "at" } }
);

const FlaggedUserSchema = new Schema(
  {
    // --- X identity ---
    handle: { type: String, required: true, lowercase: true, index: true, unique: true },
    user_id: { type: String, index: true }, // X numeric id if available
    display_name: String,
    profile_image_url: String,
    followers_count: Number,
    following_count: Number,
    account_created_at: Date,
    verified: { type: Boolean, default: false },

    // --- Aggregated risk ---
    total_comments: { type: Number, default: 0 },
    flagged_comments: { type: Number, default: 0 }, // hate_score >= 60
    hidden_comments: { type: Number, default: 0 },
    avg_hate_score: { type: Number, default: 0 },
    max_hate_score: { type: Number, default: 0 },
    avg_confidence: { type: Number, default: 0 },

    // --- Risk label (this is our "red label") ---
    risk_level: {
      type: String,
      enum: ["none", "low", "medium", "high", "critical"],
      default: "none",
      index: true,
    },
    risk_score: { type: Number, default: 0, min: 0, max: 100 }, // composite

    // --- Lifecycle ---
    status: {
      type: String,
      enum: ["monitoring", "warned", "reported", "blocked", "dismissed"],
      default: "monitoring",
      index: true,
    },
    first_flagged_at: Date,
    last_flagged_at: Date,
    last_seen_at: Date,

    // --- Action history ---
    actions: [ActionEntrySchema],

    notes: String, // operator notes
  },
  { timestamps: true }
);

FlaggedUserSchema.index({ risk_level: 1, risk_score: -1 });
FlaggedUserSchema.index({ last_flagged_at: -1 });

/**
 * Recompute risk level from current stats.
 * Pure function — no DB calls.
 */
FlaggedUserSchema.statics.computeRisk = function (stats) {
  const total = Number(stats.total_comments) || 0;
  const flagged = Number(stats.flagged_comments) || 0;
  const max = Number(stats.max_hate_score) || 0;
  const avg = Number(stats.avg_hate_score) || 0;

  if (total === 0 || flagged === 0) {
    return { risk_level: "none", risk_score: 0 };
  }

  // Composite score:
  // - weight by frequency of flags
  // - weight by max hate_score
  // - weight by recent avg
  const frequencyScore = Math.min(40, (flagged / Math.max(total, 1)) * 100);
  const maxScore = max * 0.4; // up to 40
  const avgScore = avg * 0.2; // up to 20
  const composite = Math.min(100, Math.round(frequencyScore + maxScore + avgScore));

  let level = "low";
  if (composite >= 80) level = "critical";
  else if (composite >= 60) level = "high";
  else if (composite >= 30) level = "medium";

  return { risk_level: level, risk_score: composite };
};

module.exports = mongoose.model("FlaggedUser", FlaggedUserSchema);
