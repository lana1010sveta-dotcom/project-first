"""Диспетчер — первая точка входа. Классифицирует запрос, возвращает JSON."""
import json
import config
from agents.base import Agent


class Dispatcher(Agent):
    model = config.MODELS["haiku"]
    temperature = 0.2
    system_prompt = """\
Ты — диспетчер Telegram-копирайтера Светланы. Классифицируй запрос пользователя.

ТИПЫ ЗАДАЧ:
- write_post   — написать новый пост
- edit_post    — отредактировать готовый текст (текст поста обычно присутствует в сообщении)
- analyze_style — разобрать стиль текста (текст поста присутствует в сообщении)
- plan_content — показать или обновить контент-план
- next_post    — выдать следующую тему из контент-плана

Правило для edit_post и analyze_style: если в сообщении есть абзацный текст (>80 символов),
скорее всего это и есть пост для редактуры/анализа.

Возвращай ТОЛЬКО валидный JSON, без markdown-блоков и лишних слов:
{
  "task_type": "...",
  "topic": "краткая тема одной строкой (если write_post)",
  "post_type": "educational | inspiring | selling | unknown",
  "edit_request": "что именно сделать (если edit_post)",
  "post_text": "полный текст поста (если edit_post или analyze_style)",
  "details": "любые дополнительные детали"
}
"""

    async def classify(self, text: str) -> dict:
        raw = await self.run(text)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip().rstrip("```").strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {
                "task_type": "write_post",
                "topic": text[:120],
                "post_type": "unknown",
                "edit_request": "",
                "post_text": "",
                "details": "",
            }
