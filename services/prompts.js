/**
 * Prompt service — loads prompt from DB (active) or file
 */
const fs = require("fs");
const path = require("path");
const config = require("../config/env");
const PromptTemplate = require("../models/PromptTemplate");

let cached = { content: null, version: null, source: null };

/**
 * Get the active prompt. Priority:
 *   1. Active PromptTemplate in DB (if exists)
 *   2. File from config.prompt.file
 *   3. Hardcoded default
 */
async function getActive() {
  // 1. Try DB
  try {
    const active = await PromptTemplate.findOne({ is_active: true }).lean();
    if (active) {
      cached = {
        content: active.content,
        version: active.version,
        source: "db",
        name: active.name,
        _id: active._id,
      };
      return cached;
    }
  } catch (e) {
    // DB might not be ready (e.g. during seed). Fall through.
  }

  // 2. File
  try {
    const filePath = config.prompt.file;
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      cached = {
        content,
        version: extractVersion(content) || "v2.0",
        source: "file",
        name: "default",
      };
      return cached;
    }
  } catch (e) {
    console.warn("Failed to read prompt file:", e.message);
  }

  // 3. Hardcoded fallback
  cached = {
    content: FALLBACK_PROMPT,
    version: "v2.0",
    source: "fallback",
    name: "default",
  };
  return cached;
}

function extractVersion(content) {
  const m = content.match(/v(\d+\.\d+)/);
  return m ? `v${m[1]}` : null;
}

function clearCache() {
  cached = { content: null, version: null, source: null };
}

const FALLBACK_PROMPT = `# AI-Classifier v2.0 (Fallback)
Anda adalah classifier. Klasifikasikan komentar ke: negative, positive, atau neutral.
Output JSON.`;

module.exports = { getActive, clearCache };
