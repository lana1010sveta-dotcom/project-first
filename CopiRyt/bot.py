"""Telegram-бот CopiRyt — точка входа для пользователя."""
import logging
from pathlib import Path
from datetime import datetime
from telegram import (
    Update, InlineKeyboardButton, InlineKeyboardMarkup,
    Message, ReplyKeyboardMarkup, KeyboardButton,
)
from telegram.error import BadRequest
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters,
)

import config
from agents.dispatcher import Dispatcher
from agents.orchestrator import Orchestrator

logger = logging.getLogger(__name__)

_dispatcher   = Dispatcher()
_orchestrator = Orchestrator()

_POSTS_FILE = Path(__file__).parent / "posts-draft.md"


def _save_example_post(text: str) -> None:
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    entry = f"\n\n---\n\n## Пример {stamp}\n\n{text}\n"
    with _POSTS_FILE.open("a", encoding="utf-8") as f:
        f.write(entry)

# ------------------------------------------------------------------ #
#  Клавиатуры                                                          #
# ------------------------------------------------------------------ #

MAIN_KB = ReplyKeyboardMarkup(
    [
        [KeyboardButton("✍️ Написать пост"), KeyboardButton("🎨 Мой стиль")],
        [KeyboardButton("📅 Контент-план"),  KeyboardButton("⚙️ Настройки")],
    ],
    resize_keyboard=True,
    is_persistent=True,
)

MAIN_BUTTONS = {"✍️ Написать пост", "🎨 Мой стиль", "📅 Контент-план", "⚙️ Настройки"}


def _write_post_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("📝 Своя тема",         callback_data="wp:custom"),
            InlineKeyboardButton("🗓 По контент-плану",  callback_data="wp:plan"),
        ],
        [
            InlineKeyboardButton("💰 Продающий",         callback_data="wp:selling"),
            InlineKeyboardButton("💫 Личная история",    callback_data="wp:story"),
        ],
    ])


def _style_keyboard(has_post: bool) -> InlineKeyboardMarkup:
    if has_post:
        return InlineKeyboardMarkup([
            [
                InlineKeyboardButton("🔬 Разобрать стиль",      callback_data="analyze"),
                InlineKeyboardButton("📋 Мои правила",           callback_data="style:rules"),
            ],
            [
                InlineKeyboardButton("✂️ Короче",               callback_data="edit:короче"),
                InlineKeyboardButton("💬 Живее",                 callback_data="edit:живее"),
            ],
            [
                InlineKeyboardButton("⚡ Хлёстче",              callback_data="edit:хлёстче"),
                InlineKeyboardButton("🔚 Переделать финал",      callback_data="edit:финал"),
            ],
            [
                InlineKeyboardButton("💰 Сделать продающим",    callback_data="edit:продающий"),
                InlineKeyboardButton("🚫 Убрать хэштеги",       callback_data="edit:без хэштегов"),
            ],
        ])
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🔬 Пришли текст — разберу стиль", callback_data="style:request_text")],
        [InlineKeyboardButton("📋 Мои правила письма",           callback_data="style:rules")],
        [
            InlineKeyboardButton("📥 Загрузить контент",         callback_data="style:load_content"),
            InlineKeyboardButton("🔄 Сбросить стиль",            callback_data="style:reset"),
        ],
    ])


def _plan_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("👀 Показать план",    callback_data="plan:show"),
            InlineKeyboardButton("➡️ Следующая тема",   callback_data="plan:next"),
        ],
    ])


def _settings_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📊 Текущие модели", callback_data="settings:models")],
        [InlineKeyboardButton("❓ Помощь",          callback_data="settings:help")],
    ])


def _edit_keyboard() -> InlineKeyboardMarkup:
    """Inline-клавиатура после генерации нового поста."""
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✂️ Короче",             callback_data="edit:короче"),
            InlineKeyboardButton("💬 Живее",               callback_data="edit:живее"),
        ],
        [
            InlineKeyboardButton("⚡ Хлёстче",            callback_data="edit:хлёстче"),
            InlineKeyboardButton("🚫 Без хэштегов",        callback_data="edit:без хэштегов"),
        ],
        [
            InlineKeyboardButton("💰 Продающий",          callback_data="edit:продающий"),
            InlineKeyboardButton("🔚 Переделать финал",    callback_data="edit:финал"),
        ],
        [InlineKeyboardButton("🔬 Разобрать стиль",       callback_data="analyze")],
    ])


# ------------------------------------------------------------------ #
#  Вспомогательные функции                                            #
# ------------------------------------------------------------------ #

async def _edit_or_reply(msg: Message, text: str) -> None:
    MAX = 4000
    chunks = [text[i:i+MAX] for i in range(0, len(text), MAX)] if len(text) > MAX else [text]
    try:
        await msg.edit_text(chunks[0])
    except BadRequest:
        await msg.reply_text(chunks[0])
    for chunk in chunks[1:]:
        await msg.reply_text(chunk)


async def _write_post_flow(
    topic: str,
    post_type: str,
    details: str,
    status_msg: Message,
    reply_to: Message,
    context: ContextTypes.DEFAULT_TYPE,
) -> None:
    """Общий пайплайн написания поста."""
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
        await reply_to.reply_text(critique)
        context.user_data["pending_post"] = post
        await reply_to.reply_text("Хочешь что-то поменять?", reply_markup=_edit_keyboard())
    except Exception as e:
        logger.exception("Ошибка в write_post")
        await _edit_or_reply(status_msg, f"Что-то пошло не так:\n{e}")


# ------------------------------------------------------------------ #
#  Команды                                                             #
# ------------------------------------------------------------------ #

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Привет! Я CopiRyt — пишу посты в стиле Светланы.\n\n"
        "Выбери что хочешь сделать 👇",
        reply_markup=MAIN_KB,
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Команды:\n"
        "/start — перезапустить меню\n"
        "/help  — эта справка\n\n"
        "Или нажми кнопку в меню ниже 👇",
        reply_markup=MAIN_KB,
    )


# ------------------------------------------------------------------ #
#  Обработка главного меню (ReplyKeyboard)                            #
# ------------------------------------------------------------------ #

async def _handle_write_post_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Что пишем?",
        reply_markup=_write_post_keyboard(),
    )


async def _handle_style_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    has_post = bool(context.user_data.get("pending_post"))
    text = (
        "Работаем с последним постом — выбери что сделать:"
        if has_post else
        "Что делаем со стилем?"
    )
    await update.message.reply_text(text, reply_markup=_style_keyboard(has_post))


async def _handle_plan_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Контент-план:",
        reply_markup=_plan_keyboard(),
    )


async def _handle_settings_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Настройки:",
        reply_markup=_settings_keyboard(),
    )


# ------------------------------------------------------------------ #
#  Обработка текстовых сообщений                                      #
# ------------------------------------------------------------------ #

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = update.message.text.strip()

    # Главное меню
    if text == "✍️ Написать пост":
        await _handle_write_post_menu(update, context)
        return
    if text == "🎨 Мой стиль":
        await _handle_style_menu(update, context)
        return
    if text == "📅 Контент-план":
        await _handle_plan_menu(update, context)
        return
    if text == "⚙️ Настройки":
        await _handle_settings_menu(update, context)
        return

    # Ждём ввод темы или текста от пользователя
    awaiting = context.user_data.pop("awaiting", None)

    if awaiting == "topic_custom":
        status_msg = await update.message.reply_text(
            f"Пишу пост «{text[:60]}»…\n\nЗапускаю агентов (~30–60 сек)."
        )
        await _write_post_flow(text, "educational", "", status_msg, update.message, context)
        return

    if awaiting == "topic_selling":
        status_msg = await update.message.reply_text(
            f"Пишу продающий пост «{text[:60]}»…"
        )
        await _write_post_flow(text, "selling", "", status_msg, update.message, context)
        return

    if awaiting == "topic_story":
        status_msg = await update.message.reply_text(
            f"Пишу личную историю «{text[:60]}»…"
        )
        await _write_post_flow(text, "inspiring", "формат: личная история или кейс", status_msg, update.message, context)
        return

    if awaiting == "text_for_analysis":
        context.user_data["pending_post"] = text
        await update.message.reply_text(
            "Текст получен. Что делаем?",
            reply_markup=_style_keyboard(has_post=True),
        )
        return

    if awaiting == "load_content":
        _save_example_post(text)
        await update.message.reply_text(
            "✅ Пост сохранён как пример стиля.\n\n"
            "Агенты будут учитывать его при написании новых постов. "
            "Можешь прислать ещё один или нажать «✍️ Написать пост»."
        )
        return

    # Свободный ввод — классифицируем через dispatcher
    task = await _dispatcher.classify(text)
    task_type = task.get("task_type", "write_post")

    if task_type in ("edit_post", "analyze_style"):
        post_text = task.get("post_text") or text
        context.user_data["pending_post"] = post_text
        await update.message.reply_text(
            "Что делаем с постом?",
            reply_markup=_style_keyboard(has_post=True),
        )
        return

    if task_type == "plan_content":
        msg = await update.message.reply_text("Смотрю план…")
        plan = await _orchestrator.show_plan()
        await _edit_or_reply(msg, plan)
        return

    if task_type == "next_post":
        msg = await update.message.reply_text("Ищу следующую тему…")
        topic = await _orchestrator.get_next_topic()
        await _edit_or_reply(msg, f"Следующая тема:\n\n{topic}")
        return

    # Написать новый пост
    topic     = task.get("topic") or text
    post_type = task.get("post_type", "educational")
    details   = task.get("details", "")

    status_msg = await update.message.reply_text(
        f"Пишу пост «{topic[:60]}»…\n\nЗапускаю агентов (~30–60 сек)."
    )
    await _write_post_flow(topic, post_type, details, status_msg, update.message, context)


# ------------------------------------------------------------------ #
#  Обработка кнопок (InlineKeyboard)                                  #
# ------------------------------------------------------------------ #

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    data = query.data

    # --- Написать пост ---
    if data == "wp:custom":
        context.user_data["awaiting"] = "topic_custom"
        await query.edit_message_text("Напиши тему поста — и я начну писать.")
        return

    if data == "wp:plan":
        status = await query.edit_message_text("Беру следующую тему из плана…")
        topic = await _orchestrator.get_next_topic()
        await _edit_or_reply(status, f"Пишу пост по теме:\n{topic}\n\nЗапускаю агентов…")
        await _write_post_flow(topic, "educational", "", status, query.message, context)
        return

    if data == "wp:selling":
        context.user_data["awaiting"] = "topic_selling"
        await query.edit_message_text("Напиши тему — напишу продающий пост.")
        return

    if data == "wp:story":
        context.user_data["awaiting"] = "topic_story"
        await query.edit_message_text("Напиши тему или имя клиента — напишу личную историю.")
        return

    # --- Стиль ---
    if data == "style:request_text":
        context.user_data["awaiting"] = "text_for_analysis"
        await query.edit_message_text("Пришли текст поста — разберу стиль.")
        return

    if data == "style:rules":
        rules = config.TONE_OF_VOICE or "Файл tone-of-voice.md не найден."
        await query.edit_message_text(rules[:4000])
        return

    if data == "style:load_content":
        context.user_data["awaiting"] = "load_content"
        await query.edit_message_text(
            "Пришли свой пост — сохраню его как пример твоего стиля.\n\n"
            "Агенты будут учитывать его при написании новых постов."
        )
        return

    if data == "style:reset":
        context.user_data.pop("pending_post", None)
        context.user_data.pop("awaiting", None)
        await query.edit_message_text(
            "✅ Готово — активный пост и контекст очищены.\n\n"
            "Можешь начать заново: пришли новый текст или нажми «✍️ Написать пост»."
        )
        return

    # --- Контент-план ---
    if data == "plan:show":
        status = await query.edit_message_text("Смотрю план…")
        plan = await _orchestrator.show_plan()
        await _edit_or_reply(status, plan)
        return

    if data == "plan:next":
        status = await query.edit_message_text("Ищу следующую тему…")
        topic = await _orchestrator.get_next_topic()
        await _edit_or_reply(status, f"Следующая тема:\n\n{topic}")
        return

    # --- Настройки ---
    if data == "settings:models":
        models_info = (
            f"Текущие модели:\n\n"
            f"✍️ Копирайтер: {config.MODELS['opus']}\n"
            f"🔍 Ресёрчер: {config.MODELS['researcher']}\n"
            f"⚡ Редактор/Критик: {config.MODELS['sonnet']}\n"
            f"🚦 Диспетчер: {config.MODELS['haiku']}"
        )
        await query.edit_message_text(models_info)
        return

    if data == "settings:help":
        await query.edit_message_text(
            "Как пользоваться ботом:\n\n"
            "✍️ Написать пост — выбери тип и напиши тему\n"
            "🎨 Мой стиль — разбор стиля или редактура\n"
            "📅 Контент-план — план и следующая тема\n"
            "⚙️ Настройки — модели, помощь\n\n"
            "Или просто напиши «Напиши пост про X» — бот поймёт."
        )
        return

    # --- Анализ стиля ---
    if data == "analyze":
        post = context.user_data.get("pending_post", "")
        if not post:
            await query.edit_message_text("Текст поста не найден. Пришли его ещё раз.")
            return
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
        post = context.user_data.get("pending_post", "")
        if not post:
            await query.edit_message_text("Текст поста не найден. Пришли его ещё раз.")
            return
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
            if changes:
                await _edit_or_reply(status, changes)
                await query.message.reply_text(post_out)
            else:
                await _edit_or_reply(status, post_out)
            await query.message.reply_text(critique)
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
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(CallbackQueryHandler(handle_callback))

    return app
