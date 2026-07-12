import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import os

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

import planner

MOCK_CLAUDE_RESPONSE = """ТЕМА: Что делать если клиент не пришёл | ОПИСАНИЕ: Разбор no-show и как защититься
ТЕМА: Запись через директ — почему это хаос | ОПИСАНИЕ: Реальные потери из-за ручной переписки
ТЕМА: Бесплатная альтернатива YClients | ОПИСАНИЕ: Обзор решений для соло-мастера
ТЕМА: Как мастер теряет 10 клиентов в месяц | ОПИСАНИЕ: Математика потерь без автозаписи
ТЕМА: Мини-апп vs форма на сайте | ОПИСАНИЕ: Сравнение конверсии двух форматов записи
ТЕМА: Почему клиент не перезванивает | ОПИСАНИЕ: Психология отказа и как убрать барьер
ТЕМА: Онлайн-запись для репетитора с нуля | ОПИСАНИЕ: Пошаговый запуск за один день
ТЕМА: Как настроить напоминание о визите | ОПИСАНИЕ: Автоматические уведомления снижают no-show
ТЕМА: Telegram-бот вместо администратора | ОПИСАНИЕ: Реальный кейс экономии на персонале
ТЕМА: Сезонный спрос: как не потерять запись | ОПИСАНИЕ: Управление расписанием в пиковые периоды"""


@pytest.mark.asyncio
async def test_generate_monthly_plan_returns_list():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=MOCK_CLAUDE_RESPONSE)]

    with patch.object(planner.anthropic_client.messages, "create", new=AsyncMock(return_value=mock_response)):
        result = await planner.generate_monthly_plan("2026-07")

    assert isinstance(result, list)
    assert len(result) == 10
    assert result[0]["topic"] == "Что делать если клиент не пришёл"
    assert "no-show" in result[0]["description"]


@pytest.mark.asyncio
async def test_generate_monthly_plan_skips_malformed_lines():
    valid_lines = "\n".join(
        f"ТЕМА: Тема {i} | ОПИСАНИЕ: Описание {i}" for i in range(1, 11)
    )
    mixed_text = "Это строка без нужного формата\n" + valid_lines

    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=mixed_text)]

    with patch.object(planner.anthropic_client.messages, "create", new=AsyncMock(return_value=mock_response)):
        result = await planner.generate_monthly_plan("2026-07")

    # Malformed line is skipped; only 10 valid topics remain
    assert len(result) == 10
    assert result[0]["topic"] == "Тема 1"
