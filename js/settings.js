// 需求2：最後同步時間（跨渲染保持）
let _lastSyncTimeStr = '—';

/**
 * settings.js — V1_6
 * 需求4: 設定頁面（共用帳號、儲存帳號、登入帳號、登出）
 * 需求6: 手動備份 / 資料還原
 * 需求7: 列出最近 10 筆備份
 */

'use strict';

// ═══════════════════════════════════════
// 渲染設定頁面
// ═══════════════════════════════════════
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

  container.innerHTML = `
    <!-- ── 帳號資訊區塊 ── -->
    <div class="settings-section">
      <div class="settings-section-title">👤 帳號資訊</div>

      <div class="settings-row">
        <div class="settings-label">目前登入帳號</div>
        <div class="settings-value">${user.email || '未登入'}</div>
      </div>

      <div class="settings-row">
        <div class="settings-label">資料儲存帳號</div>
        <div class="settings-value">${storageOwner}</div>
      </div>

      <div class="settings-row">
        <div class="settings-label">資料夾 ID</div>
        <div class="settings-value" style="font-family:monospace;font-size:11px;word-break:break-all;">
          ${myFolderId}
          <button class="btn btn-secondary btn-sm" style="margin-left:8px;font-size:10px;"
                  onclick="copyText('${myFolderId}')">複製</button>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-label">共用模式</div>
        <div class="settings-value">
          ${DataStore.isSharedMode
            ? `<span style="color:var(--accent-primary);">🔗 共用中</span>`
            : `<span style="color:var(--success);">👤 個人模式</span>`}
        </div>
      </div>

      <button class="btn btn-danger" onclick="handleLogout()" style="margin-top:12px;width:100%;">
        🚪 登出
      </button>
    </div>

    <!-- ── 共用設定 ── -->
    <div class="settings-section">
      <div class="settings-section-title">🔗 共用行事曆設定</div>
      <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--text-secondary);line-height:1.7;">
        <strong style="color:var(--text-primary);">📋 共用流程說明</strong><br/>
        1. <strong>A 帳號</strong>：登入後複製下方「我的資料夾 ID」<br/>
        2. <strong>A 帳號</strong>：進入 <a href="https://drive.google.com" target="_blank" style="color:var(--accent-hover);">Google Drive</a>，找到「#CloudSync Timer Notes」資料夾 → 右鍵「共用」→ 選「知道連結的人可以編輯」<br/>
        3. <strong>B 帳號</strong>：登入後在下方輸入 A 的資料夾 ID 並點「連接」<br/>
        <small style="color:var(--text-muted);">※ 若略過步驟2直接連接，會出現「無法存取」錯誤</small>
      </div>

      <div class="form-group">
        <label class="form-label">我的資料夾 ID（分享給他人）</label>
        <div style="display:flex;gap:8px;">
          <input type="text" class="form-input" id="settings-my-folder-id"
                 value="${myFolderId}" readonly style="font-family:monospace;font-size:11px;"/>
          <button class="btn btn-secondary" onclick="copyText(document.getElementById('settings-my-folder-id').value)"
                  style="flex-shrink:0;">複製</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">輸入他人的資料夾 ID（加入共用）</label>
        <div style="display:flex;gap:8px;">
          <input type="text" class="form-input" id="settings-shared-folder-input"
                 value="${sharedId || ''}" placeholder="貼上資料夾 ID…"
                 style="font-family:monospace;font-size:11px;"/>
          <button class="btn btn-primary" onclick="applySharedFolderFromSettings()"
                  id="btn-join-shared" style="flex-shrink:0;">連接</button>
        </div>
      </div>

      ${DataStore.isSharedMode ? `
        <button class="btn btn-danger" onclick="leaveSharedFolderFromSettings()"
                style="width:100%;margin-top:4px;">
          離開共用，切回個人資料夾
        </button>` : ''}
    </div>

    <!-- ── 備份與還原 ── -->
    <div class="settings-section">
      <div class="settings-section-title">💾 備份與還原</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <button class="btn btn-primary" onclick="doManualBackup()">
          📥 立即手動備份
        </button>
        <button class="btn btn-secondary" onclick="loadAndShowBackups()">
          🕐 查看備份記錄
        </button>
      </div>

      <div id="backup-list-container">
        <!-- 備份列表動態插入 -->
      </div>
    </div>

    <!-- ── 外觀設定 ── -->
    <div class="settings-section">
      <div class="settings-section-title">🎨 外觀設定</div>
      <div class="settings-row">
        <div class="settings-label">主題模式</div>
        <div class="settings-value">
          <button class="btn btn-secondary" onclick="toggleTheme()" id="settings-theme-btn">
            ${(window.AppState && AppState.theme === 'dark') ? '切換為亮色' : '切換為暗色'}
          </button>
        </div>
      </div>
    </div>

    <!-- ── App 資訊 ── -->
    <div class="settings-section">
      <div class="settings-section-title">ℹ️ 應用程式資訊</div>
      <div class="settings-row">
        <div class="settings-label">版本</div>
        <div class="settings-value">${(window.AppState && AppState.appVersion) || 'V2_6'}</div>
      </div>
      <div class="settings-row">
        <div class="settings-label">同步間隔</div>
        <div class="settings-value">每 5 秒自動同步</div>
      </div>
      <div class="settings-row">
        <div class="settings-label">自動備份</div>
        <div class="settings-value">每天 23:59:59 自動備份</div>
      </div>
      <!-- 需求5：最後同步時間 -->
      <div class="settings-row">
        <div class="settings-label">最後同步時間</div>
        <div class="settings-value" id="settings-last-sync">${_lastSyncTimeStr}</div>
      </div>
      <div class="settings-row">
        <div class="settings-label">資料筆數</div>
        <div class="settings-value">${(window.DataStore && DataStore.notes||[]).length || 0} 筆記事 / ${(window.DataStore && DataStore.categories||[]).length || 0} 個分類</div>
      </div>
    </div>
  `;
}

// ── 在設定頁連接共用資料夾 ──
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
  if (!confirm('確定離開共用資料夾，切換回個人資料夾？')) return;
  await leaveSharedFolder();
  alert('✅ 已切換回個人資料夾');
  renderSettingsPage();
}

// ── 手動備份 ──
async function doManualBackup() {
  const btn = event?.target;
  if (btn) btn.textContent = '備份中…';
  try {
    await performBackup('manual');
    await loadAndShowBackups(); // 備份後刷新列表
  } finally {
    if (btn) btn.textContent = '📥 立即手動備份';
  }
}

// ═══════════════════════════════════════
// 需求4&7: 備份清單開啟 Modal
// ═══════════════════════════════════════
async function loadAndShowBackups() {
  // 開啟備份 Modal
  openModal('backup-modal');
  const container = document.getElementById('backup-modal-list');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:24px;">載入備份記錄中…</div>';

  try {
    const backups = await listBackupFiles();
    if (!backups.length) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:24px;">尚無備份記錄<br/><small>請先執行手動備份或等待自動備份</small></div>';
      return;
    }
    container.innerHTML = backups.map(b => buildBackupRow(b)).join('');
  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger);font-size:13px;padding:16px;">載入失敗：${err.message}</div>`;
  }
}

function buildBackupRow(b) {
  const dt   = new Date(b.modified);
  const dtStr = `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')} ${dt.toTimeString().slice(0,8)}`;
  const size = b.size > 1024
    ? `${(b.size/1024).toFixed(1)} KB`
    : `${b.size} B`;
  const typeColor = b.type === 'auto' ? 'var(--accent-primary)' : 'var(--success)';
  const typeLabel = b.type === 'auto' ? '自動備份' : '手動備份';

  return `
    <div class="backup-row" onclick="restoreFromBackup('${b.id}', '${b.name.replace(/'/g,'\\\'')}')"
         title="點擊還原此備份">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
        <span class="backup-type-badge" style="background:${typeColor}20;color:${typeColor};border:1px solid ${typeColor}40;">
          ${typeLabel}
        </span>
        <div style="min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);">${dtStr}</div>
          <div style="font-size:10px;color:var(--text-muted);">${b.name}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
        <span style="font-size:11px;color:var(--text-muted);">${size}</span>
        <span style="font-size:12px;color:var(--accent-primary);">還原 ›</span>
      </div>
    </div>
  `;
}

// 複製文字工具
function copyText(text) {
  navigator.clipboard.writeText(text)
    .then(() => alert('✅ 已複製！'))
    .catch(() => {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      alert('✅ 已複製！');
    });
}


// 需求2（V1_8）：更新最後同步時間（儲存變數，不依賴 DOM ID）
function updateSettingsLastSync() {
  const now = new Date();
  _lastSyncTimeStr = now.toLocaleString('zh-TW', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  });
  // 若設定頁目前開著，直接更新 DOM
  const el = document.getElementById('settings-last-sync');
  if (el) el.textContent = _lastSyncTimeStr;
}


// ── 清除所有資料（需兩次確認）──
async function clearAllData() {
  // 第一次確認
  if (!confirm('確定要清除所有資料嗎？\n\n此操作將刪除所有記事和分類。\n\n此操作無法復原！')) return;

  // 第二次確認（更強烈的警告）
  if (!confirm('⚠️ 最後確認\n\n您即將永久刪除所有記事和分類資料。\n\n請再次確認：確定要清除所有資料？')) return;

  try {
    // 清除 DataStore
    DataStore.notes      = [];
    DataStore.categories = [];

    // 清除 Drive 資料（覆蓋為空）
    await saveDataToDrive();

    // 清除本機快取
    localStorage.removeItem('cstn_local_data');
    localStorage.removeItem('cstn_file_id');
    localStorage.removeItem('cstn_shared_file_id');
    DataStore.driveFileId = null;

    // 刷新所有視圖
    if (typeof refreshAllViews === 'function') refreshAllViews();

    alert('✅ 所有資料已清除完成。');
    renderSettingsPage();
  } catch(err) {
    console.error('[Settings] 清除資料失敗:', err);
    alert('❌ 清除失敗：' + err.message + '\n\n本機資料已清除，雲端資料可能仍存在。');
  }
}
