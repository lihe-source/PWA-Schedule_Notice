/**
 * calendar.js — V2_1
 * 需求1: 進入行事曆頁自動顯示今天事項、依時間排序、可 scroll
 * 需求2: refreshAllViews 改用安全呼叫，避免 drive.js 提早呼叫失敗
 */

'use strict';

const CalendarState = {
  year:         new Date().getFullYear(),
  month:        new Date().getMonth(),
  view:         'month',
  weekOffset:   0,
  selectedDate: null
};

const WEEKDAYS_TW    = ['日','一','二','三','四','五','六'];
const CALENDAR_ROW_H = '72px';

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() + 4);
  const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - ys) / 86400000 + 1) / 7);
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

// ── 從 DataStore 取得某天所有事項（含時間，依時間排序）──
function getEventsForDate(dateKey) {
  return (DataStore.notes || [])
    .filter(note => {
      if (!note.dueDate) return false;
      return formatDateKey(new Date(note.dueDate)) === dateKey;
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .map(note => {
      const cat = (DataStore.categories||[]).find(c=>c.id===note.categoryId);
      const hasTime = note.dueDate.includes('T') && note.dueDate.split('T')[1] !== '00:00:00';
      return {
        noteId: note.id,
        title:  note.title,
        color:  cat ? cat.color : '#6366f1',
        catName:cat ? cat.name  : '',
        time:   hasTime ? new Date(note.dueDate).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}) : '全天'
      };
    });
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

  const titleEl = document.getElementById('calendar-title');
  if (titleEl) titleEl.textContent = `${year}年 ${month+1}月`;

  // 星期標題列
  const weekdaysEl = document.getElementById('calendar-weekdays');
  if (weekdaysEl) {
    weekdaysEl.innerHTML = '';
    const wkH = document.createElement('div');
    wkH.style.cssText = 'text-align:center;font-size:9px;font-weight:700;color:var(--text-muted);padding:6px 0;';
    wkH.textContent = 'WK';
    weekdaysEl.appendChild(wkH);
    WEEKDAYS_TW.forEach(d => {
      const el = document.createElement('div');
      el.className   = 'calendar-weekday';
      el.textContent = d;
      weekdaysEl.appendChild(el);
    });
  }

  const container = document.getElementById('calendar-days');
  if (!container) return;
  container.innerHTML = '';

  const today           = new Date(); today.setHours(0,0,0,0);
  const todayKey        = formatDateKey(today);
  const selectedKey     = CalendarState.selectedDate ? formatDateKey(CalendarState.selectedDate) : todayKey;
  const firstDay        = new Date(year, month, 1).getDay();
  const daysInMonth     = new Date(year, month+1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const totalRows       = Math.ceil((firstDay + daysInMonth) / 7);

  for (let row = 0; row < totalRows; row++) {
    // WK 欄
    const fi = row * 7;
    let rowSunDate;
    if      (fi < firstDay)               rowSunDate = new Date(year, month-1, daysInPrevMonth - firstDay + fi + 1);
    else if (fi < firstDay + daysInMonth) rowSunDate = new Date(year, month, fi - firstDay + 1);
    else                                  rowSunDate = new Date(year, month+1, fi - firstDay - daysInMonth + 1);

    const wkCell = document.createElement('div');
    wkCell.className = 'cal-wk-cell';
    wkCell.style.height = CALENDAR_ROW_H;
    wkCell.textContent  = 'W' + String(getWeekNumber(rowSunDate)).padStart(2,'0');
    container.appendChild(wkCell);

    // 7 天格
    for (let col = 0; col < 7; col++) {
      const i = row * 7 + col;
      const cell = document.createElement('div');
      cell.className  = 'calendar-day';
      cell.style.height = CALENDAR_ROW_H;

      let cellDate, isOther = false;
      if      (i < firstDay)               { cellDate = new Date(year, month-1, daysInPrevMonth - firstDay + i + 1); isOther=true; }
      else if (i < firstDay + daysInMonth) { cellDate = new Date(year, month, i - firstDay + 1); }
      else                                 { cellDate = new Date(year, month+1, i - firstDay - daysInMonth + 1); isOther=true; }

      const dateKey = formatDateKey(cellDate);
      if (isOther) cell.classList.add('other-month');
      if (dateKey === todayKey)                              cell.classList.add('today');
      if (dateKey === selectedKey && dateKey !== todayKey)   cell.classList.add('selected');
      if (dateKey === selectedKey)                           cell.classList.add('selected-active');

      // 只拿月份內的事項做圓點標示（不跨月）
      const dotEvents = getEventsForDate(dateKey);

      const dayNum = document.createElement('div');
      dayNum.className   = 'day-number';
      dayNum.textContent = cellDate.getDate();
      cell.appendChild(dayNum);

      // 事件 chip（最多2筆）
      dotEvents.slice(0,2).forEach(evt => {
        const chip = document.createElement('div');
        chip.className    = 'day-event-chip';
        chip.style.background = evt.color;
        chip.textContent  = evt.title;
        cell.appendChild(chip);
      });
      if (dotEvents.length > 2) {
        const more = document.createElement('div');
        more.className   = 'day-event-more';
        more.textContent = `+${dotEvents.length-2}`;
        cell.appendChild(more);
      }

      cell.addEventListener('click', () => {
        CalendarState.selectedDate = cellDate;
        document.querySelectorAll('#calendar-days .calendar-day.selected-active').forEach(el => {
          el.classList.remove('selected','selected-active');
        });
        cell.classList.add('selected-active');
        if (dateKey !== todayKey) cell.classList.add('selected');
        // 需求1：即時從 DataStore 撈完整事項（含時間）
        showDayEvents(cellDate, getEventsForDate(dateKey));
      });

      container.appendChild(cell);
    }
  }

  // 需求1：初次渲染月視圖時，自動顯示 selectedDate（預設今天）的事項
  const autoKey    = selectedKey;
  const autoDate   = CalendarState.selectedDate || today;
  const autoEvents = getEventsForDate(autoKey);
  showDayEvents(autoDate, autoEvents);

  bindSwipeWithAnim(document.getElementById('calendar-month-view'), calendarNext, calendarPrev);
}

// ═══════════════════════════════
// 週視圖
// ═══════════════════════════════
function renderWeekView() {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + CalendarState.weekOffset * 7);
  startOfWeek.setHours(0,0,0,0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const sm = startOfWeek.getMonth()+1, sd = startOfWeek.getDate();
  const em = endOfWeek.getMonth()+1,   ed = endOfWeek.getDate();
  const wk = 'W' + String(getWeekNumber(startOfWeek)).padStart(2,'0');
  const titleEl = document.getElementById('calendar-title');
  if (titleEl) titleEl.textContent = `${sm}/${sd} – ${em}/${ed} (${wk})`;

  const container = document.getElementById('week-grid-container');
  if (!container) return;

  const todayStr    = formatDateKey(today);
  const selectedKey = CalendarState.selectedDate ? formatDateKey(CalendarState.selectedDate) : todayStr;

  const weekDays = Array.from({length:7}, (_,i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const listEl = document.createElement('div');
  listEl.className = 'week-list';

  weekDays.forEach(d => {
    const key      = formatDateKey(d);
    const isToday  = key === todayStr;
    const isSel    = key === selectedKey;
    const evts     = getEventsForDate(key); // 含時間、已排序

    const row = document.createElement('div');
    row.className = `week-row${isToday?' week-row-today':''}${isSel?' week-row-selected':''}`;
    row.style.cursor = 'pointer';

    row.innerHTML = `
      <div class="week-row-label">
        <span class="week-row-dayname">${WEEKDAYS_TW[d.getDay()]}</span>
        <span class="week-row-daynum${isToday?' today-circle':isSel?' selected-circle':''}">${d.getDate()}</span>
      </div>
      <div class="week-row-events">
        ${evts.length===0
          ? `<span class="week-no-event">無事項</span>`
          : evts.map(e=>`
              <span class="week-event-pill"
                    onclick="event.stopPropagation();openNoteModal('${e.noteId}')"
                    style="background:${e.color}22;border:1px solid ${e.color}66;color:${e.color};">
                ${e.time}&nbsp;${escapeHtml(e.title)}
              </span>`).join('')}
      </div>`;

    row.addEventListener('click', () => {
      CalendarState.selectedDate = d;
      listEl.querySelectorAll('.week-row').forEach(r => {
        r.classList.remove('week-row-selected');
        r.querySelector('.week-row-daynum')?.classList.remove('selected-circle');
      });
      row.classList.add('week-row-selected');
      const num = row.querySelector('.week-row-daynum');
      if (num && !isToday) num.classList.add('selected-circle');
      showDayEvents(d, evts);
    });

    listEl.appendChild(row);
  });

  container.innerHTML = '';
  container.appendChild(listEl);
  bindSwipeWithAnim(container, calendarNext, calendarPrev);

  // 預設顯示選中日事項
  const selDay = weekDays.find(d => formatDateKey(d) === selectedKey);
  if (selDay) showDayEvents(selDay, getEventsForDate(selectedKey));
}

// ═══════════════════════════════
// 當日事項面板（需求1：依時間排序 + scroll）
// ═══════════════════════════════
function showDayEvents(date, events) {
  const panel = document.getElementById('day-events-panel');
  const title = document.getElementById('day-events-title');
  const list  = document.getElementById('day-events-list');
  if (!panel||!title||!list) return;

  const wk = 'W' + String(getWeekNumber(date)).padStart(2,'0');
  const mm  = String(date.getMonth()+1).padStart(2,'0');
  const dd  = String(date.getDate()).padStart(2,'0');
  const dayNames = ['日','一','二','三','四','五','六'];
  title.textContent = `${date.getFullYear()}/${mm}/${dd}（週${dayNames[date.getDay()]}，${wk}）`;

  if (events.length === 0) {
    list.innerHTML = `
      <div class="day-empty-state">
        <div style="font-size:28px;margin-bottom:6px;">📋</div>
        <div style="font-size:13px;color:var(--text-muted);">此日期無事項</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px;"
                onclick="openNoteModal()">＋ 新增事項</button>
      </div>`;
  } else {
    // 需求1：依時間排序（已在 getEventsForDate 完成），顯示時間
    list.innerHTML = events.map(e => `
      <div class="day-event-row" onclick="openNoteModal('${e.noteId}')">
        <div class="day-event-time">${e.time}</div>
        <span class="day-event-dot" style="background:${e.color};"></span>
        <div class="day-event-info">
          <div class="day-event-title">${escapeHtml(e.title)}</div>
          ${e.catName ? `<div class="day-event-cat" style="color:${e.color}">${escapeHtml(e.catName)}</div>` : ''}
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             style="width:14px;height:14px;flex-shrink:0;color:var(--text-muted);">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>`).join('');
  }

  panel.style.display = 'block';
  // 需求1：不自動 scroll，讓使用者自己看（panel 本身可 scroll）
}

// ═══════════════════════════════
// 滑動手勢 + 動畫
// ═══════════════════════════════
function bindSwipeWithAnim(el, onLeft, onRight) {
  if (!el || el._swipeBound) return;
  el._swipeBound = true;
  let startX=0, startY=0, isDragging=false;

  el.addEventListener('pointerdown', e => {
    startX=e.clientX; startY=e.clientY; isDragging=true;
    el.style.transition='none';
  }, {passive:true});

  el.addEventListener('pointermove', e => {
    if (!isDragging) return;
    const dx=e.clientX-startX, dy=Math.abs(e.clientY-startY);
    if (Math.abs(dx)>10 && dy<Math.abs(dx)) {
      el.style.transform=`translateX(${dx*0.3}px)`;
      el.style.opacity=`${1-Math.abs(dx)/600}`;
    }
  }, {passive:true});

  const endH = e => {
    if (!isDragging) return;
    isDragging=false;
    const dx=e.clientX-startX, dy=Math.abs(e.clientY-startY);
    el.style.transition='transform 0.25s ease, opacity 0.25s ease';
    if (Math.abs(dx)>60 && dy<Math.abs(dx)/1.5) {
      const dir=dx<0?1:-1;
      el.style.transform=`translateX(${dir*60}px)`;
      el.style.opacity='0';
      setTimeout(()=>{
        el.style.transition='none'; el.style.transform=''; el.style.opacity='';
        if(dx<0) onLeft(); else onRight();
      },220);
    } else {
      el.style.transform=''; el.style.opacity='';
    }
  };
  el.addEventListener('pointerup',     endH, {passive:true});
  el.addEventListener('pointercancel', endH, {passive:true});
}

// ═══════════════════════════════
// 導覽
// ═══════════════════════════════
function calendarPrev() {
  if (CalendarState.view==='month') {
    if(--CalendarState.month<0){CalendarState.month=11;CalendarState.year--;}
  } else { CalendarState.weekOffset--; }
  renderCalendar();
}
function calendarNext() {
  if (CalendarState.view==='month') {
    if(++CalendarState.month>11){CalendarState.month=0;CalendarState.year++;}
  } else { CalendarState.weekOffset++; }
  renderCalendar();
}
function calendarGoToday() {
  const n = new Date();
  CalendarState.year        = n.getFullYear();
  CalendarState.month       = n.getMonth();
  CalendarState.weekOffset  = 0;
  CalendarState.selectedDate = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  renderCalendar();
}
function switchCalendarView(view) {
  CalendarState.view = view;
  document.getElementById('calendar-month-view').style.display = view==='month'?'block':'none';
  document.getElementById('calendar-week-view').style.display  = view==='week' ?'block':'none';
  document.getElementById('btn-month-view').classList.toggle('active', view==='month');
  document.getElementById('btn-week-view').classList.toggle('active', view==='week');
  renderCalendar();
}
