# Agent Produsser — Долгосрочная память

## Проект

Agent Produsser — автономный агент для производства и публикации контента в Telegram-канале @missisdev.
Генерирует посты на основе аудиторного исследования (audience.md), отправляет на одобрение Светлане через бота, публикует после ✅.

GitHub: https://github.com/lana1010sveta-dotcom/agent-produsser
Папка: c:/projects/content-agent/

## Стек

- Python 3.14 · PTB 22.8 · aiosqlite · APScheduler
- Текст: OpenRouter → anthropic/claude-sonnet-4-5
- Картинки: OpenAI DALL-E 3 (отключены до пополнения баланса)
- База: SQLite (data.db)

## Инфраструктура

- Бот одобрения: @my_prodjuser_bot
- Канал публикации: @missisdev (публичный)
- ADMIN_CHAT_ID: 5166343410 (Светлана)
- Запуск: локально, вручную (`python bot.py`)
- Сервер: не настроен (TODO — Railway/VPS)

## Ключевые решения

- Anthropic API недоступен (белорусская карта) → используем OpenRouter
- PTB 22.x: run_polling() синхронный, инициализация через post_init/post_shutdown
- Картинки: graceful fallback — если DALL-E недоступен, пост идёт без изображения
- Аудиторное исследование: audience.md (бьюти ниша, 18 болей, 20 вопросов)

## Следующие этапы

1. Пополнить OpenAI → включить картинки
2. Протестировать полный флоу публикации в @missisdev
3. Перенести на сервер (24/7)
4. Instagram publisher
5. Видео / Reels (HeyGen)
