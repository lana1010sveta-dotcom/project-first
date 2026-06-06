"""Точка входа — запускает CopiRyt бота."""
import asyncio
import logging
import sys

# Фикс кодировки для Windows-консоли
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8")

import config
from bot import create_app

logging.basicConfig(
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    level=logging.INFO,
    stream=sys.stdout,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("telegram").setLevel(logging.WARNING)


async def run() -> None:
    app = create_app()
    print("✅ CopiRyt запущен. Ctrl+C для остановки.")
    async with app:
        await app.start()
        await app.updater.start_polling(drop_pending_updates=True)
        # Держим бота до Ctrl+C
        await asyncio.Event().wait()


def main() -> None:
    if not config.OPENROUTER_API_KEY:
        print("❌ OPENROUTER_API_KEY не задан. Скопируй .env.example в .env и заполни ключи.")
        sys.exit(1)
    if not config.TELEGRAM_BOT_TOKEN:
        print("❌ TELEGRAM_BOT_TOKEN не задан. Скопируй .env.example в .env и заполни ключи.")
        sys.exit(1)

    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("\nБот остановлен.")


if __name__ == "__main__":
    main()
