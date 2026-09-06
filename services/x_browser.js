/**
 * X Browser Service
 * -----------------
 * Two modes:
 *   - LIVE: hits real X API v2 (requires Bearer Token in .env)
 *   - MOCK: returns synthesized tweets (for KTI demo / offline dev)
 *
 * X API v2 endpoints used (live mode):
 *   GET  /2/tweets/search/recent       — search recent tweets (Basic $100/mo+)
 *   GET  /2/users/by/username/:handle  — lookup user profile
 *   GET  /2/users/:id/tweets           — user's recent tweets
 *   GET  /2/tweets/:id                 — single tweet by id
 *   GET  /2/tweets/search/stream       — filtered stream (Pro $5k/mo)
 *
 * For a KTI, MOCK mode is the default. Switch to LIVE by setting
 * X_BEARER_TOKEN in .env and X_MODE=live.
 */
const Comment = require("../models/Comment");
const FlaggedUser = require("../models/FlaggedUser");
const XScanLog = require("../models/XScanLog");
const classifier = require("./classifier");
const config = require("../config/env");

const MOCK_TWEETS = [
  {
    id: "1735000000000000001",
    text: "Islam agama teroris, harusnya dilarang di Indonesia. Muslim pada radikal semua!",
    author_id: "123456",
    author_handle: "radicalvoice01",
    author_name: "Radical Voice",
    followers: 234,
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: "1735000000000000002",
    text: "Monyet bersorban bikin risih aja. Pake hijab kek, tapi kelakuannya primitif.",
    author_id: "234567",
    author_handle: "streetcritic",
    author_name: "Street Critic",
    followers: 1200,
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "1735000000000000003",
    text: "Subhanallah, MasyaAllah, semoga Allah memberi kita semua hidayah. Mari jaga ukhuwah.",
    author_id: "345678",
    author_handle: "muslimah_daily",
    author_name: "Daily Muslimah",
    followers: 5400,
    verified: true,
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: "1735000000000000004",
    text: "Saya kurang setuju dengan konsep poligami, perlu dikaji ulang konteksnya. Saya hormati yang berbeda pendapat.",
    author_id: "456789",
    author_handle: "akademisi.id",
    author_name: "Akademisi ID",
    followers: 12300,
    verified: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "1735000000000000005",
    text: "Oh pake jenggot panjang ya, besok pasti bawa bom ke pasar 😂",
    author_id: "567890",
    author_handle: "sarcastic_bro",
    author_name: "Sarcastic Bro",
    followers: 89,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  {
    id: "1735000000000000006",
    text: "Dasar bocil, goblok sih. Pergi belajar sana!",
    author_id: "678901",
    author_handle: "randomuser22",
    author_name: "Random",
    followers: 42,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
  {
    id: "1735000000000000007",
    text: "Najis banget sih agama itu, pengikutnya pada gila. Kafir semua!",
    author_id: "123456",
    author_handle: "radicalvoice01",
    author_name: "Radical Voice",
    followers: 234,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
  {
    id: "1735000000000000008",
    text: "Agama mana sih yang nyuruh bom bunuh diri? Islam kan? Yakin deh itu",
    author_id: "789012",
    author_handle: "concernedcitizen",
    author_name: "Concerned",
    followers: 567,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
  },
  {
    id: "1735000000000000009",
    text: "Alhamdulillah tabarakallah, hari ini berkah. Mari kita saling mendoakan.",
    author_id: "890123",
    author_handle: "ustadzah.amina",
    author_name: "Ustadzah Amina",
    followers: 28900,
    verified: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
  {
    id: "1735000000000000010",
    text: "Wah masjid mana yang jadi sarang teroris ya? Gw mau demo. #IslamAdalahTeroris",
    author_id: "234567",
    author_handle: "streetcritic",
    author_name: "Street Critic",
    followers: 1200,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
  },
];

class XBrowserService {
  constructor() {
    this.mode = config.x.mode; // "live" | "mock"
    this.bearerToken = config.x.bearerToken;
    this.baseUrl = "https://api.twitter.com";
  }

  isLive() {
    return this.mode === "live" && !!this.bearerToken;
  }

  /**
   * Search recent tweets by query.
   * @param {string} query
   * @param {object} options - { maxResults, language, sinceId }
   * @returns {Promise<Array>}
   */
  async searchTweets(query, options = {}) {
    if (this.isLive()) {
      return this._liveSearch(query, options);
    }
    return this._mockSearch(query, options);
  }

  async _mockSearch(query, { maxResults = 10 } = {}) {
    // Filter mock tweets by query keyword (case-insensitive)
    const q = (query || "").toLowerCase();
    let results = MOCK_TWEETS;
    if (q && q.length > 1) {
      results = MOCK_TWEETS.filter((t) => t.text.toLowerCase().includes(q) || q.split(" ").some((w) => t.text.toLowerCase().includes(w)));
    }
    return results.slice(0, maxResults);
  }

  async _liveSearch(query, { maxResults = 10, sinceId } = {}) {
    const params = new URLSearchParams({
      query: query + " -is:retweet lang:id",
      max_results: String(Math.min(maxResults, 100)),
      "tweet.fields": "created_at,author_id,public_metrics,lang,context_annotations",
      "user.fields": "username,name,profile_image_url,verified,public_metrics,created_at",
      expansions: "author_id",
    });
    if (sinceId) params.set("since_id", sinceId);

    const r = await fetch(`${this.baseUrl}/2/tweets/search/recent?${params}`, {
      headers: { Authorization: `Bearer ${this.bearerToken}` },
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error(`X API ${r.status}: ${err.slice(0, 200)}`);
    }

    const json = await r.json();
    const userMap = {};
    for (const u of json.includes?.users || []) {
      userMap[u.id] = u;
    }

    return (json.data || []).map((t) => {
      const u = userMap[t.author_id] || {};
      return {
        id: t.id,
        text: t.text,
        author_id: t.author_id,
        author_handle: u.username,
        author_name: u.name,
        profile_image_url: u.profile_image_url,
        verified: u.verified,
        followers: u.public_metrics?.followers_count,
        created_at: t.created_at,
        metrics: t.public_metrics,
      };
    });
  }

  /**
   * Run a scan: fetch tweets → classify → flag users → trigger actions.
   * @param {object} options
   *   - query: search query (default: religion-related)
   *   - maxResults: 1-100
   *   - autoAction: if true, auto-trigger X actions for high-risk
   *   - language
   */
  async scan(options = {}) {
    const {
      query = "(islam OR muslim OR masjid OR jihad OR ustadz) (teroris OR radikal OR bom OR monyet OR anjing) -is:retweet",
      maxResults = 20,
      autoAction = false,
      language = "id",
    } = options;

    const scanLog = await XScanLog.create({
      mode: this.isLive() ? "live" : "mock",
      query,
      language,
      max_results: maxResults,
    });

    const t0 = Date.now();
    let stats = { tweets_fetched: 0, new_comments: 0, duplicates_skipped: 0, classified: 0, flagged_users: 0, actions_triggered: 0 };

    try {
      const tweets = await this.searchTweets(query, { maxResults, language });
      stats.tweets_fetched = tweets.length;

      for (const t of tweets) {
        // Skip duplicates
        const exists = await Comment.findOne({ external_id: t.id }).lean();
        if (exists) {
          stats.duplicates_skipped++;
          continue;
        }

        // Classify
        let comment;
        try {
          comment = await classifier.classify({
            text: t.text,
            source: "x",
            external_id: t.id,
            author_handle: t.author_handle,
            author_id: t.author_id,
            userContext: { ip: "x-scanner", userAgent: "ai-classifier-x-scanner/2.0" },
          });
        } catch (e) {
          console.warn("Classify failed for tweet", t.id, e.message);
          continue;
        }
        stats.new_comments++;
        stats.classified++;

        // Update flagged user
        if (t.author_handle) {
          const flagged = await this.upsertFlaggedUser(t, comment);
          if (flagged.risk_level === "high" || flagged.risk_level === "critical") {
            stats.flagged_users++;
            if (autoAction) {
              try {
                const xActions = require("./x_actions");
                const result = await xActions.escalate(flagged, comment);
                if (result.success) stats.actions_triggered++;
              } catch (e) {
                console.warn("Auto-action failed:", e.message);
              }
            }
          }
        }
      }

      scanLog.finished_at = new Date();
      scanLog.duration_ms = Date.now() - t0;
      scanLog.stats = stats;
      scanLog.status = "success";
      await scanLog.save();

      return { scan_id: scanLog._id, mode: scanLog.mode, ...stats, duration_ms: scanLog.duration_ms };
    } catch (err) {
      scanLog.finished_at = new Date();
      scanLog.duration_ms = Date.now() - t0;
      scanLog.status = "failed";
      scanLog.error = err.message;
      await scanLog.save();
      throw err;
    }
  }

  /**
   * Update or create FlaggedUser record from a classified comment.
   */
  async upsertFlaggedUser(tweet, comment) {
    if (!tweet.author_handle) return null;

    const handle = tweet.author_handle.toLowerCase();
    const hateScore = comment.classification?.hate_score || 0;
    const isFlagged = hateScore >= 60;

    let user = await FlaggedUser.findOne({ handle });
    if (!user) {
      user = await FlaggedUser.create({
        handle,
        user_id: tweet.author_id,
        display_name: tweet.author_name,
        profile_image_url: tweet.profile_image_url,
        followers_count: tweet.followers,
        verified: tweet.verified || false,
        total_comments: 0,
        flagged_comments: 0,
      });
    } else {
      // Update profile info if we have new
      if (tweet.author_name) user.display_name = tweet.author_name;
      if (tweet.followers !== undefined) user.followers_count = tweet.followers;
      if (tweet.verified !== undefined) user.verified = tweet.verified;
    }

    // Update aggregates
    const allComments = await Comment.find({
      author_handle: handle,
      source: "x",
    }).select("classification.hate_score classification.confidence_score classification.classification").lean();

    const total = allComments.length;
    const flagged = allComments.filter((c) => c.classification?.hate_score >= 60).length;
    const hidden = allComments.filter((c) => c.classification?.action?.hide).length;
    const hateScores = allComments.map((c) => c.classification?.hate_score || 0);
    const confidences = allComments.map((c) => c.classification?.confidence_score || 0);
    const avg = hateScores.reduce((a, b) => a + b, 0) / Math.max(total, 1);
    const max = hateScores.reduce((a, b) => Math.max(a, b), 0);
    const avgConf = confidences.reduce((a, b) => a + b, 0) / Math.max(total, 1);

    user.total_comments = total;
    user.flagged_comments = flagged;
    user.hidden_comments = hidden;
    user.avg_hate_score = Math.round(avg);
    user.max_hate_score = max;
    user.avg_confidence = Math.round(avgConf);
    user.last_seen_at = new Date();

    if (isFlagged) {
      if (!user.first_flagged_at) user.first_flagged_at = new Date();
      user.last_flagged_at = new Date();
    }

    // Recompute risk
    const { risk_level, risk_score } = FlaggedUser.computeRisk({
      total_comments: total,
      flagged_comments: flagged,
      max_hate_score: max,
      avg_hate_score: avg,
    });

    const prevLevel = user.risk_level;
    user.risk_level = risk_level;
    user.risk_score = risk_score;

    // Auto status transitions
    if (risk_level === "critical" && user.status === "monitoring") {
      user.status = "warned";
    }

    await user.save();

    // Log risk escalation
    if (risk_level !== prevLevel && (risk_level === "high" || risk_level === "critical")) {
      console.log(`⚠ User @${handle} escalated: ${prevLevel} → ${risk_level} (score ${risk_score})`);
    }

    return user;
  }

  /**
   * Fetch user profile by handle.
   */
  async getUserProfile(handle) {
    if (this.isLive()) {
      const r = await fetch(`${this.baseUrl}/2/users/by/username/${handle}?user.fields=public_metrics,profile_image_url,verified,created_at`, {
        headers: { Authorization: `Bearer ${this.bearerToken}` },
      });
      if (!r.ok) throw new Error(`X API ${r.status}`);
      const j = await r.json();
      return j.data || null;
    }
    // Mock
    const mock = MOCK_TWEETS.find((t) => t.author_handle === handle);
    if (!mock) return null;
    return {
      id: mock.author_id,
      username: mock.author_handle,
      name: mock.author_name,
      verified: mock.verified || false,
      public_metrics: { followers_count: mock.followers, following_count: 0, tweet_count: 0 },
    };
  }
}

module.exports = new XBrowserService();
