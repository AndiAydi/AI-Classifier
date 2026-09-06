// Live test page

// Example chips
document.querySelectorAll('#exampleChips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const text = chip.getAttribute('data-text');
    document.getElementById('testText').value = text;
    runTest();
  });
});

function clearTest() {
  document.getElementById('testText').value = '';
  document.getElementById('testParent').value = '';
  document.getElementById('testResult').innerHTML = '<div class="empty">Belum ada hasil. Klik "Klasifikasi" untuk mulai.</div>';
  document.getElementById('resultMeta').textContent = '—';
}

async function runTest() {
  const text = document.getElementById('testText').value.trim();
  const parent = document.getElementById('testParent').value.trim();
  if (!text) {
    alert('Masukkan komentar dulu ya!');
    return;
  }

  const btn = document.getElementById('btnClassify');
  btn.disabled = true;
  document.getElementById('testLoading').style.display = 'flex';
  document.getElementById('testStatus').textContent = 'Calling Gemini...';

  try {
    const r = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, parent_text: parent || undefined, source: 'manual' }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Unknown error');
    renderResult(j.data);
    document.getElementById('testStatus').textContent = 'Done';
  } catch (e) {
    document.getElementById('testResult').innerHTML = `<div class="empty">Error: ${e.message}</div>`;
    document.getElementById('testStatus').textContent = 'Error';
  } finally {
    btn.disabled = false;
    document.getElementById('testLoading').style.display = 'none';
  }
}

function renderResult(c) {
  const cls = c.classification || {};
  const meta = cls.metadata || {};
  const action = cls.action || {};
  const badgeMap = {
    negative: { title: "Negatif (Hate)" },
    positive: { title: "Positif (Islami)" },
    neutral: { title: "Netral" },
  };
  const m = badgeMap[cls.classification] || { title: 'Unknown' };

  document.getElementById('resultMeta').textContent = `${c.latency_ms}ms · ${c.model}`;
  document.getElementById('testResult').innerHTML = `
    <div class="test-result-header cls-${cls.classification}">
      <div>
        <div class="test-result-title">${m.title}</div>
        <div class="test-result-sub">${cls.classification} · context: ${cls.context_type}</div>
      </div>
    </div>

    <div class="test-stats">
      <div class="test-stat">
        <div class="test-stat-label">Confidence</div>
        <div class="test-stat-value">${cls.confidence_score ?? '—'}%</div>
      </div>
      <div class="test-stat">
        <div class="test-stat-label">Hate Score</div>
        <div class="test-stat-value" style="color: ${cls.hate_score >= 60 ? 'var(--danger)' : 'var(--text-primary)'}">${cls.hate_score ?? '—'}</div>
      </div>
    </div>

    <div class="test-section">
      <div class="test-section-label">Reasoning (Gemini)</div>
      <div class="test-section-content">${escapeHtml(cls.reason || '—')}</div>
    </div>

    <div class="test-section">
      <div class="test-section-label">Detected Triggers</div>
      <div class="tags">
        ${meta.contains_terror_stereotype ? '<span class="tag">terror_stereotype</span>' : ''}
        ${meta.contains_animal_dehumanization ? '<span class="tag">animal_dehumanization</span>' : ''}
        ${meta.contains_dakwah_positive ? '<span class="tag">dakwah_positive</span>' : ''}
        ${meta.contains_quote_or_reply ? '<span class="tag">quote/reply</span>' : ''}
        ${meta.is_sarcastic ? '<span class="tag">sarcastic</span>' : ''}
        ${!(meta.contains_terror_stereotype || meta.contains_animal_dehumanization || meta.contains_dakwah_positive) ? '<span style="color: var(--text-muted); font-size: 12px;">—</span>' : ''}
      </div>
    </div>

    <div class="test-section">
      <div class="test-section-label">Action (auto)</div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        <span class="badge ${action.flag ? 'cls-negative' : 'cls-neutral'}">flag: ${action.flag}</span>
        <span class="badge ${action.hide ? 'cls-negative' : 'cls-neutral'}">hide: ${action.hide}</span>
        <span class="badge ${action.report_user ? 'cls-negative' : 'cls-neutral'}">report: ${action.report_user}</span>
      </div>
    </div>

    ${(cls.detected_aspects && cls.detected_aspects.length) ? `
      <div class="test-section">
        <div class="test-section-label">Aspects</div>
        <div class="tags">${cls.detected_aspects.map(a => `<span class="tag">${escapeHtml(a)}</span>`).join('')}</div>
      </div>
    ` : ''}

    <div class="test-section">
      <div class="test-section-label">JSON Response (saved to MongoDB)</div>
      <pre class="json-pre">${syntaxHighlight(c)}</pre>
    </div>

    <div style="margin-top: 12px; text-align: center;">
      <a href="/comments/${c._id}" class="btn btn-secondary">Lihat detail →</a>
    </div>
  `;
}

function syntaxHighlight(obj) {
  let json = JSON.stringify(obj, null, 2);
  json = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function (match) {
      let cls = "json-n";
      if (/^"/.test(match)) cls = /:$/.test(match) ? "json-k" : "json-s";
      else if (/true|false/.test(match)) cls = "json-b";
      return '<span class="' + cls + '">' + match + "</span>";
    }
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
