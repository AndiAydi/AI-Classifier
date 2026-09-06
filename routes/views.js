/**
 * View routes — server-side rendered pages
 */
const express = require("express");
const router = express.Router();

// Dashboard — main page
router.get("/", (req, res) => {
  res.render("dashboard", { title: "Dashboard", activeNav: "dashboard" });
});

// Live test page
router.get("/test", (req, res) => {
  res.render("test", { title: "Live Test", activeNav: "test" });
});

// X Monitor
router.get("/x-monitor", (req, res) => {
  res.render("x-monitor", { title: "X Monitor", activeNav: "x-monitor" });
});

// Prompt editor
router.get("/prompts", (req, res) => {
  res.render("prompts", { title: "Prompt Editor", activeNav: "prompts" });
});

// Comment detail
router.get("/comments/:id", (req, res) => {
  res.render("comment-detail", { title: "Comment Detail", activeNav: "dashboard", commentId: req.params.id });
});

module.exports = router;
