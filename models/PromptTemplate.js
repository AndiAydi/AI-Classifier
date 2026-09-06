/**
 * PromptTemplate — versioned system prompts
 * Lets you A/B test different prompts and roll back if needed.
 */
const mongoose = require("mongoose");
const { Schema } = mongoose;

const PromptTemplateSchema = new Schema(
  {
    name: { type: String, required: true, unique: true }, // e.g. "default", "strict", "lenient"
    version: { type: String, required: true }, // e.g. "v2.0"
    content: { type: String, required: true },
    is_active: { type: Boolean, default: false, index: true },

    notes: String, // what changed
    created_by: { type: String, default: "system" },

    stats: {
      total_uses: { type: Number, default: 0 },
      avg_confidence: { type: Number, default: 0 },
      avg_latency_ms: { type: Number, default: 0 },
      last_used_at: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PromptTemplate", PromptTemplateSchema);
