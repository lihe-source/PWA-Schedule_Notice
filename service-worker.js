/**
 * service-worker.js — V2_7
 * 
 * 問題根源與修正：
 * 1. 電腦版通知：new Notification() 在背景分頁不顯示
 *    → 改為完全使用 SW 的 self.registration.showNotification()
 *    → SW 通知不受頁面焦點影響，真正的系統層通知
 *    
 * 2. 手機背景通知：頁面關閉後無法收到
 *    → 使用 Periodic Background Sync API（Chrome/Edge 支援）
 *    → SW 每分鐘定期喚醒並掃描到期事項
 *    → 掃描資料從 IndexedDB 讀取（不依賴頁面的 DataStore）
 *    
 * 3. 前端負責：把最新的記事清單存入 IndexedDB，供 SW 背景掃描用
 */

'use strict';

const APP_VERSION = 'V2_9';
const CACHE_NAME  = 'cstn-' + APP_VERSION;
const DB_NAME     = 'cstn_db';
const DB_VERSION  = 1;
const STORE_NAME  = 'notes_for_notify';

const CORE_ASSETS = [
  '/CloudSync-Timer-Notes/',
  '/CloudSync-Timer-Notes/index.html',
  '/CloudSync-Timer-Notes/manifest.json',
  '/CloudSync-Timer-Notes/css/app.css',
  '/CloudSync-Timer-Notes/js/app.js',
  '/CloudSync-Timer-Notes/js/auth.js',
  '/CloudSync-Timer-Notes/js/drive.js',
  '/CloudSync-Timer-Notes/js/notes.js',
  '/CloudSync-Timer-Notes/js/calendar.js',
  '/CloudSync-Timer-Notes/js/timer.js',
  '/CloudSync-Timer-Notes/js/notify.js',
  '/CloudSync-Timer-Notes/js/settings.js',
  '/CloudSync-Timer-Notes/icons/icon-192.png',
  '/CloudSync-Timer-Notes/icons/icon-512.png'
];

// ── 安裝 ──
self.addEventListener('install', event => {
  console.log('[SW] 安裝', APP_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .catch(err => console.warn('[SW] 快取失敗:', err))
      .then(() => self.skipWaiting())
  );
});

// ── 啟用 ──
self.addEventListener('activate', event => {
  console.log('[SW] 啟用', APP_VERSION);
  event.waitUntil(
    Promise.all([
      // 清除舊快取
      caches.keys().then(keys => Promise.all(
        keys.filter(k => k.startsWith('cstn-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      )),
      self.clients.claim(),
      // 嘗試註冊 Periodic Background Sync（支援的瀏覽器）
      registerPeriodicSync()
    ])
  );
});

async function registerPeriodicSync() {
  try {
    if (!self.registration.periodicSync) return;
    await self.registration.periodicSync.register('cstn-notify-check', {
      minInterval: 60 * 1000  // 最少 1 分鐘
    });
    console.log('[SW] Periodic Background Sync 已註冊');
  } catch(e) {
    console.log('[SW] Periodic Sync 不支援:', e.message);
  }
}

// ── Periodic Background Sync 事件（背景定期喚醒）──
self.addEventListener('periodicsync', event => {
  if (event.tag === 'cstn-notify-check') {
    event.waitUntil(checkNotificationsFromDB());
  }
});

// ── Fetch（Stale-While-Revalidate）──
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('googleapis.com')) return;
  if (req.url.includes('accounts.google.com')) return;
  if (req.url.includes('gsi/client')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/CloudSync-Timer-Notes/index.html')
        .then(cached => {
          fetch('/CloudSync-Timer-Notes/index.html')
            .then(res => {
              if (res && res.status === 200)
                caches.open(CACHE_NAME).then(c => c.put('/CloudSync-Timer-Notes/index.html', res.clone()));
            }).catch(() => {});
          return cached || fetch(req);
        })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(req).then(cached => {
        const fetchPromise = fetch(req).then(res => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        return cached || fetchPromise;
      })
    )
  );
});

// ── 訊息處理 ──
self.addEventListener('message', event => {
  const type = event.data && event.data.type;

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // 前端把最新記事存入 IndexedDB，供背景通知掃描用
  if (type === 'SYNC_NOTES_TO_DB') {
    saveNotesToDB(event.data.notes || []);
    return;
  }

  // 直接觸發通知（前端輪詢呼叫）
  if (type === 'FIRE_NOTIFICATION') {
    const p = event.data.payload;
    self.registration.showNotification(p.title, {
      body:               p.body,
      icon:               '/CloudSync-Timer-Notes/icons/icon-192.png',
      badge:              '/CloudSync-Timer-Notes/icons/icon-192.png',
      tag:                p.id,
      requireInteraction: true,
      vibrate:            [200, 100, 200],
      data:               { noteId: p.id }
    });
    return;
  }

  // 前端排程（會在 SW 存活期間用 setTimeout 等待）
  if (type === 'SCHEDULE_NOTIFICATION') {
    scheduleNotification(event.data.payload);
    return;
  }
});

// ── IndexedDB：儲存記事供背景掃描 ──
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function saveNotesToDB(notes) {
  try {
    const db  = await openDB();
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const st  = tx.objectStore(STORE_NAME);
    // 清除舊資料
    await new Promise((res, rej) => { const r=st.clear(); r.onsuccess=res; r.onerror=rej; });
    // 寫入新資料（只儲存有到期日和提醒設定的記事）
    notes.filter(n => n.dueDate && n.remindOffsetMin !== undefined && n.remindOffsetMin !== -1)
         .forEach(n => st.put({ id: n.id, title: n.title, content: n.content, dueDate: n.dueDate, remindOffsetMin: n.remindOffsetMin }));
    await new Promise((res, rej) => { tx.oncomplete=res; tx.onerror=rej; });
    console.log('[SW] 記事已同步到 IndexedDB');
  } catch(e) {
    console.warn('[SW] IndexedDB 寫入失敗:', e.message);
  }
}

async function checkNotificationsFromDB() {
  try {
    const db    = await openDB();
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const st    = tx.objectStore(STORE_NAME);
    const notes = await new Promise((res, rej) => {
      const r = st.getAll();
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });

    const now    = Date.now();
    const window = 70000; // ±70 秒觸發視窗（配合 1 分鐘 periodic sync）

    for (const note of notes) {
      const offset    = Number(note.remindOffsetMin);
      const triggerMs = new Date(note.dueDate).getTime() - offset * 60000;
      if (Math.abs(triggerMs - now) > window) continue;

      const firedKey = 'fired_' + note.id + '_' + triggerMs;
      // SW 中用 cache 儲存已觸發記錄
      const cache = await caches.open('cstn-fired-keys');
      const hit   = await cache.match(firedKey);
      if (hit) continue;

      // 標記已觸發
      await cache.put(firedKey, new Response('1'));

      const label = offset === 0 ? '到期當下' :
                    offset < 60  ? offset + ' 分鐘前' :
                    offset === 60 ? '1 小時前' : '1 天前';
      const title = offset === 0 ? '到期提醒：' + note.title : note.title + '（' + label + '到期）';
      const body  = note.content ? note.content.slice(0, 80) : '到期：' + new Date(note.dueDate).toLocaleString('zh-TW');

      await self.registration.showNotification(title, {
        body, icon: '/CloudSync-Timer-Notes/icons/icon-192.png',
        badge: '/CloudSync-Timer-Notes/icons/icon-192.png',
        tag: note.id, requireInteraction: true, vibrate: [200, 100, 200],
        data: { noteId: note.id }
      });
      console.log('[SW] 背景通知觸發:', title);
    }
  } catch(e) {
    console.warn('[SW] 背景通知掃描失敗:', e.message);
  }
}

// ── SW 內部定時排程（頁面開啟期間備援）──
const scheduled = new Map();
function scheduleNotification({ id, title, body, timestamp }) {
  const delay = timestamp - Date.now();
  if (delay <= 0 || delay > 24 * 3600 * 1000) return;
  if (scheduled.has(id)) clearTimeout(scheduled.get(id));
  scheduled.set(id, setTimeout(() => {
    self.registration.showNotification(title, {
      body, icon: '/CloudSync-Timer-Notes/icons/icon-192.png',
      tag: id, requireInteraction: true, vibrate: [200, 100, 200], data: { noteId: id }
    });
    scheduled.delete(id);
  }, delay));
}

// ── 通知點擊 ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        if (clients.length > 0) {
          clients[0].focus();
          clients[0].postMessage({ type: 'NOTIFICATION_CLICKED', noteId: event.notification.data && event.notification.data.noteId });
        } else {
          self.clients.openWindow('/CloudSync-Timer-Notes/');
        }
      })
  );
});
