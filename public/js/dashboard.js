// Dashboard — load stats, charts, comments

let state = {
  limit: 30,
  skip: 0,
  total: 0,
};

async function loadStats() {
  try {
    const r = await fetch("/api/stats");
    const j = await r.json();
    if (!j.ok) return;

    const d = j.data;
    document.getElementById("stat-total").textContent = d.total_all.toLocaleString();
    document.getElementById("stat-total-sub").textContent = `+${d.total_last_7d} in 7d`;

    document.getElementById("stat-negative").textContent = d.by_classification.negative.toLocaleString();
    const negPct = d.total_all ? Math.round(d.by_classification.negative / d.total_all * 100) : 0;
    document.getElementById("stat-negative-sub").textContent = `${negPct}% of total`;

    document.getElementById("stat-positive").textContent = d.by_classification.positive.toLocaleString();
    const posPct = d.total_all ? Math.round(d.by_classification.positive / d.total_all * 100) : 0;
    document.getElementById("stat-positive-sub").textContent = `${posPct}% of total`;

    document.getElementById("stat-queue").textContent = d.review_queue_count.toLocaleString();
    document.getElementById("stat-queue").style.color = d.review_queue_count > 0 ? "var(--danger)" : "var(--text-primary)";

    // Update chart
    updateDistChart(d.by_classification);

    // Update context list
    const maxCtx = Math.max(1, ...d.by_context.map(c => c.count));
    const ctxHtml = d.by_context.length
      ? d.by_context.map(c => `
          <div class="context-row">
            <span class="context-label">${c._id}</span>
            <div class="context-bar-bg"><div class="context-bar-fill" style="width: ${c.count / maxCtx * 100}%;"></div></div>
            <span class="context-count">${c.count}</span>
          </div>
        `).join('')
      : '<div class="empty">Belum ada data</div>';
    document.getElementById("contextList").innerHTML = ctxHtml;

  } catch (e) {
    console.error("Failed to load stats:", e);
  }
}

let distChart;
function updateDistChart(byClass) {
  const ctx = document.getElementById("distChart");
  if (!ctx) return;

  if (distChart) {
    distChart.data.datasets[0].data = [byClass.negative, byClass.positive, byClass.neutral];
    distChart.update();
    return;
  }

  distChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Negatif", "Positif", "Netral"],
      datasets: [{
        data: [byClass.negative, byClass.positive, byClass.neutral],
        backgroundColor: ["#b06367", "#4a8e7c", "#7c7a72"],
        borderColor: "#ffffff",
        borderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { font: { family: "Outfit", size: 12 }, color: "#3a4256", padding: 14 } },
      },
      cutout: "65%",
    },
  });
}

async function loadComments() {
  const list = document.getElementById("commentsList");
  list.innerHTML = '<div class="empty">Loading...</div>';

  const params = new URLSearchParams();
  params.set("limit", state.limit);
  params.set("skip", state.skip);
  params.set("sort", "-createdAt");

  const cls = document.getElementById("filterClass").value;
  const ctx = document.getElementById("filterContext").value;
  const minHate = document.getElementById("filterMinHate").value;
  const q = document.getElementById("filterSearch").value.trim();

  if (cls) params.set("classification", cls);
  if (ctx) params.set("context_type", ctx);
  if (minHate) params.set("min_hate_score", minHate);
  if (q) params.set("q", q);

  try {
    const r = await fetch(`/api/comments?${params}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);

    state.total = j.total;
    renderComments(j.data);
    renderPagination();
  } catch (e) {
    list.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

function renderComments(items) {
  const list = document.getElementById("commentsList");
  if (!items.length) {
    list.innerHTML = '<div class="empty">Tidak ada komentar. Coba ubah filter atau tes di halaman <a href="/test">Live Test</a>.</div>';
    return;
  }
  list.innerHTML = items.map(c => {
    const cls = c.classification || {};
    const hate = cls.hate_score || 0;
    const barClass = hate >= 80 ? "danger" : hate >= 40 ? "warn" : "";
    const dt = new Date(c.createdAt);
    const dtStr = dt.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
    const text = (c.text || "").slice(0, 240) + (c.text && c.text.length > 240 ? "…" : "");

    return `
      <a href="/comments/${c._id}" class="comment-row" style="text-decoration: none; color: inherit;">
        <div>
          <div class="comment-text">${escapeHtml(text)}</div>
          <div class="comment-meta">
            <span class="badge cls-${cls.classification || 'unknown'}">${cls.classification || '—'}</span>
            <span class="meta-pill">${cls.context_type || 'unknown'}</span>
            ${c.source ? `<span class="meta-pill">${c.source}</span>` : ''}
            <span class="meta-pill">${dtStr}</span>
            <span class="meta-pill">conf ${cls.confidence_score ?? '—'}%</span>
            ${c.author_handle ? `<span class="meta-pill mono">@${escapeHtml(c.author_handle)}</span>` : ''}
          </div>
        </div>
        <div class="comment-side">
          <div class="hate-meter">hate ${hate}</div>
          <div class="hate-bar"><div class="hate-bar-fill ${barClass}" style="width: ${hate}%;"></div></div>
          <div class="meta-pill">${c.latency_ms ?? '—'}ms</div>
        </div>
      </a>
    `;
  }).join('');
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
  const currentPage = Math.floor(state.skip / state.limit) + 1;
  const el = document.getElementById("pagination");
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  let html = '';
  html += `<button onclick="gotoPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2) {
      html += `<button class="${p === currentPage ? 'active' : ''}" onclick="gotoPage(${p})">${p}</button>`;
    } else if (Math.abs(p - currentPage) === 3) {
      html += `<button disabled>…</button>`;
    }
  }
  html += `<button onclick="gotoPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;
  el.innerHTML = html;
}

function gotoPage(p) {
  const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
  if (p < 1 || p > totalPages) return;
  state.skip = (p - 1) * state.limit;
  loadComments();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

// Filter change handlers
["filterClass", "filterContext", "filterMinHate"].forEach(id => {
  document.getElementById(id).addEventListener("change", () => { state.skip = 0; loadComments(); });
});
let searchTimer;
document.getElementById("filterSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.skip = 0; loadComments(); }, 300);
});

// Init
loadStats();
loadComments();
setInterval(() => { loadStats(); loadComments(); }, 30000); // refresh every 30s
