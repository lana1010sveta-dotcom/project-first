import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import os

os.environ.setdefault("BOT_TOKEN", "123:test")
os.environ.setdefault("CHANNEL_ID", "@testchannel")

import publisher


@pytest.mark.asyncio
async def test_publish_post_sends_photo_and_returns_message_id(tmp_path):
    img = tmp_path / "cover.png"
    img.write_bytes(b"fake_png_bytes")

    mock_message = MagicMock()
    mock_message.message_id = 42

    mock_bot = AsyncMock()
    mock_bot.send_photo = AsyncMock(return_value=mock_message)

    with patch("publisher.Bot", return_value=mock_bot):
        result = await publisher.publish_post(
            text="Текст поста про no-show",
            hashtags="#бьюти #запись",
            image_path=str(img),
        )

    assert result == 42
    mock_bot.send_photo.assert_called_once()
    call_kwargs = mock_bot.send_photo.call_args.kwargs
    assert call_kwargs["chat_id"] == "@testchannel"
    assert "#бьюти" in call_kwargs["caption"]


@pytest.mark.asyncio
async def test_publish_post_truncates_long_caption(tmp_path):
    img = tmp_path / "cover.png"
    img.write_bytes(b"bytes")

    mock_bot = AsyncMock()
    mock_bot.send_photo = AsyncMock(return_value=MagicMock(message_id=1))

    long_text = "А" * 1100

    with patch("publisher.Bot", return_value=mock_bot):
        await publisher.publish_post(text=long_text, hashtags="#тег", image_path=str(img))

    caption = mock_bot.send_photo.call_args.kwargs["caption"]
    assert len(caption) <= 1024
