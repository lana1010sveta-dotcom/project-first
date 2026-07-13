# Архитектура Agent Produsser

## Модули

| Файл | Ответственность |
|---|---|
| bot.py | Точка входа, оркестратор, бот одобрения |
| planner.py | Генерация месячного плана тем (OpenRouter → Claude) |
| generator.py | Генерация текста поста + картинки (OpenRouter + DALL-E 3) |
| publisher.py | Публикация в Telegram-канал |
| scheduler.py | APScheduler: 1-го числа план, ежедневно пост |
| storage.py | SQLite: таблицы plan + posts |

## Поток данных

```
/plan → planner.py → storage.py (темы draft)
      → bot.py показывает список → Света выбирает номера → queued

scheduler/next → generator.py (текст + картинка)
              → storage.py (пост generated)
              → bot.py отправляет на одобрение

✅ → publisher.py → канал @missisdev → статус published
✏️ → инструкция → regenerate → одобрение заново
❌ → статус skipped
```

## Запуск

```bash
cd c:/projects/content-agent
python bot.py
```

## Команды бота

| Команда | Действие |
|---|---|
| /start | Приветствие и список команд |
| /plan | Сгенерировать план на месяц |
| /next | Взять следующую queued тему |
| /post <тема> | Срочный пост по теме |
| /status | Статистика |
