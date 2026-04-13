// 需求2：最後同步時間
let _lastSyncTimeStr = '—';

/**
 * settings.js — V5_0
 * Improved: card-based layout, clear data button, better visual hierarchy
 */

'use strict';

async function renderSettingsPage() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  const userInfo   = localStorage.getItem('cstn_user_info');
  const user       = userInfo ? JSON.parse(userInfo) : {};
  const sharedId   = localStorage.getItem('cstn_shared_folder_id');
  const myFolderId = DataStore.driveFolderId || localStorage.getItem('cstn_folder_id') || '—';
  const storageOwner = DataStore.isSharedMode
    ? '（共用資料夾擁有者）'
    : (user.email || '—');

  container.innerHTML =
    '<!-- 帳號資訊 -->' +
    '<div class="settings-section">' +
      '<div class="settings-section-title">👤 帳號資訊</div>' +
      '<div class="settings-row">' +
        '<div class="settings-label">目前登入</div>' +
        '<div class="settings-value">' + (user.email || '未登入') + '</div>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-label">儲存帳號</div>' +
        '<div class="settings-value">' + storageOwner + '</div>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-label">資料夾 ID</div>' +
        '<div class="settings-value" style="font-family:var(--font-mono);font-size:11px;word-break:break-all;">' +
          myFolderId +
          ' <button class="btn btn-secondary btn-sm" style="margin-left:4px;font-size:10px;" onclick="copyText(\'' + myFolderId + '\')">複製</button>' +
        '</div>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-label">共用模式</div>' +
        '<div class="settings-value">' +
          (DataStore.isSharedMode
            ? '<span style="color:var(--accent-primary);">🔗 共用中</span>'
            : '<span style="color:var(--success);">👤 個人模式</span>') +
        '</div>' +
      '</div>' +
      '<button class="btn btn-danger" onclick="handleLogout()" style="margin-top:14px;width:100%;">🚪 登出</button>' +
    '</div>' +

    '<!-- 共用設定 -->' +
    '<div class="settings-section">' +
      '<div class="settings-section-title">🔗 共用行事曆</div>' +
      '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--text-secondary);line-height:1.7;">' +
        '<strong style="color:var(--text-primary);">共用流程</strong><br/>' +
        '1. A 帳號：複製下方「我的資料夾 ID」<br/>' +
        '2. A 帳號：Google Drive 找到「#CloudSync Timer Notes」→ 右鍵共用 → 知道連結的人可編輯<br/>' +
        '3. B 帳號：下方貼上 A 的 ID 並連接' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">我的資料夾 ID</label>' +
        '<div style="display:flex;gap:6px;">' +
          '<input type="text" class="form-input" id="settings-my-folder-id" value="' + myFolderId + '" readonly style="font-family:var(--font-mono);font-size:11px;"/>' +
          '<button class="btn btn-secondary" onclick="copyText(document.getElementById(\'settings-my-folder-id\').value)" style="flex-shrink:0;">複製</button>' +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">輸入他人的資料夾 ID</label>' +
        '<div style="display:flex;gap:6px;">' +
          '<input type="text" class="form-input" id="settings-shared-folder-input" value="' + (sharedId || '') + '" placeholder="貼上資料夾 ID…" style="font-family:var(--font-mono);font-size:11px;"/>' +
          '<button class="btn btn-primary" onclick="applySharedFolderFromSettings()" id="btn-join-shared" style="flex-shrink:0;">連接</button>' +
        '</div>' +
      '</div>' +
      (DataStore.isSharedMode ? '<button class="btn btn-danger" onclick="leaveSharedFolderFromSettings()" style="width:100%;">離開共用</button>' : '') +
    '</div>' +

    '<!-- 備份與還原 -->' +
    '<div class="settings-section">' +
      '<div class="settings-section-title">💾 備份與還原</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">' +
        '<button class="btn btn-primary" onclick="doManualBackup()">📥 立即備份</button>' +
        '<button class="btn btn-secondary" onclick="loadAndShowBackups()">🕐 備份記錄</button>' +
      '</div>' +
      '<div id="backup-list-container"></div>' +
    '</div>' +

    '<!-- 外觀 -->' +
    '<div class="settings-section">' +
      '<div class="settings-section-title">🎨 外觀設定</div>' +
      '<div class="settings-row">' +
        '<div class="settings-label">主題模式</div>' +
        '<div class="settings-value">' +
          '<button class="btn btn-secondary" onclick="toggleTheme()" id="settings-theme-btn">' +
            ((window.AppState && AppState.theme === 'dark') ? '☀️ 亮色' : '🌙 暗色') +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<!-- App 資訊 -->' +
    '<div class="settings-section">' +
      '<div class="settings-section-title">ℹ️ 應用程式資訊</div>' +
      '<div class="settings-row">' +
        '<div class="settings-label">版本</div>' +
        '<div class="settings-value" style="font-family:var(--font-mono);">' + ((window.AppState && AppState.appVersion) || 'V5_0') + '</div>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-label">同步間隔</div>' +
        '<div class="settings-value">5 秒</div>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-label">自動備份</div>' +
        '<div class="settings-value">每天 23:59</div>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-label">最後同步</div>' +
        '<div class="settings-value" id="settings-last-sync">' + _lastSyncTimeStr + '</div>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-label">資料筆數</div>' +
        '<div class="settings-value">' + ((window.DataStore && DataStore.notes||[]).length || 0) + ' 筆 / ' + ((window.DataStore && DataStore.categories||[]).length || 0) + ' 分類</div>' +
      '</div>' +
    '</div>' +

    '<!-- 危險區域 -->' +
    '<div class="settings-section" style="border-color:rgba(220,38,38,0.2);">' +
      '<div class="settings-section-title" style="color:var(--danger);">⚠️ 危險操作</div>' +
      '<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">清除所有記事和分類資料，此操作無法復原。</p>' +
      '<button class="btn btn-danger" onclick="clearAllData()" style="width:100%;">🗑 清除所有資料</button>' +
    '</div>';
}

async function applySharedFolderFromSettings() {
  const input = document.getElementById('settings-shared-folder-input')?.value?.trim();
  if (!input) { alert('請輸入資料夾 ID'); return; }
  const btn = document.getElementById('btn-join-shared');
  if (btn) btn.textContent = '連接中…';
  try {
    await joinSharedFolder(input);
    alert('✅ 已成功連接共用資料夾！');
    renderSettingsPage();
  } catch (err) {
    alert('❌ 連接失敗：' + err.message);
  } finally {
    if (btn) btn.textContent = '連接';
  }
}

async function leaveSharedFolderFromSettings() {
  if (!confirm('確定離開共用資料夾？')) return;
  await leaveSharedFolder();
  alert('✅ 已切換回個人資料夾');
  renderSettingsPage();
}

async function doManualBackup() {
  const btn = event?.target;
  if (btn) btn.textContent = '備份中…';
  try {
    await performBackup('manual');
    await loadAndShowBackups();
  } finally {
    if (btn) btn.textContent = '📥 立即備份';
  }
}

async function loadAndShowBackups() {
  openModal('backup-modal');
  const container = document.getElementById('backup-modal-list');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:24px;">載入中…</div>';
  try {
    const backups = await listBackupFiles();
    if (!backups.length) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:24px;">尚無備份記錄</div>';
      return;
    }
    container.innerHTML = backups.map(function(b) { return buildBackupRow(b); }).join('');
  } catch (err) {
    container.innerHTML = '<div style="color:var(--danger);font-size:13px;padding:16px;">載入失敗：' + err.message + '</div>';
  }
}

function buildBackupRow(b) {
  var dt = new Date(b.modified);
  var dtStr = dt.getFullYear() + '/' + String(dt.getMonth()+1).padStart(2,'0') + '/' + String(dt.getDate()).padStart(2,'0') + ' ' + dt.toTimeString().slice(0,8);
  var size = b.size > 1024 ? (b.size/1024).toFixed(1) + ' KB' : b.size + ' B';
  var typeColor = b.type === 'auto' ? 'var(--accent-primary)' : 'var(--success)';
  var typeLabel = b.type === 'auto' ? '自動' : '手動';
  return '<div class="backup-row" onclick="restoreFromBackup(\'' + b.id + '\', \'' + b.name.replace(/'/g,"\\'") + '\')" title="點擊還原">' +
    '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">' +
      '<span class="backup-type-badge" style="background:' + typeColor + '20;color:' + typeColor + ';border:1px solid ' + typeColor + '40;">' + typeLabel + '</span>' +
      '<div style="min-width:0;">' +
        '<div style="font-size:12px;font-weight:600;color:var(--text-primary);">' + dtStr + '</div>' +
        '<div style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + b.name + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">' +
      '<span style="font-size:11px;color:var(--text-muted);">' + size + '</span>' +
      '<span style="font-size:12px;color:var(--accent-primary);">還原 ›</span>' +
    '</div>' +
  '</div>';
}

function updateSettingsLastSync() {
  var now = new Date();
  _lastSyncTimeStr = now.toLocaleString('zh-TW', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  });
  var el = document.getElementById('settings-last-sync');
  if (el) el.textContent = _lastSyncTimeStr;
}

async function clearAllData() {
  if (!confirm('確定要清除所有資料嗎？\n\n此操作將刪除所有記事和分類。\n此操作無法復原！')) return;
  if (!confirm('⚠️ 最後確認\n\n即將永久刪除所有記事和分類資料。\n確定要清除？')) return;
  try {
    DataStore.notes = [];
    DataStore.categories = [];
    await saveDataToDrive();
    localStorage.removeItem('cstn_local_data');
    localStorage.removeItem('cstn_file_id');
    localStorage.removeItem('cstn_shared_file_id');
    DataStore.driveFileId = null;
    if (typeof refreshAllViews === 'function') refreshAllViews();
    alert('✅ 所有資料已清除。');
    renderSettingsPage();
  } catch(err) {
    console.error('[Settings] 清除失敗:', err);
    alert('❌ 清除失敗：' + err.message);
  }
}
