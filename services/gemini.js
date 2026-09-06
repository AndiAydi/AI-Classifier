/**
 * Gemini API service
 * Wraps Google's Generative AI SDK with retry, JSON-mode, and logging.
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config/env");
const ApiLog = require("../models/ApiLog");

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// Pricing per 1M tokens (gemini-1.5-flash as of late 2024)
// These are estimates — update based on actual Google pricing.
const PRICING = {
  "gemini-1.5-flash": { input: 0.075, output: 0.30 },
  "gemini-1.5-pro": { input: 1.25, output: 5.0 },
  "gemini-1.0-pro": { input: 0.5, output: 1.5 },
};

class GeminiService {
  constructor() {
    this.model = genAI.getGenerativeModel({
      model: config.gemini.model,
      generationConfig: {
        temperature: config.gemini.temperature,
        maxOutputTokens: config.gemini.maxTokens,
        responseMimeType: "application/json", // force JSON output
      },
    });
  }

  /**
   * Classify a comment with the given system prompt.
   * @param {string} userText - the comment to classify
   * @param {string} systemPrompt - the system prompt
   * @param {object} meta - { promptVersion, ip, userAgent }
   * @returns {Promise<{ result: object, latency_ms: number, tokens: object }>}
   */
  async classify(userText, systemPrompt, meta = {}) {
    const start = Date.now();
    let response;
    let error = null;

    try {
      response = await this.callWithRetry(systemPrompt, userText);
    } catch (err) {
      error = err;
      await this.logApiCall({
        ...meta,
        request: { text_length: userText.length, has_parent: false },
        status: "error",
        error_message: err.message,
        latency_ms: Date.now() - start,
      });
      throw err;
    }

    const latency_ms = Date.now() - start;
    const text = response.text();
    const tokens = {
      prompt: response.usageMetadata?.promptTokenCount ?? 0,
      completion: response.usageMetadata?.candidatesTokenCount ?? 0,
      total: response.usageMetadata?.totalTokenCount ?? 0,
    };
    const cost = this.estimateCost(tokens);

    // Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // sometimes the model wraps JSON in markdown
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (e2) {
          await this.logApiCall({
            ...meta,
            request: { text_length: userText.length, has_parent: false },
            status: "error",
            error_message: "JSON parse failed: " + e2.message,
            latency_ms,
            token_input: tokens.prompt,
            token_output: tokens.completion,
            cost_estimate_usd: cost,
          });
          throw new Error("Gemini returned invalid JSON: " + text.slice(0, 200));
        }
      } else {
        throw new Error("Gemini returned no JSON: " + text.slice(0, 200));
      }
    }

    await this.logApiCall({
      ...meta,
      request: { text_length: userText.length, has_parent: false },
      response: {
        classification: parsed.classification,
        confidence: parsed.confidence_score,
        hate_score: parsed.hate_score,
        latency_ms,
        token_input: tokens.prompt,
        token_output: tokens.completion,
        cost_estimate_usd: cost,
      },
      status: "success",
      latency_ms,
      token_input: tokens.prompt,
      token_output: tokens.completion,
      cost_estimate_usd: cost,
    });

    return { result: parsed, latency_ms, tokens, cost };
  }

  /**
   * Call Gemini with simple exponential backoff retry.
   */
  async callWithRetry(systemPrompt, userText, attempt = 0) {
    const maxAttempts = 3;
    try {
      return await this.model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${systemPrompt}\n\n---\n\nKomentar yang akan diklasifikasi:\n"""\n${userText}\n"""\n\nBerikan JSON output sesuai format di system prompt.`,
              },
            ],
          },
        ],
      });
    } catch (err) {
      const retryable = /429|500|503|overloaded|unavailable|timeout/i.test(err.message);
      if (retryable && attempt < maxAttempts - 1) {
        const wait = Math.pow(2, attempt) * 500 + Math.random() * 200;
        console.warn(`Gemini retry ${attempt + 1}/${maxAttempts} after ${Math.round(wait)}ms: ${err.message}`);
        await new Promise((r) => setTimeout(r, wait));
        return this.callWithRetry(systemPrompt, userText, attempt + 1);
      }
      throw err;
    }
  }

  estimateCost(tokens) {
    const p = PRICING[config.gemini.model] || PRICING["gemini-1.5-flash"];
    return ((tokens.prompt * p.input) + (tokens.completion * p.output)) / 1_000_000;
  }

  async logApiCall(data) {
    try {
      await ApiLog.create(data);
    } catch (e) {
      console.error("Failed to log API call:", e.message);
    }
  }

  /**
   * Health check — verify API key works.
   */
  async healthCheck() {
    try {
      const r = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: "Respond with: {\"ok\":true}" }] }],
      });
      return { ok: true, sample: r.text().slice(0, 50) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

module.exports = new GeminiService();
