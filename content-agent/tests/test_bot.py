import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import os

os.environ.setdefault("BOT_TOKEN", "123:test")
os.environ.setdefault("ADMIN_CHAT_ID", "999")
os.environ.setdefault("ANTHROPIC_API_KEY", "key")
os.environ.setdefault("OPENAI_API_KEY", "key")

import bot


def make_update(text: str = "", data: str = "", chat_id: int = 999):
    update = MagicMock()
    update.effective_user.id = chat_id
    update.effective_chat.id = chat_id
    update.message = MagicMock() if text else None
    update.callback_query = MagicMock() if data else None
    if text:
        update.message.text = text
        update.message.reply_text = AsyncMock()
        update.message.reply_photo = AsyncMock()
    if data:
        update.callback_query.data = data
        update.callback_query.answer = AsyncMock()
        update.callback_query.message = MagicMock()
        update.callback_query.message.reply_text = AsyncMock()
        update.callback_query.message.reply_photo = AsyncMock()
        update.callback_query.message.edit_reply_markup = AsyncMock()
    return update


@pytest.mark.asyncio
async def test_unauthorized_user_ignored():
    update = make_update(text="/status", chat_id=12345)
    context = MagicMock()
    await bot.cmd_status(update, context)
    update.message.reply_text.assert_not_called()


@pytest.mark.asyncio
async def test_status_command_replies(tmp_path):
    update = make_update(text="/status")
    context = MagicMock()

    with patch("bot.storage") as mock_storage:
        mock_storage.get_status_summary = AsyncMock(
            return_value={"queued": 5, "published": 10, "pending_approval": 2}
        )
        await bot.cmd_status(update, context)

    update.message.reply_text.assert_called_once()
    reply = update.message.reply_text.call_args[0][0]
    assert "5" in reply
    assert "10" in reply


@pytest.mark.asyncio
async def test_approve_callback_publishes_post(tmp_path):
    img = tmp_path / "img.png"
    img.write_bytes(b"bytes")

    update = make_update(data="approve:7")
    context = MagicMock()

    bot._state["pending_post_id"] = 7

    with patch("bot.storage") as mock_storage, \
         patch("bot.publisher") as mock_publisher:
        mock_storage.get_post = AsyncMock(return_value={
            "id": 7, "text": "Текст", "hashtags": "#тег",
            "image_path": str(img), "plan_id": None, "status": "generated"
        })
        mock_storage.update_post_status = AsyncMock()
        mock_publisher.publish_post = AsyncMock(return_value=101)

        await bot.callback_handler(update, context)

    mock_publisher.publish_post.assert_called_once_with(
        text="Текст", hashtags="#тег", image_path=str(img)
    )
    # F1 fix: update_post_status now called twice — "approved" before publish, "published" on success
    mock_storage.update_post_status.assert_any_call(7, "approved")
    mock_storage.update_post_status.assert_any_call(7, "published")


@pytest.mark.asyncio
async def test_skip_callback_updates_status():
    update = make_update(data="skip:3")
    context = MagicMock()
    bot._state["pending_post_id"] = 3

    with patch("bot.storage") as mock_storage:
        mock_storage.get_post = AsyncMock(return_value={
            "id": 3, "plan_id": 1, "status": "generated",
            "text": "T", "hashtags": "#h", "image_path": "/p"
        })
        mock_storage.update_post_status = AsyncMock()
        mock_storage.update_plan_status = AsyncMock()

        await bot.callback_handler(update, context)

    mock_storage.update_post_status.assert_called_once_with(3, "skipped")
