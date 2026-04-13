/**
 * notes.js — V2_3
 * 完整重寫：所有 template literal 改為字串串接，確保語法正確
 */

'use strict';

window.NotesSortOrder = 'desc';

// ═══════════════════════════════════════
// 渲染記事（表格）
// ═══════════════════════════════════════
function renderNotes() {
  var tbody    = document.getElementById('notes-tbody');
  var emptyEl  = document.getElementById('notes-empty');
  var batchCol = document.getElementById('batch-col');
  var batchMode = AppState.batchDeleteMode;

  if (batchCol) batchCol.style.display = batchMode ? 'table-cell' : 'none';

  var notes  = (DataStore.notes || []).slice();
  var filter = AppState.currentFilter;
  var now    = new Date();

  if (filter === 'upcoming') {
    notes = notes.filter(function(n) {
      if (!n.dueDate) return false;
      var diff = (new Date(n.dueDate) - now) / 864e5;
      return diff >= 0 && diff <= 7;
    });
  } else if (filter === 'overdue') {
    notes = notes.filter(function(n) { return n.dueDate && new Date(n.dueDate) < now; });
  } else if (filter.indexOf('category:') === 0) {
    var catId = filter.split(':')[1];
    notes = notes.filter(function(n) { return n.categoryId === catId; });
  }

  if (AppState.searchQuery) {
    var q = AppState.searchQuery;
    notes = notes.filter(function(n) {
      return (n.title||'').toLowerCase().indexOf(q) >= 0 ||
             (n.content||'').toLowerCase().indexOf(q) >= 0;
    });
  }

  var sortKey = window.NotesSortOrder || 'desc';
  notes.sort(function(a, b) {
    var ta = new Date(a.createdAt||0).getTime();
    var tb = new Date(b.createdAt||0).getTime();
    return sortKey === 'desc' ? tb - ta : ta - tb;
  });

  if (!tbody) return;

  if (notes.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'flex';
  } else {
    if (emptyEl) emptyEl.style.display = 'none';
    tbody.innerHTML = notes.map(function(n) { return buildNoteTableRow(n, batchMode); }).join('');
  }

  renderCalendarIntegration();
}

// ═══════════════════════════════════════
// 行事曆整合區塊
// ═══════════════════════════════════════
function renderCalendarIntegration() {
  var container = document.getElementById('calendar-integration');
  if (!container) return;

  var now  = Date.now();
  var all  = (DataStore.notes||[]).filter(function(n) { return !!n.dueDate; });

  if (!all.length) { container.style.display = 'none'; return; }

  var todayStart    = new Date(); todayStart.setHours(0,0,0,0); todayStart = todayStart.getTime();
  var tomorrowStart = todayStart + 864e5;
  var weekEnd       = todayStart + 7 * 864e5;

  var overdue=[], today=[], thisWeek=[], later=[];
  all.forEach(function(n) {
    var t = new Date(n.dueDate).getTime();
    if (t < now)             overdue.push(n);
    else if (t < tomorrowStart) today.push(n);
    else if (t < weekEnd)    thisWeek.push(n);
    else                     later.push(n);
  });

  overdue.sort(function(a,b){ return new Date(b.dueDate)-new Date(a.dueDate); });
  var byTime = function(a,b){ return new Date(a.dueDate)-new Date(b.dueDate); };
  today.sort(byTime); thisWeek.sort(byTime); later.sort(byTime);

  function fmtDT(d) {
    var dt = new Date(d);
    var hasTime = d.indexOf('T') >= 0 && d.split('T')[1] !== '00:00:00';
    var ds = dt.getFullYear() + '/' +
             String(dt.getMonth()+1).padStart(2,'0') + '/' +
             String(dt.getDate()).padStart(2,'0');
    return hasTime ? ds + ' ' + dt.toTimeString().slice(0,5) : ds;
  }

  function buildGroup(label, items, isOverdue) {
    if (!items.length) return '';
    var rows = items.map(function(n) {
      var cat   = (DataStore.categories||[]).find(function(c){ return c.id===n.categoryId; });
      var color = cat ? cat.color : '#6366f1';
      var diff  = new Date(n.dueDate).getTime() - now;
      var badge = '';
      if (isOverdue) {
        var od = Math.floor(Math.abs(diff)/864e5);
        badge = '<span class="cal-int-badge overdue">' + (od > 0 ? 'overdue ' + od + 'd' : 'overdue') + '</span>';
      } else {
        var d=Math.floor(diff/864e5), h=Math.floor((diff%864e5)/36e5), m=Math.floor((diff%36e5)/6e4);
        var left = d>0 ? d+'d' : h>0 ? h+'h'+m+'m' : m+'m';
        badge = '<span class="cal-int-badge upcoming">' + left + '</span>';
      }
      var repeatLbl = buildRepeatLabel(n.repeat);
      var catBadge  = cat ? '<span class="cal-int-cat" style="color:'+color+'">'+escapeHtml(cat.name)+'</span>' : '';
      return '<div class="cal-int-row" onclick="openNoteModal(\'' + n.id + '\')">' +
               '<span class="cal-int-dot" style="background:'+color+';"></span>' +
               '<div class="cal-int-body">' +
                 '<div class="cal-int-title">' + escapeHtml(n.title) + '</div>' +
                 '<div class="cal-int-meta">' + fmtDT(n.dueDate) +
                   (repeatLbl ? ' <span class="cal-int-repeat">' + repeatLbl + '</span>' : '') +
                   catBadge +
                 '</div>' +
               '</div>' +
               badge +
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;color:var(--text-muted);"><polyline points="9 18 15 12 9 6"/></svg>' +
             '</div>';
    }).join('');
    return '<div class="cal-int-group"><div class="cal-int-group-label">' + label + '</div>' + rows + '</div>';
  }

  container.style.display = 'block';
  container.innerHTML =
    '<div class="cal-int-box">' +
      '<div class="cal-int-header">' +
        '<span class="cal-int-header-title">行事曆整合</span>' +
        '<span class="cal-int-header-count">' + all.length + ' 筆排程</span>' +
      '</div>' +
      buildGroup('已逾期', overdue, true) +
      buildGroup('今天',   today,   false) +
      buildGroup('本週',   thisWeek,false) +
      buildGroup('之後',   later,   false) +
    '</div>';
}

// ═══════════════════════════════════════
// 建立表格行
// ═══════════════════════════════════════
function buildNoteTableRow(note, batchMode) {
  var cat       = (DataStore.categories||[]).find(function(c){ return c.id===note.categoryId; });
  var color     = cat ? cat.color : '#6366f1';
  var now       = Date.now();
  var isChecked = batchMode && (AppState.batchDeleteIds||[]).indexOf(note.id) >= 0;

  var startStr = '-';
  if (note.dueDate) {
    var d = new Date(note.dueDate);
    var hasTime = note.dueDate.indexOf('T') >= 0 && note.dueDate.split('T')[1] !== '00:00:00';
    startStr = d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0');
    if (hasTime) startStr += ' ' + d.toTimeString().slice(0,5);
  }

  var endStr = '-';
  if (note.repeatEnd) {
    var ed = new Date(note.repeatEnd);
    endStr = ed.getFullYear() + '/' + String(ed.getMonth()+1).padStart(2,'0') + '/' + String(ed.getDate()).padStart(2,'0');
  } else if (note.dueDate && (!note.repeat || note.repeat === 'none')) {
    endStr = startStr;
  }

  var rowBg = '';
  var statusLabel = '無期限';
  if (note.dueDate) {
    var dueT  = new Date(note.dueDate).getTime();
    var diff7 = (dueT - now) / 864e5;
    if (dueT < now)    { rowBg = 'rgba(220,38,38,0.09)';  statusLabel = '已逾期'; }
    else if (diff7<=7) { rowBg = 'rgba(245,158,11,0.09)'; statusLabel = '即將到期'; }
    else               { rowBg = 'rgba(22,163,74,0.07)';  statusLabel = '進行中'; }
  }

  var repeatLabel = buildRepeatLabel(note.repeat);
  var remindLabel = buildRemindLabel(note.remindOffsetMin);
  var catBadge = cat ?
    '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+cat.color+';margin-right:4px;vertical-align:middle;"></span>' + escapeHtml(cat.name)
    : '';

  var clickAction = batchMode
    ? 'toggleBatchSelect(\'' + note.id + '\')'
    : 'openNoteModal(\'' + note.id + '\')';

  return '<tr class="note-table-row ' + (isChecked?'batch-selected':'') + '" onclick="' + clickAction + '" style="--row-color:'+color+';background:'+rowBg+';">' +
    (batchMode ? '<td style="text-align:center;"><div class="note-batch-check ' + (isChecked?'checked':'') + '">' + (isChecked?'&#10003;':'') + '</div></td>' : '') +
    '<td><div style="font-weight:600;color:var(--text-primary);font-size:13px;">' + escapeHtml(note.title) + '</div>' +
      (catBadge ? '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + catBadge + '</div>' : '') +
      (note.content ? '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;">' + escapeHtml(note.content) + '</div>' : '') +
    '</td>' +
    '<td style="font-size:11px;color:var(--text-secondary);">' + (remindLabel||'-') + '</td>' +
    '<td style="font-size:11px;color:var(--text-secondary);">' + (repeatLabel||'-') + '</td>' +
    '<td style="font-size:11px;color:var(--text-secondary);white-space:nowrap;">' + startStr + '</td>' +
    '<td style="font-size:11px;color:var(--text-secondary);white-space:nowrap;">' + endStr + '</td>' +
    '<td style="font-size:11px;font-weight:600;color:var(--text-secondary);">' + statusLabel + '</td>' +
  '</tr>';
}

// ── 工具函式 ──
function buildRemindLabel(min) {
  if (min === undefined || min === null || min === -1) return '';
  if (min === 0)    return '到期當下';
  if (min < 60)     return '提前 ' + min + ' 分';
  if (min === 60)   return '提前 1 小時';
  if (min === 1440) return '提前 1 天';
  return '提前 ' + min + ' 分';
}
function buildRepeatLabel(repeat) {
  var map = {daily:'每天', weekly:'每週', monthly:'每月', yearly:'每年'};
  return map[repeat] || '';
}
function buildCountdownBadge(dueDateStr) {
  if (!dueDateStr) return '<div></div>';
  var diff = new Date(dueDateStr) - Date.now();
  if (diff < 0) return '<div class="countdown-badge overdue">逾期</div>';
  var days=Math.floor(diff/864e5), hours=Math.floor((diff%864e5)/36e5), mins=Math.floor((diff%36e5)/6e4);
  var t = '';
  if (days>0)  t += days  + 'd ';
  if (hours>0) t += hours + 'h ';
  if (days===0) t += mins + 'm';
  return '<div class="countdown-badge ' + (diff<864e5?'urgent':'') + '">' + t.trim() + '</div>';
}

// ── 排序切換 ──
function toggleSortOrder() {
  window.NotesSortOrder = window.NotesSortOrder === 'desc' ? 'asc' : 'desc';
  var btn = document.getElementById('btn-sort-order');
  if (btn) btn.textContent = window.NotesSortOrder === 'desc' ? '依時間 新→舊' : '依時間 舊→新';
  renderNotes();
}

// ── 批次刪除 ──
function enterBatchDeleteMode() {
  AppState.batchDeleteMode = true;
  AppState.batchDeleteIds  = [];
  renderNotes(); updateBatchDeleteUI();
}
function exitBatchDeleteMode() {
  AppState.batchDeleteMode = false;
  AppState.batchDeleteIds  = [];
  renderNotes(); updateBatchDeleteUI();
}
function toggleBatchSelect(noteId) {
  var ids = AppState.batchDeleteIds || [];
  var idx = ids.indexOf(noteId);
  if (idx === -1) ids.push(noteId); else ids.splice(idx, 1);
  AppState.batchDeleteIds = ids;
  renderNotes(); updateBatchDeleteUI();
}
function updateBatchDeleteUI() {
  var bar = document.getElementById('batch-delete-bar');
  var cnt = document.getElementById('batch-delete-count');
  if (!bar) return;
  bar.style.display = AppState.batchDeleteMode ? 'flex' : 'none';
  if (cnt) cnt.textContent = '已選 ' + (AppState.batchDeleteIds||[]).length + ' 筆';
}
async function confirmBatchDelete() {
  var ids = AppState.batchDeleteIds || [];
  if (!ids.length) { alert('請先勾選要刪除的記事'); return; }
  var titles = ids.map(function(id) {
    var n = DataStore.notes.find(function(n){ return n.id===id; });
    return n ? '- ' + n.title : '';
  }).filter(Boolean).join('\n');
  if (!confirm('確定要刪除以下 ' + ids.length + ' 筆記事嗎？\n\n' + titles + '\n\n此操作無法復原。')) return;
  for (var i = 0; i < ids.length; i++) {
    var note = DataStore.notes.find(function(n){ return n.id===ids[i]; });
    var atts = note ? (note.attachments||[]) : [];
    for (var j = 0; j < atts.length; j++) {
      if (atts[j].driveFileId && atts[j].driveFileId.indexOf('pending_') !== 0) {
        await deleteAttachment(atts[j].driveFileId).catch(function(){});
      }
    }
  }
  DataStore.notes = DataStore.notes.filter(function(n){ return ids.indexOf(n.id) < 0; });
  exitBatchDeleteMode(); refreshAllViews(); scheduleSave();
}

// ── 開啟記事 Modal ──
function openNoteModal(noteId) {
  AppState.editingNoteId = noteId || null;
  AppState.pendingFiles  = [];
  populateCategorySelect();

  var titleEl   = document.getElementById('note-modal-title');
  var deleteBtn = document.getElementById('btn-delete-note');
  var saveText  = document.getElementById('save-btn-text');

  if (noteId) {
    var note = DataStore.notes.find(function(n){ return n.id===noteId; });
    if (!note) return;
    titleEl.textContent     = '編輯記事';
    deleteBtn.style.display = 'inline-flex';
    saveText.textContent    = '更新';
    document.getElementById('note-title').value    = note.title   || '';
    document.getElementById('note-content').value  = note.content || '';
    document.getElementById('note-category').value = note.categoryId || '';
    var rep = document.getElementById('note-repeat');
    if (rep) rep.value = note.repeat || 'none';
    var repEnd = document.getElementById('note-repeat-end');
    if (repEnd) repEnd.value = note.repeatEnd ? note.repeatEnd.slice(0,10) : '';
    var rem = document.getElementById('note-remind-offset');
    if (rem) rem.value = note.remindOffsetMin !== undefined ? String(note.remindOffsetMin) : '-1';
    if (note.dueDate) {
      var dt = new Date(note.dueDate);
      document.getElementById('note-due-date').value = dt.toLocaleDateString('sv');
      var hasTime = note.dueDate.indexOf('T') >= 0 && note.dueDate.split('T')[1] !== '00:00:00';
      document.getElementById('note-due-time').value = hasTime ? dt.toTimeString().slice(0,5) : '';
    } else {
      document.getElementById('note-due-date').value = '';
      document.getElementById('note-due-time').value = '';
    }
    updateRepeatSummary();
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
  ['note-title','note-content','note-due-date','note-due-time','note-repeat-end'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var g = function(id){ return document.getElementById(id); };
  if (g('note-category'))     g('note-category').value     = '';
  if (g('note-repeat'))       g('note-repeat').value       = 'none';
  if (g('note-remind-offset'))g('note-remind-offset').value= '-1';
  if (g('repeat-summary'))    g('repeat-summary').style.display  = 'none';
  if (g('repeat-end-row'))    g('repeat-end-row').style.display  = 'none';
  if (g('attachment-list'))   g('attachment-list').innerHTML = '';
  // 預設今日日期
  var todayEl = document.getElementById('note-due-date');
  if (todayEl) todayEl.value = new Date().toLocaleDateString('sv');
  AppState.editingNoteId = null;
  AppState.pendingFiles  = [];
}

function updateRepeatSummary() {
  var repeatEl  = document.getElementById('note-repeat');
  var dateEl    = document.getElementById('note-due-date');
  var timeEl    = document.getElementById('note-due-time');
  var endEl     = document.getElementById('note-repeat-end');
  var summaryEl = document.getElementById('repeat-summary');
  var endRow    = document.getElementById('repeat-end-row');
  if (!repeatEl || !summaryEl) return;
  var repeat = repeatEl.value;
  if (repeat === 'none' || !dateEl.value) {
    summaryEl.style.display = 'none';
    if (endRow) endRow.style.display = 'none';
    return;
  }
  if (endRow) endRow.style.display = 'grid';
  var startTime = (timeEl && timeEl.value) ? timeEl.value : '00:00';
  var startDate = new Date(dateEl.value + 'T' + startTime + ':00');
  if (!endEl || !endEl.value) { summaryEl.style.display = 'none'; return; }
  var endDate = new Date(endEl.value + 'T' + startTime + ':00');
  if (endDate <= startDate) { summaryEl.style.display = 'none'; return; }
  var labels = {daily:'每天', weekly:'每週', monthly:'每月', yearly:'每年'};
  var count = 0;
  var cur = new Date(startDate);
  while (cur <= endDate && count < 999) {
    count++;
    if (repeat==='daily')        cur.setDate(cur.getDate()+1);
    else if (repeat==='weekly')  cur.setDate(cur.getDate()+7);
    else if (repeat==='monthly') cur.setMonth(cur.getMonth()+1);
    else if (repeat==='yearly')  cur.setFullYear(cur.getFullYear()+1);
    else cur.setFullYear(9999);
  }
  function fmt(d) {
    return d.getFullYear() + '/' +
           String(d.getMonth()+1).padStart(2,'0') + '/' +
           String(d.getDate()).padStart(2,'0') + ' ' +
           String(d.getHours()).padStart(2,'0') + ':' +
           String(d.getMinutes()).padStart(2,'0');
  }
  summaryEl.style.display = 'block';
  summaryEl.innerHTML = '<div class="repeat-summary-box"><span class="repeat-summary-label">' +
    (labels[repeat]||repeat) + '重複</span> ' + fmt(startDate) + ' ~ ' + fmt(endDate) +
    ' 共重複 <strong>' + count + '</strong> 次</div>';
}

// ── 儲存記事 ──
async function saveNote() {
  var title = document.getElementById('note-title') ? document.getElementById('note-title').value.trim() : '';
  if (!title) {
    var count = (DataStore.notes || []).length + 1;
    title = 'Title' + count;
  }
  var dueDateVal   = document.getElementById('note-due-date')  ? document.getElementById('note-due-date').value  : '';
  var dueTimeVal   = document.getElementById('note-due-time')  ? document.getElementById('note-due-time').value  : '';
  var dueDate      = dueDateVal ? (dueTimeVal ? dueDateVal + 'T' + dueTimeVal + ':00' : dueDateVal + 'T00:00:00') : null;
  var repeatEndVal = document.getElementById('note-repeat-end')? document.getElementById('note-repeat-end').value: '';
  var repeatEnd    = repeatEndVal ? (repeatEndVal + 'T' + (dueTimeVal||'00:00') + ':00') : null;
  var remindOffsetMin = parseInt((document.getElementById('note-remind-offset')||{value:'-1'}).value);
  var saveText = document.getElementById('save-btn-text');
  if (saveText) saveText.textContent = '儲存中...';

  var newAtts = [];
  if (AppState.pendingFiles && AppState.pendingFiles.length > 0) newAtts = await uploadPendingFiles();

  var nowIso = new Date().toISOString();
  if (AppState.editingNoteId) {
    var idx = DataStore.notes.findIndex(function(n){ return n.id===AppState.editingNoteId; });
    if (idx !== -1) {
      DataStore.notes[idx] = Object.assign({}, DataStore.notes[idx], {
        title: title,
        content:    (document.getElementById('note-content')||{value:''}).value.trim(),
        categoryId: (document.getElementById('note-category')||{value:''}).value,
        repeat:     (document.getElementById('note-repeat')||{value:'none'}).value,
        repeatEnd:  repeatEnd,
        dueDate:    dueDate,
        remindOffsetMin: remindOffsetMin,
        updatedAt:  nowIso,
        attachments: (DataStore.notes[idx].attachments||[]).concat(newAtts)
      });
    }
  } else {
    DataStore.notes.push({
      id:             'note_' + Date.now(),
      title:          title,
      content:        (document.getElementById('note-content')||{value:''}).value.trim(),
      categoryId:     (document.getElementById('note-category')||{value:''}).value,
      repeat:         (document.getElementById('note-repeat')||{value:'none'}).value,
      repeatEnd:      repeatEnd,
      dueDate:        dueDate,
      remindOffsetMin:remindOffsetMin,
      attachments:    newAtts,
      createdAt:      nowIso,
      updatedAt:      nowIso
    });
  }
  closeModal('note-modal');
  refreshAllViews();
  scheduleSave();
  if (typeof scheduleAllNotifications === 'function') scheduleAllNotifications();
}

function refreshAllViews() {
  renderNotes();
  if (typeof renderCalendar === 'function') renderCalendar();
  if (AppState.currentView === 'timers' && typeof renderTimers === 'function') renderTimers();
  if (typeof renderSidebarCategories === 'function') renderSidebarCategories();
}

async function uploadPendingFiles() {
  var results = [];
  for (var i = 0; i < AppState.pendingFiles.length; i++) {
    try { results.push(await uploadAttachment(AppState.pendingFiles[i])); }
    catch(e) { results.push({name:AppState.pendingFiles[i].name, mimeType:AppState.pendingFiles[i].type, driveFileId:null, size:AppState.pendingFiles[i].size}); }
  }
  return results;
}

async function deleteCurrentNote() {
  var noteId = AppState.editingNoteId;
  if (!noteId) return;
  var note = DataStore.notes.find(function(n){ return n.id===noteId; });
  if (!note || !confirm('確定要刪除「' + note.title + '」嗎？')) return;
  var atts = note.attachments || [];
  for (var i = 0; i < atts.length; i++) {
    if (atts[i].driveFileId && atts[i].driveFileId.indexOf('pending_') !== 0) {
      await deleteAttachment(atts[i].driveFileId).catch(function(){});
    }
  }
  DataStore.notes = DataStore.notes.filter(function(n){ return n.id !== noteId; });
  closeModal('note-modal');
  refreshAllViews();
  scheduleSave();
}

// ── 分類管理 ──
function populateCategorySelect() {
  var s = document.getElementById('note-category');
  if (!s) return;
  s.innerHTML = '<option value="">無分類</option>';
  (DataStore.categories||[]).forEach(function(cat) {
    var o = document.createElement('option');
    o.value = cat.id; o.textContent = cat.name;
    s.appendChild(o);
  });
}
function renderCategoryList() {
  var c = document.getElementById('category-list');
  if (!c) return;
  if (!(DataStore.categories||[]).length) {
    c.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">尚無分類</div>';
    return;
  }
  c.innerHTML = DataStore.categories.map(function(cat) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-subtle);">' +
      '<div style="width:12px;height:12px;border-radius:50%;background:'+cat.color+';flex-shrink:0;"></div>' +
      '<span style="flex:1;font-size:13px;color:var(--text-primary);">' + escapeHtml(cat.name) + '</span>' +
      '<button class="topbar-action-btn" style="width:26px;height:26px;font-size:12px;color:var(--danger);" onclick="deleteCategory(\''+cat.id+'\')">&#x2715;</button>' +
    '</div>';
  }).join('');
}
function addCategory() {
  var name = document.getElementById('new-category-name') ? document.getElementById('new-category-name').value.trim() : '';
  if (!name) { alert('請輸入分類名稱'); return; }
  DataStore.categories = DataStore.categories || [];
  DataStore.categories.push({id:'cat_'+Date.now(), name:name, color:AppState.selectedColor});
  document.getElementById('new-category-name').value = '';
  if (typeof initColorPicker === 'function') initColorPicker();
  renderCategoryList();
  renderSidebarCategories();
  scheduleSave();
}
function deleteCategory(catId) {
  if (!confirm('確定要刪除此分類？')) return;
  DataStore.categories = DataStore.categories.filter(function(c){ return c.id!==catId; });
  renderCategoryList();
  renderSidebarCategories();
  renderNotes();
  if (typeof renderCalendar === 'function') renderCalendar();
  scheduleSave();
}
function renderSidebarCategories() {
  var c = document.getElementById('sidebar-categories');
  if (!c) return;
  c.innerHTML = (DataStore.categories||[]).map(function(cat) {
    var active = AppState.currentFilter === ('category:'+cat.id) ? ' active' : '';
    return '<button class="sidebar-item'+active+'" data-view="notes" data-category="'+cat.id+'" onclick="filterByCategory(\''+cat.id+'\')">' +
      '<span style="width:8px;height:8px;border-radius:50%;background:'+cat.color+';flex-shrink:0;display:inline-block;"></span>' +
      '&nbsp;' + escapeHtml(cat.name) +
    '</button>';
  }).join('');
}
function filterByCategory(catId) {
  AppState.currentFilter = 'category:' + catId;
  if (AppState.currentView !== 'notes') {
    if (typeof switchView === 'function') switchView('notes');
  } else {
    renderNotes();
    renderSidebarCategories();
  }
  document.querySelectorAll('.filter-btn').forEach(function(b){ b.classList.remove('active'); });
}

// ── 附件 ──
function handleDragOver(e) { e.preventDefault(); document.getElementById('upload-zone') && document.getElementById('upload-zone').classList.add('drag-over'); }
function handleDrop(e)     { e.preventDefault(); document.getElementById('upload-zone') && document.getElementById('upload-zone').classList.remove('drag-over'); addPendingFiles(Array.from(e.dataTransfer.files)); }
function handleFileSelect(e) { addPendingFiles(Array.from(e.target.files)); }
function addPendingFiles(files) {
  AppState.pendingFiles = (AppState.pendingFiles||[]).concat(files);
  var ex = AppState.editingNoteId ? ((DataStore.notes.find(function(n){ return n.id===AppState.editingNoteId; })||{}).attachments||[]) : [];
  renderAttachmentList(ex, AppState.pendingFiles);
}
function renderAttachmentList(existing, pending) {
  var c = document.getElementById('attachment-list');
  if (!c) return;
  var eH = (existing||[]).map(function(a) {
    return '<div class="attachment-preview">' +
      '<span class="attachment-icon">' + getFileIcon(a.mimeType) + '</span>' +
      '<span class="attachment-name">' + escapeHtml(a.name) + '</span>' +
      (a.webViewLink ? '<a href="'+a.webViewLink+'" target="_blank" style="font-size:11px;color:var(--accent-hover);">開啟</a>' : '') +
    '</div>';
  }).join('');
  var pH = (pending||[]).map(function(f, i) {
    return '<div class="attachment-preview">' +
      '<span class="attachment-icon">' + getFileIcon(f.type) + '</span>' +
      '<span class="attachment-name">' + escapeHtml(f.name) + '</span>' +
      '<span style="font-size:10px;color:var(--warning);">待上傳</span>' +
      '<button class="topbar-action-btn" style="width:22px;height:22px;font-size:10px;margin-left:auto;" onclick="removePendingFile('+i+')">&#x2715;</button>' +
    '</div>';
  }).join('');
  c.innerHTML = eH + pH;
}
function removePendingFile(i) {
  AppState.pendingFiles.splice(i,1);
  var ex = AppState.editingNoteId ? ((DataStore.notes.find(function(n){ return n.id===AppState.editingNoteId; })||{}).attachments||[]) : [];
  renderAttachmentList(ex, AppState.pendingFiles);
}
function getFileIcon(m) {
  m = m || '';
  if (m.indexOf('image/') === 0)  return '[img]';
  if (m.indexOf('pdf') >= 0)      return '[pdf]';
  if (m.indexOf('video') >= 0)    return '[vid]';
  if (m.indexOf('audio') >= 0)    return '[aud]';
  return '[file]';
}

// ── 通用工具 ──
function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function hexToRgba(hex, a) {
  a = a === undefined ? 1 : a;
  var r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return 'rgba('+r+','+g+','+b+','+a+')';
}
