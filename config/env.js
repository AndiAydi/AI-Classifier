/**
 * Environment config — load once at startup, fail fast on missing critical vars
 */
require("dotenv").config();
const path = require("path");

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === null || v === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name, fallback) {
  return process.env[name] ?? fallback;
}

const config = {
  env: optional("NODE_ENV", "development"),
  port: parseInt(optional("PORT", "3000"), 10),
  sessionSecret: required("SESSION_SECRET", "dev-secret-change-me"),

  mongodb: {
    uri: required("MONGODB_URI", "mongodb://localhost:27017/ai_classifier"),
  },

  gemini: {
    apiKey: required("GEMINI_API_KEY", ""),
    model: optional("GEMINI_MODEL", "gemini-1.5-flash"),
    temperature: parseFloat(optional("GEMINI_TEMPERATURE", "0.2")),
    maxTokens: parseInt(optional("GEMINI_MAX_TOKENS", "2048"), 10),
  },

  prompt: {
    file: path.resolve(__dirname, "..", optional("PROMPT_FILE", "prompts/system-v2.md")),
  },

  rateLimit: {
    windowMs: parseInt(optional("RATE_LIMIT_WINDOW_MS", "60000"), 10),
    max: parseInt(optional("RATE_LIMIT_MAX", "120"), 10),
  },

  log: {
    level: optional("LOG_LEVEL", "info"),
  },

  x: {
    // "live" = hit real X API, "mock" = use synthesized data for KTI demo
    mode: optional("X_MODE", "mock"),
    bearerToken: optional("X_BEARER_TOKEN", ""),
  },
};

module.exports = config;
