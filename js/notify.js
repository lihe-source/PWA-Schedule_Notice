/**
 * notify.js — V2_7
 * 
 * 問題1修正（電腦通知）：
 *   new Notification() 在 Chrome 背景分頁不會跳出系統通知
 *   根本解法：改為透過 SW 的 registration.showNotification() 觸發
 *   SW 通知 = 真正的系統層通知，不受頁面焦點影響
 *
 * 問題2修正（手機背景）：
 *   每次儲存資料後，同步記事到 IndexedDB
 *   SW 的 Periodic Background Sync 每分鐘從 DB 讀取並發通知
 *   支援頁面關閉後仍能收到通知（Chrome/Edge for Android 支援）
 *
 * 問題3修正（背景切換顏色）：在 CSS 修正
 */

'use strict';

var _notifyLoop     = null;
var _notifyInterval = 10000;  // 前端每 10 秒掃描（當頁面在前台）
var _triggerWindow  = 65000;  // ±65 秒觸發視窗

// ══════════════════════════════════════
// 請求通知權限
// ══════════════════════════════════════
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('瀏覽器不支援通知，請使用 Chrome / Edge / Firefox。');
    return false;
  }

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  var isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isIOS && !isPWA) {
    alert('iOS 通知步驟：\n1. 點底部「分享」\n2. 選「加入主畫面」\n3. 從主畫面開啟\n4. 再次啟用通知');
    return false;
  }

  if (Notification.permission === 'denied') {
    alert('通知已封鎖，請手動開啟：\n\nChrome/Edge：網址列左側鎖頭 → 通知 → 允許\nWindows 11：設定 → 系統 → 通知 → 確認瀏覽器通知已開啟\n\n開啟後請重新整理頁面');
    return false;
  }

  if (Notification.permission === 'granted') {
    startFrontendNotificationLoop();
    syncNotesToSW();
    // 測試通知
    showViaServiceWorker('通知功能正常', '您將在設定的提醒時間收到通知', 'cstn-test');
    return true;
  }

  try {
    var perm = await Notification.requestPermission();
    if (perm === 'granted') {
      var el = document.getElementById('notification-banner');
      if (el) el.classList.add('hidden');
      startFrontendNotificationLoop();
      scheduleAllNotifications();
      syncNotesToSW();
      setTimeout(function() {
        showViaServiceWorker('通知功能正常', '您將在設定的提醒時間收到通知', 'cstn-test');
      }, 500);
      // 嘗試註冊 Periodic Background Sync
      registerPeriodicSync();
      return true;
    } else {
      alert('通知權限被拒絕。請在瀏覽器設定中允許此網站的通知。');
      return false;
    }
  } catch (err) {
    console.error('[Notify] 請求失敗:', err);
    return false;
  }
}

// ══════════════════════════════════════
// 核心修正：用 SW showNotification 觸發通知
// 不用 new Notification()，SW 通知才是真正的系統通知
// ══════════════════════════════════════
async function showViaServiceWorker(title, body, tag) {
  try {
    // 優先取得 SW registration
    var reg = null;
    if (navigator.serviceWorker) {
      reg = await navigator.serviceWorker.ready.catch(function() { return null; });
    }

    if (reg && reg.active) {
      // 直接呼叫 SW 的 showNotification（最可靠）
      // 注意：這需要 SW 已啟用，且網頁是 HTTPS
      await reg.showNotification(title, {
        body:               body,
        icon:               '/CloudSync-Timer-Notes/icons/icon-192.png',
        badge:              '/CloudSync-Timer-Notes/icons/icon-192.png',
        tag:                tag || ('cstn-' + Date.now()),
        requireInteraction: true,
        vibrate:            [200, 100, 200]
      });
      console.log('[Notify] SW 通知已送出:', title);
    } else {
      // Fallback: new Notification（在頁面前台有效）
      var n = new Notification(title, {
        body:               body,
        icon:               '/CloudSync-Timer-Notes/icons/icon-192.png',
        tag:                tag || ('cstn-' + Date.now()),
        requireInteraction: true
      });
      n.onclick = function() { window.focus(); n.close(); };
      console.log('[Notify] Notification API 通知:', title);
    }
  } catch(e) {
    console.error('[Notify] 通知失敗:', e.message);
    // 最後 fallback
    try {
      new Notification(title, { body: body, icon: '/CloudSync-Timer-Notes/icons/icon-192.png' });
    } catch(e2) {
      console.error('[Notify] 所有方法均失敗:', e2.message);
    }
  }
}

// ══════════════════════════════════════
// 前端輪詢（10 秒，頁面在前台時）
// ══════════════════════════════════════
function startFrontendNotificationLoop() {
  if (_notifyLoop) clearInterval(_notifyLoop);
  checkAndFireNotifications();
  _notifyLoop = setInterval(checkAndFireNotifications, _notifyInterval);
  console.log('[Notify] 前端輪詢已啟動（每 10 秒）');
}

function checkAndFireNotifications() {
  if (Notification.permission !== 'granted') return;
  var notes = (window.DataStore && DataStore.notes) ? DataStore.notes : [];
  if (!notes.length) return;

  var now = Date.now();
  notes.forEach(function(note) {
    if (!note.dueDate) return;
    var offset = note.remindOffsetMin !== undefined ? Number(note.remindOffsetMin) : -1;
    if (offset === -1) return;

    var dueMs     = new Date(note.dueDate).getTime();
    var triggerMs = dueMs - offset * 60000;
    if (Math.abs(triggerMs - now) > _triggerWindow) return;

    var key = 'cstn_fired_' + note.id + '_' + triggerMs;
    if (sessionStorage.getItem(key) || localStorage.getItem(key)) return;

    sessionStorage.setItem(key, '1');
    localStorage.setItem(key, '1');

    fireNotification(note, offset, dueMs);
  });
}

function fireNotification(note, offsetMin, dueMs) {
  var label;
  if (offsetMin === 0)         label = '到期當下';
  else if (offsetMin < 60)     label = offsetMin + ' 分鐘前';
  else if (offsetMin === 60)   label = '1 小時前';
  else if (offsetMin === 1440) label = '1 天前';
  else                         label = offsetMin + ' 分鐘前';

  var title = offsetMin === 0 ? '到期提醒：' + note.title : note.title + '（' + label + '到期）';
  var body  = note.content ? note.content.slice(0, 100) : '到期：' + new Date(dueMs).toLocaleString('zh-TW');

  // 用 SW showNotification 觸發（電腦/手機都有效）
  showViaServiceWorker(title, body, note.id);
}

// ══════════════════════════════════════
// 問題2：同步記事到 SW IndexedDB（背景通知用）
// ══════════════════════════════════════
function syncNotesToSW() {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
  var notes = (window.DataStore && DataStore.notes) ? DataStore.notes : [];
  navigator.serviceWorker.controller.postMessage({
    type:  'SYNC_NOTES_TO_DB',
    notes: notes
  });
  console.log('[Notify] 已同步 ' + notes.length + ' 筆記事到 SW DB');
}

// 每次資料更新後呼叫（由 drive.js/notes.js 呼叫）
function onNotesUpdated() {
  if (Notification.permission !== 'granted') return;
  syncNotesToSW();
  scheduleAllNotifications();
}

// ══════════════════════════════════════
// 嘗試啟用 Periodic Background Sync
// ══════════════════════════════════════
async function registerPeriodicSync() {
  if (!navigator.serviceWorker || !navigator.permissions) return;
  try {
    var status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') {
      console.log('[Notify] Periodic Sync 未授權（不影響前台通知）');
      return;
    }
    var reg = await navigator.serviceWorker.ready;
    await reg.periodicSync.register('cstn-notify-check', { minInterval: 60 * 1000 });
    console.log('[Notify] Periodic Background Sync 已啟用');
  } catch(e) {
    console.log('[Notify] Periodic Sync 不支援:', e.message);
  }
}

// ══════════════════════════════════════
// SW 備援排程（頁面開啟期間的精確排程）
// ══════════════════════════════════════
async function scheduleAllNotifications() {
  if (Notification.permission !== 'granted') return;
  if (!navigator.serviceWorker) return;

  try {
    var reg = await navigator.serviceWorker.ready;
    if (!reg || !reg.active) return;

    var now   = Date.now();
    var count = 0;
    var notes = (window.DataStore && DataStore.notes) ? DataStore.notes : [];

    notes.forEach(function(note) {
      if (!note.dueDate) return;
      var offset = note.remindOffsetMin !== undefined ? Number(note.remindOffsetMin) : -1;
      if (offset === -1) return;

      var triggerMs = new Date(note.dueDate).getTime() - offset * 60000;
      if (triggerMs <= now) return;

      var label;
      if (offset === 0)         label = '到期當下';
      else if (offset < 60)     label = offset + ' 分鐘前';
      else if (offset === 60)   label = '1 小時前';
      else if (offset === 1440) label = '1 天前';
      else                      label = offset + ' 分鐘前';

      var title = offset === 0 ? '到期提醒：' + note.title : note.title + '（' + label + '到期）';
      var body  = note.content ? note.content.slice(0, 80) : '到期：' + new Date(note.dueDate).toLocaleString('zh-TW');

      reg.active.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        payload: { id: note.id, title: title, body: body, timestamp: triggerMs }
      });
      count++;
    });
    console.log('[Notify] SW 排程 ' + count + ' 則');
  } catch(e) {
    console.warn('[Notify] SW 排程失敗:', e.message);
  }
}

// ── 清理過期觸發記錄 ──
function cleanupFiredKeys() {
  var cutoff = Date.now() - 30 * 24 * 3600000;
  var toDelete = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (!k || k.indexOf('cstn_fired_') !== 0) continue;
    var parts = k.split('_');
    var ts    = parseInt(parts[parts.length - 1]);
    if (!isNaN(ts) && ts < cutoff) toDelete.push(k);
  }
  toDelete.forEach(function(k) { localStorage.removeItem(k); });
}
