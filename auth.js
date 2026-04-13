/**
 * auth.js — Google OAuth 2.0 登入（完整版）
 * 使用 Google Identity Services Token 模式（Implicit Flow）
 */

'use strict';

const GOOGLE_CONFIG = {
  clientId: '715490566550-ics3mpm9jssfqq80600m6f6cnmq7jrp8.apps.googleusercontent.com',
  scopes: [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.appdata',
    'profile',
    'email'
  ].join(' ')
};

let tokenClient   = null;
let accessToken   = null;
let tokenExpiry   = 0;

// ── Token 刷新中的 Promise（避免同時發出多個刷新請求）──
let refreshingPromise = null;

// ══════════════════════════════════════
// 初始化（等待 GSI 腳本載入）
// ══════════════════════════════════════
function initAuth() {
  if (typeof google === 'undefined') {
    setTimeout(initAuth, 150);
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CONFIG.clientId,
    scope:     GOOGLE_CONFIG.scopes,
    callback:  handleTokenResponse
  });

  restoreSession();
}

// ── 嘗試恢復已存在的 Session ──
function restoreSession() {
  const savedToken  = localStorage.getItem('cstn_access_token');
  const savedExpiry = parseInt(localStorage.getItem('cstn_token_expiry') || '0');
  const savedUser   = localStorage.getItem('cstn_user_info');

  if (savedToken && savedExpiry > Date.now() + 5 * 60 * 1000) {
    accessToken = savedToken;
    tokenExpiry = savedExpiry;
    if (savedUser) {
      showApp(JSON.parse(savedUser));
    } else {
      fetchUserProfile();
    }
  } else {
    showLoginScreen();
  }
}

// ══════════════════════════════════════
// 登入 / 登出
// ══════════════════════════════════════
function handleGoogleLogin() {
  if (!tokenClient) { alert('Google 登入元件尚未載入，請稍後再試'); return; }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

async function handleTokenResponse(response) {
  if (response.error) {
    console.error('[Auth] 授權失敗:', response.error);
    alert('Google 授權失敗，請重試\n錯誤：' + response.error);
    return;
  }

  accessToken = response.access_token;
  tokenExpiry = Date.now() + response.expires_in * 1000;
  localStorage.setItem('cstn_access_token', accessToken);
  localStorage.setItem('cstn_token_expiry', String(tokenExpiry));

  console.log('[Auth] Token 取得成功');
  await fetchUserProfile();
}

async function fetchUserProfile() {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('取得使用者資料失敗 ' + res.status);
    const user = await res.json();
    localStorage.setItem('cstn_user_info', JSON.stringify(user));
    showApp(user);
  } catch (err) {
    console.error('[Auth]', err);
    showLoginScreen();
  }
}

async function showApp(user) {
  // 更新 UI 使用者資訊
  const avatar = document.getElementById('user-avatar');
  const name   = document.getElementById('user-name');
  const email  = document.getElementById('user-email');
  if (avatar) avatar.src = user.picture || '';
  if (name)   name.textContent  = user.name  || '使用者';
  if (email)  email.textContent = user.email || '';

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display          = 'flex';
  hideLoading();

  // 依序初始化 Drive → 讀取資料 → 渲染 UI
  try {
    await initDrive();
    await loadDataFromDrive();
  } catch (err) {
    console.error('[Auth] Drive 初始化失敗:', err);
    // 降級：仍顯示 App，資料為空
  }

  renderSidebarCategories();
  // 修正4：登入後預設顯示行事曆，讓使用者一眼看到近期事件
  switchView('calendar');
  startCountdownUpdater();
  scheduleAllNotifications();
}

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display          = 'none';
  hideLoading();
}

function handleLogout() {
  if (!confirm('確定要登出嗎？')) return;

  if (accessToken && typeof google !== 'undefined') {
    google.accounts.oauth2.revoke(accessToken, () => console.log('[Auth] Token 已撤銷'));
  }

  ['cstn_access_token','cstn_token_expiry','cstn_user_info',
   'cstn_file_id','cstn_folder_id'].forEach(k => localStorage.removeItem(k));

  accessToken = null;
  tokenExpiry = 0;
  DataStore.notes        = [];
  DataStore.categories   = [];
  DataStore.driveFileId  = null;
  DataStore.driveFolderId = null;

  showLoginScreen();
}

// ══════════════════════════════════════
// 取得有效 Access Token（供 drive.js 使用）
// ══════════════════════════════════════
async function getAccessToken() {
  // Token 仍有效（5 分鐘緩衝）
  if (accessToken && tokenExpiry > Date.now() + 5 * 60 * 1000) {
    return accessToken;
  }

  // 若已有刷新進行中，等待它完成
  if (refreshingPromise) return refreshingPromise;

  refreshingPromise = new Promise((resolve, reject) => {
    if (!tokenClient) { reject(new Error('Token client 未初始化')); return; }

    // 儲存原始 callback
    const originalCallback = tokenClient.callback;

    tokenClient.callback = (response) => {
      tokenClient.callback = originalCallback; // 還原
      refreshingPromise    = null;

      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      accessToken = response.access_token;
      tokenExpiry = Date.now() + response.expires_in * 1000;
      localStorage.setItem('cstn_access_token', accessToken);
      localStorage.setItem('cstn_token_expiry', String(tokenExpiry));
      resolve(accessToken);
    };

    // 靜默刷新（不顯示同意畫面）
    tokenClient.requestAccessToken({ prompt: '' });
  });

  return refreshingPromise;
}

// ── 綁定事件 ──
document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('btn-google-login');
  if (loginBtn) loginBtn.addEventListener('click', handleGoogleLogin);
  initAuth();
});
