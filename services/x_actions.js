/**
 * X Actions Service
 * -----------------
 * Triggers actions against X (Twitter) on flagged content.
 *
 * X API v2 endpoints used (live mode):
 *   PUT  /2/tweets/:id/hidden          — hide a reply (Elevated access)
 *   POST /2/users/:id/blocking         — block a user (Elevated access)
 *   POST /2/users/:id/mute             — mute a user
 *
 * For "report" — X does NOT expose a public report endpoint.
 * Reports can only be filed via X's web UI. We log the intent
 * and provide a deep link the operator can click to file manually.
 *
 * In MOCK mode: all actions are simulated and logged to FlaggedUser.actions.
 */
const FlaggedUser = require("../models/FlaggedUser");
const Comment = require("../models/Comment");
const config = require("../config/env");

const REPORT_URL = (handle) => `https://twitter.com/intent/report?screen_name=${handle}`;

class XActionsService {
  constructor() {
    this.bearerToken = config.x.bearerToken;
    this.baseUrl = "https://api.twitter.com";
  }

  isLive() {
    return config.x.mode === "live" && !!this.bearerToken;
  }

  /**
   * Hide a single reply on X.
   * PUT /2/tweets/:id/hidden
   */
  async hideReply(tweetId) {
    if (!this.isLive()) {
      console.log(`[MOCK] Would hide tweet ${tweetId}`);
      return { success: true, mocked: true };
    }
    const r = await fetch(`${this.baseUrl}/2/tweets/${tweetId}/hidden`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hidden: true }),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Hide reply failed: ${r.status} ${err.slice(0, 200)}`);
    }
    return { success: true, mocked: false };
  }

  /**
   * Block a user.
   * POST /2/users/:id/blocking
   */
  async blockUser(userId) {
    if (!this.isLive()) {
      console.log(`[MOCK] Would block user ${userId}`);
      return { success: true, mocked: true };
    }
    const r = await fetch(`${this.baseUrl}/2/users/${userId}/blocking`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.bearerToken}` },
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Block user failed: ${r.status} ${err.slice(0, 200)}`);
    }
    return { success: true, mocked: false };
  }

  /**
   * "Report user" — no public API. We log intent and return a manual link.
   */
  async reportUser(handle, reason) {
    // X doesn't expose report via API. Log the intent.
    console.log(`[REPORT INTENT] @${handle} — ${reason}`);
    return {
      success: true,
      mocked: !this.isLive(),
      manual_url: REPORT_URL(handle),
      note: "X has no public report API. Use manual_url or file from the web UI.",
    };
  }

  /**
   * Escalate: hide replies + log report intent based on risk level.
   */
  async escalate(user, comment) {
    const actions = [];

    // 1. Hide the triggering comment
    if (comment.external_id && comment.classification?.action?.hide) {
      try {
        const r = await this.hideReply(comment.external_id);
        actions.push({
          type: "hide_reply",
          comment_id: comment._id,
          reason: `auto: hate_score=${comment.classification.hate_score}`,
          actor: "system",
          result: r.mocked ? "mocked" : "success",
          at: new Date(),
        });
        if (!r.mocked) {
          comment.status = "actioned";
          await comment.save();
        }
      } catch (e) {
        actions.push({
          type: "hide_reply",
          comment_id: comment._id,
          reason: `auto: ${e.message}`,
          actor: "system",
          result: "failed",
          error: e.message,
          at: new Date(),
        });
      }
    }

    // 2. For high/critical risk: log report intent + warn status
    if (user.risk_level === "high" || user.risk_level === "critical") {
      const r = await this.reportUser(user.handle, `Risk: ${user.risk_level} (score ${user.risk_score}), ${user.flagged_comments} flagged comments`);
      actions.push({
        type: "report_user",
        comment_id: comment._id,
        reason: `Risk ${user.risk_level}`,
        actor: "system",
        result: r.mocked ? "mocked" : "success",
        at: new Date(),
      });

      // 3. Critical: block
      if (user.risk_level === "critical" && user.user_id) {
        try {
          await this.blockUser(user.user_id);
          actions.push({
            type: "block_user",
            reason: "critical risk",
            actor: "system",
            result: this.isLive() ? "success" : "mocked",
            at: new Date(),
          });
          if (!this.isLive()) {
            user.status = "blocked";
          }
        } catch (e) {
          actions.push({
            type: "block_user",
            reason: e.message,
            actor: "system",
            result: "failed",
            error: e.message,
            at: new Date(),
          });
        }
      } else {
        user.status = "warned";
      }
    }

    // Save actions to user record
    user.actions.push(...actions);
    if (user.status !== "dismissed") {
      // status already set above
    }
    await user.save();

    return {
      success: actions.some((a) => a.result === "success" || a.result === "mocked"),
      actions,
    };
  }

  /**
   * Manual action by operator.
   */
  async manualAction(userId, { type, reason, actor = "admin" }) {
    const user = await FlaggedUser.findById(userId);
    if (!user) throw new Error("User not found");

    let result;
    const action = {
      type,
      reason,
      actor,
      at: new Date(),
    };

    try {
      if (type === "hide_reply" && user.actions.length > 0) {
        // Find the most recent flagged comment
        const recent = await Comment.findOne({
          author_handle: user.handle,
          "classification.hate_score": { $gte: 60 },
        }).sort({ createdAt: -1 });
        if (recent?.external_id) {
          result = await this.hideReply(recent.external_id);
          action.comment_id = recent._id;
          action.result = result.mocked ? "mocked" : "success";
          if (!result.mocked) recent.status = "actioned";
          await recent.save();
        } else {
          action.result = "failed";
          action.error = "No recent flagged comment with external_id";
        }
      } else if (type === "report_user") {
        result = await this.reportUser(user.handle, reason || "manual report");
        action.result = result.mocked ? "mocked" : "success";
        user.status = "reported";
      } else if (type === "block_user" && user.user_id) {
        result = await this.blockUser(user.user_id);
        action.result = result.mocked ? "mocked" : "success";
        user.status = "blocked";
      } else if (type === "dismiss") {
        action.result = "success";
        user.status = "dismissed";
      } else if (type === "escalate") {
        const recent = await Comment.findOne({
          author_handle: user.handle,
          "classification.hate_score": { $gte: 60 },
        }).sort({ createdAt: -1 });
        if (recent) {
          const esc = await this.escalate(user, recent);
          return { success: esc.success, action: esc.actions[esc.actions.length - 1] };
        } else {
          action.result = "failed";
          action.error = "No flagged comment found";
        }
      } else {
        action.result = "failed";
        action.error = `Unknown action type: ${type}`;
      }
    } catch (e) {
      action.result = "failed";
      action.error = e.message;
    }

    user.actions.push(action);
    await user.save();
    return { success: action.result === "success" || action.result === "mocked", action };
  }
}

module.exports = new XActionsService();
