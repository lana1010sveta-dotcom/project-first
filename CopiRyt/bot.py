"""Telegram-бот CopiRyt — точка входа для пользователя."""
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, Message
from telegram.error import BadRequest
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters,
)

import config
from agents.dispatcher import Dispatcher
from agents.orchestrator import Orchestrator

logger = logging.getLogger(__name__)

_dispatcher   = Dispatcher()
_orchestrator = Orchestrator()

# ------------------------------------------------------------------ #
#  Вспомогательные функции                                            #
# ------------------------------------------------------------------ #

async def _edit_or_reply(msg: Message, text: str) -> None:
    """Редактирует сообщение; если текст слишком длинный — шлёт новым сообщением."""
    MAX = 4000
    chunks = [text[i:i+MAX] for i in range(0, len(text), MAX)] if len(text) > MAX else [text]
    try:
        await msg.edit_text(chunks[0])
    except BadRequest:
        await msg.reply_text(chunks[0])
    for chunk in chunks[1:]:
        await msg.reply_text(chunk)


def _edit_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✂️ Короче",        callback_data="edit:короче"),
            InlineKeyboardButton("💬 Живее",          callback_data="edit:живее"),
        ],
        [
            InlineKeyboardButton("⚡ Хлёстче",        callback_data="edit:хлёстче"),
            InlineKeyboardButton("🚫 Без хэштегов",   callback_data="edit:без хэштегов"),
        ],
        [
            InlineKeyboardButton("💰 Продающий",      callback_data="edit:продающий"),
            InlineKeyboardButton("🔚 Переделать финал", callback_data="edit:финал"),
        ],
        [
            InlineKeyboardButton("🔬 Разобрать стиль", callback_data="analyze"),
        ],
    ])


# ------------------------------------------------------------------ #
#  Команды                                                             #
# ------------------------------------------------------------------ #

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Привет! Я CopiRyt — пишу посты в стиле Светланы.\n\n"
        "Что умею:\n"
        "— Напиши тему → получи готовый пост с разбором\n"
        "— Пришли готовый текст → отредактирую\n"
        "— /plan — контент-план\n"
        "— /next — следующая тема из плана\n"
        "— /help — все команды\n\n"
        "Пример: «Напиши пост про бот для психолога»"
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Команды:\n"
        "/start — приветствие\n"
        "/plan  — показать контент-план\n"
        "/next  — следующая тема из плана\n"
        "/help  — эта справка\n\n"
        "Просто напиши:\n"
        "• «Напиши пост про X» — получишь пост + разбор\n"
        "• Пришли текст поста → выберешь что с ним сделать\n"
        "• «Разбери стиль» + текст — получишь анализ"
    )


async def cmd_plan(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = await update.message.reply_text("Смотрю план…")
    plan = await _orchestrator.show_plan()
    await _edit_or_reply(msg, plan)


async def cmd_next(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = await update.message.reply_text("Ищу следующую тему…")
    topic = await _orchestrator.get_next_topic()
    await _edit_or_reply(msg, f"Следующая тема:\n\n{topic}")


# ------------------------------------------------------------------ #
#  Обработка текстовых сообщений                                      #
# ------------------------------------------------------------------ #

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = update.message.text.strip()

    task = await _dispatcher.classify(text)
    task_type = task.get("task_type", "write_post")

    # --- Редактура или анализ готового текста ---
    if task_type in ("edit_post", "analyze_style"):
        post_text = task.get("post_text") or text
        context.user_data["pending_post"] = post_text

        await update.message.reply_text(
            "Что сделать с постом?",
            reply_markup=_edit_keyboard(),
        )
        return

    # --- Показать план ---
    if task_type == "plan_content":
        msg = await update.message.reply_text("Смотрю план…")
        plan = await _orchestrator.show_plan()
        await _edit_or_reply(msg, plan)
        return

    # --- Следующая тема ---
    if task_type == "next_post":
        msg = await update.message.reply_text("Ищу следующую тему…")
        topic = await _orchestrator.get_next_topic()
        await _edit_or_reply(msg, f"Следующая тема:\n\n{topic}")
        return

    # --- Написать новый пост (по умолчанию) ---
    topic     = task.get("topic") or text
    post_type = task.get("post_type", "educational")
    details   = task.get("details", "")

    status_msg = await update.message.reply_text(
        f"Пишу пост «{topic[:60]}»…\n\nЗапускаю команду агентов (~30–60 сек)."
    )

    async def progress(step_text: str) -> None:
        try:
            await status_msg.edit_text(step_text)
        except BadRequest:
            pass

    try:
        post, critique = await _orchestrator.write_post(
            topic, post_type, details, on_progress=progress
        )
        await _edit_or_reply(status_msg, post)
        await update.message.reply_text(critique)

        # Предлагаем дальнейшее редактирование
        context.user_data["pending_post"] = post
        await update.message.reply_text(
            "Хочешь что-то поменять?",
            reply_markup=_edit_keyboard(),
        )

    except Exception as e:
        logger.exception("Ошибка в write_post")
        await _edit_or_reply(status_msg, f"Что-то пошло не так:\n{e}")


# ------------------------------------------------------------------ #
#  Обработка кнопок (инлайн-клавиатура)                               #
# ------------------------------------------------------------------ #

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    post = context.user_data.get("pending_post", "")
    if not post:
        await query.edit_message_text("Текст поста не найден. Пришли его ещё раз.")
        return

    data = query.data

    # --- Анализ стиля ---
    if data == "analyze":
        status = await query.edit_message_text("🔬 Анализирую стиль…")

        async def progress(t: str) -> None:
            try:
                await status.edit_text(t)
            except BadRequest:
                pass

        try:
            analysis, critique = await _orchestrator.analyze(post, on_progress=progress)
            await _edit_or_reply(status, analysis)
            await query.message.reply_text(critique)
        except Exception as e:
            logger.exception("Ошибка в analyze")
            await _edit_or_reply(status, f"Ошибка: {e}")
        return

    # --- Редактура ---
    if data.startswith("edit:"):
        request = data.split(":", 1)[1]
        status = await query.edit_message_text(f"✏️ Делаю «{request}»…")

        async def progress(t: str) -> None:
            try:
                await status.edit_text(t)
            except BadRequest:
                pass

        try:
            post_out, changes, critique = await _orchestrator.edit_post(
                post, request, on_progress=progress
            )
            # Показываем что изменилось
            if changes:
                await _edit_or_reply(status, changes)
                await query.message.reply_text(post_out)
            else:
                await _edit_or_reply(status, post_out)
            await query.message.reply_text(critique)

            # Обновляем pending_post и снова предлагаем кнопки
            context.user_data["pending_post"] = post_out
            await query.message.reply_text(
                "Ещё что-нибудь поменять?",
                reply_markup=_edit_keyboard(),
            )
        except Exception as e:
            logger.exception("Ошибка в edit_post")
            await _edit_or_reply(status, f"Ошибка: {e}")


# ------------------------------------------------------------------ #
#  Сборка приложения                                                   #
# ------------------------------------------------------------------ #

def create_app() -> Application:
    app = Application.builder().token(config.TELEGRAM_BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help",  cmd_help))
    app.add_handler(CommandHandler("plan",  cmd_plan))
    app.add_handler(CommandHandler("next",  cmd_next))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(CallbackQueryHandler(handle_callback))

    return app
