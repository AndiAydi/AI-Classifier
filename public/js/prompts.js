// Prompts editor page

let prompts = [];
let selectedId = null;

async function loadPrompts() {
  try {
    const r = await fetch('/api/prompts');
    const j = await r.json();
    if (!j.ok) return;
    prompts = j.data;
    renderPromptList();
  } catch (e) {
    console.error(e);
  }
}

function renderPromptList() {
  const el = document.getElementById('promptList');
  if (!prompts.length) {
    el.innerHTML = '<div class="empty">Belum ada prompt. Klik "Prompt Baru" untuk mulai.</div>';
    return;
  }
  el.innerHTML = prompts.map(p => `
    <div class="prompt-item ${p.is_active ? 'active' : ''} ${selectedId === p._id ? 'selected' : ''}" onclick="selectPrompt('${p._id}')">
      <div class="prompt-item-name">
        ${escapeHtml(p.name)}
        <span class="prompt-item-version">${escapeHtml(p.version)}</span>
        ${p.is_active ? '<span class="badge cls-positive" style="font-size: 9.5px; padding: 1px 6px;">active</span>' : ''}
      </div>
      <div class="prompt-item-stats">${p.stats?.total_uses ?? 0} uses</div>
      <div class="prompt-item-actions">
        ${!p.is_active ? `<button onclick="event.stopPropagation(); activatePrompt('${p._id}')">Activate</button>` : ''}
        ${!p.is_active ? `<button class="danger" onclick="event.stopPropagation(); deletePrompt('${p._id}')">Delete</button>` : ''}
      </div>
    </div>
  `).join('');
}

function selectPrompt(id) {
  selectedId = id;
  const p = prompts.find(x => x._id === id);
  if (!p) return;
  document.getElementById('promptName').value = p.name;
  document.getElementById('promptVersion').value = p.version;
  document.getElementById('promptNotes').value = p.notes || '';
  document.getElementById('promptContent').value = p.content;
  document.getElementById('editorTitle').textContent = `Edit: ${p.name}`;
  document.getElementById('editorStatus').textContent = p.is_active ? 'ACTIVE' : 'inactive';
  renderPromptList();
}

function newPrompt() {
  selectedId = null;
  document.getElementById('promptName').value = '';
  document.getElementById('promptVersion').value = 'v2.1';
  document.getElementById('promptNotes').value = '';
  document.getElementById('promptContent').value = '# AI-Classifier System Prompt\n\nAnda adalah classifier...\n';
  document.getElementById('editorTitle').textContent = 'Prompt Baru';
  document.getElementById('editorStatus').textContent = 'unsaved';
  renderPromptList();
}

function resetEditor() {
  if (selectedId) selectPrompt(selectedId);
  else newPrompt();
}

async function savePrompt() {
  const name = document.getElementById('promptName').value.trim();
  const version = document.getElementById('promptVersion').value.trim();
  const notes = document.getElementById('promptNotes').value.trim();
  const content = document.getElementById('promptContent').value.trim();

  if (!name || !version || !content) {
    alert('Nama, versi, dan konten wajib diisi.');
    return;
  }

  if (selectedId) {
    // Update not exposed in current API — recreate
    if (!confirm('Update prompt dengan nama+versi yang sama akan jadi duplikat. Hapus yang lama dulu? Klik OK untuk overwrite via delete+create.')) return;
    await fetch(`/api/prompts/${selectedId}`, { method: 'DELETE' }).catch(() => {});
  }

  try {
    const r = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, version, content, notes }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    alert('Saved.');
    selectedId = j.data._id;
    await loadPrompts();
    selectPrompt(selectedId);
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function activatePrompt(id) {
  if (!confirm('Aktifkan prompt ini? Classifier akan mulai pakai prompt ini.')) return;
  try {
    const r = await fetch(`/api/prompts/${id}/activate`, { method: 'PATCH' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    await loadPrompts();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function deletePrompt(id) {
  if (!confirm('Hapus prompt ini?')) return;
  try {
    const r = await fetch(`/api/prompts/${id}`, { method: 'DELETE' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    selectedId = null;
    newPrompt();
    await loadPrompts();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

loadPrompts();
