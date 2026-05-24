/* ============================================================
   app.js — главный файл приложения «Южена»
   Роутер, рендер всех экранов, обработчики событий
   ============================================================ */

/* ============================================================
   1. ИНИЦИАЛИЗАЦИЯ TELEGRAM SDK
   ============================================================ */
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand(); /* полноэкранный режим */

  /* Синхронизируем CSS-переменные с темой Telegram */
  const tp = tg.themeParams || {};
  const root = document.documentElement;
  if (tp.bg_color)            root.style.setProperty('--tg-theme-bg-color', tp.bg_color);
  if (tp.secondary_bg_color)  root.style.setProperty('--tg-theme-secondary-bg-color', tp.secondary_bg_color);
  if (tp.text_color)          root.style.setProperty('--tg-theme-text-color', tp.text_color);
  if (tp.hint_color)          root.style.setProperty('--tg-theme-hint-color', tp.hint_color);
  if (tp.button_color)        root.style.setProperty('--tg-theme-button-color', tp.button_color);
  if (tp.button_text_color)   root.style.setProperty('--tg-theme-button-text-color', tp.button_text_color);
  if (tp.link_color)          root.style.setProperty('--tg-theme-link-color', tp.link_color);

  /* Слушаем смену темы (пользователь может переключить прямо в TMA) */
  tg.onEvent('themeChanged', () => {
    const p = tg.themeParams || {};
    if (p.bg_color)           root.style.setProperty('--tg-theme-bg-color', p.bg_color);
    if (p.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', p.secondary_bg_color);
    if (p.text_color)         root.style.setProperty('--tg-theme-text-color', p.text_color);
    if (p.hint_color)         root.style.setProperty('--tg-theme-hint-color', p.hint_color);
  });
}

/* Имя пользователя из Telegram (только для UI) */
const USER_NAME = tg?.initDataUnsafe?.user?.first_name || '';

/* ============================================================
   2. СОСТОЯНИЕ ПРИЛОЖЕНИЯ
   ============================================================ */
const state = {
  tab:              'home',        /* активная вкладка нижней навигации */
  history:          [],            /* стек экранов для кнопки «назад» */
  currentScreen:    'home',        /* текущий экран */
  service:          null,          /* выбранная услуга (объект из SERVICES) */
  selectedDate:     null,          /* Date-объект */
  selectedDateStr:  null,          /* '2026-05-26' */
  selectedSlot:     null,          /* '11:00' */
  bookingOrigin:    'services',    /* откуда пришли в booking */
  servicesCategory: 'Все',
  galleryCategory:  'Все',
  bookingsTab:      'upcoming',    /* 'upcoming' | 'history' */
  lightboxItem:     null,          /* элемент галереи для лайтбокса */
  cancelBookingId:  null,          /* id записи, которую отменяем */
  bookings:         [],            /* все записи (из localStorage) */
};

/* ============================================================
   3. LOCALSTORAGE — хранение записей
   ============================================================ */
const LS_KEY = 'yuzhenа_bookings';

function loadBookings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    state.bookings = raw ? JSON.parse(raw) : getSampleBookings();
    if (!raw) saveBookings(); /* сохраняем примеры при первом запуске */
  } catch {
    state.bookings = getSampleBookings();
  }
}

function saveBookings() {
  localStorage.setItem(LS_KEY, JSON.stringify(state.bookings));
}

/* Несколько примеров записей для первого запуска */
function getSampleBookings() {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7);
  const twoWeeks = new Date(); twoWeeks.setDate(twoWeeks.getDate() - 14);

  return [
    {
      id: 'demo_1',
      serviceId: 's1', serviceName: 'Женская стрижка',
      servicePrice: 25, serviceIcon: '✂️',
      date: toDateStr(tomorrow), dateLabel: 'Завтра',
      slot: '11:00', status: 'confirmed',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo_2',
      serviceId: 's4', serviceName: 'Однотонное окрашивание',
      servicePrice: 50, serviceIcon: '🎨',
      date: toDateStr(lastWeek), dateLabel: formatDateLabel(lastWeek),
      slot: '14:00', status: 'completed',
      createdAt: lastWeek.toISOString(),
    },
    {
      id: 'demo_3',
      serviceId: 's9', serviceName: 'Восстанавливающая маска',
      servicePrice: 20, serviceIcon: '💆',
      date: toDateStr(twoWeeks), dateLabel: formatDateLabel(twoWeeks),
      slot: '10:00', status: 'completed',
      createdAt: twoWeeks.toISOString(),
    },
  ];
}

function addBooking(booking) {
  state.bookings.unshift(booking);
  saveBookings();
}

function cancelBooking(id) {
  const b = state.bookings.find(x => x.id === id);
  if (b) { b.status = 'cancelled'; saveBookings(); }
}

/* ============================================================
   4. РОУТЕР / НАВИГАЦИЯ
   ============================================================ */
const $container = document.getElementById('screen-container');

/* Показать экран с анимацией.
   direction: 'forward' | 'back' | 'none' */
function navigate(screenId, params = {}, direction = 'forward') {
  /* Сохраняем историю только при движении вперёд */
  if (direction === 'forward') {
    state.history.push(state.currentScreen);
  }

  state.currentScreen = screenId;

  /* Рендерим HTML нового экрана */
  const html = renderScreen(screenId, params);
  const newEl = document.createElement('div');
  newEl.className = 'screen';
  newEl.innerHTML = html;

  /* Анимация старого экрана (уходит) */
  const oldEl = $container.querySelector('.screen');
  if (oldEl) {
    oldEl.classList.add(direction === 'back' ? 'leave-back' : 'leave-forward');
    setTimeout(() => oldEl.remove(), 260);
  }

  /* Анимация нового экрана (входит) */
  newEl.classList.add(direction === 'back' ? 'enter-back' : 'enter-forward');
  $container.appendChild(newEl);

  /* Убираем класс анимации после завершения */
  setTimeout(() => {
    newEl.classList.remove('enter-back', 'enter-forward');
  }, 260);

  /* Обновляем BackButton Telegram */
  updateBackButton();

  /* Вешаем события на новый экран */
  attachEvents(screenId, params);
}

function goBack() {
  if (state.history.length === 0) return;
  const prev = state.history.pop();
  navigate(prev, {}, 'back');
}

/* BackButton Telegram SDK */
function updateBackButton() {
  if (!tg) return;
  const rootScreens = ['home', 'services', 'gallery', 'my-bookings'];
  if (state.history.length > 0 && !rootScreens.includes(state.currentScreen)) {
    tg.BackButton.show();
  } else {
    tg.BackButton.hide();
  }
}

if (tg) {
  tg.BackButton.onClick(goBack);
}

/* ============================================================
   5. НИЖНЯЯ НАВИГАЦИЯ
   ============================================================ */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === state.tab && tab === state.currentScreen) return;

    /* Обновляем активный таб */
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.tab = tab;

    /* Сбрасываем историю при переходе между табами */
    state.history = [];
    navigate(tab, {}, 'none');
  });
});

/* ============================================================
   6. РЕНДЕР ЭКРАНОВ
   ============================================================ */
function renderScreen(id, params) {
  switch (id) {
    case 'home':           return renderHome();
    case 'services':       return renderServices();
    case 'service-detail': return renderServiceDetail(params.service);
    case 'gallery':        return renderGallery();
    case 'my-bookings':    return renderMyBookings();
    case 'booking':        return renderBooking();
    case 'booking-confirm':return renderBookingConfirm();
    case 'booking-success':return renderBookingSuccess();
    default:               return renderHome();
  }
}

/* ── Главная ────────────────────────────────────────────────── */
function renderHome() {
  const upcomingBookings = state.bookings.filter(b => b.status !== 'completed' && b.status !== 'cancelled');
  const next = getNextAvailableSlot(upcomingBookings);
  const slotHtml = next
    ? `<div class="next-slot-card">
        <div>
          <div class="next-slot-label">Ближайший свободный слот</div>
          <div class="next-slot-time">${formatDateLabel(next.date)}, ${next.slot}</div>
        </div>
        <button class="next-slot-btn" data-action="book-slot"
          data-date="${next.dateStr}" data-slot="${next.slot}">Записаться</button>
      </div>`
    : `<div class="next-slot-card" style="justify-content:center">
        <span style="font-size:14px;color:var(--hint)">Нет свободных слотов на ближайшие 2 недели</span>
      </div>`;

  const greeting = USER_NAME ? `<div style="font-size:14px;color:var(--hint);margin-bottom:6px">Привет, ${USER_NAME} 👋</div>` : '';

  return `
    <div class="home-header">
      ${greeting}
      <div class="home-salon-name">${SALON.name}</div>
      <div class="home-salon-address">${SALON.address}</div>
      <div class="home-tagline">${SALON.tagline}</div>
      <div class="home-rating">
        <span class="rating-stars">★★★★★</span>
        <span class="rating-val">${SALON.rating}</span>
        <span class="rating-count">· ${SALON.reviewsCount} отзывов</span>
      </div>
    </div>

    ${slotHtml}

    <div style="padding: 4px 16px 8px;">
      <button class="btn btn-primary home-book-btn" data-action="go-services">Записаться</button>
    </div>

    <div class="home-nav-grid">
      <button class="home-nav-card" data-action="go-services">
        <span class="home-nav-icon">✂️</span>
        <span class="home-nav-label">Услуги и цены</span>
      </button>
      <button class="home-nav-card" data-action="go-gallery">
        <span class="home-nav-icon">📸</span>
        <span class="home-nav-label">Фото работ</span>
      </button>
      <button class="home-nav-card" data-action="go-bookings">
        <span class="home-nav-icon">📅</span>
        <span class="home-nav-label">Мои записи</span>
      </button>
    </div>`;
}

/* ── Каталог услуг ──────────────────────────────────────────── */
function renderServices() {
  const filtered = state.servicesCategory === 'Все'
    ? SERVICES
    : SERVICES.filter(s => s.category === state.servicesCategory);

  const chips = SERVICE_CATEGORIES.map(cat =>
    `<button class="chip ${cat === state.servicesCategory ? 'active' : ''}"
      data-action="filter-services" data-cat="${cat}">${cat}</button>`
  ).join('');

  const cards = filtered.map(s => `
    <button class="service-card" data-action="open-service" data-id="${s.id}">
      <div class="service-icon">${s.icon}</div>
      <div class="service-info">
        <div class="service-name">${s.name}</div>
        <div class="service-desc">${s.description.split('.')[0]}</div>
        <div class="service-meta">
          <span class="service-price">${s.priceLabel}</span>
          <span class="service-duration">· ${s.durationLabel}</span>
        </div>
      </div>
      <span class="service-arrow">›</span>
    </button>`
  ).join('');

  return `
    <div class="services-header">
      <div class="screen-title">Услуги и цены</div>
    </div>
    <div class="chips-row">${chips}</div>
    <div style="margin-top:10px">${cards}</div>`;
}

/* ── Детали услуги ──────────────────────────────────────────── */
function renderServiceDetail(service) {
  if (!service) return renderServices();

  return `
    <div class="detail-sticky">
      <div class="detail-sticky-name">${service.name}</div>
      <div class="detail-sticky-price">${service.priceLabel}</div>
    </div>
    <div class="detail-img">${service.icon}</div>
    <div class="detail-body">
      <div class="detail-name">${service.name}</div>
      <div class="detail-description">${service.description}</div>
      <div class="detail-stats">
        <div class="detail-stat">
          <div class="detail-stat-val">${service.priceLabel}</div>
          <div class="detail-stat-key">Стоимость</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-val">${service.durationLabel}</div>
          <div class="detail-stat-key">Длительность</div>
        </div>
      </div>
      <button class="btn btn-primary" data-action="start-booking">
        Записаться на эту услугу
      </button>
    </div>`;
}

/* ── Галерея ────────────────────────────────────────────────── */
function renderGallery() {
  const filtered = state.galleryCategory === 'Все'
    ? GALLERY
    : GALLERY.filter(g => g.category === state.galleryCategory);

  const chips = GALLERY_CATEGORIES.map(cat =>
    `<button class="chip ${cat === state.galleryCategory ? 'active' : ''}"
      data-action="filter-gallery" data-cat="${cat}">${cat}</button>`
  ).join('');

  const items = filtered.map(g => `
    <div class="gallery-item" data-action="open-lightbox" data-id="${g.id}">
      <div class="gallery-placeholder">
        <span class="gallery-placeholder-icon">${g.icon}</span>
      </div>
      <div class="gallery-overlay">
        <div class="gallery-item-title">${g.title}</div>
        <div class="gallery-item-cat">${g.category}</div>
      </div>
    </div>`
  ).join('');

  return `
    <div style="padding: 16px 16px 10px;">
      <div class="screen-title">Фото работ</div>
    </div>
    <div class="chips-row">${chips}</div>
    <div class="gallery-grid" style="margin-top:8px">${items}</div>`;
}

/* ── Мои записи ─────────────────────────────────────────────── */
function renderMyBookings() {
  const now = new Date();
  const upcoming = state.bookings.filter(b =>
    (b.status === 'confirmed' || b.status === 'pending') && new Date(b.date + 'T' + b.slot) > now
  );
  const history = state.bookings.filter(b =>
    b.status === 'completed' || b.status === 'cancelled' ||
    ((b.status === 'confirmed') && new Date(b.date + 'T' + b.slot) <= now)
  );

  const activeTab = state.bookingsTab;

  const tabContent = activeTab === 'upcoming'
    ? renderBookingList(upcoming, 'upcoming')
    : renderBookingList(history, 'history');

  return `
    <div style="padding: 16px 16px 8px;">
      <div class="screen-title">Мои записи</div>
    </div>
    <div class="tabs-row">
      <button class="tab-btn ${activeTab === 'upcoming' ? 'active' : ''}"
        data-action="switch-tab" data-tab="upcoming">Предстоящие (${upcoming.length})</button>
      <button class="tab-btn ${activeTab === 'history' ? 'active' : ''}"
        data-action="switch-tab" data-tab="history">История</button>
    </div>
    ${tabContent}`;
}

function renderBookingList(list, type) {
  if (!list.length) {
    const msg = type === 'upcoming'
      ? 'Записей пока нет'
      : 'История пуста';
    const sub = type === 'upcoming'
      ? 'Запишитесь на первую процедуру — это займёт меньше минуты'
      : 'Завершённые записи появятся здесь';
    return `
      <div class="empty-state">
        <div class="empty-icon">${type === 'upcoming' ? '📅' : '🕐'}</div>
        <div class="empty-title">${msg}</div>
        <div class="empty-text">${sub}</div>
        ${type === 'upcoming' ? '<button class="btn btn-primary mt16" style="max-width:220px" data-action="go-services">Записаться</button>' : ''}
      </div>`;
  }

  return list.map(b => {
    const statusMap = {
      confirmed: ['Подтверждена', 'status-confirmed'],
      pending:   ['Ожидает',      'status-pending'],
      completed: ['Завершена',    'status-completed'],
      cancelled: ['Отменена',     'status-cancelled'],
    };
    const [label, cls] = statusMap[b.status] || ['—', ''];

    const action = type === 'upcoming'
      ? `<button class="btn-cancel-text" data-action="cancel-booking" data-id="${b.id}">Отменить</button>`
      : `<button class="btn-rebook-text" data-action="rebook" data-id="${b.id}">Записаться снова</button>`;

    return `
      <div class="booking-card">
        <div class="booking-card-date">${b.dateLabel}, ${b.slot}</div>
        <div class="booking-card-service">${b.serviceIcon || ''} ${b.serviceName}</div>
        <div class="booking-card-footer">
          <span class="status-badge ${cls}">${label}</span>
          ${action}
        </div>
      </div>`;
  }).join('');
}

/* ── Выбор даты и времени ───────────────────────────────────── */
function renderBooking() {
  const service = state.service;
  if (!service) return renderServices();

  const days = getNext14Days();
  const bookedKeys = new Set(
    state.bookings
      .filter(b => b.status !== 'cancelled')
      .map(b => b.date + '_' + b.slot)
  );

  /* Определяем выбранную дату (или первую рабочую) */
  if (!state.selectedDate) {
    const firstWork = days.find(d => isWorkDay(d));
    if (firstWork) {
      state.selectedDate = firstWork;
      state.selectedDateStr = toDateStr(firstWork);
    }
  }

  /* Строка дат */
  const datesHtml = days.map(d => {
    const str = toDateStr(d);
    const work = isWorkDay(d);
    const { day, num, month } = formatDateShort(d);
    const isActive = str === state.selectedDateStr;
    return `
      <button class="date-btn ${isActive ? 'active' : ''} ${!work ? 'disabled' : ''}"
        data-action="select-date" data-date="${str}" data-ts="${d.getTime()}">
        <span class="date-day">${day}</span>
        <span class="date-num">${num}</span>
        <span class="date-month">${month}</span>
      </button>`;
  }).join('');

  /* Слоты для выбранной даты */
  const slotsHtml = state.selectedDateStr
    ? ALL_SLOTS.map(slot => {
        const key = state.selectedDateStr + '_' + slot;
        const busy = isBusy(state.selectedDateStr, slot) || bookedKeys.has(key);
        const isActive = slot === state.selectedSlot;
        return `
          <button class="slot-btn ${busy ? 'busy' : ''} ${isActive ? 'active' : ''}"
            data-action="select-slot" data-slot="${slot}" ${busy ? 'disabled' : ''}>
            ${slot}
          </button>`;
      }).join('')
    : '<div style="padding:20px;text-align:center;color:var(--hint)">Выберите дату</div>';

  const continueDisabled = !state.selectedSlot ? 'disabled' : '';

  return `
    <div class="booking-sticky">
      <div class="booking-sticky-name">${service.name}</div>
      <div class="booking-sticky-price">${service.priceLabel}</div>
    </div>
    <div class="dates-row">${datesHtml}</div>
    <div class="slots-section">
      <div class="slots-label">Свободное время</div>
      <div class="slots-grid">${slotsHtml}</div>
    </div>
    <div class="booking-action">
      <button class="btn btn-primary" data-action="go-confirm" ${continueDisabled}>Продолжить</button>
    </div>`;
}

/* ── Подтверждение записи ───────────────────────────────────── */
function renderBookingConfirm() {
  const s = state.service;
  const dateLabel = state.selectedDate ? formatDateLabel(state.selectedDate) : '—';

  return `
    <div class="confirm-body">
      <div class="screen-title">Проверьте запись</div>
      <div class="confirm-card">
        <div class="confirm-row">
          <span class="confirm-key">Услуга</span>
          <span class="confirm-val">${s?.name || '—'}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-key">Дата и время</span>
          <span class="confirm-val">${dateLabel}, ${state.selectedSlot || '—'}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-key">Стоимость</span>
          <span class="confirm-val confirm-price-val">${s?.priceLabel || '—'}</span>
        </div>
        <div class="confirm-row" style="flex-direction:column;align-items:flex-start;gap:4px">
          <span class="confirm-key">Адрес</span>
          <span class="confirm-val" style="max-width:100%;text-align:left">${SALON.address}</span>
          <a class="confirm-map-link" href="${SALON.mapUrl}" target="_blank"
            onclick="if(tg){tg.openLink('${SALON.mapUrl}');return false;}">
            Открыть в картах ↗
          </a>
        </div>
      </div>
      <div>
        <div style="font-size:14px;color:var(--hint);margin-bottom:8px">Комментарий мастеру (необязательно)</div>
        <textarea class="comment-field" id="comment-field"
          placeholder="Пожелания или уточнения"></textarea>
      </div>
      <div class="confirm-actions">
        <button class="btn btn-primary" data-action="confirm-booking">Подтвердить запись</button>
        <button class="btn btn-secondary" data-action="change-time">Изменить время</button>
      </div>
    </div>`;
}

/* ── Успех ──────────────────────────────────────────────────── */
function renderBookingSuccess() {
  const s = state.service;
  const dateLabel = state.selectedDate ? formatDateLabel(state.selectedDate) : '—';

  return `
    <div class="success-screen">
      <div class="success-icon">✅</div>
      <div class="success-title">Вы записаны!</div>
      <div class="success-text">Ждём вас в салоне. Мы напомним за 2 часа до визита.</div>
      <div class="success-summary">
        <div class="success-summary-row">
          <span>Услуга</span><span>${s?.name || '—'}</span>
        </div>
        <div class="success-summary-row">
          <span>Дата</span><span>${dateLabel}</span>
        </div>
        <div class="success-summary-row">
          <span>Время</span><span>${state.selectedSlot || '—'}</span>
        </div>
        <div class="success-summary-row">
          <span>Стоимость</span><span style="color:var(--accent)">${s?.priceLabel || '—'}</span>
        </div>
      </div>
      <div class="success-actions">
        <button class="btn btn-primary" data-action="go-home">На главную</button>
        <button class="btn btn-secondary" data-action="go-bookings">Мои записи</button>
      </div>
    </div>`;
}

/* ============================================================
   7. ОБРАБОТЧИКИ СОБЫТИЙ
   ============================================================ */

/* Делегирование событий — один обработчик на весь контейнер */
$container.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  handleAction(btn.dataset.action, btn.dataset, btn);
});

function handleAction(action, data, el) {
  switch (action) {

    /* Главная — переходы */
    case 'go-services':
      switchTab('services');
      break;

    case 'go-gallery':
      switchTab('gallery');
      break;

    case 'go-bookings':
      switchTab('my-bookings');
      break;

    case 'go-home':
      switchTab('home');
      break;

    /* Быстрая запись на ближайший слот с главной */
    case 'book-slot': {
      const date = new Date(parseInt(data.date.replace(/-/g, '/').replace(/(\d{4})\/(\d{2})\/(\d{2})/, '$1/$2/$3')));
      /* Находим первую рабочую услугу (стрижка) */
      state.service = SERVICES[0];
      state.selectedDateStr = data.date;
      state.selectedDate = new Date(data.date + 'T12:00:00');
      state.selectedSlot = data.slot;
      state.bookingOrigin = 'home';
      navigate('booking-confirm', {});
      break;
    }

    /* Фильтр услуг */
    case 'filter-services':
      state.servicesCategory = data.cat;
      navigate('services', {}, 'none');
      break;

    /* Открыть детали услуги */
    case 'open-service': {
      const service = SERVICES.find(s => s.id === data.id);
      if (!service) break;
      state.service = service;
      state.selectedSlot = null;
      state.selectedDate = null;
      state.selectedDateStr = null;
      state.bookingOrigin = 'services';
      navigate('service-detail', { service });
      break;
    }

    /* Из деталей услуги → бронирование */
    case 'start-booking':
      navigate('booking', {});
      break;

    /* Фильтр галереи */
    case 'filter-gallery':
      state.galleryCategory = data.cat;
      navigate('gallery', {}, 'none');
      break;

    /* Лайтбокс */
    case 'open-lightbox': {
      const item = GALLERY.find(g => g.id === data.id);
      if (!item) break;
      openLightbox(item);
      break;
    }

    /* Переключение вкладок в «Мои записи» */
    case 'switch-tab':
      state.bookingsTab = data.tab;
      navigate('my-bookings', {}, 'none');
      break;

    /* Отменить запись — открыть подтверждение */
    case 'cancel-booking':
      state.cancelBookingId = data.id;
      openCancelSheet(data.id);
      break;

    /* Записаться снова */
    case 'rebook': {
      const booking = state.bookings.find(b => b.id === data.id);
      if (!booking) break;
      const service = SERVICES.find(s => s.id === booking.serviceId);
      if (!service) break;
      state.service = service;
      state.selectedSlot = null;
      state.selectedDate = null;
      state.selectedDateStr = null;
      state.bookingOrigin = 'my-bookings';
      switchTab('services');
      navigate('booking', {});
      break;
    }

    /* Выбор даты в бронировании */
    case 'select-date': {
      state.selectedDateStr = data.date;
      state.selectedDate = new Date(data.date + 'T12:00:00');
      state.selectedSlot = null; /* сбрасываем время при смене даты */
      navigate('booking', {}, 'none');
      break;
    }

    /* Выбор слота */
    case 'select-slot': {
      haptic('selection');
      state.selectedSlot = data.slot;
      navigate('booking', {}, 'none');
      break;
    }

    /* Продолжить к подтверждению */
    case 'go-confirm':
      navigate('booking-confirm', {});
      break;

    /* Изменить время — вернуться к выбору */
    case 'change-time':
      goBack();
      break;

    /* Подтвердить запись */
    case 'confirm-booking':
      confirmBooking();
      break;
  }
}

/* ============================================================
   8. ЛАЙТБОКС
   ============================================================ */
function openLightbox(item) {
  state.lightboxItem = item;

  document.getElementById('lightbox-img').innerHTML =
    `<div class="gallery-placeholder" style="width:100%;height:100%">
      <span style="font-size:72px;opacity:0.4">${item.icon}</span>
    </div>`;
  document.getElementById('lightbox-title').textContent = item.title;

  const lb = document.getElementById('lightbox');
  lb.classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  state.lightboxItem = null;
}

document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
document.getElementById('lightbox-x').addEventListener('click', closeLightbox);
document.getElementById('lightbox-book').addEventListener('click', () => {
  if (!state.lightboxItem) return;
  const service = SERVICES.find(s => s.id === state.lightboxItem.serviceId);
  closeLightbox();
  if (service) {
    state.service = service;
    state.selectedSlot = null;
    state.selectedDate = null;
    state.selectedDateStr = null;
    state.bookingOrigin = 'gallery';
    navigate('booking', {});
  }
});

/* ============================================================
   9. BOTTOM SHEET (отмена записи)
   ============================================================ */
function openCancelSheet(bookingId) {
  const booking = state.bookings.find(b => b.id === bookingId);
  if (!booking) return;

  document.getElementById('bs-body').innerHTML = `
    <div class="bs-title">Отменить запись?</div>
    <div class="bs-detail">${booking.serviceName} · ${booking.dateLabel}, ${booking.slot}</div>
    <div class="bs-actions">
      <button class="btn btn-danger" id="bs-confirm-cancel">Да, отменить</button>
      <button class="btn btn-secondary" id="bs-keep">Не отменять</button>
    </div>`;

  document.getElementById('bottom-sheet').classList.remove('hidden');

  document.getElementById('bs-confirm-cancel').onclick = () => {
    cancelBooking(bookingId);
    closeSheet();
    haptic('error');
    showToast('Запись отменена');
    setTimeout(() => navigate('my-bookings', {}, 'none'), 300);
  };

  document.getElementById('bs-keep').onclick = closeSheet;
}

function closeSheet() {
  document.getElementById('bottom-sheet').classList.add('hidden');
}

document.getElementById('bs-close').addEventListener('click', closeSheet);

/* ============================================================
   10. БРОНИРОВАНИЕ — финальное подтверждение
   ============================================================ */
function confirmBooking() {
  const s = state.service;
  if (!s || !state.selectedSlot || !state.selectedDateStr) return;

  const id = 'bk_' + Date.now();
  addBooking({
    id,
    serviceId:    s.id,
    serviceName:  s.name,
    servicePrice: s.price,
    serviceIcon:  s.icon,
    date:         state.selectedDateStr,
    dateLabel:    formatDateLabel(state.selectedDate),
    slot:         state.selectedSlot,
    status:       'confirmed',
    createdAt:    new Date().toISOString(),
  });

  haptic('success');
  navigate('booking-success', {});
}

/* ============================================================
   11. ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК (нижняя навигация)
   ============================================================ */
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (navBtn) navBtn.classList.add('active');
  state.tab = tab;
  state.history = [];
  navigate(tab, {}, 'none');
}

/* ============================================================
   12. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ============================================================ */

/* Toast уведомление (2.5 сек) */
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2500);
}

/* Haptic feedback */
function haptic(type) {
  if (!tg?.HapticFeedback) return;
  switch (type) {
    case 'selection': tg.HapticFeedback.selectionChanged(); break;
    case 'success':   tg.HapticFeedback.notificationOccurred('success'); break;
    case 'error':     tg.HapticFeedback.notificationOccurred('error'); break;
    case 'tap':       tg.HapticFeedback.impactOccurred('light'); break;
  }
}

/* attachEvents вызывается после рендера каждого экрана.
   Здесь можно добавить специфические события, не покрытые делегированием. */
function attachEvents(screenId) {
  /* Пока всё обрабатывается через делегирование в $container.
     Место для будущих специфических событий. */
}

/* ============================================================
   13. ЗАПУСК ПРИЛОЖЕНИЯ
   ============================================================ */
loadBookings();
navigate('home', {}, 'none');
