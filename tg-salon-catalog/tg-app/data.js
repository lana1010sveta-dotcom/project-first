/* ============================================================
   data.js — все данные салона «Южена»
   Здесь меняй: название, адрес, услуги, цены, галерею
   ============================================================ */

/* ---------- Конфигурация салона ---------------------------- */
const SALON = {
  name:         'Южена',
  tagline:      'Стрижки, окрашивание, уход',
  address:      'г. Минск, ул. Притыцкого, 38',   /* ← поменяй на реальный */
  mapUrl:       'https://maps.google.com/?q=Минск,Притыцкого,38',
  phone:        '+375 29 123-45-67',
  rating:       4.9,
  reviewsCount: 47,
};

/* ---------- Рабочее время ---------------------------------- */
const WORK = {
  startHour: 9,    /* начало рабочего дня */
  endHour:   19,   /* конец (последний слот начинается в 18:00) */
  days: [1,2,3,4,5,6], /* рабочие дни: 1=пн … 6=сб, 0=вс */
};

/* Генерирует массив слотов ['09:00', '10:00', …] */
function buildSlots() {
  const slots = [];
  for (let h = WORK.startHour; h < WORK.endHour; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
  }
  return slots;
}

const ALL_SLOTS = buildSlots(); /* ['09:00', '10:00', … '18:00'] */

/* ---------- Услуги ----------------------------------------- */
/* Поля: id, category, name, description, price, priceLabel, duration, durationLabel, icon */
const SERVICES = [
  /* ── Стрижка ── */
  {
    id: 's1', category: 'Стрижка',
    name: 'Женская стрижка',
    description: 'Стрижка любой сложности: слои, градуировка, асимметрия. Горячие ножницы. Укладка феном включена.',
    price: 25, priceLabel: 'от 25 руб.',
    duration: 45, durationLabel: '45 мин',
    icon: '✂️',
  },
  {
    id: 's2', category: 'Стрижка',
    name: 'Стрижка + укладка',
    description: 'Стрижка любой длины с профессиональной укладкой: брашингом, плойкой или утюжком.',
    price: 35, priceLabel: 'от 35 руб.',
    duration: 60, durationLabel: '60 мин',
    icon: '✂️',
  },
  {
    id: 's3', category: 'Стрижка',
    name: 'Стрижка чёлки',
    description: 'Коррекция и оформление чёлки любой формы — прямая, косая, рваная.',
    price: 10, priceLabel: '10 руб.',
    duration: 15, durationLabel: '15 мин',
    icon: '✂️',
  },
  /* ── Окрашивание ── */
  {
    id: 's4', category: 'Окрашивание',
    name: 'Однотонное окрашивание',
    description: 'Равномерный тон по всей длине. Профессиональные краски Wella/L\'Oréal. Уходовая процедура после окрашивания.',
    price: 50, priceLabel: 'от 50 руб.',
    duration: 90, durationLabel: '90 мин',
    icon: '🎨',
  },
  {
    id: 's5', category: 'Окрашивание',
    name: 'Мелирование',
    description: 'Классическое мелирование в фольгу. Создаёт объём, натуральный солнечный блик и эффект свежести.',
    price: 65, priceLabel: 'от 65 руб.',
    duration: 120, durationLabel: '2 часа',
    icon: '🎨',
  },
  {
    id: 's6', category: 'Окрашивание',
    name: 'Балаяж',
    description: 'Плавный переход цвета — техника свободной руки. Натуральный эффект выгоревших волос без резкой границы.',
    price: 85, priceLabel: 'от 85 руб.',
    duration: 150, durationLabel: '2,5 часа',
    icon: '🎨',
  },
  {
    id: 's7', category: 'Окрашивание',
    name: 'Тонирование',
    description: 'Придание нужного оттенка, нейтрализация желтизны, освежение цвета. Укрепляет структуру и добавляет блеск.',
    price: 35, priceLabel: 'от 35 руб.',
    duration: 60, durationLabel: '60 мин',
    icon: '🎨',
  },
  /* ── Уход ── */
  {
    id: 's8', category: 'Уход',
    name: 'Кератиновое выпрямление',
    description: 'Разглаживает, питает и защищает волосы. Без формальдегида. Эффект держится 3–4 месяца, мытьё через 3 дня.',
    price: 80, priceLabel: 'от 80 руб.',
    duration: 150, durationLabel: '2,5 часа',
    icon: '💆',
  },
  {
    id: 's9', category: 'Уход',
    name: 'Восстанавливающая маска',
    description: 'Глубокое питание и восстановление структуры ослабленных и повреждённых волос. Результат заметен сразу.',
    price: 20, priceLabel: '20 руб.',
    duration: 30, durationLabel: '30 мин',
    icon: '💆',
  },
  {
    id: 's10', category: 'Уход',
    name: 'Полировка волос',
    description: 'Удаление секущихся кончиков специальной насадкой без стрижки длины. Волосы становятся живее и ровнее.',
    price: 30, priceLabel: '30 руб.',
    duration: 45, durationLabel: '45 мин',
    icon: '💆',
  },
];

/* Уникальные категории из массива услуг */
const SERVICE_CATEGORIES = ['Все', ...new Set(SERVICES.map(s => s.category))];

/* ---------- Галерея ---------------------------------------- */
/* Поля: id, category, title, serviceId, icon (эмодзи для плейсхолдера) */
const GALLERY = [
  { id: 'g1',  category: 'Стрижка',    title: 'Каскад на длинные',   serviceId: 's1', icon: '✂️' },
  { id: 'g2',  category: 'Окрашивание',title: 'Балаяж русый',         serviceId: 's6', icon: '🎨' },
  { id: 'g3',  category: 'Стрижка',    title: 'Боб с чёлкой',         serviceId: 's1', icon: '✂️' },
  { id: 'g4',  category: 'Окрашивание',title: 'Мелирование тонкое',   serviceId: 's5', icon: '🎨' },
  { id: 'g5',  category: 'Укладка',    title: 'Вечерняя укладка',     serviceId: 's2', icon: '💇' },
  { id: 'g6',  category: 'Окрашивание',title: 'Однотонный шоколад',   serviceId: 's4', icon: '🎨' },
  { id: 'g7',  category: 'Стрижка',    title: 'Pixie cut',            serviceId: 's1', icon: '✂️' },
  { id: 'g8',  category: 'Укладка',    title: 'Локоны',               serviceId: 's2', icon: '💇' },
  { id: 'g9',  category: 'Окрашивание',title: 'Балаяж пепельный',     serviceId: 's6', icon: '🎨' },
  { id: 'g10', category: 'Стрижка',    title: 'Многослойная',         serviceId: 's1', icon: '✂️' },
  { id: 'g11', category: 'Укладка',    title: 'Прикорневой объём',    serviceId: 's2', icon: '💇' },
  { id: 'g12', category: 'Окрашивание',title: 'Тонирование медь',     serviceId: 's7', icon: '🎨' },
];

const GALLERY_CATEGORIES = ['Все', ...new Set(GALLERY.map(g => g.category))];

/* ---------- Вспомогательные функции для дат/слотов --------- */

/* Возвращает true, если день рабочий */
function isWorkDay(date) {
  return WORK.days.includes(date.getDay());
}

/* Детерминированный «псевдо-рандом» для имитации занятых слотов.
   Одни и те же дата+слот → всегда одно и то же значение. */
function isBusy(dateStr, slot) {
  const seed = (dateStr + slot).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  /* ~30% слотов заняты */
  return (seed % 10) < 3;
}

/* Возвращает следующий доступный слот (для главной страницы) */
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
      /* Сегодня — пропускаем прошедшие часы */
      if (d === 0 && h <= now.getHours()) continue;
      if (isBusy(dateStr, slot)) continue;
      if (bookedKeys.has(dateStr + '_' + slot)) continue;

      return { date, dateStr, slot };
    }
  }
  return null;
}

/* ISO-дата «YYYY-MM-DD» */
function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

/* Красивая подпись даты: «Завтра», «Пн, 27 мая» */
function formatDateLabel(date) {
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

  if (toDateStr(date) === toDateStr(today))    return 'Сегодня';
  if (toDateStr(date) === toDateStr(tomorrow)) return 'Завтра';

  const days  = ['вс','пн','вт','ср','чт','пт','сб'];
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

/* Короткое «Пн 26» для строки выбора дат */
function formatDateShort(date) {
  const days  = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  return { day: days[date.getDay()], num: date.getDate(), month: months[date.getMonth()] };
}

/* Следующие 14 дней */
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
