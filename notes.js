/**
 * notes.js — 記事 CRUD
 * V1_2 修正：
 *  需求6:  搜尋只在記事頁顯示
 *  需求9:  週期重複時間範圍顯示
 *  需求10: 記事清單加 scroll
 */

'use strict';

// ══════════════════════════════════════
// 渲染記事清單（需求10：外層 scroll 由 CSS 控制）
// ══════════════════════════════════════
function renderNotes() {
  const grid = document.getElementById('notes-grid');
  if (!grid) return;

  let notes = DataStore.notes || [];
  const filter = AppState.currentFilter;
  const now    = new Date();

  if (filter === 'upcoming') {
    notes = notes.filter(n => {
      if (!n.dueDate) return false;
      const diff = (new Date(n.dueDate) - now) / 864e5;
      return diff >= 0 && diff <= 3;
    });
  } else if (filter === 'overdue') {
    notes = notes.filter(n => n.dueDate && new Date(n.dueDate) < now);
  } else if (filter.startsWith('category:')) {
    const catId = filter.split(':')[1];
    notes = notes.filter(n => n.categoryId === catId);
  }

  if (AppState.searchQuery) {
    const q = AppState.searchQuery;
    notes = notes.filter(n =>
      (n.title||'').toLowerCase().includes(q) ||
      (n.content||'').toLowerCase().includes(q)
    );
  }

  notes = [...notes].sort((a,b) => {
    if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return new Date(b.createdAt||0) - new Date(a.createdAt||0);
  });

  if (notes.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-title">沒有符合的記事</div>
        <div class="empty-state-desc">點擊下方「＋」建立記事</div>
      </div>`;
    return;
  }

  grid.innerHTML = notes.map(buildNoteCard).join('');
}

function buildNoteCard(note) {
  const cat      = (DataStore.categories||[]).find(c => c.id === note.categoryId);
  const color    = cat ? cat.color : '#6366f1';
  const badgeBg  = hexToRgba(color, 0.15);
  const repeatIcon = note.repeat && note.repeat !== 'none' ? '🔁 ' : '';

  return `
    <div class="note-card" data-note-id="${note.id}"
         style="--card-color:${color};"
         onclick="openNoteModal('${note.id}')">
      <div class="note-card-header">
        <div class="note-title">${repeatIcon}${escapeHtml(note.title)}</div>
        ${cat ? `<span class="note-category-badge"
          style="background:${badgeBg};color:${color};border:1px solid ${hexToRgba(color,.3)};">
          ${escapeHtml(cat.name)}</span>` : ''}
      </div>
      ${note.content ? `<div class="note-content">${escapeHtml(note.content)}</div>` : ''}
      <div class="note-footer">
        ${buildCountdownBadge(note.dueDate)}
        ${(note.attachments||[]).length > 0
          ? `<div class="note-attachments">📎 ${note.attachments.length}</div>`
          : '<div></div>'}
      </div>
    </div>`;
}

function buildCountdownBadge(dueDateStr) {
  if (!dueDateStr) return '<div></div>';
  const diff = new Date(dueDateStr) - Date.now();
  if (diff < 0) return `<div class="countdown-badge overdue">⚠️ 已逾期</div>`;

  const days  = Math.floor(diff/864e5);
  const hours = Math.floor((diff%864e5)/36e5);
  const mins  = Math.floor((diff%36e5)/6e4);
  const isUrgent = diff < 864e5;

  let text = '';
  if (days > 0)  text += `${days}天 `;
  if (hours > 0) text += `${hours}時 `;
  if (days===0)  text += `${mins}分`;

  return `<div class="countdown-badge ${isUrgent?'urgent':''}">⏱ ${text.trim()}</div>`;
}

// ══════════════════════════════════════
// 開啟記事 Modal
// ══════════════════════════════════════
function openNoteModal(noteId = null) {
  AppState.editingNoteId = noteId;
  AppState.pendingFiles  = [];
  populateCategorySelect();

  const titleEl   = document.getElementById('note-modal-title');
  const deleteBtn = document.getElementById('btn-delete-note');
  const saveText  = document.getElementById('save-btn-text');

  if (noteId) {
    const note = DataStore.notes.find(n => n.id === noteId);
    if (!note) return;

    titleEl.textContent     = '編輯記事';
    deleteBtn.style.display = 'inline-flex';
    saveText.textContent    = '更新';

    document.getElementById('note-title').value    = note.title      || '';
    document.getElementById('note-content').value  = note.content    || '';
    document.getElementById('note-category').value = note.categoryId || '';

    const repeatEl = document.getElementById('note-repeat');
    if (repeatEl) repeatEl.value = note.repeat || 'none';

    // 週期結束日
    const repeatEndEl = document.getElementById('note-repeat-end');
    if (repeatEndEl) repeatEndEl.value = note.repeatEnd ? note.repeatEnd.slice(0,10) : '';

    const remindEl = document.getElementById('note-remind-offset');
    if (remindEl) remindEl.value = note.remindOffsetMin !== undefined ? String(note.remindOffsetMin) : '-1';

    if (note.dueDate) {
      const dt = new Date(note.dueDate);
      document.getElementById('note-due-date').value = dt.toLocaleDateString('sv');
      document.getElementById('note-due-time').value = dt.toTimeString().slice(0,5);
    } else {
      document.getElementById('note-due-date').value = '';
      document.getElementById('note-due-time').value = '';
    }

    updateRepeatSummary(); // 需求9：顯示重複摘要
    renderAttachmentList(note.attachments||[], []);
  } else {
    titleEl.textContent     = '新增記事';
    deleteBtn.style.display = 'none';
    saveText.textContent    = '儲存';
    resetNoteModal();
  }

  openModal('note-modal');
}

function resetNoteModal() {
  ['note-title','note-content','note-due-date','note-due-time','note-repeat-end'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const cat = document.getElementById('note-category');
  if (cat) cat.value = '';
  const rep = document.getElementById('note-repeat');
  if (rep) rep.value = 'none';
  const remind = document.getElementById('note-remind-offset');
  if (remind) remind.value = '-1';

  // 重置摘要
  const summary = document.getElementById('repeat-summary');
  if (summary) summary.style.display = 'none';

  AppState.editingNoteId = null;
  AppState.pendingFiles  = [];
  const attachList = document.getElementById('attachment-list');
  if (attachList) attachList.innerHTML = '';

  // 隱藏重複結束日欄位
  const repeatEndRow = document.getElementById('repeat-end-row');
  if (repeatEndRow) repeatEndRow.style.display = 'none';
}

// ══════════════════════════════════════
// 需求9：計算並顯示週期重複摘要
// ══════════════════════════════════════
function updateRepeatSummary() {
  const repeatEl   = document.getElementById('note-repeat');
  const dateEl     = document.getElementById('note-due-date');
  const timeEl     = document.getElementById('note-due-time');
  const endEl      = document.getElementById('note-repeat-end');
  const summaryEl  = document.getElementById('repeat-summary');
  const endRow     = document.getElementById('repeat-end-row');

  if (!repeatEl || !summaryEl) return;

  const repeat = repeatEl.value;

  if (repeat === 'none' || !dateEl.value) {
    summaryEl.style.display = 'none';
    if (endRow) endRow.style.display = 'none';
    return;
  }

  // 顯示結束日期欄位
  if (endRow) endRow.style.display = 'grid';

  const startTime = timeEl.value || '00:00';
  const startDate = new Date(`${dateEl.value}T${startTime}:00`);
  const endDateVal = endEl ? endEl.value : '';

  if (!endDateVal) {
    summaryEl.style.display = 'none';
    return;
  }

  const endDate = new Date(`${endDateVal}T${startTime}:00`);

  // 計算重複次數
  let count = 0;
  const repeatLabels = { daily:'每天', weekly:'每週', monthly:'每月', yearly:'每年' };
  const label = repeatLabels[repeat] || repeat;

  const cur = new Date(startDate);
  while (cur <= endDate && count < 999) {
    count++;
    switch (repeat) {
      case 'daily':   cur.setDate(cur.getDate() + 1);     break;
      case 'weekly':  cur.setDate(cur.getDate() + 7);     break;
      case 'monthly': cur.setMonth(cur.getMonth() + 1);   break;
      case 'yearly':  cur.setFullYear(cur.getFullYear()+1); break;
      default: cur.setFullYear(9999); // 停止
    }
  }

  const fmt = d => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

  summaryEl.style.display = 'block';
  summaryEl.innerHTML = `
    <div class="repeat-summary-box">
      <span class="repeat-summary-label">${label}重複</span>
      時間範圍：${fmt(startDate)} ~ ${fmt(endDate)}
      &nbsp;共重複 <strong>${count}</strong> 次
    </div>`;
}

// ══════════════════════════════════════
// 儲存記事
// ══════════════════════════════════════
async function saveNote() {
  const title = document.getElementById('note-title')?.value.trim();
  if (!title) {
    alert('請輸入標題');
    document.getElementById('note-title')?.focus();
    return;
  }

  const dueDateVal     = document.getElementById('note-due-date')?.value;
  const dueTimeVal     = document.getElementById('note-due-time')?.value || '00:00';
  const dueDate        = dueDateVal ? `${dueDateVal}T${dueTimeVal}:00` : null;
  const repeatEndVal   = document.getElementById('note-repeat-end')?.value;
  const repeatEnd      = repeatEndVal ? `${repeatEndVal}T${dueTimeVal}:00` : null;
  const remindOffsetMin = parseInt(document.getElementById('note-remind-offset')?.value ?? '-1');
  const saveText        = document.getElementById('save-btn-text');
  if (saveText) saveText.textContent = '儲存中…';

  let newAttachments = [];
  if (AppState.pendingFiles.length > 0) {
    newAttachments = await uploadPendingFiles();
  }

  const nowIso = new Date().toISOString();

  if (AppState.editingNoteId) {
    const idx = DataStore.notes.findIndex(n => n.id === AppState.editingNoteId);
    if (idx !== -1) {
      DataStore.notes[idx] = {
        ...DataStore.notes[idx],
        title,
        content:    document.getElementById('note-content')?.value.trim() || '',
        categoryId: document.getElementById('note-category')?.value || '',
        repeat:     document.getElementById('note-repeat')?.value || 'none',
        repeatEnd,
        dueDate,
        remindOffsetMin,
        updatedAt:  nowIso,
        attachments:[...(DataStore.notes[idx].attachments||[]), ...newAttachments]
      };
    }
  } else {
    DataStore.notes.push({
      id:             'note_' + Date.now(),
      title,
      content:        document.getElementById('note-content')?.value.trim() || '',
      categoryId:     document.getElementById('note-category')?.value || '',
      repeat:         document.getElementById('note-repeat')?.value || 'none',
      repeatEnd,
      dueDate,
      remindOffsetMin,
      attachments:    newAttachments,
      createdAt:      nowIso,
      updatedAt:      nowIso
    });
  }

  closeModal('note-modal');
  refreshAllViews();
  scheduleSave();
  scheduleAllNotifications();
}

function refreshAllViews() {
  renderNotes();
  renderCalendar();
  if (AppState.currentView === 'timers') renderTimers();
  renderSidebarCategories();
}

async function uploadPendingFiles() {
  const results = [];
  for (const file of AppState.pendingFiles) {
    try { results.push(await uploadAttachment(file)); }
    catch(err) {
      console.error('[Notes] 附件上傳失敗:', file.name, err);
      results.push({ name:file.name, mimeType:file.type, driveFileId:null, size:file.size });
    }
  }
  return results;
}

// ══════════════════════════════════════
// 刪除記事
// ══════════════════════════════════════
async function deleteCurrentNote() {
  const noteId = AppState.editingNoteId;
  if (!noteId) return;
  const note = DataStore.notes.find(n => n.id === noteId);
  if (!note || !confirm(`確定要刪除「${note.title}」嗎？`)) return;

  for (const att of note.attachments||[]) {
    if (att.driveFileId && !att.driveFileId.startsWith('pending_')) {
      await deleteAttachment(att.driveFileId).catch(()=>{});
    }
  }
  DataStore.notes = DataStore.notes.filter(n => n.id !== noteId);
  closeModal('note-modal');
  refreshAllViews();
  scheduleSave();
}

// ══════════════════════════════════════
// 分類管理
// ══════════════════════════════════════
function populateCategorySelect() {
  const select = document.getElementById('note-category');
  if (!select) return;
  select.innerHTML = '<option value="">無分類</option>';
  (DataStore.categories||[]).forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id; opt.textContent = cat.name;
    select.appendChild(opt);
  });
}

function renderCategoryList() {
  const container = document.getElementById('category-list');
  if (!container) return;
  if (!(DataStore.categories||[]).length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">尚無分類</div>';
    return;
  }
  container.innerHTML = DataStore.categories.map(cat => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-subtle);">
      <div style="width:12px;height:12px;border-radius:50%;background:${cat.color};flex-shrink:0;"></div>
      <span style="flex:1;font-size:13px;color:var(--text-primary);">${escapeHtml(cat.name)}</span>
      <button class="topbar-action-btn" style="width:26px;height:26px;font-size:12px;color:var(--danger);"
              onclick="deleteCategory('${cat.id}')">✕</button>
    </div>`).join('');
}

function addCategory() {
  const name = document.getElementById('new-category-name')?.value.trim();
  if (!name) { alert('請輸入分類名稱'); return; }
  DataStore.categories = DataStore.categories || [];
  DataStore.categories.push({ id:'cat_'+Date.now(), name, color:AppState.selectedColor });
  document.getElementById('new-category-name').value = '';
  initColorPicker();
  renderCategoryList();
  renderSidebarCategories();
  scheduleSave();
}

function deleteCategory(catId) {
  if (!confirm('確定要刪除此分類？')) return;
  DataStore.categories = DataStore.categories.filter(c => c.id !== catId);
  renderCategoryList();
  renderSidebarCategories();
  renderNotes();
  renderCalendar();
  scheduleSave();
}

function renderSidebarCategories() {
  const container = document.getElementById('sidebar-categories');
  if (!container) return;
  container.innerHTML = (DataStore.categories||[]).map(cat => `
    <button class="sidebar-item" data-view="notes" data-category="${cat.id}"
            onclick="filterByCategory('${cat.id}')">
      <span style="width:8px;height:8px;border-radius:50%;background:${cat.color};flex-shrink:0;display:inline-block;"></span>
      &nbsp;${escapeHtml(cat.name)}
    </button>`).join('');
}

function filterByCategory(catId) {
  AppState.currentFilter = 'category:' + catId;
  switchView('notes');
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
}

// ══════════════════════════════════════
// 附件操作
// ══════════════════════════════════════
function handleDragOver(event) {
  event.preventDefault();
  document.getElementById('upload-zone')?.classList.add('drag-over');
}
function handleDrop(event) {
  event.preventDefault();
  document.getElementById('upload-zone')?.classList.remove('drag-over');
  addPendingFiles(Array.from(event.dataTransfer.files));
}
function handleFileSelect(event) { addPendingFiles(Array.from(event.target.files)); }

function addPendingFiles(files) {
  AppState.pendingFiles.push(...files);
  const existing = AppState.editingNoteId
    ? (DataStore.notes.find(n=>n.id===AppState.editingNoteId)?.attachments||[])
    : [];
  renderAttachmentList(existing, AppState.pendingFiles);
}

function renderAttachmentList(existing=[], pending=[]) {
  const container = document.getElementById('attachment-list');
  if (!container) return;
  const existHTML = existing.map(att => `
    <div class="attachment-preview">
      <span class="attachment-icon">${getFileIcon(att.mimeType)}</span>
      <span class="attachment-name">${escapeHtml(att.name)}</span>
      ${att.webViewLink?`<a href="${att.webViewLink}" target="_blank" style="font-size:11px;color:var(--accent-hover);">開啟↗</a>`:''}
    </div>`).join('');
  const pendHTML = pending.map((f,i) => `
    <div class="attachment-preview">
      <span class="attachment-icon">${getFileIcon(f.type)}</span>
      <span class="attachment-name">${escapeHtml(f.name)}</span>
      <span style="font-size:10px;color:var(--warning);">待上傳</span>
      <button class="topbar-action-btn" style="width:22px;height:22px;font-size:10px;margin-left:auto;"
              onclick="removePendingFile(${i})">✕</button>
    </div>`).join('');
  container.innerHTML = existHTML + pendHTML;
}

function removePendingFile(index) {
  AppState.pendingFiles.splice(index, 1);
  const existing = AppState.editingNoteId
    ? (DataStore.notes.find(n=>n.id===AppState.editingNoteId)?.attachments||[])
    : [];
  renderAttachmentList(existing, AppState.pendingFiles);
}

function getFileIcon(m='') {
  if (m.startsWith('image/')) return '🖼️';
  if (m.includes('pdf'))      return '📄';
  if (m.includes('video'))    return '🎬';
  if (m.includes('audio'))    return '🎵';
  return '📎';
}

// ══════════════════════════════════════
// 工具函式
// ══════════════════════════════════════
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function hexToRgba(hex, alpha=1) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── HTML onchange 呼叫的別名 ──
function updateRepeatRangeSummary() { updateRepeatSummary(); }
