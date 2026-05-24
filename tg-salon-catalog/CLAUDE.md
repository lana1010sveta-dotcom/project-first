# CLAUDE.md — Telegram Mini App «Южена»

## Структура проекта

```
tg-salon-catalog/
├── research.md        — исследование ниши (конкуренты, UX, тренды)
├── brief.md           — техническое задание и экраны
├── CLAUDE.md          — этот файл
└── tg-app/
    ├── index.html     — точка входа, HTML-оболочка приложения
    ├── style.css      — все стили (CSS-переменные, компоненты, анимации)
    ├── data.js        — данные: салон, услуги, галерея, слоты
    └── app.js         — роутер, рендер экранов, события, Telegram SDK
```

---

## Как работает приложение

### Точка входа
`index.html` подключает Telegram SDK, `data.js` и `app.js`.  
JS-код в `app.js` при запуске вызывает `navigate('home')` — рендерит первый экран.

### SPA-роутер
Все экраны рендерятся динамически через `innerHTML`. Переходы — CSS-анимации (slide left/right).  
Функция: `navigate(screenId, params, direction)`.

### Экраны и их ID
| ID                 | Что показывает                          |
|--------------------|-----------------------------------------|
| `home`             | Главная: название, слот, 3 карточки     |
| `services`         | Каталог услуг с фильтрацией по чипам    |
| `service-detail`   | Детали одной услуги + кнопка записи     |
| `gallery`          | Фото-работы, сетка 2 колонки            |
| `my-bookings`      | Мои записи: вкладки Предстоящие/История |
| `booking`          | Выбор даты и времени                    |
| `booking-confirm`  | Подтверждение: саммари + кнопка         |
| `booking-success`  | Успех: анимация + резюме                |

### Навигация между экранами
```
Главная
├── [Записаться] → services → service-detail → booking → booking-confirm → booking-success
├── [Услуги и цены] → services
├── [Фото работ] → gallery → (лайтбокс) → booking
└── [Мои записи] → my-bookings → (bottom sheet отмены)

Нижняя навигация: home | services | gallery | my-bookings
```

### BackButton Telegram
Автоматически показывается на экранах `service-detail`, `booking`, `booking-confirm`, `booking-success`.  
На корневых экранах (home, services, gallery, my-bookings) — скрыт.

---

## Где менять данные

### Название и адрес салона → `data.js`, объект `SALON`
```javascript
const SALON = {
  name:    'Южена',           // ← название
  address: 'г. Минск, ...',   // ← адрес
  mapUrl:  'https://...',     // ← ссылка для «Открыть в картах»
  rating:  4.9,
  reviewsCount: 47,
};
```

### Услуги и цены → `data.js`, массив `SERVICES`
Каждый объект:
```javascript
{
  id: 's1',
  category: 'Стрижка',         // чип фильтрации
  name: 'Женская стрижка',
  description: '...',
  price: 25,                   // число для расчётов
  priceLabel: 'от 25 руб.',   // отображается в UI
  duration: 45,                // минуты
  durationLabel: '45 мин',    // отображается в UI
  icon: '✂️',                 // эмодзи-иконка
}
```

### Галерея → `data.js`, массив `GALLERY`
Пока серые плейсхолдеры. Когда появятся реальные фото:  
1. Добавить поле `img: 'photos/g1.webp'` в каждый объект
2. В `app.js` функция `renderGallery()` — заменить `gallery-placeholder` на `<img src="${g.img}">`

### Рабочее время → `data.js`, объект `WORK`
```javascript
const WORK = {
  startHour: 9,          // начало дня
  endHour:   19,         // конец (последний слот = endHour - 1)
  days: [1,2,3,4,5,6],  // рабочие дни (0=вс, 1=пн, … 6=сб)
};
```

### Занятые слоты
Функция `isBusy(dateStr, slot)` в `data.js` — сейчас псевдослучайная (~30% занято).  
**Для боевой версии**: заменить на запрос к backend API.

---

## Хранение записей

Записи хранятся в `localStorage` под ключом `yuzhenа_bookings`.  
Формат одной записи:
```javascript
{
  id:           'bk_1716560000000',
  serviceId:    's1',
  serviceName:  'Женская стрижка',
  servicePrice: 25,
  serviceIcon:  '✂️',
  date:         '2026-05-27',      // ISO-дата
  dateLabel:    'Завтра',          // читаемая подпись
  slot:         '11:00',
  status:       'confirmed',       // confirmed | pending | completed | cancelled
  createdAt:    '2026-05-24T...',
}
```

Чтобы **сбросить** все записи в тестовых целях:  
`localStorage.removeItem('yuzhenа_bookings')` в консоли браузера.

---

## Как открыть и проверить

### В браузере (preview без Telegram)
Открыть `tg-app/index.html` напрямую.  
Тема Telegram недоступна — используются CSS-fallback значения (белый фон, синий акцент).

### Через Telegram BotFather
1. Создать бота: `/newbot`
2. Создать Mini App: `/newapp` → указать URL, где задеплоено приложение
3. Открыть Mini App из чата с ботом

### Деплой (быстрый вариант)
- **GitHub Pages**: залить `tg-app/` в репозиторий, включить Pages (HTTPS обязателен)
- **Netlify**: перетащить папку `tg-app/` в netlify.com/drop

---

## Стили и тема

Все цвета — через CSS-переменные, которые Telegram SDK заполняет автоматически:
```css
--bg         → --tg-theme-bg-color
--bg2        → --tg-theme-secondary-bg-color
--text       → --tg-theme-text-color
--hint       → --tg-theme-hint-color
--btn-bg     → --tg-theme-button-color
--btn-text   → --tg-theme-button-text-color
```
Акцентный цвет `#2AABEE` можно поменять в `style.css` → `:root { --accent: ... }`.

---

## Что добавить в следующей версии

- [ ] Реальный backend (API `/book`, `/slots`, `/bookings`)
- [ ] Реальные фото в галерее (WebP)
- [ ] Telegram Payments для депозита
- [ ] Напоминание за 2 часа через бота
- [ ] Сбор отзывов после визита
