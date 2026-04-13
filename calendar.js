/**
 * calendar.js
 * V1_2 修正：
 *  需求2:  日期格事件標籤字體優化
 *  需求4:  左右滑動切換月份/週次
 *  需求5:  統一月曆高度 + 左側周別(WK##，以週日為起始)
 *  需求8:  週視圖改橫向，顯示當天事項名稱
 *  需求10: 當日事項面板 scroll
 */

'use strict';

const CalendarState = {
  year:       new Date().getFullYear(),
  month:      new Date().getMonth(),
  view:       'month',
  weekOffset: 0
};

const WEEKDAYS_TW = ['日','一','二','三','四','五','六'];

// ── 以週日為第一天的週次計算 ──
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // 調整讓週日=0當基準，找到當週的週四(+4天)
  const dayOfWeek = d.getUTCDay(); // 0=日
  d.setUTCDate(d.getUTCDate() - dayOfWeek + 4); // 移到該週的週四
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ═══════════════════════════════
// 主渲染入口
// ═══════════════════════════════
function renderCalendar() {
  if (CalendarState.view === 'month') renderMonthView();
  else                                renderWeekView();
}

// ═══════════════════════════════
// 月視圖
// ═══════════════════════════════
function renderMonthView() {
  const { year, month } = CalendarState;
  document.getElementById('calendar-title').textContent = `${year}年 ${month+1}月`;

  // ── 星期標題（WK 欄 + 日~六） ──
  const weekdaysEl = document.getElementById('calendar-weekdays');
  if (weekdaysEl) {
    weekdaysEl.innerHTML = '';
    weekdaysEl.style.gridTemplateColumns = '32px repeat(7, 1fr)';

    const wkH = document.createElement('div');
    wkH.className = 'calendar-weekday cal-wk-label';
    wkH.textContent = 'WK';
    weekdaysEl.appendChild(wkH);

    WEEKDAYS_TW.forEach(d => {
      const el = document.createElement('div');
      el.className = 'calendar-weekday';
      el.textContent = d;
      weekdaysEl.appendChild(el);
    });
  }

  const container = document.getElementById('calendar-days');
  if (!container) return;
  container.innerHTML = '';
  container.style.gridTemplateColumns = '32px repeat(7, 1fr)';

  const today = new Date(); today.setHours(0,0,0,0);
  const firstDay        = new Date(year, month, 1).getDay();
  const daysInMonth     = new Date(year, month+1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const totalRows       = Math.ceil((firstDay + daysInMonth) / 7);
  const eventMap        = buildEventMap(year, month);

  // 需求5：統一每個日期格高度，6週最多 = 固定行高
  const ROW_HEIGHT = '80px'; // 每行固定高度

  for (let row = 0; row < totalRows; row++) {
    // ── WK 欄 ──
    const firstCellIdx = row * 7;
    let rowSunDate;
    if (firstCellIdx < firstDay) {
      rowSunDate = new Date(year, month-1, daysInPrevMonth - firstDay + firstCellIdx + 1);
    } else if (firstCellIdx < firstDay + daysInMonth) {
      rowSunDate = new Date(year, month, firstCellIdx - firstDay + 1);
    } else {
      rowSunDate = new Date(year, month+1, firstCellIdx - firstDay - daysInMonth + 1);
    }

    const wkCell = document.createElement('div');
    wkCell.className = 'cal-wk-cell';
    wkCell.style.height = ROW_HEIGHT;
    wkCell.textContent  = 'W' + String(getWeekNumber(rowSunDate)).padStart(2,'0');
    container.appendChild(wkCell);

    // ── 7 天格 ──
    for (let col = 0; col < 7; col++) {
      const i = row * 7 + col;
      const cell = document.createElement('div');
      cell.className  = 'calendar-day';
      cell.style.height = ROW_HEIGHT;

      let cellDate;
      if (i < firstDay) {
        cellDate = new Date(year, month-1, daysInPrevMonth - firstDay + i + 1);
        cell.classList.add('other-month');
      } else if (i < firstDay + daysInMonth) {
        cellDate = new Date(year, month, i - firstDay + 1);
        if (cellDate.getTime() === today.getTime()) cell.classList.add('today');
      } else {
        cellDate = new Date(year, month+1, i - firstDay - daysInMonth + 1);
        cell.classList.add('other-month');
      }

      const dateKey = formatDateKey(cellDate);
      const events  = eventMap[dateKey] || [];

      // 日期數字
      const dayNum = document.createElement('div');
      dayNum.className = 'day-number';
      dayNum.textContent = cellDate.getDate();
      cell.appendChild(dayNum);

      if (events.length > 0) {
        // 需求2：事件標籤（優化字體比例）
        events.slice(0, 2).forEach((evt, idx) => {
          const chip = document.createElement('div');
          chip.className   = 'day-event-chip';
          chip.style.background   = evt.color;
          chip.style.borderColor  = evt.color;
          chip.textContent = evt.title;
          if (idx === 0 && events.length > 2) {
            chip.textContent = evt.title;
            // 額外筆數 badge
          }
          cell.appendChild(chip);
        });
        // 超過 2 筆顯示 +N
        if (events.length > 2) {
          const more = document.createElement('div');
          more.className   = 'day-event-more';
          more.textContent = `+${events.length - 2}`;
          cell.appendChild(more);
        }
      }

      cell.addEventListener('click', () => showDayEvents(cellDate, events));
      container.appendChild(cell);
    }
  }

  // 需求4：滑動手勢（綁定整個月視圖容器）
  const monthView = document.getElementById('calendar-month-view');
  bindSwipeGesture(monthView, calendarNext, calendarPrev);
}

// ═══════════════════════════════
// 週視圖（需求8：橫向，每天一行）
// ═══════════════════════════════
function renderWeekView() {
  const { weekOffset } = CalendarState;
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + weekOffset * 7);
  startOfWeek.setHours(0,0,0,0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const sm = startOfWeek.getMonth()+1, sd = startOfWeek.getDate();
  const em = endOfWeek.getMonth()+1,   ed = endOfWeek.getDate();
  const wk = 'W' + String(getWeekNumber(startOfWeek)).padStart(2,'0');
  document.getElementById('calendar-title').textContent =
    `${sm}/${sd} – ${em}/${ed} (${wk})`;

  const container = document.getElementById('week-grid-container');
  if (!container) return;

  const todayStr = formatDateKey(today);

  // 依日期分組事件
  const weekEventMap = {};
  (DataStore.notes || []).forEach(note => {
    if (!note.dueDate) return;
    const nd = new Date(note.dueDate); nd.setHours(0,0,0,0);
    if (nd >= startOfWeek && nd <= endOfWeek) {
      const key = formatDateKey(nd);
      if (!weekEventMap[key]) weekEventMap[key] = [];
      const cat   = (DataStore.categories||[]).find(c => c.id === note.categoryId);
      const color = cat ? cat.color : '#6366f1';
      weekEventMap[key].push({
        title:  note.title,
        color,
        noteId: note.id,
        time:   new Date(note.dueDate).toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' })
      });
    }
  });

  // 需求8：橫向清單，每天一行
  const weekDays = Array.from({length:7}, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  container.innerHTML = `
    <div class="week-list">
      ${weekDays.map(d => {
        const key     = formatDateKey(d);
        const isToday = key === todayStr;
        const evts    = weekEventMap[key] || [];
        return `
          <div class="week-row${isToday ? ' week-row-today' : ''}">
            <div class="week-row-label">
              <span class="week-row-dayname">${WEEKDAYS_TW[d.getDay()]}</span>
              <span class="week-row-daynum${isToday ? ' today-circle' : ''}">${d.getDate()}</span>
            </div>
            <div class="week-row-events">
              ${evts.length === 0
                ? `<span class="week-no-event">無事項</span>`
                : evts.map(e => `
                    <span class="week-event-pill" onclick="openNoteModal('${e.noteId}')"
                          style="background:${e.color}20;border-color:${e.color}60;color:${e.color};">
                      ${e.time} ${escapeHtml(e.title)}
                    </span>`).join('')
              }
            </div>
          </div>`;
      }).join('')}
    </div>`;

  // 需求4：滑動手勢
  bindSwipeGesture(container, calendarNext, calendarPrev);
}

// ═══════════════════════════════
// 事件 Map 建立
// ═══════════════════════════════
function buildEventMap(year, month) {
  const map = {};
  (DataStore.notes || []).forEach(note => {
    if (!note.dueDate) return;
    const nd = new Date(note.dueDate);
    if (nd.getFullYear() !== year || nd.getMonth() !== month) return;
    const cat   = (DataStore.categories||[]).find(c => c.id === note.categoryId);
    const color = cat ? cat.color : '#6366f1';
    const key   = formatDateKey(nd);
    if (!map[key]) map[key] = [];
    map[key].push({ title: note.title, color, noteId: note.id });
  });
  return map;
}

// ═══════════════════════════════
// 當日事項面板（需求10：scroll）
// ═══════════════════════════════
function showDayEvents(date, events) {
  const panel = document.getElementById('day-events-panel');
  const title = document.getElementById('day-events-title');
  const list  = document.getElementById('day-events-list');
  if (!panel || !title || !list) return;

  const wk = 'W' + String(getWeekNumber(date)).padStart(2,'0');
  title.textContent =
    `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()}（${wk}）`;

  if (events.length === 0) {
    list.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">此日期無事項</div>`;
  } else {
    list.innerHTML = events.map(evt => `
      <div class="day-event-row" onclick="openNoteModal('${evt.noteId}')">
        <span style="width:10px;height:10px;border-radius:50%;background:${evt.color};flex-shrink:0;"></span>
        <span style="flex:1;font-size:13px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${escapeHtml(evt.title)}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             style="width:14px;height:14px;flex-shrink:0;color:var(--text-muted);">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>`).join('');
  }

  panel.style.display = 'block';
  setTimeout(() => panel.scrollIntoView({ behavior:'smooth', block:'nearest' }), 50);
}

// ═══════════════════════════════
// 需求4：觸控滑動手勢
// ═══════════════════════════════
function bindSwipeGesture(el, onSwipeLeft, onSwipeRight) {
  if (!el || el._swipeBound) return;
  el._swipeBound = true;
  let sx = 0, sy = 0;

  el.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });

  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = Math.abs(e.changedTouches[0].clientY - sy);
    if (Math.abs(dx) > 50 && dy < Math.abs(dx) * 0.6) {
      if (dx < 0) onSwipeLeft();   // 左滑 → 下個月/週
      else        onSwipeRight();  // 右滑 → 上個月/週
    }
  }, { passive: true });
}

// ═══════════════════════════════
// 行事曆導覽
// ═══════════════════════════════
function calendarPrev() {
  if (CalendarState.view === 'month') {
    if (--CalendarState.month < 0) { CalendarState.month = 11; CalendarState.year--; }
  } else {
    CalendarState.weekOffset--;
  }
  renderCalendar();
}

function calendarNext() {
  if (CalendarState.view === 'month') {
    if (++CalendarState.month > 11) { CalendarState.month = 0; CalendarState.year++; }
  } else {
    CalendarState.weekOffset++;
  }
  renderCalendar();
}

function calendarGoToday() {
  const now = new Date();
  CalendarState.year  = now.getFullYear();
  CalendarState.month = now.getMonth();
  CalendarState.weekOffset = 0;
  renderCalendar();
}

function switchCalendarView(view) {
  CalendarState.view = view;
  document.getElementById('calendar-month-view').style.display = view==='month' ? 'block' : 'none';
  document.getElementById('calendar-week-view').style.display  = view==='week'  ? 'block' : 'none';
  document.getElementById('btn-month-view').classList.toggle('active', view==='month');
  document.getElementById('btn-week-view').classList.toggle('active', view==='week');
  renderCalendar();
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
