/**
 * ApiLog — tracks every Gemini API call for cost/latency monitoring
 */
const mongoose = require("mongoose");
const { Schema } = mongoose;

const ApiLogSchema = new Schema(
  {
    endpoint: String, // "/api/classify"
    model: String,
    prompt_version: String,

    request: {
      text_length: Number,
      has_parent: Boolean,
    },

    response: {
      classification: String,
      confidence: Number,
      hate_score: Number,
      latency_ms: Number,
      token_input: Number,
      token_output: Number,
      cost_estimate_usd: Number,
    },

    status: { type: String, enum: ["success", "error", "timeout"], default: "success" },
    error_message: String,

    user_agent: String,
    ip: String,
  },
  { timestamps: true }
);

ApiLogSchema.index({ createdAt: -1 });
ApiLogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("ApiLog", ApiLogSchema);
