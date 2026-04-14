/**
 * drive.js — V5_0
 * 需求2: refreshAllViews 改用 safeRefresh() 安全呼叫，
 *        避免 drive.js 在 notes.js 尚未定義時報錯
 */

'use strict';

// 安全呼叫刷新（notes.js 可能晚一些才定義）
function safeRefresh() {
  if (typeof refreshAllViews === 'function') refreshAllViews();
}



const DRIVE_API    = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME  = '#CloudSync Timer Notes';   // 需求3
const DATA_FILE    = 'cstn_data.json';
const FOLDER_MIME  = 'application/vnd.google-apps.folder';
const JSON_MIME    = 'application/json';
const SHARED_KEY   = 'cstn_shared_folder_id';
const SYNC_MS      = 5000;  // Drive API 輪詢間隔（5秒）

window.DataStore = {
  notes:          [],
  categories:     [],
  driveFileId:    null,
  driveFolderId:  null,
  saveTimer:      null,
  syncTimer:      null,
  tickTimer:      null,  // 1秒 UI 倒數計時器
  isSharedMode:   false,
  lastModified:   null,
  lastSyncTime:   null,  // 上次成功同步的時間戳
  currentUser:    null,
  isSaving:       false,
  hasPendingSave: false
};

// ── 通用 Drive API 請求 ──
async function driveRequest(path, options = {}) {
  const token = await getAccessToken();
  const sep   = path.includes('?') ? '&' : '?';
  const url   = (path.startsWith('http') ? path : `${DRIVE_API}${path}`)
              + sep + 'supportsAllDrives=true';
  const res   = await fetch(url, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, ...(options.headers||{}) }
  });
  if (!res.ok) {
    const t = await res.text().catch(()=>'');
    throw new Error(`Drive ${res.status}: ${t}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ══════════════════════════════════════
// 初始化
// ══════════════════════════════════════
async function initDrive() {
  updateSyncStatus('syncing', '初始化…');
  const ui = localStorage.getItem('cstn_user_info');
  DataStore.currentUser = ui ? JSON.parse(ui).email : null;

  try {
    const sharedId = localStorage.getItem(SHARED_KEY);
    if (sharedId) {
      DataStore.driveFolderId = sharedId;
      DataStore.isSharedMode  = true;
      DataStore.driveFileId   = localStorage.getItem('cstn_shared_file_id') || null;
      console.log('[Drive] 共用模式:', sharedId);
      startSyncLoop();
      return;
    }

    let folderId = localStorage.getItem('cstn_folder_id');
    if (folderId) {
      try {
        const f = await driveRequest(`/files/${folderId}?fields=id,trashed`);
        if (f.trashed) throw new Error('已刪除');
      } catch {
        folderId = null;
        localStorage.removeItem('cstn_folder_id');
        localStorage.removeItem('cstn_file_id');
        DataStore.driveFileId = null;
      }
    }
    if (!folderId) {
      folderId = await findOrCreateFolder();
      localStorage.setItem('cstn_folder_id', folderId);
    }
    DataStore.driveFolderId = folderId;
    DataStore.isSharedMode  = false;
    DataStore.driveFileId   = localStorage.getItem('cstn_file_id') || null;
    console.log('[Drive] 個人模式:', folderId);
  } catch (err) {
    console.error('[Drive] 初始化失敗:', err);
    updateSyncStatus('error', '初始化失敗');
    throw err;
  }
}

// ── 建立資料夾並設定公開寫入權限 ──
async function findOrCreateFolder() {
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`);
  const r = await driveRequest(`/files?q=${q}&fields=files(id)&spaces=drive`);
  if (r.files?.length) return r.files[0].id;

  const folder = await driveRequest('/files', {
    method:  'POST',
    headers: { 'Content-Type': JSON_MIME },
    body:    JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME })
  });

  // 設定「任何知道連結的人可以寫入」
  try {
    const token = await getAccessToken();
    await fetch(`${DRIVE_API}/files/${folder.id}/permissions?supportsAllDrives=true`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': JSON_MIME },
      body:    JSON.stringify({ role: 'writer', type: 'anyone' })
    });
    console.log('[Drive] 資料夾已設為公開可寫');
  } catch(e) {
    console.warn('[Drive] 設定共用權限失敗:', e.message);
  }

  return folder.id;
}

// ══════════════════════════════════════
// 共用連接
// ══════════════════════════════════════
function getMyFolderId() {
  return DataStore.driveFolderId || localStorage.getItem('cstn_folder_id') || null;
}

async function joinSharedFolder(folderId) {
  const id = (folderId||'').trim();
  if (!id || id.length < 10) throw new Error('無效的資料夾 ID');

  // 驗證：嘗試查詢資料夾內的資料檔（B 帳號需要 anyoneWithLink writer 權限）
  const token = await getAccessToken();
  const q     = encodeURIComponent(`name='${DATA_FILE}' and '${id}' in parents and trashed=false`);
  const testRes = await fetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,modifiedTime)&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  if (!testRes.ok) {
    const s = testRes.status;
    if (s === 403) throw new Error('權限不足。請確認 A 帳號的資料夾已設為「知道連結的人可以編輯」\n\nGoogle Drive → 找到「#CloudSync Timer Notes」→ 右鍵共用 → 一般存取改為「知道連結的人」→ 角色改為「編輯者」');
    if (s === 404) throw new Error('找不到此資料夾，請確認 ID 是否正確');
    throw new Error(`HTTP ${s}`);
  }

  const result  = await testRes.json();
  const fileId  = result.files?.[0]?.id || null;

  if (DataStore.syncTimer) clearInterval(DataStore.syncTimer);
  if (DataStore.tickTimer) clearInterval(DataStore.tickTimer);

  localStorage.setItem(SHARED_KEY, id);
  localStorage.removeItem('cstn_file_id');
  if (fileId) {
    localStorage.setItem('cstn_shared_file_id', fileId);
  }

  DataStore.driveFolderId = id;
  DataStore.driveFileId   = fileId;
  DataStore.isSharedMode  = true;
  DataStore.lastModified  = null; // 強制重載

  await loadDataFromDrive();
  safeRefresh();
  updateShareUI();
  startSyncLoop();
}

async function leaveSharedFolder() {
  if (DataStore.syncTimer) clearInterval(DataStore.syncTimer);
  localStorage.removeItem(SHARED_KEY);
  localStorage.removeItem('cstn_shared_file_id');
  DataStore.isSharedMode  = false;
  DataStore.driveFolderId = null;
  DataStore.driveFileId   = null;
  DataStore.lastModified  = null;
  await initDrive();
  await loadDataFromDrive();
  safeRefresh();
  updateShareUI();
}

function updateShareUI() {
  const badge = document.getElementById('share-mode-badge');
  if (badge) badge.style.display = DataStore.isSharedMode ? 'flex' : 'none';
  if (typeof renderSettingsPage === 'function' && AppState?.currentView === 'settings') {
    renderSettingsPage();
  }
}

// ══════════════════════════════════════
// 定期同步（3 秒 Drive 輪詢 + 1 秒 UI 倒數）
// ══════════════════════════════════════
function startSyncLoop() {
  if (DataStore.syncTimer) clearInterval(DataStore.syncTimer);
  if (DataStore.tickTimer) clearInterval(DataStore.tickTimer);

  // Drive API 輪詢：每 3 秒
  DataStore.syncTimer = setInterval(async () => {
    if (DataStore.isSaving) return;
    try { await syncFromDrive(); }
    catch (e) { console.warn('[Sync]', e.message); }
  }, SYNC_MS);

  // UI 倒數：每 1 秒更新「X 秒前同步」
  DataStore.tickTimer = setInterval(() => {
    if (DataStore.lastSyncTime && !DataStore.isSaving && !DataStore.hasPendingSave) {
      const sec = Math.round((Date.now() - DataStore.lastSyncTime) / 1000);
      const dot = document.getElementById('sync-dot');
      if (dot && dot.className.includes('synced')) {
        const label = document.getElementById('sync-text');
        if (label) label.textContent = sec <= 1 ? '已同步' : `${sec}秒前同步`;
      }
    }
    updateUploadBtn();
  }, 1000);

  // Page Visibility：切回前台立即同步
  if (!DataStore._visibilityBound) {
    DataStore._visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !DataStore.isSaving) {
        syncFromDrive().catch(e => console.warn('[Visibility sync]', e.message));
      }
    });
  }

  console.log('[Drive] 同步啟動，輪詢', SYNC_MS/1000, '秒，UI 每秒更新');
}

// 需求2：手動立即同步
// ── 上傳按鈕狀態更新 ──
function updateUploadBtn() {
  const btn = document.getElementById('btn-upload');
  if (!btn) return;
  const pending = DataStore.hasPendingSave || !!DataStore.saveTimer || DataStore.isSaving;
  btn.disabled = !pending;
  btn.classList.toggle('has-pending', pending);
  btn.textContent = DataStore.isSaving ? '上傳中…' : '↑ 立即同步';
}

// ── 立即同步（僅 Push，有本地變更才可用）──
async function uploadToDrive() {
  if (!DataStore.hasPendingSave && !DataStore.saveTimer && !DataStore.isSaving) return;
  const btn = document.getElementById('btn-upload');
  if (btn) { btn.disabled = true; btn.textContent = '上傳中…'; }
  try {
    if (DataStore.saveTimer) { clearTimeout(DataStore.saveTimer); DataStore.saveTimer = null; }
    await saveDataToDrive();
    updateSyncStatus('synced', '已上傳');
  } catch(e) {
    updateSyncStatus('error', '上傳失敗');
    console.error('[uploadToDrive]', e);
  } finally {
    updateUploadBtn();
  }
}

// ── 重新整理（僅 Pull，強制從 Drive 讀取）──
async function refreshFromDrive() {
  const btn = document.getElementById('btn-refresh');
  if (btn) { btn.disabled = true; btn.textContent = '讀取中…'; }
  try {
    DataStore.lastModified = null; // 強制重載
    await loadDataFromDrive();
    safeRefresh();
    scheduleAllNotifications?.();
  } catch(e) {
    updateSyncStatus('error', '讀取失敗');
    console.error('[refreshFromDrive]', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↻ 重新整理'; }
  }
}

// 舊名稱相容（SW message 可能呼叫）
async function manualSync() { await refreshFromDrive(); }

async function syncFromDrive() {
  if (!DataStore.driveFolderId) return;
  // 若有待儲存的本地變更，跳過此次自動同步，避免覆蓋尚未上傳的資料
  if (DataStore.hasPendingSave || DataStore.isSaving) return;

  // 若還沒有 fileId，先完整載入
  if (!DataStore.driveFileId) {
    await loadDataFromDrive();
    return;
  }

  const token   = await getAccessToken();
  const metaRes = await fetch(
    `${DRIVE_API}/files/${DataStore.driveFileId}?fields=modifiedTime&supportsAllDrives=true`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!metaRes.ok) {
    // file 可能被刪，重新查找
    DataStore.driveFileId = null;
    await loadDataFromDrive();
    return;
  }
  const meta = await metaRes.json();
  if (!meta?.modifiedTime) return;

  // 比較修改時間
  if (meta.modifiedTime === DataStore.lastModified) return;

  console.log('[Sync] 偵測到更新，重載資料');
  await loadDataFromDrive();
  // 需求1：同步後刷新行事曆和記事
  safeRefresh();
  scheduleAllNotifications?.();
}

// ══════════════════════════════════════
// 讀取資料
// ══════════════════════════════════════
async function loadDataFromDrive() {
  updateSyncStatus('syncing', '讀取中…');
  try {
    const token = await getAccessToken();
    const q     = encodeURIComponent(
      `name='${DATA_FILE}' and '${DataStore.driveFolderId}' in parents and trashed=false`
    );
    const listRes = await fetch(
      `${DRIVE_API}/files?q=${q}&fields=files(id,modifiedTime)&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!listRes.ok) throw new Error('查詢失敗 ' + listRes.status);
    const result = await listRes.json();

    if (!result.files?.length) {
      DataStore.notes      = [];
      DataStore.categories = getDefaultCategories();
      updateSyncStatus('synced', DataStore.isSharedMode ? '共用（無資料）' : '已就緒');
      updateSettingsLastSync?.();
      return;
    }

    const file = result.files[0];
    DataStore.driveFileId  = file.id;
    DataStore.lastModified = file.modifiedTime;

    // 依模式儲存不同的 key
    if (DataStore.isSharedMode) {
      localStorage.setItem('cstn_shared_file_id', file.id);
    } else {
      localStorage.setItem('cstn_file_id', file.id);
    }

    const fileRes = await fetch(
      `${DRIVE_API}/files/${file.id}?alt=media&supportsAllDrives=true`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!fileRes.ok) throw new Error('下載失敗 ' + fileRes.status);

    const data = await fileRes.json();
    DataStore.notes      = data.notes      || [];
    DataStore.categories = data.categories || getDefaultCategories();
    localStorage.setItem('cstn_local_data', JSON.stringify(data));
    updateSyncStatus('synced', DataStore.isSharedMode ? '共用已同步' : '已同步');
    updateSettingsLastSync?.();
    if (typeof onNotesUpdated === 'function') onNotesUpdated(); // 同步到 SW IndexedDB
  } catch (err) {
    console.error('[Drive] 讀取失敗:', err);
    const local = localStorage.getItem('cstn_local_data');
    if (local) {
      try { const p=JSON.parse(local); DataStore.notes=p.notes||[]; DataStore.categories=p.categories||getDefaultCategories(); } catch{}
    } else {
      DataStore.notes=[]; DataStore.categories=getDefaultCategories();
    }
    updateSyncStatus('error', '讀取失敗');
  }
}

// ══════════════════════════════════════
// 儲存資料（修正：共用模式下 B 帳號可寫入）
// ══════════════════════════════════════
function scheduleSave() {
  if (DataStore.saveTimer) clearTimeout(DataStore.saveTimer);
  DataStore.hasPendingSave = true;
  updateSyncStatus('syncing', '待儲存…');
  updateUploadBtn();
  DataStore.saveTimer = setTimeout(saveDataToDrive, 1500);
}

async function saveDataToDrive() {
  if (DataStore.isSaving) return;
  DataStore.hasPendingSave = false;
  DataStore.saveTimer = null;
  DataStore.isSaving = true;
  updateSyncStatus('syncing', '儲存中…');

  const payload = {
    version:    2,
    updatedAt:  new Date().toISOString(),
    updatedBy:  DataStore.currentUser || 'unknown',
    categories: DataStore.categories,
    notes:      DataStore.notes
  };
  const json = JSON.stringify(payload, null, 2);

  try {
    if (DataStore.driveFileId) {
      // 更新現有檔案（共用模式下 B 帳號用 anyoneWithLink writer 也可以 PATCH）
      await updateDriveFile(DataStore.driveFileId, json);
    } else {
      // 在共用資料夾建立新檔案
      const newId = await createDriveFile(DATA_FILE, json, DataStore.driveFolderId);
      DataStore.driveFileId = newId;
      if (DataStore.isSharedMode) {
        localStorage.setItem('cstn_shared_file_id', newId);
      } else {
        localStorage.setItem('cstn_file_id', newId);
      }
    }

    // 重置 lastModified，讓其他客戶端在下次同步時強制重載
    DataStore.lastModified = new Date().toISOString();
    localStorage.setItem('cstn_local_data', json);
    updateSyncStatus('synced', DataStore.isSharedMode ? '共用已儲存' : '已同步');
    updateSettingsLastSync?.();
  } catch (err) {
    console.error('[Drive] 儲存失敗:', err);
    localStorage.setItem('cstn_local_data', json);
    updateSyncStatus('error', '雲端儲存失敗 - ' + err.message.slice(0,30));
  } finally {
    DataStore.isSaving = false;
    updateUploadBtn();
  }
}

// ══════════════════════════════════════
// 自動備份
// ══════════════════════════════════════
function scheduleAutoBackup() {
  const now=new Date(), target=new Date(now);
  target.setHours(23,59,59,0);
  if (target<=now) target.setDate(target.getDate()+1);
  setTimeout(async()=>{ await performBackup('auto'); scheduleAutoBackup(); }, target-now);
}

async function performBackup(type='manual') {
  if (!DataStore.driveFolderId) { if(type==='manual') alert('尚未連接 Drive'); return null; }
  const now=new Date();
  const label=type==='auto'?'自動備份':'手動備份';
  const ts=now.toISOString().slice(0,19).replace('T',' ').replace(/:/g,'-');
  const fileName=`[${label}] ${ts}.json`;
  const payload={version:2,backupType:type,backupTime:now.toISOString(),backupBy:DataStore.currentUser||'unknown',categories:DataStore.categories,notes:DataStore.notes};
  try {
    await createDriveFile(fileName, JSON.stringify(payload,null,2), DataStore.driveFolderId);
    if(type==='manual') alert(`✅ 手動備份完成！\n${fileName}`);
    return fileName;
  } catch(err) {
    if(type==='manual') alert('❌ 備份失敗：'+err.message);
    return null;
  }
}

// 需求4：備份列表支援共用模式（includeItemsFromAllDrives）
async function listBackupFiles() {
  if (!DataStore.driveFolderId) return [];
  const token = await getAccessToken();
  const q = encodeURIComponent(`'${DataStore.driveFolderId}' in parents and trashed=false and name contains '備份'`);
  const res = await fetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime desc&pageSize=10&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const r = await res.json();
  return (r.files||[]).map(f=>({
    id: f.id, name: f.name,
    size: parseInt(f.size||0),
    modified: f.modifiedTime,
    type: f.name.includes('自動備份')?'auto':'manual'
  }));
}

async function restoreFromBackup(fileId, fileName) {
  if(!confirm(`確定要從備份還原？\n\n${fileName}\n\n⚠️ 目前所有資料將被覆蓋。`)) return;
  try {
    updateSyncStatus('syncing','還原中…');
    const token=await getAccessToken();
    const res=await fetch(`${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`,
      {headers:{'Authorization':`Bearer ${token}`}});
    if(!res.ok) throw new Error('無法讀取備份 '+res.status);
    const data=await res.json();
    DataStore.notes=data.notes||[];
    DataStore.categories=data.categories||getDefaultCategories();
    await saveDataToDrive();
    safeRefresh();
    alert(`✅ 還原完成！${DataStore.notes.length} 筆記事。`);
  } catch(err) {
    updateSyncStatus('error','還原失敗');
    alert('❌ 還原失敗：'+err.message);
  }
}

// ══════════════════════════════════════
// 檔案操作
// ══════════════════════════════════════
async function createDriveFile(name, content, parentId) {
  const token    = await getAccessToken();
  const metadata = { name, parents: [parentId], mimeType: JSON_MIME };
  const boundary = '---cstn_' + Date.now();
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${JSON_MIME}\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id&supportsAllDrives=true`, {
    method:'POST',
    headers:{'Authorization':`Bearer ${token}`,'Content-Type':`multipart/related; boundary=${boundary}`},
    body
  });
  if(!res.ok) throw new Error('建立失敗 '+res.status);
  return (await res.json()).id;
}

async function updateDriveFile(fileId, content) {
  const token = await getAccessToken();

  // 先嘗試 PATCH（A 帳號或有直接權限者）
  const res = await fetch(DRIVE_UPLOAD + '/files/' + fileId + '?uploadType=media&supportsAllDrives=true', {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': JSON_MIME },
    body: content
  });

  if (res.ok) return; // 成功，結束

  // 403：B 帳號沒有直接 PATCH 權限
  // 策略：建立新檔案，舊檔案保留（Drive 會有兩個，下次會取最新的）
  if (res.status === 403 || res.status === 404) {
    console.log('[Drive] PATCH 失敗(' + res.status + ')，改為建立新檔案…');
    DataStore.driveFileId = null;
    localStorage.removeItem('cstn_file_id');
    localStorage.removeItem('cstn_shared_file_id');

    // 在共用資料夾建立新的 cstn_data.json
    // 先嘗試刪除舊的（可能沒權限，忽略錯誤）
    try {
      await fetch(DRIVE_API + '/files/' + fileId + '?supportsAllDrives=true', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    } catch(e) {}

    // 建立新檔案
    const newId = await createDriveFile(DATA_FILE, content, DataStore.driveFolderId);
    DataStore.driveFileId = newId;
    if (DataStore.isSharedMode) {
      localStorage.setItem('cstn_shared_file_id', newId);
    } else {
      localStorage.setItem('cstn_file_id', newId);
    }

    // 對新檔案設定公開寫入權限（讓 A 也能看到並寫入）
    try {
      await fetch(DRIVE_API + '/files/' + newId + '/permissions?supportsAllDrives=true', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': JSON_MIME },
        body: JSON.stringify({ role: 'writer', type: 'anyone' })
      });
      console.log('[Drive] 新檔案已設為公開可寫');
    } catch(e) {
      console.warn('[Drive] 設定新檔案權限失敗:', e.message);
    }
    return;
  }

  throw new Error('更新失敗 ' + res.status);
}

async function uploadAttachment(file) {
  if(!DataStore.driveFolderId) throw new Error('Drive 資料夾未初始化');
  const token=await getAccessToken();
  const metadata={name:file.name,parents:[DataStore.driveFolderId],mimeType:file.type||'application/octet-stream'};
  const boundary='---att_'+Date.now();
  const fb=await file.arrayBuffer();
  const enc=new TextEncoder();
  const hdr=enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.type||'application/octet-stream'}\r\n\r\n`);
  const ftr=enc.encode(`\r\n--${boundary}--`);
  const buf=new Uint8Array(hdr.byteLength+fb.byteLength+ftr.byteLength);
  buf.set(new Uint8Array(hdr),0); buf.set(new Uint8Array(fb),hdr.byteLength); buf.set(new Uint8Array(ftr),hdr.byteLength+fb.byteLength);
  const res=await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true`,{
    method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':`multipart/related; boundary=${boundary}`},body:buf
  });
  if(!res.ok) throw new Error('上傳失敗 '+res.status);
  const f=await res.json();
  return{name:file.name,mimeType:file.type||'application/octet-stream',driveFileId:f.id,webViewLink:f.webViewLink,size:file.size};
}

async function deleteAttachment(driveFileId) {
  try{const token=await getAccessToken();await fetch(`${DRIVE_API}/files/${driveFileId}?supportsAllDrives=true`,{method:'DELETE',headers:{'Authorization':`Bearer ${token}`}});}catch{}
}

function getDefaultCategories() {
  return [{id:'cat_work',name:'工作',color:'#6366f1'},{id:'cat_life',name:'生活',color:'#22c55e'},{id:'cat_study',name:'學習',color:'#f59e0b'},{id:'cat_personal',name:'個人',color:'#ec4899'}];
}

function updateSyncStatus(status, text) {
  const dot=document.getElementById('sync-dot'), label=document.getElementById('sync-text');
  if(dot)   dot.className='sync-dot '+status;
  if(label) label.textContent=text;
  if(status === 'synced') DataStore.lastSyncTime = Date.now();
}
