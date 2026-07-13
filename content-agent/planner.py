import os
from pathlib import Path
from openai import AsyncOpenAI

openrouter_client = AsyncOpenAI(
    api_key=os.environ["OPENROUTER_API_KEY"],
    base_url="https://openrouter.ai/api/v1",
)

AUDIENCE_PATH = Path(__file__).parent / "audience.md"


async def generate_monthly_plan(month: str) -> list[dict]:
    """Generate 20-30 content topics for a given month from audience.md.

    Args:
        month: "YYYY-MM" format

    Returns:
        List of {topic: str, description: str}
    """
    audience_content = AUDIENCE_PATH.read_text(encoding="utf-8")

    response = await openrouter_client.chat.completions.create(
        model="anthropic/claude-sonnet-4-5",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": (
                    f"На основе аудиторного исследования составь контент-план на {month} "
                    "для Telegram-канала о Telegram мини-аппах для записи клиентов "
                    "в малом бизнесе (бьюти, репетиторы, психологи, коучи).\n\n"
                    f"Исследование аудитории:\n{audience_content[:6000]}\n\n"
                    "Создай 25 тем для постов. Каждая тема:\n"
                    "- Конкретная боль или вопрос из исследования (не абстрактная)\n"
                    "- Написана как заголовок поста, не как категория\n\n"
                    "Верни строго в формате (одна тема на строку, без нумерации):\n"
                    "ТЕМА: <тема> | ОПИСАНИЕ: <одна строка описания>"
                ),
            }
        ],
    )

    topics = []
    for line in response.choices[0].message.content.strip().split("\n"):
        if "ТЕМА:" in line and "ОПИСАНИЕ:" in line:
            parts = line.split("|")
            topic = parts[0].replace("ТЕМА:", "").strip()
            description = parts[1].replace("ОПИСАНИЕ:", "").strip() if len(parts) > 1 else ""
            if topic:
                topics.append({"topic": topic, "description": description})

    if len(topics) < 10:
        raise ValueError(
            f"Плanner вернул только {len(topics)} тем (ожидается минимум 10). "
            "Попробуй /plan ещё раз."
        )
    return topics
