// X Monitor page

let currentUserId = null;
let currentActionType = null;

async function loadStatus() {
  try {
    const r = await fetch("/api/x/status");
    const j = await r.json();
    const banner = document.getElementById("modeBanner");
    const title = document.getElementById("modeTitle");
    const desc = document.getElementById("modeDesc");

    if (j.data.is_live) {
      banner.className = "banner success";
      title.textContent = "✓ X API v2 — Live Mode";
      desc.textContent = "Terhubung ke X API. Tweets real sedang di-scan.";
    } else {
      banner.className = "banner warn";
      title.textContent = "⚠ Mock Mode";
      desc.textContent = j.data.description;
    }
  } catch (e) {
    document.getElementById("modeBanner").className = "banner error";
    document.getElementById("modeTitle").textContent = "✗ Gagal cek status";
  }
}

async function loadStats() {
  try {
    const r = await fetch("/api/x/users");
    const j = await r.json();
    if (!j.ok) return;

    const data = j.data;
    const total = data.length;
    const flagged = data.filter((u) => u.risk_level === "high" || u.risk_level === "critical").length;

    document.getElementById("stat-flagged").textContent = flagged;
    document.getElementById("stat-monitored").textContent = total;

    // Scanned tweets: get from /api/comments
    const cR = await fetch("/api/comments?source=x&limit=1");
    const cJ = await cR.json();
    document.getElementById("stat-scanned").textContent = cJ.total || 0;

    // Last scan
    const sR = await fetch("/api/x/scans?limit=1");
    const sJ = await sR.json();
    if (sJ.data && sJ.data[0]) {
      const s = sJ.data[0];
      const dt = new Date(s.started_at);
      document.getElementById("stat-last-scan").textContent = dt.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
      document.getElementById("stat-last-scan-sub").textContent = `${s.stats?.tweets_fetched || 0} tweets, ${s.stats?.flagged_users || 0} flagged (${s.mode})`;
    } else {
      document.getElementById("stat-last-scan").textContent = "—";
      document.getElementById("stat-last-scan-sub").textContent = "Belum ada scan";
    }
  } catch (e) {
    console.error("loadStats failed:", e);
  }
}

async function loadFeed() {
  const el = document.getElementById("liveFeed");
  el.innerHTML = '<div class="empty">Loading...</div>';

  const minHate = document.getElementById("feedMinHate").value;
  try {
    const r = await fetch(`/api/x/feed?min_hate_score=${minHate}&limit=20`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);

    if (!j.data.length) {
      el.innerHTML = '<div class="empty">Belum ada tweet X. Klik "Scan X Sekarang" untuk mulai.</div>';
      return;
    }

    el.innerHTML = j.data.map((c) => {
      const cls = c.classification || {};
      const hate = cls.hate_score || 0;
      return `
        <div class="feed-item">
          <div class="feed-header">
            <span class="feed-author">@${escapeHtml(c.author_handle || 'unknown')}</span>
            <span class="meta-pill">${new Date(c.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>
            <span class="badge cls-${cls.classification || 'unknown'}">${cls.classification || '—'}</span>
            <span class="hate-mini">hate ${hate}</span>
          </div>
          <div class="feed-text">${escapeHtml((c.text || '').slice(0, 280))}</div>
          ${cls.reason ? `<div class="feed-reason">${escapeHtml(cls.reason)}</div>` : ''}
        </div>
      `;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

async function loadUsers() {
  const el = document.getElementById("flaggedUsers");
  el.innerHTML = '<div class="empty">Loading...</div>';

  const risk = document.getElementById("filterRisk").value;
  const params = new URLSearchParams();
  params.set("limit", "30");
  params.set("sort", "-risk_score");
  if (risk) params.set("risk_level", risk);

  try {
    const r = await fetch(`/api/x/users?${params}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);

    if (!j.data.length) {
      el.innerHTML = '<div class="empty">Belum ada user ter-flag. Jalankan scan dulu.</div>';
      return;
    }

    el.innerHTML = j.data.map((u) => {
      const riskClass = u.risk_level;
      const isRed = u.risk_level === "high" || u.risk_level === "critical";
      return `
        <div class="user-item ${isRed ? 'user-red' : ''}">
          <div class="user-top">
            <div class="user-identity">
              <div class="user-avatar">${(u.display_name || u.handle || '?').charAt(0).toUpperCase()}</div>
              <div>
                <div class="user-handle">@${escapeHtml(u.handle)} ${u.verified ? '✓' : ''}</div>
                <div class="user-name">${escapeHtml(u.display_name || '—')}</div>
              </div>
            </div>
            <div class="user-risk">
              <span class="risk-badge risk-${riskClass}">${u.risk_level}</span>
              <span class="risk-score">${u.risk_score}/100</span>
            </div>
          </div>
          <div class="user-stats">
            <span><strong>${u.flagged_comments}</strong> flagged</span>
            <span><strong>${u.total_comments}</strong> total</span>
            <span>avg hate <strong>${u.avg_hate_score}</strong></span>
            <span>max hate <strong>${u.max_hate_score}</strong></span>
            <span>status <strong>${u.status}</strong></span>
          </div>
          <div class="user-actions">
            <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px;" onclick="viewUser('${u._id}')">Detail</button>
            <button class="btn btn-danger" style="font-size: 11px; padding: 5px 10px;" onclick="openAction('${u._id}', 'hide_reply', '@${escapeHtml(u.handle)}')">Hide Reply</button>
            <button class="btn btn-danger" style="font-size: 11px; padding: 5px 10px;" onclick="openAction('${u._id}', 'report_user', '@${escapeHtml(u.handle)}')">Report</button>
            ${u.risk_level === 'critical' ? `<button class="btn btn-danger" style="font-size: 11px; padding: 5px 10px;" onclick="openAction('${u._id}', 'block_user', '@${escapeHtml(u.handle)}')">Block</button>` : ''}
            <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px;" onclick="openAction('${u._id}', 'dismiss', '@${escapeHtml(u.handle)}')">Dismiss</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

async function loadScans() {
  const el = document.getElementById("scansList");
  el.innerHTML = '<div class="empty">Loading...</div>';

  try {
    const r = await fetch("/api/x/scans?limit=10");
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);

    document.getElementById("scanCount").textContent = `${j.total} total`;

    if (!j.data.length) {
      el.innerHTML = '<div class="empty">Belum ada history scan.</div>';
      return;
    }

    el.innerHTML = `
      <table class="scan-table">
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Mode</th>
            <th>Status</th>
            <th>Fetched</th>
            <th>New</th>
            <th>Flagged</th>
            <th>Actions</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${j.data.map(s => {
            const dt = new Date(s.started_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
            return `
              <tr>
                <td class="mono">${dt}</td>
                <td><span class="badge ${s.mode === 'live' ? 'cls-positive' : 'cls-neutral'}">${s.mode}</span></td>
                <td><span class="badge ${s.status === 'success' ? 'cls-positive' : s.status === 'failed' ? 'cls-negative' : 'cls-neutral'}">${s.status}</span></td>
                <td>${s.stats?.tweets_fetched ?? 0}</td>
                <td>${s.stats?.new_comments ?? 0}</td>
                <td>${s.stats?.flagged_users ?? 0}</td>
                <td>${s.stats?.actions_triggered ?? 0}</td>
                <td class="mono">${s.duration_ms ?? '—'}ms</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    el.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

async function runScan() {
  const btn = document.getElementById("btnScan");
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:2px;"></div> Scanning...';

  try {
    const r = await fetch("/api/x/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxResults: 20, autoAction: true }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);

    alert(`✓ Scan selesai!\n\nTweets: ${j.data.tweets_fetched}\nNew: ${j.data.new_comments}\nDuplicates: ${j.data.duplicates_skipped}\nFlagged users: ${j.data.flagged_users}\nActions: ${j.data.actions_triggered}\nDuration: ${j.data.duration_ms}ms`);
    loadStats();
    loadFeed();
    loadUsers();
    loadScans();
  } catch (e) {
    alert("Scan gagal: " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
  }
}

function openAction(userId, type, handle) {
  currentUserId = userId;
  currentActionType = type;

  const titleMap = {
    hide_reply: `Hide reply terbaru dari ${handle}`,
    report_user: `Report user ${handle} ke X`,
    block_user: `Block user ${handle}`,
    dismiss: `Dismiss flag untuk ${handle}`,
    escalate: `Escalate ${handle}`,
  };
  const descMap = {
    hide_reply: "Tweet dengan hate_score tertinggi akan di-hide dari public.",
    report_user: "X tidak expose public report API — sistem akan log intent + kasih link manual.",
    block_user: "User akan diblokir. Aksi ini permanen.",
    dismiss: "Tandai sebagai false positive. User kembali ke monitoring biasa.",
    escalate: "Hide reply + report intent + (jika critical) block.",
  };

  document.getElementById("modalTitle").textContent = titleMap[type];
  document.getElementById("modalDesc").textContent = descMap[type];
  document.getElementById("modalReason").value = "";
  document.getElementById("actionModal").style.display = "flex";
}

function closeModal() {
  document.getElementById("actionModal").style.display = "none";
  currentUserId = null;
  currentActionType = null;
}

async function confirmAction() {
  const reason = document.getElementById("modalReason").value.trim() || `Manual ${currentActionType}`;
  try {
    const r = await fetch(`/api/x/users/${currentUserId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: currentActionType, reason }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    closeModal();
    loadUsers();
    loadStats();
  } catch (e) {
    alert("Action gagal: " + e.message);
  }
}

function viewUser(id) {
  window.open(`/api/x/users/${id}`, "_blank");
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

// Init
loadStatus();
loadStats();
loadFeed();
loadUsers();
loadScans();

// Auto refresh every 30s
setInterval(() => {
  loadStats();
  loadFeed();
  loadUsers();
}, 30000);
