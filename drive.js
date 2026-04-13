/**
 * drive.js — Google Drive API v3 完整封裝
 * V1_2：資料夾名稱改為 "#CloudSync Timer Notes"（需求1）
 */

'use strict';

const DRIVE_API     = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD  = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME   = '#CloudSync Timer Notes';   // 需求1：改名
const DATA_FILENAME = 'cstn_data.json';
const FOLDER_MIME   = 'application/vnd.google-apps.folder';
const JSON_MIME     = 'application/json';

window.DataStore = {
  notes:         [],
  categories:    [],
  driveFileId:   null,
  driveFolderId: null,
  saveTimer:     null
};

async function driveRequest(path, options = {}) {
  const token = await getAccessToken();
  const url   = path.startsWith('http') ? path : `${DRIVE_API}${path}`;
  const res   = await fetch(url, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, ...(options.headers || {}) }
  });
  if (!res.ok) throw new Error(`Drive API 錯誤 ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

async function initDrive() {
  try {
    updateSyncStatus('syncing', '初始化…');
    const cachedFolderId = localStorage.getItem('cstn_folder_id');
    const cachedFileId   = localStorage.getItem('cstn_file_id');
    if (cachedFolderId) DataStore.driveFolderId = cachedFolderId;
    if (cachedFileId)   DataStore.driveFileId   = cachedFileId;

    if (DataStore.driveFolderId) {
      try {
        await driveRequest(`/files/${DataStore.driveFolderId}?fields=id,trashed`);
      } catch {
        DataStore.driveFolderId = null;
        DataStore.driveFileId   = null;
        localStorage.removeItem('cstn_folder_id');
        localStorage.removeItem('cstn_file_id');
      }
    }
    if (!DataStore.driveFolderId) {
      DataStore.driveFolderId = await findOrCreateFolder();
      localStorage.setItem('cstn_folder_id', DataStore.driveFolderId);
    }
    console.log('[Drive] 初始化完成，資料夾:', FOLDER_NAME);
  } catch (err) {
    console.error('[Drive] 初始化失敗:', err);
    updateSyncStatus('error', '初始化失敗');
    throw err;
  }
}

async function findOrCreateFolder() {
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`
  );
  const result = await driveRequest(`/files?q=${q}&fields=files(id,name)&spaces=drive`);
  if (result.files && result.files.length > 0) return result.files[0].id;

  const folder = await driveRequest('/files', {
    method: 'POST',
    headers: { 'Content-Type': JSON_MIME },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME })
  });
  return folder.id;
}

async function loadDataFromDrive() {
  updateSyncStatus('syncing', '讀取中…');
  try {
    const q = encodeURIComponent(
      `name='${DATA_FILENAME}' and '${DataStore.driveFolderId}' in parents and trashed=false`
    );
    const result = await driveRequest(`/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=drive`);
    if (!result.files || result.files.length === 0) {
      DataStore.notes      = [];
      DataStore.categories = getDefaultCategories();
      updateSyncStatus('synced', '已就緒');
      return;
    }
    const fileId = result.files[0].id;
    DataStore.driveFileId = fileId;
    localStorage.setItem('cstn_file_id', fileId);

    const token   = await getAccessToken();
    const fileRes = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`,
      { headers: { 'Authorization': `Bearer ${token}` } });
    if (!fileRes.ok) throw new Error('無法下載資料檔');

    const data           = await fileRes.json();
    DataStore.notes      = data.notes      || [];
    DataStore.categories = data.categories || getDefaultCategories();
    localStorage.setItem('cstn_local_data', JSON.stringify(data));
    updateSyncStatus('synced', '已同步');
  } catch (err) {
    console.error('[Drive] 讀取失敗，使用本機快取:', err);
    const localData = localStorage.getItem('cstn_local_data');
    if (localData) {
      const parsed         = JSON.parse(localData);
      DataStore.notes      = parsed.notes      || [];
      DataStore.categories = parsed.categories || getDefaultCategories();
      updateSyncStatus('error', '離線模式');
    } else {
      DataStore.notes      = [];
      DataStore.categories = getDefaultCategories();
      updateSyncStatus('error', '讀取失敗');
    }
  }
}

function getDefaultCategories() {
  return [
    { id: 'cat_work',     name: '工作', color: '#6366f1' },
    { id: 'cat_life',     name: '生活', color: '#22c55e' },
    { id: 'cat_study',    name: '學習', color: '#f59e0b' },
    { id: 'cat_personal', name: '個人', color: '#ec4899' }
  ];
}

function scheduleSave() {
  if (DataStore.saveTimer) clearTimeout(DataStore.saveTimer);
  updateSyncStatus('syncing', '待儲存…');
  DataStore.saveTimer = setTimeout(saveDataToDrive, 2000);
}

async function saveDataToDrive() {
  updateSyncStatus('syncing', '儲存中…');
  const payload  = { version: 2, updatedAt: new Date().toISOString(),
                     categories: DataStore.categories, notes: DataStore.notes };
  const jsonBlob = JSON.stringify(payload, null, 2);
  try {
    if (DataStore.driveFileId) {
      await updateDriveFile(DataStore.driveFileId, jsonBlob);
    } else {
      DataStore.driveFileId = await createDriveFile(jsonBlob);
      localStorage.setItem('cstn_file_id', DataStore.driveFileId);
    }
    localStorage.setItem('cstn_local_data', jsonBlob);
    updateSyncStatus('synced', '已同步');
  } catch (err) {
    console.error('[Drive] 儲存失敗:', err);
    localStorage.setItem('cstn_local_data', jsonBlob);
    updateSyncStatus('error', '雲端儲存失敗');
  }
}

async function createDriveFile(jsonContent) {
  const token    = await getAccessToken();
  const metadata = { name: DATA_FILENAME, parents: [DataStore.driveFolderId], mimeType: JSON_MIME };
  const boundary = '-------cstn_boundary_' + Date.now();
  const body = [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '',
    JSON.stringify(metadata),
    `--${boundary}`, `Content-Type: ${JSON_MIME}`, '',
    jsonContent, `--${boundary}--`
  ].join('\r\n');

  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`,
               'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  if (!res.ok) throw new Error('建立 Drive 檔案失敗');
  return (await res.json()).id;
}

async function updateDriveFile(fileId, jsonContent) {
  const token = await getAccessToken();
  const res   = await fetch(`${DRIVE_UPLOAD}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': JSON_MIME },
    body: jsonContent
  });
  if (!res.ok) {
    if (res.status === 404) {
      DataStore.driveFileId = null;
      localStorage.removeItem('cstn_file_id');
      await saveDataToDrive();
      return;
    }
    throw new Error('更新 Drive 檔案失敗');
  }
}

async function uploadAttachment(file) {
  if (!DataStore.driveFolderId) throw new Error('Drive 資料夾尚未初始化');
  const token    = await getAccessToken();
  const metadata = { name: file.name, parents: [DataStore.driveFolderId],
                     mimeType: file.type || 'application/octet-stream' };
  const boundary  = '-------cstn_attach_' + Date.now();
  const fileBuffer = await file.arrayBuffer();
  const encoder    = new TextEncoder();
  const headerPart = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n--${boundary}\r\n` +
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`
  );
  const footerPart = encoder.encode(`\r\n--${boundary}--`);
  const bodyBuffer = new Uint8Array(headerPart.byteLength + fileBuffer.byteLength + footerPart.byteLength);
  bodyBuffer.set(new Uint8Array(headerPart), 0);
  bodyBuffer.set(new Uint8Array(fileBuffer), headerPart.byteLength);
  bodyBuffer.set(new Uint8Array(footerPart), headerPart.byteLength + fileBuffer.byteLength);

  const res = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink`,
    { method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`,
                 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: bodyBuffer }
  );
  if (!res.ok) throw new Error('上傳附件失敗');
  const f = await res.json();
  return { name: file.name, mimeType: file.type || 'application/octet-stream',
           driveFileId: f.id, webViewLink: f.webViewLink,
           webContentLink: f.webContentLink, size: file.size };
}

async function deleteAttachment(driveFileId) {
  try { await driveRequest(`/files/${driveFileId}`, { method: 'DELETE' }); }
  catch (err) { console.warn('[Drive] 刪除附件失敗:', err); }
}

function updateSyncStatus(status, text) {
  const dot   = document.getElementById('sync-dot');
  const label = document.getElementById('sync-text');
  if (!dot || !label) return;
  dot.className     = 'sync-dot ' + status;
  label.textContent = text;
}
