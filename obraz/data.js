/* ============================================================
   data.js — демо-студия «Образ»
   Демо-витрина мини-аппа записи (не клиентские данные).
   ============================================================ */

/* ---------- Конфигурация салона ---------------------------- */
const SALON = {
  name:         'Образ',
  tagline:      'красота как искусство',
  address:      'г. Минск, ул. Зыбицкая, 9',
  mapUrl:       'https://maps.google.com/?q=Минск,Зыбицкая,9',
  phone:        '+375 29 762-10-10',
  rating:       5.0,
  reviewsCount: 86,
  photo:        null,   /* нет логотипа — на главной показываем типографский вордмарк «Образ» */
};

/* ---------- Рабочее время ---------------------------------- */
const WORK = {
  startHour: 9,
  endHour:   19,
  days: [1,2,3,4,5,6], /* 1=пн … 6=сб, 0=вс */
};

function buildSlots() {
  const slots = [];
  for (let h = WORK.startHour; h < WORK.endHour; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
  }
  return slots;
}

const ALL_SLOTS = buildSlots();

/* ---------- Услуги (демо-набор студии «Образ», только волосы) ---
   5 карточек: по одной на категорию. Порядок категорий здесь = порядок
   чипов-фильтров на экране «Услуги». Цены условные, демо. */
const SERVICES = [

  {
    id: 'h1', category: 'Стрижки женские',
    name: 'Женская стрижка',
    description: 'Модельная стрижка любой сложности с учётом структуры волос и формы лица. Включает укладку феном.',
    price: 35, priceLabel: 'от 35 руб.',
    duration: 60, durationLabel: '1 час',
    icon: 'scissors',
  },
  {
    id: 'h2', category: 'Стрижки мужские',
    name: 'Мужская стрижка',
    description: 'Классические и современные мужские стрижки, моделирование, стрижка машинкой, оформление контуров.',
    price: 20, priceLabel: 'от 20 руб.',
    duration: 30, durationLabel: '30 мин',
    icon: 'razor',
  },
  {
    id: 'h3', category: 'Окрашивание',
    name: 'Окрашивание волос',
    description: 'От однотонного тонирования до сложных техник — балаяж, AirTouch, мелирование. Подбор оттенка под образ.',
    price: 60, priceLabel: 'от 60 руб.',
    duration: 120, durationLabel: '2–3 часа',
    icon: 'color',
  },
  {
    id: 'h4', category: 'Укладка',
    name: 'Укладка и локоны',
    description: 'Вечерняя или повседневная укладка: мягкие локоны, голливудская волна, прикорневой объём.',
    price: 30, priceLabel: 'от 30 руб.',
    duration: 45, durationLabel: '45 мин',
    icon: 'styling',
  },
  {
    id: 'h5', category: 'Уход',
    name: 'Уход и восстановление',
    description: 'Глубокое восстановление, ботокс, кератиновое разглаживание, питательные маски. Блеск и гладкость надолго.',
    price: 45, priceLabel: 'от 45 руб.',
    duration: 60, durationLabel: '1 час',
    icon: 'care',
  },
];

const SERVICE_CATEGORIES = ['Все', ...new Set(SERVICES.map(s => s.category))];

/* ---------- Галерея ---------------------------------------- */
const GALLERY = [
  { id: 'g1',  category: 'Стрижки женские', title: 'Каскад на длинные',    serviceId: 'h1', icon: 'scissors', img: 'photos/cascad-cut.jpg' },
  { id: 'g2',  category: 'Стрижки женские', title: 'Боб с чёлкой',         serviceId: 'h1', icon: 'scissors', img: 'photos/bob-kare-s-chelkoy-foto.jpg' },
  { id: 'g3',  category: 'Стрижки женские', title: 'Pixie cut',            serviceId: 'h1', icon: 'scissors', img: 'photos/pixie-cut.jpg' },
  { id: 'g4',  category: 'Стрижки женские', title: 'Многослойная стрижка', serviceId: 'h1', icon: 'scissors', img: 'photos/sloy-cut.jpg' },
  { id: 'g5',  category: 'Укладка',         title: 'Вечерняя укладка',     serviceId: 'h4', icon: 'styling', img: 'photos/evening-hairstyle.jpg' },
  { id: 'g6',  category: 'Укладка',         title: 'Локоны',               serviceId: 'h4', icon: 'styling', img: 'photos/hairstyle-medium.jpg' },
  { id: 'g7',  category: 'Укладка',         title: 'Прикорневой объём',    serviceId: 'h4', icon: 'styling', img: 'photos/root-volume.jpg' },
  { id: 'g8',  category: 'Окрашивание',     title: 'Балаяж пепельный',     serviceId: 'h3', icon: 'color', img: 'photos/ash-balayage.jpg' },
  { id: 'g9',  category: 'Окрашивание',     title: 'Балаяж русый',         serviceId: 'h3', icon: 'color', img: 'photos/balayage-light.jpg' },
  { id: 'g10', category: 'Окрашивание',     title: 'Мелирование тонкое',   serviceId: 'h3', icon: 'color', img: 'photos/highlighting2.jpg' },
  { id: 'g11', category: 'Окрашивание',     title: 'Однотонный шоколад',   serviceId: 'h3', icon: 'color', img: 'photos/solid-chocolade1.jpg' },
  { id: 'g12', category: 'Окрашивание',     title: 'Авторское окрашивание',serviceId: 'h3', icon: 'color', img: 'photos/correr-hair.jpg' },
];

const GALLERY_CATEGORIES = ['Все', ...new Set(GALLERY.map(g => g.category))];

/* ---------- Вспомогательные функции для дат/слотов --------- */

function isWorkDay(date) {
  return WORK.days.includes(date.getDay());
}

function isBusy(dateStr, slot) {
  const seed = (dateStr + slot).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (seed % 10) < 3;
}

function getNextAvailableSlot(existingBookings) {
  const bookedKeys = new Set(existingBookings.map(b => b.date + '_' + b.slot));
  const today = new Date();

  for (let d = 0; d < 14; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    if (!isWorkDay(date)) continue;

    const dateStr = toDateStr(date);
    const now = new Date();

    for (const slot of ALL_SLOTS) {
      const [h] = slot.split(':').map(Number);
      if (d === 0 && h <= now.getHours()) continue;
      if (isBusy(dateStr, slot)) continue;
      if (bookedKeys.has(dateStr + '_' + slot)) continue;

      return { date, dateStr, slot };
    }
  }
  return null;
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(date) {
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

  if (toDateStr(date) === toDateStr(today))    return 'Сегодня';
  if (toDateStr(date) === toDateStr(tomorrow)) return 'Завтра';

  const days  = ['вс','пн','вт','ср','чт','пт','сб'];
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

function formatDateShort(date) {
  const days  = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  return { day: days[date.getDay()], num: date.getDate(), month: months[date.getMonth()] };
}

function getNext14Days() {
  const result = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    result.push(d);
  }
  return result;
}
