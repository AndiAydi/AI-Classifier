/**
 * Seed sample data — comments covering all classifications and contexts.
 * Use: node scripts/seed.js
 *
 * Note: This seeds the prompt and a few comments. Comments are created
 * WITHOUT calling Gemini (since the seed shouldn't need an API key) — we
 * just write pre-computed classification objects so the dashboard has data.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const config = require("../config/env");

const Comment = require("../models/Comment");
const PromptTemplate = require("../models/PromptTemplate");
const FlaggedUser = require("../models/FlaggedUser");

const SAMPLES = [
  {
    source: "x",
    text: "Islam itu agama teroris, semua muslim radikal. Mereka harusnya ditindak tegas!",
    classification: {
      classification: "negative",
      confidence_score: 95,
      hate_score: 92,
      is_hate_speech: true,
      is_positive_islamic: false,
      context_type: "direct_attack",
      detected_aspects: ["explicit_terror_stereotype", "collective_targeting"],
      reason: "Pernyataan langsung menyamakan Islam dengan terorisme dan mengkolektifkan kesalahan ke seluruh muslim — memenuhi rule A.1.",
      metadata: { contains_terror_stereotype: true, contains_animal_dehumanization: false, contains_dakwah_positive: false, contains_quote_or_reply: false, is_sarcastic: false, language: "id" },
      action: { flag: true, hide: true, report_user: true },
    },
  },
  {
    source: "x",
    text: "Monyet bersorban, pengikutnya semua babi. Najis banget sih.",
    classification: {
      classification: "negative",
      confidence_score: 97,
      hate_score: 96,
      is_hate_speech: true,
      is_positive_islamic: false,
      context_type: "direct_attack",
      detected_aspects: ["animal_dehumanization", "religious_najis_claim"],
      reason: "Dehumanisasi ganda: menyamakan muslim dengan monyet dan babi, juga menyebutnya najis — memenuhi rule A.2.",
      metadata: { contains_terror_stereotype: false, contains_animal_dehumanization: true, contains_dakwah_positive: false, contains_quote_or_reply: false, is_sarcastic: false, language: "id" },
      action: { flag: true, hide: true, report_user: true },
    },
  },
  {
    source: "x",
    text: 'Ini nih orang ngomong "Islam agama teroris", jelas keliatan banget dia rasis dan goblok. Yang baca jangan dipercaya ya.',
    parent_text: "Islam itu agama teroris, semua muslim radikal",
    classification: {
      classification: "neutral",
      confidence_score: 88,
      hate_score: 8,
      is_hate_speech: false,
      is_positive_islamic: false,
      context_type: "quote_citation",
      detected_aspects: ["quote_with_criticism"],
      reason: "Komentar mengutip ujaran kebencian orang lain untuk dikritik. Penulis tidak endorse — memenuhi konteks quote_citation (bukan hate).",
      metadata: { contains_terror_stereotype: false, contains_animal_dehumanization: false, contains_dakwah_positive: false, contains_quote_or_reply: true, is_sarcastic: false, language: "id" },
      action: { flag: false, hide: false, report_user: false },
    },
  },
  {
    source: "x",
    text: "Oh pake jenggot ya? Siapa tau besok bawa ransel isi bom ke pasar",
    classification: {
      classification: "negative",
      confidence_score: 89,
      hate_score: 88,
      is_hate_speech: true,
      is_positive_islamic: false,
      context_type: "sarcasm_implicit",
      detected_aspects: ["implicit_terror_stereotype_via_sarcasm"],
      reason: "Sarkasme implisit yang menyamarkan stereotip teroris — simbol Islam (jenggot) dikaitkan dengan bom. Tetap negatif meskipun dibungkus sarkasme (rule A.1).",
      metadata: { contains_terror_stereotype: true, contains_animal_dehumanization: false, contains_dakwah_positive: false, contains_quote_or_reply: false, is_sarcastic: true, language: "id" },
      action: { flag: true, hide: true, report_user: false },
    },
  },
  {
    source: "x",
    text: "Subhanallah, MasyaAllah, tabarakallah. Mari kita jaga ukhuwah dan perdamaian di bulan Ramadhan ini. 🙏",
    classification: {
      classification: "positive",
      confidence_score: 96,
      hate_score: 2,
      is_hate_speech: false,
      is_positive_islamic: true,
      context_type: "dakwah",
      detected_aspects: ["pujian_3x", "ajakan_ukhuwah", "konteks_ramadhan"],
      reason: "Mengandung tiga pujian (Subhanallah, MasyaAllah, Tabarakallah) dan ajakan ukhuwah-perdamaian — memenuhi rule B.1 dan B.3.",
      metadata: { contains_terror_stereotype: false, contains_animal_dehumanization: false, contains_dakwah_positive: true, contains_quote_or_reply: false, is_sarcastic: false, language: "id" },
      action: { flag: false, hide: false, report_user: false },
    },
  },
  {
    source: "x",
    text: "Saya kurang setuju dengan konsep poligami dalam Islam, menurut saya perlu dikaji ulang konteksnya. Tapi saya hormati yang memilih.",
    classification: {
      classification: "neutral",
      confidence_score: 90,
      hate_score: 6,
      is_hate_speech: false,
      is_positive_islamic: false,
      context_type: "debate_critique",
      detected_aspects: ["kritik_terbatas", "bahasa_santun", "mengakui_pilihan_lain"],
      reason: "Kritik terhadap konsep (bukan personal attack), disampaikan dengan bahasa santun dan mengakui keberagaman. Masuk debat_critique → netral.",
      metadata: { contains_terror_stereotype: false, contains_animal_dehumanization: false, contains_dakwah_positive: false, contains_quote_or_reply: false, is_sarcastic: false, language: "id" },
      action: { flag: false, hide: false, report_user: false },
    },
  },
  {
    source: "x",
    text: "Dasar anjing lu, goblok banget sih. Pergi sana!",
    classification: {
      classification: "neutral",
      confidence_score: 85,
      hate_score: 20,
      is_hate_speech: false,
      is_positive_islamic: false,
      context_type: "chitchat",
      detected_aspects: ["makian_non_agama"],
      reason: "Makian kasar tetapi TIDAK ada konteks agama/Islam — masuk pengecualian rule A. Klasifikasi netral (chitchat).",
      metadata: { contains_terror_stereotype: false, contains_animal_dehumanization: false, contains_dakwah_positive: false, contains_quote_or_reply: false, is_sarcastic: false, language: "id" },
      action: { flag: false, hide: false, report_user: false },
    },
  },
  {
    source: "x",
    text: "Alhamdulillah hari ini mendapat hidayah. Semoga Allah memberi petunjuk untuk kita semua.",
    classification: {
      classification: "positive",
      confidence_score: 92,
      hate_score: 1,
      is_hate_speech: false,
      is_positive_islamic: true,
      context_type: "dakwah",
      detected_aspects: ["alhamdulillah", "doa_untuk_semua"],
      reason: "Mengandung pujian (Alhamdulillah) dan doa inklusif — memenuhi rule B.1.",
      metadata: { contains_terror_stereotype: false, contains_animal_dehumanization: false, contains_dakwah_positive: true, contains_quote_or_reply: false, is_sarcastic: false, language: "id" },
      action: { flag: false, hide: false, report_user: false },
    },
  },
];

async function seed() {
  await mongoose.connect(config.mongodb.uri);
  console.log("✓ Connected to MongoDB");

  // 1. Seed default prompt
  const existingPrompt = await PromptTemplate.findOne({ is_active: true });
  if (!existingPrompt) {
    const promptFile = config.prompt.file;
    if (fs.existsSync(promptFile)) {
      const content = fs.readFileSync(promptFile, "utf8");
      const m = content.match(/v(\d+\.\d+)/);
      const version = m ? `v${m[1]}` : "v2.0";
      await PromptTemplate.create({
        name: "default",
        version,
        content,
        notes: "Debate-aware system prompt — auto-seeded",
        is_active: true,
        created_by: "seed",
      });
      console.log("✓ Seeded default prompt");
    } else {
      console.warn("⚠ Prompt file not found, skipping prompt seed");
    }
  } else {
    console.log("→ Active prompt already exists, skipping");
  }

  // 2. Seed sample comments
  const existing = await Comment.countDocuments();
  if (existing > 0) {
    console.log(`→ ${existing} comments already exist, skipping comment seed`);
  } else {
    await Comment.insertMany(
      SAMPLES.map(s => ({
        ...s,
        status: "classified",
        prompt_version: "v2.0",
        model: "seed-script",
        latency_ms: Math.floor(Math.random() * 800) + 400,
        token_usage: { prompt: 800, completion: 200, total: 1000 },
      }))
    );
    console.log(`✓ Seeded ${SAMPLES.length} sample comments`);
  }

  // 3. Seed flagged users (for X Monitor demo)
  const existingUsers = await FlaggedUser.countDocuments();
  if (existingUsers === 0) {
    const flagged = [
      {
        handle: "radicalvoice01",
        user_id: "123456",
        display_name: "Radical Voice",
        total_comments: 12,
        flagged_comments: 8,
        hidden_comments: 3,
        avg_hate_score: 84,
        max_hate_score: 96,
        avg_confidence: 91,
        risk_level: "critical",
        risk_score: 92,
        status: "warned",
        first_flagged_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        last_flagged_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
        last_seen_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
        followers_count: 234,
        actions: [
          { type: "hide_reply", reason: "auto: hate_score=92", actor: "system", result: "mocked", at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
          { type: "report_user", reason: "Risk critical — 8 flagged comments", actor: "system", result: "mocked", at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
        ],
      },
      {
        handle: "streetcritic",
        user_id: "234567",
        display_name: "Street Critic",
        total_comments: 7,
        flagged_comments: 4,
        hidden_comments: 1,
        avg_hate_score: 71,
        max_hate_score: 88,
        avg_confidence: 85,
        risk_level: "high",
        risk_score: 67,
        status: "warned",
        first_flagged_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        last_flagged_at: new Date(Date.now() - 5 * 60 * 60 * 1000),
        last_seen_at: new Date(Date.now() - 5 * 60 * 60 * 1000),
        followers_count: 1200,
        actions: [
          { type: "hide_reply", reason: "auto: hate_score=88", actor: "system", result: "mocked", at: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        ],
      },
      {
        handle: "concernedcitizen",
        user_id: "789012",
        display_name: "Concerned Citizen",
        total_comments: 3,
        flagged_comments: 1,
        hidden_comments: 0,
        avg_hate_score: 42,
        max_hate_score: 68,
        avg_confidence: 78,
        risk_level: "medium",
        risk_score: 38,
        status: "monitoring",
        first_flagged_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        last_flagged_at: new Date(Date.now() - 10 * 60 * 60 * 1000),
        last_seen_at: new Date(Date.now() - 10 * 60 * 60 * 1000),
        followers_count: 567,
        actions: [],
      },
      {
        handle: "sarcastic_bro",
        user_id: "567890",
        display_name: "Sarcastic Bro",
        total_comments: 5,
        flagged_comments: 2,
        hidden_comments: 0,
        avg_hate_score: 51,
        max_hate_score: 76,
        avg_confidence: 82,
        risk_level: "medium",
        risk_score: 44,
        status: "monitoring",
        first_flagged_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        last_flagged_at: new Date(Date.now() - 4 * 60 * 60 * 1000),
        last_seen_at: new Date(Date.now() - 4 * 60 * 60 * 1000),
        followers_count: 89,
        actions: [],
      },
    ];
    await FlaggedUser.insertMany(flagged);
    console.log(`✓ Seeded ${flagged.length} flagged users`);
  } else {
    console.log(`→ ${existingUsers} flagged users exist, skipping`);
  }

  await mongoose.disconnect();
  console.log("✓ Done. Run: npm start");
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
