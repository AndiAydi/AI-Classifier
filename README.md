# AI-Classifier System v2.0

Sistem klasifikasi konten digital full-stack untuk moderasi komentar X (Twitter). Stack-nya Node.js, MongoDB, dan Google Gemini sebagai engine klasifikasi. Versi ini sudah support konteks debat, bukan sekadar pencocokan kata kunci seperti v1.

## Perbedaan v1 dan v2.0

| Aspek | v1 | v2.0 |
|---|---|---|
| Engine klasifikasi | Rule if-else statis | Google Gemini LLM |
| Konteks debat | Tidak ada | quote_citation, debate_critique, academic, dakwah, sarcasm_implicit |
| Penyimpanan | In-memory | MongoDB dengan index dan audit log |
| Backend | Tidak ada | Node.js + Express REST API |
| Frontend | Static page | Dashboard live, test page, prompt editor |
| X live browsing | Tidak ada | Search tweet, classify, flag user |
| User risk tracking | Tidak ada | Agregat hate_score per user, risk level |
| X actions | Tidak ada | Hide reply, block user, report intent |
| API logging | Tidak ada | Setiap call ke Gemini di-log (cost, latency) |
| Prompt versioning | Hardcoded | DB-backed, support A/B test dan rollback |
| Tone detection | Keyword-based | LLM reasoning (sarkasme, konteks implisit) |

## Arsitektur

```
X (Twitter)  -->  n8n Webhook  -->  Express API  -->  Gemini
                                                      |
                                                      v
                                             JSON Response
                                                      |
                                                      v
                                             +----------------+
                                             |   MongoDB      |
                                             |  - comments    |
                                             |  - prompts     |
                                             |  - api_logs    |
                                             +----------------+
                                                      |
                                                      v
                             Dashboard  <----  Review Queue  ---->  Human Override
```

Alur kerjanya: tweet masuk dari X lewat webhook n8n, dikirim ke Express API, diteruskan ke Gemini untuk klasifikasi. Hasilnya disimpan di MongoDB dan bisa direview manual lewat dashboard.

## Tech Stack

- **Backend:** Node.js 18+, Express 4
- **Database:** MongoDB 7 (jalan via Docker)
- **AI:** Google Gemini 1.5 Flash (bisa diganti ke Pro)
- **Frontend:** EJS templates, vanilla JS, Chart.js
- **Security:** Helmet, CORS, rate limiting

## Quick Start

### Prasyarat

- Node.js 18 ke atas
- Docker dan Docker Compose
- Gemini API Key (ambil gratis di Google AI Studio)

### Setup

```bash
cd ai-classifier-system
npm install
cp .env.example .env
nano .env   # isi GEMINI_API_KEY
```

### Jalankan MongoDB

```bash
docker compose up -d
docker ps
```

MongoDB admin UI tersedia di `http://localhost:8081`, credential default `admin/admin`.

### Seed Data

```bash
npm run seed
```

Ini akan mengisi database dengan default prompt dan 8 sample komentar untuk testing.

### Jalankan Server

```bash
npm start
```

Server akan jalan di `http://localhost:3000`. API di `/api`, health check di `/api/health`.

## Halaman dan Endpoint

| Path | Keterangan |
|---|---|
| `/` | Dashboard utama, statistik, list komentar, filter |
| `/x-monitor` | X Monitor, live browsing, flagged users, actions |
| `/test` | Live test, coba klasifikasi teks custom |
| `/prompts` | System prompt editor, manage versi |
| `/comments/:id` | Detail komentar, review, override, reasoning |
| `/api/health` | Health check (DB + Gemini) |
| `/api/classify` | POST, kirim komentar untuk diklasifikasi |
| `/api/comments` | GET/POST, list dan manage komentar |
| `/api/stats` | GET, metrik dashboard |
| `/api/prompts` | GET/POST, manage prompt |
| `/api/x/scan` | POST, trigger scan X |
| `/api/x/users` | GET, flagged users dengan risk level |
| `/api/x/users/:id/action` | POST, manual action per user |

## API Reference

### POST /api/classify

Kirim satu komentar untuk diklasifikasi.

```bash
curl -X POST http://localhost:3000/api/classify \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Islam itu agama teroris",
    "parent_text": null,
    "source": "x",
    "author_handle": "@someone"
  }'
```

Response:

```json
{
  "ok": true,
  "data": {
    "_id": "...",
    "text": "Islam itu agama teroris",
    "classification": {
      "classification": "negative",
      "confidence_score": 95,
      "hate_score": 92,
      "context_type": "direct_attack",
      "reason": "...",
      "action": { "flag": true, "hide": true, "report_user": true }
    },
    "latency_ms": 842,
    "token_usage": { "prompt": 850, "completion": 240, "total": 1090 }
  }
}
```

### GET /api/comments

List komentar dengan filter. Query parameter yang tersedia:

- `classification` -- negative, positive, neutral
- `context_type` -- direct_attack, quote_citation, debate_critique, academic_discussion, dakwah, sarcasm_implicit, chitchat
- `min_hate_score` / `max_hate_score` -- range 0-100
- `q` -- text search
- `limit` -- default 50, max 200
- `skip` -- default 0
- `sort` -- default -createdAt

### PATCH /api/comments/:id/review

Human override untuk komentar yang sudah diklasifikasi.

```bash
curl -X PATCH http://localhost:3000/api/comments/abc123/review \
  -H "Content-Type: application/json" \
  -d '{
    "action": "hide",
    "reason": "Setelah review manual, ini memang hate",
    "reviewed_by": "admin"
  }'
```

## System Prompt v2.0 -- Debate-Aware

Ini inti dari v2.0. Prompt yang dikirim ke Gemini tidak cuma minta klasifikasi positif/negatif/netral, tapi juga minta field `context_type` yang menjelaskan posisi komunikatif penulis.

Tujuh context type yang didukung:

- `direct_attack` -- serangan langsung, klasifikasi negative
- `quote_citation` -- mengutip ujaran orang lain untuk dikritik, klasifikasi neutral
- `debate_critique` -- opini pribadi yang mengkritik, klasifikasi neutral
- `academic_discussion` -- diskusi akademis, klasifikasi neutral
- `dakwah` -- dakwah atau pembelaan santun, klasifikasi positive
- `sarcasm_implicit` -- sarkasme yang menyamarkan hate
- `chitchat` -- makian tanpa konteks agama, klasifikasi neutral

Prompt juga menginstruksikan Gemini untuk menolak over-blocking. Kalau konteks ambigu, default ke neutral. Full prompt ada di `prompts/system-v2.md`.

## Struktur MongoDB

### Collection: comments

```json
{
  "_id": "ObjectId",
  "source": "x | manual | api | seed",
  "external_id": "String",
  "author_handle": "String",
  "text": "String",
  "parent_text": "String",
  "classification": {
    "classification": "negative | positive | neutral",
    "confidence_score": "0-100",
    "hate_score": "0-100",
    "context_type": "direct_attack | ...",
    "detected_aspects": ["String"],
    "reason": "String",
    "metadata": {},
    "action": { "flag": "bool", "hide": "bool", "report_user": "bool" }
  },
  "status": "pending | classified | reviewed | actioned | dismissed",
  "human_override": { "classification": "", "reason": "", "at": "" },
  "prompt_version": "String",
  "model": "String",
  "latency_ms": "Number",
  "token_usage": { "prompt": "", "completion": "", "total": "" },
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Collection: prompts

```json
{
  "name": "default",
  "version": "v2.0",
  "content": "full prompt markdown",
  "is_active": true,
  "notes": "Auto-imported from system-v2.md",
  "stats": { "total_uses": "", "avg_confidence": "", "avg_latency_ms": "", "last_used_at": "" },
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Collection: apilogs

Setiap panggilan ke Gemini di-log dengan data latency, token usage (input/output), estimasi cost dalam USD, dan status (success/error/timeout).

## Integrasi n8n

Untuk produksi, sambungkan X ke sistem ini lewat n8n:

```
X Filtered Stream
       |
   n8n Webhook  -->  POST /api/classify
       |
   n8n Switch (berdasarkan action.hide dan action.report_user)
       |
   X Moderation API (hide_reply, report_user)
```

Template workflow n8n akan disiapkan terpisah.

## X Live Browsing dan Risk Registry

### Cara Kerja

1. Scan di-trigger via POST `/api/x/scan` atau tombol di halaman `/x-monitor`.
2. Sistem mencari tweet lewat X API v2 (`/2/tweets/search/recent`) dengan query kata-kata terkait ujaran kebencian agama.
3. Setiap tweet diklasifikasi via Gemini dengan prompt debate-aware.
4. Agregat hate_score per user dihitung, lalu ditetapkan risk_level.
5. Jika auto-action aktif, reply dari user high/critical otomatis di-hide.

### Risk Level

| Level | Syarat | Tampilan |
|---|---|---|
| none | 0 flagged comments | Abu-abu |
| low | 1+ flagged, score di bawah 30 | Abu-abu |
| medium | score 30-59 | Oranye |
| high | score 60-79 | Merah |
| critical | score 80 ke atas | Merah tebal |

### Limitasi X API

| Endpoint | Tier | Harga | Status |
|---|---|---|---|
| GET /2/tweets/search/recent | Basic | $100/bulan | Bisa dipakai |
| GET /2/users/by/username/:h | Basic | $100/bulan | Bisa dipakai |
| PUT /2/tweets/:id/hidden | Elevated | Perlu apply | Bisa setelah apply |
| POST /2/users/:id/blocking | Elevated | Perlu apply | Bisa setelah apply |
| POST /2/users/:id/report | - | - | Tidak tersedia, X tidak punya public report API |
| GET /2/tweets/search/stream | Pro | $5.000/bulan | Overkill untuk skala kecil |

Catatan penting: label merah di dashboard adalah fitur internal sistem ini. Kita tidak bisa menempelkan label di profil X karena itu private feature. Yang bisa dilakukan adalah maintain risk registry lokal di MongoDB, tampilkan red label di dashboard sendiri, lalu trigger hide_reply atau block_user via X API untuk efek riil.

### Setup X Live Mode

```bash
# di .env
X_MODE=live
X_BEARER_TOKEN=AAAA...your-x-bearer-token...
```

Apply token di developer portal X, pilih tier Elevated.

Default-nya sistem jalan di mock mode, tidak perlu API key X. Cukup untuk demo dan presentasi.

### POST /api/x/scan

```bash
curl -X POST http://localhost:3000/api/x/scan \
  -H "Content-Type: application/json" \
  -d '{
    "maxResults": 20,
    "autoAction": true
  }'
```

Response:

```json
{
  "ok": true,
  "data": {
    "scan_id": "...",
    "mode": "mock",
    "tweets_fetched": 20,
    "new_comments": 18,
    "duplicates_skipped": 2,
    "classified": 18,
    "flagged_users": 3,
    "actions_triggered": 2,
    "duration_ms": 12450
  }
}
```

### POST /api/x/users/:id/action

Manual action oleh operator.

```bash
curl -X POST http://localhost:3000/api/x/users/USER_ID/action \
  -H "Content-Type: application/json" \
  -d '{
    "type": "hide_reply",
    "reason": "Konsisten menyerang Islam"
  }'
```

Tipe action yang tersedia: hide_reply, report_user, block_user, dismiss, escalate.

## Estimasi Biaya

Gemini 1.5 Flash (per November 2024):

- Input: $0.075 per 1 juta token
- Output: $0.30 per 1 juta token
- Rata-rata per klasifikasi: sekitar 1100 token, atau sekitar $0.0005 per komentar
- Untuk 10.000 komentar per bulan: sekitar $5 per bulan

## Etika dan Limitasi

- Sistem ini tidak menggantikan review manusia untuk kasus dengan hate_score 80 ke atas.
- PII (teks asli) di-auto-purge setelah 90 hari. Retention bisa diatur sesuai kebutuhan.
- Sistem tidak membedakan ras atau etnisitas, hanya menganalisis perilaku teks.
- Audit publik triwulanan siap dipublish.
- Prinsip utama: over-blocking lebih berbahaya dari under-blocking. Kalau ragu, default ke neutral.

## Development

```bash
npm run dev     # auto-reload saat edit
npm run seed    # tambah sample data
curl http://localhost:3000/api/health | jq   # health check
```

## Troubleshooting

**MongoDB tidak connect:**
```bash
docker compose ps
docker compose logs mongo
docker compose restart mongo
```

**Gemini error atau API key invalid:**
Cek `.env`, pastikan `GEMINI_API_KEY` benar. Test manual lewat `curl http://localhost:3000/api/health`. Kalau muncul error "API key not valid", regenerate key di Google AI Studio.

**Port 3000 sudah dipakai:**
Edit `.env`, set `PORT=3001`.

**Ganti model Gemini:**
Edit `.env`, set `GEMINI_MODEL=gemini-1.5-pro`. Lebih akurat tapi sekitar 10x lebih mahal.

## Struktur Project

```
ai-classifier-system/
  server.js
  package.json
  docker-compose.yml
  .env.example
  README.md
  config/
    db.js
    env.js
  models/
    Comment.js
    PromptTemplate.js
    ApiLog.js
  services/
    gemini.js
    classifier.js
    prompts.js
  routes/
    api.js
    views.js
  middleware/
    errorHandler.js
    requestLogger.js
  prompts/
    system-v2.md
  views/
    dashboard.ejs
    test.ejs
    prompts.ejs
    comment-detail.ejs
    404.ejs
    partials/
      header.ejs
      footer.ejs
  public/
    css/styles.css
    js/
      dashboard.js
      test.js
      prompts.js
  scripts/
    seed.js
```

## License

MIT

## Contact Person
Instagram:aydi_ai (https://www.instagram.com/aydi_ai?stkn=em11ZWF1ZmZiY3J1) 
