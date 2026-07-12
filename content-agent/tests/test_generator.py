import pytest
from unittest.mock import AsyncMock, MagicMock, patch, mock_open
import os
from pathlib import Path

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("OPENAI_API_KEY", "test-key")

import generator

MOCK_POST_RESPONSE = """ЗАГОЛОВОК: Почему клиенты не приходят
ТЕКСТ: Три месяца назад у меня было 30% no-show каждую неделю.
Я теряла деньги и нервы. Оказалось, проблема была простой.
Клиенты просто забывали. Теперь бот напоминает им за 24 часа и за 2 часа.
No-show упал до 5%. Это реально работает.
ХЭШТЕГИ: #запись_клиентов #бьюти_мастер #telegram_бот"""


@pytest.mark.asyncio
async def test_generate_post_returns_all_fields():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=MOCK_POST_RESPONSE)]

    with patch.object(generator.anthropic_client.messages, "create", new=AsyncMock(return_value=mock_response)):
        result = await generator.generate_post("Как снизить no-show")

    assert result["title"] == "Почему клиенты не приходят"
    assert "no-show" in result["text"].lower()
    assert "#запись_клиентов" in result["hashtags"]


@pytest.mark.asyncio
async def test_generate_image_downloads_file(tmp_path):
    mock_image_response = MagicMock()
    mock_image_response.data = [MagicMock(url="https://example.com/image.png")]

    mock_http_response = MagicMock()
    mock_http_response.content = b"fake_image_bytes"

    with patch.object(generator.openai_client.images, "generate", new=AsyncMock(return_value=mock_image_response)), \
         patch("generator.IMAGES_DIR", tmp_path), \
         patch("httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__ = AsyncMock(return_value=MagicMock(
            get=AsyncMock(return_value=mock_http_response)
        ))
        mock_client.return_value.__aexit__ = AsyncMock(return_value=False)

        url, path = await generator.generate_image("no-show тема", "Почему клиенты не приходят")

    assert url == "https://example.com/image.png"
    assert Path(path).suffix == ".png"


@pytest.mark.asyncio
async def test_generate_post_with_image_combines_both(tmp_path):
    mock_post_response = MagicMock()
    mock_post_response.content = [MagicMock(text=MOCK_POST_RESPONSE)]

    mock_image_response = MagicMock()
    mock_image_response.data = [MagicMock(url="https://example.com/img.png")]

    mock_http_response = MagicMock()
    mock_http_response.content = b"bytes"

    with patch.object(generator.anthropic_client.messages, "create", new=AsyncMock(return_value=mock_post_response)), \
         patch.object(generator.openai_client.images, "generate", new=AsyncMock(return_value=mock_image_response)), \
         patch("generator.IMAGES_DIR", tmp_path), \
         patch("httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__ = AsyncMock(return_value=MagicMock(
            get=AsyncMock(return_value=mock_http_response)
        ))
        mock_client.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await generator.generate_post_with_image("Как снизить no-show")

    assert "title" in result
    assert "text" in result
    assert "image_url" in result
    assert "image_path" in result
