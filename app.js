/**
 * app.js — 主入口
 * V1_1 修正：
 *   - switchView 同步更新 .sidebar-item 和 .bottom-nav-item
 *   - 更新橫幅：點更新後強制重新整理，關閉後記錄不再顯示
 *   - PWA 自動更新：SW 偵測到新版本時強制接管
 */

'use strict';

window.AppState = {
  currentView:   'calendar',
  currentFilter: 'all',
  searchQuery:   '',
  editingNoteId: null,
  pendingFiles:  [],
  selectedColor: '#6366f1',
  appVersion:    'V1_2'
};

const PRESET_COLORS = [
  '#6366f1','#8b5cf6','#ec4899',
  '#ef4444','#f59e0b','#22c55e',
  '#14b8a6','#3b82f6','#64748b'
];

// ══════════════════════════════════════
// DOMContentLoaded
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  initColorPicker();
  checkIOSInstallBanner();
  checkNotificationBanner();
  await registerServiceWorker();
  await loadAppVersion();
});

// ══════════════════════════════════════
// Service Worker 與 PWA 自動更新
// ══════════════════════════════════════
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register(
      '/CloudSync-Timer-Notes/service-worker.js'
    );
    console.log('[App] SW 已註冊:', reg.scope);

    // ── 偵測新版 SW 等待接管 ──
    // 當有新的 SW 進入 waiting 狀態，表示有新版本已下載完成
    function checkWaiting(reg) {
      if (reg.waiting) {
        // 通知使用者，並準備在同意後讓新 SW 立即接管
        showUpdateBanner('新版本已就緒');
      }
    }
    checkWaiting(reg);
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner('新版本已就緒');
        }
      });
    });

    // 當 SW 控制權切換（skipWaiting 完成），強制重新整理頁面
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    // 接收 SW 訊息
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'UPDATE_AVAILABLE') {
        showUpdateBanner(event.data.version);
      }
      if (event.data?.type === 'NOTIFICATION_CLICKED') {
        switchView('notes');
        setTimeout(() => highlightNote(event.data.noteId), 300);
      }
    });

    // 每 10 分鐘主動觸發 SW 檢查更新
    setInterval(async () => {
      try { await reg.update(); } catch(e) {}
    }, 10 * 60 * 1000);

  } catch (err) {
    console.warn('[App] SW 註冊失敗:', err);
  }
}

// ── 執行更新：通知 SW 跳過等待，頁面將自動重新整理 ──
function applyUpdate() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg?.waiting) {
        // 發訊息給等待中的新 SW，讓它立即 skipWaiting
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        // 沒有等待中的 SW，直接重新整理
        window.location.reload();
      }
    });
  } else {
    window.location.reload();
  }
}

// ── 關閉更新橫幅（本次 session 不再顯示） ──
function dismissUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (banner) banner.classList.remove('show');
}

async function loadAppVersion() {
  try {
    const res  = await fetch('/CloudSync-Timer-Notes/version.json?t=' + Date.now());
    const data = await res.json();
    AppState.appVersion = data.version;
    const el = document.getElementById('app-version');
    if (el) el.textContent = data.version;
  } catch { /* 忽略版本讀取失敗 */ }
}

// ══════════════════════════════════════
// 視圖切換（同步更新側欄 + 底部導覽）
// ══════════════════════════════════════
function switchView(viewName) {
  AppState.currentView = viewName;

  // 隱藏所有視圖
  document.querySelectorAll('.view-container').forEach(el => {
    el.style.display = 'none';
  });
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.style.display = 'block';

  // 更新頂部標題
  const titles = { notes: '所有記事', calendar: '行事曆', timers: '倒數計時' };
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = titles[viewName] || viewName;

  // 桌面側欄 active
  document.querySelectorAll('.sidebar-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // 手機底部導覽 active
  document.querySelectorAll('.bottom-nav-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // 需求6：搜尋列只在記事頁顯示，離開時自動隱藏並清空
  const searchBar   = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  const searchBtn   = document.getElementById('btn-search');
  if (viewName !== 'notes') {
    if (searchBar)   { searchBar.style.display = 'none'; }
    if (searchInput) { searchInput.value = ''; }
    AppState.searchQuery = '';
  }
  // 搜尋按鈕只在記事頁出現
  if (searchBtn) searchBtn.style.display = viewName === 'notes' ? 'inline-flex' : 'none';

  const addBtn = document.getElementById('btn-add-note');
  if (addBtn) addBtn.style.display = viewName === 'timers' ? 'none' : 'flex';

  if (viewName === 'notes')    renderNotes();
  if (viewName === 'calendar') renderCalendar();
  if (viewName === 'timers')   renderTimers();
}

// ══════════════════════════════════════
// Modal
// ══════════════════════════════════════
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  if (id === 'note-modal') resetNoteModal();
}

function closeModalOnOverlay(event, id) {
  if (event.target === event.currentTarget) closeModal(id);
}

// ══════════════════════════════════════
// 搜尋
// ══════════════════════════════════════
function toggleSearch() {
  // 需求6：搜尋改為獨立頁面，直接切換到 search 視圖
  switchView('search');
}

function handleSearch(value) {
  AppState.searchQuery = value.toLowerCase();
  // 根據目前視圖決定更新哪個 grid
  if (AppState.currentView === 'search') {
    renderSearchResults();
  } else {
    renderNotes();
  }
}

function renderSearchResults() {
  const grid = document.getElementById('search-results-grid');
  if (!grid) return;
  const q = AppState.searchQuery;
  if (!q) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">🔍</div><div class="empty-state-title">輸入關鍵字開始搜尋</div></div>';
    return;
  }
  const notes = (DataStore.notes || []).filter(n =>
    (n.title||'').toLowerCase().includes(q) ||
    (n.content||'').toLowerCase().includes(q)
  );
  if (notes.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">😶</div><div class="empty-state-title">找不到相關記事</div></div>';
    return;
  }
  grid.innerHTML = notes.map(buildNoteCard).join('');
}

// ══════════════════════════════════════
// 記事篩選
// ══════════════════════════════════════
function filterNotes(filter, btnEl) {
  AppState.currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderNotes();
}

// ══════════════════════════════════════
// 分類 Modal
// ══════════════════════════════════════
function openCategoryModal() {
  renderCategoryList();
  openModal('category-modal');
}

function initColorPicker() {
  const container = document.getElementById('color-picker');
  if (!container) return;
  container.innerHTML = '';
  PRESET_COLORS.forEach((color, i) => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (i === 0 ? ' selected' : '');
    swatch.style.background = color;
    swatch.dataset.color    = color;
    swatch.onclick = () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      AppState.selectedColor = color;
    };
    container.appendChild(swatch);
  });
  AppState.selectedColor = PRESET_COLORS[0];
}

// ══════════════════════════════════════
// 使用者選單
// ══════════════════════════════════════
function toggleUserMenu() {
  const menu = document.getElementById('user-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function openNotifySettings() {
  requestNotificationPermission();
  const menu = document.getElementById('user-menu');
  if (menu) menu.style.display = 'none';
}

// ══════════════════════════════════════
// iOS 加入主畫面提示
// ══════════════════════════════════════
function checkIOSInstallBanner() {
  const isIOS        = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || window.navigator.standalone;
  if (isIOS && !isStandalone) {
    document.getElementById('ios-install-banner')?.style.setProperty('display','block');
  }
}

// ══════════════════════════════════════
// 通知橫幅
// ══════════════════════════════════════
function checkNotificationBanner() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    document.getElementById('notification-banner')?.classList.remove('hidden');
  }
}

// ══════════════════════════════════════
// PWA 更新橫幅
// ══════════════════════════════════════
function showUpdateBanner(versionLabel) {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  const span = document.getElementById('update-banner-text');
  if (span) span.textContent = `🎉 ${versionLabel}，點擊更新！`;
  banner.classList.add('show');
}

// ══════════════════════════════════════
// 高亮指定記事
// ══════════════════════════════════════
function highlightNote(noteId) {
  const card = document.querySelector(`[data-note-id="${noteId}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.style.outline = '2px solid var(--accent-primary)';
    setTimeout(() => { card.style.outline = ''; }, 3000);
  }
}

// ══════════════════════════════════════
// 隱藏載入遮罩
// ══════════════════════════════════════
function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// ── closeSidebar（桌面側欄關閉，手機版需要） ──
function closeSidebar() {
  // 目前使用 fixed sidebar，手機版點選項目後不需要關閉
  // 保留此函式以備呼叫
}
