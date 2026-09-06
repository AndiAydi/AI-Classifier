/**
 * Comment — incoming tweet/comment to classify
 */
const mongoose = require("mongoose");
const { Schema } = mongoose;

const ClassificationSchema = new Schema(
  {
    classification: { type: String, enum: ["negative", "positive", "neutral"], index: true },
    confidence_score: { type: Number, min: 0, max: 100 },
    hate_score: { type: Number, min: 0, max: 100, index: true },
    is_hate_speech: { type: Boolean, default: false, index: true },
    is_positive_islamic: { type: Boolean, default: false },

    context_type: {
      type: String,
      enum: [
        "direct_attack",
        "quote_citation",
        "debate_critique",
        "academic_discussion",
        "dakwah",
        "chitchat",
        "sarcasm_implicit",
        "unknown",
      ],
      default: "unknown",
    },

    detected_aspects: [String],
    reason: String,

    metadata: {
      contains_terror_stereotype: { type: Boolean, default: false },
      contains_animal_dehumanization: { type: Boolean, default: false },
      contains_dakwah_positive: { type: Boolean, default: false },
      contains_quote_or_reply: { type: Boolean, default: false },
      is_sarcastic: { type: Boolean, default: false },
      language: { type: String, default: "id" },
    },

    action: {
      flag: { type: Boolean, default: false },
      hide: { type: Boolean, default: false },
      report_user: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const CommentSchema = new Schema(
  {
    // --- Source ---
    source: { type: String, enum: ["x", "manual", "api", "seed"], default: "manual", index: true },
    external_id: { type: String, index: true }, // tweet id
    author_handle: String,
    author_id: String,

    // --- Content ---
    text: { type: String, required: true, maxlength: 5000 },
    parent_text: String, // if reply, the parent comment text
    parent_id: String,

    // --- Classification result ---
    classification: ClassificationSchema,

    // --- Lifecycle ---
    status: {
      type: String,
      enum: ["pending", "classified", "reviewed", "actioned", "dismissed"],
      default: "pending",
      index: true,
    },
    reviewed_by: String,
    reviewed_at: Date,
    human_override: {
      classification: String,
      reason: String,
      at: Date,
    },

    // --- Provenance ---
    prompt_version: String,
    model: String,
    latency_ms: Number,
    token_usage: {
      prompt: Number,
      completion: Number,
      total: Number,
    },
  },
  { timestamps: true }
);

// Indexes for common queries
CommentSchema.index({ createdAt: -1 });
CommentSchema.index({ "classification.classification": 1, createdAt: -1 });
CommentSchema.index({ "classification.hate_score": -1 });
CommentSchema.index({ status: 1, "classification.hate_score": -1 });

module.exports = mongoose.model("Comment", CommentSchema);
