/**
 * notify.js — 通知權限與排程
 * V1_1 修正：
 *   - 修正2：依 remindOffsetMin 計算實際觸發時間
 *     （0=到期當下, 5=提前5分, 15=提前15分 … -1=不提醒）
 */

'use strict';

// ══════════════════════════════════════
// 請求通知權限
// ══════════════════════════════════════
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('您的瀏覽器不支援通知功能');
    return;
  }

  // iOS 需加入主畫面才能授權
  const isIOS        = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || window.navigator.standalone;

  if (isIOS && !isStandalone) {
    alert('iOS 用戶請先將本 App 加入主畫面（點底部分享 → 加入主畫面），再啟用通知功能。');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      document.getElementById('notification-banner')?.classList.add('hidden');
      console.log('[Notify] 通知權限已授予');
      scheduleAllNotifications();
    } else {
      console.warn('[Notify] 通知權限被拒絕:', permission);
    }
  } catch (err) {
    console.error('[Notify] 請求通知權限失敗:', err);
  }
}

// ══════════════════════════════════════
// 排程所有記事的通知
// ══════════════════════════════════════
function scheduleAllNotifications() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  if (Notification.permission !== 'granted') return;

  const notes = DataStore.notes || [];
  const now   = Date.now();
  let scheduled = 0;

  notes.forEach(note => {
    if (!note.dueDate) return;

    // 修正2：remindOffsetMin === -1 或未定義 → 不提醒
    const offsetMin = note.remindOffsetMin !== undefined ? note.remindOffsetMin : -1;
    if (offsetMin === -1) return;

    const dueTime = new Date(note.dueDate).getTime();

    // 實際觸發時間 = 到期時間 − 提前分鐘數
    const triggerTime = dueTime - offsetMin * 60 * 1000;

    // 已過觸發時間，不再排程
    if (triggerTime <= now) return;

    const cat = (DataStore.categories || []).find(c => c.id === note.categoryId);

    // 產生提醒標題
    const offsetLabel = buildOffsetLabel(offsetMin);

    navigator.serviceWorker.controller.postMessage({
      type: 'SCHEDULE_NOTIFICATION',
      payload: {
        id:        note.id,
        title:     offsetMin === 0
          ? `⏰ ${note.title}`
          : `⏰ ${note.title}（${offsetLabel}後到期）`,
        body:      note.content
          ? note.content.slice(0, 80)
          : `到期時間：${new Date(dueTime).toLocaleString('zh-TW')}`,
        timestamp: triggerTime,
        category:  cat ? cat.name : ''
      }
    });
    scheduled++;
  });

  console.log(`[Notify] 已排程 ${scheduled} 則提醒通知`);
}

// ── 提醒時機標籤文字 ──
function buildOffsetLabel(min) {
  if (min === 0)    return '到期當下';
  if (min < 60)     return `${min} 分鐘`;
  if (min === 60)   return '1 小時';
  if (min === 1440) return '1 天';
  return `${min} 分鐘`;
}
