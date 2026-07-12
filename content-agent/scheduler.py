import os
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from telegram.ext import Application


def setup_scheduler(app: Application) -> AsyncIOScheduler:
    """Attach scheduled jobs to the running app. Call after app is initialized."""
    tz = os.getenv("TIMEZONE", "Europe/Minsk")
    post_time = os.getenv("POST_TIME", "09:00")
    hour, minute = map(int, post_time.split(":"))

    scheduler = AsyncIOScheduler(timezone=tz)

    # 1st of every month at 09:00 — trigger plan generation
    scheduler.add_job(
        _trigger_monthly_plan,
        CronTrigger(day=1, hour=9, minute=0, timezone=tz),
        args=[app],
        id="monthly_plan",
        replace_existing=True,
    )

    # Daily at POST_TIME — trigger next post generation
    scheduler.add_job(
        _trigger_daily_post,
        CronTrigger(hour=hour, minute=minute, timezone=tz),
        args=[app],
        id="daily_post",
        replace_existing=True,
    )

    return scheduler


async def _trigger_monthly_plan(app: Application):
    """Called by scheduler on 1st of month. Sends /plan trigger to bot logic."""
    import storage
    import planner

    admin_id = int(os.environ["ADMIN_CHAT_ID"])
    month = datetime.now().strftime("%Y-%m")

    try:
        topics = await planner.generate_monthly_plan(month)
        ids = await storage.save_plan_topics(topics, month)

        # Import here to avoid circular import
        from bot import _state

        if _state.get("waiting_for") is not None:
            await app.bot.send_message(
                chat_id=admin_id,
                text="📅 Новый план готов, но ты сейчас в другом режиме. Заверши текущее действие, потом напиши /plan.",
            )
            return

        _state["pending_plan_topics"] = list(zip(ids, [t["topic"] for t in topics]))
        _state["waiting_for"] = "plan_selection"

        lines = [f"{i+1}. {t['topic']}" for i, t in enumerate(topics)]
        text = f"📅 Автоплан на {month} готов. Выбери темы (номера через пробел) или «все»:\n\n" + "\n".join(lines)
        if len(text) > 4096:
            text = text[:4090] + "\n..."

        await app.bot.send_message(chat_id=admin_id, text=text)
    except Exception as e:
        await app.bot.send_message(chat_id=admin_id, text=f"Ошибка автоплана: {e}")


async def _trigger_daily_post(app: Application):
    """Called by scheduler daily. Generates and sends next queued post for approval."""
    import storage
    import generator

    admin_id = int(os.environ["ADMIN_CHAT_ID"])
    topic_row = await storage.get_next_queued_topic()

    if not topic_row:
        return  # Queue empty — nothing to do

    try:
        content = await generator.generate_post_with_image(topic_row["topic"])
        post_id = await storage.save_post(
            plan_id=topic_row["id"],
            title=content["title"],
            text=content["text"],
            hashtags=content["hashtags"],
            image_url=content["image_url"],
            image_path=content["image_path"],
        )
        await storage.update_plan_status(topic_row["id"], "generated")

        post = await storage.get_post(post_id)

        from bot import _state, _send_post_for_approval
        from telegram.ext import ContextTypes

        class _FakeContext:
            bot = app.bot

        await _send_post_for_approval(admin_id, post, _FakeContext())
    except Exception as e:
        await app.bot.send_message(chat_id=admin_id, text=f"Ошибка автогенерации поста: {e}")
