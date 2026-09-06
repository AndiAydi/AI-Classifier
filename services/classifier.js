/**
 * Classifier service — orchestrates Gemini + DB persistence
 */
const Comment = require("../models/Comment");
const gemini = require("./gemini");
const prompts = require("./prompts");

class ClassifierService {
  /**
   * Classify a comment, persist to DB, return full record.
   * @param {object} input
   *   - text: string (required)
   *   - parent_text: string (optional, for reply context)
   *   - source: 'x' | 'manual' | 'api'
   *   - author_handle, external_id, etc.
   *   - userContext: { ip, userAgent, promptVersion }
   */
  async classify(input) {
    const text = (input.text || "").trim();
    if (!text) throw new Error("text is required");

    // 1. Build user message — include parent context if reply
    const userMessage = input.parent_text
      ? `[Reply to: "${input.parent_text}"]\n\n[Komentar]:\n${text}`
      : text;

    // 2. Get active prompt
    const prompt = await prompts.getActive();

    // 3. Call Gemini
    const t0 = Date.now();
    const { result, latency_ms, tokens, cost } = await gemini.classify(
      userMessage,
      prompt.content,
      {
        promptVersion: prompt.version,
        ip: input.userContext?.ip,
        userAgent: input.userContext?.userAgent,
      }
    );

    // 4. Sanity check / coerce result
    const safe = this.sanitize(result, text);

    // 5. Persist
    const comment = await Comment.create({
      source: input.source || "manual",
      external_id: input.external_id,
      author_handle: input.author_handle,
      author_id: input.author_id,
      text,
      parent_text: input.parent_text,
      parent_id: input.parent_id,
      classification: safe,
      status: "classified",
      prompt_version: prompt.version,
      model: require("../config/env").gemini.model,
      latency_ms,
      token_usage: tokens,
    });

    // 6. Update prompt stats
    try {
      const PromptTemplate = require("../models/PromptTemplate");
      await PromptTemplate.findByIdAndUpdate(prompt._id, {
        $inc: { "stats.total_uses": 1 },
        $set: { "stats.last_used_at": new Date() },
      });
    } catch (e) {
      // ignore
    }

    return comment;
  }

  /**
   * Coerce Gemini output to safe shape, fill defaults.
   */
  sanitize(result, originalText) {
    const validClasses = ["negative", "positive", "neutral"];
    const validContexts = [
      "direct_attack",
      "quote_citation",
      "debate_critique",
      "academic_discussion",
      "dakwah",
      "chitchat",
      "sarcasm_implicit",
      "unknown",
    ];

    const cls = validClasses.includes(result.classification) ? result.classification : "neutral";
    const ctx = validContexts.includes(result.context_type) ? result.context_type : "unknown";

    return {
      classification: cls,
      confidence_score: clamp(parseInt(result.confidence_score, 10) || 70, 0, 100),
      hate_score: clamp(parseInt(result.hate_score, 10) || 0, 0, 100),
      is_hate_speech: cls === "negative",
      is_positive_islamic: cls === "positive",
      context_type: ctx,
      detected_aspects: Array.isArray(result.detected_aspects)
        ? result.detected_aspects.slice(0, 10)
        : [],
      reason: String(result.reason || "Tidak ada alasan diberikan."),
      metadata: {
        contains_terror_stereotype: !!result.metadata?.contains_terror_stereotype,
        contains_animal_dehumanization: !!result.metadata?.contains_animal_dehumanization,
        contains_dakwah_positive: !!result.metadata?.contains_dakwah_positive,
        contains_quote_or_reply: !!result.metadata?.contains_quote_or_reply,
        is_sarcastic: !!result.metadata?.is_sarcastic,
        language: result.metadata?.language || "id",
      },
      action: {
        flag: !!(result.action?.flag ?? (cls === "negative" && parseInt(result.hate_score, 10) >= 60)),
        hide: !!(result.action?.hide ?? (cls === "negative" && parseInt(result.hate_score, 10) >= 80)),
        report_user: !!(result.action?.report_user ?? (cls === "negative" && parseInt(result.hate_score, 10) >= 90)),
      },
    };
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

module.exports = new ClassifierService();
