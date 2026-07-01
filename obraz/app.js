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
  tab:              'home',
  history:          [],
  currentScreen:    'home',
  service:          null,
  selectedDate:     null,
  selectedDateStr:  null,
  selectedSlot:     null,
  bookingOrigin:    'services',
  servicesCategory: 'Все',
  galleryCategory:  'Все',
  bookingsTab:      'upcoming',
  lightboxItem:     null,
  cancelBookingId:  null,
  bookings:         [],
  /* Мастер */
  isMaster:         false,
  masterData:       null,
  masterServices:   [],
  masterBookings:   null,
  masterClients:    null,
  masterSchedule:   null,
  masterGallery:    null,
  clientGallery:    null,
  editingService:   null,         /* услуга при редактировании */
  /* Слоты из API */
  slotsCache:       {},           /* { 'YYYY-MM-DD': [{time, available}] } */
  slotsLoading:     false,
  nextSlot:         undefined,    /* undefined=не загружен, null=нет слотов, {dateStr,slot} */
  nextSlotLoading:  false,
  canReview:        undefined,    /* undefined=не загружен, true/false — может ли клиент оставить отзыв */
  /* Отзывы */
  reviews:          null,         /* null = не загружены, [] = нет отзывов */
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
      serviceId: 'h1', serviceName: 'Женская стрижка',
      servicePrice: 35, serviceIcon: 'scissors',
      date: toDateStr(tomorrow), dateLabel: 'Завтра',
      slot: '11:00', status: 'confirmed',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo_2',
      serviceId: 'h3', serviceName: 'Окрашивание волос',
      servicePrice: 60, serviceIcon: 'color',
      date: toDateStr(lastWeek), dateLabel: formatDateLabel(lastWeek),
      slot: '14:00', status: 'completed',
      createdAt: lastWeek.toISOString(),
    },
    {
      id: 'demo_3',
      serviceId: 'h4', serviceName: 'Укладка и локоны',
      servicePrice: 30, serviceIcon: 'styling',
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
    if (direction !== 'none') {
      oldEl.classList.add(direction === 'back' ? 'leave-back' : 'leave-forward');
      setTimeout(() => oldEl.remove(), 260);
    } else {
      oldEl.remove();
    }
  }

  /* Анимация нового экрана (входит) */
  if (direction !== 'none') {
    newEl.classList.add(direction === 'back' ? 'enter-back' : 'enter-forward');
  }
  $container.appendChild(newEl);

  /* Убираем класс анимации после завершения */
  setTimeout(() => {
    newEl.classList.remove('enter-back', 'enter-forward');
  }, 260);

  /* Обновляем BackButton Telegram */
  updateBackButton();

  /* Показываем кнопку «Назад» в таб-баре на под-экранах */
  const ROOT_SCREENS = ['home', 'services', 'gallery', 'my-bookings', 'booking-success', 'master-home', 'master-bookings', 'master-services', 'master-profile', 'master-gallery'];
  const navBackBtn = document.getElementById('nav-back-btn');
  if (navBackBtn) {
    navBackBtn.style.display = ROOT_SCREENS.includes(screenId) ? 'none' : 'flex';
  }

  /* Вешаем события на новый экран */
  attachEvents(screenId, params);
}

function goBack() {
  if (state.history.length > 0) {
    const prev = state.history.pop();
    navigate(prev, {}, 'back');
  } else {
    switchTab('home');
  }
}

/* BackButton Telegram SDK */
function updateBackButton() {
  if (!tg) return;
  const noBackScreens = ['home', 'booking-success', 'onboarding'];
  if (noBackScreens.includes(state.currentScreen)) {
    tg.BackButton.hide();
  } else {
    tg.BackButton.show();
  }
}

if (tg) {
  tg.BackButton.onClick(goBack);
}

/* ============================================================
   5. НИЖНЯЯ НАВИГАЦИЯ
   ============================================================ */
document.getElementById('nav-back-btn')?.addEventListener('click', goBack);

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
    case 'onboarding':        return renderOnboarding();
    case 'home':              return renderHome();
    case 'services':          return renderServices();
    case 'service-detail':    return renderServiceDetail(params.service);
    case 'gallery':           return renderGallery();
    case 'my-bookings':       return renderMyBookings();
    case 'booking':           return renderBooking();
    case 'booking-confirm':   return renderBookingConfirm();
    case 'booking-success':   return renderBookingSuccess();
    /* Мастер */
    case 'master-home':       return renderMasterHome();
    case 'master-gallery':    return renderMasterGallery();
    case 'master-bookings':   return renderMasterBookings();
    case 'master-services':   return renderMasterServices();
    case 'master-service-form': return renderMasterServiceForm(params);
    case 'master-profile':    return renderMasterProfile();
    case 'master-clients':    return renderMasterClients();
    case 'master-schedule':   return renderMasterSchedule();
    default:                  return renderHome();
  }
}

/* Кнопка «Назад» для вставки в экраны */
function backBtn() {
  return `<button class="back-row" data-action="go-back">‹ Назад</button>`;
}

/* ── Главная ────────────────────────────────────────────────── */
function renderHome() {
  const upcomingBookings = state.bookings.filter(b => b.status !== 'completed' && b.status !== 'cancelled');

  /* Ближайший свободный слот.
     - tenant-режим: берём из backend (реальное расписание + брони), показываем,
       только если у мастера есть услуги (иначе бронировать нечего).
     - коробочный режим: локальный расчёт из data.js. */
  let next = null;  /* {dateStr, slot} */
  if (TENANT_ID) {
    if (SERVICES.length > 0) {
      if (state.nextSlot === undefined) loadNextSlot();        /* подтянуть и пере-отрисовать */
      else if (state.nextSlot)          next = state.nextSlot;
    }
  } else {
    const local = getNextAvailableSlot(upcomingBookings);
    if (local) next = { dateStr: local.dateStr, slot: local.slot };
  }

  /* Карточка ближайшего слота: метка, время, кнопка во всю ширину карточки. */
  const slotCard = next
    ? `<div class="next-slot-card">
        <div class="next-slot-label">Ближайшее свободное время</div>
        <div class="next-slot-time">${formatDateLabel(new Date(next.dateStr + 'T12:00:00'))}, ${next.slot}</div>
        <button class="next-slot-btn" data-action="book-slot"
          data-date="${next.dateStr}" data-slot="${next.slot}">Записаться</button>
      </div>`
    : '';

  const trust = SALON.reviewsCount > 0
    ? `<div class="hero-trust">
         <span class="hero-stars">★★★★★</span>
         <span class="hero-rating">${SALON.rating}</span>
         <span class="hero-reviews">· ${SALON.reviewsCount} отзывов</span>
       </div>`
    : '';

  const greeting = `<div class="home-greeting-prominent">Привет${USER_NAME ? ', ' + USER_NAME : ''}! 👋</div>`;
  const svcSub = SERVICES.length ? `${SERVICES.length} услуг` : 'прайс-лист';

  /* Блок «Оцените нас» — только для клиентов с завершённым визитом без оценки. */
  if (TENANT_ID && state.canReview === undefined) loadCanReview();
  const rateBlock = (TENANT_ID && state.canReview)
    ? `<div class="home-rate">
         <div class="home-rate-title">Оцените ваш визит</div>
         <div class="home-rate-stars">
           ${[1, 2, 3, 4, 5].map(i =>
             `<button class="home-rate-star" data-action="rate" data-rating="${i}">⭐</button>`
           ).join('')}
         </div>
       </div>`
    : '';

  return `
    <div class="home-header">
      ${SALON.photo
        ? `<div class="home-logo-wrap"><img src="${SALON.photo}" alt="${SALON.name}" class="home-logo"></div>`
        : `<div class="home-wordmark">
             <div class="home-wordmark-name">${SALON.name}</div>
             <div class="home-wordmark-rule"></div>
           </div>`}
      ${SALON.tagline ? `<div class="home-logo-slogan">${SALON.tagline}</div>` : ''}
      ${trust}
      ${greeting}
    </div>

    ${slotCard}

    <button class="btn home-cta" data-action="go-services">Записаться</button>

    <div class="home-nav-grid">
      <button class="home-nav-card" data-action="go-services">
        <span class="home-nav-icon">${svgIcon('list')}</span>
        <span class="home-nav-text">
          <span class="home-nav-label">Услуги и цены</span>
          <span class="home-nav-sub">${svcSub}</span>
        </span>
      </button>
      <button class="home-nav-card" data-action="go-gallery">
        <span class="home-nav-icon">${svgIcon('image')}</span>
        <span class="home-nav-text">
          <span class="home-nav-label">Фото работ</span>
          <span class="home-nav-sub">галерея</span>
        </span>
      </button>
      <button class="home-nav-card" data-action="go-bookings">
        <span class="home-nav-icon">${svgIcon('calendar')}</span>
        <span class="home-nav-text">
          <span class="home-nav-label">Мои записи</span>
          <span class="home-nav-sub">мои визиты</span>
        </span>
      </button>
    </div>

    ${rateBlock}

    ${renderReviewsBlock()}

    <div class="home-share-wrap">
      <button class="btn btn-secondary btn-share" data-action="share">👥 Поделиться с другом</button>
    </div>

    <div class="home-footer-info">
      ${SALON.address ? `<div class="home-footer-address">📍 ${SALON.address}</div>` : ''}
    </div>`;
}

/* ── Блок отзывов (главная страница) ───────────────────────── */
function renderReviewsBlock() {
  const rev = state.reviews;
  if (!rev || rev.total === 0) return '';

  const starsHtml = (n) => '⭐'.repeat(n);
  const cards = rev.items.slice(0, 5).map(r => `
    <div class="review-card">
      <div class="review-card-header">
        <span class="review-card-stars">${starsHtml(r.rating)}</span>
        <span class="review-card-date">${r.date.slice(0, 7).replace('-', '.')}</span>
      </div>
      <div class="review-card-service">${r.service_name}</div>
    </div>`).join('');

  const avgStars = rev.avg_rating ? Math.round(rev.avg_rating) : 0;

  return `
    <div class="reviews-block">
      <div class="reviews-block-header">
        <span class="reviews-block-title">Отзывы</span>
        <span class="reviews-block-avg">
          ${'★'.repeat(avgStars)}${'☆'.repeat(5 - avgStars)}
          <strong>${rev.avg_rating}</strong>
          <span class="reviews-block-count">· ${rev.total}</span>
        </span>
      </div>
      <div class="reviews-list">${cards}</div>
    </div>`;
}

/* ── Онбординг (первый запуск) ──────────────────────────────── */
function renderOnboarding() {
  const name = USER_NAME ? `, ${USER_NAME}` : '';
  return `
    <div class="onboarding-screen">
      <div class="onboarding-logo">💇‍♀️</div>
      <div class="onboarding-title">Добро пожаловать${name}!</div>
      <div class="onboarding-sub">Студия красоты <strong>${SALON.name}</strong></div>
      <div class="onboarding-list">
        <div class="onboarding-item">
          <span class="onboarding-item-icon">${svgIcon('list')}</span>
          <div>
            <div class="onboarding-item-title">Услуги и цены</div>
            <div class="onboarding-item-text">Стрижки, окрашивание, уход — всё с ценами и описанием</div>
          </div>
        </div>
        <div class="onboarding-item">
          <span class="onboarding-item-icon">${svgIcon('calendar')}</span>
          <div>
            <div class="onboarding-item-title">Онлайн-запись</div>
            <div class="onboarding-item-text">Выбери удобный день и время прямо здесь</div>
          </div>
        </div>
        <div class="onboarding-item">
          <span class="onboarding-item-icon">${svgIcon('image')}</span>
          <div>
            <div class="onboarding-item-title">Фото работ</div>
            <div class="onboarding-item-text">Посмотри работы мастеров перед записью</div>
          </div>
        </div>
      </div>
      <button class="btn btn-primary onboarding-btn" data-action="finish-onboarding">Начать</button>
    </div>`;
}

/* ── Каталог услуг ──────────────────────────────────────────── */
const CARD_GRADIENTS = {
  'Стрижки женские': 'linear-gradient(135deg,#02B0B1,#56C9C4)',  /* бирюза */
  'Стрижки мужские': 'linear-gradient(135deg,#3E8F9E,#6FC0C8)',  /* сине-бирюза */
  'Окрашивание':     'linear-gradient(135deg,#2BB87C,#04A764)',  /* зелёный (пипетка с refs/green.jpg #04A764) */
  'Укладка':         'linear-gradient(135deg,#F9A24E,#F48726)',  /* оранжевый (пипетка с refs/orang.jpg #F48726) */
  'Уход':            'linear-gradient(135deg,#2E86CC,#0468B3)',  /* синий (пипетка с refs/siniy.jpg #0468B3) */
};

/* ── Иконки (тонкие SVG line-icons, единый стиль) ────────────────
   Поле `icon` у услуг/галереи — это КЛЮЧ из ICONS. svgIcon() рисует
   SVG в 1em текущим цветом (currentColor). Если придёт не ключ, а
   эмодзи (мастер ввёл руками) — покажем как есть, ничего не сломается. */
const ICONS = {
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
  razor:    '<line x1="12" y1="3" x2="12" y2="13"/><rect x="6.5" y="13" width="11" height="3.4" rx="1.2"/><line x1="9" y1="16.4" x2="9" y2="18.6"/><line x1="12" y1="16.4" x2="12" y2="19"/><line x1="15" y1="16.4" x2="15" y2="18.6"/>',
  color:    '<path d="M4 20s3-1 5-3l8.4-8.4a2.1 2.1 0 0 0-3-3L6 14c-2 2-3 5-3 5z"/><line x1="13.3" y1="6.7" x2="17.3" y2="10.7"/>',
  styling:  '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h8"/>',
  care:     '<path d="M12 3.5s5.5 6 5.5 10.5a5.5 5.5 0 0 1-11 0C6.5 9.5 12 3.5 12 3.5z"/>',
  list:     '<circle cx="4.5" cy="7" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="17" r="1.2"/><line x1="9" y1="7" x2="20" y2="7"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="17" x2="20" y2="17"/>',
  image:    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 16l-5-5L5 21"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="3" x2="8" y2="6.5"/><line x1="16" y1="3" x2="16" y2="6.5"/>',
};

function svgIcon(key, cls) {
  const inner = ICONS[key];
  if (!inner) return `<span class="emoji-ic">${key != null ? key : ''}</span>`;
  return `<svg class="svg-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

function renderServices() {
  const filtered = state.servicesCategory === 'Все'
    ? SERVICES
    : SERVICES.filter(s => s.category === state.servicesCategory);

  const chips = SERVICE_CATEGORIES.map(cat =>
    `<button class="chip ${cat === state.servicesCategory ? 'active' : ''}"
      data-action="filter-services" data-cat="${cat}">${cat}</button>`
  ).join('');

  const cards = filtered.map(s => {
    const grad = CARD_GRADIENTS[s.category] || '';
    return `
    <button class="service-card${grad ? ' colored' : ''}" data-action="open-service" data-id="${s.id}"
      ${grad ? `style="background:${grad}"` : ''}>
      <div class="service-icon">${svgIcon(s.icon)}</div>
      <div class="service-name">${s.name}</div>
      <div class="service-price">${s.priceLabel}</div>
      <div class="service-duration">${s.durationLabel}</div>
    </button>`;
  }).join('');

  const grid = filtered.length
    ? `<div class="services-grid">${cards}</div>`
    : `<div class="empty-state">
         <div class="empty-icon">${svgIcon('scissors')}</div>
         <div class="empty-title">Каталог пока пуст</div>
         <div class="empty-text">Мастер ещё настраивает услуги и цены.<br>Загляните чуть позже.</div>
       </div>`;

  return `
    <div class="services-header">
      ${backBtn()}
      <div class="screen-title">Услуги и цены</div>
    </div>
    ${SERVICES.length ? `<div class="chips-row">${chips}</div>` : ''}
    ${grid}`;
}

/* ── Детали услуги ──────────────────────────────────────────── */
function renderServiceDetail(service) {
  if (!service) return renderServices();

  return `
    ${backBtn()}
    <div class="detail-sticky">
      <div class="detail-sticky-name">${service.name}</div>
      <div class="detail-sticky-price">${service.priceLabel}</div>
    </div>
    <div class="detail-img">${svgIcon(service.icon)}</div>
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
  if (TENANT_ID && !state.clientGallery) {
    loadClientGallery();
    return `<div style="padding:40px 16px;text-align:center;color:var(--tg-theme-hint-color)">Загрузка...</div>`;
  }

  const apiItems = (TENANT_ID && state.clientGallery)
    ? state.clientGallery.items.map(p => ({ id: p.id, img: p.url, title: p.title || '', category: p.category || 'Работы' }))
    : null;
  /* tenant-режим: только фото мастера (даже если их 0). Демо GALLERY — лишь для коробки. */
  const source = TENANT_ID ? (apiItems || []) : GALLERY;

  const categories = TENANT_ID
    ? ['Все', ...new Set(source.map(g => g.category))]
    : GALLERY_CATEGORIES;

  const filtered = state.galleryCategory === 'Все'
    ? source
    : source.filter(g => g.category === state.galleryCategory);

  const chips = categories.map(cat =>
    `<button class="chip ${cat === state.galleryCategory ? 'active' : ''}"
      data-action="filter-gallery" data-cat="${cat}">${cat}</button>`
  ).join('');

  const items = filtered.length === 0
    ? `<div class="empty-state">
         <div class="empty-icon">🖼️</div>
         <div class="empty-title">Здесь пока нет фото</div>
         <div class="empty-text">Мастер ещё не загрузил работы.<br>Загляните чуть позже.</div>
       </div>`
    : filtered.map(g => `
    <div class="gallery-item" ${g.img ? `data-action="open-lightbox" data-id="${g.id}"` : ''}>
      ${g.img
        ? `<img src="${g.img}" alt="${g.title}" style="width:100%;height:100%;object-fit:cover;display:block;">`
        : `<div class="gallery-placeholder"><span class="gallery-placeholder-icon">🖼️</span></div>`
      }
      <div class="gallery-overlay">
        <div class="gallery-item-title">${g.title}</div>
        <div class="gallery-item-cat">${g.category}</div>
      </div>
    </div>`
  ).join('');

  return `
    <div style="padding: 4px 16px 10px;">
      ${backBtn()}
      <div class="screen-title">Фото работ</div>
    </div>
    ${filtered.length ? `<div class="chips-row">${chips}</div>` : ''}
    ${filtered.length ? `<div class="gallery-grid" style="margin-top:8px">${items}</div>` : items}`;
}

async function loadClientGallery() {
  try {
    const data = await api.getGallery();
    state.clientGallery = data;
  } catch (e) {
    console.error('loadClientGallery error:', e);
    state.clientGallery = { items: [] };
  }
  if (state.currentScreen === 'gallery') navigate('gallery', {}, 'none');
}

/* ── Мои записи ─────────────────────────────────────────────── */
function renderMyBookings() {
  if (TENANT_ID && !state.apiBookings) {
    /* Запускаем загрузку и показываем скелетон */
    loadMyBookings();
    return `
      <div style="padding: 4px 16px 8px;">
        ${backBtn()}
        <div class="screen-title">Мои записи</div>
      </div>
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <div style="margin-top:12px;color:var(--hint)">Загрузка записей…</div>
      </div>`;
  }

  const bookingsList = state.apiBookings ?? state.bookings;
  const now = new Date();
  const upcoming = bookingsList.filter(b =>
    (b.status === 'confirmed' || b.status === 'pending') && new Date(b.date + 'T' + b.slot) > now
  );
  const history = bookingsList.filter(b =>
    b.status === 'completed' || b.status === 'cancelled' ||
    ((b.status === 'confirmed') && new Date(b.date + 'T' + b.slot) <= now)
  );

  const activeTab = state.bookingsTab;
  const tabContent = activeTab === 'upcoming'
    ? renderBookingList(upcoming, 'upcoming')
    : renderBookingList(history, 'history');

  return `
    <div style="padding: 4px 16px 8px;">
      ${backBtn()}
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

async function loadMyBookings() {
  try {
    const data = await api.getMyBookings();
    state.apiBookings = (data.items || []).map(b => ({
      id:           b.id,
      serviceId:    b.service_id || '',
      serviceName:  b.service_name,
      serviceIcon:  b.service_icon || 'scissors',
      servicePrice: b.service_price,
      date:         b.date,
      dateLabel:    formatDateLabel(new Date(b.date + 'T12:00:00')),
      slot:         b.slot,
      status:       b.status,
    }));
    if (state.currentScreen === 'my-bookings') navigate('my-bookings', {}, 'none');
  } catch {
    /* Ошибка API: фиксируем пустой результат, иначе рендер снова уйдёт в загрузку → бесконечный спиннер */
    state.apiBookings = [];
    if (state.currentScreen === 'my-bookings') navigate('my-bookings', {}, 'none');
  }
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
        <div class="empty-icon">${svgIcon('calendar')}</div>
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
        <div class="booking-card-service">${svgIcon(b.serviceIcon)} ${b.serviceName}</div>
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
  let slotsHtml = '<div style="padding:20px;text-align:center;color:var(--hint)">Выберите дату</div>';
  if (state.selectedDateStr) {
    /* Без API: сразу заполняем кэш из локальных данных */
    if (!TENANT_ID && !state.slotsCache[state.selectedDateStr]) {
      const d = state.selectedDate || new Date(state.selectedDateStr + 'T12:00:00');
      const working = isWorkDay(d);
      state.slotsCache[state.selectedDateStr] = {
        is_working: working,
        slots: working ? ALL_SLOTS.map(s => ({ time: s, available: !isBusy(state.selectedDateStr, s) })) : [],
      };
    }
    const cached = state.slotsCache[state.selectedDateStr];
    if (!cached) {
      /* Запрашиваем слоты из API (только когда TENANT_ID задан) */
      if (TENANT_ID) loadSlotsForDate(state.selectedDateStr);
      slotsHtml = '<div class="loading-state"><div class="loading-spinner"></div></div>';
    } else if (!cached.is_working) {
      slotsHtml = '<div style="padding:20px;text-align:center;color:var(--hint)">Нерабочий день</div>';
    } else {
      slotsHtml = (cached.slots || []).map(s => {
        const isActive = s.time === state.selectedSlot;
        return `
          <button class="slot-btn ${!s.available ? 'busy' : ''} ${isActive ? 'active' : ''}"
            data-action="select-slot" data-slot="${s.time}" ${!s.available ? 'disabled' : ''}>
            ${s.time}
          </button>`;
      }).join('');
      if (!slotsHtml) slotsHtml = '<div style="padding:20px;text-align:center;color:var(--hint)">Нет свободных слотов</div>';
    }
  }

  const continueDisabled = !state.selectedSlot ? 'disabled' : '';

  return `
    ${backBtn()}
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
    ${backBtn()}
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
        <label class="consent-row">
          <input type="checkbox" id="consent-cb">
          <span class="consent-text">Я согласен(на) на обработку персональных данных в соответствии с
            <a class="consent-link" href="https://tg-app-xi.vercel.app/privacy.html"
              onclick="if(window.Telegram?.WebApp){window.Telegram.WebApp.openLink(this.href);return false;}">
              Политикой конфиденциальности
            </a>
          </span>
        </label>
        <button class="btn btn-primary" id="confirm-btn" data-action="confirm-booking" disabled>Подтвердить запись</button>
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

$container.addEventListener('change', e => {
  const schedCb = e.target.closest('.sched-checkbox');
  if (schedCb) {
    const row = schedCb.closest('.sched-day-row');
    const times = row?.querySelector('.sched-day-times');
    if (times) times.classList.toggle('sched-hidden', !schedCb.checked);
  }
  const consentCb = e.target.closest('#consent-cb');
  if (consentCb) {
    const btn = document.getElementById('confirm-btn');
    if (btn) btn.disabled = !consentCb.checked;
  }
});

function handleAction(action, data, el) {
  switch (action) {

    /* Главная — переходы */
    case 'go-services':
      switchTab('services');
      break;

    case 'go-gallery':
      switchTab('gallery');
      if (TENANT_ID && !state.clientGallery) loadClientGallery();
      break;

    case 'go-bookings':
      if (state.justConfirmedBooking && tg) {
        tg.sendData(JSON.stringify(state.justConfirmedBooking));
        state.justConfirmedBooking = null;
        return;
      }
      state.justConfirmedBooking = null;
      switchTab('my-bookings');
      break;

    case 'go-home':
      /* Если только что подтвердили запись — отправляем данные боту для напоминаний */
      if (state.justConfirmedBooking && tg) {
        tg.sendData(JSON.stringify(state.justConfirmedBooking));
        state.justConfirmedBooking = null;
        return; /* tg.sendData() закрывает мини-апп */
      }
      state.justConfirmedBooking = null;
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

    /* Кнопка «Назад» в экране */
    case 'go-back':
      goBack();
      break;

    /* Изменить время — вернуться к выбору */
    case 'change-time':
      goBack();
      break;

    /* Подтвердить запись */
    case 'confirm-booking':
      confirmBooking();
      break;

    /* Завершить онбординг → перейти на главную */
    case 'finish-onboarding':
      localStorage.setItem(ONBOARDING_KEY, '1');
      navigate('home', {}, 'none');
      showOfferIfNeeded();
      break;

    /* Мастерская панель */
    case 'master-go-bookings':
    case 'master-go-services':
    case 'master-go-profile':
    case 'master-go-clients':
    case 'master-add-service':
    case 'master-edit-service':
    case 'master-delete-service':
    case 'master-save-service':
    case 'master-save-profile':
    case 'master-upload-avatar':
    case 'master-refresh-bookings':
    case 'master-go-schedule':
    case 'master-dur-btn':
    case 'master-save-schedule':
    case 'master-go-gallery':
    case 'master-upload-photo':
    case 'master-delete-photo':
    case 'master-complete-booking':
      handleMasterAction(action, data);
      break;

    /* Клиент ставит оценку (звёзды) — только если был завершённый визит */
    case 'rate': {
      const rating = parseInt(data.rating);
      if (rating) submitRating(rating);
      break;
    }

    /* Поделиться ботом с другом */
    case 'share': {
      const salonName = SALON.name || 'салон';
      const shareText = encodeURIComponent(`Записывайся в «${salonName}» прямо в Telegram 💇‍♀️`);
      /* Делимся ссылкой на бота — она открывается ВНУТРИ Telegram (не в браузере),
         в отличие от текущего URL с #tgWebAppData (это сессия/тема пользователя).
         Бот сам открывает мини-апп нужного салона (?t= подставляет backend по токену). */
      const BOT = 'test_salon_123_bot';
      const shareUrl  = encodeURIComponent(`https://t.me/${BOT}`);
      const link = `https://t.me/share/url?url=${shareUrl}&text=${shareText}`;
      if (tg) tg.openTelegramLink(link);
      else window.open(link, '_blank');
      break;
    }
  }
}

/* ============================================================
   8. ЛАЙТБОКС
   ============================================================ */
function openLightbox(item) {
  state.lightboxItem = item;

  document.getElementById('lightbox-img').innerHTML = item.img
    ? `<img src="${item.img}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div class="gallery-placeholder" style="width:100%;height:100%">
        <span style="font-size:72px;opacity:0.4">${svgIcon(item.icon)}</span>
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
  const service = SERVICES.find(s => s.id === state.lightboxItem.serviceId)
    || SERVICES.find(s => s.category === state.lightboxItem.category);
  closeLightbox();
  if (service) {
    state.service = service;
    state.selectedSlot = null;
    state.selectedDate = null;
    state.selectedDateStr = null;
    state.bookingOrigin = 'gallery';
    navigate('booking', {});
  } else {
    navigate('services', {}, 'none');
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

  document.getElementById('bs-confirm-cancel').onclick = async () => {
    if (TENANT_ID) {
      try {
        await api.cancelBooking(bookingId);
        state.apiBookings = null;
      } catch {
        showToast('Ошибка при отмене. Попробуйте ещё раз.');
        closeSheet();
        return;
      }
    } else {
      cancelBooking(bookingId);
    }
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
async function confirmBooking() {
  const s = state.service;
  if (!s || !state.selectedSlot || !state.selectedDateStr) return;

  const comment = document.getElementById('comment-field')?.value?.trim() || null;

  if (TENANT_ID) {
    const btn = document.querySelector('[data-action="confirm-booking"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Подождите…'; }

    /* Если ID не UUID — значит услуги не загрузились из API, перезагружаем */
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s.id);
    if (!isUUID) {
      const fresh = await api.getServices().catch(() => null);
      if (fresh) {
        applyServices(fresh);
        const match = SERVICES.find(sv => sv.name === s.name) || SERVICES.find(sv => sv.category === s.category);
        if (match) state.service = match;
      }
    }

    try {
      await api.createBooking({
        service_id: (state.service || s).id,
        date:       state.selectedDateStr,
        slot:       state.selectedSlot,
        comment,
      });
      /* сбрасываем кэш слотов — слот занят */
      delete state.slotsCache[state.selectedDateStr];
      state.apiBookings = null; /* сбросим кэш записей */
      state.nextSlot = undefined; /* «ближайший слот» пересчитается */
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Подтвердить запись'; }
      if (e.status === 409) {
        showToast('Этот слот только что заняли. Выберите другое время.');
        navigate('booking', {}, 'back');
      } else {
        showToast('Ошибка при записи. Попробуйте ещё раз.');
      }
      return;
    }
  } else {
    /* fallback: localStorage если нет tenant_id */
    const bookingId = 'bk_' + Date.now();
    addBooking({
      id:           bookingId,
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
    /* Сохраняем для отправки боту через tg.sendData на экране успеха */
    state.justConfirmedBooking = {
      type:        'booking_confirmed',
      id:          bookingId,
      serviceName: s.name,
      date:        state.selectedDateStr,
      slot:        state.selectedSlot,
    };
  }

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
   13. ОФФЕР — показываем один раз при первом открытии
   ============================================================ */
const OFFER_LS_KEY = 'yuzena_offer_shown';

function showOfferIfNeeded() {
  return;  /* оффер со скидкой отключён (старый артефакт со ссылкой на удалённого бота) */

  if (localStorage.getItem(OFFER_LS_KEY)) return;

  const overlay = document.getElementById('offer-overlay');
  overlay.classList.remove('hidden');

  function closeOffer() {
    localStorage.setItem(OFFER_LS_KEY, '1');
    overlay.classList.add('hidden');
  }

  document.getElementById('offer-skip').addEventListener('click', closeOffer);

  document.getElementById('offer-backdrop').addEventListener('click', closeOffer);

  document.getElementById('offer-cta').addEventListener('click', e => {
    localStorage.setItem(OFFER_LS_KEY, '1');
    if (tg) {
      e.preventDefault();
      tg.openTelegramLink('https://t.me/test_salon_123_bot?start=from_app');
    }
    overlay.classList.add('hidden');
  });
}

/* ============================================================
   14. ВСПОМОГАТЕЛЬНЫЕ API-ФУНКЦИИ
   ============================================================ */

async function loadSlotsForDate(dateStr) {
  if (state.slotsCache[dateStr] !== undefined) return;
  state.slotsCache[dateStr] = null; /* помечаем как «в загрузке» */
  try {
    const data = await api.getSlots(dateStr);
    state.slotsCache[dateStr] = data;
  } catch {
    state.slotsCache[dateStr] = { is_working: false, slots: [] };
  }
  if (state.currentScreen === 'booking') navigate('booking', {}, 'none');
}

async function loadNextSlot() {
  if (state.nextSlotLoading) return;            /* защита от повторных запросов */
  state.nextSlotLoading = true;
  try {
    const d = await api.getNextSlot();
    state.nextSlot = (d && d.date) ? { dateStr: d.date, slot: d.slot } : null;
  } catch {
    state.nextSlot = null;
  }
  state.nextSlotLoading = false;
  if (state.currentScreen === 'home') navigate('home', {}, 'none');
}

async function loadCanReview() {
  if (state.canReview !== undefined) return;    /* грузим один раз */
  state.canReview = false;                      /* помечаем как «загружается» */
  try {
    const d = await api.canReview();
    state.canReview = !!(d && d.can_review);
  } catch {
    state.canReview = false;
  }
  if (state.currentScreen === 'home') navigate('home', {}, 'none');
}

async function submitRating(rating) {
  try {
    await api.submitReview(rating);
    state.canReview = false;
    showToast('Спасибо за оценку! 🌟 Отзыв отправлен мастеру.');
    if (state.currentScreen === 'home') navigate('home', {}, 'none');
  } catch (e) {
    showToast(e?.detail?.message || 'Не удалось отправить оценку');
  }
}

function applyConfig(config) {
  SALON.name    = config.salon_name  || SALON.name;
  SALON.tagline = config.tagline     || SALON.tagline;
  SALON.address = config.address     || SALON.address;
  SALON.mapUrl  = config.map_url     || SALON.mapUrl;
  SALON.phone   = config.phone       || SALON.phone;
  SALON.photo   = config.avatar_url  || SALON.photo;
  if (config.theme?.accent)  document.documentElement.style.setProperty('--accent',  config.theme.accent);
  if (config.theme?.accent2) document.documentElement.style.setProperty('--accent2', config.theme.accent2);
  if (config.theme?.accent3) document.documentElement.style.setProperty('--accent3', config.theme.accent3);
  if (config.theme?.bg)      document.documentElement.style.setProperty('--bg',      config.theme.bg);
  if (SALON.name) document.title = SALON.name;   /* вкладка = имя салона мастера */
}

function applyServices(items) {
  SERVICES.length = 0;
  items.forEach(s => SERVICES.push({
    id:            s.id,
    category:      s.category,
    name:          s.name,
    description:   s.description || '',
    price:         s.price,
    priceLabel:    s.price_label,
    duration:      s.duration,
    durationLabel: s.duration_label,
    icon:          s.icon || 'scissors',
  }));
  SERVICE_CATEGORIES.length = 0;
  SERVICE_CATEGORIES.push('Все', ...new Set(SERVICES.map(s => s.category)));
}

/* ============================================================
   15. ЗАПУСК ПРИЛОЖЕНИЯ
   ============================================================ */
const ONBOARDING_KEY = 'yuzena_onboarding_done';

async function initApp() {
  loadBookings();

  if (TENANT_ID) {
    /* tenant-режим: данные берём только из API. Сбрасываем демо-услуги
       из data.js, чтобы они не «протекли» в запись (фейковые id s1… → 500). */
    applyServices([]);

    /* Чистим демо-бренд «Афродиты» — название, слоган, лого, адрес, рейтинг
       придут из config мастера. Пустой салон → нейтральные заглушки. */
    SALON.name = 'Салон';
    SALON.tagline = '';
    SALON.address = '';
    SALON.mapUrl = '';
    SALON.phone = '';
    SALON.photo = null;
    SALON.rating = null;
    SALON.reviewsCount = 0;

    try {
      /* Загружаем конфиг и проверяем мастера параллельно */
      const [configRes, masterRes] = await Promise.allSettled([
        api.getConfig(),
        api.getMasterProfile(),
      ]);

      if (configRes.status === 'fulfilled') applyConfig(configRes.value);

      if (masterRes.status === 'fulfilled') {
        state.isMaster   = true;
        state.masterData = masterRes.value;
        document.getElementById('nav-master-btn')?.classList.remove('hidden');
      }

      /* Загружаем услуги и отзывы из API */
      const [svcRes, revRes] = await Promise.allSettled([
        api.getServices(),
        api.getReviews(),
      ]);
      if (svcRes.status === 'fulfilled') applyServices(svcRes.value);
      if (revRes.status === 'fulfilled') {
        state.reviews = revRes.value;
        /* рейтинг в подвале — из реальных отзывов мастера */
        if (revRes.value && revRes.value.total > 0) {
          SALON.rating = revRes.value.avg_rating;
          SALON.reviewsCount = revRes.value.total;
        }
      }

    } catch (e) {
      console.warn('API init error:', e);
    }
  }

  if (!localStorage.getItem(ONBOARDING_KEY)) {
    navigate('onboarding', {}, 'none');
  } else {
    navigate('home', {}, 'none');
    showOfferIfNeeded();
  }
}

/* ============================================================
   16. ПАНЕЛЬ МАСТЕРА — РЕНДЕР ЭКРАНОВ
   ============================================================ */

function renderMasterHome() {
  const m = state.masterData;
  return `
    <div class="master-header">
      <div class="master-header-title">Панель мастера</div>
      <div class="master-header-salon">${m?.salon_name || SALON.name}</div>
      <div class="master-header-plan">
        <span class="plan-badge ${m?.plan === 'pro' ? 'plan-pro' : 'plan-free'}">
          ${m?.plan === 'pro' ? '⭐ PRO' : 'Free'}
        </span>
      </div>
    </div>
    <div class="master-nav-grid">
      <button class="master-nav-card" data-action="master-go-bookings">
        <div class="master-nav-icon">${svgIcon('calendar')}</div>
        <div class="master-nav-label">Записи</div>
        <div class="master-nav-sub">Клиенты сегодня</div>
      </button>
      <button class="master-nav-card" data-action="master-go-services">
        <div class="master-nav-icon">${svgIcon('list')}</div>
        <div class="master-nav-label">Услуги</div>
        <div class="master-nav-sub">${SERVICES.length} позиций</div>
      </button>
      <button class="master-nav-card" data-action="master-go-profile">
        <div class="master-nav-icon">⚙️</div>
        <div class="master-nav-label">Профиль</div>
        <div class="master-nav-sub">Название, адрес</div>
      </button>
      <button class="master-nav-card" data-action="master-go-clients">
        <div class="master-nav-icon">👥</div>
        <div class="master-nav-label">Клиенты</div>
        <div class="master-nav-sub">База клиентов</div>
      </button>
      <button class="master-nav-card" data-action="master-go-schedule">
        <div class="master-nav-icon">🕐</div>
        <div class="master-nav-label">Расписание</div>
        <div class="master-nav-sub">Часы работы</div>
      </button>
      <button class="master-nav-card" data-action="master-go-gallery">
        <div class="master-nav-icon">🖼️</div>
        <div class="master-nav-label">Галерея</div>
        <div class="master-nav-sub">Фото работ</div>
      </button>
    </div>`;
}

function renderMasterBookings() {
  if (!state.masterBookings) {
    loadMasterBookings();
    return `
      <div class="master-screen-header">
        <div class="screen-title">Записи клиентов</div>
      </div>
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <div style="margin-top:12px;color:var(--hint)">Загрузка…</div>
      </div>`;
  }

  const items = state.masterBookings.items || [];
  const today = new Date().toISOString().slice(0, 10);
  const todayItems = items.filter(b => b.date === today && b.status !== 'cancelled');
  const upcoming   = items.filter(b => b.date > today && b.status !== 'cancelled');

  function bookingRow(b) {
    const statusLabel = { confirmed:'Подтверждена', pending:'Ожидает', completed:'Завершена', cancelled:'Отменена' };
    const statusCls   = { confirmed:'status-confirmed', pending:'status-pending', completed:'status-completed', cancelled:'status-cancelled' };
    const canComplete = b.status === 'confirmed' && b.date <= today;
    return `
      <div class="booking-card">
        <div class="booking-card-date">${b.date}, ${b.slot}</div>
        <div class="booking-card-service">${svgIcon(b.service_icon || 'scissors')} ${b.service_name}</div>
        <div class="booking-card-footer">
          <span class="status-badge ${statusCls[b.status] || ''}">${statusLabel[b.status] || b.status}</span>
          <span style="font-size:12px;color:var(--hint)">${b.service_price} руб.</span>
        </div>
        ${canComplete ? `<button class="btn-complete-booking" data-action="master-complete-booking" data-id="${b.id}">✓ Выполнено</button>` : ''}
      </div>`;
  }

  return `
    <div class="master-screen-header">
      <div class="screen-title">Записи клиентов</div>
      <button class="master-refresh-btn" data-action="master-refresh-bookings">↻</button>
    </div>
    ${todayItems.length ? `
      <div class="master-section-label">Сегодня (${todayItems.length})</div>
      ${todayItems.map(bookingRow).join('')}` : `
      <div class="master-section-label">Сегодня</div>
      <div class="empty-state" style="padding:16px">
        <div class="empty-icon">☀️</div>
        <div class="empty-title">Записей на сегодня нет</div>
      </div>`}
    ${upcoming.length ? `
      <div class="master-section-label">Предстоящие (${upcoming.length})</div>
      ${upcoming.slice(0, 20).map(bookingRow).join('')}` : ''}
    ${!items.length ? `
      <div class="empty-state">
        <div class="empty-icon">${svgIcon('calendar')}</div>
        <div class="empty-title">Записей пока нет</div>
        <div class="empty-text">Здесь появятся записи клиентов</div>
      </div>` : ''}`;
}

function renderMasterGallery() {
  if (!state.masterGallery) {
    loadMasterGallery();
    return `
      <div class="master-screen-header"><div class="screen-title">Фото работ</div></div>
      <div class="loading-state"><div class="loading-spinner"></div></div>`;
  }
  const items = state.masterGallery.items || [];
  return `
    <div class="master-screen-header">
      <div class="screen-title">Фото работ</div>
      <button class="master-add-btn" data-action="master-upload-photo">+ Фото</button>
    </div>
    <input type="file" id="gallery-file-input" accept="image/*" capture="environment" style="display:none">
    ${items.length ? `
      <div class="master-gallery-grid">
        ${items.map(p => `
          <div class="master-gallery-item">
            <img src="${p.url}" alt="${p.category}" loading="lazy">
            <button class="master-gallery-delete" data-action="master-delete-photo" data-id="${p.id}">×</button>
          </div>`).join('')}
      </div>` : `
      <div class="empty-state">
        <div class="empty-icon">${svgIcon('image')}</div>
        <div class="empty-title">Нет фото</div>
        <div class="empty-text">Добавьте фотографии своих работ</div>
      </div>`}`;
}

async function loadMasterGallery() {
  try {
    const data = await api.getMasterGallery();
    state.masterGallery = data;
  } catch (e) {
    console.error('loadMasterGallery error:', e);
    state.masterGallery = { items: [] };
  }
  if (state.currentScreen === 'master-gallery') navigate('master-gallery', {}, 'none');
}

async function loadMasterBookings() {
  try {
    const data = await api.getMasterBookings({ limit: 50 });
    state.masterBookings = data;
    if (state.currentScreen === 'master-bookings') navigate('master-bookings', {}, 'none');
  } catch {
    state.masterBookings = { items: [] };
    if (state.currentScreen === 'master-bookings') navigate('master-bookings', {}, 'none');
  }
}

function renderMasterServices() {
  const items = state.masterServices.length ? state.masterServices : SERVICES;
  return `
    <div class="master-screen-header">
      <div class="screen-title">Услуги</div>
      <button class="master-add-btn" data-action="master-add-service">+ Добавить</button>
    </div>
    ${items.length ? items.map(s => `
      <div class="master-service-row">
        <div class="master-service-row-icon">${svgIcon(s.icon || 'scissors')}</div>
        <div class="master-service-row-info">
          <div class="master-service-row-name">${s.name}</div>
          <div class="master-service-row-meta">${s.price_label || s.priceLabel} · ${s.duration_label || s.durationLabel}</div>
        </div>
        <div class="master-service-row-actions">
          <button class="master-icon-btn" data-action="master-edit-service" data-id="${s.id}" title="Редактировать">✏️</button>
          <button class="master-icon-btn danger" data-action="master-delete-service" data-id="${s.id}" title="Удалить">🗑️</button>
        </div>
      </div>`).join('') : `
      <div class="empty-state">
        <div class="empty-icon">${svgIcon('scissors')}</div>
        <div class="empty-title">Услуг пока нет</div>
        <div class="empty-text">Добавьте первую услугу</div>
      </div>`}`;
}

function renderMasterServiceForm(params = {}) {
  const s = params.service || state.editingService;
  const isEdit = !!s;
  return `
    <div class="master-screen-header">
      ${backBtn()}
      <div class="screen-title">${isEdit ? 'Редактировать услугу' : 'Новая услуга'}</div>
    </div>
    <form class="master-form" id="service-form" data-action-submit="master-save-service">
      <div class="master-form-group">
        <label class="master-form-label">Название *</label>
        <input class="master-form-input" id="sf-name" type="text" placeholder="Женская стрижка" value="${s?.name || ''}" required>
      </div>
      <div class="master-form-group">
        <label class="master-form-label">Категория</label>
        <input class="master-form-input" id="sf-category" type="text" placeholder="Стрижка" value="${s?.category || ''}">
      </div>
      <div class="master-form-row">
        <div class="master-form-group">
          <label class="master-form-label">Цена (руб.)</label>
          <input class="master-form-input" id="sf-price" type="number" min="0" placeholder="500" value="${s?.price || ''}">
        </div>
        <div class="master-form-group">
          <label class="master-form-label">Длительность (мин)</label>
          <input class="master-form-input" id="sf-duration" type="number" min="1" placeholder="60" value="${s?.duration || ''}">
        </div>
      </div>
      <div class="master-form-group">
        <label class="master-form-label">Описание</label>
        <textarea class="master-form-textarea" id="sf-description" placeholder="Описание услуги…">${s?.description || ''}</textarea>
      </div>
      <div class="master-form-group">
        <label class="master-form-label">Иконка (эмодзи)</label>
        <input class="master-form-input" id="sf-icon" type="text" placeholder="✂️" value="${s?.icon || '✂️'}" maxlength="4">
      </div>
      <button class="btn btn-primary master-form-submit" data-action="master-save-service">
        ${isEdit ? 'Сохранить' : 'Добавить услугу'}
      </button>
    </form>`;
}

function renderMasterProfile() {
  const m = state.masterData;
  return `
    <div class="master-screen-header">
      <div class="screen-title">Профиль салона</div>
    </div>
    <form class="master-form" id="profile-form">
      <div class="master-form-group">
        <label class="master-form-label">Логотип</label>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
          ${m?.avatar_url
            ? `<img src="${m.avatar_url}" alt="Логотип" style="width:64px;height:64px;border-radius:12px;object-fit:cover;flex-shrink:0">`
            : `<div style="width:64px;height:64px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:30px;background:linear-gradient(135deg,#FFAAC8,#C4B5FD)">💇‍♀️</div>`}
          <button type="button" class="btn btn-secondary" data-action="master-upload-avatar" style="flex:1;margin:0">
            ${m?.avatar_url ? 'Заменить логотип' : 'Загрузить логотип'}
          </button>
        </div>
        <input type="file" id="avatar-file-input" accept="image/*" style="display:none">
      </div>
      <div class="master-form-group">
        <label class="master-form-label">Название салона</label>
        <input class="master-form-input" id="pf-name" type="text" value="${m?.salon_name || ''}" placeholder="Мой салон">
      </div>
      <div class="master-form-group">
        <label class="master-form-label">Слоган</label>
        <input class="master-form-input" id="pf-tagline" type="text" value="${m?.tagline || ''}" placeholder="Стрижки и окрашивание">
      </div>
      <div class="master-form-group">
        <label class="master-form-label">Адрес</label>
        <input class="master-form-input" id="pf-address" type="text" value="${m?.address || ''}" placeholder="г. Город, ул. Улица, 1">
      </div>
      <div class="master-form-group">
        <label class="master-form-label">Телефон</label>
        <input class="master-form-input" id="pf-phone" type="tel" value="${m?.phone || ''}" placeholder="+375 29 000-00-00">
      </div>
      <button class="btn btn-primary master-form-submit" data-action="master-save-profile">Сохранить</button>
    </form>`;
}

function renderMasterClients() {
  if (!state.masterClients) {
    loadMasterClients();
    return `
      <div class="master-screen-header">
        <div class="screen-title">Клиенты</div>
      </div>
      <div class="loading-state">
        <div class="loading-spinner"></div>
      </div>`;
  }

  const items = state.masterClients.items || [];
  return `
    <div class="master-screen-header">
      <div class="screen-title">Клиенты (${state.masterClients.total || 0})</div>
    </div>
    ${items.length ? items.map(c => `
      <div class="master-client-row">
        <div class="master-client-avatar">${(c.first_name || '?')[0].toUpperCase()}</div>
        <div class="master-client-info">
          <div class="master-client-name">${c.first_name || ''} ${c.last_name || ''}</div>
          <div class="master-client-meta">
            ${c.username ? '@' + c.username + ' · ' : ''}
            Визитов: ${c.visit_count}
          </div>
        </div>
      </div>`).join('') : `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <div class="empty-title">Клиентов пока нет</div>
        <div class="empty-text">Клиенты появятся после первых записей</div>
      </div>`}`;
}

async function loadMasterClients() {
  try {
    const data = await api.getMasterClients();
    state.masterClients = data;
    if (state.currentScreen === 'master-clients') navigate('master-clients', {}, 'none');
  } catch {
    state.masterClients = { items: [], total: 0 };
    if (state.currentScreen === 'master-clients') navigate('master-clients', {}, 'none');
  }
}

/* ============================================================
   17. ПАНЕЛЬ МАСТЕРА — ОБРАБОТЧИКИ СОБЫТИЙ
   ============================================================ */

async function handleMasterAction(action, data) {
  switch (action) {
    case 'master-go-gallery':
      state.masterGallery = null;
      navigate('master-gallery', {}, 'none');
      break;

    case 'master-upload-photo': {
      const input = document.getElementById('gallery-file-input');
      if (!input) break;
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const btn = document.querySelector('[data-action="master-upload-photo"]');
        if (btn) { btn.textContent = 'Загрузка…'; btn.disabled = true; }
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('category', 'Работы');
          await api.uploadGalleryPhoto(fd);
          showToast('Фото добавлено!');
          state.masterGallery = null;
          navigate('master-gallery', {}, 'none');
        } catch (err) {
          const msg = err?.detail?.message || err?.message || 'Ошибка загрузки';
          showToast(msg);
        }
        input.value = '';
      };
      input.click();
      break;
    }

    case 'master-delete-photo': {
      if (!confirm('Удалить фото?')) break;
      try {
        await api.deleteGalleryPhoto(data.id);
        showToast('Фото удалено');
        state.masterGallery = null;
        navigate('master-gallery', {}, 'none');
      } catch {
        showToast('Ошибка при удалении');
      }
      break;
    }

    case 'master-go-bookings':
      state.masterBookings = null;
      navigate('master-bookings', {}, 'none');
      break;

    case 'master-refresh-bookings':
      state.masterBookings = null;
      navigate('master-bookings', {}, 'none');
      break;

    case 'master-complete-booking': {
      try {
        await api.completeBooking(data.id);
        showToast('Выполнено! Клиенту отправлен запрос на отзыв');
        state.masterBookings = null;
        navigate('master-bookings', {}, 'none');
      } catch {
        showToast('Ошибка. Попробуйте ещё раз');
      }
      break;
    }

    case 'master-go-services':
      await refreshMasterServices();
      navigate('master-services', {}, 'none');
      break;

    case 'master-go-profile':
      navigate('master-profile', {}, 'none');
      break;

    case 'master-go-clients':
      state.masterClients = null;
      navigate('master-clients', {}, 'none');
      break;

    case 'master-add-service':
      state.editingService = null;
      navigate('master-service-form', {}, 'forward');
      break;

    case 'master-edit-service': {
      const allSvcs = state.masterServices.length ? state.masterServices : SERVICES;
      const svc = allSvcs.find(s => s.id === data.id);
      if (!svc) break;
      state.editingService = svc;
      navigate('master-service-form', { service: svc }, 'forward');
      break;
    }

    case 'master-delete-service': {
      if (!confirm('Удалить услугу?')) break;
      try {
        await api.deleteService(data.id);
        showToast('Услуга удалена');
        await refreshMasterServices();
        navigate('master-services', {}, 'none');
      } catch {
        showToast('Ошибка при удалении');
      }
      break;
    }

    case 'master-save-service': {
      const name     = document.getElementById('sf-name')?.value?.trim();
      const category = document.getElementById('sf-category')?.value?.trim() || 'Услуга';
      const price    = parseFloat(document.getElementById('sf-price')?.value) || 0;
      const duration = parseInt(document.getElementById('sf-duration')?.value) || 60;
      const desc     = document.getElementById('sf-description')?.value?.trim() || '';
      const icon     = document.getElementById('sf-icon')?.value?.trim() || '✂️';

      if (!name) { showToast('Введите название услуги'); break; }

      const payload = {
        name, category, price, duration,
        description:    desc,
        price_label:    `${price} руб.`,
        duration_label: `${duration} мин`,
        icon,
      };

      const btn = document.querySelector('[data-action="master-save-service"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }

      try {
        if (state.editingService) {
          await api.updateService(state.editingService.id, payload);
          showToast('Услуга обновлена');
        } else {
          await api.createService(payload);
          showToast('Услуга добавлена');
        }
        state.editingService = null;
        await refreshMasterServices();
        goBack();
      } catch {
        showToast('Ошибка при сохранении');
        if (btn) { btn.disabled = false; btn.textContent = state.editingService ? 'Сохранить' : 'Добавить услугу'; }
      }
      break;
    }

    case 'master-go-schedule':
      state.masterSchedule = null;
      navigate('master-schedule', {}, 'none');
      break;

    case 'master-dur-btn':
      document.querySelectorAll('.sched-dur-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`.sched-dur-btn[data-dur="${data.dur}"]`)?.classList.add('active');
      break;

    case 'master-save-schedule': {
      const form = document.getElementById('master-schedule-form');
      if (!form) break;
      const durBtn = form.querySelector('.sched-dur-btn.active');
      const slotDuration = durBtn ? parseInt(durBtn.dataset.dur) : 60;
      const schedule = [];
      form.querySelectorAll('.sched-day-row').forEach(row => {
        const wd = parseInt(row.dataset.weekday);
        const cb = row.querySelector('.sched-checkbox');
        const startIn = row.querySelector('[data-field="start"]');
        const endIn   = row.querySelector('[data-field="end"]');
        schedule.push({
          weekday:       wd,
          is_working:    cb.checked,
          start_time:    startIn.value || '09:00',
          end_time:      endIn.value   || '19:00',
          slot_duration: slotDuration,
        });
      });
      const btn = document.querySelector('[data-action="master-save-schedule"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
      try {
        await api.updateMasterSchedule({ schedule });
        state.masterSchedule = schedule;
        showToast('Расписание сохранено ✓');
        haptic('success');
      } catch {
        showToast('Ошибка при сохранении');
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Сохранить расписание'; }
      break;
    }

    case 'master-save-profile': {
      const payload = {
        salon_name: document.getElementById('pf-name')?.value?.trim(),
        tagline:    document.getElementById('pf-tagline')?.value?.trim(),
        address:    document.getElementById('pf-address')?.value?.trim(),
        phone:      document.getElementById('pf-phone')?.value?.trim(),
      };

      const btn = document.querySelector('[data-action="master-save-profile"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }

      try {
        await api.updateMasterProfile(payload);
        /* обновляем локальные данные */
        if (state.masterData) Object.assign(state.masterData, payload);
        applyConfig({ salon_name: payload.salon_name, tagline: payload.tagline, address: payload.address, phone: payload.phone });
        showToast('Профиль сохранён');
        if (btn) { btn.disabled = false; btn.textContent = 'Сохранить'; }
      } catch {
        showToast('Ошибка при сохранении');
        if (btn) { btn.disabled = false; btn.textContent = 'Сохранить'; }
      }
      break;
    }

    case 'master-upload-avatar': {
      const input = document.getElementById('avatar-file-input');
      if (!input) break;
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const btn = document.querySelector('[data-action="master-upload-avatar"]');
        const prevText = btn ? btn.textContent : '';
        if (btn) { btn.textContent = 'Загрузка…'; btn.disabled = true; }
        try {
          const fd = new FormData();
          fd.append('file', file);
          const res = await api.uploadAvatar(fd);
          if (state.masterData) state.masterData.avatar_url = res.avatar_url;
          SALON.photo = res.avatar_url;   /* лого сразу появится на главной */
          showToast('Логотип обновлён!');
          navigate('master-profile', {}, 'none');
        } catch (err) {
          const msg = err?.detail?.message || err?.message || 'Ошибка загрузки';
          showToast(msg);
          if (btn) { btn.textContent = prevText; btn.disabled = false; }
        }
        input.value = '';
      };
      input.click();
      break;
    }
  }
}

async function refreshMasterServices() {
  try {
    const data = await api.getMasterServices();
    state.masterServices = (data.items || []).map(s => ({
      id:            s.id,
      name:          s.name,
      category:      s.category,
      price:         s.price,
      price_label:   s.price_label,
      priceLabel:    s.price_label,
      duration:      s.duration,
      duration_label:s.duration_label,
      durationLabel: s.duration_label,
      icon:          s.icon,
      description:   s.description || '',
    }));
    /* Обновляем и клиентский список */
    applyServices(data.items || []);
  } catch {
    /* оставляем как есть */
  }
}

/* ── Расписание ─────────────────────────────────────────────── */
function renderMasterSchedule() {
  const DAY_NAMES = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  if (!state.masterSchedule) {
    loadMasterSchedule();
    return `
      <div class="master-screen-header">
        <div class="screen-title">Расписание</div>
      </div>
      <div class="loading-state"><div class="loading-spinner"></div></div>`;
  }

  const sched = state.masterSchedule;
  const dur = sched[0]?.slot_duration || 60;

  return `
    <div class="master-screen-header">
      <div class="screen-title">Расписание</div>
    </div>
    <div class="master-form" id="master-schedule-form">
      <div class="master-form-group">
        <div class="master-form-label">Длительность слота</div>
        <div class="sched-dur-row">
          ${[30, 60, 90].map(d => `
            <button class="sched-dur-btn${d === dur ? ' active' : ''}"
              data-action="master-dur-btn" data-dur="${d}">${d} мин</button>
          `).join('')}
        </div>
      </div>
      <div class="master-form-group">
        <div class="master-form-label">Рабочие дни</div>
        <div class="sched-days-list">
          ${sched.map(day => `
            <div class="sched-day-row" data-weekday="${day.weekday}">
              <div class="sched-day-name">${DAY_NAMES[day.weekday]}</div>
              <div class="sched-day-times${day.is_working ? '' : ' sched-hidden'}">
                <input type="time" class="sched-time-input" data-field="start" value="${day.start_time}">
                <span class="sched-dash">—</span>
                <input type="time" class="sched-time-input" data-field="end" value="${day.end_time}">
              </div>
              <label class="sched-toggle-label">
                <input type="checkbox" class="sched-checkbox" data-weekday="${day.weekday}"${day.is_working ? ' checked' : ''}>
                <span class="sched-toggle-track"><span class="sched-toggle-thumb"></span></span>
              </label>
            </div>
          `).join('')}
        </div>
      </div>
      <button class="btn btn-primary master-form-submit" data-action="master-save-schedule">Сохранить расписание</button>
    </div>`;
}

async function loadMasterSchedule() {
  try {
    const data = await api.getMasterSchedule();
    state.masterSchedule = data.schedule;
  } catch {
    state.masterSchedule = Array.from({ length: 7 }, (_, wd) => ({
      weekday: wd, is_working: wd < 6,
      start_time: '09:00', end_time: '19:00', slot_duration: 60,
    }));
  }
  if (state.currentScreen === 'master-schedule') navigate('master-schedule', {}, 'none');
}

initApp();
