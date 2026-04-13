/**
 * auth.js — V1_9
 * 修正：OAuth scope 改為 drive（完整存取），才能跨帳號讀寫共用資料夾
 */

'use strict';

const GOOGLE_CONFIG = {
  clientId: '715490566550-ics3mpm9jssfqq80600m6f6cnmq7jrp8.apps.googleusercontent.com',
  // 關鍵修正：從 drive.file 改為 drive
  // drive.file 只能存取「自己建立的檔案」，跨帳號共用必須用 drive scope
  scopes: [
    'https://www.googleapis.com/auth/drive',
    'profile',
    'email'
  ].join(' ')
};

let tokenClient      = null;
let accessToken      = null;
let tokenExpiry      = 0;
let refreshingPromise = null;

// ══════════════════════════════════════
// 初始化
// ══════════════════════════════════════
function initAuth() {
  if (typeof google === 'undefined') { setTimeout(initAuth, 150); return; }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CONFIG.clientId,
    scope:     GOOGLE_CONFIG.scopes,
    callback:  handleTokenResponse
  });

  restoreSession();
}

function restoreSession() {
  const savedToken  = localStorage.getItem('cstn_access_token');
  const savedExpiry = parseInt(localStorage.getItem('cstn_token_expiry') || '0');
  const savedUser   = localStorage.getItem('cstn_user_info');

  if (savedToken && savedExpiry > Date.now() + 5 * 60 * 1000) {
    accessToken = savedToken;
    tokenExpiry = savedExpiry;
    if (savedUser) showApp(JSON.parse(savedUser));
    else fetchUserProfile();
  } else {
    showLoginScreen();
  }
}

function handleGoogleLogin() {
  if (!tokenClient) { alert('Google 登入元件尚未載入，請稍後再試'); return; }
  // 重新授權時要求 consent，確保取得 drive scope
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
  console.log('[Auth] Token 取得成功，scope:', response.scope || '（未回傳）');
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
  const avatar = document.getElementById('user-avatar');
  const name   = document.getElementById('user-name');
  const email  = document.getElementById('user-email');
  if (avatar) avatar.src = user.picture || '';
  if (name)   name.textContent  = user.name  || '使用者';
  if (email)  email.textContent = user.email || '';

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display          = 'flex';
  hideLoading();

  try {
    await initDrive();
    await loadDataFromDrive();
  } catch (err) {
    console.error('[Auth] Drive 初始化失敗:', err);
  }

  renderSidebarCategories();
  updateShareUI();
  switchView('calendar');
  startCountdownUpdater();

  if (Notification.permission === 'granted') {
    startFrontendNotificationLoop();
  }
  scheduleAllNotifications();
  scheduleAutoBackup();

  if (DataStore.isSharedMode) {
    startSyncLoop();
  }
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
   'cstn_file_id','cstn_folder_id','cstn_shared_folder_id'].forEach(k => localStorage.removeItem(k));

  accessToken = null;
  tokenExpiry = 0;
  DataStore.notes        = [];
  DataStore.categories   = [];
  DataStore.driveFileId  = null;
  DataStore.driveFolderId = null;
  DataStore.isSharedMode  = false;

  if (DataStore.syncTimer) clearInterval(DataStore.syncTimer);

  showLoginScreen();
}

// ══════════════════════════════════════
// 取得有效 Access Token
// ══════════════════════════════════════
async function getAccessToken() {
  if (accessToken && tokenExpiry > Date.now() + 5 * 60 * 1000) return accessToken;
  if (refreshingPromise) return refreshingPromise;

  refreshingPromise = new Promise((resolve, reject) => {
    if (!tokenClient) { reject(new Error('Token client 未初始化')); return; }
    const origCb = tokenClient.callback;
    tokenClient.callback = response => {
      tokenClient.callback = origCb;
      refreshingPromise    = null;
      if (response.error) { reject(new Error(response.error)); return; }
      accessToken = response.access_token;
      tokenExpiry = Date.now() + response.expires_in * 1000;
      localStorage.setItem('cstn_access_token', accessToken);
      localStorage.setItem('cstn_token_expiry', String(tokenExpiry));
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
  return refreshingPromise;
}

document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('btn-google-login');
  if (loginBtn) loginBtn.addEventListener('click', handleGoogleLogin);
  initAuth();
});
