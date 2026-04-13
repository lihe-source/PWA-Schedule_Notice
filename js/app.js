/**
 * app.js — V5_0
 * Optimized: version update, timers in bottom nav, smoother UX
 */

'use strict';

window.AppState = {
  currentView:     'calendar',
  currentFilter:   'all',
  searchQuery:     '',
  editingNoteId:   null,
  pendingFiles:    [],
  selectedColor:   '#6366f1',
  appVersion:      'V5_0',
  theme:           'light',
  batchDeleteMode: false,
  batchDeleteIds:  []
};

const PRESET_COLORS = [
  '#6366f1','#8b5cf6','#ec4899',
  '#ef4444','#f59e0b','#22c55e',
  '#14b8a6','#3b82f6','#64748b'
];

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(localStorage.getItem('cstn_theme') || 'light');
  initColorPicker();
  checkIOSInstallBanner();
  checkNotificationBanner();
  await registerServiceWorker();
  await loadAppVersion();
});

// ══ Theme ══
function applyTheme(theme) {
  AppState.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('cstn_theme', theme);
  ['btn-theme-toggle','btn-theme-toggle-sidebar'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  });
  const sb = document.getElementById('settings-theme-btn');
  if (sb) sb.textContent = theme === 'dark' ? '☀️ 切換為亮色' : '🌙 切換為暗色';
}

function toggleTheme() {
  document.documentElement.classList.add('theme-switching');
  applyTheme(AppState.theme === 'dark' ? 'light' : 'dark');
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.documentElement.classList.remove('theme-switching')
  ));
}

// ══ Service Worker ══
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/CloudSync-Timer-Notes/service-worker.js');
    const checkW = r => { if (r.waiting) showUpdateBanner('新版本已就緒'); };
    checkW(reg);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner('新版本已就緒');
      });
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) { refreshing = true; window.location.reload(); }
    });
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'UPDATE_AVAILABLE') showUpdateBanner(e.data.version);
      if (e.data?.type === 'NOTIFICATION_CLICKED') {
        switchView('notes');
        setTimeout(() => highlightNote(e.data.noteId), 300);
      }
    });
    setInterval(async () => { try { await reg.update(); } catch {} }, 10*60*1000);
  } catch (err) { console.warn('[SW] 註冊失敗:', err); }
}

function applyUpdate() {
  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    else window.location.reload();
  });
}
function dismissUpdateBanner() { document.getElementById('update-banner')?.classList.remove('show'); }

async function loadAppVersion() {
  try {
    const r = await fetch('/CloudSync-Timer-Notes/version.json?t=' + Date.now());
    const d = await r.json();
    AppState.appVersion = d.version;
    const el = document.getElementById('app-version');
    if (el) el.textContent = d.version;
    const lv = document.getElementById('login-version');
    if (lv) lv.textContent = d.version;
  } catch {}
}

// ══ View Switch ══
function switchView(viewName) {
  AppState.currentView = viewName;
  document.querySelectorAll('.view-container').forEach(el => el.style.display = 'none');
  const target = document.getElementById('view-' + viewName);
  if (target) target.style.display = 'block';

  const titles = { notes:'所有記事', calendar:'行事曆', timers:'倒數計時', settings:'設定' };
  const te = document.getElementById('topbar-title');
  if (te) te.textContent = titles[viewName] || viewName;

  document.querySelectorAll('.sidebar-item[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === viewName));
  document.querySelectorAll('.bottom-nav-item[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === viewName));

  const sb = document.getElementById('search-bar');
  const si = document.getElementById('search-input');
  const sBtn = document.getElementById('btn-search');
  if (viewName !== 'notes') {
    if (sb) sb.style.display = 'none';
    if (si) si.value = '';
    AppState.searchQuery = '';
  }
  if (sBtn) sBtn.style.visibility = viewName === 'notes' ? 'visible' : 'hidden';

  const addBtn = document.getElementById('btn-add-note');
  if (addBtn) addBtn.style.visibility = (viewName === 'timers' || viewName === 'settings') ? 'hidden' : 'visible';

  if (viewName === 'notes')    renderNotes();
  if (viewName === 'calendar') renderCalendar();
  if (viewName === 'timers')   renderTimers();
  if (viewName === 'settings') renderSettingsPage();
}

// ══ Modal ══
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  if (id === 'note-modal') resetNoteModal();
}
function closeModalOnOverlay(e, id) { if (e.target === e.currentTarget) closeModal(id); }

// ══ Search ══
function toggleSearch() {
  const bar = document.getElementById('search-bar');
  const inp = document.getElementById('search-input');
  if (!bar) return;
  if (bar.style.display === 'none') { bar.style.display = 'block'; inp?.focus(); }
  else { bar.style.display = 'none'; AppState.searchQuery = ''; if (inp) inp.value = ''; renderNotes(); }
}
function handleSearch(v) { AppState.searchQuery = v.toLowerCase(); renderNotes(); }
function filterNotes(f, btn) {
  AppState.currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderNotes();
}

// ══ Category Modal ══
function openCategoryModal() { renderCategoryList(); openModal('category-modal'); }
function initColorPicker() {
  const c = document.getElementById('color-picker');
  if (!c) return;
  c.innerHTML = '';
  PRESET_COLORS.forEach((color, i) => {
    const s = document.createElement('div');
    s.className = 'color-swatch' + (i===0?' selected':'');
    s.style.background = color;
    s.dataset.color = color;
    s.onclick = () => {
      document.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('selected'));
      s.classList.add('selected');
      AppState.selectedColor = color;
    };
    c.appendChild(s);
  });
  AppState.selectedColor = PRESET_COLORS[0];
}

// ══ User Menu ══
function toggleUserMenu() {
  const m = document.getElementById('user-menu');
  if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

// ══ iOS / Notification Banner ══
function checkIOSInstallBanner() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isIOS && !isPWA) document.getElementById('ios-install-banner')?.style.setProperty('display','block');
}
function checkNotificationBanner() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') document.getElementById('notification-banner')?.classList.remove('hidden');
}

// ══ Update Banner ══
function showUpdateBanner(label) {
  const b = document.getElementById('update-banner');
  if (!b) return;
  const s = document.getElementById('update-banner-text');
  if (s) s.textContent = '🎉 ' + label;
  b.classList.add('show');
}

function highlightNote(noteId) {
  const c = document.querySelector('[data-note-id="' + noteId + '"]');
  if (c) { c.scrollIntoView({behavior:'smooth',block:'center'}); c.style.outline='2px solid var(--accent-primary)'; setTimeout(()=>{c.style.outline='';},3000); }
}
function hideLoading() { document.getElementById('loading-overlay')?.classList.add('hidden'); }

function copyText(text) {
  navigator.clipboard.writeText(text)
    .then(() => alert('✅ 已複製！'))
    .catch(() => { const e=document.createElement('textarea'); e.value=text; document.body.appendChild(e); e.select(); document.execCommand('copy'); document.body.removeChild(e); alert('✅ 已複製！'); });
}
