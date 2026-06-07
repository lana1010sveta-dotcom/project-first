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
import storage
from agents.dispatcher import Dispatcher
from agents.orchestrator import Orchestrator
from agents.image_generator import generate_post_image
from agents.trend_scout import TrendScout
from agents.apify_trend_scout import find_social_trends

_trend_scout = TrendScout()

logger = logging.getLogger(__name__)

_dispatcher   = Dispatcher()
_orchestrator = Orchestrator()

_POSTS_FILE = Path(__file__).parent / "posts-draft.md"

# Доступные правки стиля: id → (кнопка, инструкция для копирайтера)
STYLE_TWEAKS_MAP: dict[str, tuple[str, str]] = {
    "humor":      ("😄 Юмор",          "Добавляй лёгкий юмор и самоиронию"),
    "no_emotion": ("😐 Без эмоций",    "Пиши спокойно, без восклицаний и восторгов"),
    "shorter":    ("✂️ Короче",        "Максимально сокращай, убирай воду"),
    "sharper":    ("⚡ Хлёстче",       "Острее и прямее, без мягкости и оговорок"),
    "vivid":      ("💬 Живее",         "Больше разговорного языка и живых деталей"),
    "concrete":   ("🎯 Конкретика",    "Только имена, цифры, ситуации — никаких абстракций"),
    "calm":       ("🧘 Спокойнее",     "Меньше призывов, больше наблюдений"),
    "no_hashtags":("🚫 Без хэштегов",  "Никаких хэштегов в тексте"),
}


def _adjust_style_keyboard() -> InlineKeyboardMarkup:
    active = storage.get_style_tweaks()
    rows = []
    items = list(STYLE_TWEAKS_MAP.items())
    for i in range(0, len(items), 2):
        row = []
        for tweak_id, (label, _) in items[i:i+2]:
            prefix = "✅ " if tweak_id in active else ""
            row.append(InlineKeyboardButton(f"{prefix}{label}", callback_data=f"tweak:{tweak_id}"))
        rows.append(row)
    rows.append([InlineKeyboardButton("🗑 Сбросить все правки", callback_data="tweak:reset_all")])
    return InlineKeyboardMarkup(rows)


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
        [KeyboardButton("📅 Контент-план"),  KeyboardButton("🔥 Тренды")],
        [KeyboardButton("⚙️ Настройки")],
    ],
    resize_keyboard=True,
    is_persistent=True,
)

MAIN_BUTTONS = {"✍️ Написать пост", "🎨 Мой стиль", "📅 Контент-план", "🔥 Тренды", "⚙️ Настройки"}


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


def _trends_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🏢 По нише",              callback_data="trend:niche")],
        [InlineKeyboardButton("🎯 По конкретной теме",   callback_data="trend:topic")],
        [InlineKeyboardButton("🌐 Тренды из соцсетей",   callback_data="trend:social")],
        [InlineKeyboardButton("📱 LinkedIn / Twitter",   callback_data="trend:social_post")],
    ])


def _social_platform_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("💼 LinkedIn",  callback_data="trend:ln"),
            InlineKeyboardButton("🐦 Twitter/X", callback_data="trend:tw"),
        ],
    ])


def _trend_results_keyboard(topics: list[dict]) -> InlineKeyboardMarkup:
    rows = []
    for i, t in enumerate(topics[:3]):
        label = t["topic"][:50]
        rows.append([InlineKeyboardButton(f"✍️ Написать пост {i+1}", callback_data=f"trend_write:{i}")])
    return InlineKeyboardMarkup(rows)


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
            [InlineKeyboardButton("🎛 Поправить стиль",          callback_data="style:adjust")],
        ])
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🎛 Поправить стиль",              callback_data="style:adjust")],
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
        [InlineKeyboardButton("📚 Мои посты",           callback_data="plan:my_posts")],
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
        [InlineKeyboardButton("🖼 Создать картинку",       callback_data="gen_image")],
        [InlineKeyboardButton("💾 Сохранить пост",         callback_data="save_post")],
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

async def deny_access(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.callback_query:
        await update.callback_query.answer("⛔ Нет доступа", show_alert=True)
    elif update.message:
        await update.message.reply_text("⛔ Бот работает в приватном режиме.\nДоступ разрешён только владельцу.")


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
    if text == "🔥 Тренды":
        await update.message.reply_text("Что ищем?", reply_markup=_trends_keyboard())
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

    if awaiting in ("trend_niche", "trend_topic"):
        label = "нише" if awaiting == "trend_niche" else "теме"
        status = await update.message.reply_text(f"🔍 Ищу тренды по {label}: {text}…")
        try:
            query = f"ниша: {text}" if awaiting == "trend_niche" else f"тема: {text}"
            trends = await _trend_scout.find_trends(query)
            if not trends:
                await status.edit_text("Не нашёл трендов. Попробуй другой запрос.")
                return
            context.user_data["trend_topics"] = trends
            lines = [f"🔥 Трендовые темы по «{text}»:\n"]
            for i, t in enumerate(trends, 1):
                why = f"\n   _{t['why']}_" if t.get("why") else ""
                lines.append(f"{i}. {t['topic']}{why}")
            await status.edit_text("\n".join(lines))
            await update.message.reply_text(
                "Выбери тему — напишу пост:",
                reply_markup=_trend_results_keyboard(trends),
            )
        except Exception as e:
            logger.exception("Ошибка TrendScout")
            await status.edit_text(f"Ошибка поиска: {e}")
        return

    if awaiting == "trend_social_post":
        platform = context.user_data.pop("social_platform", "linkedin")
        platform_label = "LinkedIn" if platform == "linkedin" else "Twitter/X"
        status = await update.message.reply_text(
            f"📱 Исследую тему и пишу {platform_label}-пост: «{text[:60]}»…\n\n"
            "Шаг 1: ресёрч → шаг 2: пост (~30–60 сек)."
        )
        try:
            post, critique = await _orchestrator.write_social_post(
                topic=text,
                platform=platform,
                on_progress=lambda t: status.edit_text(t),
            )
            await _edit_or_reply(status, post)
            await update.message.reply_text(critique)
            context.user_data["pending_post"] = post
            await update.message.reply_text("Хочешь что-то поменять?", reply_markup=_edit_keyboard())
        except Exception as e:
            logger.exception("Ошибка write_social_post")
            await _edit_or_reply(status, f"Ошибка: {e}")
        return

    if awaiting == "trend_social":
        status = await update.message.reply_text(f"🌐 Ищу в Google Trends: {text}…\n\nЭто займёт ~30–60 сек.")
        try:
            trends = await find_social_trends(text)
            if not trends:
                await status.edit_text("Не нашёл данных. Попробуй другой запрос.")
                return
            context.user_data["trend_topics"] = trends
            lines = [f"🌐 Google Trends по «{text}»:\n"]
            for i, t in enumerate(trends, 1):
                source = f" [{t.get('source', '')}]" if t.get("source") else ""
                why = f"\n   _{t['why']}_" if t.get("why") else ""
                lines.append(f"{i}. {t['topic']}{source}{why}")
            await status.edit_text("\n".join(lines))
            await update.message.reply_text(
                "Выбери тему — напишу пост:",
                reply_markup=_trend_results_keyboard(trends),
            )
        except Exception as e:
            logger.exception("Ошибка Apify TrendScout")
            await status.edit_text(f"Ошибка поиска: {e}")
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

    # --- Тренды ---
    if data == "trend:niche":
        context.user_data["awaiting"] = "trend_niche"
        await query.edit_message_text("Напиши свою нишу — например: «салон красоты», «психолог», «онлайн-школа»")
        return

    if data == "trend:topic":
        context.user_data["awaiting"] = "trend_topic"
        await query.edit_message_text("Напиши тему — например: «боты для записи», «автоматизация Instagram»")
        return

    if data == "trend:social":
        context.user_data["awaiting"] = "trend_social"
        await query.edit_message_text(
            "🌐 Поиск через Google Trends\n\n"
            "Напиши нишу или тему — например: «вайбкодинг», «салон красоты», «онлайн-школа»"
        )
        return

    if data == "trend:social_post":
        await query.edit_message_text(
            "📱 Пост для LinkedIn / Twitter\n\n"
            "Выбери платформу:",
            reply_markup=_social_platform_keyboard(),
        )
        return

    if data in ("trend:ln", "trend:tw"):
        platform = "linkedin" if data == "trend:ln" else "twitter"
        context.user_data["social_platform"] = platform
        context.user_data["awaiting"] = "trend_social_post"
        label = "LinkedIn" if platform == "linkedin" else "Twitter/X"
        await query.edit_message_text(
            f"💼 {label}-пост\n\n"
            "Напиши тему — я сначала проведу ресёрч, потом напишу пост "
            f"в правильном формате {label}."
        )
        return

    if data.startswith("trend_write:"):
        idx = int(data.split(":")[1])
        trends = context.user_data.get("trend_topics", [])
        if idx >= len(trends):
            await query.answer("Тема не найдена.", show_alert=True)
            return
        topic = trends[idx]["topic"]
        await query.edit_message_text(f"✍️ Пишу пост по теме:\n«{topic}»\n\nЗапускаю агентов…")
        status_msg = await query.message.reply_text("Запускаю команду агентов (~30–60 сек).")
        await _write_post_flow(topic, "educational", "", status_msg, query.message, context)
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

    if data == "style:adjust":
        active = storage.get_style_tweaks()
        active_names = [STYLE_TWEAKS_MAP[k][0] for k in active if k in STYLE_TWEAKS_MAP]
        header = (
            f"Активные правки: {', '.join(active_names)}\n\nНажми чтобы включить/выключить:"
            if active_names else
            "Правки стиля пока не выбраны.\n\nНажми чтобы включить:"
        )
        await query.edit_message_text(header, reply_markup=_adjust_style_keyboard())
        return

    if data.startswith("tweak:"):
        tweak_id = data.split(":", 1)[1]
        if tweak_id == "reset_all":
            storage.clear_style_tweaks()
            await query.edit_message_text(
                "✅ Все правки стиля сброшены.\n\nТеперь бот пишет в базовом голосе.",
                reply_markup=_adjust_style_keyboard(),
            )
            return
        if tweak_id not in STYLE_TWEAKS_MAP:
            return
        label, instruction = STYLE_TWEAKS_MAP[tweak_id]
        added = storage.toggle_style_tweak(tweak_id)
        active = storage.get_style_tweaks()
        active_names = [STYLE_TWEAKS_MAP[k][0] for k in active if k in STYLE_TWEAKS_MAP]
        status_line = (
            f"✅ Включено: {label}" if added else f"⭕ Выключено: {label}"
        )
        header = status_line + (
            f"\n\nАктивные правки: {', '.join(active_names)}"
            if active_names else "\n\nПравок нет — базовый голос."
        )
        await query.edit_message_text(header, reply_markup=_adjust_style_keyboard())
        return

    # --- Сохранить пост ---
    if data == "save_post":
        post = context.user_data.get("pending_post", "")
        if not post:
            await query.answer("Нет поста для сохранения.", show_alert=True)
            return
        topic = post.split("\n")[0][:80].strip()
        storage.save_post(topic, post)
        # Отвечаем отдельным сообщением — кнопки остаются
        await query.answer("💾 Сохранено!", show_alert=False)
        await query.message.reply_text(
            f"💾 Пост сохранён: {topic}\n\n"
            "📅 Контент-план → 📚 Мои посты — чтобы посмотреть все."
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

    if data == "plan:my_posts":
        posts = storage.get_published_posts()
        if not posts:
            await query.edit_message_text(
                "Сохранённых постов пока нет.\n\n"
                "После генерации нажми «💾 Сохранить пост»."
            )
            return
        lines = [f"📚 Сохранённые посты ({len(posts)}):\n"]
        for i, p in enumerate(reversed(posts[-20:]), 1):
            date = p.get("date", "")[:10]
            topic = p.get("topic", "")[:60]
            lines.append(f"{i}. {date} — {topic}")
        await _edit_or_reply(query.message, "\n".join(lines))
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

    # --- Генерация картинки ---
    if data == "gen_image":
        post = context.user_data.get("pending_post", "")
        if not post:
            await query.answer("Нет поста для иллюстрации.", show_alert=True)
            return
        # Статус — отдельным сообщением, кнопки остаются
        await query.answer("🎨 Генерирую…", show_alert=False)
        status = await query.message.reply_text("🎨 Генерирую картинку 16:9…")
        try:
            image_bytes = await generate_post_image(post)
            await query.message.reply_photo(
                photo=image_bytes,
                caption="Картинка к посту — 16:9",
            )
            await status.edit_text("✅ Картинка готова!")
        except Exception as e:
            logger.exception("Ошибка генерации картинки")
            await status.edit_text(f"Ошибка генерации: {e}")
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

    owner = filters.User(user_id=config.ALLOWED_USER_ID)

    app.add_handler(CommandHandler("start", cmd_start, filters=owner))
    app.add_handler(CommandHandler("help",  cmd_help,  filters=owner))
    app.add_handler(MessageHandler(owner & filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(CallbackQueryHandler(handle_callback, block=False),   group=0)

    # Все остальные — отказ
    app.add_handler(MessageHandler(~owner, deny_access), group=1)
    app.add_handler(CallbackQueryHandler(deny_access),   group=1)

    return app
