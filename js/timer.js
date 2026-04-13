/**
 * timer.js — 倒數計時邏輯
 * 負責：定期更新所有卡片的倒數徽章 + 倒數計時視圖渲染
 */

'use strict';

let countdownInterval = null;

// ═══════════════════════════════
// 啟動全域倒數更新器（每 30 秒刷新一次）
// ═══════════════════════════════
function startCountdownUpdater() {
  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    if (AppState.currentView === 'notes')   renderNotes();
    if (AppState.currentView === 'timers')  renderTimers();
  }, 30 * 1000);
}

// ═══════════════════════════════
// 渲染倒數計時視圖
// ═══════════════════════════════
function renderTimers() {
  const container = document.getElementById('timers-list');
  if (!container) return;

  // 只顯示有到期日的記事，依到期時間排序
  const notes = (DataStore.notes || [])
    .filter(n => n.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  if (notes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⏱️</div>
        <div class="empty-state-title">沒有設定倒數的記事</div>
        <div class="empty-state-desc">在新增記事時設定「到期日」，即可在此追蹤倒數</div>
      </div>`;
    return;
  }

  container.innerHTML = notes.map(note => buildTimerCard(note)).join('');
}

// ── 建立計時卡片 ──
function buildTimerCard(note) {
  const cat = (DataStore.categories || []).find(c => c.id === note.categoryId);
  const color = cat ? cat.color : '#6366f1';
  const due = new Date(note.dueDate);
  const now = new Date();
  const diff = due - now;

  // 計算剩餘時間
  let statusHtml, progressPct = 0;

  if (diff < 0) {
    statusHtml = `<div style="font-size:28px;font-weight:700;color:var(--danger);font-family:var(--font-mono);">已逾期</div>`;
  } else {
    const { days, hours, minutes, seconds } = msToComponents(diff);

    // 建立大型倒數顯示
    statusHtml = `
      <div style="display:flex;gap:12px;align-items:flex-end;margin:8px 0;">
        ${days > 0 ? buildTimeUnit(days, '天') : ''}
        ${buildTimeUnit(hours, '時')}
        ${buildTimeUnit(minutes, '分')}
        ${days === 0 ? buildTimeUnit(seconds, '秒') : ''}
      </div>`;

    // 進度條（若有建立時間）
    if (note.createdAt) {
      const total = due - new Date(note.createdAt);
      progressPct = Math.max(0, Math.min(100, ((total - diff) / total) * 100));
    }
  }

  const repeatBadge = note.repeat && note.repeat !== 'none'
    ? `<span style="font-size:11px;color:var(--text-muted);">🔁 ${repeatText(note.repeat)}</span>`
    : '';

  return `
    <div style="background:var(--bg-card);border:1px solid var(--border);
                border-left:3px solid ${color};border-radius:var(--radius-md);
                padding:16px 20px;margin-bottom:12px;cursor:pointer;
                transition:all 0.2s;"
         onclick="openNoteModal('${note.id}')"
         onmouseenter="this.style.transform='translateY(-1px)'"
         onmouseleave="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div>
          <div style="font-size:15px;font-weight:600;color:var(--text-primary);">${escapeHtml(note.title)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
            到期：${due.toLocaleString('zh-TW', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}
            ${repeatBadge}
          </div>
        </div>
        ${cat ? `<span style="font-size:10px;padding:2px 8px;border-radius:99px;
                              background:${hexToRgba(color,0.15)};color:${color};
                              border:1px solid ${hexToRgba(color,0.3)};">
                   ${escapeHtml(cat.name)}
                 </span>` : ''}
      </div>
      ${statusHtml}
      ${progressPct > 0 ? `
        <div style="height:3px;background:var(--border);border-radius:99px;margin-top:10px;overflow:hidden;">
          <div style="height:100%;width:${progressPct}%;background:${color};
                      border-radius:99px;transition:width 0.5s;"></div>
        </div>` : ''}
    </div>`;
}

function buildTimeUnit(value, label) {
  return `
    <div style="text-align:center;">
      <div style="font-size:32px;font-weight:700;color:var(--text-primary);
                  font-family:var(--font-mono);line-height:1;min-width:48px;">
        ${String(value).padStart(2, '0')}
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${label}</div>
    </div>`;
}

function msToComponents(ms) {
  const totalSec = Math.floor(ms / 1000);
  const seconds  = totalSec % 60;
  const minutes  = Math.floor(totalSec / 60) % 60;
  const hours    = Math.floor(totalSec / 3600) % 24;
  const days     = Math.floor(totalSec / 86400);
  return { days, hours, minutes, seconds };
}

function repeatText(repeat) {
  const map = { daily:'每天', weekly:'每週', monthly:'每月', yearly:'每年' };
  return map[repeat] || '';
}
