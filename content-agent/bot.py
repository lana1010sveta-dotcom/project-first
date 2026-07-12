import asyncio
import os
from datetime import datetime
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    filters,
    ContextTypes,
)

load_dotenv()

import storage
import planner
import generator
import publisher

ADMIN_CHAT_ID = int(os.environ["ADMIN_CHAT_ID"])

# Single-user conversation state
_state = {
    "waiting_for": None,        # "plan_selection" | "edit" | None
    "pending_post_id": None,    # int | None
    "pending_plan_topics": [],  # list of (db_id, topic_str)
}


def _is_admin(update: Update) -> bool:
    return update.effective_user.id == ADMIN_CHAT_ID


async def _send_post_for_approval(chat_id: int, post: dict, context: ContextTypes.DEFAULT_TYPE):
    keyboard = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Опубликовать", callback_data=f"approve:{post['id']}"),
            InlineKeyboardButton("✏️ На правку", callback_data=f"edit:{post['id']}"),
            InlineKeyboardButton("❌ Пропустить", callback_data=f"skip:{post['id']}"),
        ]
    ])
    caption = f"<b>{post.get('title', '')}</b>\n\n{post['text']}\n\n{post['hashtags']}"
    if len(caption) > 1024:
        caption = caption[:1020] + "..."

    with open(post["image_path"], "rb") as img:
        await context.bot.send_photo(
            chat_id=chat_id,
            photo=img,
            caption=caption,
            parse_mode="HTML",
            reply_markup=keyboard,
        )
    _state["pending_post_id"] = post["id"]


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    await update.message.reply_text(
        "Agent Produsser готов.\n\n"
        "/plan — сгенерировать план на месяц\n"
        "/next — создать следующий пост из плана\n"
        "/post <тема> — срочный пост по теме\n"
        "/status — статистика"
    )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    summary = await storage.get_status_summary()
    await update.message.reply_text(
        f"📊 Статистика:\n"
        f"• В очереди: {summary['queued']} тем\n"
        f"• На одобрении: {summary['pending_approval']} постов\n"
        f"• Опубликовано: {summary['published']} постов"
    )


async def cmd_plan(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    month = datetime.now().strftime("%Y-%m")
    await update.message.reply_text(f"Генерирую план на {month}...")

    try:
        topics = await planner.generate_monthly_plan(month)
    except Exception as e:
        await update.message.reply_text(f"Ошибка генерации плана: {e}")
        return

    ids = await storage.save_plan_topics(topics, month)
    _state["pending_plan_topics"] = list(zip(ids, [t["topic"] for t in topics]))
    _state["waiting_for"] = "plan_selection"

    lines = [f"{i+1}. {t['topic']}" for i, t in enumerate(topics)]
    text = "План готов. Выбери темы (номера через пробел) или напиши «все»:\n\n" + "\n".join(lines)

    # Telegram message limit: 4096 chars
    if len(text) > 4096:
        text = text[:4090] + "\n..."
    await update.message.reply_text(text)


async def cmd_next(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    topic_row = await storage.get_next_queued_topic()
    if not topic_row:
        await update.message.reply_text("Очередь пуста. Запусти /plan.")
        return
    await update.message.reply_text(f"Генерирую пост: «{topic_row['topic']}»...")
    await _generate_and_send(update.effective_chat.id, topic_row["topic"], topic_row["id"], context)


async def cmd_post(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    topic = " ".join(context.args) if context.args else ""
    if not topic:
        await update.message.reply_text("Укажи тему: /post <тема>")
        return
    await update.message.reply_text(f"Генерирую срочный пост: «{topic}»...")
    await _generate_and_send(update.effective_chat.id, topic, None, context)


async def _generate_and_send(chat_id: int, topic: str, plan_id: int | None, context: ContextTypes.DEFAULT_TYPE):
    try:
        content = await generator.generate_post_with_image(topic)
    except Exception as e:
        await context.bot.send_message(chat_id=chat_id, text=f"Ошибка генерации: {e}\nПопробуй позже.")
        return

    post_id = await storage.save_post(
        plan_id=plan_id,
        title=content["title"],
        text=content["text"],
        hashtags=content["hashtags"],
        image_url=content["image_url"],
        image_path=content["image_path"],
    )
    if plan_id:
        await storage.update_plan_status(plan_id, "generated")

    post = await storage.get_post(post_id)
    await _send_post_for_approval(chat_id, post, context)


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    query = update.callback_query
    await query.answer()

    data = query.data
    if data.startswith("approve:"):
        post_id = int(data.split(":")[1])
        post = await storage.get_post(post_id)
        try:
            await publisher.publish_post(
                text=post["text"],
                hashtags=post["hashtags"],
                image_path=post["image_path"],
            )
            await storage.update_post_status(post_id, "published")
            if post["plan_id"]:
                await storage.update_plan_status(post["plan_id"], "published")
            await query.message.edit_reply_markup(None)
            await query.message.reply_text("✅ Опубликовано!")
        except Exception as e:
            await query.message.reply_text(f"Ошибка публикации: {e}")
        _state["pending_post_id"] = None

    elif data.startswith("edit:"):
        post_id = int(data.split(":")[1])
        _state["pending_post_id"] = post_id
        _state["waiting_for"] = "edit"
        await query.message.edit_reply_markup(None)
        await query.message.reply_text(
            "Напиши инструкцию (например «сделай короче») или отправь готовый текст поста:"
        )

    elif data.startswith("skip:"):
        post_id = int(data.split(":")[1])
        post = await storage.get_post(post_id)
        await storage.update_post_status(post_id, "skipped")
        if post["plan_id"]:
            await storage.update_plan_status(post["plan_id"], "skipped")
        await query.message.edit_reply_markup(None)
        await query.message.reply_text("❌ Пропущено.")
        _state["pending_post_id"] = None


async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_admin(update):
        return
    text = update.message.text.strip()

    if _state["waiting_for"] == "plan_selection":
        topic_list = _state["pending_plan_topics"]
        if text.lower() == "все":
            ids = [t[0] for t in topic_list]
        else:
            try:
                nums = [int(n) - 1 for n in text.split()]
                ids = [topic_list[n][0] for n in nums if 0 <= n < len(topic_list)]
            except ValueError:
                await update.message.reply_text("Напиши номера через пробел (например: 1 3 5) или «все»")
                return

        await storage.approve_topics(ids)
        _state["waiting_for"] = None
        _state["pending_plan_topics"] = []
        await update.message.reply_text(f"✅ Одобрено {len(ids)} тем. Используй /next для генерации постов.")

    elif _state["waiting_for"] == "edit" and _state["pending_post_id"]:
        post_id = _state["pending_post_id"]
        post = await storage.get_post(post_id)

        # Heuristic: if short text looks like an instruction, regenerate
        is_instruction = len(text) < 200 and not text.startswith("http")
        if is_instruction:
            await update.message.reply_text("Перегенерирую с учётом правки...")
            topic_with_instruction = f"{post.get('title', '')} — {text}"
            try:
                content = await generator.generate_post_with_image(topic_with_instruction)
            except Exception as e:
                await update.message.reply_text(f"Ошибка генерации: {e}")
                await update.message.reply_text("Попробуй другую инструкцию или отправь готовый текст.")
                return
            new_post_id = await storage.save_post(
                plan_id=post["plan_id"],
                title=content["title"],
                text=content["text"],
                hashtags=content["hashtags"],
                image_url=content["image_url"],
                image_path=content["image_path"],
            )
            new_post = await storage.get_post(new_post_id)
            _state["waiting_for"] = None
            await _send_post_for_approval(update.effective_chat.id, new_post, context)
        else:
            # Ready text from user — update and publish directly
            await storage.update_post_text(post_id, text)
            updated_post = await storage.get_post(post_id)
            try:
                await publisher.publish_post(
                    text=updated_post["text"],
                    hashtags=updated_post["hashtags"],
                    image_path=updated_post["image_path"],
                )
                await storage.update_post_status(post_id, "published")
                await update.message.reply_text("✅ Опубликовано с вашим текстом!")
                _state["waiting_for"] = None
                _state["pending_post_id"] = None
            except Exception as e:
                await update.message.reply_text(f"Ошибка публикации: {e}")


def build_app() -> Application:
    app = Application.builder().token(os.environ["BOT_TOKEN"]).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("plan", cmd_plan))
    app.add_handler(CommandHandler("next", cmd_next))
    app.add_handler(CommandHandler("post", cmd_post))
    app.add_handler(CallbackQueryHandler(callback_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))
    return app


async def main():
    await storage.init_db()
    app = build_app()

    from scheduler import setup_scheduler
    scheduler = setup_scheduler(app)
    scheduler.start()

    print("Agent Produsser started.")
    try:
        await app.run_polling(drop_pending_updates=True)
    finally:
        scheduler.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
